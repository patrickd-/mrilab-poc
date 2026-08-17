import { describe, expect, it } from 'vitest'
import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import type { FidEnsembleState } from './fid'
import {
  appliedGradientAmplitudeAt,
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
  maximumSliceMappingAngularFrequencyKilradiansPerSecond,
  sliceMappingAngularFrequencyKilradiansPerSecondAt,
  sliceSelectionExcitationScaleAt,
  type GradientPulse,
  type TransmitFrequencyBand,
} from './gradientEncoding'

const GRID_SIZE = 128
const EXCITATION_PULSE = DEFAULT_RF_EXCITATION_PULSES[0]
const DEFAULT_BAND = createDefaultTransmitFrequencyBand(GRID_SIZE)
const MAXIMUM_ANGULAR_FREQUENCY =
  maximumSliceMappingAngularFrequencyKilradiansPerSecond(GRID_SIZE)
const FULL_BAND: TransmitFrequencyBand = {
  lowerAngularFrequencyKilradiansPerSecond: 0,
  upperAngularFrequencyKilradiansPerSecond: MAXIMUM_ANGULAR_FREQUENCY,
}

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

function excitationScale(
  layer: number,
  band = DEFAULT_BAND,
  sliceSelectionPulses: ReadonlyArray<GradientPulse> =
    DEFAULT_SLICE_SELECTION_PULSES,
) {
  return sliceSelectionExcitationScaleAt(
    layer,
    GRID_SIZE,
    EXCITATION_PULSE,
    band,
    sliceSelectionPulses,
  )
}

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

describe('slice-selection transmit bandwidth', () => {
  it('selects the 1 mm isocenter plane by default', () => {
    expect(excitationScale(63.5)).toBe(1)
    expect(excitationScale(63)).toBe(0)
    expect(excitationScale(64)).toBe(0)
  })

  it('selects the complete volume when the band covers the full graph', () => {
    for (let layer = 0; layer < GRID_SIZE; layer += 1) {
      expect(excitationScale(layer, FULL_BAND)).toBe(1)
    }
    expect(excitationScale(63.5, FULL_BAND)).toBe(1)
  })

  it('rejects a band that does not cross the active GSS frequency span', () => {
    const outOfRangeBand = {
      lowerAngularFrequencyKilradiansPerSecond:
        MAXIMUM_ANGULAR_FREQUENCY * 0.75,
      upperAngularFrequencyKilradiansPerSecond:
        MAXIMUM_ANGULAR_FREQUENCY * 0.9,
    }

    for (let layer = 0; layer < GRID_SIZE; layer += 1) {
      expect(excitationScale(layer, outOfRangeBand)).toBe(0)
    }
  })

  it('moves the selected layer with the transmit band', () => {
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

    expect(excitationScale(80, movedBand)).toBe(1)
    expect(excitationScale(70, movedBand)).toBe(0)
  })

  it('mirrors the spatial mapping when GSS is reversed', () => {
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

    expect(excitationScale(47, movedBand, reverseSliceGradient())).toBe(1)
    expect(excitationScale(80, movedBand, reverseSliceGradient())).toBe(0)
  })

  it('selects the whole volume at zero GSS only when the band contains zero', () => {
    const zeroGradient = DEFAULT_SLICE_SELECTION_PULSES.map((pulse) => ({
      ...pulse,
      amplitude: 0,
    }))

    expect(excitationScale(20, DEFAULT_BAND, zeroGradient)).toBe(0)
    expect(
      excitationScale(
        20,
        {
          lowerAngularFrequencyKilradiansPerSecond: 0,
          upperAngularFrequencyKilradiansPerSecond: 0.2,
        },
        zeroGradient,
      ),
    ).toBe(1)
  })

  it('produces transverse magnetization for a full-band RF pulse', () => {
    const magnetization = gradientEnsembleMagnetizationStateAt(
      stateAtLayer(127),
      4,
      DEFAULT_RF_EXCITATION_PULSES,
      FULL_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(magnetization.excited).toBe(true)
    expect(magnetization.transverseFraction).toBeGreaterThan(0)
    expect(magnetization.longitudinalFraction).toBeLessThan(1)
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
      FULL_BAND,
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
      FULL_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(magnetization.excited).toBe(true)
    expect(magnetization.flipAngleRadians).toBeCloseTo(Math.PI / 4, 12)
    expect(magnetization.transverseFraction).toBeCloseTo(Math.SQRT1_2, 12)
    expect(magnetization.longitudinalFraction).toBeCloseTo(Math.SQRT1_2, 12)
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
    expect(magnetization.transverseFraction).toBe(0)
    expect(magnetization.longitudinalFraction).toBe(1)
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
      FULL_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(magnetization.transverseFraction).toBeCloseTo(Math.exp(-1), 12)
    expect(magnetization.longitudinalFraction).toBeCloseTo(
      1 - Math.exp(-0.5),
      12,
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
      FULL_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )

    expect(magnetization.xFraction).toBeLessThan(0)
    expect(magnetization.precessionPhaseRadians).toBe(Math.PI)
    expect(magnetization.longitudinalFraction).toBeCloseTo(Math.SQRT1_2, 12)
  })

  it('gives opposite readout phase to positions on opposite sides of isocenter', () => {
    const positiveX = gradientEnsembleMagnetizationStateAt(
      centeredState({ column: 70 }),
      12,
      DEFAULT_RF_EXCITATION_PULSES,
      FULL_BAND,
      DEFAULT_SLICE_SELECTION_PULSES,
      DEFAULT_PHASE_ENCODING_PULSES,
      DEFAULT_READOUT_PULSES,
    )
    const negativeX = gradientEnsembleMagnetizationStateAt(
      centeredState({ column: 57 }),
      12,
      DEFAULT_RF_EXCITATION_PULSES,
      FULL_BAND,
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
