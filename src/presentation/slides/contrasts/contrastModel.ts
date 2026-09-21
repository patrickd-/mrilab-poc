import type { FidEnsembleState, RfPulseEvent } from '../../../simulation/fid'
import { PROTON_GYROMAGNETIC_RATIO } from '../../../models/HydrogenEnsemble'
import { createComparisonTissues, type ComparisonTissue } from '../howWeMeasure2/tissueComparison'
import { createContrastDephasing, type ContrastDephasing, type ContrastFrequencySample } from './contrastDephasing'

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
  return 'Spin/Proton Density Image'
}

export interface ContrastTissue extends ComparisonTissue {
  ensembles: readonly (FidEnsembleState & ContrastFrequencySample)[]
  dephasing: ContrastDephasing
}

/** Independent tissue states share a fixed, densely sampled field distribution.
 * All ensembles within one tissue have identical T1/T2 and ideal RF pulses;
 * only their frequency offsets and population weights differ.
 * Earlier race/dephasing slides retain their slower, sparse offsets. */
export function createContrastTissues(fieldStrengthTesla: number): ContrastTissue[] {
  const dephasing = createContrastDephasing()
  return createComparisonTissues(fieldStrengthTesla).map(tissue => ({
    ...tissue, dephasing,
    ensembles: dephasing.samples.map((sample, index) => {
      const omega = sample.angularFrequencyOffsetRadiansPerMillisecond
      const fieldVariationTesla = omega * 1000 / PROTON_GYROMAGNETIC_RATIO
      return { ...tissue.state, ...sample, index, column: index, row: 0, gridSize: dephasing.samples.length,
        fieldVariationTesla,
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
 * it is not a full multi-cycle steady-state sequence.
 *
 * Exact Bloch factorization for this slide's 90-y / optional 180-x sequence:
 * each transverse vector is exp(-t/T2) * exp(i*omega*u), with u=t before
 * refocusing and u=t-TE afterwards. Summing the weighted phasors once lets all
 * tissues reuse the same dephasing without evaluating 512 pulse histories per
 * tissue per plotted point. This is not a fitted or manufactured echo envelope. */
export function contrastTissueAt(tissue: ContrastTissue, time: number, timing: ContrastTiming) {
  const scale = tissue.excitation.equilibriumScale ?? 1
  if (time < 0) return { signal: 0, longitudinal: scale }
  const preparation = recoveryFraction(tissue.state.longitudinalRelaxationTimeMilliseconds, timing.tr)
  const unwoundTime = timing.te !== null && time >= timing.te / 2 ? time - timing.te : time
  const t2 = tissue.state.transverseRelaxationTimeMilliseconds
  const transverseDecay = time === 0 ? 1 : t2 > 0 ? Math.exp(-time / t2) : 0
  return { signal: tissue.dephasing.coherenceAt(unwoundTime) * transverseDecay * scale * preparation,
    longitudinal: recoveryFraction(tissue.state.longitudinalRelaxationTimeMilliseconds, time) * scale }
}
