/** Flat chroma-key color that gpt-image-2 must fill behind overlay subjects. */
export const ASSET_CHROMA_KEY_RGB = [255, 0, 255] as const
export const ASSET_CHROMA_KEY_HEX = '#FF00FF'

export type ChromaKeyRgb = readonly [number, number, number]

export type ChromaKeyOptions = {
  key?: ChromaKeyRgb
  /** Color distance at/below which pixels become fully transparent. */
  transparentAt?: number
  /** Color distance at/above which pixels stay fully opaque. */
  opaqueAt?: number
}

export type ChromaKeyStats = {
  /** Key color this pass actually removed. */
  key: ChromaKeyRgb
  /** Share of pixels that ended fully transparent, 0-1. */
  clearedRatio: number
  /** Share of pixels left partially transparent — soft edges, but also leftover haze. */
  partialRatio: number
}

/**
 * Image models render the requested key as an approximate color: flat across the backdrop,
 * but often 20-50 units away from #FF00FF. Keying against the nominal color leaves that
 * whole backdrop mid-ramp — a uniform pink haze instead of transparency. So the ramp stays
 * wide, and callers should measure the real key per image with `detectChromaKey`.
 */
const DEFAULT_TRANSPARENT_AT = 30
const DEFAULT_OPAQUE_AT = 110

/** Cap on sampled border pixels; keeps key detection cheap on large images. */
const MAX_BORDER_SAMPLES = 4096

const readChannel = (pixels: Uint8ClampedArray, index: number): number =>
  pixels[index] ?? 0

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

const isBorderPixel = (x: number, y: number, width: number, height: number, ring: number): boolean =>
  x < ring || y < ring || x >= width - ring || y >= height - ring

/**
 * Measure the actual backdrop color from the outer ring of the frame. The generator is told
 * to leave generous padding, so the border is backdrop; the median shrugs off the occasional
 * subject pixel that reaches an edge.
 */
export function detectChromaKey(
  frame: ImageData,
  fallback: ChromaKeyRgb = ASSET_CHROMA_KEY_RGB,
): ChromaKeyRgb {
  const { width, height, data } = frame
  if (width <= 0 || height <= 0) return fallback

  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.02))
  const inner = Math.max(0, width - 2 * ring) * Math.max(0, height - 2 * ring)
  const stride = Math.max(1, Math.ceil((width * height - inner) / MAX_BORDER_SAMPLES))

  const reds: number[] = []
  const greens: number[] = []
  const blues: number[] = []
  let seen = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isBorderPixel(x, y, width, height, ring)) continue
      seen += 1
      if (seen % stride !== 0) continue
      const index = (y * width + x) * 4
      reds.push(readChannel(data, index))
      greens.push(readChannel(data, index + 1))
      blues.push(readChannel(data, index + 2))
    }
  }

  if (reds.length === 0) return fallback
  return [median(reds), median(greens), median(blues)] as const
}

/**
 * Pull magenta spill out of a partially transparent pixel. Edge pixels blend subject and
 * backdrop, which leaves a pink rim once the backdrop is keyed away. Green is the channel
 * the key lacks, so the excess of red and blue over green is the spill.
 */
const suppressMagentaSpill = (
  pixels: Uint8ClampedArray,
  index: number,
  strength: number,
): void => {
  const red = readChannel(pixels, index)
  const green = readChannel(pixels, index + 1)
  const blue = readChannel(pixels, index + 2)
  const spill = Math.min(red, blue) - green
  if (spill <= 0) return
  const correction = spill * strength
  pixels[index] = red - correction
  pixels[index + 2] = blue - correction
}

/**
 * Soft chroma-key against a solid backdrop. Pixels near the key color lose alpha; farther
 * pixels keep their original alpha (capped by the soft falloff). Partially transparent
 * pixels are despilled so edges do not keep a magenta rim. Mutates `frame` in place.
 */
export function applyChromaKeyToImageData(
  frame: ImageData,
  options: ChromaKeyOptions = {},
): ChromaKeyStats {
  const key = options.key ?? ASSET_CHROMA_KEY_RGB
  const transparentAt = options.transparentAt ?? DEFAULT_TRANSPARENT_AT
  const opaqueAt = options.opaqueAt ?? DEFAULT_OPAQUE_AT
  const span = Math.max(1, opaqueAt - transparentAt)
  const pixels = frame.data

  let cleared = 0
  let partial = 0

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
    const nextAlpha = Math.min(currentAlpha, alpha)
    pixels[index + 3] = nextAlpha

    if (nextAlpha === 0) cleared += 1
    else if (nextAlpha < 255) {
      partial += 1
      suppressMagentaSpill(pixels, index, 1 - nextAlpha / 255)
    }
  }

  const total = Math.max(1, pixels.length / 4)
  return { key, clearedRatio: cleared / total, partialRatio: partial / total }
}
