import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import {
  createDefaultSpatialGradientProfiles,
  gradientStrengthMilliteslaPerMeter,
  type SpatialGradientProfile,
} from './spatialGradient'

export const TWO_DIMENSIONAL_ENCODING_STAGE_DURATION_MILLISECONDS = 0.1

export interface TwoDimensionalGradientVector {
  x: SpatialGradientProfile
  y: SpatialGradientProfile
}

export interface TwoDimensionalEncodingDefaults {
  frequency: TwoDimensionalGradientVector
  phase: TwoDimensionalGradientVector
}

export interface TwoDimensionalEncodingState {
  frequencyKxCyclesPerMeter: number
  frequencyKyCyclesPerMeter: number
  kxCyclesPerMeter: number
  kyCyclesPerMeter: number
  phaseKxCyclesPerMeter: number
  phaseKyCyclesPerMeter: number
  phaseOffsetRadians: number
}

function averagedAppliedProfile(
  phaseProfile: SpatialGradientProfile,
  frequencyProfile: SpatialGradientProfile,
  phaseEnabled: boolean,
  frequencyEnabled: boolean,
): SpatialGradientProfile {
  const enabledStageCount =
    Number(phaseEnabled) + Number(frequencyEnabled)
  const divisor = Math.max(1, enabledStageCount)

  return {
    startFieldOffsetMillitesla:
      ((phaseEnabled ? phaseProfile.startFieldOffsetMillitesla : 0) +
        (frequencyEnabled
          ? frequencyProfile.startFieldOffsetMillitesla
          : 0)) /
      divisor,
    endFieldOffsetMillitesla:
      ((phaseEnabled ? phaseProfile.endFieldOffsetMillitesla : 0) +
        (frequencyEnabled
          ? frequencyProfile.endFieldOffsetMillitesla
          : 0)) /
      divisor,
  }
}

export function effectiveTwoDimensionalGradientVector(
  phase: TwoDimensionalGradientVector,
  frequency: TwoDimensionalGradientVector,
  phaseEnabled = true,
  frequencyEnabled = true,
): TwoDimensionalGradientVector {
  // Enabled stages have the same duration. Applying their average for their
  // combined duration preserves accumulated gradient phase while also letting
  // B0 inhomogeneity accrue for exactly as long as the enabled sequence.
  return {
    x: averagedAppliedProfile(
      phase.x,
      frequency.x,
      phaseEnabled,
      frequencyEnabled,
    ),
    y: averagedAppliedProfile(
      phase.y,
      frequency.y,
      phaseEnabled,
      frequencyEnabled,
    ),
  }
}

export function twoDimensionalEncodingDurationMilliseconds(
  phaseEnabled: boolean,
  frequencyEnabled: boolean,
) {
  return (
    (Number(phaseEnabled) + Number(frequencyEnabled)) *
    TWO_DIMENSIONAL_ENCODING_STAGE_DURATION_MILLISECONDS
  )
}

function zeroProfile(): SpatialGradientProfile {
  return {
    endFieldOffsetMillitesla: 0,
    startFieldOffsetMillitesla: 0,
  }
}

function copyProfile(profile: SpatialGradientProfile): SpatialGradientProfile {
  return { ...profile }
}

export function createDefaultTwoDimensionalEncodingGradients(
  fieldOfViewMillimeters: number,
): TwoDimensionalEncodingDefaults {
  const oneDimensionalDefaults = createDefaultSpatialGradientProfiles(
    fieldOfViewMillimeters,
  )

  return {
    phase: {
      x: zeroProfile(),
      y: copyProfile(oneDimensionalDefaults.x),
    },
    frequency: {
      x: copyProfile(oneDimensionalDefaults.x),
      y: zeroProfile(),
    },
  }
}

function kSpaceCyclesPerMeterForProfile(
  profile: SpatialGradientProfile,
  fieldOfViewMillimeters: number,
  durationMilliseconds: number,
) {
  const gradientTeslaPerMeter =
    gradientStrengthMilliteslaPerMeter(
      profile,
      fieldOfViewMillimeters,
    ) * 1e-3
  const durationSeconds = durationMilliseconds / 1000
  return (
    (PROTON_GYROMAGNETIC_RATIO / (2 * Math.PI)) *
    gradientTeslaPerMeter *
    durationSeconds
  )
}

function centerFieldOffsetTesla(vector: TwoDimensionalGradientVector) {
  return (
    (vector.x.startFieldOffsetMillitesla +
      vector.x.endFieldOffsetMillitesla +
      vector.y.startFieldOffsetMillitesla +
      vector.y.endFieldOffsetMillitesla) /
    2 *
    1e-3
  )
}

export function twoDimensionalEncodingState(
  phase: TwoDimensionalGradientVector,
  frequency: TwoDimensionalGradientVector,
  fieldOfViewMillimeters: number,
  phaseEnabled = true,
  frequencyEnabled = true,
  stageDurationMilliseconds =
    TWO_DIMENSIONAL_ENCODING_STAGE_DURATION_MILLISECONDS,
): TwoDimensionalEncodingState {
  const phaseKxCyclesPerMeter = phaseEnabled
    ? kSpaceCyclesPerMeterForProfile(
        phase.x,
        fieldOfViewMillimeters,
        stageDurationMilliseconds,
      )
    : 0
  const phaseKyCyclesPerMeter = phaseEnabled
    ? kSpaceCyclesPerMeterForProfile(
        phase.y,
        fieldOfViewMillimeters,
        stageDurationMilliseconds,
      )
    : 0
  const frequencyKxCyclesPerMeter = frequencyEnabled
    ? kSpaceCyclesPerMeterForProfile(
        frequency.x,
        fieldOfViewMillimeters,
        stageDurationMilliseconds,
      )
    : 0
  const frequencyKyCyclesPerMeter = frequencyEnabled
    ? kSpaceCyclesPerMeterForProfile(
        frequency.y,
        fieldOfViewMillimeters,
        stageDurationMilliseconds,
      )
    : 0
  const accumulatedCenterFieldOffsetTesla =
    (phaseEnabled ? centerFieldOffsetTesla(phase) : 0) +
    (frequencyEnabled ? centerFieldOffsetTesla(frequency) : 0)

  return {
    frequencyKxCyclesPerMeter,
    frequencyKyCyclesPerMeter,
    kxCyclesPerMeter:
      phaseKxCyclesPerMeter + frequencyKxCyclesPerMeter,
    kyCyclesPerMeter:
      phaseKyCyclesPerMeter + frequencyKyCyclesPerMeter,
    phaseKxCyclesPerMeter,
    phaseKyCyclesPerMeter,
    phaseOffsetRadians:
      PROTON_GYROMAGNETIC_RATIO *
      accumulatedCenterFieldOffsetTesla *
      (stageDurationMilliseconds / 1000),
  }
}
