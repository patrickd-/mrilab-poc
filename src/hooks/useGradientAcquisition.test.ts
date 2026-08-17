// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GradientSignalPoint } from '../simulation/gradientEncoding'
import {
  ADC_DWELL_TIME_MILLISECONDS,
  useGradientAcquisition,
} from './useGradientAcquisition'
import type { GradientPlaybackStatus } from './useGradientEncodingPlayback'

function signalPoint(timeMilliseconds: number): GradientSignalPoint {
  return {
    kxCyclesPerMeter: timeMilliseconds,
    kyCyclesPerMeter: 0,
    normalizedInPhaseSignal: 1,
    normalizedMagnitude: 1,
    normalizedQuadratureSignal: 0,
    timeMilliseconds,
  }
}

describe('useGradientAcquisition', () => {
  it('samples only while ADC is high at a fixed simulation-time dwell', () => {
    const sampleAt = vi.fn(signalPoint)
    const { result, rerender } = renderHook(
      ({ timeMilliseconds }) =>
        useGradientAcquisition({
          active: true,
          adcEnabled: true,
          adcPulses: [{ start: 0.5, end: 0.8, amplitude: 1 }],
          durationMilliseconds: 1,
          sampleAt,
          status: 'running',
          timeMilliseconds,
        }),
      { initialProps: { timeMilliseconds: 0.49 } },
    )

    expect(result.current).toHaveLength(0)
    rerender({ timeMilliseconds: 0.7 })

    expect(result.current.length).toBeGreaterThan(0)
    expect(
      result.current.every(
        (point) =>
          point.timeMilliseconds >= 0.5 && point.timeMilliseconds < 0.8,
      ),
    ).toBe(true)
    for (let index = 1; index < result.current.length; index += 1) {
      expect(
        result.current[index].timeMilliseconds -
          result.current[index - 1].timeMilliseconds,
      ).toBeCloseTo(ADC_DWELL_TIME_MILLISECONDS, 12)
    }
  })

  it('does not acquire while ADC is disabled', () => {
    const sampleAt = vi.fn(signalPoint)
    const { result } = renderHook(() =>
      useGradientAcquisition({
        active: true,
        adcEnabled: false,
        adcPulses: [{ start: 0, end: 1, amplitude: 1 }],
        durationMilliseconds: 1,
        sampleAt,
        status: 'running',
        timeMilliseconds: 1,
      }),
    )

    expect(result.current).toHaveLength(0)
    expect(sampleAt).not.toHaveBeenCalled()
  })

  it('clears acquired data on reset and on sequence replay', () => {
    const sampleAt = vi.fn(signalPoint)
    const { result, rerender } = renderHook(
      ({ status, timeMilliseconds }: {
        status: GradientPlaybackStatus
        timeMilliseconds: number
      }) =>
        useGradientAcquisition({
          active: true,
          adcEnabled: true,
          adcPulses: [{ start: 0.1, end: 1, amplitude: 1 }],
          durationMilliseconds: 1,
          sampleAt,
          status,
          timeMilliseconds,
        }),
      {
        initialProps: {
          status: 'running',
          timeMilliseconds: 0.2,
        },
      },
    )

    expect(result.current.length).toBeGreaterThan(0)
    act(() => rerender({ status: 'idle', timeMilliseconds: 0 }))
    expect(result.current).toHaveLength(0)

    rerender({ status: 'running', timeMilliseconds: 0.2 })
    expect(result.current.length).toBeGreaterThan(0)
    rerender({ status: 'running', timeMilliseconds: 0 })
    expect(result.current).toHaveLength(0)
  })
})
