// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGradientEncodingPlayback } from './useGradientEncodingPlayback'

describe('useGradientEncodingPlayback', () => {
  let nextAnimationFrame: FrameRequestCallback | null
  let nowMilliseconds: number

  beforeEach(() => {
    nextAnimationFrame = null
    nowMilliseconds = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => nowMilliseconds)
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        nextAnimationFrame = callback
        return 1
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  function runFrame(elapsedRealMilliseconds: number) {
    const callback = nextAnimationFrame
    if (!callback) throw new Error('No animation frame was scheduled')
    nextAnimationFrame = null
    nowMilliseconds += elapsedRealMilliseconds
    act(() => callback(nowMilliseconds))
  }

  it('does not start while the experiment is inactive', () => {
    const { result } = renderHook(() =>
      useGradientEncodingPlayback({ active: false, durationMilliseconds: 20 }),
    )

    act(() => result.current.start())

    expect(result.current.status).toBe('idle')
    expect(result.current.timeMilliseconds).toBe(0)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('starts, advances according to wall time, pauses, and resumes', () => {
    const { result } = renderHook(() =>
      useGradientEncodingPlayback({ active: true, durationMilliseconds: 20 }),
    )

    act(() => result.current.start())
    expect(result.current.status).toBe('running')
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    runFrame(100)
    expect(result.current.timeMilliseconds).toBeCloseTo(0.5, 12)

    act(() => result.current.pause())
    expect(result.current.status).toBe('paused')
    expect(cancelAnimationFrame).toHaveBeenCalled()

    act(() => result.current.start())
    expect(result.current.status).toBe('running')
    runFrame(100)
    expect(result.current.timeMilliseconds).toBeCloseTo(1, 12)
  })

  it('applies the selected playback multiplier', () => {
    const { result } = renderHook(() =>
      useGradientEncodingPlayback({ active: true, durationMilliseconds: 20 }),
    )

    act(() => result.current.setSpeed('4'))
    act(() => result.current.start())
    runFrame(100)

    expect(result.current.speed).toBe('4')
    expect(result.current.timeMilliseconds).toBeCloseTo(2, 12)
  })

  it('caps long browser stalls at 100 ms per animation frame', () => {
    const { result } = renderHook(() =>
      useGradientEncodingPlayback({ active: true, durationMilliseconds: 20 }),
    )

    act(() => result.current.start())
    runFrame(1000)

    expect(result.current.timeMilliseconds).toBeCloseTo(0.5, 12)
  })

  it('completes at the sequence duration and restarts from zero', () => {
    const { result } = renderHook(() =>
      useGradientEncodingPlayback({ active: true, durationMilliseconds: 2 }),
    )

    act(() => result.current.setSpeed('4'))
    act(() => result.current.start())
    for (let frame = 0; frame < 20 && result.current.status === 'running'; frame += 1) {
      runFrame(100)
    }

    expect(result.current.status).toBe('complete')
    expect(result.current.timeMilliseconds).toBe(2)

    act(() => result.current.start())
    expect(result.current.status).toBe('running')
    expect(result.current.timeMilliseconds).toBe(0)
  })

  it('resets when explicitly requested or when the experiment becomes inactive', () => {
    const { result, rerender } = renderHook(
      ({ active }) =>
        useGradientEncodingPlayback({ active, durationMilliseconds: 20 }),
      { initialProps: { active: true } },
    )

    act(() => result.current.start())
    runFrame(100)
    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')
    expect(result.current.timeMilliseconds).toBe(0)

    act(() => result.current.start())
    runFrame(100)
    rerender({ active: false })
    expect(result.current.status).toBe('idle')
    expect(result.current.timeMilliseconds).toBe(0)
  })
})
