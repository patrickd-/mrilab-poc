export const CONTRAST_ENSEMBLE_COUNT = 512
const FREQUENCY_SPREAD_HZ = 20
const FREQUENCY_STANDARD_DEVIATION_HZ = 5
const MAX_CACHED_TIMES = 8192

export interface ContrastFrequencySample {
  readonly angularFrequencyOffsetRadiansPerMillisecond: number
  /** Fraction of the tissue population represented by this frequency sample. */
  readonly populationWeight: number
}

/** Fixed teaching distribution: Gaussian weights on a dense ±20 Hz grid.
 * Four standard deviations make the hard boundary negligible. Grid recurrences
 * occur every 12.775 s, outside the plots' maximum 12 s acquisition window. */
export function createContrastDephasing() {
  const unnormalized = Array.from({ length: CONTRAST_ENSEMBLE_COUNT }, (_, index) => {
    const frequencyHz = FREQUENCY_SPREAD_HZ * (2 * index / (CONTRAST_ENSEMBLE_COUNT - 1) - 1)
    return {
      angularFrequencyOffsetRadiansPerMillisecond: 2 * Math.PI * frequencyHz / 1000,
      populationWeight: Math.exp(-0.5 * (frequencyHz / FREQUENCY_STANDARD_DEVIATION_HZ) ** 2),
    }
  })
  const totalWeight = unnormalized.reduce((sum, sample) => sum + sample.populationWeight, 0)
  const samples = Object.freeze(unnormalized.map(sample => Object.freeze({ ...sample,
    populationWeight: sample.populationWeight / totalWeight,
  })))
  // Shared by the four tissues. A bounded, slide-local cache avoids repeating
  // the 512 phasor sum for different T1/T2 values, TR edits, or graph sizes.
  const cache = new Map<number, number>()
  const coherenceAt = (unwoundTimeMilliseconds: number) => {
    const time = Math.abs(unwoundTimeMilliseconds)
    if (time === 0) return 1
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
  return { samples, coherenceAt }
}

export type ContrastDephasing = ReturnType<typeof createContrastDephasing>
