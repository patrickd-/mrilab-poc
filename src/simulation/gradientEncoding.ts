import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import {
  receiverNoiseAt,
  type FidEnsembleMagnetizationState,
  type FidEnsembleState,
  type FidSpinPacketState,
} from './fid'

export interface GradientPulse {
  start: number
  end: number
  amplitude: number
}

export interface TransmitFrequencyBand {
  lowerAngularFrequencyKilradiansPerSecond: number
  upperAngularFrequencyKilradiansPerSecond: number
}

export interface GradientSignalPoint {
  kxCyclesPerMeter: number
  kyCyclesPerMeter: number
  normalizedInPhaseSignal: number
  normalizedMagnitude: number
  normalizedQuadratureSignal: number
  timeMilliseconds: number
}

export const GRADIENT_SEQUENCE_DURATION_MILLISECONDS = 20
export const MAXIMUM_GRADIENT_TESLA_PER_METER = 30e-3
export const MAXIMUM_RF_B1_TESLA = 25e-6
export const RF_BLOCH_MAXIMUM_STEP_MILLISECONDS = 0.02
const GRADIENT_FAST_RESPONSE_TIME_MILLISECONDS = 0.04
const GRADIENT_EDDY_RESPONSE_TIME_MILLISECONDS = 0.8
const GRADIENT_EDDY_RESPONSE_FRACTION = 0.04
const DEFAULT_SLICE_SELECTION_AMPLITUDE = 0.58
const DEFAULT_SLICE_THICKNESS_MILLIMETERS = 1
const DEFAULT_RF_START = 0.08
const DEFAULT_RF_END = 0.34
const DEFAULT_REPHASING_END = 0.43

function sinc(value: number) {
  return Math.abs(value) < 1e-12 ? 1 : Math.sin(value) / value
}

export function transmitBandwidthAngularRadiansPerMillisecond(
  transmitFrequencyBand: TransmitFrequencyBand,
) {
  // A numerical value expressed in krad/s is the same value in rad/ms.
  return Math.abs(
    transmitFrequencyBand.upperAngularFrequencyKilradiansPerSecond -
      transmitFrequencyBand.lowerAngularFrequencyKilradiansPerSecond,
  )
}

export function rfPulseTimeBandwidthProduct(
  pulse: GradientPulse,
  transmitFrequencyBand: TransmitFrequencyBand,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
) {
  const pulseDurationMilliseconds =
    Math.max(0, pulse.end - pulse.start) * durationMilliseconds
  return (
    (transmitBandwidthAngularRadiansPerMillisecond(
      transmitFrequencyBand,
    ) *
      pulseDurationMilliseconds) /
    (2 * Math.PI)
  )
}

/**
 * Hamming-windowed sinc RF envelope. The configured transmit bandwidth sets
 * the sinc zero spacing; pulse.amplitude scales a physical 25 µT peak limit.
 */
export function rfPulseB1TeslaAt(
  pulse: GradientPulse,
  transmitFrequencyBand: TransmitFrequencyBand,
  timeMilliseconds: number,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
) {
  const startMilliseconds = pulse.start * durationMilliseconds
  const endMilliseconds = pulse.end * durationMilliseconds
  if (
    timeMilliseconds < startMilliseconds ||
    timeMilliseconds > endMilliseconds ||
    endMilliseconds <= startMilliseconds
  ) {
    return 0
  }

  const pulseDurationMilliseconds = endMilliseconds - startMilliseconds
  const centerMilliseconds = (startMilliseconds + endMilliseconds) / 2
  const offsetMilliseconds = timeMilliseconds - centerMilliseconds
  const bandwidthRadiansPerMillisecond =
    transmitBandwidthAngularRadiansPerMillisecond(transmitFrequencyBand)
  const sincEnvelope = sinc(
    (bandwidthRadiansPerMillisecond * offsetMilliseconds) / 2,
  )
  const hammingWindow =
    0.54 +
    0.46 *
      Math.cos((2 * Math.PI * offsetMilliseconds) / pulseDurationMilliseconds)

  return (
    pulse.amplitude *
    MAXIMUM_RF_B1_TESLA *
    sincEnvelope *
    hammingWindow
  )
}

