// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpatialGradientPlayback } from './useSpatialGradientPlayback'

describe('useSpatialGradientPlayback', () => {
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

  it('advances a slow physical experiment clock and can pause it', () => {
    const { result } = renderHook(() =>
      useSpatialGradientPlayback({ active: true }),
    )

    act(() => result.current.start())
    runFrame(100)
    expect(result.current.timeMilliseconds).toBeCloseTo(0.001, 12)

    act(() => result.current.pause())
    expect(result.current.status).toBe('paused')
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('applies speed changes, resets, and stops when inactive', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useSpatialGradientPlayback({ active }),
      { initialProps: { active: true } },
    )

    act(() => result.current.setSpeed('50'))
    act(() => result.current.start())
    runFrame(100)
    expect(result.current.timeMilliseconds).toBeCloseTo(0.005, 12)

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
