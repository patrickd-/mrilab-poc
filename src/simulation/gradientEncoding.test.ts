import { describe, expect, it } from 'vitest'
import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import type { FidEnsembleState } from './fid'
import {
  appliedGradientAmplitudeAt,
  calibrateRfPulseForFlipAngle,
  copyGradientPulses,
  createDefaultTransmitFrequencyBand,
  DEFAULT_PHASE_ENCODING_PULSES,
  DEFAULT_READOUT_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  DEFAULT_SLICE_SELECTION_PULSES,
  GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientAmplitudeAt,
  gradientEnsembleMagnetizationStateAt,
  gradientPhaseRadiansAt,
  MAXIMUM_GRADIENT_TESLA_PER_METER,
  MAXIMUM_RF_B1_TESLA,
  maximumSliceMappingAngularFrequencyKilradiansPerSecond,
  rfPulseAreaTeslaSecondsAt,
  rfPulseB1TeslaAt,
  rfPulseNominalFlipAngleRadiansAt,
  rfPeakB1TeslaForFlipAngle,
  rfPulseTimeBandwidthProduct,
  sliceMappingAngularFrequencyKilradiansPerSecondAt,
  sliceSelectiveRfMagnetizationAt,
  type GradientPulse,
} from './gradientEncoding'

const GRID_SIZE = 128
const EXCITATION_PULSE = DEFAULT_RF_EXCITATION_PULSES[0]
const DEFAULT_BAND = createDefaultTransmitFrequencyBand(GRID_SIZE)
const MAXIMUM_ANGULAR_FREQUENCY =
  maximumSliceMappingAngularFrequencyKilradiansPerSecond(GRID_SIZE)
describe('gradient waveform primitives', () => {
  it('keeps the default RF, slice, phase, and readout timing relationships', () => {
    const rf = DEFAULT_RF_EXCITATION_PULSES[0]
    const [slicePositive, sliceRephase] =
      DEFAULT_SLICE_SELECTION_PULSES
    const phase = DEFAULT_PHASE_ENCODING_PULSES[0]
    const [readoutPrephase, readoutPositive] = DEFAULT_READOUT_PULSES

    expect(slicePositive.start).toBe(rf.start)
    expect(slicePositive.end).toBe(rf.end)
    expect(sliceRephase.start).toBe(rf.end)
    expect(
      sliceRephase.amplitude * (sliceRephase.end - sliceRephase.start),
    ).toBeCloseTo(
      -0.5 *
        slicePositive.amplitude *
        (slicePositive.end - slicePositive.start),
      12,
    )
    expect(phase.start).toBe(rf.end)
    expect(readoutPrephase.start).toBe(phase.start)
    expect(readoutPrephase.end).toBe(phase.end)
    expect(readoutPositive.start).toBe(readoutPrephase.end)
    expect(readoutPositive.end - readoutPositive.start).toBeCloseTo(
      rf.end - rf.start,
      12,
    )
  })

  it('copies pulse objects rather than sharing mutable references', () => {
    const copied = copyGradientPulses(DEFAULT_READOUT_PULSES)

    expect(copied).toEqual(DEFAULT_READOUT_PULSES)
    expect(copied).not.toBe(DEFAULT_READOUT_PULSES)
    expect(copied[0]).not.toBe(DEFAULT_READOUT_PULSES[0])
    copied[0].amplitude = 0
    expect(DEFAULT_READOUT_PULSES[0].amplitude).toBe(-0.42)
  })

  it('sums overlapping pulses and treats the end boundary as exclusive', () => {
    const pulses: GradientPulse[] = [
      { start: 0.1, end: 0.5, amplitude: 0.7 },
      { start: 0.3, end: 0.6, amplitude: -0.2 },
    ]

    expect(gradientAmplitudeAt(pulses, 0.09)).toBe(0)
    expect(gradientAmplitudeAt(pulses, 0.1)).toBe(0.7)
    expect(gradientAmplitudeAt(pulses, 0.4)).toBeCloseTo(0.5, 12)
    expect(gradientAmplitudeAt(pulses, 0.5)).toBe(-0.2)
    expect(gradientAmplitudeAt(pulses, 0.6)).toBe(0)
  })

  it('clamps ideal applied-gradient sampling to the sequence interval', () => {
    const pulse = [{ start: 0, end: 0.5, amplitude: 0.8 }]

    expect(appliedGradientAmplitudeAt(pulse, -10)).toBe(0.8)
    expect(appliedGradientAmplitudeAt(pulse, 5, 20)).toBe(0.8)
    expect(appliedGradientAmplitudeAt(pulse, 10, 20)).toBe(0)
    expect(appliedGradientAmplitudeAt(pulse, 30, 20)).toBe(0)
  })

  it('models a causal gradient rise and an eddy-current tail', () => {
    const pulse = [{ start: 0.1, end: 0.5, amplitude: 1 }]

    expect(appliedGradientAmplitudeAt(pulse, 2, 20, true)).toBe(0)
    const shortlyAfterStart = appliedGradientAmplitudeAt(
      pulse,
      2.04,
      20,
      true,
    )
    const settled = appliedGradientAmplitudeAt(pulse, 5, 20, true)
    const shortlyAfterEnd = appliedGradientAmplitudeAt(
      pulse,
      10.04,
      20,
      true,
    )
    const lateTail = appliedGradientAmplitudeAt(pulse, 20, 20, true)

    expect(shortlyAfterStart).toBeGreaterThan(0)
    expect(shortlyAfterStart).toBeLessThan(settled)
    expect(settled).toBeGreaterThan(0.95)
    expect(shortlyAfterEnd).toBeGreaterThan(0)
    expect(lateTail).toBeGreaterThan(0)
    expect(lateTail).toBeLessThan(shortlyAfterEnd)
  })
})

