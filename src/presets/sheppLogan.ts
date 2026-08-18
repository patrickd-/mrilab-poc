import type { SamplePresetId } from '../models/HydrogenEnsemble'

interface TissueEllipse {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
  rotationDegrees: number
  samplePreset: SamplePresetId
}

/**
 * Tissue-mapped subset of the 2D MR Shepp-Logan phantom described by Gach,
 * Tanase, and Boada (doi:10.1109/ICSEng.2008.15). The lab has no scalp or tumor
 * presets, so the unsupported scalp shell is omitted and the small
 * high-spin-density inclusions use CSF as the closest available proton-density
 * proxy.
 */
const SHEPP_LOGAN_TISSUE_ELLIPSES: ReadonlyArray<TissueEllipse> = [
  {
    centerX: 0,
    centerY: 0,
    radiusX: 0.69,
    radiusY: 0.92,
    rotationDegrees: 0,
    samplePreset: 'cortical-bone',
  },
  {
    centerX: 0,
    centerY: -0.0184,
    radiusX: 0.6624,
    radiusY: 0.874,
    rotationDegrees: 0,
    samplePreset: 'cerebrospinal-fluid',
  },
  {
    centerX: 0,
    centerY: -0.0184,
    radiusX: 0.6524,
    radiusY: 0.864,
    rotationDegrees: 0,
    samplePreset: 'gray-matter',
  },
  {
    centerX: -0.22,
    centerY: 0,
    radiusX: 0.41,
    radiusY: 0.16,
    rotationDegrees: -72,
    samplePreset: 'cerebrospinal-fluid',
  },
  {
    centerX: 0.22,
    centerY: 0,
    radiusX: 0.31,
    radiusY: 0.11,
    rotationDegrees: 72,
    samplePreset: 'cerebrospinal-fluid',
  },
  {
    centerX: 0,
    centerY: 0.35,
    radiusX: 0.21,
    radiusY: 0.25,
    rotationDegrees: 0,
    samplePreset: 'white-matter',
  },
  {
    centerX: 0,
    centerY: 0.1,
    radiusX: 0.046,
    radiusY: 0.046,
    rotationDegrees: 0,
    samplePreset: 'cerebrospinal-fluid',
  },
  {
    centerX: 0,
    centerY: -0.1,
    radiusX: 0.046,
    radiusY: 0.046,
    rotationDegrees: 0,
    samplePreset: 'cerebrospinal-fluid',
  },
  {
    centerX: -0.08,
    centerY: -0.605,
    radiusX: 0.046,
    radiusY: 0.023,
    rotationDegrees: 0,
    samplePreset: 'cerebrospinal-fluid',
  },
  {
    centerX: 0,
    centerY: -0.605,
    radiusX: 0.023,
    radiusY: 0.023,
    rotationDegrees: 0,
    samplePreset: 'cerebrospinal-fluid',
  },
  {
    centerX: 0.06,
    centerY: -0.605,
    radiusX: 0.046,
    radiusY: 0.023,
    rotationDegrees: -90,
    samplePreset: 'cerebrospinal-fluid',
  },
]

function insideRotatedEllipse(
  x: number,
  y: number,
  ellipse: TissueEllipse,
) {
  const rotationRadians = (ellipse.rotationDegrees * Math.PI) / 180
  const cosine = Math.cos(rotationRadians)
  const sine = Math.sin(rotationRadians)
  const offsetX = x - ellipse.centerX
  const offsetY = y - ellipse.centerY
  const rotatedX = offsetX * cosine + offsetY * sine
  const rotatedY = -offsetX * sine + offsetY * cosine

  return (
    (rotatedX / ellipse.radiusX) ** 2 +
      (rotatedY / ellipse.radiusY) ** 2 <=
    1
  )
}

export function sheppLoganSampleAt(
  column: number,
  row: number,
  gridSize: number,
): SamplePresetId {
  const center = (gridSize - 1) / 2
  const halfSize = gridSize / 2
  const x = (column - center) / halfSize
  const y = (center - row) / halfSize
  let samplePreset: SamplePresetId = 'air'

  SHEPP_LOGAN_TISSUE_ELLIPSES.forEach((ellipse) => {
    if (insideRotatedEllipse(x, y, ellipse)) {
      samplePreset = ellipse.samplePreset
    }
  })

  return samplePreset
}
