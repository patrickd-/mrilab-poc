import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import type {
  FidEnsembleMagnetizationState,
  FidEnsembleState,
} from './fid'

export interface GradientPulse {
  start: number
  end: number
  amplitude: number
}

export const GRADIENT_SEQUENCE_DURATION_MILLISECONDS = 20
export const MAXIMUM_GRADIENT_TESLA_PER_METER = 1e-3

export const DEFAULT_PHASE_ENCODING_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.12, end: 0.32, amplitude: 0.52 },
]

export const DEFAULT_READOUT_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.12, end: 0.32, amplitude: -0.42 },
  { start: 0.32, end: 0.72, amplitude: 0.52 },
]

export function copyGradientPulses(
  pulses: ReadonlyArray<GradientPulse>,
) {
  return pulses.map((pulse) => ({ ...pulse }))
}

function normalizedPulseAreaAt(
  pulses: ReadonlyArray<GradientPulse>,
  normalizedTime: number,
) {
  return pulses.reduce((area, pulse) => {
    const elapsedPulseFraction = Math.max(
      0,
      Math.min(normalizedTime, pulse.end) - pulse.start,
    )
    return area + pulse.amplitude * elapsedPulseFraction
  }, 0)
}

export function gradientAmplitudeAt(
  pulses: ReadonlyArray<GradientPulse>,
  normalizedTime: number,
) {
  return pulses.reduce(
    (amplitude, pulse) =>
      normalizedTime >= pulse.start && normalizedTime < pulse.end
        ? amplitude + pulse.amplitude
        : amplitude,
    0,
  )
}

export function gradientEnsembleMagnetizationStateAt(
  state: FidEnsembleState,
  timeMilliseconds: number,
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
): FidEnsembleMagnetizationState {
  const boundedTimeMilliseconds = Math.min(
    durationMilliseconds,
    Math.max(0, timeMilliseconds),
  )
  const normalizedTime = boundedTimeMilliseconds / durationMilliseconds
  const phaseEncodingAreaSeconds =
    normalizedPulseAreaAt(phaseEncodingPulses, normalizedTime) *
    (durationMilliseconds / 1000)
  const readoutAreaSeconds =
    normalizedPulseAreaAt(readoutPulses, normalizedTime) *
    (durationMilliseconds / 1000)
  const gridCenter = (state.gridSize - 1) / 2
  const positionXMeters = (state.column - gridCenter) * 1e-3
  const positionYMeters = (gridCenter - state.row) * 1e-3
  const gradientPhaseRadians =
    PROTON_GYROMAGNETIC_RATIO *
    MAXIMUM_GRADIENT_TESLA_PER_METER *
    (positionXMeters * readoutAreaSeconds +
      positionYMeters * phaseEncodingAreaSeconds)
  const precessionPhaseRadians =
    state.angularFrequencyOffsetRadiansPerMillisecond *
      boundedTimeMilliseconds +
    gradientPhaseRadians
  const transverseFraction =
    state.transverseRelaxationTimeMilliseconds === 0
      ? 0
      : Math.exp(
          -boundedTimeMilliseconds /
            state.transverseRelaxationTimeMilliseconds,
        )
  const longitudinalFraction =
    state.longitudinalRelaxationTimeMilliseconds === 0
      ? 1
      : 1 -
        Math.exp(
          -boundedTimeMilliseconds /
            state.longitudinalRelaxationTimeMilliseconds,
        )

  return {
    excited: true,
    xFraction: transverseFraction * Math.cos(precessionPhaseRadians),
    yFraction: transverseFraction * Math.sin(precessionPhaseRadians),
    zFraction: longitudinalFraction,
    transverseFraction,
    longitudinalFraction,
    precessionPhaseRadians,
    flipAngleRadians: Math.atan2(
      transverseFraction,
      longitudinalFraction,
    ),
  }
}