describe('slice frequency mapping', () => {
  it('is linear in layer and gradient amplitude', () => {
    const oneLayer = sliceMappingAngularFrequencyKilradiansPerSecondAt(
      1,
      GRID_SIZE,
      0.5,
    )

    expect(oneLayer).toBeCloseTo(
      PROTON_GYROMAGNETIC_RATIO *
        MAXIMUM_GRADIENT_TESLA_PER_METER *
        0.5 *
        1e-6,
      12,
    )
    expect(
      sliceMappingAngularFrequencyKilradiansPerSecondAt(
        10,
        GRID_SIZE,
        0.5,
      ),
    ).toBeCloseTo(oneLayer * 10, 12)
    expect(
      sliceMappingAngularFrequencyKilradiansPerSecondAt(
        10,
        GRID_SIZE,
        1,
      ),
    ).toBeCloseTo(oneLayer * 20, 12)
  })

  it('mirrors the frequency axis for a negative slice gradient', () => {
    expect(
      sliceMappingAngularFrequencyKilradiansPerSecondAt(
        0,
        GRID_SIZE,
        -1,
      ),
    ).toBeCloseTo(MAXIMUM_ANGULAR_FREQUENCY, 12)
    expect(
      sliceMappingAngularFrequencyKilradiansPerSecondAt(
        GRID_SIZE - 1,
        GRID_SIZE,
        -1,
      ),
    ).toBe(0)
  })

  it('builds a 1 mm default band centered on isocenter', () => {
    const center =
      (DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond +
        DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond) /
      2
    const width =
      DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond -
      DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond

    expect(center).toBeCloseTo(
      sliceMappingAngularFrequencyKilradiansPerSecondAt(
        (GRID_SIZE - 1) / 2,
        GRID_SIZE,
        DEFAULT_SLICE_SELECTION_PULSES[0].amplitude,
      ),
      12,
    )
    expect(width).toBeCloseTo(
      PROTON_GYROMAGNETIC_RATIO *
        MAXIMUM_GRADIENT_TESLA_PER_METER *
        DEFAULT_SLICE_SELECTION_PULSES[0].amplitude *
        1e-6,
      12,
    )
  })
})

