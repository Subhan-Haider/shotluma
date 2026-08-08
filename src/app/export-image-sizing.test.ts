import { describe, expect, it } from 'vitest'
import {
  getExportImageScale,
  getExportImageSize,
  mergeExportImageRequests,
} from './export-image-sizing'

describe('getExportImageScale', () => {
  it('shrinks a source that is larger than the area it covers', () => {
    const scale = getExportImageScale(
      { width: 1206, height: 2622 },
      { width: 603, height: 1311 },
      1,
    )
    expect(scale).toBeCloseTo(0.5)
  })

  it('never scales a source above its own resolution', () => {
    const scale = getExportImageScale(
      { width: 400, height: 800 },
      { width: 1290, height: 2796 },
      2,
    )
    expect(scale).toBe(1)
  })

  it('covers both axes when the footprint has a different aspect ratio', () => {
    const scale = getExportImageScale(
      { width: 1000, height: 1000 },
      { width: 100, height: 500 },
      1,
    )
    expect(scale).toBeCloseTo(0.5)
  })

  it('applies the requested resolution headroom', () => {
    const scale = getExportImageScale(
      { width: 1000, height: 1000 },
      { width: 200, height: 200 },
      1.5,
    )
    expect(scale).toBeCloseTo(0.3)
  })

  it('keeps a source with no intrinsic size unchanged', () => {
    expect(getExportImageScale({ width: 0, height: 0 }, { width: 100, height: 100 }, 2)).toBe(1)
  })
})

describe('getExportImageSize', () => {
  it('rounds to whole pixels', () => {
    expect(getExportImageSize({ width: 1206, height: 2622 }, { width: 500, height: 1087 }, 1))
      .toEqual({ width: 500, height: 1087 })
  })

  it('never collapses a footprint to zero pixels', () => {
    expect(getExportImageSize({ width: 1000, height: 1000 }, { width: 0, height: 0 }, 1))
      .toEqual({ width: 1, height: 1 })
  })
})

describe('mergeExportImageRequests', () => {
  it('encodes a reused source once at its largest placement', () => {
    const merged = mergeExportImageRequests([
      { src: 'data:image/png;base64,a', footprint: { width: 300, height: 900 } },
      { src: 'data:image/png;base64,a', footprint: { width: 700, height: 400 } },
      { src: 'data:image/png;base64,b', footprint: { width: 100, height: 100 } },
    ])

    expect(merged.size).toBe(2)
    expect(merged.get('data:image/png;base64,a')).toEqual({ width: 700, height: 900 })
    expect(merged.get('data:image/png;base64,b')).toEqual({ width: 100, height: 100 })
  })

  it('returns nothing for an empty artboard set', () => {
    expect(mergeExportImageRequests([]).size).toBe(0)
  })
})
