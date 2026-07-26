import { describe, expect, it } from 'vitest'
import { OVERLAY_ASSET_BUDGET } from './overlay-asset-prompt'
import { buildInstructions, buildUserMessage } from './prompt'

describe('AI prompt language', () => {
  it('requires English canvas copy and completion summaries', () => {
    const instructions = buildInstructions()

    expect(instructions).toContain(
      'Write all on-canvas copy (headlines, supporting text, labels) in English',
    )
    expect(instructions).toContain(
      'reply in English with a short 2-3 sentence summary',
    )
    expect(instructions).not.toContain(
      'in the same language the user used to describe their app',
    )
  })

  it('keeps the English completion requirement in edit mode', () => {
    const instructions = buildInstructions({ targetSlideId: 'slide-1' })

    expect(instructions).toContain(
      'reply in English with a short 1-2 sentence summary',
    )
  })
})

describe('AI prompt branding', () => {
  it('requires logo placement via add_image in generate mode', () => {
    const instructions = buildInstructions()

    expect(instructions).toContain('When a logo asset is provided, incorporate it with add_image')
    expect(instructions).toContain('Do not place the logo asset inside a device frame')
  })

  it('includes app name and logo asset in the user message', () => {
    const message = buildUserMessage(
      'A calm habit tracker',
      [{ assetId: 'upload-1', name: 'home.png' }],
      { appName: 'Habitly', logoAssetId: 'upload-logo' },
    )

    expect(message).toContain('App name: Habitly')
    expect(message).toContain('App logo asset id: upload-logo')
    expect(message).toContain('use add_image with this id')
    expect(message).toContain('upload-1 — home.png')
  })
})

describe('AI prompt icons', () => {
  it('instructs the model to use Hugeicons and never emoji', () => {
    const instructions = buildInstructions()

    expect(instructions).toContain('add_icon')
    expect(instructions).toContain('NEVER use emoji')
    expect(instructions).toContain('Hugeicons')
  })

  it('includes the no-emoji rule in edit mode', () => {
    const instructions = buildInstructions({ targetSlideId: 'slide-1' })

    expect(instructions).toContain('NEVER use emoji')
  })
})

describe('AI prompt overlay assets', () => {
  it('omits overlay asset guidance unless enabled', () => {
    const instructions = buildInstructions()

    expect(instructions).not.toContain('Overlay assets (gpt-image-2)')
    expect(instructions).not.toContain('create_overlay_asset')
  })

  it('teaches the chroma-key workflow when overlay assets are enabled', () => {
    const instructions = buildInstructions({ enableOverlayAssets: true })

    expect(instructions).toContain('Overlay assets (gpt-image-2) — ENABLED for this run')
    expect(instructions).toContain('create_overlay_asset')
    expect(instructions).toContain('remove_asset_background')
    expect(instructions).toContain('#FF00FF')
    expect(instructions).toContain('Do NOT generate:')
  })

  it('treats the opt-in as an instruction to actually generate', () => {
    const instructions = buildInstructions({ enableOverlayAssets: true })

    expect(instructions).toContain('Treat that as an instruction, not permission')
    expect(instructions).toContain('expected to contain at least one generated cutout')
  })

  it('states the per-run generation budget and the 1-2 target', () => {
    const instructions = buildInstructions({ enableOverlayAssets: true })

    expect(instructions).toContain(`Hard budget of ${OVERLAY_ASSET_BUDGET} create_overlay_asset calls per run`)
    expect(instructions).toContain('Aim for 1-2 generated subjects')
    expect(instructions).toContain('One call per subject')
  })

  it('times generation to the concept phase when building a new set', () => {
    const instructions = buildInstructions({ enableOverlayAssets: true })

    expect(instructions).toContain('Pick the subject during step 2')
  })

  it('lets a pure text or layout edit skip generation in edit mode', () => {
    const instructions = buildInstructions({ targetSlideId: 'slide-1', enableOverlayAssets: true })

    expect(instructions).toContain('purely about text, sizing, color, or position')
    expect(instructions).toContain('Decide before you start editing')
    expect(instructions).not.toContain('Pick the subject during step 2')
  })
})