describe('gradient phase accumulation', () => {
  const CENTER = (GRID_SIZE - 1) / 2
  const FULL_SEQUENCE_PULSE = [{ start: 0, end: 1, amplitude: 1 }]

  it('accumulates only intrinsic offset at spatial isocenter', () => {
    const phase = gradientPhaseRadiansAt(
      CENTER,
      CENTER,
      CENTER,
      GRID_SIZE,
      0.3,
      12,
      FULL_SEQUENCE_PULSE,
      FULL_SEQUENCE_PULSE,
      FULL_SEQUENCE_PULSE,
    )

    expect(phase).toBeCloseTo(3.6, 12)
  })

  it('applies G_RO, G_PE, and G_SS along only their respective axes', () => {
    const expectedOneMillimeterPhase =
      PROTON_GYROMAGNETIC_RATIO *
      MAXIMUM_GRADIENT_TESLA_PER_METER *
      1e-3 *
      0.01
    const phaseAt = (
      column: number,
      row: number,
      layer: number,
      slice: ReadonlyArray<GradientPulse>,
      phase: ReadonlyArray<GradientPulse>,
      readout: ReadonlyArray<GradientPulse>,
    ) =>
      gradientPhaseRadiansAt(
        column,
        row,
        layer,
        GRID_SIZE,
        0,
        10,
        slice,
        phase,
        readout,
      )

    expect(
      phaseAt(CENTER + 1, CENTER, CENTER, [], [], FULL_SEQUENCE_PULSE),
    ).toBeCloseTo(expectedOneMillimeterPhase, 12)
    expect(
      phaseAt(CENTER, CENTER - 1, CENTER, [], FULL_SEQUENCE_PULSE, []),
    ).toBeCloseTo(expectedOneMillimeterPhase, 12)
    expect(
      phaseAt(CENTER, CENTER, CENTER + 1, FULL_SEQUENCE_PULSE, [], []),
    ).toBeCloseTo(expectedOneMillimeterPhase, 12)
    expect(
      phaseAt(CENTER + 1, CENTER, CENTER, FULL_SEQUENCE_PULSE, [], []),
    ).toBe(0)
  })

  it('reverses phase with position or gradient polarity', () => {
    const positivePosition = gradientPhaseRadiansAt(
      CENTER + 1,
      CENTER,
      CENTER,
      GRID_SIZE,
      0,
      10,
      [],
      [],
      FULL_SEQUENCE_PULSE,
    )
    const negativePosition = gradientPhaseRadiansAt(
      CENTER - 1,
      CENTER,
      CENTER,
      GRID_SIZE,
      0,
      10,
      [],
      [],
      FULL_SEQUENCE_PULSE,
    )
    const negativeGradient = gradientPhaseRadiansAt(
      CENTER + 1,
      CENTER,
      CENTER,
      GRID_SIZE,
      0,
      10,
      [],
      [],
      [{ start: 0, end: 1, amplitude: -1 }],
    )

    expect(negativePosition).toBeCloseTo(-positivePosition, 12)
    expect(negativeGradient).toBeCloseTo(-positivePosition, 12)
  })

  it('subtracts gradient area and intrinsic evolution before phase start', () => {
    const phase = gradientPhaseRadiansAt(
      CENTER + 1,
      CENTER,
      CENTER,
      GRID_SIZE,
      0.4,
      20,
      [],
      [],
      [{ start: 0, end: 0.5, amplitude: 1 }],
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
      false,
      10,
    )

    expect(phase).toBeCloseTo(4, 12)
  })

  it('uses the causal applied-gradient area when imperfections are enabled', () => {
    const ideal = gradientPhaseRadiansAt(
      CENTER + 1,
      CENTER,
      CENTER,
      GRID_SIZE,
      0,
      5,
      [],
      [],
      FULL_SEQUENCE_PULSE,
      20,
      false,
    )
    const imperfect = gradientPhaseRadiansAt(
      CENTER + 1,
      CENTER,
      CENTER,
      GRID_SIZE,
      0,
      5,
      [],
      [],
      FULL_SEQUENCE_PULSE,
      20,
      true,
    )

    expect(imperfect).toBeGreaterThan(0)
    expect(imperfect).toBeLessThan(ideal)
  })
})

