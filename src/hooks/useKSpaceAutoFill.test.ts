// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ADC_PULSES,
  DEFAULT_PHASE_ENCODING_PULSES,
  DEFAULT_READOUT_PULSES,
} from '../simulation/gradientEncoding'
import { useKSpaceAutoFill } from './useKSpaceAutoFill'

describe('useKSpaceAutoFill', () => {
  it('configures, starts, and advances real playback acquisitions', () => {
    const callbacks = {
      onAdcPulsesChange: vi.fn(),
      onChannelEnabledChange: vi.fn(),
      onPause: vi.fn(),
      onPhaseEncodingPulsesChange: vi.fn(),
      onReadoutPulsesChange: vi.fn(),
      onSpeedChange: vi.fn(),
      onStart: vi.fn(),
    }
    const initialProps: Parameters<typeof useKSpaceAutoFill>[0] = {
      acquisitionRuns: [],
      adcPulses: DEFAULT_ADC_PULSES,
      coveragePercentage: 0,
      enabledChannels: {
        adc: true,
        rf: true,
        'slice-selection': true,
        'phase-encoding': true,
        readout: true,
      },
      encodingStartTimeMilliseconds: 6.8,
      gradientImperfections: false,
      gridSize: 128,
      phaseEncodingPulses: DEFAULT_PHASE_ENCODING_PULSES,
      readoutPulses: DEFAULT_READOUT_PULSES,
      speed: '1',
      status: 'idle',
      voxelSizeMillimeters: 1,
      ...callbacks,
    }
    const { result, rerender } = renderHook(
      (props: typeof initialProps) => useKSpaceAutoFill(props),
      { initialProps },
    )

    act(() => result.current.start())
    expect(result.current.active).toBe(true)
    expect(callbacks.onStart).not.toHaveBeenCalled()

    const configuredAdc = callbacks.onAdcPulsesChange.mock.calls[0][0]
    const configuredReadout =
      callbacks.onReadoutPulsesChange.mock.calls[0][0]
    const firstPhaseLine =
      callbacks.onPhaseEncodingPulsesChange.mock.calls[0][0]
    rerender({
      ...initialProps,
      adcPulses: configuredAdc,
      phaseEncodingPulses: firstPhaseLine,
      readoutPulses: configuredReadout,
      speed: '4',
    })
    expect(callbacks.onStart).toHaveBeenCalledOnce()

    rerender({
      ...initialProps,
      acquisitionRuns: [{ id: 0, points: [] }],
      adcPulses: configuredAdc,
      phaseEncodingPulses: firstPhaseLine,
      readoutPulses: configuredReadout,
      speed: '4',
      status: 'complete',
    })
    expect(callbacks.onPhaseEncodingPulsesChange).toHaveBeenCalledTimes(2)
    expect(
      callbacks.onPhaseEncodingPulsesChange.mock.calls[1][0][0].amplitude,
    ).not.toBe(0)
    expect(result.current.completedAcquisitionCount).toBe(1)
  })

  it('pauses playback and restores speed when stopped', () => {
    const onPause = vi.fn()
    const onSpeedChange = vi.fn()
    const props = {
      acquisitionRuns: [],
      adcPulses: DEFAULT_ADC_PULSES,
      coveragePercentage: 0,
      enabledChannels: {
        adc: true,
        rf: true,
        'slice-selection': true,
        'phase-encoding': true,
        readout: true,
      },
      encodingStartTimeMilliseconds: 6.8,
      gradientImperfections: false,
      gridSize: 128,
      onAdcPulsesChange: vi.fn(),
      onChannelEnabledChange: vi.fn(),
      onPause,
      onPhaseEncodingPulsesChange: vi.fn(),
      onReadoutPulsesChange: vi.fn(),
      onSpeedChange,
      onStart: vi.fn(),
      phaseEncodingPulses: DEFAULT_PHASE_ENCODING_PULSES,
      readoutPulses: DEFAULT_READOUT_PULSES,
      speed: '1' as const,
      status: 'running' as const,
      voxelSizeMillimeters: 1,
    }
    const { result } = renderHook(() => useKSpaceAutoFill(props))

    act(() => result.current.start())
    act(() => result.current.stop())

    expect(onPause).toHaveBeenCalledOnce()
    expect(onSpeedChange).toHaveBeenLastCalledWith('1')
    expect(result.current.active).toBe(false)
  })

  it('finishes and restores the prior speed at complete coverage', () => {
    const onSpeedChange = vi.fn()
    const initialProps: Parameters<typeof useKSpaceAutoFill>[0] = {
      acquisitionRuns: [],
      adcPulses: DEFAULT_ADC_PULSES,
      coveragePercentage: 0,
      enabledChannels: {
        adc: true,
        rf: true,
        'slice-selection': true,
        'phase-encoding': true,
        readout: true,
      },
      encodingStartTimeMilliseconds: 6.8,
      gradientImperfections: false,
      gridSize: 128,
      onAdcPulsesChange: vi.fn(),
      onChannelEnabledChange: vi.fn(),
      onPause: vi.fn(),
      onPhaseEncodingPulsesChange: vi.fn(),
      onReadoutPulsesChange: vi.fn(),
      onSpeedChange,
      onStart: vi.fn(),
      phaseEncodingPulses: DEFAULT_PHASE_ENCODING_PULSES,
      readoutPulses: DEFAULT_READOUT_PULSES,
      speed: '1',
      status: 'idle',
      voxelSizeMillimeters: 1,
    }
    const { result, rerender } = renderHook(
      (props: typeof initialProps) => useKSpaceAutoFill(props),
      { initialProps },
    )

    act(() => result.current.start())
    rerender({ ...initialProps, coveragePercentage: 100 })

    expect(result.current.active).toBe(false)
    expect(onSpeedChange).toHaveBeenLastCalledWith('1')
  })
})
