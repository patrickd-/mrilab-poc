export const CONTRAST_ENSEMBLE_COUNT = 512
const MAX_CACHED_TIMES = 8192

export interface ContrastFrequencySample {
  readonly angularFrequencyOffsetRadiansPerMillisecond: number
  /** Fraction of the tissue population represented by this frequency sample. */
  readonly populationWeight: number
}

/** Calibrate a Gaussian frequency population to the tissue's target T2*:
 * exp(-T2star/T2) * |sum(w * exp(i*omega*T2star))| = exp(-1).
 * For an unbounded Gaussian, sigmaOmega = sqrt(2*(1-T2star/T2))/T2star.
 * The numerical solve below accounts for the finite ±4-sigma sampled support.
 * T2* is an effective 1/e time, not a claim of mono-exponential decay. */
export function createContrastDephasing(t2Milliseconds: number, targetT2StarMilliseconds: number) {
  if (!Number.isFinite(t2Milliseconds) || !Number.isFinite(targetT2StarMilliseconds) ||
    t2Milliseconds <= 0 || targetT2StarMilliseconds <= 0 || targetT2StarMilliseconds > t2Milliseconds) {
    throw new Error('Contrast calibration requires 0 < T2* <= T2')
  }
  const unnormalized = Array.from({ length: CONTRAST_ENSEMBLE_COUNT }, (_, index) => {
    const standardOffset = 4 * (2 * index / (CONTRAST_ENSEMBLE_COUNT - 1) - 1)
    return {
      standardOffset,
      populationWeight: Math.exp(-0.5 * standardOffset ** 2),
    }
  })
  const totalWeight = unnormalized.reduce((sum, sample) => sum + sample.populationWeight, 0)
  let sigmaOmega = 0
  if (targetT2StarMilliseconds < t2Milliseconds) {
    const targetCoherence = Math.exp(targetT2StarMilliseconds / t2Milliseconds - 1)
    let low = 0, high = 2
    for (let iteration = 0; iteration < 48; iteration++) {
      const phaseScale = (low + high) / 2
      const coherence = unnormalized.reduce((sum, sample) =>
        sum + sample.populationWeight * Math.cos(sample.standardOffset * phaseScale), 0) / totalWeight
      if (coherence > targetCoherence) low = phaseScale
      else high = phaseScale
    }
    sigmaOmega = (low + high) / 2 / targetT2StarMilliseconds
  }
  const samples = Object.freeze(unnormalized.map(sample => Object.freeze({
    angularFrequencyOffsetRadiansPerMillisecond: sample.standardOffset * sigmaOmega,
    populationWeight: sample.populationWeight / totalWeight,
  })))
  // Each tissue keeps a bounded cache; TR edits reuse its frequency sums.
  const cache = new Map<number, number>()
  const coherenceAt = (unwoundTimeMilliseconds: number) => {
    const time = Math.abs(unwoundTimeMilliseconds)
    if (time === 0 || sigmaOmega === 0) return 1
    const cached = cache.get(time)
    if (cached !== undefined) return cached
    let x = 0, y = 0
    for (const sample of samples) {
      const phase = sample.angularFrequencyOffsetRadiansPerMillisecond * time
      x += sample.populationWeight * Math.cos(phase)
      y += sample.populationWeight * Math.sin(phase)
    }
    const coherence = Math.hypot(x, y)
    if (cache.size >= MAX_CACHED_TIMES) cache.clear()
    cache.set(time, coherence)
    return coherence
  }
  return { samples, coherenceAt, targetT2StarMilliseconds,
    frequencyStandardDeviationHz: sigmaOmega * 1000 / (2 * Math.PI) }
}

export type ContrastDephasing = ReturnType<typeof createContrastDephasing>
