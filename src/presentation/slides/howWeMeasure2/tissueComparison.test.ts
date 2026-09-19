import { expect, it } from 'vitest'
import { HydrogenEnsemble } from '../../../models/HydrogenEnsemble'
import { SAMPLE_COLORS } from '../../../models/sampleColors'
import { comparisonSampleTimes, createComparisonTissues, tissueRelaxationAt, zoomComparisonWindow } from './tissueComparison'

it.each([1.5, 3, 7] as const)('uses the simulator colors, density and relaxation properties at %s T', field => {
  const tissues = createComparisonTissues(field, [{ timeMilliseconds: 1000, kind: '90-y' }])
  for (const tissue of tissues) {
    const ensemble = new HydrogenEnsemble(0, 1, 1, 3)
    ensemble.samplePreset = tissue.id
    const sample = ensemble.sampleProperties(field)
    expect(tissue.color).toBe(SAMPLE_COLORS[tissue.id])
    expect(tissue.state.longitudinalRelaxationTimeMilliseconds).toBe(sample.longitudinalRelaxationTimeMilliseconds)
    expect(tissue.state.transverseRelaxationTimeMilliseconds).toBe(sample.transverseRelaxationTimeMilliseconds)
    expect(tissue.state.equilibriumMagnetization).toBeCloseTo(ensemble.magneticProperties(field, 'uniform').boltzmannMagnetization, 20)
    const scale = sample.totalProtonCount / 6.6e19
    expect(tissue.excitation.equilibriumScale).toBeCloseTo(scale, 12)
    expect(tissueRelaxationAt(tissue, 999).signal).toBe(0)
    expect(tissueRelaxationAt(tissue, 999).longitudinal).toBeCloseTo(scale, 12)
    expect(tissueRelaxationAt(tissue, 1000).signal).toBeCloseTo(scale, 12)
    const atT2 = tissueRelaxationAt(tissue, 1000 + sample.transverseRelaxationTimeMilliseconds)
    expect(atT2.signal).toBeCloseTo(scale / Math.E, 12)
    const atT1 = tissueRelaxationAt(tissue, 1000 + sample.longitudinalRelaxationTimeMilliseconds)
    expect(atT1.longitudinal).toBeCloseTo(scale * (1 - 1 / Math.E), 12)
  }
})

it('retains submillisecond bone samples and the full recovery timeline', () => {
  const times = comparisonSampleTimes(createComparisonTissues(1.5))
  expect(times).toContain(0)
  expect(times).toContain(-0.000001)
  expect(times).toContain(0.04)
  expect(times).toContain(0.4)
  expect(times.at(-1)).toBe(12000)
  expect(times).toEqual([...new Set(times)].sort((a, b) => a - b))
})

it('bounds wheel zoom between 1 ms and 12 s and supports zooming both ways', () => {
  expect(zoomComparisonWindow(6000, -100)).toBeLessThan(6000)
  expect(zoomComparisonWindow(6000, 100)).toBeGreaterThan(6000)
  expect(zoomComparisonWindow(1, -300)).toBe(1)
  expect(zoomComparisonWindow(12000, 300)).toBe(12000)
  expect(zoomComparisonWindow(6000, 0)).toBe(6000)
})
