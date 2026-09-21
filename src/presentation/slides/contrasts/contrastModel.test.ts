import { expect, it } from 'vitest'
import { contrastLabel, contrastPulses, contrastTissueAt, createContrastTissues, recoveryFraction, spinEchoIntensity, validContrastTiming } from './contrastModel'

it('uses independent ensembles for all four tissues, with real offsets and the original tissue properties', () => {
  const tissues = createContrastTissues(1.5)
  expect(tissues.map(t => t.id)).toEqual(['cerebrospinal-fluid', 'cortical-bone', 'white-matter', 'gray-matter'])
  expect(tissues.flatMap(t => t.ensembles)).toHaveLength(24)
  for (const tissue of tissues) {
    expect(tissue.ensembles).toHaveLength(6)
    expect(new Set(tissue.ensembles.map(e => e.angularFrequencyOffsetRadiansPerMillisecond)).size).toBe(6)
    for (const ensemble of tissue.ensembles) {
      expect(ensemble.longitudinalRelaxationTimeMilliseconds).toBe(tissue.state.longitudinalRelaxationTimeMilliseconds)
      expect(ensemble.transverseRelaxationTimeMilliseconds).toBe(tissue.state.transverseRelaxationTimeMilliseconds)
      expect(ensemble.equilibriumMagnetization).toBe(tissue.state.equilibriumMagnetization)
    }
  }
  tissues[0].ensembles[0].spinPackets[0].weight = 0
  expect(tissues[1].ensembles[0].spinPackets[0].weight).toBe(1)
})

it.each([null, 500, 3000, 12000])('matches the spin-echo image equation at the simulated echo, with TR=%s', tr => {
  const tissues = createContrastTissues(1.5)
  const timing = { tr, te: 100 }
  expect(contrastPulses(100)).toEqual([{ timeMilliseconds: 0, kind: '90-y' }, { timeMilliseconds: 50, kind: '180-x' }])
  for (const tissue of tissues) {
    const density = tissue.excitation.equilibriumScale!
    const t1 = tissue.state.longitudinalRelaxationTimeMilliseconds
    const t2 = tissue.state.transverseRelaxationTimeMilliseconds
    expect(contrastTissueAt(tissue, timing.te, timing).signal).toBeCloseTo(spinEchoIntensity(density, t1, t2, timing), 12)
    expect(contrastTissueAt(tissue, 1000, timing).longitudinal).toBeCloseTo(density * (1 - Math.exp(-1000 / t1)), 12)
  }
})

it('keeps dephasing away from the echo and does not replace it with an arbitrary envelope', () => {
  const csf = createContrastTissues(1.5)[0]
  const noEcho = contrastTissueAt(csf, 1500, { tr: null, te: null }).signal
  const intrinsic = Math.exp(-1500 / csf.state.transverseRelaxationTimeMilliseconds)
  expect(noEcho).toBeLessThan(intrinsic * 0.2)
  expect(contrastTissueAt(csf, 1500, { tr: null, te: 1500 }).signal).toBeCloseTo(intrinsic, 12)
})

it('treats unset controls as disabled weighting, rejects impossible timings, and labels joint TR/TE contrast', () => {
  expect(spinEchoIntensity(0.77, 900, 80, { tr: null, te: null })).toBe(0.77)
  expect(recoveryFraction(900, 0.000001)).toBeGreaterThan(0)
  expect(spinEchoIntensity(0, 0, 0, { tr: 500, te: 20 })).toBe(0)
  expect(spinEchoIntensity(1, 900, 0, { tr: 500, te: 20 })).toBe(0)
  for (const timing of [{ tr: 50, te: 100 }, { tr: 100, te: 100 }, { tr: 0, te: null }, { tr: NaN, te: 20 }]) {
    expect(validContrastTiming(timing)).toBe(false)
    expect(spinEchoIntensity(1, 900, 80, timing)).toBe(0)
  }
  expect(contrastLabel({ tr: null, te: null })).toBe('Spin Density Image')
  expect(contrastLabel({ tr: 500, te: 10 })).toBe('T₁ Weighted Image')
  expect(contrastLabel({ tr: 5000, te: 100 })).toBe('T₂ Weighted Image')
  expect(contrastLabel({ tr: 5000, te: 10 })).toBe('Spin Density Image')
  expect(contrastLabel({ tr: 500, te: 100 })).toBe('Mixed T₁ / T₂ Weighted Image')
  expect(contrastLabel({ tr: 50, te: 100 })).toBe('Choose TE shorter than TR')
})
