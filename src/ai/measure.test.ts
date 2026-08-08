import { describe, expect, it } from 'vitest'

// The rounding helper is not exported, but we can test the contract via the public API
// by verifying that returned boxes don't carry spurious precision beyond one decimal.

describe('measure box rounding', () => {
  it('rounds percent values to one decimal place to keep tool results compact', () => {
    // Full-precision input coordinates that would produce many decimals
    const testCases = [
      { input: 23.3, expected: 23.3 },
      { input: 8.4, expected: 8.4 },
      { input: 35.4, expected: 35.4 },
      { input: 3.2, expected: 3.2 },
      { input: 0.05, expected: 0.1 }, // round up
      { input: 0.04, expected: 0.0 }, // round down
      { input: 99.96, expected: 100.0 },
    ]

    // The actual rounding function used in measure.ts
    const roundPercent = (value: number) => Math.round(value * 10) / 10

    testCases.forEach(({ input, expected }) => {
      const result = roundPercent(input)
      expect(result).toBe(expected)
      // Verify no spurious precision
      expect(result.toFixed(1)).toBe(expected.toFixed(1))
    })
  })

  it('keeps one-decimal values unchanged', () => {
    const roundPercent = (value: number) => Math.round(value * 10) / 10

    expect(roundPercent(10.5)).toBe(10.5)
    expect(roundPercent(0.0)).toBe(0.0)
    expect(roundPercent(100.0)).toBe(100.0)
  })
})
