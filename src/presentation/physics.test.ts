import { describe, expect, it } from 'vitest'
import {
  HALF_PROTONS,
  TOTAL_PROTONS,
  excessProtonsAt,
  formatProtonCount,
} from './physics'

describe('presentation proton populations', () => {
  it('matches the rounded 3 T teaching reference', () => {
    expect(excessProtonsAt(0)).toBe(0)
    expect(excessProtonsAt(3)).toBeCloseTo(1.48e16, -10)
  })

  it('responds monotonically to field strength', () => {
    expect(excessProtonsAt(1.5)).toBeGreaterThan(0)
    expect(excessProtonsAt(3)).toBeGreaterThan(excessProtonsAt(1.5))
    expect(excessProtonsAt(7)).toBeGreaterThan(excessProtonsAt(3))
  })

  it('keeps the two populations centered on half of the total', () => {
    const excess = excessProtonsAt(7)
    expect(HALF_PROTONS + excess + (HALF_PROTONS - excess)).toBe(
      TOTAL_PROTONS,
    )
    expect(formatProtonCount(TOTAL_PROTONS)).toBe(
      '2,000,000,000,000,000,000,000',
    )
  })
})
