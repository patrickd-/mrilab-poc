import { expect, it } from 'vitest'
import { PROTON_GYROMAGNETIC_RATIO } from '../../../models/HydrogenEnsemble'
import { presentationMagnetizationAt } from '../howWeMeasure/protonExcitation'
import { createCsfGrid, csfCollectionAt, csfEchoPlayPlan } from './csfDephasing'
import { startPlayPlan } from '../../playback/playPlan'
import { fidEnsembleMagnetizationStateAt } from '../../../simulation/fid'

const excitation = { fieldStrengthTesla: 1.5, pulseEvents: [{ timeMilliseconds: 1000, kind: '90-y' as const }] }

it('subdivides CSF into 36 cells without changing normalized T1/T2 or signal strength', () => {
  const grid = createCsfGrid(1.5, false)
  expect(grid).toHaveLength(36)
  expect(new Set(grid.map(state => `${state.column}:${state.row}`)).size).toBe(36)
  for (const time of [999, 1000, 1300, 2500, 8000, 13000]) {
    const m = presentationMagnetizationAt(grid[0], excitation, time)
    const signal = csfCollectionAt(grid, excitation, time)
    expect(signal.signal).toBeCloseTo(Math.hypot(m.x, m.y), 12)
    expect(signal.longitudinal).toBeCloseTo(m.z, 12)
  }
})

it('derives dephasing from static B0 offsets, shortening the net transverse signal but not T1', () => {
  const uniform = createCsfGrid(1.5, false)
  const grid = createCsfGrid(1.5, true)
  for (const state of grid) {
    expect(state.angularFrequencyOffsetRadiansPerMillisecond).toBeCloseTo(state.fieldVariationTesla * PROTON_GYROMAGNETIC_RATIO / 1000, 12)
    expect(state.spinPackets[0].angularFrequencyOffsetRadiansPerMillisecond).toBe(state.angularFrequencyOffsetRadiansPerMillisecond)
    expect(state.transverseRelaxationTimeMilliseconds).toBe(2100)
    expect(state.longitudinalRelaxationTimeMilliseconds).toBe(4300)
  }
  expect(csfCollectionAt(grid, excitation, 1000).signal).toBeCloseTo(1, 12)
  const earlyCoherence = csfCollectionAt(grid, excitation, 1500).signal / csfCollectionAt(uniform, excitation, 1500).signal
  expect(earlyCoherence).toBeGreaterThan(0.7)
  expect(earlyCoherence).toBeLessThan(0.85)
  expect(csfCollectionAt(grid, excitation, 2500).signal).toBeLessThan(csfCollectionAt(uniform, excitation, 2500).signal * 0.25)
  for (const time of [1200, 1500, 2500, 8000]) {
    expect(csfCollectionAt(grid, excitation, time).longitudinal).toBeCloseTo(csfCollectionAt(uniform, excitation, time).longitudinal, 12)
  }
})

it('uses the complex vector sum rather than averaging transverse magnitudes', () => {
  const grid = createCsfGrid(1.5, true)
  const vectors = grid.map(state => presentationMagnetizationAt(state, excitation, 2500))
  const x = vectors.reduce((sum, m) => sum + m.x, 0) / 36
  const y = vectors.reduce((sum, m) => sum + m.y, 0) / 36
  const magnitudes = vectors.reduce((sum, m) => sum + Math.hypot(m.x, m.y), 0) / 36
  expect(csfCollectionAt(grid, excitation, 2500).signal).toBeCloseTo(Math.hypot(x, y), 12)
  expect(Math.hypot(x, y)).toBeLessThan(magnitudes * 0.25)
  // Reordering the vectors when stacking cannot change the received signal.
  expect(csfCollectionAt([...grid].reverse(), excitation, 2500).signal).toBeCloseTo(Math.hypot(x, y), 12)
})

it('retains reversible phase dispersion rather than substituting a shorter intrinsic T2', () => {
  const grid = createCsfGrid(1.5, true)
  const refocused = { ...excitation, pulseEvents: [...excitation.pulseEvents, { timeMilliseconds: 1400, kind: '180-x' as const }] }
  expect(csfCollectionAt(grid, refocused, 1800).signal).toBeCloseTo(Math.exp(-800 / 2100), 12)
})

it.each([350, 1200, 2377.25, 8000])('refocuses actual grid and stacked vectors at twice a %s ms pulse delay, without undoing T2', delay => {
  const grid = createCsfGrid(1.5, true)
  const playback = startPlayPlan(csfEchoPlayPlan(delay), 1000)
  const excitation = { fieldStrengthTesla: 1.5, pulseEvents: playback.pulseEvents }
  expect(playback.pulseEvents).toEqual([
    { kind: '90-y', timeMilliseconds: 1000 },
    { kind: '180-x', timeMilliseconds: 1000 + delay },
  ])
  const echoTime = 1000 + 2 * delay
  const echo = csfCollectionAt(grid, excitation, echoTime)
  expect(echo.signal).toBeCloseTo(Math.exp(-2 * delay / 2100), 12)
  expect(csfCollectionAt([...grid].reverse(), excitation, echoTime)).toEqual(echo)
  const beforePulse = csfCollectionAt(grid, excitation, 1000 + delay - 1e-6)
  const afterPulse = csfCollectionAt(grid, excitation, 1000 + delay)
  expect(afterPulse.signal).toBeCloseTo(beforePulse.signal, 8)
  expect(afterPulse.longitudinal).toBeCloseTo(-beforePulse.longitudinal, 8)
  for (const state of grid) {
    const m = fidEnsembleMagnetizationStateAt(state, echoTime, playback.pulseEvents)
    expect(m.xFraction).toBeCloseTo(Math.exp(-2 * delay / 2100), 12)
    expect(m.yFraction).toBeCloseTo(0, 12)
  }
  expect(csfEchoPlayPlan(delay).durationMilliseconds).toBeGreaterThan(2 * delay)
})
