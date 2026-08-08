import {
  OPENROUTER_REASONING_EFFORTS,
  getAiProvider,
  setDynamicOpenRouterModels,
  type AiModelOption,
} from './provider-catalog'

/**
 * Runtime catalog for the OpenRouter provider.
 *
 * OpenRouter exposes hundreds of models through one API key, so the catalog is
 * fetched from the public `/models` endpoint (no key required) instead of being
 * hand-maintained. Only models that can actually drive a Shotluma run survive
 * the filter: they must accept image input (screenshots) and support tool
 * calling (the editor mutation loop). The curated shortlist in
 * `provider-catalog.ts` doubles as the fallback when the fetch fails.
 */

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
export const OPENROUTER_MODELS_STORAGE_KEY = 'shotluma-openrouter-models'
export const OPENROUTER_MODELS_TTL_MS = 60 * 60 * 1000

type OpenRouterApiModel = {
  id: string
  name: string
  contextLength: number | null
  inputModalities: readonly string[]
  supportedParameters: readonly string[]
  promptPrice: number | null
  completionPrice: number | null
}

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []

const readPrice = (value: unknown): number | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const parseApiModel = (value: unknown): OpenRouterApiModel | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record['id'] !== 'string' || record['id'].length === 0) return null

  const architecture
    = record['architecture'] && typeof record['architecture'] === 'object'
      ? (record['architecture'] as Record<string, unknown>)
      : {}
  const pricing
    = record['pricing'] && typeof record['pricing'] === 'object'
      ? (record['pricing'] as Record<string, unknown>)
      : {}

  return {
    id: record['id'],
    name: typeof record['name'] === 'string' && record['name'].length > 0
      ? record['name']
      : record['id'],
    contextLength: typeof record['context_length'] === 'number'
      ? record['context_length']
      : null,
    inputModalities: readStringArray(architecture['input_modalities']),
    supportedParameters: readStringArray(record['supported_parameters']),
    promptPrice: readPrice(pricing['prompt']),
    completionPrice: readPrice(pricing['completion']),
  }
}

const supportsShotlumaRuns = (model: OpenRouterApiModel): boolean =>
  model.inputModalities.includes('image')
  && model.supportedParameters.includes('tools')

const formatPricePerMillion = (perToken: number): string => {
  const perMillion = perToken * 1_000_000
  const rounded = perMillion >= 10
    ? Math.round(perMillion).toString()
    : perMillion.toFixed(2).replace(/\.?0+$/, '')
  return `$${rounded}`
}

const formatContextLength = (contextLength: number): string =>
  `${Math.round(contextLength / 1000)}K ctx`

const describeApiModel = (model: OpenRouterApiModel): string => {
  const parts: string[] = []
  if (model.promptPrice !== null && model.completionPrice !== null) {
    parts.push(
      `${formatPricePerMillion(model.promptPrice)} in · ${formatPricePerMillion(model.completionPrice)} out per 1M tokens`,
    )
  }
  if (model.contextLength) parts.push(formatContextLength(model.contextLength))
  return parts.join(' · ') || 'OpenRouter model'
}

const toModelOption = (model: OpenRouterApiModel): AiModelOption => ({
  id: model.id,
  label: model.name,
  description: describeApiModel(model),
  ...(model.supportedParameters.includes('reasoning')
    ? { reasoningEfforts: OPENROUTER_REASONING_EFFORTS }
    : {}),
})

/** Parse the `/models` payload into vision+tools capable catalog options. */
export const parseOpenRouterModels = (payload: unknown): AiModelOption[] => {
  if (!payload || typeof payload !== 'object') return []
  const data = (payload as Record<string, unknown>)['data']
  if (!Array.isArray(data)) return []
  return data
    .map(parseApiModel)
    .filter((model): model is OpenRouterApiModel => model !== null)
    .filter(supportsShotlumaRuns)
    .map(toModelOption)
    .sort((left, right) => left.label.localeCompare(right.label))
}

type CachedOpenRouterModels = {
  fetchedAt: number
  models: AiModelOption[]
}

const parseCachedModels = (raw: string | null): CachedOpenRouterModels | null => {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  if (typeof record['fetchedAt'] !== 'number' || !Array.isArray(record['models'])) {
    return null
  }
  const models = record['models'].filter((entry): entry is AiModelOption => {
    if (!entry || typeof entry !== 'object') return false
    const model = entry as Record<string, unknown>
    return typeof model['id'] === 'string'
      && typeof model['label'] === 'string'
      && typeof model['description'] === 'string'
  })
  return { fetchedAt: record['fetchedAt'], models }
}

type ModelStorage = Pick<Storage, 'getItem' | 'setItem'>

const getBrowserStorage = (): ModelStorage | null => {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export const readCachedOpenRouterModels = (
  now: number,
  storage: ModelStorage | null = getBrowserStorage(),
): AiModelOption[] | null => {
  if (!storage) return null
  let cached: CachedOpenRouterModels | null
  try {
    cached = parseCachedModels(storage.getItem(OPENROUTER_MODELS_STORAGE_KEY))
  } catch {
    return null
  }
  if (!cached || cached.models.length === 0) return null
  if (now - cached.fetchedAt > OPENROUTER_MODELS_TTL_MS) return null
  return cached.models
}

const writeCachedOpenRouterModels = (
  models: AiModelOption[],
  now: number,
  storage: ModelStorage | null,
): void => {
  if (!storage) return
  try {
    storage.setItem(
      OPENROUTER_MODELS_STORAGE_KEY,
      JSON.stringify({ fetchedAt: now, models } satisfies CachedOpenRouterModels),
    )
  } catch {
    // A full or blocked storage only loses the cache, not the feature.
  }
}

export type OpenRouterModelsResult = {
  models: readonly AiModelOption[]
  source: 'remote' | 'cache' | 'fallback'
}

let pendingFetch: Promise<OpenRouterModelsResult> | null = null

const fetchRemoteModels = async (
  now: number,
  storage: ModelStorage | null,
): Promise<OpenRouterModelsResult> => {
  const response = await fetch(OPENROUTER_MODELS_URL)
  if (!response.ok) {
    throw new Error(`OpenRouter models request failed: ${response.status}`)
  }
  const models = parseOpenRouterModels(await response.json() as unknown)
  if (models.length === 0) throw new Error('OpenRouter models response was empty')
  writeCachedOpenRouterModels(models, now, storage)
  setDynamicOpenRouterModels(models)
  return { models, source: 'remote' }
}

/**
 * Load the OpenRouter catalog: fresh cache first, then the network, then the
 * curated shortlist. Successful loads register the models with the static
 * catalog so selections resolve everywhere. Never rejects.
 */
export const loadOpenRouterModels = (options?: {
  now?: number
  storage?: ModelStorage | null
}): Promise<OpenRouterModelsResult> => {
  const now = options?.now ?? Date.now()
  const storage = options?.storage === undefined ? getBrowserStorage() : options.storage

  const cached = readCachedOpenRouterModels(now, storage)
  if (cached) {
    setDynamicOpenRouterModels(cached)
    return Promise.resolve({ models: cached, source: 'cache' })
  }

  pendingFetch ??= fetchRemoteModels(now, storage)
    .catch((): OpenRouterModelsResult => ({
      models: getAiProvider('openrouter').models,
      source: 'fallback',
    }))
    .finally(() => {
      pendingFetch = null
    })
  return pendingFetch
}
