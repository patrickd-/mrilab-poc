import { describe, expect, it } from 'vitest'
import type { GradientSignalPoint } from './gradientEncoding'
import {
  createKSpaceAutoFillPlan,
  kSpaceCoverageForGrid,
} from './kSpaceCoverage'

function point(
  kxCyclesPerMeter: number,
  kyCyclesPerMeter: number,
): GradientSignalPoint {
  return {
    kxCyclesPerMeter,
    kyCyclesPerMeter,
    normalizedInPhaseSignal: 1,
    normalizedMagnitude: 1,
    normalizedQuadratureSignal: 0,
    timeMilliseconds: 10,
  }
}

describe('k-space Cartesian coverage', () => {
  it('counts unique nearest Cartesian bins inside the selected Nyquist cell', () => {
    const report = kSpaceCoverageForGrid(
      [
        {
          id: 0,
          points: [
            point(-500, -500),
            point(-500, -500),
            point(-250, 0),
            point(600, 0),
          ],
        },
      ],
      4,
      1,
    )

    expect(report.totalBinCount).toBe(16)
    expect(report.coveredBinCount).toBe(2)
    expect(report.coveredBinsPerPhaseLine).toEqual(
      new Uint16Array([1, 0, 1, 0]),
    )
    expect(report.percentage).toBe(12.5)
  })

  it('changes coverage when the reconstruction voxel size changes', () => {
    const runs = [{ id: 0, points: [point(700, 0)] }]

    expect(kSpaceCoverageForGrid(runs, 4, 1).coveredBinCount).toBe(0)
    expect(kSpaceCoverageForGrid(runs, 4, 0.5).coveredBinCount).toBe(1)
  })

  it('plans complete center-out coverage for ideal gradients', () => {
    const plan = createKSpaceAutoFillPlan([], 128, 1, false)

    expect(plan.phaseEncodingAmplitudes).toHaveLength(128)
    expect(plan.phaseEncodingAmplitudes[0]).toBe(0)
    expect(plan.predictedCoveredBinCount).toBe(plan.totalBinCount)
  })

  it('adds recovery acquisitions for gradient-response curvature', () => {
    const plan = createKSpaceAutoFillPlan([], 128, 1, true)

    expect(plan.phaseEncodingAmplitudes.length).toBeGreaterThan(128)
    expect(plan.predictedCoveredBinCount).toBe(plan.totalBinCount)
  })

  it('omits Cartesian phase lines that retained data already covers', () => {
    const firstLinePoints = Array.from({ length: 128 }, (_, index) =>
      point(-500 + index * 7.8125, 0),
    )
    const plan = createKSpaceAutoFillPlan(
      [{ id: 0, points: firstLinePoints }],
      128,
      1,
      false,
    )

    expect(plan.phaseEncodingAmplitudes).toHaveLength(127)
    expect(plan.predictedCoveredBinCount).toBe(plan.totalBinCount)
  })
})
