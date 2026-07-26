/** Flat chroma-key color that gpt-image-2 must fill behind overlay subjects. */
export const ASSET_CHROMA_KEY_RGB = [255, 0, 255] as const
export const ASSET_CHROMA_KEY_HEX = '#FF00FF'

export type ChromaKeyOptions = {
  key?: readonly [number, number, number]
  /** Color distance at/below which pixels become fully transparent. */
  transparentAt?: number
  /** Color distance at/above which pixels stay fully opaque. */
  opaqueAt?: number
}

const DEFAULT_TRANSPARENT_AT = 10
const DEFAULT_OPAQUE_AT = 70

const readChannel = (pixels: Uint8ClampedArray, index: number): number =>
  pixels[index] ?? 0

/**
 * Soft chroma-key against a solid backdrop. Pixels near the key color lose alpha;
 * farther pixels keep their original alpha (capped by the soft falloff).
 * Mutates `frame` in place and returns it.
 */
export function applyChromaKeyToImageData(
  frame: ImageData,
  options: ChromaKeyOptions = {},
): ImageData {
  const key = options.key ?? ASSET_CHROMA_KEY_RGB
  const transparentAt = options.transparentAt ?? DEFAULT_TRANSPARENT_AT
  const opaqueAt = options.opaqueAt ?? DEFAULT_OPAQUE_AT
  const span = Math.max(1, opaqueAt - transparentAt)
  const pixels = frame.data

  for (let index = 0; index < pixels.length; index += 4) {
    const distance = Math.hypot(
      readChannel(pixels, index) - key[0],
      readChannel(pixels, index + 1) - key[1],
      readChannel(pixels, index + 2) - key[2],
    )
    const alpha = Math.max(
      0,
      Math.min(255, ((distance - transparentAt) / span) * 255),
    )
    const currentAlpha = readChannel(pixels, index + 3)
    pixels[index + 3] = Math.min(currentAlpha, alpha)
  }

  return frame
}
