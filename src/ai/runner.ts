import {
  APICallError,
  isStepCount,
  smoothStream,
  streamText,
  type FinishReason,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
} from 'ai'
import { uid } from '../utils'
import { scopeAiControllerToSlide, type AiEditorController } from './controller'
import { buildInstructions, buildUserMessage } from './prompt'
import {
  buildStreamRequestOptions,
  withMovingAnthropicCacheBreakpoint,
} from './prompt-caching'
import {
  AI_REASONING_EFFORT_LABELS,
  getAiModel,
  getAiProvider,
  getAiSdkReasoningEffort,
  type AiModelSelection,
} from './provider-catalog'
import {
  getAiProviderKey,
  getAiProviderTransportAvailability,
} from './provider-config'
import {
  toAiRunTokenUsage,
  type AiRunReport,
  type AiRunTokenUsage,
  type AiRunToolCall,
} from './run-log'
import { saveAiRunReport } from './run-log-client'
import { parsePlanInput, type PlannedScreen } from './run-plan'
import { createEditorTools } from './tools'
import type { AiToolActivity } from './tools'

export type { AiToolActivity } from './tools'

export type AiRunEvent =
  | { type: 'status'; message: string }
  | { type: 'tool'; name: string; detail: string }
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'plan'; screens: PlannedScreen[] }
  | { type: 'slide-started'; index: number }
  | { type: 'done'; summary: string; slidesCreated: number }
  | { type: 'error'; message: string }

type UserContent =
  | { type: 'text'; text: string }
  | { type: 'file'; mediaType: string; data: string }

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value)

/** Tools whose activity line never depends on their input. */
const STATIC_TOOL_DETAILS: Record<string, string> = {
  get_canvas_state: 'Canvas state retrieved',
  add_slide: 'New screen created',
  set_slide_background: 'Background updated',
  delete_slide: 'Screen deleted',
  add_image: 'Image added',
  set_device_screenshot: 'Device screenshot replaced',
  update_element: 'Element updated',
  delete_element: 'Element deleted',
  inspect_slide: 'Layout measured',
  render_slide_preview: 'Preview checked',
  remove_asset_background: 'Overlay background removed',
}

const describeToolCall = (toolName: string, input: unknown): string => {
  const staticDetail = STATIC_TOOL_DETAILS[toolName]
  if (staticDetail !== undefined) return staticDetail

  const data = (input && typeof input === 'object' ? (input as Record<string, unknown>) : {})
  switch (toolName) {
    case 'declare_plan': {
      const count = parsePlanInput(input).length
      return count > 0 ? `Plan declared: ${count} screens` : 'Plan declared'
    }
    case 'rename_slide':
      return typeof data['name'] === 'string'
        ? `Screen renamed: “${truncate(data['name'], 30)}”`
        : 'Screen renamed'
    case 'add_text':
      return typeof data['text'] === 'string'
        ? `Text: “${truncate(data['text'], 30)}”`
        : 'Text added'
    case 'add_device':
      return typeof data['deviceStyle'] === 'string'
        ? `Device added (${data['deviceStyle']})`
        : 'Device added'
    case 'add_shape':
      return typeof data['shape'] === 'string'
        ? `Shape added (${data['shape']})`
        : 'Shape added'
    case 'create_overlay_asset':
      return typeof data['name'] === 'string'
        ? `Overlay asset: “${truncate(data['name'], 30)}”`
        : typeof data['prompt'] === 'string'
          ? `Overlay asset: “${truncate(data['prompt'], 30)}”`
          : 'Overlay asset generated'
    default:
      return `Tool: ${toolName}`
  }
}

const extractMediaType = (dataUrl: string): string => {
  const match = /^data:([^;,]+)/.exec(dataUrl)
  return match?.[1] ?? 'image/png'
}

type PreparedAsset = { assetId: string; name: string; dataUrl: string }

