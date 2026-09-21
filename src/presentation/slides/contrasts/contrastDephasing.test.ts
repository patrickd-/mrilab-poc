import { expect, it, vi } from 'vitest'
import { createContrastDephasing } from './contrastDephasing'

it('densely samples a normalized symmetric Gaussian population with tissue-calibrated support', () => {
  const { samples, frequencyStandardDeviationHz } = createContrastDephasing(80, 66.2)
  expect(samples).toHaveLength(512)
  expect(samples.reduce((sum, sample) => sum + sample.populationWeight, 0)).toBeCloseTo(1, 14)
  expect(frequencyStandardDeviationHz).toBeCloseTo(1.412, 2)
  expect(samples[0].angularFrequencyOffsetRadiansPerMillisecond * 1000 / (2 * Math.PI)).toBeCloseTo(-4 * frequencyStandardDeviationHz)
  expect(samples[511].angularFrequencyOffsetRadiansPerMillisecond * 1000 / (2 * Math.PI)).toBeCloseTo(4 * frequencyStandardDeviationHz)
  expect(samples[0].populationWeight).toBeLessThan(samples[255].populationWeight * 0.0004)
  for (let i = 0; i < samples.length; i++) {
    expect(samples[i].populationWeight).toBeGreaterThan(0)
    expect(samples[i].populationWeight).toBeCloseTo(samples[511 - i].populationWeight, 14)
  }
  const spacing = (samples[1].angularFrequencyOffsetRadiansPerMillisecond -
    samples[0].angularFrequencyOffsetRadiansPerMillisecond) * 1000 / (2 * Math.PI)
  expect(1000 / spacing).toBeGreaterThan(12000)
})

it.each([[2100, 550], [80, 66.2], [84, 84], [0.4, 0.4],
  [2000, 333.5], [71, 53.2], [72, 66], [1000, 168], [47, 26.8], [47, 33.2]])(
  'calibrates T2=%s / T2*=%s to 1/e and stays close to a smooth decay throughout the 12 s plot', (t2, t2Star) => {
  const { coherenceAt, frequencyStandardDeviationHz } = createContrastDephasing(t2, t2Star)
  expect(coherenceAt(0)).toBe(1)
  const signalAt = (time: number) => coherenceAt(time) * Math.exp(-time / t2)
  expect(signalAt(t2Star)).toBeCloseTo(Math.exp(-1), 12)
  expect(signalAt(t2Star * 0.99)).toBeGreaterThan(Math.exp(-1))
  expect(signalAt(t2Star * 1.01)).toBeLessThan(Math.exp(-1))
  let largestError = 0
  for (let time = 0; time <= 12000; time += 5) {
    const gaussian = Math.exp(-time / t2 - 0.5 * (2 * Math.PI * frequencyStandardDeviationHz * time / 1000) ** 2)
    largestError = Math.max(largestError, Math.abs(signalAt(time) - gaussian))
  }
  expect(largestError).toBeLessThan(0.0001)
})

it('adds no dephasing when the target already equals intrinsic T2', () => {
  const distribution = createContrastDephasing(84, 84)
  expect(distribution.frequencyStandardDeviationHz).toBe(0)
  expect(distribution.samples.every(sample => sample.angularFrequencyOffsetRadiansPerMillisecond === 0)).toBe(true)
  expect(distribution.coherenceAt(12000)).toBe(1)
})

it.each([[0, 0], [80, 0], [80, 90], [NaN, 30], [80, Infinity]])('rejects impossible calibration T2=%s / T2*=%s', (t2, t2Star) => {
  expect(() => createContrastDephasing(t2, t2Star)).toThrow('0 < T2* <= T2')
})

it('reuses the phasor sum at equal unwound times without losing small signals or zero-time coherence', () => {
  const { coherenceAt } = createContrastDephasing(80, 66.2)
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
