import {
  ADC_DWELL_TIME_MILLISECONDS,
  cartesianKSpaceBoundsForGrid,
  DEFAULT_ADC_PULSES,
  DEFAULT_PHASE_ENCODING_PULSES,
  DEFAULT_READOUT_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientKSpaceCyclesPerMeterAt,
  type GradientPulse,
} from './gradientEncoding'

export interface GradientCalibrationOptions {
  adcDwellTimeMilliseconds?: number
  encodingStartTimeMilliseconds?: number
  gradientImperfections?: boolean
  gridSize?: number
  voxelSizeMillimeters?: number
}

export interface PhaseEncodingCalibrationLine {
  amplitude: number
  index: number
  kyCyclesPerMeter: number
}

export interface GradientCalibrationReport {
  current: {
    phaseEncodingKyCyclesPerMeter: number
    readoutEndKxCyclesPerMeter: number
    readoutStartKxCyclesPerMeter: number
  }
  options: Required<GradientCalibrationOptions>
  recommended: {
    adcSampleCount: number
    echoCenterTimeMilliseconds: number
    phaseEncodingAmplitudeStep: number
    phaseEncodingLinesCenterOut: ReadonlyArray<PhaseEncodingCalibrationLine>
    phaseEncodingMaximumAmplitude: number
    phaseEncodingMinimumAmplitude: number
    phaseEncodingPulsesForCenterLine: ReadonlyArray<GradientPulse>
    readoutKSpaceStepPerAdcSample: number
    readoutOversamplingFactor: number
    readoutPulses: ReadonlyArray<GradientPulse>
  }
  target: {
    fieldOfViewMillimeters: number
    kSpaceStepCyclesPerMeter: number
    maximumKCyclesPerMeter: number
    minimumKCyclesPerMeter: number
    readoutUpperEdgeExclusiveCyclesPerMeter: number
  }
  warnings: ReadonlyArray<string>
}

const DEFAULT_GRID_SIZE = 128
const DEFAULT_VOXEL_SIZE_MILLIMETERS = 1
const EPSILON = 1e-12

function pulseWithAmplitude(pulse: GradientPulse, amplitude: number) {
  return { ...pulse, amplitude }
}

function centerOutLineIndices(gridSize: number) {
  const indices = [0]
  for (let offset = 1; offset <= Math.floor(gridSize / 2); offset += 1) {
    if (offset <= Math.ceil(gridSize / 2) - 1) indices.push(offset)
    indices.push(-offset)
  }
  return indices.slice(0, gridSize)
}

function solveTwoPulseAmplitudes(
  firstPulse: GradientPulse,
  secondPulse: GradientPulse,
  startTimeMilliseconds: number,
  endTimeMilliseconds: number,
  targetStartK: number,
  targetEndK: number,
  imperfections: boolean,
  encodingStartTimeMilliseconds: number,
) {
  const firstBasis = [
    pulseWithAmplitude(firstPulse, 1),
    pulseWithAmplitude(secondPulse, 0),
  ]
  const secondBasis = [
    pulseWithAmplitude(firstPulse, 0),
    pulseWithAmplitude(secondPulse, 1),
  ]
  const firstAtStart = gradientKSpaceCyclesPerMeterAt(
    firstBasis,
    startTimeMilliseconds,
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
    imperfections,
    encodingStartTimeMilliseconds,
  )
  const secondAtStart = gradientKSpaceCyclesPerMeterAt(
    secondBasis,
    startTimeMilliseconds,
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
    imperfections,
    encodingStartTimeMilliseconds,
  )
  const firstAtEnd = gradientKSpaceCyclesPerMeterAt(
    firstBasis,
    endTimeMilliseconds,
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
    imperfections,
    encodingStartTimeMilliseconds,
  )
  const secondAtEnd = gradientKSpaceCyclesPerMeterAt(
    secondBasis,
    endTimeMilliseconds,
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
    imperfections,
    encodingStartTimeMilliseconds,
  )
  const determinant = firstAtStart * secondAtEnd - secondAtStart * firstAtEnd
  if (Math.abs(determinant) < EPSILON) {
    throw new RangeError('Readout pulse timing does not permit calibration')
  }

  return {
    firstAmplitude:
      (targetStartK * secondAtEnd - secondAtStart * targetEndK) /
      determinant,
    secondAmplitude:
      (firstAtStart * targetEndK - targetStartK * firstAtEnd) /
      determinant,
  }
}

