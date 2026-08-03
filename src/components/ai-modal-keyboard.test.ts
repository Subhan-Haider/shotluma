import { describe, expect, it } from 'vitest'
import { shouldCloseAiModalOnKeydown } from './ai-modal-keyboard'

describe('AI modal keyboard handling', () => {
  it('keeps Escape inside a nested popup', () => {
    expect(shouldCloseAiModalOnKeydown({ key: 'Escape' }, true)).toBe(false)
  })

  it('closes only for Escape without a nested popup', () => {
    expect(shouldCloseAiModalOnKeydown({ key: 'Enter' }, false)).toBe(false)
    expect(shouldCloseAiModalOnKeydown({ key: 'Escape' }, false)).toBe(true)
  })
})
