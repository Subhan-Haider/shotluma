import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OVERLAY_ASSET_BUDGET } from './overlay-asset-prompt'
import type { AiEditorController } from './controller'

const generateImage = vi.fn<() => Promise<{ image: { base64: string; mediaType: string } }>>()
const getAiProviderKey = vi.fn<() => string | undefined>()

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, generateImage: () => generateImage() }
})

vi.mock('./provider-config', () => ({
  getAiProviderKey: () => getAiProviderKey(),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ image: (id: string) => ({ id }) }),
}))

const { createOverlayAssetTools } = await import('./overlay-asset-tools')

const createController = (): AiEditorController => ({
  snapshot: () => ({ slides: [], assets: [] }),
  addSlide: vi.fn(),
  deleteSlide: vi.fn(),
  setSlideBackground: vi.fn(),
  addElement: vi.fn(),
  addElements: vi.fn(),
  updateElement: vi.fn(),
  deleteElement: vi.fn(),
  getAssetSrc: vi.fn(),
  addAsset: vi.fn(() => 'upload-1'),
} as unknown as AiEditorController)

type OverlayTools = ReturnType<typeof createOverlayAssetTools>
type ExecuteOptions = Parameters<OverlayTools['create_overlay_asset']['execute']>[1]

/** The AI SDK passes call metadata we do not exercise here. */
const EXECUTE_OPTIONS = { toolCallId: 'call-1', messages: [] } as unknown as ExecuteOptions

const runCreate = async (tools: OverlayTools) =>
  (await tools.create_overlay_asset.execute(
    { prompt: 'matte coral badge' },
    EXECUTE_OPTIONS,
  )) as { ok: boolean; error?: string; generationsLeft?: number }

describe('create_overlay_asset budget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAiProviderKey.mockReturnValue('sk-test')
    generateImage.mockResolvedValue({ image: { base64: 'AAAA', mediaType: 'image/png' } })
  })

  it('reports the remaining generations after each call', async () => {
    const tools = createOverlayAssetTools({ controller: createController(), emit: vi.fn() })

    expect((await runCreate(tools)).generationsLeft).toBe(OVERLAY_ASSET_BUDGET - 1)
    expect((await runCreate(tools)).generationsLeft).toBe(OVERLAY_ASSET_BUDGET - 2)
  })

  it('refuses further generations once the per-run budget is spent', async () => {
    const tools = createOverlayAssetTools({ controller: createController(), emit: vi.fn() })

    for (let call = 0; call < OVERLAY_ASSET_BUDGET; call += 1) {
      expect((await runCreate(tools)).ok).toBe(true)
    }

    const denied = await runCreate(tools)

    expect(denied.ok).toBe(false)
    expect(denied.error).toContain('budget spent')
    expect(generateImage).toHaveBeenCalledTimes(OVERLAY_ASSET_BUDGET)
  })

  it('counts failed generations against the budget so retries cannot loop', async () => {
    const tools = createOverlayAssetTools({ controller: createController(), emit: vi.fn() })
    generateImage.mockRejectedValue(new Error('rate limited'))

    for (let call = 0; call < OVERLAY_ASSET_BUDGET; call += 1) {
      expect((await runCreate(tools)).error).toContain('rate limited')
    }

    expect((await runCreate(tools)).error).toContain('budget spent')
    expect(generateImage).toHaveBeenCalledTimes(OVERLAY_ASSET_BUDGET)
  })

  it('gives each run its own budget', async () => {
    const first = createOverlayAssetTools({ controller: createController(), emit: vi.fn() })
    for (let call = 0; call < OVERLAY_ASSET_BUDGET; call += 1) await runCreate(first)
    expect((await runCreate(first)).ok).toBe(false)

    const second = createOverlayAssetTools({ controller: createController(), emit: vi.fn() })

    expect((await runCreate(second)).ok).toBe(true)
  })
})
