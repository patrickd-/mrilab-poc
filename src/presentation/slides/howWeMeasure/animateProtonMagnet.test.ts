import { afterEach, expect, it, vi } from 'vitest'
import { animateProtonMagnet } from './animateProtonMagnet'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function animationHarness(time: number) {
  let callback: FrameRequestCallback = () => {}
  const request = vi.fn((next: FrameRequestCallback) => { callback = next; return 42 })
  const cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const now = vi.spyOn(performance, 'now').mockReturnValue(time)
  return { request, cancel, now, frame: (timestamp: number) => callback(timestamp) }
}

it('does not stop precessing when RAF timestamps precede a newly issued pulse', () => {
  const h = animationHarness(1000)
  const apply = vi.fn()
  const stop = animateProtonMagnet({ fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: 1000, kind: '90-y' }] }, apply)
  expect(apply.mock.lastCall![0].x).toBeCloseTo(1)
  h.now.mockReturnValue(1001)
  h.frame(999) // The next frame's timestamp can precede the pulse's timestamp.
  expect(apply.mock.lastCall![0].x).toBeGreaterThan(0.99)
  expect(h.request).toHaveBeenCalledTimes(2)
  h.now.mockReturnValue(1250)
  h.frame(1240)
  expect(apply.mock.lastCall![0].y).toBeGreaterThan(0.5)
  stop()
  expect(h.cancel).toHaveBeenCalledWith(42)
})

it('resets and restarts the animation on repeated replay, without stale loops', () => {
  const h = animationHarness(0)
  const apply = vi.fn()
  for (const time of [0, 5000, 10000]) {
    h.now.mockReturnValue(time)
    const reset = animateProtonMagnet({ fieldStrengthTesla: 3, pulseEvents: [] }, apply)
    expect(apply.mock.lastCall![0]).toEqual({ x: 0, y: 0, z: 1 })
    reset()
    const stop = animateProtonMagnet({ fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: time, kind: '90-y' }] }, apply)
    expect(apply.mock.lastCall![0].x).toBeCloseTo(1)
    h.now.mockReturnValue(time + 175)
    h.frame(time - 1)
    expect(apply.mock.lastCall![0].y).toBeGreaterThan(0.7)
    stop()
  }
  expect(h.cancel).toHaveBeenCalledTimes(6)
})

it('waits for later plan events even while the magnet is aligned', () => {
  const h = animationHarness(0)
  const apply = vi.fn()
  const stop = animateProtonMagnet({ fieldStrengthTesla: 3, pulseEvents: [
    { timeMilliseconds: 2000, kind: '90-y' },
    { timeMilliseconds: 60000, kind: '180-x' },
  ] }, apply)
  expect(apply.mock.lastCall![0].z).toBe(1)
  expect(h.request).toHaveBeenCalledOnce()
  h.now.mockReturnValue(50000)
  h.frame(0)
  expect(apply.mock.lastCall![0].z).toBeCloseTo(1, 4)
  expect(h.request).toHaveBeenCalledTimes(2)
  h.now.mockReturnValue(60000)
  h.frame(0)
  expect(apply.mock.lastCall![0].z).toBeCloseTo(-1, 4)
  stop()
})
