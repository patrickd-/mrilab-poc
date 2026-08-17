import { describe, expect, it } from 'vitest'
import type { FidEnsembleState } from './fid'
import {
  createDefaultTransmitFrequencyBand,
  DEFAULT_PHASE_ENCODING_PULSES,
  DEFAULT_READOUT_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  DEFAULT_SLICE_SELECTION_PULSES,
  gradientEnsembleMagnetizationStateAt,
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
