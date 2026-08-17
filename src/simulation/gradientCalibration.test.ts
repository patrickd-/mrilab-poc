import { describe, expect, it } from 'vitest'
import {
  DEFAULT_READOUT_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientKSpaceCyclesPerMeterAt,
} from './gradientEncoding'
import { calibrateGradientEncoding } from './gradientCalibration'

describe('gradient encoding calibration', () => {
  it('calibrates a 128 × 128 one-millimeter grid to Cartesian k-space', () => {
    const report = calibrateGradientEncoding()

    expect(report.target.fieldOfViewMillimeters).toBe(128)
    expect(report.target.kSpaceStepCyclesPerMeter).toBeCloseTo(7.8125, 12)
    expect(report.target.minimumKCyclesPerMeter).toBeCloseTo(-500, 12)
    expect(report.target.maximumKCyclesPerMeter).toBeCloseTo(492.1875, 12)
    expect(report.recommended.phaseEncodingLinesCenterOut).toHaveLength(128)
    expect(
      report.recommended.phaseEncodingLinesCenterOut
        .slice(0, 5)
        .map((line) => line.index),
    ).toEqual([0, 1, -1, 2, -2])
    expect(
      new Set(
        report.recommended.phaseEncodingLinesCenterOut.map(
          (line) => line.index,
        ),
      ).size,
    ).toBe(128)
  })

  it('places the recommended readout at the target matrix edges', () => {
    const report = calibrateGradientEncoding()
    const encodingStartTimeMilliseconds =
      DEFAULT_RF_EXCITATION_PULSES[0].end *
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS
    const adcStartTimeMilliseconds =
      DEFAULT_READOUT_PULSES[1].start *
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS
    const adcEndTimeMilliseconds =
      DEFAULT_READOUT_PULSES[1].end *
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS

    const startK = gradientKSpaceCyclesPerMeterAt(
      report.recommended.readoutPulses,
      adcStartTimeMilliseconds,
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
      false,
      encodingStartTimeMilliseconds,
    )
    const endK = gradientKSpaceCyclesPerMeterAt(
      report.recommended.readoutPulses,
      adcEndTimeMilliseconds,
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
      false,
      encodingStartTimeMilliseconds,
    )

    expect(startK).toBeCloseTo(report.target.minimumKCyclesPerMeter, 9)
    expect(endK).toBeCloseTo(
      report.target.readoutUpperEdgeExclusiveCyclesPerMeter,
      9,
    )
    expect(report.recommended.echoCenterTimeMilliseconds).toBeCloseTo(13, 12)
  })

  it('reports sufficient ADC sampling and flags the oversized old defaults', () => {
    const report = calibrateGradientEncoding()

    expect(report.recommended.adcSampleCount).toBe(260)
    expect(report.recommended.readoutOversamplingFactor).toBeGreaterThan(2)
    expect(report.warnings).toContain(
      'The current default phase-encoding line lies outside the target k-space matrix.',
    )
    expect(report.warnings).toContain(
      'The current default readout traverses beyond the target k-space matrix.',
    )
  })

  it('supports alternative matrix, voxel, dwell, and imperfection settings', () => {
    const report = calibrateGradientEncoding({
      adcDwellTimeMilliseconds: 0.1,
      gradientImperfections: true,
      gridSize: 64,
      voxelSizeMillimeters: 2,
    })

    expect(report.target.fieldOfViewMillimeters).toBe(128)
    expect(report.recommended.phaseEncodingLinesCenterOut).toHaveLength(64)
    expect(report.recommended.adcSampleCount).toBe(52)
    expect(report.recommended.readoutPulses[0].amplitude).toBeLessThan(0)
    expect(report.recommended.readoutPulses[1].amplitude).toBeGreaterThan(0)
    expect(report.warnings).toContain(
      'ADC dwell time undersamples the calibrated readout gradient.',
    )
  })

  it('rejects invalid calibration geometry', () => {
    expect(() => calibrateGradientEncoding({ gridSize: 1 })).toThrow(
      /Grid size/,
    )
    expect(() =>
      calibrateGradientEncoding({ voxelSizeMillimeters: 0 }),
    ).toThrow(/Voxel size/)
    expect(() =>
      calibrateGradientEncoding({ adcDwellTimeMilliseconds: 0 }),
    ).toThrow(/ADC dwell/)
  })
})
