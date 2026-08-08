import { describe, expect, it } from 'vitest'
import { DRAG_MAX, getDragMaxX, getDragMinX, getDragMinY } from './drag-bounds'
import type { DeviceElement, ShapeElement } from '../types'

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

const device = (overrides: Partial<DeviceElement> = {}): DeviceElement => ({
  id: 'device-1',
  type: 'device',
  x: 60,
  y: 18,
  width: 70,
  rotation: 0,
  opacity: 1,
  deviceStyle: 'iphone-17-a',
  screenTheme: 'coral',
  tiltX: 0,
  tiltY: 0,
  shadow: 55,
  ...overrides,
})

describe('drag bounds', () => {
  it('keeps the default bounds for non-device elements', () => {
    expect(getDragMinX(shape)).toBe(-35)
    expect(getDragMaxX(shape)).toBe(DRAG_MAX)
    expect(getDragMinY(shape)).toBe(-35)
  })

  it('lets wide devices hang off the left edge down to a visible sliver', () => {
    expect(getDragMinX(device({ width: 70 }))).toBe(3 - 70)
    expect(getDragMinX(device({ width: 20 }))).toBe(-35)
  })

  it('derives the vertical minimum from the rendered device height', () => {
    expect(getDragMinY(device({ width: 70 }))).toBeLessThan(-35)
    expect(getDragMinY(device({ width: 8 }))).toBe(-35)
  })

  it('extends horizontal travel by one screen for spanning devices', () => {
    const spanning = device({ width: 70, spansScreens: true })
    expect(getDragMinX(spanning)).toBe(3 - 70 - 100)
    expect(getDragMaxX(spanning)).toBe(DRAG_MAX + 100)
  })

  it('does not extend vertical travel for spanning devices', () => {
    expect(getDragMinY(device({ width: 70, spansScreens: true })))
      .toBe(getDragMinY(device({ width: 70 })))
  })
})