export function rfPulseAreaTeslaSecondsAt(
  pulse: GradientPulse,
  transmitFrequencyBand: TransmitFrequencyBand,
  timeMilliseconds = pulse.end * GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  maximumStepMilliseconds = 0.005,
) {
  const startMilliseconds = pulse.start * durationMilliseconds
  const endMilliseconds = Math.min(
    pulse.end * durationMilliseconds,
    Math.max(startMilliseconds, timeMilliseconds),
  )
  const intervalMilliseconds = endMilliseconds - startMilliseconds
  if (intervalMilliseconds <= 0) return 0

  const stepCount = Math.max(
    1,
    Math.ceil(intervalMilliseconds / maximumStepMilliseconds),
  )
  const stepMilliseconds = intervalMilliseconds / stepCount
  let areaTeslaMilliseconds = 0
  for (let step = 0; step < stepCount; step += 1) {
    areaTeslaMilliseconds +=
      rfPulseB1TeslaAt(
        pulse,
        transmitFrequencyBand,
        startMilliseconds + (step + 0.5) * stepMilliseconds,
        durationMilliseconds,
      ) * stepMilliseconds
  }
  return areaTeslaMilliseconds / 1000
}

export function rfPulseNominalFlipAngleRadiansAt(
  pulse: GradientPulse,
  transmitFrequencyBand: TransmitFrequencyBand,
  timeMilliseconds = pulse.end * GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  transmitFieldScale = 1,
) {
  return (
    PROTON_GYROMAGNETIC_RATIO *
    transmitFieldScale *
    rfPulseAreaTeslaSecondsAt(
      pulse,
      transmitFrequencyBand,
      timeMilliseconds,
      durationMilliseconds,
    )
  )
}

export function calibrateRfPulseForFlipAngle(
  pulse: GradientPulse,
  transmitFrequencyBand: TransmitFrequencyBand,
  targetFlipAngleRadians = Math.PI / 2,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
) {
  const unitPulse = { ...pulse, amplitude: 1 }
  const unitFlipAngle = rfPulseNominalFlipAngleRadiansAt(
    unitPulse,
    transmitFrequencyBand,
    unitPulse.end * durationMilliseconds,
    durationMilliseconds,
  )
  return {
    ...pulse,
    amplitude:
      Math.abs(unitFlipAngle) < 1e-12
        ? 0
        : Math.max(-1, Math.min(1, targetFlipAngleRadians / unitFlipAngle)),
  }
}

export function rfPeakB1TeslaForFlipAngle(
  pulse: GradientPulse,
  transmitFrequencyBand: TransmitFrequencyBand,
  targetFlipAngleRadians = Math.PI / 2,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
) {
  const unitFlipAngle = rfPulseNominalFlipAngleRadiansAt(
    { ...pulse, amplitude: 1 },
    transmitFrequencyBand,
    pulse.end * durationMilliseconds,
    durationMilliseconds,
  )
  return Math.abs(unitFlipAngle) < 1e-12
    ? Number.POSITIVE_INFINITY
    : Math.abs(
        (targetFlipAngleRadians / unitFlipAngle) *
          MAXIMUM_RF_B1_TESLA,
      )
}

const DEFAULT_TRANSMIT_BANDWIDTH_RADIANS_PER_MILLISECOND =
  PROTON_GYROMAGNETIC_RATIO *
  MAXIMUM_GRADIENT_TESLA_PER_METER *
  DEFAULT_SLICE_SELECTION_AMPLITUDE *
  DEFAULT_SLICE_THICKNESS_MILLIMETERS *
  1e-6
const DEFAULT_RF_CALIBRATION_BAND: TransmitFrequencyBand = {
  lowerAngularFrequencyKilradiansPerSecond: 0,
  upperAngularFrequencyKilradiansPerSecond:
    DEFAULT_TRANSMIT_BANDWIDTH_RADIANS_PER_MILLISECOND,
}
const DEFAULT_RF_EXCITATION_PULSE = calibrateRfPulseForFlipAngle(
  { start: DEFAULT_RF_START, end: DEFAULT_RF_END, amplitude: 1 },
  DEFAULT_RF_CALIBRATION_BAND,
)

export const DEFAULT_RF_EXCITATION_PULSES: ReadonlyArray<GradientPulse> = [
  DEFAULT_RF_EXCITATION_PULSE,
]

