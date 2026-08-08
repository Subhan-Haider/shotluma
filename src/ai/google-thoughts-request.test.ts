import { streamText } from 'ai'
import { describe, expect, it, vi } from 'vitest'
import { buildStreamRequestOptions } from './prompt-caching'

/**
 * The Gemini fix lives in a request option, so the only honest check short of a paid
 * run is the wire itself: assert that `includeThoughts` actually reaches Google's
 * request body. A unit test on `buildStreamRequestOptions` alone would not catch the
 * provider dropping or renaming the field.
 */
const captureGoogleRequestBody = async (): Promise<Record<string, unknown>> => {
  const { createGoogle } = await import('@ai-sdk/google')
  let body: Record<string, unknown> = {}

  const fetchStub = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const rawBody = typeof init?.body === 'string' ? init.body : '{}'
    body = JSON.parse(rawBody) as Record<string, unknown>
    // An empty SSE stream is enough: the request has already been built.
    return new Response('data: [DONE]\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  })

  const model = createGoogle({
    apiKey: 'test-key-not-a-real-secret',
    fetch: fetchStub as unknown as typeof globalThis.fetch,
  })('gemini-3.6-flash')

  const result = streamText({
    model,
    prompt: 'Say hi.',
    ...buildStreamRequestOptions(
      { provider: 'google', model: 'gemini-3.6-flash', reasoningEffort: 'high' },
      'run-key',
    ),
  })
  // Consuming the stream is what triggers the request.
  await result.consumeStream()

  return body
}

describe('Google request body', () => {
  it('asks Gemini to return thought summaries', async () => {
    const body = await captureGoogleRequestBody()
    const generationConfig = body['generationConfig'] as Record<string, unknown> | undefined
    const thinkingConfig = generationConfig?.['thinkingConfig'] as Record<string, unknown> | undefined

    expect(thinkingConfig?.['includeThoughts']).toBe(true)
  })

  it('still sends the selected reasoning effort alongside it', async () => {
    const body = await captureGoogleRequestBody()
    const generationConfig = body['generationConfig'] as Record<string, unknown> | undefined
    const thinkingConfig = generationConfig?.['thinkingConfig'] as Record<string, unknown> | undefined

    // `thinkingLevel` comes from the portable `reasoning` option, which our Google
    // provider options must not override.
    expect(thinkingConfig?.['thinkingLevel']).toBe('high')
  })
})
