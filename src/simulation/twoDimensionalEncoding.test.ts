import { describe, expect, it } from 'vitest'
import { createHydrogenEnsembles } from '../models/HydrogenEnsemble'
import { createFidEnsembleStates } from './fid'
import { maximumEndpointFieldOffsetMillitesla } from './spatialGradient'
import {
  createDefaultTwoDimensionalEncodingGradients,
  effectiveTwoDimensionalGradientVector,
  spatialGradientProfileForKSpaceCoordinate,
  twoDimensionalEncodingDurationMilliseconds,
  twoDimensionalEncodingState,
  twoDimensionalSignalPointAt,
} from './twoDimensionalEncoding'

describe('two-dimensional gradient encoding', () => {
  it('applies the default phase and frequency gradients along orthogonal axes', () => {
    const defaults = createDefaultTwoDimensionalEncodingGradients(128)
    const state = twoDimensionalEncodingState(
      defaults.phase,
      defaults.frequency,
      128,
    )

    expect(state.phaseKxCyclesPerMeter).toBe(0)
    expect(state.phaseKyCyclesPerMeter).toBeGreaterThan(0)
    expect(state.frequencyKxCyclesPerMeter).toBeGreaterThan(0)
    expect(state.frequencyKyCyclesPerMeter).toBe(0)
    expect(state.kxCyclesPerMeter).toBe(
      state.frequencyKxCyclesPerMeter,
    )
    expect(state.kyCyclesPerMeter).toBe(state.phaseKyCyclesPerMeter)
    expect(state.phaseOffsetRadians).toBeCloseTo(0, 12)
  })

  it('omits a disabled stage from the accumulated encoding state', () => {
    const defaults = createDefaultTwoDimensionalEncodingGradients(128)
    const state = twoDimensionalEncodingState(
      defaults.phase,
      defaults.frequency,
      128,
      false,
      true,
    )

    expect(state.kxCyclesPerMeter).toBeGreaterThan(0)
    expect(state.kyCyclesPerMeter).toBe(0)
  })

  it('retains the global phase caused by a uniform field offset', () => {
    const defaults = createDefaultTwoDimensionalEncodingGradients(128)
    defaults.phase.x = {
      startFieldOffsetMillitesla: 0.5,
      endFieldOffsetMillitesla: 0.5,
    }
    const state = twoDimensionalEncodingState(
      defaults.phase,
      defaults.frequency,
      128,
    )

    expect(state.phaseOffsetRadians).not.toBe(0)
  })

  it('reduces two sequential stages to an equivalent final-state field', () => {
    const defaults = createDefaultTwoDimensionalEncodingGradients(128)
    const effective = effectiveTwoDimensionalGradientVector(
      defaults.phase,
      defaults.frequency,
    )

    expect(effective.x.startFieldOffsetMillitesla).toBeCloseTo(-0.64, 12)
    expect(effective.x.endFieldOffsetMillitesla).toBeCloseTo(0.64, 12)
    expect(effective.y.startFieldOffsetMillitesla).toBeCloseTo(-0.64, 12)
    expect(effective.y.endFieldOffsetMillitesla).toBeCloseTo(0.64, 12)

    const frequencyOnly = effectiveTwoDimensionalGradientVector(
      defaults.phase,
      defaults.frequency,
      false,
      true,
    )
    expect(frequencyOnly.x.startFieldOffsetMillitesla).toBeCloseTo(-1.28, 12)
    expect(frequencyOnly.x.endFieldOffsetMillitesla).toBeCloseTo(1.28, 12)
    expect(frequencyOnly.y.startFieldOffsetMillitesla).toBe(0)
    expect(frequencyOnly.y.endFieldOffsetMillitesla).toBe(0)
    expect(twoDimensionalEncodingDurationMilliseconds(true, true)).toBe(0.2)
    expect(twoDimensionalEncodingDurationMilliseconds(true, false)).toBe(0.1)
    expect(twoDimensionalEncodingDurationMilliseconds(false, false)).toBe(0)
  })

  it('samples the tissue-weighted complex signal at the configured k-space coordinate', () => {
    const ensembles = createHydrogenEnsembles(2)
    ensembles.forEach((ensemble) => {
      ensemble.samplePreset = 'cerebrospinal-fluid'
    })
    const states = createFidEnsembleStates(ensembles, 1.5, 'uniform')
    const defaults = createDefaultTwoDimensionalEncodingGradients(2)
    const originEncoding = twoDimensionalEncodingState(
      defaults.phase,
      defaults.frequency,
      2,
      false,
      false,
    )
    const origin = twoDimensionalSignalPointAt(
      states,
      originEncoding,
      0,
      0,
    )

    expect(origin.normalizedInPhaseSignal).toBeCloseTo(1, 12)
    expect(origin.normalizedQuadratureSignal).toBeCloseTo(0, 12)
    expect(origin.normalizedMagnitude).toBeCloseTo(1, 12)

    const halfCycleAcrossSampleColumns = twoDimensionalSignalPointAt(
      states,
      {
        ...originEncoding,
        kxCyclesPerMeter: 500,
      },
      0,
      0.02,
    )
    expect(halfCycleAcrossSampleColumns.normalizedInPhaseSignal).toBeCloseTo(
      0,
      12,
    )
    expect(
      halfCycleAcrossSampleColumns.normalizedQuadratureSignal,
    ).toBeCloseTo(0, 12)
    expect(halfCycleAcrossSampleColumns.normalizedMagnitude).toBeCloseTo(
      0,
      12,
    )

    const encoded = twoDimensionalEncodingState(
      defaults.phase,
      defaults.frequency,
      2,
    )
    const shifted = twoDimensionalSignalPointAt(states, encoded, 0.2, 0.02)
    expect(shifted.kxCyclesPerMeter).toBe(encoded.kxCyclesPerMeter)
    expect(shifted.kyCyclesPerMeter).toBe(encoded.kyCyclesPerMeter)
    expect(shifted.timeMilliseconds).toBe(0.02)
    expect(Number.isFinite(shifted.normalizedMagnitude)).toBe(true)
  })

  it('solves gradient endpoints backward from a requested k-space coordinate', () => {
    const gridSize = 128
    const defaults = createDefaultTwoDimensionalEncodingGradients(gridSize)
    const currentProfile = {
      startFieldOffsetMillitesla:
        defaults.frequency.x.startFieldOffsetMillitesla + 0.2,
      endFieldOffsetMillitesla:
        defaults.frequency.x.endFieldOffsetMillitesla + 0.2,
    }
    const requestedKxCyclesPerMeter = 123
    const profile = spatialGradientProfileForKSpaceCoordinate(
      requestedKxCyclesPerMeter,
      currentProfile,
      gridSize,
      maximumEndpointFieldOffsetMillitesla(gridSize),
    )
    const state = twoDimensionalEncodingState(
      defaults.phase,
      { ...defaults.frequency, x: profile },
      gridSize,
      false,
      true,
    )

    expect(state.kxCyclesPerMeter).toBeCloseTo(
      requestedKxCyclesPerMeter,
      10,
    )
    expect(
      (profile.startFieldOffsetMillitesla +
        profile.endFieldOffsetMillitesla) /
        2,
    ).toBeCloseTo(0.2, 12)
  })
})
