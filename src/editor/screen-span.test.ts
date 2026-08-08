import { describe, expect, it } from 'vitest'
import { getSpanGhosts, isSpanningDevice } from './screen-span'
import type { DeviceElement, ShapeElement, Slide } from '../types'

const device = (overrides: Partial<DeviceElement> = {}): DeviceElement => ({
  id: 'device-1',
  type: 'device',
  x: 60,
  y: 18,
  width: 70,
  rotation: -8,
  opacity: 1,
  deviceStyle: 'iphone-17-a',
  screenTheme: 'coral',
  tiltX: 0,
  tiltY: 0,
  shadow: 55,
  ...overrides,
})

const shape: ShapeElement = {
  id: 'shape-1',
  type: 'shape',
  x: 10,
  y: 20,
  width: 30,
  rotation: 0,
  opacity: 1,
  shape: 'circle',
  color: '#ffffff',
}

const slide = (id: string, elements: Slide['elements']): Slide => ({
  id,
  name: id,
  background: { type: 'solid', color1: '#ffffff', color2: '#ffffff', angle: 0 },
  elements,
})

describe('isSpanningDevice', () => {
  it('accepts only device elements with the flag enabled', () => {
    expect(isSpanningDevice(device({ spansScreens: true }))).toBe(true)
    expect(isSpanningDevice(device())).toBe(false)
    expect(isSpanningDevice(device({ spansScreens: false }))).toBe(false)
    expect(isSpanningDevice(shape)).toBe(false)
  })
})

describe('getSpanGhosts', () => {
  const slides = [
    slide('one', [device({ id: 'left-device', x: 70, spansScreens: true }), shape]),
    slide('two', [device({ id: 'middle-device', x: 40 })]),
    slide('three', [device({ id: 'right-device', x: -25, rotation: 12, spansScreens: true })]),
  ]

  it('continues a spanning mockup from the previous screen shifted one screen left', () => {
    const ghosts = getSpanGhosts(slides, 1)

    expect(ghosts).toHaveLength(2)
    expect(ghosts[0]).toMatchObject({
      sourceSlideId: 'one',
      element: { id: 'left-device', x: -30, rotation: -8, width: 70 },
    })
  })

  it('continues a spanning mockup from the next screen shifted one screen right', () => {
    const ghosts = getSpanGhosts(slides, 1)

    expect(ghosts[1]).toMatchObject({
      sourceSlideId: 'three',
      element: { id: 'right-device', x: 75, rotation: 12 },
    })
  })

  it('ignores non-spanning devices and other element types', () => {
    expect(getSpanGhosts(slides, 0).map((ghost) => ghost.element.id)).toEqual([])
    expect(getSpanGhosts(slides, 2).map((ghost) => ghost.element.id)).toEqual([])
  })

  it('does not mutate the source elements', () => {
    getSpanGhosts(slides, 1)
    expect(slides[0]?.elements[0]?.x).toBe(70)
  })

  it('handles screens at either end of the strip', () => {
    const spanning = [slide('solo', [device({ spansScreens: true })])]
    expect(getSpanGhosts(spanning, 0)).toEqual([])
  })
})
