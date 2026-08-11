import { spawn } from 'node:child_process'
import type { Plugin } from 'vite'

export function createOllamaPlugin(): Plugin {
  return {
    name: 'shotluma:ollama',
    configureServer() {
      try {
        const child = spawn('ollama', ['serve'], {
          stdio: 'ignore',
          detached: true,
          windowsHide: true,
        })
        child.unref()
        // eslint-disable-next-line no-console
        console.info('[shotluma:ollama] Ollama daemon started in the background')
      } catch (error) {
        console.warn('[shotluma:ollama] Failed to start Ollama automatically:', error)
      }
    },
  }
}
