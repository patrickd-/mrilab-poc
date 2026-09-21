import { expect, it, vi } from 'vitest'
import { createContrastDephasing } from './contrastDephasing'

it('densely samples a normalized symmetric Gaussian population across ±20 Hz', () => {
  const { samples } = createContrastDephasing()
  expect(samples).toHaveLength(512)
  expect(samples.reduce((sum, sample) => sum + sample.populationWeight, 0)).toBeCloseTo(1, 14)
  expect(samples[0].angularFrequencyOffsetRadiansPerMillisecond * 1000 / (2 * Math.PI)).toBeCloseTo(-20)
  expect(samples[511].angularFrequencyOffsetRadiansPerMillisecond * 1000 / (2 * Math.PI)).toBeCloseTo(20)
  expect(samples[0].populationWeight).toBeLessThan(samples[255].populationWeight * 0.0004)
  for (let i = 0; i < samples.length; i++) {
    expect(samples[i].populationWeight).toBeGreaterThan(0)
    expect(samples[i].populationWeight).toBeCloseTo(samples[511 - i].populationWeight, 14)
  }
  const spacing = (samples[1].angularFrequencyOffsetRadiansPerMillisecond -
    samples[0].angularFrequencyOffsetRadiansPerMillisecond) * 1000 / (2 * Math.PI)
  expect(1000 / spacing).toBeGreaterThan(12000)
})

it('decays smoothly, without the old 125 ms recurrence or visible revivals throughout the 12 s plot', () => {
  const { coherenceAt } = createContrastDephasing()
  expect(coherenceAt(0)).toBe(1)
  let previous = 1
  for (let time = 1; time <= 100; time++) {
    const coherence = coherenceAt(time)
    expect(coherence).toBeLessThan(previous)
    previous = coherence
  }
  expect(coherenceAt(125)).toBeLessThan(0.001)
  let largestResidual = 0
  for (let time = 150; time <= 12000; time += 5) {
    largestResidual = Math.max(largestResidual, coherenceAt(time))
  }
  expect(largestResidual).toBeLessThan(0.0001)
})

it('reuses the phasor sum at equal unwound times without losing small signals or zero-time coherence', () => {
  const { coherenceAt } = createContrastDephasing()
  const cos = vi.spyOn(Math, 'cos')
  try {
    const first = coherenceAt(321)
    expect(cos).toHaveBeenCalledTimes(512)
    expect(coherenceAt(321)).toBe(first)
    expect(coherenceAt(-321)).toBe(first)
    expect(coherenceAt(0)).toBe(1)
    expect(cos).toHaveBeenCalledTimes(512)
  } finally { cos.mockRestore() }
})
