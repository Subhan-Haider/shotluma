import { describe, expect, it } from 'vitest'
import { normalizeAiCopy, normalizeAiHighlights } from './normalize-copy'

describe('normalizeAiCopy', () => {
  it('turns literal backslash-n into real newlines', () => {
    expect(normalizeAiCopy('Capture every\\nmoment in\\nunder a minute'))
      .toBe('Capture every\nmoment in\nunder a minute')
  })

  it('leaves already-real newlines unchanged', () => {
    expect(normalizeAiCopy('Hard days and\nbeautiful ones')).toBe('Hard days and\nbeautiful ones')
  })

  it('leaves copy without line breaks unchanged', () => {
    expect(normalizeAiCopy('Always private')).toBe('Always private')
  })

  it('normalizes mixed literal and real newlines', () => {
    expect(normalizeAiCopy('One\\nTwo\nThree')).toBe('One\nTwo\nThree')
  })
})

describe('normalizeAiHighlights', () => {
  it('normalizes highlight substrings that contain literal backslash-n', () => {
    expect(normalizeAiHighlights([
      { text: 'every\\nmoment', bold: true },
      { text: 'Always', color: '#fff' },
    ])).toEqual([
      { text: 'every\nmoment', bold: true },
      { text: 'Always', color: '#fff' },
    ])
  })
})