function reverseSliceGradient() {
  return DEFAULT_SLICE_SELECTION_PULSES.map((pulse) => ({
    ...pulse,
    amplitude: -pulse.amplitude,
  }))
}

function stateAtLayer(layer: number): FidEnsembleState {
  return {
    index: 0,
    column: 64,
    row: 64,
    layer,
    gridSize: GRID_SIZE,
    equilibriumMagnetization: 1,
    longitudinalRelaxationTimeMilliseconds: 1200,
    transverseRelaxationTimeMilliseconds: 84,
    angularFrequencyOffsetRadiansPerMillisecond: 0,
    fieldVariationTesla: 0,
    fieldVariationPpm: 0,
    fieldTiltAngleRadians: 0,
    fieldDirection: { x: 0, y: 0, z: 1 },
    transmitFieldScale: 1,
    spinPackets: [
      {
        offsetXMillimeters: 0,
        offsetYMillimeters: 0,
        angularFrequencyOffsetRadiansPerMillisecond: 0,
        weight: 1,
      },
    ],
  }
}

describe('windowed-sinc RF excitation', () => {
  it('uses the configured bandwidth for a symmetric sinc envelope', () => {
    const pulse = DEFAULT_RF_EXCITATION_PULSES[0]
    const centerMilliseconds =
      ((pulse.start + pulse.end) / 2) *
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS
    const bandwidthRadiansPerMillisecond =
      DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond -
      DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond
    const firstZeroOffsetMilliseconds =
      (2 * Math.PI) / bandwidthRadiansPerMillisecond

    expect(
      rfPulseB1TeslaAt(pulse, DEFAULT_BAND, centerMilliseconds),
    ).toBeCloseTo(pulse.amplitude * MAXIMUM_RF_B1_TESLA, 15)
    expect(
      rfPulseB1TeslaAt(
        pulse,
        DEFAULT_BAND,
        centerMilliseconds - firstZeroOffsetMilliseconds,
      ),
    ).toBeCloseTo(0, 15)
    expect(
      rfPulseB1TeslaAt(
        pulse,
        DEFAULT_BAND,
        centerMilliseconds - 0.7,
      ),
    ).toBeCloseTo(
      rfPulseB1TeslaAt(
        pulse,
        DEFAULT_BAND,
        centerMilliseconds + 0.7,
      ),
      15,
    )
  })

  it('calibrates the default physical pulse to 90 degrees', () => {
    const pulse = DEFAULT_RF_EXCITATION_PULSES[0]

    expect(rfPulseTimeBandwidthProduct(pulse, DEFAULT_BAND)).toBeCloseTo(
      3.8524,
      3,
    )
    expect(pulse.amplitude * MAXIMUM_RF_B1_TESLA * 1e6).toBeCloseTo(
      4.334,
      3,
    )
    expect(rfPulseNominalFlipAngleRadiansAt(pulse, DEFAULT_BAND)).toBeCloseTo(
      Math.PI / 2,
      8,
    )
  })

  it('derives flip angle linearly from RF area and peak B1', () => {
    const pulse = DEFAULT_RF_EXCITATION_PULSES[0]
    const halfAmplitudePulse = { ...pulse, amplitude: pulse.amplitude / 2 }

    expect(
      rfPulseAreaTeslaSecondsAt(halfAmplitudePulse, DEFAULT_BAND),
    ).toBeCloseTo(rfPulseAreaTeslaSecondsAt(pulse, DEFAULT_BAND) / 2, 15)
    expect(
      rfPulseNominalFlipAngleRadiansAt(halfAmplitudePulse, DEFAULT_BAND),
    ).toBeCloseTo(Math.PI / 4, 8)
  })

  it('under-flips when shortened without increasing peak B1', () => {
    const pulse = DEFAULT_RF_EXCITATION_PULSES[0]
    const shortenedPulse = {
      ...pulse,
      end: pulse.start + (pulse.end - pulse.start) / 2,
    }
    const shortenedFlip = rfPulseNominalFlipAngleRadiansAt(
      shortenedPulse,
      DEFAULT_BAND,
    )

    expect(shortenedFlip).toBeLessThan(Math.PI / 2)
    expect(shortenedFlip).toBeGreaterThan(0)
    expect(
      calibrateRfPulseForFlipAngle(shortenedPulse, DEFAULT_BAND).amplitude,
    ).toBeGreaterThan(shortenedPulse.amplitude)
  })

  it('calibrates a five-millimeter slice within the scanner-scale B1 limit', () => {
    const center =
      (DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond +
        DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond) /
      2
    const defaultWidth =
      DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond -
      DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond
    const fiveMillimeterBand = {
      lowerAngularFrequencyKilradiansPerSecond:
        center - (defaultWidth * 5) / 2,
      upperAngularFrequencyKilradiansPerSecond:
        center + (defaultWidth * 5) / 2,
    }
    const requiredPeakB1 = rfPeakB1TeslaForFlipAngle(
      EXCITATION_PULSE,
      fiveMillimeterBand,
    )
    const calibrated = calibrateRfPulseForFlipAngle(
      { ...EXCITATION_PULSE, amplitude: 1 },
      fiveMillimeterBand,
    )

    expect(requiredPeakB1 * 1e6).toBeCloseTo(21.76, 1)
    expect(requiredPeakB1).toBeLessThan(MAXIMUM_RF_B1_TESLA)
    expect(calibrated.amplitude).toBeLessThan(1)
    expect(
      rfPulseNominalFlipAngleRadiansAt(
        calibrated,
        fiveMillimeterBand,
      ),
    ).toBeCloseTo(Math.PI / 2, 8)
  })

  it('reports when a very wide slice exceeds the peak B1 limit', () => {
    const center =
      (DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond +
        DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond) /
      2
    const defaultWidth =
      DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond -
      DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond
    const eightMillimeterBand = {
      lowerAngularFrequencyKilradiansPerSecond:
        center - defaultWidth * 4,
      upperAngularFrequencyKilradiansPerSecond:
        center + defaultWidth * 4,
    }
    const requiredPeakB1 = rfPeakB1TeslaForFlipAngle(
      EXCITATION_PULSE,
      eightMillimeterBand,
    )
    const limited = calibrateRfPulseForFlipAngle(
      { ...EXCITATION_PULSE, amplitude: 1 },
      eightMillimeterBand,
    )

    expect(requiredPeakB1).toBeGreaterThan(MAXIMUM_RF_B1_TESLA)
    expect(limited.amplitude).toBe(1)
    expect(
      rfPulseNominalFlipAngleRadiansAt(limited, eightMillimeterBand),
    ).toBeLessThan(Math.PI / 2)
  })
})

