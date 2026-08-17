// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  createDefaultTransmitFrequencyBand,
  DEFAULT_PHASE_ENCODING_PULSES,
  DEFAULT_READOUT_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  DEFAULT_SLICE_SELECTION_PULSES,
  GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  sliceRephasingAreaRatio,
  type GradientPulse,
} from '../simulation/gradientEncoding'
import GradientEncodingExperimentPanel, {
  updatePulses,
} from './GradientEncodingExperimentPanel'

describe('gradient waveform editing constraints', () => {
  const singlePulse: GradientPulse[] = [
    { start: 0.2, end: 0.4, amplitude: 0.5 },
  ]

  it('moves left and right edges without crossing the minimum duration', () => {
    expect(updatePulses(singlePulse, 0, 'left', -1, 0.5, false)[0]).toEqual({
      start: 0,
      end: 0.4,
      amplitude: 0.5,
    })
    expect(updatePulses(singlePulse, 0, 'left', 1, 0.5, false)[0].start).toBe(
      0.375,
    )
    expect(updatePulses(singlePulse, 0, 'right', -1, 0.5, false)[0].end).toBe(
      0.225,
    )
    expect(updatePulses(singlePulse, 0, 'right', 1, 0.5, false)[0].end).toBe(1)
  })

  it('clamps amplitude and moves an unlinked top edge as a whole pulse', () => {
    const moved = updatePulses(singlePulse, 0, 'top', 0.3, 2, false)[0]

    expect(moved).toEqual({ start: 0.5, end: 0.7, amplitude: 1 })
    expect(updatePulses(singlePulse, 0, 'top', -1, -2, false)[0]).toEqual({
      start: 0,
      end: 0.2,
      amplitude: -1,
    })
  })

  it('keeps adjacent linked pulse boundaries contiguous', () => {
    const linked: GradientPulse[] = [
      { start: 0.2, end: 0.4, amplitude: -0.4 },
      { start: 0.4, end: 0.8, amplitude: 0.5 },
    ]
    const movedRight = updatePulses(linked, 0, 'right', 0.1, -0.4, true)
    const movedLeft = updatePulses(linked, 1, 'left', -0.1, 0.5, true)
    const movedFirstTop = updatePulses(linked, 0, 'top', 0.1, -0.7, true)
    const movedSecondTop = updatePulses(linked, 1, 'top', 0.1, 0.8, true)

    expect(movedRight[0].end).toBeCloseTo(0.5, 12)
    expect(movedRight[1].start).toBe(movedRight[0].end)
    expect(movedLeft[0].end).toBeCloseTo(0.3, 12)
    expect(movedLeft[1].start).toBe(movedLeft[0].end)
    expect(movedFirstTop[1].start).toBe(movedFirstTop[0].end)
    expect(movedSecondTop[0].end).toBe(movedSecondTop[1].start)
  })

  it('never mutates the source pulse array', () => {
    const source = singlePulse.map((pulse) => ({ ...pulse }))
    const snapshot = source.map((pulse) => ({ ...pulse }))

    const result = updatePulses(source, 0, 'top', 0.1, 0.7, false)

    expect(source).toEqual(snapshot)
    expect(result).not.toBe(source)
    expect(result[0]).not.toBe(source[0])
  })

  it('keeps the slice rewinder at half the selection area unless its amplitude is edited', () => {
    const matched = updatePulses(
      DEFAULT_SLICE_SELECTION_PULSES,
      0,
      'top',
      0,
      0.4,
      true,
      true,
    )
    const manuallyOverridden = updatePulses(
      DEFAULT_SLICE_SELECTION_PULSES,
      1,
      'top',
      0,
      -0.2,
      true,
      true,
    )

    expect(sliceRephasingAreaRatio(matched)).toBeCloseTo(0.5, 12)
    expect(sliceRephasingAreaRatio(manuallyOverridden)).not.toBeCloseTo(
      0.5,
      2,
    )
  })
})