export function calibrateGradientEncoding(
  suppliedOptions: GradientCalibrationOptions = {},
): GradientCalibrationReport {
  const options: Required<GradientCalibrationOptions> = {
    adcDwellTimeMilliseconds:
      suppliedOptions.adcDwellTimeMilliseconds ??
      ADC_DWELL_TIME_MILLISECONDS,
    encodingStartTimeMilliseconds:
      suppliedOptions.encodingStartTimeMilliseconds ??
      (DEFAULT_RF_EXCITATION_PULSES[0]?.end ?? 0) *
        GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
    gradientImperfections: suppliedOptions.gradientImperfections ?? false,
    gridSize: suppliedOptions.gridSize ?? DEFAULT_GRID_SIZE,
    voxelSizeMillimeters:
      suppliedOptions.voxelSizeMillimeters ??
      DEFAULT_VOXEL_SIZE_MILLIMETERS,
  }
  if (!Number.isInteger(options.gridSize) || options.gridSize < 2) {
    throw new RangeError('Grid size must be an integer of at least 2')
  }
  if (
    !Number.isFinite(options.voxelSizeMillimeters) ||
    options.voxelSizeMillimeters <= 0
  ) {
    throw new RangeError('Voxel size must be greater than zero')
  }
  if (
    !Number.isFinite(options.adcDwellTimeMilliseconds) ||
    options.adcDwellTimeMilliseconds <= 0
  ) {
    throw new RangeError('ADC dwell time must be greater than zero')
  }
  if (
    !Number.isFinite(options.encodingStartTimeMilliseconds) ||
    options.encodingStartTimeMilliseconds < 0 ||
    options.encodingStartTimeMilliseconds >=
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS
  ) {
    throw new RangeError('Encoding start time must lie inside the sequence')
  }

  const phasePulse = DEFAULT_PHASE_ENCODING_PULSES[0]
  const [readoutPrephaser, readoutGradient] = DEFAULT_READOUT_PULSES
  const adcPulse = DEFAULT_ADC_PULSES[0]
  if (!phasePulse || !readoutPrephaser || !readoutGradient || !adcPulse) {
    throw new RangeError('Gradient calibration requires the default pulse layout')
  }

  const sequenceDurationMilliseconds =
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS
  const encodingStartTimeMilliseconds = options.encodingStartTimeMilliseconds
  const adcStartTimeMilliseconds = adcPulse.start * sequenceDurationMilliseconds
  const adcEndTimeMilliseconds = adcPulse.end * sequenceDurationMilliseconds
  const {
    fieldOfViewMillimeters,
    kSpaceStepCyclesPerMeter,
    maximumKCyclesPerMeter,
    minimumKCyclesPerMeter,
    upperEdgeExclusiveCyclesPerMeter:
      readoutUpperEdgeExclusiveCyclesPerMeter,
  } = cartesianKSpaceBoundsForGrid(
    options.gridSize,
    options.voxelSizeMillimeters,
  )

  const solvedReadout = solveTwoPulseAmplitudes(
    readoutPrephaser,
    readoutGradient,
    adcStartTimeMilliseconds,
    adcEndTimeMilliseconds,
    minimumKCyclesPerMeter,
    readoutUpperEdgeExclusiveCyclesPerMeter,
    options.gradientImperfections,
    encodingStartTimeMilliseconds,
  )
  const recommendedReadoutPulses = [
    pulseWithAmplitude(readoutPrephaser, solvedReadout.firstAmplitude),
    pulseWithAmplitude(readoutGradient, solvedReadout.secondAmplitude),
  ]
  const echoCenterTimeMilliseconds =
    adcStartTimeMilliseconds +
    ((0 - minimumKCyclesPerMeter) /
      (readoutUpperEdgeExclusiveCyclesPerMeter -
        minimumKCyclesPerMeter)) *
      (adcEndTimeMilliseconds - adcStartTimeMilliseconds)

  const unitPhaseK = gradientKSpaceCyclesPerMeterAt(
    [pulseWithAmplitude(phasePulse, 1)],
    echoCenterTimeMilliseconds,
    sequenceDurationMilliseconds,
    options.gradientImperfections,
    encodingStartTimeMilliseconds,
  )
  if (Math.abs(unitPhaseK) < EPSILON) {
    throw new RangeError('Phase-encoding pulse timing does not permit calibration')
  }
  const phaseEncodingLinesCenterOut = centerOutLineIndices(
    options.gridSize,
  ).map((index) => ({
    amplitude: (index * kSpaceStepCyclesPerMeter) / unitPhaseK,
    index,
    kyCyclesPerMeter: index * kSpaceStepCyclesPerMeter,
  }))

  const adcDurationMilliseconds =
    adcEndTimeMilliseconds - adcStartTimeMilliseconds
  const adcSampleCount = Math.ceil(
    adcDurationMilliseconds / options.adcDwellTimeMilliseconds - EPSILON,
  )
  let readoutKSpaceStepPerAdcSample = 0
  let previousSampleK: number | null = null
  for (let sampleIndex = 0; sampleIndex < adcSampleCount; sampleIndex += 1) {
    const sampleTimeMilliseconds =
      adcStartTimeMilliseconds +
      sampleIndex * options.adcDwellTimeMilliseconds
    const sampleK = gradientKSpaceCyclesPerMeterAt(
      recommendedReadoutPulses,
      sampleTimeMilliseconds,
      sequenceDurationMilliseconds,
      options.gradientImperfections,
      encodingStartTimeMilliseconds,
    )
    if (previousSampleK !== null) {
      readoutKSpaceStepPerAdcSample = Math.max(
        readoutKSpaceStepPerAdcSample,
        Math.abs(sampleK - previousSampleK),
      )
    }
    previousSampleK = sampleK
  }
  const readoutOversamplingFactor =
    readoutKSpaceStepPerAdcSample < EPSILON
      ? Number.POSITIVE_INFINITY
      : kSpaceStepCyclesPerMeter / readoutKSpaceStepPerAdcSample

  const currentPhaseEncodingKyCyclesPerMeter =
    gradientKSpaceCyclesPerMeterAt(
      DEFAULT_PHASE_ENCODING_PULSES,
      echoCenterTimeMilliseconds,
      sequenceDurationMilliseconds,
      options.gradientImperfections,
      encodingStartTimeMilliseconds,
    )
  const currentReadoutStartKxCyclesPerMeter =
    gradientKSpaceCyclesPerMeterAt(
      DEFAULT_READOUT_PULSES,
      adcStartTimeMilliseconds,
      sequenceDurationMilliseconds,
      options.gradientImperfections,
      encodingStartTimeMilliseconds,
    )
  const currentReadoutEndKxCyclesPerMeter =
    gradientKSpaceCyclesPerMeterAt(
      DEFAULT_READOUT_PULSES,
      adcEndTimeMilliseconds,
      sequenceDurationMilliseconds,
      options.gradientImperfections,
      encodingStartTimeMilliseconds,
    )

  const amplitudes = phaseEncodingLinesCenterOut.map(
    (line) => line.amplitude,
  )
  const warnings: string[] = []
  if (
    Math.max(
      Math.abs(solvedReadout.firstAmplitude),
      Math.abs(solvedReadout.secondAmplitude),
      ...amplitudes.map(Math.abs),
    ) >
    1 + EPSILON
  ) {
    warnings.push('The requested matrix/FOV exceeds the configured gradient limit.')
  }
  if (readoutOversamplingFactor < 1 - EPSILON) {
    warnings.push('ADC dwell time undersamples the calibrated readout gradient.')
  }
  if (
    currentPhaseEncodingKyCyclesPerMeter < minimumKCyclesPerMeter ||
    currentPhaseEncodingKyCyclesPerMeter > maximumKCyclesPerMeter
  ) {
    warnings.push('The current default phase-encoding line lies outside the target k-space matrix.')
  }
  if (
    currentReadoutStartKxCyclesPerMeter < minimumKCyclesPerMeter - EPSILON ||
    currentReadoutEndKxCyclesPerMeter >
      readoutUpperEdgeExclusiveCyclesPerMeter + EPSILON
  ) {
    warnings.push('The current default readout traverses beyond the target k-space matrix.')
  }

  return {
    current: {
      phaseEncodingKyCyclesPerMeter:
        currentPhaseEncodingKyCyclesPerMeter,
      readoutEndKxCyclesPerMeter: currentReadoutEndKxCyclesPerMeter,
      readoutStartKxCyclesPerMeter: currentReadoutStartKxCyclesPerMeter,
    },
    options,
    recommended: {
      adcSampleCount,
      echoCenterTimeMilliseconds,
      phaseEncodingAmplitudeStep:
        kSpaceStepCyclesPerMeter / unitPhaseK,
      phaseEncodingLinesCenterOut,
      phaseEncodingMaximumAmplitude: Math.max(...amplitudes),
      phaseEncodingMinimumAmplitude: Math.min(...amplitudes),
      phaseEncodingPulsesForCenterLine: [
        pulseWithAmplitude(phasePulse, 0),
      ],
      readoutKSpaceStepPerAdcSample,
      readoutOversamplingFactor,
      readoutPulses: recommendedReadoutPulses,
    },
    target: {
      fieldOfViewMillimeters,
      kSpaceStepCyclesPerMeter,
      maximumKCyclesPerMeter,
      minimumKCyclesPerMeter,
      readoutUpperEdgeExclusiveCyclesPerMeter,
    },
    warnings,
  }
}
