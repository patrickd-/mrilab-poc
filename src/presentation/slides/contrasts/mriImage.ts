import density from '../../mri_rendering/spin_density_relative.json'
import t1 from '../../mri_rendering/t1_relaxation_ms.json'
import t2 from '../../mri_rendering/t2_decay_ms.json'
import { spinEchoIntensity, type ContrastTiming } from './contrastModel'
import type { ComparisonTissue } from '../howWeMeasure2/tissueComparison'

export interface TissueMaps { density: readonly (readonly number[])[]; t1: readonly (readonly number[])[]; t2: readonly (readonly number[])[] }
export const MRI_TISSUE_MAPS: TissueMaps = { density, t1, t2 }

export function validateTissueMaps(maps: TissueMaps) {
  const height = maps.density.length
  const width = maps.density[0]?.length ?? 0
  if (!width || !height || [maps.density, maps.t1, maps.t2].some(matrix => matrix.length !== height ||
    matrix.some(row => row.length !== width || row.some(value => !Number.isFinite(value) || value < 0)))) {
    throw new Error('MRI tissue maps must be matching rectangular matrices of nonnegative finite values')
  }
  return { width, height }
}

export const MRI_MAP_SIZE = validateTissueMaps(MRI_TISSUE_MAPS)

/** Identify only the four agreed source classes by their entire original tuple.
 * Densities alone are not tissue labels: e.g. several unrelated classes use 1.
 * These are source identifiers, not a second table of simulation parameters. */
const SOURCE_TISSUE_CLASSES = [
  { key: '0.05,250,5', id: 'cortical-bone' },
  { key: '1,2569,329', id: 'cerebrospinal-fluid' },
  { key: '0.86,833,83', id: 'gray-matter' },
  { key: '0.77,500,70', id: 'white-matter' },
] as const

/** Derive display maps from the same tissue objects used by the graphs.
 * Always call with the original maps, not an already-aligned copy. Original
 * arrays, anatomy, background, and all unmatched parameter tuples are retained. */
export function alignMriTissueMaps(maps: TissueMaps, tissues: readonly ComparisonTissue[]): TissueMaps {
  const { width, height } = validateTissueMaps(maps)
  const replacements = new Map(SOURCE_TISSUE_CLASSES.map(source => {
    const tissue = tissues.find(tissue => tissue.id === source.id)
    if (!tissue) throw new Error(`Missing graph tissue for MRI map alignment: ${source.id}`)
    return [source.key as string, tissue] as const
  }))
  const aligned = {
    density: maps.density.map(row => [...row]),
    t1: maps.t1.map(row => [...row]),
    t2: maps.t2.map(row => [...row]),
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tissue = replacements.get(`${maps.density[y][x]},${maps.t1[y][x]},${maps.t2[y][x]}`)
      if (!tissue) continue
      aligned.density[y][x] = tissue.excitation.equilibriumScale ?? 1
      aligned.t1[y][x] = tissue.state.longitudinalRelaxationTimeMilliseconds
      aligned.t2[y][x] = tissue.state.transverseRelaxationTimeMilliseconds
    }
  }
  return aligned
}

/** Row-major indexing is deliberately y*width+x: do not transpose/flip maps.
 * All settings use one fixed linear [0,1] display window, never per-image gain. */
export function renderMriPixels(maps: TissueMaps, timing: ContrastTiming) {
  const height = maps.density.length, width = maps.density[0].length
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const signal = spinEchoIntensity(maps.density[y][x], maps.t1[y][x], maps.t2[y][x], timing)
      const value = Math.round(255 * Math.max(0, Math.min(1, signal)))
      const index = (y * width + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value
      pixels[index + 3] = 255
    }
  }
  return pixels
}
