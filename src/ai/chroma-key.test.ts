import { describe, expect, it } from 'vitest'
import {
  ASSET_CHROMA_KEY_RGB,
  applyChromaKeyToImageData,
  detectChromaKey,
} from './chroma-key'

const makeFrame = (pixels: number[]): ImageData => ({
  data: new Uint8ClampedArray(pixels),
  width: pixels.length / 4,
  height: 1,
  colorSpace: 'srgb',
})

const makeImage = (
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => [number, number, number],
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y)
      const index = (y * width + x) * 4
      data[index] = r
      data[index + 1] = g
      data[index + 2] = b
      data[index + 3] = 255
    }
  }
  return { data, width, height, colorSpace: 'srgb' }
}

describe('applyChromaKeyToImageData', () => {
  it('makes exact key-color pixels fully transparent', () => {
    const [r, g, b] = ASSET_CHROMA_KEY_RGB
    const frame = makeFrame([r, g, b, 255, 10, 20, 30, 255])

    applyChromaKeyToImageData(frame)

    expect(frame.data[3]).toBe(0)
    expect(frame.data[7]).toBe(255)
  })

  it('clears a backdrop the generator rendered slightly off-key', () => {
    // gpt-image-2 approximates the requested magenta; the whole backdrop lands ~35 away.
    const offKey = [246, 24, 238] as const
    const frame = makeFrame([...offKey, 255, ...offKey, 255])

    const stats = applyChromaKeyToImageData(frame, { key: detectChromaKey(frame) })

    expect(frame.data[3]).toBe(0)
    expect(frame.data[7]).toBe(0)
    expect(stats.clearedRatio).toBe(1)
  })

  it('keeps far pixels opaque and softens mid-distance edges', () => {
    const frame = makeFrame([
      ...ASSET_CHROMA_KEY_RGB, 255,
      255, 90, 255, 255, // distance ~90 from magenta
      0, 0, 0, 200,
    ])

    applyChromaKeyToImageData(frame, { transparentAt: 30, opaqueAt: 110 })

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

  it('pulls magenta spill out of soft edge pixels', () => {
    const frame = makeFrame([255, 80, 255, 255]) // distance 80: inside the soft ramp

    applyChromaKeyToImageData(frame)

    expect(frame.data[3]).toBeGreaterThan(0)
    expect(frame.data[3]).toBeLessThan(255)
    expect(frame.data[0]).toBeLessThan(255)
    expect(frame.data[2]).toBeLessThan(255)
    expect(frame.data[1]).toBe(80)
  })

  it('leaves opaque subject pixels untouched', () => {
    const frame = makeFrame([200, 80, 190, 255])

    applyChromaKeyToImageData(frame)

    expect(Array.from(frame.data)).toEqual([200, 80, 190, 255])
  })

  it('reports how much of the frame was cleared', () => {
    const [r, g, b] = ASSET_CHROMA_KEY_RGB
    const frame = makeFrame([r, g, b, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255])

    const stats = applyChromaKeyToImageData(frame)

    expect(stats.clearedRatio).toBe(0.25)
    expect(stats.partialRatio).toBe(0)
    expect(stats.key).toEqual(ASSET_CHROMA_KEY_RGB)
  })
})

describe('detectChromaKey', () => {
  const offKey: [number, number, number] = [244, 30, 235]

  it('measures the real backdrop color from the border ring', () => {
    const frame = makeImage(64, 64, (x, y) =>
      (x > 12 && x < 52 && y > 12 && y < 52 ? [20, 180, 90] : offKey))

    expect(detectChromaKey(frame)).toEqual(offKey)
  })

  it('ignores a subject that touches one edge', () => {
    const frame = makeImage(64, 64, (x, y) =>
      (x > 12 && x < 52 && y > 12 ? [20, 180, 90] : offKey))

    expect(detectChromaKey(frame)).toEqual(offKey)
  })

  it('falls back for an empty frame', () => {
    const frame: ImageData = {
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
      colorSpace: 'srgb',
    }

    expect(detectChromaKey(frame)).toEqual(ASSET_CHROMA_KEY_RGB)
  })
})
