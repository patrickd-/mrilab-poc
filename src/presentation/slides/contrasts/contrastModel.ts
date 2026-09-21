import { fidEnsembleMagnetizationStateAt, type FidEnsembleState, type RfPulseEvent } from '../../../simulation/fid'
import { PROTON_GYROMAGNETIC_RATIO } from '../../../models/HydrogenEnsemble'
import { createComparisonTissues, type ComparisonTissue } from '../howWeMeasure2/tissueComparison'

export interface ContrastTiming { tr: number | null; te: number | null }
export const EMPTY_CONTRAST_TIMING: ContrastTiming = { tr: null, te: null }

export function validContrastTiming({ tr, te }: ContrastTiming) {
  return (tr === null || Number.isFinite(tr) && tr > 0) &&
    (te === null || Number.isFinite(te) && te > 0) && (tr === null || te === null || te < tr)
}

/** Teaching spin-echo approximation, fixed receive gain:
 * S = rho (1-exp(-TR/T1)) exp(-TE/T2).
 * An unset control disables its weighting (TR -> infinity, TE -> zero).
 * https://www.cis.rit.edu/htbooks/mri/chap-10/chap-10.htm */
export function recoveryFraction(t1: number, tr: number | null) {
  return tr === null ? 1 : t1 > 0 ? -Math.expm1(-tr / t1) : 1
}

export function spinEchoIntensity(density: number, t1: number, t2: number, timing: ContrastTiming) {
  if (density <= 0 || !validContrastTiming(timing)) return 0
  const decay = timing.te === null ? 1 : t2 > 0 ? Math.exp(-timing.te / t2) : 0
  return density * recoveryFraction(t1, timing.tr) * decay
}

export function contrastLabel(timing: ContrastTiming) {
  if (!validContrastTiming(timing)) return 'Choose TE shorter than TR'
  const t1Weighted = timing.tr !== null && timing.tr < 2000
  const t2Weighted = timing.te !== null && timing.te >= 50
  if (t1Weighted && t2Weighted) return 'Mixed T₁ / T₂ Weighted Image'
  if (t1Weighted) return 'T₁ Weighted Image'
  if (t2Weighted) return 'T₂ Weighted Image'
  return 'Spin Density Image'
}

export interface ContrastTissue extends ComparisonTissue { ensembles: readonly FidEnsembleState[] }
const CONTRAST_ENSEMBLE_COUNT = 6
const CONTRAST_FREQUENCY_SPREAD_HZ = 20

/** Four independent sets of six CSF/bone/white/gray ensembles, not a fabricated
 * T2-star curve. This slide uses a stronger ±20 Hz teaching gradient so that
 * white/gray matter dephase before their intrinsic T2 decay hides the echo.
 * The earlier race and dephasing slides retain their slower offsets. */
export function createContrastTissues(fieldStrengthTesla: number): ContrastTissue[] {
  return createComparisonTissues(fieldStrengthTesla).map(tissue => ({
    ...tissue,
    ensembles: Array.from({ length: CONTRAST_ENSEMBLE_COUNT }, (_, index) => {
      const frequencyHz = CONTRAST_FREQUENCY_SPREAD_HZ * (2 * index / (CONTRAST_ENSEMBLE_COUNT - 1) - 1)
      const omega = 2 * Math.PI * frequencyHz / 1000
      const fieldVariationTesla = omega * 1000 / PROTON_GYROMAGNETIC_RATIO
      return { ...tissue.state, index, column: index, row: 0, gridSize: CONTRAST_ENSEMBLE_COUNT,
        angularFrequencyOffsetRadiansPerMillisecond: omega, fieldVariationTesla,
        fieldVariationPpm: fieldVariationTesla / fieldStrengthTesla * 1e6,
        spinPackets: [{ offsetXMillimeters: 0, offsetYMillimeters: 0,
          angularFrequencyOffsetRadiansPerMillisecond: omega, weight: 1 }],
      }
    }),
  }))
}

export function contrastPulses(te: number | null): RfPulseEvent[] {
  return [{ timeMilliseconds: 0, kind: '90-y' }, ...(te === null ? [] : [{
    timeMilliseconds: te / 2, kind: '180-x' as const,
  }])]
}

/** The lower graph is the recovery available before the next excitation.
 * The upper graph applies that preparation to a fresh 90/180 acquisition.
 * This factorized preparation is the same idealization as the image equation;
 * it is not a full multi-cycle steady-state sequence. */
export function contrastTissueAt(tissue: ContrastTissue, time: number, timing: ContrastTiming) {
  const scale = tissue.excitation.equilibriumScale ?? 1
  const pulses = contrastPulses(timing.te)
  const preparation = recoveryFraction(tissue.state.longitudinalRelaxationTimeMilliseconds, timing.tr)
  let x = 0, y = 0, z = 0
  for (const ensemble of tissue.ensembles) {
    const signal = fidEnsembleMagnetizationStateAt(ensemble, time, pulses)
    const recovery = fidEnsembleMagnetizationStateAt(ensemble, time, [pulses[0]])
    x += signal.xFraction; y += signal.yFraction; z += recovery.zFraction
  }
  return { signal: Math.hypot(x, y) / tissue.ensembles.length * scale * preparation,
    longitudinal: z / tissue.ensembles.length * scale }
}
