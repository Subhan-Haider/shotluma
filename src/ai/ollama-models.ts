import { type AiModelOption, setDynamicOllamaModels } from './provider-catalog'

type OllamaTagResponse = {
  models?: {
    name: string
  }[]
}

export const loadOllamaModels = async (baseURL: string): Promise<void> => {
  try {
    const url = baseURL.endsWith('/api')
      ? baseURL.slice(0, -4) + '/api/tags'
      : baseURL.replace(/\/+$/, '') + '/api/tags'

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Ollama models request failed: ${response.status}`)
    }

    const data = await response.json() as OllamaTagResponse
    if (!data.models || !Array.isArray(data.models)) {
      return
    }

    const models: AiModelOption[] = data.models.map((model) => {
      // Strip ':latest' if present for a cleaner label
      const name = model.name.replace(/:latest$/, '')
      return {
        id: model.name,
        label: name,
        description: 'Local Ollama model',
      }
    })

    setDynamicOllamaModels(models)
  } catch (error) {
    // Silently fail if the Ollama daemon isn't running or isn't accessible
    console.warn('Failed to fetch Ollama models:', error)
  }
}
