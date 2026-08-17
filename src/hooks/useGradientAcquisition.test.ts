// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
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
          resetRevision: 0,
          sampleAt,
          status: 'running',
          timeMilliseconds,
        }),
      { initialProps: { timeMilliseconds: 0.49 } },
    )

    expect(result.current.currentSignalPoints).toHaveLength(0)
    rerender({ timeMilliseconds: 0.7 })

    expect(result.current.currentSignalPoints.length).toBeGreaterThan(0)
    expect(
      result.current.currentSignalPoints.every(
        (point) =>
          point.timeMilliseconds >= 0.5 && point.timeMilliseconds < 0.8,
      ),
    ).toBe(true)
    for (
      let index = 1;
      index < result.current.currentSignalPoints.length;
      index += 1
    ) {
      expect(
        result.current.currentSignalPoints[index].timeMilliseconds -
          result.current.currentSignalPoints[index - 1].timeMilliseconds,
      ).toBeCloseTo(ADC_DWELL_TIME_MILLISECONDS, 12)
    }
    expect(result.current.acquisitionRuns).toHaveLength(1)
  })

  it('does not acquire while ADC is disabled', () => {
    const sampleAt = vi.fn(signalPoint)
    const { result } = renderHook(() =>
      useGradientAcquisition({
        active: true,
        adcEnabled: false,
        adcPulses: [{ start: 0, end: 1, amplitude: 1 }],
        durationMilliseconds: 1,
        resetRevision: 0,
        sampleAt,
        status: 'running',
        timeMilliseconds: 1,
      }),
    )

    expect(result.current.currentSignalPoints).toHaveLength(0)
    expect(result.current.acquisitionRuns).toHaveLength(0)
    expect(sampleAt).not.toHaveBeenCalled()
  })

  it('starts a fresh signal graph while retaining k-space runs until explicit reset', () => {
    const sampleAt = vi.fn(signalPoint)
    const { result, rerender } = renderHook(
      ({ resetRevision, status, timeMilliseconds }: {
        resetRevision: number
        status: GradientPlaybackStatus
        timeMilliseconds: number
      }) =>
        useGradientAcquisition({
          active: true,
          adcEnabled: true,
          adcPulses: [{ start: 0.1, end: 1, amplitude: 1 }],
          durationMilliseconds: 1,
          resetRevision,
          sampleAt,
          status,
          timeMilliseconds,
        }),
      {
        initialProps: {
          resetRevision: 0,
          status: 'running',
          timeMilliseconds: 0.2,
        },
      },
    )

    expect(result.current.currentSignalPoints.length).toBeGreaterThan(0)
    expect(result.current.acquisitionRuns).toHaveLength(1)

    rerender({
      resetRevision: 0,
      status: 'running',
      timeMilliseconds: 0,
    })
    expect(result.current.currentSignalPoints).toHaveLength(0)
    expect(result.current.acquisitionRuns).toHaveLength(1)

    rerender({
      resetRevision: 0,
      status: 'running',
      timeMilliseconds: 0.2,
    })
    expect(result.current.currentSignalPoints.length).toBeGreaterThan(0)
    expect(result.current.acquisitionRuns).toHaveLength(2)

    rerender({
      resetRevision: 0,
      status: 'idle',
      timeMilliseconds: 0,
    })
    expect(result.current.currentSignalPoints).toHaveLength(0)
    expect(result.current.acquisitionRuns).toHaveLength(2)

    rerender({
      resetRevision: 1,
      status: 'idle',
      timeMilliseconds: 0,
    })
    expect(result.current.currentSignalPoints).toHaveLength(0)
    expect(result.current.acquisitionRuns).toHaveLength(0)
  })
})