const buildUserContent = (options: {
  description: string
  screenshots: PreparedAsset[]
  appName?: string
  logo?: PreparedAsset
  targetSlideId?: string
}): UserContent[] => {
  const { description, screenshots, appName, logo, targetSlideId } = options
  const content: UserContent[] = [{
    type: 'text',
    text: buildUserMessage(
      description,
      screenshots.map(({ assetId, name }) => ({ assetId, name })),
      {
        ...(targetSlideId ? { targetSlideId } : {}),
        ...(appName?.trim() ? { appName: appName.trim() } : {}),
        ...(logo ? { logoAssetId: logo.assetId } : {}),
      },
    ),
  }]

  for (const shot of screenshots) {
    content.push({ type: 'text', text: `Screenshot asset "${shot.assetId}" (${shot.name}):` })
    content.push({ type: 'file', mediaType: extractMediaType(shot.dataUrl), data: shot.dataUrl })
  }

  if (logo) {
    content.push({
      type: 'text',
      text: `App logo asset "${logo.assetId}" (${logo.name}) — place with add_image, never as a device screenshot:`,
    })
    content.push({ type: 'file', mediaType: extractMediaType(logo.dataUrl), data: logo.dataUrl })
  }

  return content
}

const createAiModel = async (selection: AiModelSelection) => {
  if (!getAiProviderTransportAvailability()[selection.provider]) {
    throw new Error('Moonshot requires the local Shotluma CORS proxy and is unavailable on this host')
  }
  const apiKey = getAiProviderKey(selection.provider)
  if (!apiKey) {
    throw new Error(`${getAiProvider(selection.provider).envVar} is not configured`)
  }

  switch (selection.provider) {
    case 'moonshot': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({
        apiKey,
        baseURL: `${window.location.origin}/api/moonshot/v1`,
      }).chat(selection.model)
    }
    case 'google': {
      const { createGoogle } = await import('@ai-sdk/google')
      return createGoogle({ apiKey })(selection.model)
    }
    case 'qwen': {
      const { createAlibaba } = await import('@ai-sdk/alibaba')
      return createAlibaba({ apiKey })(selection.model)
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({ apiKey })(selection.model)
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({
        apiKey,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      })(selection.model)
    }
    case 'xai': {
      const { createXai } = await import('@ai-sdk/xai')
      return createXai({ apiKey })(selection.model)
    }
    case 'openrouter': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      // OpenRouter speaks the OpenAI chat-completions dialect and allows
      // browser CORS; the optional headers attribute traffic to the app.
      return createOpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Shotluma',
        },
      }).chat(selection.model)
    }
  }
}

