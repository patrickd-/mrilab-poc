import { PROTON_GYROMAGNETIC_RATIO } from '../../../models/HydrogenEnsemble'
import type { FidEnsembleState } from '../../../simulation/fid'
import { createPresentationCsfState, presentationMagnetizationAt, type ProtonExcitation } from '../howWeMeasure/protonExcitation'

export const CSF_GRID_SIDE = 6
export const CSF_LAYOUT_MS = 1400
export const CSF_FREQUENCY_SPREAD_HZ = 0.4

export function csfFieldProfile(x: number, y: number) {
  return 0.75 * x + 0.32 * y + 0.17 * x * y + 0.08 * y * y
}

/** Illustrative smooth B0 imperfection, not a measured scanner field map.
 * Small Hz offsets allow dephasing to be followed on the real CSF T2 timescale.
 * Field-line curvature/colors are exaggerated independently for visibility. */
export function csfFrequencyOffsetHz(x: number, y: number) {
  return CSF_FREQUENCY_SPREAD_HZ * csfFieldProfile(x, y)
}

export function createCsfGrid(fieldStrengthTesla: number, nonUniform: boolean): FidEnsembleState[] {
  const base = createPresentationCsfState(fieldStrengthTesla)
  return Array.from({ length: CSF_GRID_SIDE ** 2 }, (_, index) => {
    const column = index % CSF_GRID_SIDE
    const row = Math.floor(index / CSF_GRID_SIDE)
    const x = 2 * column / (CSF_GRID_SIDE - 1) - 1
    const y = 1 - 2 * row / (CSF_GRID_SIDE - 1)
    const omega = nonUniform ? 2 * Math.PI * csfFrequencyOffsetHz(x, y) / 1000 : 0
    const fieldVariationTesla = omega * 1000 / PROTON_GYROMAGNETIC_RATIO
    return { ...base, index, column, row, gridSize: CSF_GRID_SIDE,
      angularFrequencyOffsetRadiansPerMillisecond: omega,
      fieldVariationTesla,
      fieldVariationPpm: fieldVariationTesla / fieldStrengthTesla * 1e6,
      spinPackets: [{ offsetXMillimeters: 0, offsetYMillimeters: 0,
        angularFrequencyOffsetRadiansPerMillisecond: omega, weight: 1 }],
    }
  })
}

/** Split/stacked views represent the same sample: average complex vectors,
 * never magnitudes, so phases cancel and subdivision does not change M0. */
export function csfCollectionAt(states: readonly FidEnsembleState[], excitation: ProtonExcitation, time: number) {
  let x = 0, y = 0, z = 0
  for (const state of states) {
    const m = presentationMagnetizationAt(state, excitation, time)
    x += m.x; y += m.y; z += m.z
  }
  const count = states.length || 1
  return { signal: Math.hypot(x, y) / count, longitudinal: z / count }
}
