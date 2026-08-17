import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import { complexFourierTransformInPlace } from './complexFft'
import type { SpatialFourierProjection } from './spatialGradient'

export const SPATIAL_RECONSTRUCTION_ANGLE_BIN_COUNT = 180
export const SPATIAL_RECONSTRUCTION_GRID_SIZE = 128
export type SpatialBackprojectionFilter = 'hann-ramp' | 'unfiltered'

export interface SpatialProjectionGradient {
  centerFieldOffsetMillitesla: number
  xGradientMilliteslaPerMeter: number
  yGradientMilliteslaPerMeter: number
}

export function spatialProjectionAngleBin(
  xGradientMilliteslaPerMeter: number,
  yGradientMilliteslaPerMeter: number,
  binCount = SPATIAL_RECONSTRUCTION_ANGLE_BIN_COUNT,
) {
  if (Math.hypot(xGradientMilliteslaPerMeter, yGradientMilliteslaPerMeter) < 1e-12) {
    return null
  }

  let angleRadians = Math.atan2(
    yGradientMilliteslaPerMeter,
    xGradientMilliteslaPerMeter,
  )
  while (angleRadians < 0) angleRadians += Math.PI
  while (angleRadians >= Math.PI) angleRadians -= Math.PI
  return Math.min(
    binCount - 1,
    Math.floor((angleRadians / Math.PI) * binCount),
  )
}

function projectionDensityAtFrequency(
  projection: SpatialFourierProjection,
  densities: ArrayLike<number>,
  frequencyKilohertz: number,
) {
  const points = projection.spectrumPoints
  if (points.length < 2) return densities[0] ?? 0
  const minimumFrequency = points[0].frequencyKilohertz
  const maximumFrequency = points[points.length - 1].frequencyKilohertz
  if (
    frequencyKilohertz < minimumFrequency ||
    frequencyKilohertz > maximumFrequency
  ) {
    return 0
  }

  const continuousIndex =
    ((frequencyKilohertz - minimumFrequency) /
      (maximumFrequency - minimumFrequency)) *
    (points.length - 1)
  const lowerIndex = Math.floor(continuousIndex)
  const upperIndex = Math.min(points.length - 1, lowerIndex + 1)
  const upperWeight = continuousIndex - lowerIndex
  return (
    densities[lowerIndex] * (1 - upperWeight) +
    densities[upperIndex] * upperWeight
  )
}

function nextPowerOfTwo(value: number) {
  let power = 1
  while (power < value) power *= 2
  return power
}

export function projectionDensitiesForBackprojection(
  projection: SpatialFourierProjection,
  filter: SpatialBackprojectionFilter,
) {
  const source = Float64Array.from(
    projection.spectrumPoints,
    (point) => point.density,
  )
  if (filter === 'unfiltered' || source.length < 2) return source

  const paddedLength = nextPowerOfTwo(source.length * 2)
  const paddingOffset = Math.floor((paddedLength - source.length) / 2)
  const real = new Float64Array(paddedLength)
  const imaginary = new Float64Array(paddedLength)
  real.set(source, paddingOffset)
  complexFourierTransformInPlace(real, imaginary, false)

  for (let index = 0; index < paddedLength; index += 1) {
    const signedFrequencyIndex =
      index <= paddedLength / 2 ? index : index - paddedLength
    const normalizedFrequency =
      Math.abs(signedFrequencyIndex) / (paddedLength / 2)
    const ramp = normalizedFrequency
    const hannWindow = 0.5 * (1 + Math.cos(Math.PI * normalizedFrequency))
    const multiplier = ramp * hannWindow
    real[index] *= multiplier
    imaginary[index] *= multiplier
  }

  complexFourierTransformInPlace(real, imaginary, true)
  return real.slice(paddingOffset, paddingOffset + source.length)
}