const describeError = (error: unknown, selection: AiModelSelection): string => {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      const provider = getAiProvider(selection.provider)
      return `${provider.label} API error (${error.statusCode}) — check the API key for ${provider.label} and try again. ${error.message}`
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const isAbortError = (error: unknown): boolean =>
  (error instanceof Error && error.name === 'AbortError') || (error instanceof DOMException && error.name === 'AbortError')

type AiRunAccumulator = {
  assistantOutput: string
  reasoningOutput: string
  toolCalls: AiRunToolCall[]
  slidesCreated: number
  usage: AiRunTokenUsage | null
  finishReason: FinishReason | null
  errorMessage: string | null
  hadError: boolean
}

const collectStreamPart = <TOOLS extends ToolSet>(options: {
  part: TextStreamPart<TOOLS>
  selection: AiModelSelection
  runStartedAt: number
  accumulator: AiRunAccumulator
  onEvent: (event: AiRunEvent) => void
}) => {
  const { part, selection, runStartedAt, accumulator, onEvent } = options
  // The SDK emits transport events that do not affect the visible activity log.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
  switch (part.type) {
    case 'text-delta':
      accumulator.assistantOutput += part.text
      onEvent({ type: 'text', delta: part.text })
      break
    case 'reasoning-delta':
      accumulator.reasoningOutput += part.text
      onEvent({ type: 'reasoning', delta: part.text })
      break
    case 'tool-call': {
      if (part.toolName === 'declare_plan') {
        const screens = parsePlanInput(part.input)
        if (screens.length > 0) onEvent({ type: 'plan', screens })
      }
      if (part.toolName === 'add_slide') {
        onEvent({ type: 'slide-started', index: accumulator.slidesCreated })
        accumulator.slidesCreated += 1
      }
      const detail = describeToolCall(part.toolName, part.input)
      accumulator.toolCalls.push({
        name: part.toolName,
        detail,
        offsetMs: Date.now() - runStartedAt,
      })
      onEvent({ type: 'tool', name: part.toolName, detail })
      break
    }
    case 'finish':
      accumulator.usage = toAiRunTokenUsage(part.totalUsage)
      accumulator.finishReason = part.finishReason
      break
    case 'error':
      accumulator.hadError = true
      accumulator.errorMessage = describeError(part.error, selection)
      onEvent({ type: 'error', message: accumulator.errorMessage })
      break
    default:
      break
  }
}

/**
 * Releases assistant prose and reasoning one word at a time.
 *
 * Thinking models emit reasoning in large blocks — Gemini often a whole paragraph
 * per chunk — so the run band would otherwise jump a paragraph at a time instead of
 * reading as a stream. The transform sits downstream of step execution and flushes
 * its buffer the moment a non-prose part (a tool call) arrives, so the pacing shapes
 * only what the band renders and never holds up the run.
 *
 * 18ms is a little under typical model output speed, which keeps the crawl smooth
 * without letting it fall behind the model.
 */
export const NARRATION_WORD_DELAY_MS = 18

export const narrationSmoothing = () => smoothStream<ToolSet>({ delayInMs: NARRATION_WORD_DELAY_MS })

const openAiGenerationStream = (options: {
  model: Awaited<ReturnType<typeof createAiModel>>
  selection: AiModelSelection
  controller: AiEditorController
  content: UserContent[]
  targetSlideId?: string
  enableOverlayAssets?: boolean
  signal?: AbortSignal
  onActivity?: (activity: AiToolActivity) => void
}) => {
  const {
    model,
    selection,
    controller,
    content,
    targetSlideId,
    enableOverlayAssets,
    signal,
    onActivity,
  } = options
  const runController = targetSlideId
    ? scopeAiControllerToSlide(controller, targetSlideId)
    : controller
  const requestOptions = buildStreamRequestOptions(selection, uid('shotluma-run'))

  return streamText({
    model,
    instructions: buildInstructions({
      ...(targetSlideId ? { targetSlideId } : {}),
      ...(enableOverlayAssets ? { enableOverlayAssets: true } : {}),
    }),
    messages: [{ role: 'user', content }],
    tools: createEditorTools(runController, {
      mode: targetSlideId ? 'edit' : 'generate',
      ...(onActivity ? { onActivity } : {}),
      ...(enableOverlayAssets ? { enableOverlayAssets: true } : {}),
      ...(signal ? { abortSignal: signal } : {}),
    }),
    stopWhen: isStepCount(64),
    experimental_transform: narrationSmoothing(),
    ...requestOptions,
    // Anthropic caches nothing without explicit breakpoints; keep one moving
    // breakpoint on the last message so every step reuses the whole prefix.
    ...(selection.provider === 'anthropic'
      ? {
          prepareStep: ({ messages }: { messages: ModelMessage[] }) => ({
            messages: withMovingAnthropicCacheBreakpoint(messages),
          }),
        }
      : {}),
    ...(signal ? { abortSignal: signal } : {}),
  })
}

export async function runAiGeneration(options: {
  selection: AiModelSelection
  description: string
  screenshots: PreparedAsset[]
  appName?: string
  logo?: PreparedAsset
  controller: AiEditorController
  targetSlideId?: string
  enableOverlayAssets?: boolean
  signal?: AbortSignal
  onEvent: (event: AiRunEvent) => void
  onActivity?: (activity: AiToolActivity) => void
}): Promise<void> {
  const {
    selection,
    description,
    screenshots,
    appName,
    logo,
    controller,
    targetSlideId,
    enableOverlayAssets,
    signal,
    onEvent,
    onActivity,
  } = options
  const runStartedAt = Date.now()
  const accumulator: AiRunAccumulator = {
    assistantOutput: '',
    reasoningOutput: '',
    toolCalls: [],
    slidesCreated: 0,
    usage: null,
    finishReason: null,
    errorMessage: null,
    hadError: false,
  }

  const finishRun = async (outcome: AiRunReport['outcome']) => {
    const report: AiRunReport = {
      outcome,
      assistantOutput: accumulator.assistantOutput,
      reasoningOutput: accumulator.reasoningOutput,
      toolCalls: accumulator.toolCalls.map((toolCall) => ({ ...toolCall })),
      slidesCreated: accumulator.slidesCreated,
      usage: accumulator.usage,
      finishReason: accumulator.finishReason,
      errorMessage: accumulator.errorMessage,
    }
    await saveAiRunReport({
      startedAt: runStartedAt,
      finishedAt: Date.now(),
      mode: targetSlideId ? 'edit' : 'generate',
      selection,
      descriptionCharacters: description.length,
      screenshotCount: screenshots.length,
      report,
    })
  }

  try {
    const provider = getAiProvider(selection.provider)
    const modelOption = getAiModel(selection)
    const reasoning = getAiSdkReasoningEffort(selection)
    const model = await createAiModel(selection)
    const content = buildUserContent({
      description,
      screenshots,
      ...(appName !== undefined ? { appName } : {}),
      ...(logo ? { logo } : {}),
      ...(targetSlideId ? { targetSlideId } : {}),
    })

    onEvent({
      type: 'status',
      message: `Connecting to ${[
        provider.label,
        modelOption.label,
        ...(reasoning ? [`${AI_REASONING_EFFORT_LABELS[reasoning]} effort`] : []),
      ].join(' · ')}…`,
    })

    const result = openAiGenerationStream({
      model,
      selection,
      controller,
      content,
      ...(targetSlideId ? { targetSlideId } : {}),
      ...(enableOverlayAssets ? { enableOverlayAssets: true } : {}),
      ...(signal ? { signal } : {}),
      ...(onActivity ? { onActivity } : {}),
    })

    for await (const part of result.stream) {
      if (signal?.aborted) break
      collectStreamPart({
        part,
        selection,
        runStartedAt,
        accumulator,
        onEvent,
      })
    }

    if (signal?.aborted) {
      onEvent({ type: 'status', message: 'Cancelled' })
      await finishRun('cancelled')
      return
    }
    if (accumulator.hadError) {
      await finishRun('failed')
      return
    }

    let finalText = accumulator.assistantOutput.trim()
    try {
      const resolvedText = await result.text
      if (resolvedText.trim().length > 0) finalText = resolvedText.trim()
    } catch {
      // fall back to accumulated deltas below
    }

    if (!accumulator.usage) {
      try {
        accumulator.usage = toAiRunTokenUsage(await result.usage)
      } catch {
        // Some providers omit usage even when the text stream completes.
      }
    }
    if (!accumulator.finishReason) {
      try {
        accumulator.finishReason = await result.finishReason
      } catch {
        // The visible completion remains valid if finish metadata is unavailable.
      }
    }

    accumulator.assistantOutput = finalText
    onEvent({
      type: 'done',
      summary: finalText,
      slidesCreated: accumulator.slidesCreated,
    })
    await finishRun('completed')
  } catch (error) {
    if (isAbortError(error)) {
      onEvent({ type: 'status', message: 'Cancelled' })
      await finishRun('cancelled')
      return
    }
    accumulator.errorMessage = describeError(error, selection)
    onEvent({ type: 'error', message: accumulator.errorMessage })
    await finishRun('failed')
  }
}
