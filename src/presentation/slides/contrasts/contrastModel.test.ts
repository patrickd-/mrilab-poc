import { expect, it } from 'vitest'
import { PROTON_GYROMAGNETIC_RATIO } from '../../../models/HydrogenEnsemble'
import { fidEnsembleMagnetizationStateAt } from '../../../simulation/fid'
import { createRaceEnsembles } from '../howWeMeasure3/protonRace'
import { contrastLabel, contrastPulses, contrastTissueAt, createContrastTissues, recoveryFraction, spinEchoIntensity, validContrastTiming } from './contrastModel'

it('uses independent ensembles for all four tissues, with real offsets and the original tissue properties', () => {
  const tissues = createContrastTissues(1.5)
  expect(tissues.map(t => t.id)).toEqual(['cerebrospinal-fluid', 'cortical-bone', 'white-matter', 'gray-matter'])
  expect(tissues.flatMap(t => t.ensembles)).toHaveLength(2048)
  for (const tissue of tissues) {
    expect(tissue.ensembles).toHaveLength(512)
    expect(tissue.dephasing).toBe(tissues[0].dephasing)
    expect(new Set(tissue.ensembles.map(e => e.angularFrequencyOffsetRadiansPerMillisecond)).size).toBe(512)
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

it.each([1.5, 3, 7])('uses ±20 Hz only for contrast ensembles, with consistent field and packet offsets at %s T', field => {
  for (const tissue of createContrastTissues(field)) {
    tissue.ensembles.forEach((ensemble, index) => {
      const omega = 2 * Math.PI * (-20 + 40 * index / 511) / 1000
      expect(ensemble.angularFrequencyOffsetRadiansPerMillisecond).toBeCloseTo(omega, 12)
      expect(ensemble.spinPackets[0].angularFrequencyOffsetRadiansPerMillisecond).toBeCloseTo(omega, 12)
      expect(ensemble.fieldVariationTesla * PROTON_GYROMAGNETIC_RATIO / 1000).toBeCloseTo(omega, 12)
      expect(ensemble.fieldVariationPpm).toBeCloseTo(ensemble.fieldVariationTesla / field * 1e6, 12)
    })
  }
  const race = createRaceEnsembles(field)
  expect(race[0].angularFrequencyOffsetRadiansPerMillisecond * 1000 / (2 * Math.PI)).toBeCloseTo(-0.3, 12)
  expect(race[5].angularFrequencyOffsetRadiansPerMillisecond * 1000 / (2 * Math.PI)).toBeCloseTo(0.3, 12)
})

it('produces visible short-TE echoes for CSF and white/gray matter without restoring lost bone signal', () => {
  for (const tissue of createContrastTissues(1.5)) {
    const timing = { tr: null, te: 100 }
    const noEcho = contrastTissueAt(tissue, 100, { tr: null, te: null }).signal
    const echo = contrastTissueAt(tissue, 100, timing).signal
    const intrinsic = spinEchoIntensity(tissue.excitation.equilibriumScale!,
      tissue.state.longitudinalRelaxationTimeMilliseconds,
      tissue.state.transverseRelaxationTimeMilliseconds, timing)
    expect(echo).toBeCloseTo(intrinsic, 12)
    if (tissue.id === 'cortical-bone') {
      expect(echo).toBeLessThan(1e-12)
    } else {
      expect(noEcho).toBeLessThan(echo * 0.01)
      expect(echo).toBeGreaterThan(0.18)
      expect(contrastTissueAt(tissue, 50, timing).signal).toBeLessThan(echo * 0.6)
      expect(contrastTissueAt(tissue, 150, timing).signal).toBeLessThan(echo * 0.4)
    }
  }
})

it.each([null, 50, 100, 1500])('matches an explicit weighted Bloch sum before/after RF and at the echo, TE=%s', te => {
  for (const tissue of createContrastTissues(1.5)) {
    const timing = { tr: 3000, te }
    const pulses = contrastPulses(te)
    const scale = tissue.excitation.equilibriumScale!
    const preparation = recoveryFraction(tissue.state.longitudinalRelaxationTimeMilliseconds, timing.tr)
    const times = new Set([-1e-6, 0, 10, 25, 75, 200, 12000,
      ...(te === null ? [] : [te / 2 - 1e-6, te / 2, te / 2 + 1e-6, te, te + 25])])
    for (const time of times) {
      let x = 0, y = 0, z = 0
      for (const ensemble of tissue.ensembles) {
        const signal = fidEnsembleMagnetizationStateAt(ensemble, time, pulses)
        const recovery = fidEnsembleMagnetizationStateAt(ensemble, time, [pulses[0]])
        x += signal.xFraction * ensemble.populationWeight
        y += signal.yFraction * ensemble.populationWeight
        z += recovery.zFraction * ensemble.populationWeight
      }
      const result = contrastTissueAt(tissue, time, timing)
      expect(result.signal).toBeCloseTo(Math.hypot(x, y) * scale * preparation, 12)
      expect(result.longitudinal).toBeCloseTo(z * scale, 12)
    }
  }
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
  expect(contrastLabel({ tr: null, te: null })).toBe('Spin/Proton Density Image')
  expect(contrastLabel({ tr: 500, te: 10 })).toBe('T₁ Weighted Image')
  expect(contrastLabel({ tr: 5000, te: 100 })).toBe('T₂ Weighted Image')
  expect(contrastLabel({ tr: 5000, te: 10 })).toBe('Spin/Proton Density Image')
  expect(contrastLabel({ tr: 500, te: 100 })).toBe('Mixed T₁ / T₂ Weighted Image')
  expect(contrastLabel({ tr: 50, te: 100 })).toBe('Choose TE shorter than TR')
})
