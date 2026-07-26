import { describe, expect, it } from 'vitest'
import { ASSET_CHROMA_KEY_HEX } from './chroma-key'
import { buildOverlayAssetPrompt } from './overlay-asset-prompt'

describe('buildOverlayAssetPrompt', () => {
  it('keeps the subject and enforces the chroma-key backdrop constraints', () => {
    const prompt = buildOverlayAssetPrompt('  Coral spark sticker with soft sheen  ')

    expect(prompt.startsWith('Coral spark sticker with soft sheen')).toBe(true)
    expect(prompt).toContain(ASSET_CHROMA_KEY_HEX)
    expect(prompt).toContain('RGB 255, 0, 255')
    expect(prompt).toContain('Do NOT include phones, device frames')
    expect(prompt).toContain('cutout-ready overlay element')
  })
})
