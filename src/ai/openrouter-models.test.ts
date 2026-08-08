import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OPENROUTER_MODELS_STORAGE_KEY,
  OPENROUTER_MODELS_TTL_MS,
  loadOpenRouterModels,
  parseOpenRouterModels,
  readCachedOpenRouterModels,
} from './openrouter-models'
import {
  getAiProvider,
  getDynamicOpenRouterModels,
  setDynamicOpenRouterModels,
} from './provider-catalog'

const visionToolsModel = {
  id: 'vendor/vision-tools',
  name: 'Vision Tools',
  context_length: 200000,
  architecture: { input_modalities: ['text', 'image'] },
  pricing: { prompt: '0.000003', completion: '0.000015' },
  supported_parameters: ['tools', 'reasoning'],
}

const createMemoryStorage = (entries: Record<string, string> = {}) => {
  const store = new Map(Object.entries(entries))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    dump: () => Object.fromEntries(store),
  }
}

afterEach(() => {
  setDynamicOpenRouterModels([])
  vi.unstubAllGlobals()
})

describe('parseOpenRouterModels', () => {
  it('keeps only models with image input and tool calling', () => {
    const models = parseOpenRouterModels({
      data: [
        visionToolsModel,
        { ...visionToolsModel, id: 'vendor/text-only', architecture: { input_modalities: ['text'] } },
        { ...visionToolsModel, id: 'vendor/no-tools', supported_parameters: ['reasoning'] },
        { ...visionToolsModel, id: '' },
        'not-an-object',
      ],
    })
    expect(models.map((model) => model.id)).toEqual(['vendor/vision-tools'])
  })

  it('maps pricing, context length, and reasoning support', () => {
    const [model] = parseOpenRouterModels({ data: [visionToolsModel] })
    expect(model).toEqual({
      id: 'vendor/vision-tools',
      label: 'Vision Tools',
      description: '$3 in · $15 out per 1M tokens · 200K ctx',
      reasoningEfforts: ['low', 'medium', 'high'],
    })
    const [plain] = parseOpenRouterModels({
      data: [{
        ...visionToolsModel,
        name: undefined,
        context_length: undefined,
        pricing: {},
        supported_parameters: ['tools'],
      }],
    })
    expect(plain).toEqual({
      id: 'vendor/vision-tools',
      label: 'vendor/vision-tools',
      description: 'OpenRouter model',
    })
  })

  it('sorts models by label and tolerates malformed payloads', () => {
    const models = parseOpenRouterModels({
      data: [
        { ...visionToolsModel, id: 'vendor/b', name: 'Beta' },
        { ...visionToolsModel, id: 'vendor/a', name: 'Alpha' },
      ],
    })
    expect(models.map((model) => model.label)).toEqual(['Alpha', 'Beta'])
    expect(parseOpenRouterModels(null)).toEqual([])
    expect(parseOpenRouterModels({ data: 'nope' })).toEqual([])
  })
})

describe('readCachedOpenRouterModels', () => {
  const cachedModel = { id: 'vendor/a', label: 'Alpha', description: 'cached' }

  it('returns fresh cache entries and rejects stale or malformed ones', () => {
    const fresh = createMemoryStorage({
      [OPENROUTER_MODELS_STORAGE_KEY]: JSON.stringify({ fetchedAt: 1000, models: [cachedModel] }),
    })
    expect(readCachedOpenRouterModels(1000 + OPENROUTER_MODELS_TTL_MS, fresh))
      .toEqual([cachedModel])
    expect(readCachedOpenRouterModels(1001 + OPENROUTER_MODELS_TTL_MS, fresh)).toBeNull()
    expect(readCachedOpenRouterModels(1000, createMemoryStorage())).toBeNull()
    expect(readCachedOpenRouterModels(1000, createMemoryStorage({
      [OPENROUTER_MODELS_STORAGE_KEY]: 'not-json',
    }))).toBeNull()
    expect(readCachedOpenRouterModels(1000, null)).toBeNull()
  })
})

describe('loadOpenRouterModels', () => {
  it('serves a fresh cache without fetching and registers the models', async () => {
    const cachedModel = { id: 'vendor/a', label: 'Alpha', description: 'cached' }
    const storage = createMemoryStorage({
      [OPENROUTER_MODELS_STORAGE_KEY]: JSON.stringify({ fetchedAt: 500, models: [cachedModel] }),
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadOpenRouterModels({ now: 600, storage })
    expect(result).toEqual({ models: [cachedModel], source: 'cache' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getDynamicOpenRouterModels()).toEqual([cachedModel])
  })

  it('fetches, caches, and registers the remote catalog', async () => {
    const storage = createMemoryStorage()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [visionToolsModel] }),
    }))

    const result = await loadOpenRouterModels({ now: 42, storage })
    expect(result.source).toBe('remote')
    expect(result.models.map((model) => model.id)).toEqual(['vendor/vision-tools'])
    expect(getDynamicOpenRouterModels()).toEqual(result.models)
    expect(readCachedOpenRouterModels(42, storage)).toEqual(result.models)
  })

  it('falls back to the curated shortlist when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    const result = await loadOpenRouterModels({ now: 42, storage: null })
    expect(result.source).toBe('fallback')
    expect(result.models).toBe(getAiProvider('openrouter').models)
    expect(getDynamicOpenRouterModels()).toEqual([])
  })
})
