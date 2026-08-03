import { afterEach, describe, expect, it } from 'vitest'
import {
  AI_PROVIDER_KEYS_STORAGE_KEY,
  createAiProviderKeys,
  createEmptyAiProviderKeys,
  getAiProviderAvailability,
  getInitialAiSelection,
  getResolvedAiProviderKeys,
  mergeAiProviderKeys,
  parseStoredAiProviderKeys,
  readStoredAiProviderKeys,
  serializeStoredAiProviderKeys,
  writeStoredAiProviderKeys,
} from './provider-config'

const createMemoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

describe('AI provider configuration', () => {
  afterEach(() => {
    localStorage.removeItem(AI_PROVIDER_KEYS_STORAGE_KEY)
  })

  it('reads and trims public keys from the local Vite environment', () => {
    expect(createAiProviderKeys({
      VITE_MOONSHOT_API_KEY: ' moonshot-key ',
      VITE_GOOGLE_GENERATIVE_AI_API_KEY: ' google-key ',
      VITE_ALIBABA_API_KEY: 'qwen-key',
      VITE_OPENAI_API_KEY: 'openai-key',
      VITE_ANTHROPIC_API_KEY: 'anthropic-key',
      VITE_XAI_API_KEY: ' xai-key ',
    })).toEqual({
      moonshot: 'moonshot-key',
      google: 'google-key',
      qwen: 'qwen-key',
      openai: 'openai-key',
      anthropic: 'anthropic-key',
      xai: 'xai-key',
    })
  })

  it('treats missing, blank, and non-string values as unconfigured', () => {
    const keys = createAiProviderKeys({
      VITE_GOOGLE_GENERATIVE_AI_API_KEY: ' ',
      VITE_ALIBABA_API_KEY: true,
      VITE_OPENAI_API_KEY: 'openai-key',
    })

    expect(keys).toEqual({
      moonshot: '',
      google: '',
      qwen: '',
      openai: 'openai-key',
      anthropic: '',
      xai: '',
    })
    expect(getAiProviderAvailability(keys)).toEqual({
      moonshot: false,
      google: false,
      qwen: false,
      openai: true,
      anthropic: false,
      xai: false,
    })
  })

  it('starts with the first configured provider and otherwise falls back to Google', () => {
    expect(getInitialAiSelection({
      moonshot: false,
      google: false,
      qwen: false,
      openai: true,
      anthropic: true,
      xai: true,
    })).toEqual({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      reasoningEffort: 'high',
    })
    expect(getInitialAiSelection({
      moonshot: false,
      google: false,
      qwen: false,
      openai: false,
      anthropic: false,
      xai: false,
    })).toEqual({
      provider: 'google',
      model: 'gemini-3.6-flash',
      reasoningEffort: 'high',
    })
    expect(getInitialAiSelection({
      moonshot: true,
      google: true,
      qwen: false,
      openai: false,
      anthropic: false,
      xai: false,
    })).toEqual({
      provider: 'moonshot',
      model: 'kimi-k3',
      reasoningEffort: 'high',
    })
  })

  it('prefers browser-stored keys over environment keys', () => {
    const environment = createAiProviderKeys({
      VITE_OPENAI_API_KEY: 'env-openai',
      VITE_GOOGLE_GENERATIVE_AI_API_KEY: 'env-google',
    })
    const stored = {
      ...createEmptyAiProviderKeys(),
      openai: 'browser-openai',
    }

    expect(mergeAiProviderKeys(environment, stored)).toEqual({
      moonshot: '',
      google: 'env-google',
      qwen: '',
      openai: 'browser-openai',
      anthropic: '',
      xai: '',
    })
  })

  it('parses, serializes, and persists only non-empty browser keys', () => {
    expect(parseStoredAiProviderKeys(null)).toEqual(createEmptyAiProviderKeys())
    expect(parseStoredAiProviderKeys('{not-json')).toEqual(createEmptyAiProviderKeys())
    expect(parseStoredAiProviderKeys(JSON.stringify({
      openai: ' sk-test ',
      ignored: 'nope',
      google: '',
    }))).toEqual({
      ...createEmptyAiProviderKeys(),
      openai: 'sk-test',
    })

    const storage = createMemoryStorage()
    writeStoredAiProviderKeys({
      ...createEmptyAiProviderKeys(),
      anthropic: 'claude-key',
      openai: '  ',
    }, storage)

    expect(storage.getItem(AI_PROVIDER_KEYS_STORAGE_KEY)).toBe(
      serializeStoredAiProviderKeys({
        ...createEmptyAiProviderKeys(),
        anthropic: 'claude-key',
      }),
    )
    expect(readStoredAiProviderKeys(storage)).toEqual({
      ...createEmptyAiProviderKeys(),
      anthropic: 'claude-key',
    })

    writeStoredAiProviderKeys(createEmptyAiProviderKeys(), storage)
    expect(storage.getItem(AI_PROVIDER_KEYS_STORAGE_KEY)).toBeNull()
  })

  it('resolves keys from browser storage when present', () => {
    const storage = createMemoryStorage({
      [AI_PROVIDER_KEYS_STORAGE_KEY]: JSON.stringify({ xai: 'grok-key' }),
    })

    expect(getResolvedAiProviderKeys(storage).xai).toBe('grok-key')
  })
})
