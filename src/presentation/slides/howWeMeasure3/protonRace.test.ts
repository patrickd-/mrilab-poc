import { expect, it } from 'vitest'
import { PROTON_GYROMAGNETIC_RATIO } from '../../../models/HydrogenEnsemble'
import { startPlayPlan } from '../../playback/playPlan'
import { SimulationClock } from '../../playback/simulationClock'
import { presentationMagnetizationAt, type ProtonExcitation } from '../howWeMeasure/protonExcitation'
import { csfCollectionAt } from '../howWeMeasure2/csfDephasing'
import { splitCsfOrigins } from '../howWeMeasure2/csfView'
import { createRaceEnsembles, raceDistanceTurns, raceFrequencyHz, racePlayPlan, raceTrackGeometry, RACE_MOTION } from './protonRace'

const racers = createRaceEnsembles(1.5)
const excitationAt = (tau: number | null): ProtonExcitation => ({ fieldStrengthTesla: 1.5, pulseEvents: startPlayPlan(racePlayPlan(tau), 1000).pulseEvents })

it('uses six monotonically increasing fields for both actual precession and running speeds', () => {
  expect(racers).toHaveLength(6)
  for (let i = 0; i < racers.length; i++) {
    const racer = racers[i]
    expect(racer.transverseRelaxationTimeMilliseconds).toBe(2100)
    expect(racer.longitudinalRelaxationTimeMilliseconds).toBe(4300)
    expect(racer.angularFrequencyOffsetRadiansPerMillisecond).toBeCloseTo(racer.fieldVariationTesla * PROTON_GYROMAGNETIC_RATIO / 1000, 12)
    if (i) expect(racer.fieldVariationTesla).toBeGreaterThan(racers[i - 1].fieldVariationTesla)
    const m = presentationMagnetizationAt(racer, excitationAt(null), 1100)
    const turns = Math.atan2(m.y, m.x) / (2 * Math.PI)
    expect(raceDistanceTurns(racer, excitationAt(null), 1100)).toBeCloseTo(turns, 12)
    expect(raceFrequencyHz(racer, 1.5)).toBeCloseTo(0.4 + i * 0.12, 12)
  }
})

it.each([500, 1500, 2377.25, 8000])('reverses from current positions at %s ms and returns everyone at twice that time', tau => {
  const excitation = excitationAt(tau)
  for (const racer of racers) {
    const turnTime = 1000 + tau
    expect(raceDistanceTurns(racer, excitation, turnTime)).toBeCloseTo(raceDistanceTurns(racer, excitation, turnTime - 0.000001), 8)
    expect(raceDistanceTurns(racer, excitation, turnTime + 100)).toBeLessThan(raceDistanceTurns(racer, excitation, turnTime))
    expect(raceDistanceTurns(racer, excitation, 1000 + 2 * tau)).toBeCloseTo(0, 12)
    expect(raceDistanceTurns(racer, excitation, 1100 + 2 * tau)).toBeLessThan(0)
  }
  const atEcho = csfCollectionAt(racers, excitation, 1000 + 2 * tau)
  expect(atEcho.signal).toBeCloseTo(Math.exp(-2 * tau / 2100), 12)
  expect(racePlayPlan(tau).durationMilliseconds).toBeGreaterThan(2 * tau + 2000)
})

it('keeps off-screen racers simulating so a late pulse can bring them back', () => {
  const track = raceTrackGeometry(520, 700)
  for (const racer of racers) {
    expect(raceDistanceTurns(racer, excitationAt(null), 999)).toBe(0)
    expect(raceDistanceTurns(racer, { fieldStrengthTesla: 1.5, pulseEvents: [] }, 9000)).toBe(0)
    const offscreen = track.startY - RACE_MOTION.offsetAt(racer, excitationAt(null), 9000, 520, 700).y
    expect(offscreen - track.radius).toBeGreaterThan(700)
    expect(raceDistanceTurns(racer, excitationAt(8000), 9000)).toBe(raceDistanceTurns(racer, excitationAt(null), 9000))
    expect(RACE_MOTION.offsetAt(racer, excitationAt(8000), 17000, 520, 700).y).toBeCloseTo(0, 12)
    const pastFinish = track.startY - RACE_MOTION.offsetAt(racer, excitationAt(8000), 21000, 520, 700).y
    expect(pastFinish + track.radius).toBeLessThan(0)
  }
})

it.each([[520, 700], [300, 650], [900, 480]])('aligns all six lane centers and grid-sized spheres on one start/finish line at %s by %s', (width, height) => {
  const track = raceTrackGeometry(width, height)
  for (let index = 0; index < 6; index++) {
    const pose = RACE_MOTION.poseAt(index, width, height)
    expect(pose.x + width / 2).toBeCloseTo(track.left + (index + 0.5) * track.laneWidth)
    expect(height / 2 - pose.y).toBeCloseTo(track.startY)
    expect(pose.radius).toBe(Math.min(width, height) * 0.064)
  }
  const split = splitCsfOrigins({ x: 0, y: 0, radius: Math.min(width, height) * 0.25, shell: 0.5 }, 6)
  expect(split.every(pose => pose.x === 0 && pose.y === 0 && pose.radius === Math.min(width, height) * 0.25)).toBe(true)
  expect(split.reduce((sum, pose) => sum + pose.shell, 0)).toBe(0.5)
})

it('uses paused simulation time rather than wall time for race motion', () => {
  let wallTime = 1200
  const clock = new SimulationClock(() => wallTime)
  const excitation = excitationAt(1500)
  const position = () => raceDistanceTurns(racers[5], excitation, clock.now())
  const before = position()
  clock.setPaused(true)
  wallTime += 20000
  expect(position()).toBe(before)
  clock.setPaused(false)
  wallTime += 100
  expect(position()).toBeCloseTo(before + 0.1, 12)
})
