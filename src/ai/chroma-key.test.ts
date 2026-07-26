import { describe, expect, it } from 'vitest'
import {
  ASSET_CHROMA_KEY_RGB,
  applyChromaKeyToImageData,
} from './chroma-key'

const makeFrame = (pixels: number[]): ImageData => ({
  data: new Uint8ClampedArray(pixels),
  width: pixels.length / 4,
  height: 1,
  colorSpace: 'srgb',
})

describe('applyChromaKeyToImageData', () => {
  it('makes exact key-color pixels fully transparent', () => {
    const [r, g, b] = ASSET_CHROMA_KEY_RGB
    const frame = makeFrame([r, g, b, 255, 10, 20, 30, 255])

    applyChromaKeyToImageData(frame)

    expect(frame.data[3]).toBe(0)
    expect(frame.data[7]).toBe(255)
  })

  it('keeps far pixels opaque and softens mid-distance edges', () => {
    const frame = makeFrame([
      ...ASSET_CHROMA_KEY_RGB, 255,
      255, 40, 255, 255, // distance ~40 from magenta
      0, 0, 0, 200,
    ])

    applyChromaKeyToImageData(frame, { transparentAt: 10, opaqueAt: 70 })

    expect(frame.data[3]).toBe(0)
    expect(frame.data[7]).toBeGreaterThan(0)
    expect(frame.data[7]).toBeLessThan(255)
    expect(frame.data[11]).toBe(200)
  })

  it('never increases existing alpha', () => {
    const frame = makeFrame([0, 0, 0, 40])

    applyChromaKeyToImageData(frame)

    expect(frame.data[3]).toBe(40)
  })
})
