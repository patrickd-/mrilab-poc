import type { SamplePresetId } from '../models/HydrogenEnsemble'

function insideEllipse(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
) {
  return (
    ((x - centerX) / radiusX) ** 2 +
      ((y - centerY) / radiusY) ** 2 <=
    1
  )
}

/**
 * Produces a deliberately schematic axial head: air, a cortical-bone skull,
 * CSF around the brain and in its ventricles, a gray-matter cortex, and a
 * white-matter interior. Coordinates are normalized so it scales with the
 * ensemble grid.
 */
export function simplifiedBrainSampleAt(
  column: number,
  row: number,
  gridSize: number,
): SamplePresetId {
  const center = (gridSize - 1) / 2
  const halfSize = gridSize / 2
  const x = (column - center) / halfSize
  const y = (row - center) / halfSize

  const insideHead = insideEllipse(x, y, 0, 0, 0.88, 0.94)
  if (!insideHead) return 'air'

  const insideSkull = insideEllipse(x, y, 0, 0, 0.8, 0.86)
  if (!insideSkull) return 'cortical-bone'

  const insideLeftBrainLobe = insideEllipse(
    x,
    y,
    -0.11,
    -0.01,
    0.66,
    0.77,
  )
  const insideRightBrainLobe = insideEllipse(
    x,
    y,
    0.11,
    -0.01,
    0.66,
    0.77,
  )
  if (!insideLeftBrainLobe && !insideRightBrainLobe) {
    return 'cerebrospinal-fluid'
  }

  // The superior interhemispheric fissure remains CSF-filled.
  if (Math.abs(x) <= 0.022 && y < -0.08) {
    return 'cerebrospinal-fluid'
  }

  const insideLeftWhiteMatter = insideEllipse(
    x,
    y,
    -0.16,
    0.01,
    0.47,
    0.61,
  )
  const insideRightWhiteMatter = insideEllipse(
    x,
    y,
    0.16,
    0.01,
    0.47,
    0.61,
  )

  // Paired lateral ventricles and a narrow third ventricle.
  const insideLeftVentricle = insideEllipse(
    x,
    y,
    -0.11,
    0.02,
    0.072,
    0.2,
  )
  const insideRightVentricle = insideEllipse(
    x,
    y,
    0.11,
    0.02,
    0.072,
    0.2,
  )
  const insideThirdVentricle = insideEllipse(
    x,
    y,
    0,
    0.06,
    0.026,
    0.14,
  )
  if (
    insideLeftVentricle ||
    insideRightVentricle ||
    insideThirdVentricle
  ) {
    return 'cerebrospinal-fluid'
  }

  // A pair of simplified deep-gray nuclei breaks up the white-matter field.
  const insideDeepGrayNucleus = insideEllipse(
    Math.abs(x),
    y,
    0.24,
    0.02,
    0.075,
    0.13,
  )
  if (insideDeepGrayNucleus) return 'gray-matter'

  return insideLeftWhiteMatter || insideRightWhiteMatter
    ? 'white-matter'
    : 'gray-matter'
}
