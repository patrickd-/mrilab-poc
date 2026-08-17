import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import { complexFourierTransformInPlace } from './complexFft'

export interface SpatialGradientProfile {
  endFieldOffsetMillitesla: number
  startFieldOffsetMillitesla: number
}

export interface SpatialGradientProfiles {
  x: SpatialGradientProfile
  y: SpatialGradientProfile
}

export interface SpatialProjectionEnsemble {
  column: number
  equilibriumMagnetization: number
  fieldVariationTesla: number
  gridSize: number
  row: number
}

export interface SpatialSignalPoint {
  imaginary: number
  magnitude: number
  real: number
  timeMilliseconds: number
}

export interface SpatialSpectrumPoint {
  angularFrequencyRadiansPerSecond: number
  density: number
  frequencyKilohertz: number
  magnitude: number
}

export interface SpatialFourierProjection {
  maximumFrequencyKilohertz: number
  signalPoints: ReadonlyArray<SpatialSignalPoint>
  spectrumPoints: ReadonlyArray<SpatialSpectrumPoint>
  timeWindowMilliseconds: number
}

export function spatialPhaseRadiansAt(
  fieldOffsetTesla: number,
  timeMilliseconds: number,
) {
  return (
    (PROTON_GYROMAGNETIC_RATIO *
      fieldOffsetTesla *
      timeMilliseconds) /
    1000
  )
}