describe('slice-selective Bloch evolution', () => {
  const effectivelyNoRelaxation = {
    longitudinalRelaxationTimeMilliseconds: 1e12,
    transverseRelaxationTimeMilliseconds: 1e12,
  }
  const packet = stateAtLayer(0).spinPackets[0]
  const rfEndMilliseconds =
    EXCITATION_PULSE.end * GRADIENT_SEQUENCE_DURATION_MILLISECONDS
  const rephasingEndMilliseconds =
    DEFAULT_SLICE_SELECTION_PULSES[1].end *
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS

  function rfStateAt(
    layer: number,
    timeMilliseconds: number,
    band = DEFAULT_BAND,
    slicePulses: ReadonlyArray<GradientPulse> =
      DEFAULT_SLICE_SELECTION_PULSES,
    maximumStepMilliseconds = 0.02,
  ) {
    const state = {
      ...stateAtLayer(layer),
      ...effectivelyNoRelaxation,
    }
    return sliceSelectiveRfMagnetizationAt(
      state,
      packet,
      timeMilliseconds,
      EXCITATION_PULSE,
      band,
      slicePulses,
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
      false,
      maximumStepMilliseconds,
    )
  }

  function encodedStateAt(
    layer: number,
    timeMilliseconds: number,
    slicePulses: ReadonlyArray<GradientPulse> =
      DEFAULT_SLICE_SELECTION_PULSES,
    band = DEFAULT_BAND,
  ) {
    return gradientEnsembleMagnetizationStateAt(
      { ...stateAtLayer(layer), ...effectivelyNoRelaxation },
      timeMilliseconds,
      DEFAULT_RF_EXCITATION_PULSES,
      band,
      slicePulses,
      [],
      [],
    )
  }

  it('reaches approximately 90 degrees at slice center', () => {
    const magnetization = rfStateAt(63.5, rfEndMilliseconds)

    expect(magnetization.nominalFlipAngleRadians).toBeCloseTo(Math.PI / 2, 8)
    expect(magnetization.xFraction).toBeCloseTo(1, 4)
    expect(magnetization.yFraction).toBeCloseTo(0, 4)
    expect(magnetization.zFraction).toBeCloseTo(0, 4)
  })

  it('reaches 90 degrees in the Bloch solver for a calibrated five-millimeter slice', () => {
    const centerFrequency =
      (DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond +
        DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond) /
      2
    const defaultBandwidth =
      DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond -
      DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond
    const fiveMillimeterBand = {
      lowerAngularFrequencyKilradiansPerSecond:
        centerFrequency - (defaultBandwidth * 5) / 2,
      upperAngularFrequencyKilradiansPerSecond:
        centerFrequency + (defaultBandwidth * 5) / 2,
    }
    const calibratedPulse = calibrateRfPulseForFlipAngle(
      { ...EXCITATION_PULSE, amplitude: 1 },
      fiveMillimeterBand,
    )
    const state = {
      ...stateAtLayer(63.5),
      ...effectivelyNoRelaxation,
    }
    const magnetization = sliceSelectiveRfMagnetizationAt(
      state,
      packet,
      rfEndMilliseconds,
      calibratedPulse,
      fiveMillimeterBand,
      DEFAULT_SLICE_SELECTION_PULSES,
    )

    expect(magnetization.xFraction).toBeCloseTo(1, 4)
    expect(magnetization.yFraction).toBeCloseTo(0, 4)
    expect(magnetization.zFraction).toBeCloseTo(0, 4)
  })

  it('tilts progressively according to accumulated sinc area', () => {
    const midpointMilliseconds =
      ((EXCITATION_PULSE.start + EXCITATION_PULSE.end) / 2) *
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS
    const magnetization = rfStateAt(63.5, midpointMilliseconds)

    expect(magnetization.nominalFlipAngleRadians).toBeCloseTo(Math.PI / 4, 5)
    expect(magnetization.xFraction).toBeCloseTo(Math.SQRT1_2, 4)
    expect(magnetization.zFraction).toBeCloseTo(Math.SQRT1_2, 4)
  })

  it('shows through-slice phase dispersion while RF and GSS overlap', () => {
    const lateRfTime = rfEndMilliseconds - 0.5
    const below = rfStateAt(63.25, lateRfTime)
    const above = rfStateAt(63.75, lateRfTime)
    const belowPhase = Math.atan2(below.yFraction, below.xFraction)
    const abovePhase = Math.atan2(above.yFraction, above.xFraction)

    expect(Math.abs(belowPhase - abovePhase)).toBeGreaterThan(0.2)
    expect(belowPhase * abovePhase).toBeLessThan(0)
  })

  it('returns far out-of-band layers close to longitudinal equilibrium', () => {
    const magnetization = rfStateAt(0, rfEndMilliseconds)

    expect(Math.hypot(magnetization.xFraction, magnetization.yFraction)).toBeLessThan(
      0.02,
    )
    expect(magnetization.zFraction).toBeGreaterThan(0.99)
  })

  it('moves and mirrors the selected slice with RF center and GSS sign', () => {
    const angularFrequencyPerLayer =
      sliceMappingAngularFrequencyKilradiansPerSecondAt(
        1,
        GRID_SIZE,
        DEFAULT_SLICE_SELECTION_PULSES[0].amplitude,
      )
    const movedBand = {
      lowerAngularFrequencyKilradiansPerSecond:
        angularFrequencyPerLayer * 79.5,
      upperAngularFrequencyKilradiansPerSecond:
        angularFrequencyPerLayer * 80.5,
    }
    const positiveSelected = rfStateAt(80, rfEndMilliseconds, movedBand)
    const positiveRejected = rfStateAt(70, rfEndMilliseconds, movedBand)
    const negativeSelected = rfStateAt(
      47,
      rfEndMilliseconds,
      movedBand,
      reverseSliceGradient(),
    )

    expect(Math.hypot(positiveSelected.xFraction, positiveSelected.yFraction)).toBeGreaterThan(
      0.8,
    )
    expect(Math.hypot(negativeSelected.xFraction, negativeSelected.yFraction)).toBeGreaterThan(
      0.8,
    )
    expect(Math.hypot(positiveRejected.xFraction, positiveRejected.yFraction)).toBeLessThan(
      0.1,
    )
  })

  it('uses the half-area negative GSS lobe to reduce the slice phase slope', () => {
    const phaseDifference = (
      timeMilliseconds: number,
      pulses = DEFAULT_SLICE_SELECTION_PULSES,
    ) => {
      const below = encodedStateAt(63.25, timeMilliseconds, pulses)
      const above = encodedStateAt(63.75, timeMilliseconds, pulses)
      return Math.abs(
        Math.atan2(below.yFraction, below.xFraction) -
          Math.atan2(above.yFraction, above.xFraction),
      )
    }
    const atRfEnd = phaseDifference(rfEndMilliseconds)
    const afterCorrectRephasing = phaseDifference(rephasingEndMilliseconds)
    const insufficientRephasing = DEFAULT_SLICE_SELECTION_PULSES.map(
      (pulse, index) =>
        index === 1
          ? {
              ...pulse,
              amplitude: DEFAULT_SLICE_SELECTION_PULSES[0].amplitude * -0.5,
            }
          : pulse,
    )
    const afterInsufficientRephasing = phaseDifference(
      rephasingEndMilliseconds,
      insufficientRephasing,
    )

    expect(atRfEnd).toBeGreaterThan(0.2)
    expect(afterCorrectRephasing).toBeLessThan(atRfEnd * 0.25)
    expect(afterInsufficientRephasing).toBeGreaterThan(
      afterCorrectRephasing * 2,
    )
  })

  it('converges as the Bloch integration step is refined', () => {
    const coarse = rfStateAt(63.25, rfEndMilliseconds, DEFAULT_BAND, DEFAULT_SLICE_SELECTION_PULSES, 0.04)
    const medium = rfStateAt(63.25, rfEndMilliseconds, DEFAULT_BAND, DEFAULT_SLICE_SELECTION_PULSES, 0.02)
    const fine = rfStateAt(63.25, rfEndMilliseconds, DEFAULT_BAND, DEFAULT_SLICE_SELECTION_PULSES, 0.01)
    const distance = (
      first: typeof coarse,
      second: typeof coarse,
    ) =>
      Math.hypot(
        first.xFraction - second.xFraction,
        first.yFraction - second.yFraction,
        first.zFraction - second.zFraction,
      )

    expect(distance(medium, fine)).toBeLessThan(distance(coarse, medium))
    expect(distance(medium, fine)).toBeLessThan(2e-3)
  })
})

