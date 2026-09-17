import { describe, expect, it } from 'vitest'
import {
  HALF_PROTONS,
  TOTAL_PROTONS,
  excessProtonsAt,
  formatProtonCount,
  protonPolarizationAt,
  protonPopulationsAt,
} from './physics'

describe('presentation proton populations', () => {
  it('derives the physical polarization and excess at 3 T and 310 K', () => {
    expect(excessProtonsAt(0)).toBe(0)
    expect(protonPolarizationAt(3)).toBeCloseTo(9.887_403_312e-6, 15)
    expect(excessProtonsAt(3)).toBeCloseTo(1.977_480_662e16, -7)
  })

  it('responds monotonically to field strength', () => {
    expect(excessProtonsAt(1.5)).toBeGreaterThan(0)
    expect(excessProtonsAt(3)).toBeGreaterThan(excessProtonsAt(1.5))
    expect(excessProtonsAt(7)).toBeGreaterThan(excessProtonsAt(3))
  })

  it('uses half the full excess to shift each population', () => {
    const populations = protonPopulationsAt(3)
    expect(populations.parallel + populations.antiparallel).toBe(TOTAL_PROTONS)
    expect(
      (populations.parallel - populations.antiparallel) /
        populations.excess,
    ).toBeCloseTo(1, 10)
    expect(populations.parallel - HALF_PROTONS).toBeCloseTo(
      populations.excess / 2,
      -7,
    )
    expect(formatProtonCount(TOTAL_PROTONS)).toBe(
      '2,000,000,000,000,000,000,000',
    )
  })
})