export const DEFAULT_SLICE_SELECTION_PULSES: ReadonlyArray<GradientPulse> = [
  {
    start: DEFAULT_RF_START,
    end: DEFAULT_RF_END,
    amplitude: DEFAULT_SLICE_SELECTION_AMPLITUDE,
  },
  {
    start: DEFAULT_RF_END,
    end: DEFAULT_REPHASING_END,
    amplitude:
      (-0.5 *
        DEFAULT_SLICE_SELECTION_AMPLITUDE *
        (DEFAULT_RF_END - DEFAULT_RF_START)) /
      (DEFAULT_REPHASING_END - DEFAULT_RF_END),
  },
]

export const DEFAULT_PHASE_ENCODING_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.34, end: 0.52, amplitude: 0.52 },
]

export const DEFAULT_READOUT_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.34, end: 0.52, amplitude: -0.42 },
  { start: 0.52, end: 0.78, amplitude: 0.52 },
]

export const DEFAULT_ADC_PULSES: ReadonlyArray<GradientPulse> = [
  {
    start: DEFAULT_READOUT_PULSES[1].start,
    end: DEFAULT_READOUT_PULSES[1].end,
    amplitude: 1,
  },
]

export function sliceMappingAngularFrequencyKilradiansPerSecondAt(
  layer: number,
  gridSize: number,
  sliceGradientAmplitude: number,
) {
  const positionFromLowerFrequencyEdgeMillimeters =
    sliceGradientAmplitude >= 0 ? layer : gridSize - 1 - layer
  return (
    PROTON_GYROMAGNETIC_RATIO *
    MAXIMUM_GRADIENT_TESLA_PER_METER *
    Math.abs(sliceGradientAmplitude) *
    positionFromLowerFrequencyEdgeMillimeters *
    1e-6
  )
}

export function maximumSliceMappingAngularFrequencyKilradiansPerSecond(
  gridSize: number,
) {
  return sliceMappingAngularFrequencyKilradiansPerSecondAt(
    gridSize - 1,
    gridSize,
    1,
  )
}

export function createDefaultTransmitFrequencyBand(
  gridSize: number,
): TransmitFrequencyBand {
  const gridCenter = (gridSize - 1) / 2
  const centerAngularFrequency =
    sliceMappingAngularFrequencyKilradiansPerSecondAt(
      gridCenter,
      gridSize,
      DEFAULT_SLICE_SELECTION_AMPLITUDE,
    )
  const halfBandwidth =
    (PROTON_GYROMAGNETIC_RATIO *
      MAXIMUM_GRADIENT_TESLA_PER_METER *
      DEFAULT_SLICE_SELECTION_AMPLITUDE *
      DEFAULT_SLICE_THICKNESS_MILLIMETERS *
      1e-6) /
    2

  return {
    lowerAngularFrequencyKilradiansPerSecond:
      centerAngularFrequency - halfBandwidth,
    upperAngularFrequencyKilradiansPerSecond:
      centerAngularFrequency + halfBandwidth,
  }
}

export function copyGradientPulses(
  pulses: ReadonlyArray<GradientPulse>,
) {
  return pulses.map((pulse) => ({ ...pulse }))
}

export function sliceRephasingAreaRatio(
  pulses: ReadonlyArray<GradientPulse>,
) {
  const [selection, rephasing] = pulses
  if (!selection || !rephasing) return null
  const selectionArea =
    selection.amplitude * Math.max(0, selection.end - selection.start)
  const rephasingArea =
    rephasing.amplitude * Math.max(0, rephasing.end - rephasing.start)
  return Math.abs(selectionArea) < 1e-12
    ? null
    : Math.abs(rephasingArea / selectionArea)
}

