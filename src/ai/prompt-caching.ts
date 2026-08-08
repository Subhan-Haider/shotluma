import {
  getAiStreamReasoningOptions,
  type AiModelSelection,
  type AiSdkReasoningEffort,
} from './provider-catalog'
import type { ModelMessage } from 'ai'

/**
 * Options spread into `streamText`: the catalog's reasoning-effort mapping plus
 * per-provider prompt-cache routing. Every step of a multi-step run re-reads the
 * whole growing conversation, so cache configuration directly controls run cost.
 */
export type AiStreamRequestOptions = {
  reasoning?: AiSdkReasoningEffort
  providerOptions?: {
    openai: { reasoningEffort?: 'max'; promptCacheKey?: string }
  }
}

/**
 * Combine the reasoning-effort options with an OpenAI `promptCacheKey`.
 *
 * OpenAI recommends an explicit `prompt_cache_key` for reliable prefix-cache
 * routing; one key per run keeps every step of the tool loop on the same cache.
 * The key is only sent to OpenAI itself — Moonshot shares the OpenAI-compat
 * `reasoningEffort` namespace but its API does not document the cache field.
 */
export const buildStreamRequestOptions = (
  selection: AiModelSelection,
  promptCacheKey: string,
): AiStreamRequestOptions => {
  const reasoningOptions = getAiStreamReasoningOptions(selection)
  if (selection.provider !== 'openai') return reasoningOptions ?? {}

  const openaiReasoning
    = reasoningOptions && 'providerOptions' in reasoningOptions
      ? reasoningOptions.providerOptions.openai
      : undefined
  return {
    ...(reasoningOptions && 'reasoning' in reasoningOptions
      ? { reasoning: reasoningOptions.reasoning }
      : {}),
    providerOptions: { openai: { ...openaiReasoning, promptCacheKey } },
  }
}

const ANTHROPIC_OPTIONS_KEY = 'anthropic'

const stripAnthropicCacheControl = (message: ModelMessage): ModelMessage => {
  const anthropicOptions = message.providerOptions?.[ANTHROPIC_OPTIONS_KEY]
  if (!anthropicOptions || !('cacheControl' in anthropicOptions)) return message

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cacheControl, ...remainingAnthropic } = anthropicOptions
  const providerOptions = { ...message.providerOptions }
  if (Object.keys(remainingAnthropic).length > 0) {
    providerOptions[ANTHROPIC_OPTIONS_KEY] = remainingAnthropic
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete providerOptions[ANTHROPIC_OPTIONS_KEY]
  }
  if (Object.keys(providerOptions).length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { providerOptions: _omitted, ...rest } = message
    return rest
  }
  return { ...message, providerOptions }
}

const withCacheBreakpoint = (message: ModelMessage): ModelMessage => ({
  ...message,
  providerOptions: {
    ...message.providerOptions,
    [ANTHROPIC_OPTIONS_KEY]: {
      ...message.providerOptions?.[ANTHROPIC_OPTIONS_KEY],
      cacheControl: { type: 'ephemeral' },
    },
  },
})

/**
 * Anthropic caches nothing without explicit `cache_control` breakpoints, so an
 * unmarked tool loop re-reads the entire conversation at the full input price on
 * every step. This applies the documented moving-breakpoint pattern: mark the
 * last message so each step writes the whole prefix and the next step reads it
 * back (Anthropic looks back from the breakpoint to find the previous cache hit).
 *
 * Marks from earlier steps are stripped — `prepareStep` message overrides carry
 * forward, and Anthropic rejects requests with more than 4 breakpoints. Only the
 * `cacheControl` key is touched; other provider options survive untouched.
 */
export const withMovingAnthropicCacheBreakpoint = (
  messages: ModelMessage[],
): ModelMessage[] =>
  messages.map((message, index) =>
    index === messages.length - 1
      ? withCacheBreakpoint(message)
      : stripAnthropicCacheControl(message))
