import { streamText, type TextStreamPart, type ToolSet } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { narrationSmoothing } from './runner'
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider'

/**
 * Thinking models hand us reasoning in blocks, not words. The run band reads as a
 * stream only if the transform is actually wired into the run, so the check runs a
 * real `streamText` over a model that emits one paragraph-sized chunk and asserts on
 * what a consumer sees.
 */
const REASONING_BLOCK =
  'Reading the screenshots to pick a hero shot. The list view carries the most product detail.'

const streamPartsOf = async (blocks: string[]): Promise<TextStreamPart<ToolSet>[]> => {
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] })
          controller.enqueue({ type: 'reasoning-start', id: 'r1' })
          for (const block of blocks) {
            controller.enqueue({ type: 'reasoning-delta', id: 'r1', delta: block })
          }
          controller.enqueue({ type: 'reasoning-end', id: 'r1' })
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 0, reasoning: 1 },
            },
          })
          controller.close()
        },
      }),
    }),
  })

  const result = streamText({
    model,
    prompt: 'Build a set.',
    experimental_transform: narrationSmoothing(),
  })

  const parts: TextStreamPart<ToolSet>[] = []
  for await (const part of result.stream) parts.push(part)
  return parts
}

const reasoningDeltas = (parts: TextStreamPart<ToolSet>[]): string[] =>
  parts.filter((part) => part.type === 'reasoning-delta').map((part) => part.text)

describe('narration smoothing', () => {
  it('splits one reasoning block into word-sized deltas', async () => {
    const deltas = reasoningDeltas(await streamPartsOf([REASONING_BLOCK]))

    expect(deltas.length).toBeGreaterThan(10)
    // Every release is a single word, which is what makes the crawl even.
    expect(deltas.every((delta) => delta.trim().split(/\s+/).length === 1)).toBe(true)
  })

  it('preserves the reasoning text exactly', async () => {
    const deltas = reasoningDeltas(await streamPartsOf(['Reading the ', 'screenshots to pick.']))

    expect(deltas.join('')).toBe('Reading the screenshots to pick.')
  })
})
