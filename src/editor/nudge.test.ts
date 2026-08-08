import { describe, expect, it } from 'vitest'
import { getNudgeUpdates } from './nudge'
import type { DeviceElement, ShapeElement } from '../types'

const shape = (overrides: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 'shape-1',
  type: 'shape',
  x: 10,
  y: 20,
  width: 30,
  rotation: 0,
  opacity: 1,
  shape: 'circle',
  color: '#ffffff',
  ...overrides,
})

describe('getNudgeUpdates', () => {
  it('moves only selected and unlocked elements', () => {
    const updates = getNudgeUpdates(
      [
        shape(),
        shape({ id: 'shape-2', x: 20, locked: true }),
        shape({ id: 'shape-3', x: 30 }),
      ],
      ['shape-1', 'shape-2'],
      { x: 2, y: -3 },
    )

    expect(updates).toEqual([
      { id: 'shape-1', patch: { x: 12, y: 17 } },
    ])
  })

  it('constrains a group at the canvas movement bounds', () => {
    const updates = getNudgeUpdates(
      [
        shape({ id: 'left', x: -34, y: 90 }),
        shape({ id: 'right', x: 96, y: 20 }),
      ],
      ['left', 'right'],
      { x: 10, y: 12 },
    )

    expect(updates).toEqual([
      { id: 'left', patch: { x: -33, y: 97 } },
      { id: 'right', patch: { x: 97, y: 27 } },
    ])
  })

  it('lets a spanning device travel onto the neighboring screen', () => {
    const spanningDevice: DeviceElement = {
      id: 'device-1',
      type: 'device',
      x: 96,
      y: 20,
      width: 70,
      rotation: -8,
      opacity: 1,
      deviceStyle: 'iphone-17-a',
      screenTheme: 'coral',
      tiltX: 0,
      tiltY: 0,
      shadow: 55,
      spansScreens: true,
    }

    const updates = getNudgeUpdates([spanningDevice], ['device-1'], { x: 10, y: 0 })

    expect(updates).toEqual([
      { id: 'device-1', patch: { x: 106, y: 20 } },
    ])
  })

  it('returns no work when nothing movable is selected', () => {
    expect(getNudgeUpdates(
      [shape({ locked: true })],
      ['shape-1'],
      { x: 1, y: 1 },
    )).toEqual([])
  })
})