export function matchHalfAreaSliceRephasing(
  pulses: ReadonlyArray<GradientPulse>,
) {
  const matched = copyGradientPulses(pulses)
  const [selection, rephasing] = matched
  if (!selection || !rephasing) return matched
  const rephasingDuration = Math.max(0, rephasing.end - rephasing.start)
  if (rephasingDuration <= 1e-12) return matched

  const targetAmplitude =
    (-0.5 *
      selection.amplitude *
      Math.max(0, selection.end - selection.start)) /
    rephasingDuration
  rephasing.amplitude = Math.max(-1, Math.min(1, targetAmplitude))
  return matched
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

export function adcGateActiveAt(
  pulses: ReadonlyArray<GradientPulse>,
  timeMilliseconds: number,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
) {
  if (durationMilliseconds <= 0) return false
  return (
    gradientAmplitudeAt(
      pulses,
      Math.min(1, Math.max(0, timeMilliseconds / durationMilliseconds)),
    ) > 0
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

export function gradientKSpaceCyclesPerMeterAt(
  pulses: ReadonlyArray<GradientPulse>,
  timeMilliseconds: number,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  imperfections = false,
  encodingStartTimeMilliseconds = 0,
) {
  const boundedTimeMilliseconds = Math.min(
    durationMilliseconds,
    Math.max(0, timeMilliseconds),
  )
  const boundedStartMilliseconds = Math.min(
    durationMilliseconds,
    Math.max(0, encodingStartTimeMilliseconds),
  )
  if (boundedTimeMilliseconds <= boundedStartMilliseconds) return 0

  const gradientAreaSinceEncodingStart =
    gradientAreaSecondsAt(
      pulses,
      boundedTimeMilliseconds,
      durationMilliseconds,
      imperfections,
    ) -
    gradientAreaSecondsAt(
      pulses,
      boundedStartMilliseconds,
      durationMilliseconds,
      imperfections,
    )

  return (
    (PROTON_GYROMAGNETIC_RATIO *
      MAXIMUM_GRADIENT_TESLA_PER_METER *
      gradientAreaSinceEncodingStart) /
    (2 * Math.PI)
  )
}

export function spatialEncodingBasisAt(
  column: number,
  row: number,
  gridSize: number,
  kxCyclesPerMeter: number,
  kyCyclesPerMeter: number,
) {
  const gridCenter = (gridSize - 1) / 2
  const positionXMeters = (column - gridCenter) * 1e-3
  const positionYMeters = (gridCenter - row) * 1e-3
  const phaseRadians =
    2 *
    Math.PI *
    (kxCyclesPerMeter * positionXMeters +
      kyCyclesPerMeter * positionYMeters)

  return {
    phaseRadians,
    real: Math.cos(phaseRadians),
    imaginary: Math.sin(phaseRadians),
  }
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

export interface SliceSelectiveRfMagnetization {
  xFraction: number
  yFraction: number
  zFraction: number
  nominalFlipAngleRadians: number
}

function rotateMagnetization(
  x: number,
  y: number,
  z: number,
  angularVelocityX: number,
  angularVelocityY: number,
  angularVelocityZ: number,
  durationMilliseconds: number,
) {
  const angularVelocity = Math.hypot(
    angularVelocityX,
    angularVelocityY,
    angularVelocityZ,
  )
  if (angularVelocity < 1e-15 || durationMilliseconds <= 0) {
    return { x, y, z }
  }

  const axisX = angularVelocityX / angularVelocity
  const axisY = angularVelocityY / angularVelocity
  const axisZ = angularVelocityZ / angularVelocity
  const angle = angularVelocity * durationMilliseconds
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const oneMinusCosine = 1 - cosine
  const dot = axisX * x + axisY * y + axisZ * z

  return {
    x:
      x * cosine +
      (axisY * z - axisZ * y) * sine +
      axisX * dot * oneMinusCosine,
    y:
      y * cosine +
      (axisZ * x - axisX * z) * sine +
      axisY * dot * oneMinusCosine,
    z:
      z * cosine +
      (axisX * y - axisY * x) * sine +
      axisZ * dot * oneMinusCosine,
  }
}

/**
 * Integrates the rotating-frame Bloch equation while RF and G_SS act
 * simultaneously. RF is along +y, so an on-resonance positive pulse tips +z
 * toward +x, matching the lab's existing arrow convention.
 */
export function sliceSelectiveRfMagnetizationAt(
  state: FidEnsembleState,
  spinPacket: FidSpinPacketState,
  timeMilliseconds: number,
  excitationPulse: GradientPulse,
  transmitFrequencyBand: TransmitFrequencyBand,
  sliceSelectionPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientImperfections = false,
  maximumStepMilliseconds = RF_BLOCH_MAXIMUM_STEP_MILLISECONDS,
): SliceSelectiveRfMagnetization {
  const excitationStartMilliseconds =
    excitationPulse.start * durationMilliseconds
  const excitationEndMilliseconds = excitationPulse.end * durationMilliseconds
  const integrationEndMilliseconds = Math.min(
    excitationEndMilliseconds,
    Math.max(excitationStartMilliseconds, timeMilliseconds),
  )
  const intervalMilliseconds =
    integrationEndMilliseconds - excitationStartMilliseconds
  if (intervalMilliseconds <= 0) {
    return {
      xFraction: 0,
      yFraction: 0,
      zFraction: 1,
      nominalFlipAngleRadians: 0,
    }
  }

  const effectiveExcitationTimeMilliseconds =
    ((excitationPulse.start + excitationPulse.end) / 2) *
    durationMilliseconds
  const nominalSliceGradientAmplitude = appliedGradientAmplitudeAt(
    sliceSelectionPulses,
    effectiveExcitationTimeMilliseconds,
    durationMilliseconds,
    gradientImperfections,
  )
  const gridCenter = (state.gridSize - 1) / 2
  const nominalAngularFrequencyPerLayer =
    PROTON_GYROMAGNETIC_RATIO *
    MAXIMUM_GRADIENT_TESLA_PER_METER *
    Math.abs(nominalSliceGradientAmplitude) *
    1e-6
  const bandCenterAngularFrequency =
    (transmitFrequencyBand.lowerAngularFrequencyKilradiansPerSecond +
      transmitFrequencyBand.upperAngularFrequencyKilradiansPerSecond) /
    2
  const rfCarrierOffsetRadiansPerMillisecond =
    Math.abs(nominalSliceGradientAmplitude) < 1e-9
      ? bandCenterAngularFrequency
      : bandCenterAngularFrequency -
        nominalAngularFrequencyPerLayer * gridCenter
  const stepCount = Math.max(
    1,
    Math.ceil(
      intervalMilliseconds / Math.max(1e-4, maximumStepMilliseconds),
    ),
  )
  const stepMilliseconds = intervalMilliseconds / stepCount
  let xFraction = 0
  let yFraction = 0
  let zFraction = 1

  for (let step = 0; step < stepCount; step += 1) {
    const sampleTimeMilliseconds =
      excitationStartMilliseconds + (step + 0.5) * stepMilliseconds
    const b1Tesla = rfPulseB1TeslaAt(
      excitationPulse,
      transmitFrequencyBand,
      sampleTimeMilliseconds,
      durationMilliseconds,
    )
    const sliceGradientAmplitude = appliedGradientAmplitudeAt(
      sliceSelectionPulses,
      sampleTimeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
    )
    const gradientDetuningRadiansPerMillisecond =
      PROTON_GYROMAGNETIC_RATIO *
      MAXIMUM_GRADIENT_TESLA_PER_METER *
      sliceGradientAmplitude *
      (state.layer - gridCenter) *
      1e-6
    const angularVelocityY =
      (PROTON_GYROMAGNETIC_RATIO *
        b1Tesla *
        state.transmitFieldScale) /
      1000
    const angularVelocityZ =
      gradientDetuningRadiansPerMillisecond -
      rfCarrierOffsetRadiansPerMillisecond +
      spinPacket.angularFrequencyOffsetRadiansPerMillisecond
    const rotated = rotateMagnetization(
      xFraction,
      yFraction,
      zFraction,
      0,
      angularVelocityY,
      angularVelocityZ,
      stepMilliseconds,
    )

    const transverseDecay =
      state.transverseRelaxationTimeMilliseconds === 0
        ? 0
        : Math.exp(
            -stepMilliseconds /
              state.transverseRelaxationTimeMilliseconds,
          )
    xFraction = rotated.x * transverseDecay
    yFraction = rotated.y * transverseDecay
    zFraction =
      state.longitudinalRelaxationTimeMilliseconds === 0
        ? 1
        : 1 +
          (rotated.z - 1) *
            Math.exp(
              -stepMilliseconds /
                state.longitudinalRelaxationTimeMilliseconds,
            )
  }

  return {
    xFraction,
    yFraction,
    zFraction,
    nominalFlipAngleRadians: rfPulseNominalFlipAngleRadiansAt(
      excitationPulse,
      transmitFrequencyBand,
      integrationEndMilliseconds,
      durationMilliseconds,
      state.transmitFieldScale,
    ),
  }
}

interface SliceRfCacheContext {
  excitationPulse: GradientPulse
  gradientImperfections: boolean
  integrationTimeMilliseconds: number
  sliceSelectionPulses: ReadonlyArray<GradientPulse>
  transmitFrequencyBand: TransmitFrequencyBand
}

let sliceRfCacheContext: SliceRfCacheContext | null = null
let sliceRfCache = new Map<string, SliceSelectiveRfMagnetization>()

function cachedSliceSelectiveRfMagnetizationAt(
  state: FidEnsembleState,
  spinPacket: FidSpinPacketState,
  integrationTimeMilliseconds: number,
  excitationPulse: GradientPulse,
  transmitFrequencyBand: TransmitFrequencyBand,
  sliceSelectionPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds: number,
  gradientImperfections: boolean,
) {
  if (
    !sliceRfCacheContext ||
    sliceRfCacheContext.excitationPulse !== excitationPulse ||
    sliceRfCacheContext.gradientImperfections !== gradientImperfections ||
    sliceRfCacheContext.integrationTimeMilliseconds !==
      integrationTimeMilliseconds ||
    sliceRfCacheContext.sliceSelectionPulses !== sliceSelectionPulses ||
    sliceRfCacheContext.transmitFrequencyBand !== transmitFrequencyBand
  ) {
    sliceRfCacheContext = {
      excitationPulse,
      gradientImperfections,
      integrationTimeMilliseconds,
      sliceSelectionPulses,
      transmitFrequencyBand,
    }
    sliceRfCache = new Map()
  }

  const cacheKey = [
    state.layer,
    state.gridSize,
    state.transmitFieldScale,
    state.longitudinalRelaxationTimeMilliseconds,
    state.transverseRelaxationTimeMilliseconds,
    spinPacket.angularFrequencyOffsetRadiansPerMillisecond,
    durationMilliseconds,
  ].join(':')
  const cached = sliceRfCache.get(cacheKey)
  if (cached) return cached

  const calculated = sliceSelectiveRfMagnetizationAt(
    state,
    spinPacket,
    integrationTimeMilliseconds,
    excitationPulse,
    transmitFrequencyBand,
    sliceSelectionPulses,
    durationMilliseconds,
    gradientImperfections,
  )
  sliceRfCache.set(cacheKey, calculated)
  return calculated
}

export function gradientEnsembleMagnetizationStateAt(
  state: FidEnsembleState,
  timeMilliseconds: number,
  rfExcitationPulses: ReadonlyArray<GradientPulse>,
  transmitFrequencyBand: TransmitFrequencyBand,
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

  const excitationStartMilliseconds =
    excitationPulse.start * durationMilliseconds
  const excitationEndMilliseconds =
    excitationPulse.end * durationMilliseconds
  const integrationTimeMilliseconds = Math.min(
    boundedTimeMilliseconds,
    excitationEndMilliseconds,
  )
  const relaxationTimeMilliseconds = Math.max(
    0,
    boundedTimeMilliseconds - excitationEndMilliseconds,
  )
  let packetXFraction = 0
  let packetYFraction = 0
  let packetZFraction = 0
  let totalPacketWeight = 0
  let flipAngleRadians = 0

  state.spinPackets.forEach((spinPacket) => {
    const rfMagnetization = cachedSliceSelectiveRfMagnetizationAt(
      state,
      spinPacket,
      integrationTimeMilliseconds,
      excitationPulse,
      transmitFrequencyBand,
      sliceSelectionPulses,
      durationMilliseconds,
      gradientImperfections,
    )
    let xFraction = rfMagnetization.xFraction
    let yFraction = rfMagnetization.yFraction
    let zFraction = rfMagnetization.zFraction
    flipAngleRadians = rfMagnetization.nominalFlipAngleRadians

    if (relaxationTimeMilliseconds > 0) {
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
        excitationEndMilliseconds,
      )
      const transverseDecay =
        state.transverseRelaxationTimeMilliseconds === 0
          ? 0
          : Math.exp(
              -relaxationTimeMilliseconds /
                state.transverseRelaxationTimeMilliseconds,
            )
      const cosine = Math.cos(packetPhaseRadians)
      const sine = Math.sin(packetPhaseRadians)
      const previousX = xFraction
      const previousY = yFraction
      xFraction = transverseDecay *
        (previousX * cosine - previousY * sine)
      yFraction = transverseDecay *
        (previousX * sine + previousY * cosine)
      zFraction =
        state.longitudinalRelaxationTimeMilliseconds === 0
          ? 1
          : 1 +
            (zFraction - 1) *
              Math.exp(
                -relaxationTimeMilliseconds /
                  state.longitudinalRelaxationTimeMilliseconds,
              )
    }

    packetXFraction += xFraction * spinPacket.weight
    packetYFraction += yFraction * spinPacket.weight
    packetZFraction += zFraction * spinPacket.weight
    totalPacketWeight += spinPacket.weight
  })

  if (totalPacketWeight > 0 && totalPacketWeight !== 1) {
    packetXFraction /= totalPacketWeight
    packetYFraction /= totalPacketWeight
    packetZFraction /= totalPacketWeight
  }

  const coherentTransverseFraction = Math.hypot(
    packetXFraction,
    packetYFraction,
  )
  const precessionPhaseRadians =
    coherentTransverseFraction < 1e-12
      ? 0
      : Math.atan2(packetYFraction, packetXFraction)

  return {
    excited: coherentTransverseFraction > 0.02,
    xFraction: packetXFraction,
    yFraction: packetYFraction,
    zFraction: packetZFraction,
    transverseFraction: coherentTransverseFraction,
    longitudinalFraction: packetZFraction,
    precessionPhaseRadians,
    flipAngleRadians,
  }
}

export function gradientSignalPointAt(
  states: ReadonlyArray<FidEnsembleState>,
  timeMilliseconds: number,
  rfExcitationPulses: ReadonlyArray<GradientPulse>,
  transmitFrequencyBand: TransmitFrequencyBand,
  sliceSelectionPulses: ReadonlyArray<GradientPulse>,
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds = GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientImperfections = false,
  receiverNoise = false,
): GradientSignalPoint {
  let referenceSignal = 0
  let inPhaseSignal = 0
  let quadratureSignal = 0

  states.forEach((state) => {
    const magnetization = gradientEnsembleMagnetizationStateAt(
      state,
      timeMilliseconds,
      rfExcitationPulses,
      transmitFrequencyBand,
      sliceSelectionPulses,
      phaseEncodingPulses,
      readoutPulses,
      durationMilliseconds,
      gradientImperfections,
    )
    const { x: fieldX, y: fieldY, z: fieldZ } = state.fieldDirection
    const transverseBasisLength = Math.sqrt(
      Math.max(0, 1 - fieldX ** 2),
    )
    const safeBasisLength = Math.max(transverseBasisLength, 1e-12)
    const basisX = transverseBasisLength
    const basisY = (-fieldX * fieldY) / safeBasisLength
    const basisZ = (-fieldX * fieldZ) / safeBasisLength
    const quadratureBasisX = fieldY * basisZ - fieldZ * basisY
    const quadratureBasisY = fieldZ * basisX - fieldX * basisZ
    const receiverX =
      basisX * magnetization.xFraction +
      quadratureBasisX * magnetization.yFraction
    const receiverY =
      basisY * magnetization.xFraction +
      quadratureBasisY * magnetization.yFraction

    referenceSignal +=
      state.equilibriumMagnetization * transverseBasisLength
    inPhaseSignal += state.equilibriumMagnetization * receiverX
    quadratureSignal += state.equilibriumMagnetization * receiverY
  })

  const normalizedInPhaseSignalWithoutNoise =
    referenceSignal === 0 ? 0 : inPhaseSignal / referenceSignal
  const normalizedQuadratureSignalWithoutNoise =
    referenceSignal === 0 ? 0 : quadratureSignal / referenceSignal
  const noise = receiverNoise
    ? receiverNoiseAt(timeMilliseconds)
    : { inPhase: 0, quadrature: 0 }
  const normalizedInPhaseSignal =
    normalizedInPhaseSignalWithoutNoise + noise.inPhase
  const normalizedQuadratureSignal =
    normalizedQuadratureSignalWithoutNoise + noise.quadrature
  const encodingStartTimeMilliseconds =
    (rfExcitationPulses[0]?.end ?? 0) * durationMilliseconds

  return {
    kxCyclesPerMeter: gradientKSpaceCyclesPerMeterAt(
      readoutPulses,
      timeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
      encodingStartTimeMilliseconds,
    ),
    kyCyclesPerMeter: gradientKSpaceCyclesPerMeterAt(
      phaseEncodingPulses,
      timeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
      encodingStartTimeMilliseconds,
    ),
    normalizedInPhaseSignal,
    normalizedMagnitude: Math.hypot(
      normalizedInPhaseSignal,
      normalizedQuadratureSignal,
    ),
    normalizedQuadratureSignal,
    timeMilliseconds,
  }
}
