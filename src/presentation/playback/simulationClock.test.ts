import { expect, it } from 'vitest'
import { SimulationClock } from './simulationClock'

it('freezes simulation time and excludes every paused interval on resume', () => {
  let wallTime = 1000
  const clock = new SimulationClock(() => wallTime)
  expect(clock.now()).toBe(1000)
  wallTime = 1250
  clock.setPaused(true)
  wallTime = 5000
  clock.setPaused(true)
  expect(clock.now()).toBe(1250)
  clock.setPaused(false)
  expect(clock.now()).toBe(1250)
  wallTime = 5300
  clock.setPaused(false)
  expect(clock.now()).toBe(1550)
  clock.setPaused(true)
  wallTime = 15000
  expect(clock.now()).toBe(1550)
  clock.setPaused(false)
  wallTime += 200
  expect(clock.now()).toBe(1750)
})
