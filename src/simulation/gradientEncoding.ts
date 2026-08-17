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
export const MAXIMUM_RF_FREQUENCY_OFFSET_KILOHERTZ = 2
const GRADIENT_FAST_RESPONSE_TIME_MILLISECONDS = 0.04
const GRADIENT_EDDY_RESPONSE_TIME_MILLISECONDS = 0.8
const GRADIENT_EDDY_RESPONSE_FRACTION = 0.04
const DEFAULT_SLICE_SELECTION_AMPLITUDE = 0.58
const DEFAULT_SLICE_HALF_THICKNESS_LAYERS = 0.25

export const DEFAULT_RF_EXCITATION_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.08, end: 0.34, amplitude: 1 },
]

export const DEFAULT_SLICE_SELECTION_PULSES: ReadonlyArray<GradientPulse> = [
  {
    start: 0.08,
    end: 0.34,
    amplitude: DEFAULT_SLICE_SELECTION_AMPLITUDE,
  },
  {
    start: 0.34,
    end: 0.43,
    amplitude: -DEFAULT_SLICE_SELECTION_AMPLITUDE,
  },
]

export const DEFAULT_PHASE_ENCODING_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.34, end: 0.52, amplitude: 0.52 },
]

export const DEFAULT_READOUT_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.34, end: 0.52, amplitude: -0.42 },
  { start: 0.52, end: 0.78, amplitude: 0.52 },
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