function panelProps(
  overrides: Partial<ComponentProps<typeof GradientEncodingExperimentPanel>> = {},
): ComponentProps<typeof GradientEncodingExperimentPanel> {
  return {
    durationMilliseconds: GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
    gradientImperfections: false,
    gridSize: 128,
    onPause: vi.fn(),
    onRfExcitationPulsesChange: vi.fn(),
    onRfExcitationReset: vi.fn(),
    onPhaseEncodingPulsesChange: vi.fn(),
    onPhaseEncodingReset: vi.fn(),
    onReadoutPulsesChange: vi.fn(),
    onReadoutReset: vi.fn(),
    onSliceSelectionPulsesChange: vi.fn(),
    onSliceSelectionReset: vi.fn(),
    onTransmitFrequencyBandChange: vi.fn(),
    onTransmitFrequencyBandReset: vi.fn(),
    onSimulationReset: vi.fn(),
    onSpeedChange: vi.fn(),
    onStart: vi.fn(),
    phaseEncodingPulses: DEFAULT_PHASE_ENCODING_PULSES,
    readoutPulses: DEFAULT_READOUT_PULSES,
    rfExcitationPulses: DEFAULT_RF_EXCITATION_PULSES,
    sliceSelectionPulses: DEFAULT_SLICE_SELECTION_PULSES,
    speed: '1',
    status: 'idle',
    timeMilliseconds: 0,
    transmitFrequencyBand: createDefaultTransmitFrequencyBand(128),
    ...overrides,
  }
}

