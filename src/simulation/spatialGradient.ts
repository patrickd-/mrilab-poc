export interface SpatialGradientProfile {
  endFieldOffsetMillitesla: number
  startFieldOffsetMillitesla: number
}

export interface SpatialGradientProfiles {
  x: SpatialGradientProfile
  y: SpatialGradientProfile
}

export const MAXIMUM_SPATIAL_GRADIENT_MILLITESLA_PER_METER = 40
export const DEFAULT_SPATIAL_GRADIENT_FIELD_OF_VIEW_MILLIMETERS = 128

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

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