export function gradientAreaSecondsAt(
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

export function gradientSpatialFrequencyCyclesPerMeterAt(
  pulses: ReadonlyArray<GradientPulse>,
  timeMilliseconds: number,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  imperfections = false,
) {
  return (
    (PROTON_GYROMAGNETIC_RATIO / (2 * Math.PI)) *
    MAXIMUM_GRADIENT_TESLA_PER_METER *
    gradientAreaSecondsAt(
      pulses,
      timeMilliseconds,
      durationMilliseconds,
      imperfections,
    )
  )
}

export function gradientPhaseRadiansAt(
  column: number,
  row: number,
  layer: number,
  gridSize: number,
  angularFrequencyOffsetRadiansPerMillisecond: number,
  timeMilliseconds: number,
  sliceSelectionPulses: ReadonlyArray<GradientPulse>,
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientImperfections = false,
  phaseStartTimeMilliseconds = 0,
) {
  const boundedTimeMilliseconds = Math.min(
    durationMilliseconds,
    Math.max(0, timeMilliseconds),
  )
  const gradientAreaSincePhaseStart = (
    pulses: ReadonlyArray<GradientPulse>,
  ) =>
    gradientAreaSecondsAt(
      pulses,
      boundedTimeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
    ) -
    gradientAreaSecondsAt(
      pulses,
      phaseStartTimeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
    )
  const sliceSelectionAreaSeconds = gradientAreaSincePhaseStart(
    sliceSelectionPulses,
  )
  const phaseEncodingAreaSeconds = gradientAreaSincePhaseStart(
    phaseEncodingPulses,
  )
  const readoutAreaSeconds = gradientAreaSincePhaseStart(readoutPulses)
  const gridCenter = (gridSize - 1) / 2
  const positionXMeters = (column - gridCenter) * 1e-3
  const positionYMeters = (gridCenter - row) * 1e-3
  const positionZMeters = (layer - gridCenter) * 1e-3
  const gradientPhaseRadians =
    PROTON_GYROMAGNETIC_RATIO *
    MAXIMUM_GRADIENT_TESLA_PER_METER *
    (positionXMeters * readoutAreaSeconds +
      positionYMeters * phaseEncodingAreaSeconds +
      positionZMeters * sliceSelectionAreaSeconds)

  return (
    angularFrequencyOffsetRadiansPerMillisecond *
      Math.max(0, boundedTimeMilliseconds - phaseStartTimeMilliseconds) +
    gradientPhaseRadians
  )
}

export function sliceSelectionExcitationScaleAt(
  layer: number,
  gridSize: number,
  excitationPulse: GradientPulse,
  rfFrequencyOffsetKilohertz: number,
  sliceSelectionPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientImperfections = false,
) {
  const effectiveExcitationTimeMilliseconds =
    ((excitationPulse.start + excitationPulse.end) / 2) *
    durationMilliseconds
  const sliceGradientAmplitude = appliedGradientAmplitudeAt(
    sliceSelectionPulses,
    effectiveExcitationTimeMilliseconds,
    durationMilliseconds,
    gradientImperfections,
  )

  // The RF waveform is treated as an ideal hard spatial passband. Its carrier
  // offset chooses the center through delta-f = gamma-bar * G_SS * z, while
  // reducing G_SS widens the selected slab.
  if (Math.abs(sliceGradientAmplitude) < 1e-6) {
    return Math.abs(rfFrequencyOffsetKilohertz) < 1e-9 ? 1 : 0
  }

  const halfThicknessLayers =
    (DEFAULT_SLICE_HALF_THICKNESS_LAYERS *
      DEFAULT_SLICE_SELECTION_AMPLITUDE) /
    Math.abs(sliceGradientAmplitude)
  const gridCenter = (gridSize - 1) / 2
  const gradientTeslaPerMeter =
    MAXIMUM_GRADIENT_TESLA_PER_METER * sliceGradientAmplitude
  const protonGyromagneticRatioHertzPerTesla =
    PROTON_GYROMAGNETIC_RATIO / (2 * Math.PI)
  const targetOffsetLayers =
    (rfFrequencyOffsetKilohertz * 1000) /
    (protonGyromagneticRatioHertzPerTesla *
      gradientTeslaPerMeter *
      1e-3)
  const targetLayer = gridCenter + targetOffsetLayers
  return Math.abs(layer - targetLayer) <= halfThicknessLayers ? 1 : 0
}

export function gradientEnsembleMagnetizationStateAt(
  state: FidEnsembleState,
  timeMilliseconds: number,
  rfExcitationPulses: ReadonlyArray<GradientPulse>,
  rfFrequencyOffsetKilohertz: number,
  sliceSelectionPulses: ReadonlyArray<GradientPulse>,
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientImperfections = false,
): FidEnsembleMagnetizationState {
  const boundedTimeMilliseconds = Math.min(
    durationMilliseconds,
    Math.max(0, timeMilliseconds),
  )
  const excitationPulse = [...rfExcitationPulses]
    .reverse()
    .find(
      (pulse) =>
        pulse.start * durationMilliseconds <=
        boundedTimeMilliseconds + Number.EPSILON * durationMilliseconds * 8,
    )

  if (!excitationPulse) {
    return {
      excited: false,
      xFraction: 0,
      yFraction: 0,
      zFraction: 1,
      transverseFraction: 0,
      longitudinalFraction: 1,
      precessionPhaseRadians: 0,
      flipAngleRadians: 0,
    }
  }

  const sliceExcitationScale = sliceSelectionExcitationScaleAt(
    state.layer,
    state.gridSize,
    excitationPulse,
    rfFrequencyOffsetKilohertz,
    sliceSelectionPulses,
    durationMilliseconds,
    gradientImperfections,
  )
  const excitationStartMilliseconds =
    excitationPulse.start * durationMilliseconds
  const excitationEndMilliseconds =
    excitationPulse.end * durationMilliseconds
  const excitationProgress = Math.min(
    1,
    Math.max(
      0,
      (boundedTimeMilliseconds - excitationStartMilliseconds) /
        Math.max(
          Number.EPSILON,
          excitationEndMilliseconds - excitationStartMilliseconds,
        ),
    ),
  )
  const flipAngleRadians =
    excitationPulse.amplitude *
    (Math.PI / 2) *
    sliceExcitationScale *
    excitationProgress

  if (excitationProgress < 1) {
    const transverseFraction = Math.sin(flipAngleRadians)
    const longitudinalFraction = Math.cos(flipAngleRadians)
    return {
      excited: Math.abs(transverseFraction) > 1e-6,
      xFraction: transverseFraction,
      yFraction: 0,
      zFraction: longitudinalFraction,
      transverseFraction: Math.abs(transverseFraction),
      longitudinalFraction,
      precessionPhaseRadians: transverseFraction < 0 ? Math.PI : 0,
      flipAngleRadians,
    }
  }

  const effectiveExcitationTimeMilliseconds =
    ((excitationPulse.start + excitationPulse.end) / 2) *
    durationMilliseconds
  const relaxationTimeMilliseconds = Math.max(
    0,
    boundedTimeMilliseconds - excitationEndMilliseconds,
  )
  const initialTransverseFraction = Math.sin(flipAngleRadians)
  const initialLongitudinalFraction = Math.cos(flipAngleRadians)
  const transverseFraction =
    state.transverseRelaxationTimeMilliseconds === 0
      ? 0
      : initialTransverseFraction *
        Math.exp(
          -relaxationTimeMilliseconds /
            state.transverseRelaxationTimeMilliseconds,
        )
  const longitudinalFraction =
    state.longitudinalRelaxationTimeMilliseconds === 0
      ? 1
      : 1 +
        (initialLongitudinalFraction - 1) *
          Math.exp(
            -relaxationTimeMilliseconds /
              state.longitudinalRelaxationTimeMilliseconds,
          )
  let packetXFraction = 0
  let packetYFraction = 0
  let totalPacketWeight = 0

  state.spinPackets.forEach((spinPacket) => {
    const packetPhaseRadians = gradientPhaseRadiansAt(
      state.column + spinPacket.offsetXMillimeters,
      state.row - spinPacket.offsetYMillimeters,
      state.layer,
      state.gridSize,
      spinPacket.angularFrequencyOffsetRadiansPerMillisecond,
      boundedTimeMilliseconds,
      sliceSelectionPulses,
      phaseEncodingPulses,
      readoutPulses,
      durationMilliseconds,
      gradientImperfections,
      effectiveExcitationTimeMilliseconds,
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
    excited: Math.abs(initialTransverseFraction) > 1e-6,
    xFraction,
    yFraction,
    zFraction: longitudinalFraction,
    transverseFraction: coherentTransverseFraction,
    longitudinalFraction,
    precessionPhaseRadians,
    flipAngleRadians,
  }
}