describe('GradientEncodingExperimentPanel', () => {
  it('renders all four editable waveforms and the eight PE reference levels', () => {
    const { container } = render(
      <GradientEncodingExperimentPanel {...panelProps()} />,
    )

    expect(screen.getByRole('group', { name: 'RF excitation pulse editable waveform' })).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Slice selection gradient editable waveform' })).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Phase encoding gradient editable waveform' })).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Readout gradient editable waveform' })).not.toBeNull()
    expect(
      container.querySelectorAll(
        '.gradient-input-pe .gradient-reference-waveforms path',
      ),
    ).toHaveLength(8)
    expect(container.querySelectorAll('.gradient-playhead')).toHaveLength(0)

    const rfPath = container.querySelector(
      '.gradient-input-rf .gradient-waveform',
    )
    expect(rfPath?.getAttribute('d')?.match(/\bL\b/g)?.length).toBeGreaterThan(
      100,
    )
    expect(
      screen.getByLabelText('RF pulse derived properties').textContent,
    ).toMatch(/T.?RF.? = 5\.20 ms.*BW = 0\.741 kHz.*TBW = 3\.85.*90\.0°.*4\.33 µT/s)
    expect(
      screen.getByLabelText('Slice rephasing area').textContent,
    ).toContain('0.500')
  })

  it('routes play, pause, reset, and speed controls by playback status', async () => {
    const user = userEvent.setup()
    const idleProps = panelProps()
    const { rerender } = render(
      <GradientEncodingExperimentPanel {...idleProps} />,
    )

    await user.click(screen.getByRole('button', { name: 'Play gradient sequence' }))
    expect(idleProps.onStart).toHaveBeenCalledOnce()
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    const runningProps = panelProps({ status: 'running', timeMilliseconds: 5 })
    rerender(<GradientEncodingExperimentPanel {...runningProps} />)
    await user.click(screen.getByRole('button', { name: 'Pause gradient sequence' }))
    expect(runningProps.onPause).toHaveBeenCalledOnce()
    expect(document.querySelectorAll('.gradient-playhead')).toHaveLength(4)

    await user.click(
      screen.getByRole('button', { name: 'Gradient sequence playback speed' }),
    )
    await user.click(screen.getByRole('option', { name: '4×' }))
    expect(runningProps.onSpeedChange).toHaveBeenCalledWith('4')

    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(runningProps.onSimulationReset).toHaveBeenCalledOnce()
  })

  it('routes each waveform reset independently', async () => {
    const user = userEvent.setup()
    const props = panelProps()
    render(<GradientEncodingExperimentPanel {...props} />)

    await user.click(
      screen.getByRole('button', { name: 'Reset rf excitation pulse' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Reset slice selection gradient' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Reset phase encoding gradient' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Reset readout gradient' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Reset transmit bandwidth' }),
    )

    expect(props.onRfExcitationReset).toHaveBeenCalledOnce()
    expect(props.onSliceSelectionReset).toHaveBeenCalledOnce()
    expect(props.onPhaseEncodingReset).toHaveBeenCalledOnce()
    expect(props.onReadoutReset).toHaveBeenCalledOnce()
    expect(props.onTransmitFrequencyBandReset).toHaveBeenCalledOnce()
  })

  it('edits pulse amplitude and linked timing with the keyboard', () => {
    const props = panelProps()
    render(<GradientEncodingExperimentPanel {...props} />)

    fireEvent.keyDown(
      screen.getByRole('slider', {
        name: /Phase encoding gradient, pulse 1, top handle/,
      }),
      { key: 'ArrowUp' },
    )
    const changedPhase = vi.mocked(props.onPhaseEncodingPulsesChange).mock
      .calls[0][0]
    expect(changedPhase[0]).toMatchObject({
      start: DEFAULT_PHASE_ENCODING_PULSES[0].start,
      end: DEFAULT_PHASE_ENCODING_PULSES[0].end,
    })
    expect(changedPhase[0].amplitude).toBeCloseTo(0.57, 12)

    fireEvent.keyDown(
      screen.getByRole('slider', {
        name: /Readout gradient, pulse 1, right handle/,
      }),
      { key: 'ArrowRight' },
    )
    const changedReadout = vi.mocked(props.onReadoutPulsesChange).mock.calls[0][0]
    expect(changedReadout[0].end).toBeCloseTo(0.53, 12)
    expect(changedReadout[1].start).toBe(changedReadout[0].end)

    fireEvent.keyDown(
      screen.getByRole('slider', {
        name: /Slice selection gradient, pulse 1, top handle/,
      }),
      { key: 'ArrowDown' },
    )
    const changedSlice = vi.mocked(props.onSliceSelectionPulsesChange).mock
      .calls[0][0]
    expect(sliceRephasingAreaRatio(changedSlice)).toBeCloseTo(0.5, 12)
  })

  it('edits a pulse with pointer dragging and shares its timing guide', () => {
    const props = panelProps()
    const { container } = render(
      <GradientEncodingExperimentPanel {...props} />,
    )
    const graph = screen.getByRole('group', {
      name: 'Phase encoding gradient editable waveform',
    }) as unknown as SVGSVGElement
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({
      bottom: 180,
      height: 180,
      left: 0,
      right: 460,
      top: 0,
      width: 460,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const topHandle = screen.getByRole('slider', {
      name: /Phase encoding gradient, pulse 1, top handle/,
    }) as unknown as SVGLineElement & {
      setPointerCapture: (pointerId: number) => void
    }
    topHandle.setPointerCapture = vi.fn()

    fireEvent.pointerEnter(graph, { clientX: 230, clientY: 90 })
    expect(container.querySelectorAll('.gradient-timing-guide')).toHaveLength(4)

    fireEvent.pointerDown(topHandle, {
      clientX: 180,
      clientY: 60,
      pointerId: 7,
    })
    fireEvent.pointerMove(graph, {
      clientX: 220,
      clientY: 30,
      pointerId: 7,
    })

    const changed = vi.mocked(props.onPhaseEncodingPulsesChange).mock
      .calls.at(-1)?.[0][0]
    expect(topHandle.setPointerCapture).toHaveBeenCalledWith(7)
    expect(changed?.start).toBeGreaterThan(DEFAULT_PHASE_ENCODING_PULSES[0].start)
    expect(changed?.amplitude).toBeGreaterThan(
      DEFAULT_PHASE_ENCODING_PULSES[0].amplitude,
    )

    fireEvent.pointerUp(graph, {
      clientX: 500,
      clientY: 200,
      pointerId: 7,
    })
    expect(container.querySelectorAll('.gradient-timing-guide')).toHaveLength(0)
  })

  it('draws applied waveforms for gradient channels when imperfections are enabled', () => {
    const { container } = render(
      <GradientEncodingExperimentPanel
        {...panelProps({ gradientImperfections: true })}
      />,
    )

    expect(container.querySelectorAll('.gradient-applied-waveform')).toHaveLength(3)
    expect(screen.getAllByText(/Dashed yellow shows the applied gradient response\./)).toHaveLength(2)
  })
})