export function backprojectSpatialProjection(
  projection: SpatialFourierProjection,
  gradient: SpatialProjectionGradient,
  fieldOfViewMillimeters: number,
  gridSize = SPATIAL_RECONSTRUCTION_GRID_SIZE,
  filter: SpatialBackprojectionFilter = 'unfiltered',
) {
  const backprojection = new Float64Array(gridSize * gridSize)
  const gradientMagnitudeMilliteslaPerMeter = Math.hypot(
    gradient.xGradientMilliteslaPerMeter,
    gradient.yGradientMilliteslaPerMeter,
  )
  if (gradientMagnitudeMilliteslaPerMeter < 1e-12) {
    return backprojection
  }

  const directionX =
    gradient.xGradientMilliteslaPerMeter /
    gradientMagnitudeMilliteslaPerMeter
  const directionY =
    gradient.yGradientMilliteslaPerMeter /
    gradientMagnitudeMilliteslaPerMeter
  const gyromagneticRatioHertzPerTesla =
    PROTON_GYROMAGNETIC_RATIO / (2 * Math.PI)
  const centerFrequencyKilohertz =
    (gyromagneticRatioHertzPerTesla *
      gradient.centerFieldOffsetMillitesla *
      1e-3) /
    1000
  const projectionDensities = projectionDensitiesForBackprojection(
    projection,
    filter,
  )
  // F(omega) is sampled per frequency bin, while backprojection samples per
  // spatial position. The first gradient factor is the frequency-to-position
  // Jacobian; ramp filtering contributes a second spatial-frequency factor.
  const spatialDensityScale =
    filter === 'hann-ramp'
      ? gradientMagnitudeMilliteslaPerMeter ** 2
      : gradientMagnitudeMilliteslaPerMeter

  for (let row = 0; row < gridSize; row += 1) {
    const yMillimeters =
      (0.5 - (row + 0.5) / gridSize) * fieldOfViewMillimeters
    for (let column = 0; column < gridSize; column += 1) {
      const xMillimeters =
        ((column + 0.5) / gridSize - 0.5) * fieldOfViewMillimeters
      const projectedPositionMillimeters =
        xMillimeters * directionX + yMillimeters * directionY
      const frequencyKilohertz =
        centerFrequencyKilohertz +
        gyromagneticRatioHertzPerTesla *
          gradientMagnitudeMilliteslaPerMeter *
          projectedPositionMillimeters *
          1e-9
      backprojection[row * gridSize + column] =
        projectionDensityAtFrequency(
          projection,
          projectionDensities,
          frequencyKilohertz,
        ) * spatialDensityScale
    }
  }

  return backprojection
}

export function addBackprojection(
  accumulator: Float64Array,
  backprojection: ArrayLike<number>,
) {
  if (accumulator.length !== backprojection.length) {
    throw new RangeError('Backprojection dimensions must match')
  }
  for (let index = 0; index < accumulator.length; index += 1) {
    accumulator[index] += backprojection[index]
  }
}

export function backprojectionGrayscalePixels(
  accumulator: ArrayLike<number>,
  projectionCount = 1,
) {
  const safeProjectionCount = Math.max(1, projectionCount)
  let maximum = 0
  for (let index = 0; index < accumulator.length; index += 1) {
    maximum = Math.max(maximum, accumulator[index] / safeProjectionCount)
  }

  const pixels = new Uint8ClampedArray(accumulator.length * 4)
  for (let index = 0; index < accumulator.length; index += 1) {
    const averagedValue = accumulator[index] / safeProjectionCount
    const normalized = maximum > 0 ? averagedValue / maximum : 0
    const grayscale = Math.round(
      Math.min(1, Math.max(0, normalized)) * 255,
    )
    const pixelOffset = index * 4
    pixels[pixelOffset] = grayscale
    pixels[pixelOffset + 1] = grayscale
    pixels[pixelOffset + 2] = grayscale
    pixels[pixelOffset + 3] = 255
  }
  return pixels
}
