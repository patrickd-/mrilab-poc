import { describe, expect, it } from 'vitest'
import {
  createDefaultTwoDimensionalEncodingGradients,
  twoDimensionalEncodingState,
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
})
