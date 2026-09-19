// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FID_PLAY_PLAN, startPlayPlan } from './playPlan'
import { usePlayPlan } from './usePlayPlan'
import { createPresentationCsfState, presentationMagnetizationAt } from '../slides/howWeMeasure/protonExcitation'

afterEach(() => vi.useRealTimers())

it('sorts relative events and applies later pulses at their scheduled times', () => {
  const plan = { ...FID_PLAY_PLAN, events: [
    { type: 'rf-pulse' as const, timeMilliseconds: 2000, kind: '180-x' as const, label: '180°' },
    ...FID_PLAY_PLAN.events,
  ] }
  const playback = startPlayPlan(plan, 1000)
  expect(playback.pulseEvents).toEqual([
    { timeMilliseconds: 1000, kind: '90-y' },
    { timeMilliseconds: 3000, kind: '180-x' },
  ])
  const state = createPresentationCsfState(3)
  const excitation = { fieldStrengthTesla: 3, pulseEvents: playback.pulseEvents }
  const before = presentationMagnetizationAt(state, excitation, 2999.999)
  const after = presentationMagnetizationAt(state, excitation, 3000)
  expect(before.z).toBeGreaterThan(0)
  expect(after.z).toBeCloseTo(-before.z, 5)
})

it('cancels obsolete starts and creates a fresh epoch on replay', () => {
  vi.useFakeTimers()
  const delay = FID_PLAY_PLAN.layoutDurationMilliseconds + FID_PLAY_PLAN.settleDelayMilliseconds
  const { result, rerender, unmount } = renderHook(({ enabled, version }) => usePlayPlan(FID_PLAY_PLAN, enabled, version), {
    initialProps: { enabled: true, version: 0 },
  })
  act(() => vi.advanceTimersByTime(delay - 1))
  expect(result.current!.startedAt).toBeGreaterThan(performance.now())
  expect(presentationMagnetizationAt(createPresentationCsfState(3), {
    fieldStrengthTesla: 3, pulseEvents: result.current!.pulseEvents,
  }, performance.now())).toEqual({ x: 0, y: 0, z: 1 })
  rerender({ enabled: false, version: 0 })
  act(() => vi.advanceTimersByTime(2000))
  expect(result.current).toBeNull()
  rerender({ enabled: true, version: 1 })
  act(() => vi.advanceTimersByTime(delay))
  const first = result.current!.startedAt
  expect(result.current!.pulseEvents[0].timeMilliseconds).toBe(first)
  rerender({ enabled: true, version: 2 })
  expect(result.current!.startedAt).toBeGreaterThan(performance.now())
  act(() => vi.advanceTimersByTime(delay))
  expect(result.current!.startedAt).toBeGreaterThan(first)
  unmount()
})

it('rejects invalid plan timing', () => {
  expect(() => startPlayPlan({ ...FID_PLAY_PLAN, sampleIntervalMilliseconds: 0 }, 0)).toThrow()
  expect(() => startPlayPlan({ ...FID_PLAY_PLAN, durationMilliseconds: -1 }, 0)).toThrow()
})
