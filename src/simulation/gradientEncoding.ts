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
const GRADIENT_FAST_RESPONSE_TIME_MILLISECONDS = 0.04
const GRADIENT_EDDY_RESPONSE_TIME_MILLISECONDS = 0.8
const GRADIENT_EDDY_RESPONSE_FRACTION = 0.04

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

function gradientStepResponse(elapsedMilliseconds: number) {
  if (elapsedMilliseconds <= 0) return 0

  return (
    1 -
    (1 - GRADIENT_EDDY_RESPONSE_FRACTION) *
      Math.exp(
        -elapsedMilliseconds / GRADIENT_FAST_RESPONSE_TIME_MILLISECONDS,
      ) -
    GRADIENT_EDDY_RESPONSE_FRACTION *
      Math.exp(
        -elapsedMilliseconds / GRADIENT_EDDY_RESPONSE_TIME_MILLISECONDS,
      )
  )
}

function integratedGradientStepResponse(elapsedMilliseconds: number) {
  if (elapsedMilliseconds <= 0) return 0

  return (
    elapsedMilliseconds -
    (1 - GRADIENT_EDDY_RESPONSE_FRACTION) *
      GRADIENT_FAST_RESPONSE_TIME_MILLISECONDS *
      (1 -
        Math.exp(
          -elapsedMilliseconds /
            GRADIENT_FAST_RESPONSE_TIME_MILLISECONDS,
        )) -
    GRADIENT_EDDY_RESPONSE_FRACTION *
      GRADIENT_EDDY_RESPONSE_TIME_MILLISECONDS *
      (1 -
        Math.exp(
          -elapsedMilliseconds /
            GRADIENT_EDDY_RESPONSE_TIME_MILLISECONDS,
        ))
  )
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

export function appliedGradientAmplitudeAt(
  pulses: ReadonlyArray<GradientPulse>,
  timeMilliseconds: number,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  imperfections = false,
) {
  const boundedTimeMilliseconds = Math.min(
    durationMilliseconds,
    Math.max(0, timeMilliseconds),
  )
  if (!imperfections) {
    return gradientAmplitudeAt(
      pulses,
      boundedTimeMilliseconds / durationMilliseconds,
    )
  }

  return pulses.reduce((amplitude, pulse) => {
    const startMilliseconds = pulse.start * durationMilliseconds
    const endMilliseconds = pulse.end * durationMilliseconds
    return (
      amplitude +
      pulse.amplitude *
        (gradientStepResponse(
          boundedTimeMilliseconds - startMilliseconds,
        ) -
          gradientStepResponse(
            boundedTimeMilliseconds - endMilliseconds,
          ))
    )
  }, 0)
}

function gradientAreaSecondsAt(
  pulses: ReadonlyArray<GradientPulse>,
  timeMilliseconds: number,
  durationMilliseconds: number,
  imperfections: boolean,
) {
  if (!imperfections) {
    return (
      normalizedPulseAreaAt(
        pulses,
        timeMilliseconds / durationMilliseconds,
      ) *
      (durationMilliseconds / 1000)
    )
  }

  const areaMilliseconds = pulses.reduce((area, pulse) => {
    const startMilliseconds = pulse.start * durationMilliseconds
    const endMilliseconds = pulse.end * durationMilliseconds
    return (
      area +
      pulse.amplitude *
        (integratedGradientStepResponse(
          timeMilliseconds - startMilliseconds,
        ) -
          integratedGradientStepResponse(
            timeMilliseconds - endMilliseconds,
          ))
    )
  }, 0)

  return areaMilliseconds / 1000
}

export function gradientPhaseRadiansAt(
  column: number,
  row: number,
  gridSize: number,
  angularFrequencyOffsetRadiansPerMillisecond: number,
  timeMilliseconds: number,
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientImperfections = false,
) {
  const boundedTimeMilliseconds = Math.min(
    durationMilliseconds,
    Math.max(0, timeMilliseconds),
  )
  const phaseEncodingAreaSeconds =
    gradientAreaSecondsAt(
      phaseEncodingPulses,
      boundedTimeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
    )
  const readoutAreaSeconds =
    gradientAreaSecondsAt(
      readoutPulses,
      boundedTimeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
    )
  const gridCenter = (gridSize - 1) / 2
  const positionXMeters = (column - gridCenter) * 1e-3
  const positionYMeters = (gridCenter - row) * 1e-3
  const gradientPhaseRadians =
    PROTON_GYROMAGNETIC_RATIO *
    MAXIMUM_GRADIENT_TESLA_PER_METER *
    (positionXMeters * readoutAreaSeconds +
      positionYMeters * phaseEncodingAreaSeconds)

  return (
    angularFrequencyOffsetRadiansPerMillisecond *
      boundedTimeMilliseconds +
    gradientPhaseRadians
  )
}

export function gradientEnsembleMagnetizationStateAt(
  state: FidEnsembleState,
  timeMilliseconds: number,
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientImperfections = false,
): FidEnsembleMagnetizationState {
  const boundedTimeMilliseconds = Math.min(
    durationMilliseconds,
    Math.max(0, timeMilliseconds),
  )
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
  let packetXFraction = 0
  let packetYFraction = 0
  let totalPacketWeight = 0

  state.spinPackets.forEach((spinPacket) => {
    const packetPhaseRadians = gradientPhaseRadiansAt(
      state.column + spinPacket.offsetXMillimeters,
      state.row - spinPacket.offsetYMillimeters,
      state.gridSize,
      spinPacket.angularFrequencyOffsetRadiansPerMillisecond,
      boundedTimeMilliseconds,
      phaseEncodingPulses,
      readoutPulses,
      durationMilliseconds,
      gradientImperfections,
    )
    packetXFraction +=
      Math.cos(packetPhaseRadians) * spinPacket.weight
    packetYFraction +=
      Math.sin(packetPhaseRadians) * spinPacket.weight
    totalPacketWeight += spinPacket.weight
  })

  if (totalPacketWeight > 0 && totalPacketWeight !== 1) {
    packetXFraction /= totalPacketWeight
    packetYFraction /= totalPacketWeight
  }

  const xFraction = transverseFraction * packetXFraction
  const yFraction = transverseFraction * packetYFraction
  const coherentTransverseFraction = Math.hypot(xFraction, yFraction)
  const precessionPhaseRadians =
    coherentTransverseFraction < 1e-12
      ? 0
      : Math.atan2(yFraction, xFraction)

  return {
    excited: true,
    xFraction,
    yFraction,
    zFraction: longitudinalFraction,
    transverseFraction: coherentTransverseFraction,
    longitudinalFraction,
    precessionPhaseRadians,
    flipAngleRadians: Math.atan2(
      coherentTransverseFraction,
      longitudinalFraction,
    ),
  }
}
