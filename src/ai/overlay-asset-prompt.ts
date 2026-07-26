import { ASSET_CHROMA_KEY_HEX } from './chroma-key'

/**
 * Wrap a subject-only prompt with hard constraints for gpt-image-2.
 * The model cannot emit transparency, so every overlay is forced onto a flat chroma key.
 */
export function buildOverlayAssetPrompt(subjectPrompt: string): string {
  const subject = subjectPrompt.trim()
  return `${subject}

CRITICAL OUTPUT CONSTRAINTS (do not ignore):
- Render ONLY the requested subject as a single cutout-ready overlay element.
- Center the subject with generous empty padding on every side; do not crop into the subject.
- Fill the ENTIRE background with one flat, solid, uniform chroma-key color exactly ${ASSET_CHROMA_KEY_HEX} (RGB 255, 0, 255).
- Background must have zero gradients, textures, patterns, vignettes, drop shadows on the backdrop, floor, or secondary colors.
- Subject edges must stay sharp and high-contrast against the ${ASSET_CHROMA_KEY_HEX} field so the key color can be removed later.
- Do NOT include phones, device frames, App Store mockups, full UI screens, posters, or marketing layouts.
- Do NOT add captions, watermarks, or unrelated scene dressing unless the subject itself is lettering.`
}

/**
 * Hard cap on gpt-image-2 calls per generation run. Image calls are slow and paid,
 * so the model gets a small budget and is pushed to reuse cutouts instead.
 */
export const OVERLAY_ASSET_BUDGET = 4

export const OVERLAY_ASSET_SIZE_MAP = {
  square: '1024x1024',
  portrait: '1024x1536',
  landscape: '1536x1024',
} as const

export type OverlayAssetSize = keyof typeof OVERLAY_ASSET_SIZE_MAP