export function projectedPositionMillimetersAtFrequency(
  frequencyKilohertz: number,
  centerFieldOffsetMillitesla: number,
  effectiveGradientMilliteslaPerMeter: number,
) {
  if (Math.abs(effectiveGradientMilliteslaPerMeter) < 1e-12) return null

  const gyromagneticRatioHertzPerTesla =
    PROTON_GYROMAGNETIC_RATIO / (2 * Math.PI)
  const centerFrequencyKilohertz =
    (gyromagneticRatioHertzPerTesla *
      centerFieldOffsetMillitesla *
      1e-3) /
    1000
  const frequencyOffsetHertz =
    (frequencyKilohertz - centerFrequencyKilohertz) * 1000

  return (
    (frequencyOffsetHertz /
      (gyromagneticRatioHertzPerTesla *
        effectiveGradientMilliteslaPerMeter *
        1e-3)) *
    1000
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function createSpatialFourierProjection(
  ensembles: ReadonlyArray<SpatialProjectionEnsemble>,
  xProfile: SpatialGradientProfile | null,
  yProfile: SpatialGradientProfile | null,
  maximumFieldOffsetTesla: number,
  sampleCount = 512,
): SpatialFourierProjection {
  if (maximumFieldOffsetTesla <= 0) {
    throw new RangeError('Maximum field offset must be positive')
  }
  if (
    sampleCount < 2 ||
    (sampleCount & (sampleCount - 1)) !== 0
  ) {
    throw new RangeError('Projection sample count must be a power of two')
  }

  const maximumAngularFrequencyRadiansPerSecond =
    PROTON_GYROMAGNETIC_RATIO * maximumFieldOffsetTesla
  const centeredSpectrum = new Float64Array(sampleCount)
  let totalWeight = 0

  ensembles.forEach((ensemble) => {
    const denominator = Math.max(1, ensemble.gridSize - 1)
    const spatialFieldOffsetMillitesla =
      (xProfile
        ? spatialFieldOffsetMilliteslaAt(
            xProfile,
            ensemble.column / denominator,
          )
        : 0) +
      (yProfile
        ? spatialFieldOffsetMilliteslaAt(
            yProfile,
            1 - ensemble.row / denominator,
          )
        : 0)
    const fieldOffsetTesla =
      ensemble.fieldVariationTesla +
      spatialFieldOffsetMillitesla * 1e-3
    const angularFrequencyRadiansPerSecond =
      PROTON_GYROMAGNETIC_RATIO * fieldOffsetTesla
    const weight = Math.max(0, ensemble.equilibriumMagnetization)
    const continuousBin = clamp(
      (angularFrequencyRadiansPerSecond /
        maximumAngularFrequencyRadiansPerSecond) *
        (sampleCount / 2) +
        sampleCount / 2,
      0,
      sampleCount - 1,
    )
    const lowerBin = Math.floor(continuousBin)
    const upperBin = Math.min(sampleCount - 1, lowerBin + 1)
    const upperWeight = continuousBin - lowerBin

    centeredSpectrum[lowerBin] += weight * (1 - upperWeight)
    centeredSpectrum[upperBin] += weight * upperWeight
    totalWeight += weight
  })

  if (totalWeight > 0) {
    for (let index = 0; index < sampleCount; index += 1) {
      centeredSpectrum[index] /= totalWeight
    }
  }

  const signalReal = new Float64Array(sampleCount)
  const signalImaginary = new Float64Array(sampleCount)
  for (let index = 0; index < sampleCount; index += 1) {
    signalReal[index] =
      centeredSpectrum[(index + sampleCount / 2) % sampleCount]
  }
  complexFourierTransformInPlace(signalReal, signalImaginary, false)

  const timeStepSeconds =
    Math.PI / maximumAngularFrequencyRadiansPerSecond
  const signalPoints = Array.from({ length: sampleCount }, (_, index) => ({
    imaginary: signalImaginary[index],
    magnitude: Math.hypot(signalReal[index], signalImaginary[index]),
    real: signalReal[index],
    timeMilliseconds: index * timeStepSeconds * 1000,
  }))
  const maximumSpectrumMagnitude = Math.max(...centeredSpectrum, 1e-30)
  const spectrumPoints = Array.from(
    { length: sampleCount },
    (_, index) => {
      const normalizedFrequency =
        (index - sampleCount / 2) / (sampleCount / 2)
      const angularFrequencyRadiansPerSecond =
        normalizedFrequency * maximumAngularFrequencyRadiansPerSecond
      return {
        angularFrequencyRadiansPerSecond,
        density: centeredSpectrum[index],
        frequencyKilohertz:
          angularFrequencyRadiansPerSecond / (2 * Math.PI * 1000),
        magnitude: centeredSpectrum[index] / maximumSpectrumMagnitude,
      }
    },
  )

  return {
    maximumFrequencyKilohertz:
      maximumAngularFrequencyRadiansPerSecond / (2 * Math.PI * 1000),
    signalPoints,
    spectrumPoints,
    timeWindowMilliseconds:
      (sampleCount - 1) * timeStepSeconds * 1000,
  }
}

export const MAXIMUM_SPATIAL_GRADIENT_MILLITESLA_PER_METER = 40
export const DEFAULT_SPATIAL_GRADIENT_FIELD_OF_VIEW_MILLIMETERS = 128

export function maximumEndpointFieldOffsetMillitesla(
  fieldOfViewMillimeters: number,
) {
  return (
    (MAXIMUM_SPATIAL_GRADIENT_MILLITESLA_PER_METER *
      fieldOfViewMillimeters) /
    2000
  )
}

export function createDefaultSpatialGradientProfiles(
  fieldOfViewMillimeters =
    DEFAULT_SPATIAL_GRADIENT_FIELD_OF_VIEW_MILLIMETERS,
): SpatialGradientProfiles {
  const maximumOffset = maximumEndpointFieldOffsetMillitesla(
    fieldOfViewMillimeters,
  )

  return {
    x: {
      endFieldOffsetMillitesla: maximumOffset / 2,
      startFieldOffsetMillitesla: -maximumOffset / 2,
    },
    y: {
      endFieldOffsetMillitesla: 0,
      startFieldOffsetMillitesla: 0,
    },
  }
}

export function spatialFieldOffsetMilliteslaAt(
  profile: SpatialGradientProfile,
  normalizedPosition: number,
) {
  const position = clamp(normalizedPosition, 0, 1)
  return (
    profile.startFieldOffsetMillitesla +
    (profile.endFieldOffsetMillitesla -
      profile.startFieldOffsetMillitesla) *
      position
  )
}

export function spatialGradientProfileHasField(
  profile: SpatialGradientProfile,
) {
  return (
    Math.abs(profile.startFieldOffsetMillitesla) > 1e-12 ||
    Math.abs(profile.endFieldOffsetMillitesla) > 1e-12
  )
}

export function combinedSpatialFieldOffsetMilliteslaAt(
  xProfile: SpatialGradientProfile,
  yProfile: SpatialGradientProfile,
  normalizedX: number,
  normalizedY: number,
) {
  return (
    spatialFieldOffsetMilliteslaAt(xProfile, normalizedX) +
    spatialFieldOffsetMilliteslaAt(yProfile, normalizedY)
  )
}

export function gradientStrengthMilliteslaPerMeter(
  profile: SpatialGradientProfile,
  fieldOfViewMillimeters: number,
) {
  if (fieldOfViewMillimeters <= 0) return 0
  return (
    ((profile.endFieldOffsetMillitesla -
      profile.startFieldOffsetMillitesla) *
      1000) /
    fieldOfViewMillimeters
  )
}