describe('gradient-encoding magnetization state', () => {
  function centeredState(overrides: Partial<FidEnsembleState> = {}) {
    return {
      ...stateAtLayer((GRID_SIZE - 1) / 2),
      column: (GRID_SIZE - 1) / 2,
      row: (GRID_SIZE - 1) / 2,
      ...overrides,
    }
  }

  it('stays at equilibrium before the RF interval begins', () => {
    const magnetization = gradientEnsembleMagnetizationStateAt(
      centeredState(),
      1.5,
      DEFAULT_RF_EXCITATION_PULSES,
      DEFAULT_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(magnetization).toEqual({
      excited: false,
      xFraction: 0,
      yFraction: 0,
      zFraction: 1,
      transverseFraction: 0,
      longitudinalFraction: 1,
      precessionPhaseRadians: 0,
      flipAngleRadians: 0,
    })
  })

  it('tilts progressively throughout the RF interval', () => {
    const rf = DEFAULT_RF_EXCITATION_PULSES[0]
    const midpointMilliseconds =
      ((rf.start + rf.end) / 2) *
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS
    const magnetization = gradientEnsembleMagnetizationStateAt(
      centeredState(),
      midpointMilliseconds,
      DEFAULT_RF_EXCITATION_PULSES,
      DEFAULT_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(magnetization.excited).toBe(true)
    expect(magnetization.flipAngleRadians).toBeCloseTo(Math.PI / 4, 5)
    expect(magnetization.transverseFraction).toBeCloseTo(Math.SQRT1_2, 2)
    expect(magnetization.longitudinalFraction).toBeCloseTo(Math.SQRT1_2, 2)
  })

  it('does not tilt an ensemble outside the selected transmit band', () => {
    const magnetization = gradientEnsembleMagnetizationStateAt(
      centeredState({ layer: 0 }),
      4,
      DEFAULT_RF_EXCITATION_PULSES,
      DEFAULT_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(magnetization.excited).toBe(false)
    expect(magnetization.transverseFraction).toBeLessThan(0.02)
    expect(magnetization.longitudinalFraction).toBeGreaterThan(0.99)
  })

  it('applies T2 decay and T1 recovery after excitation', () => {
    const rfEndMilliseconds =
      DEFAULT_RF_EXCITATION_PULSES[0].end *
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS
    const magnetization = gradientEnsembleMagnetizationStateAt(
      centeredState({
        transverseRelaxationTimeMilliseconds: 10,
        longitudinalRelaxationTimeMilliseconds: 20,
      }),
      rfEndMilliseconds + 10,
      DEFAULT_RF_EXCITATION_PULSES,
      DEFAULT_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    const atRfEnd = gradientEnsembleMagnetizationStateAt(
      centeredState({
        transverseRelaxationTimeMilliseconds: 10,
        longitudinalRelaxationTimeMilliseconds: 20,
      }),
      rfEndMilliseconds,
      DEFAULT_RF_EXCITATION_PULSES,
      DEFAULT_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )
    expect(magnetization.transverseFraction).toBeCloseTo(
      atRfEnd.transverseFraction * Math.exp(-1),
      8,
    )
    expect(magnetization.longitudinalFraction).toBeCloseTo(
      1 + (atRfEnd.longitudinalFraction - 1) * Math.exp(-0.5),
      8,
    )
  })

  it('represents a negative RF amplitude on the opposite transverse side', () => {
    const negativeRf = DEFAULT_RF_EXCITATION_PULSES.map((pulse) => ({
      ...pulse,
      amplitude: -pulse.amplitude,
    }))
    const rf = negativeRf[0]
    const midpointMilliseconds =
      ((rf.start + rf.end) / 2) *
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS
    const magnetization = gradientEnsembleMagnetizationStateAt(
      centeredState(),
      midpointMilliseconds,
      negativeRf,
      DEFAULT_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(magnetization.xFraction).toBeLessThan(0)
    expect(Math.abs(magnetization.precessionPhaseRadians)).toBeCloseTo(
      Math.PI,
      2,
    )
    expect(magnetization.longitudinalFraction).toBeCloseTo(Math.SQRT1_2, 2)
  })

  it('gives opposite readout phase to positions on opposite sides of isocenter', () => {
    const positiveX = gradientEnsembleMagnetizationStateAt(
      centeredState({ column: 70 }),
      12,
      DEFAULT_RF_EXCITATION_PULSES,
      DEFAULT_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )
    const negativeX = gradientEnsembleMagnetizationStateAt(
      centeredState({ column: 57 }),
      12,
      DEFAULT_RF_EXCITATION_PULSES,
      DEFAULT_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(positiveX.precessionPhaseRadians).toBeCloseTo(
      -negativeX.precessionPhaseRadians,
      10,
    )
    expect(positiveX.transverseFraction).toBeCloseTo(
      negativeX.transverseFraction,
      12,
    )
  })
})
