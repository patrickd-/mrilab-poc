// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  gradientHook: vi.fn(),
  fidHook: vi.fn(),
  gradientPanelProps: null as Record<string, any> | null,
  resetCamera: vi.fn(),
  sceneProps: null as Record<string, unknown> | null,
}))

vi.mock('./components/LabScene', async () => {
  const React = await import('react')
  const LabScene = React.forwardRef(function MockLabScene(
    props: Record<string, any>,
    ref: React.ForwardedRef<{ resetCamera: () => void }>,
  ) {
    mocks.sceneProps = props
    React.useImperativeHandle(ref, () => ({
      resetCamera: mocks.resetCamera,
    }))

    return React.createElement(
      'div',
      {
        'data-testid': 'lab-scene',
        'data-field-strength': String(props.fieldStrengthTesla),
        'data-field-uniformity': props.fieldUniformity,
        'data-render-mode': props.renderMode,
      },
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            props.onSelect({ column: 63, row: 63, index: 63 * 128 + 63 }),
        },
        'Select center ensemble',
      ),
    )
  })

  return { default: LabScene, GRID_SIZE: 128 }
})

vi.mock('./hooks/useFidSimulation', () => ({
  useFidSimulation: mocks.fidHook,
}))

vi.mock('./hooks/useGradientEncodingPlayback', () => ({
  useGradientEncodingPlayback: mocks.gradientHook,
}))

vi.mock('./components/FidExperimentPanel', () => ({
  default: () => <div data-testid="ping-experiment">Ping experiment view</div>,
}))

vi.mock('./components/SpinEchoExperimentPanel', () => ({
  default: () => (
    <div data-testid="spin-echo-experiment">Spin echo experiment view</div>
  ),
}))

vi.mock('./components/GradientEncodingExperimentPanel', () => ({
  default: (props: Record<string, any>) => {
    mocks.gradientPanelProps = props
    return (
      <div data-testid="gradient-experiment">
        Gradient experiment view
        {[
          ['rf', 'Disable RF channel'],
          ['slice-selection', 'Disable slice-selection channel'],
          ['phase-encoding', 'Disable phase-encoding channel'],
          ['readout', 'Disable readout channel'],
        ].map(([channel, label]) => (
          <button
            key={channel}
            type="button"
            onClick={() => props.onChannelEnabledChange(channel, false)}
          >
            {label}
          </button>
        ))}
      </div>
    )
  },
}))

import App from './App'

function experimentViewIsHidden() {
  return (
    document.querySelector<HTMLElement>('.active-experiment-view')?.hidden ??
    false
  )
}

async function selectExperiment(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole('button', { name: /Select Experiment/i }))
  await user.click(screen.getByRole('option', { name }))
}

describe('App integration', () => {
  beforeEach(() => {
    mocks.resetCamera.mockReset()
    mocks.gradientPanelProps = null
    mocks.sceneProps = null
    mocks.fidHook.mockReset().mockReturnValue({
      applyPulse: vi.fn(),
      ensembleStates: [],
      pulseEvents: [],
      graphWindowEndMilliseconds: 100,
      graphWindowStartMilliseconds: 0,
      reset: vi.fn(),
      signalPoints: [],
      start: vi.fn(),
      status: 'idle',
      pause: vi.fn(),
      timeMilliseconds: 0,
    })
    mocks.gradientHook.mockReset().mockReturnValue({
      pause: vi.fn(),
      reset: vi.fn(),
      setSpeed: vi.fn(),
      speed: '1',
      start: vi.fn(),
      status: 'idle',
      timeMilliseconds: 0,
    })
  })

  it('starts with no experiment and no ensemble details', () => {
    render(<App />)

    expect(
      screen.getByRole('button', { name: /Select Experiment/i }),
    ).toBeTruthy()
    expect(screen.queryByText('Static nuclear properties')).toBeNull()
    expect(screen.queryByTestId('ping-experiment')).toBeNull()
    expect(screen.getByTestId('lab-scene').dataset.fieldStrength).toBe('1.5')
  })

  it('keeps an active experiment underneath dismissible ensemble details', async () => {
    const user = userEvent.setup()
    render(<App />)

    await selectExperiment(user, 'Gradient Encoding Experiment')
    expect(screen.getByTestId('gradient-experiment')).toBeTruthy()
    expect(experimentViewIsHidden()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Select center ensemble' }))
    expect(screen.getByText('Static nuclear properties')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Gradient Encoding Experiment/i }),
    ).toBeTruthy()
    expect(experimentViewIsHidden()).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Close ensemble details' }))
    expect(screen.queryByText('Static nuclear properties')).toBeNull()
    expect(experimentViewIsHidden()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Select center ensemble' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Static nuclear properties')).toBeNull()
    expect(experimentViewIsHidden()).toBe(false)
  })

  it('bypasses disabled gradient channels without discarding their waveforms', async () => {
    const user = userEvent.setup()
    render(<App />)

    await selectExperiment(user, 'Gradient Encoding Experiment')

    const channels = [
      ['Disable RF channel', 'gradientRfExcitationPulses', 'rfExcitationPulses'],
      [
        'Disable slice-selection channel',
        'gradientSliceSelectionPulses',
        'sliceSelectionPulses',
      ],
      [
        'Disable phase-encoding channel',
        'gradientPhaseEncodingPulses',
        'phaseEncodingPulses',
      ],
      ['Disable readout channel', 'gradientReadoutPulses', 'readoutPulses'],
    ] as const

    for (const [buttonName, sceneProp, panelProp] of channels) {
      expect(mocks.sceneProps?.[sceneProp]).not.toHaveLength(0)
      await user.click(screen.getByRole('button', { name: buttonName }))
      expect(mocks.sceneProps?.[sceneProp]).toEqual([])
      expect(mocks.gradientPanelProps?.[panelProp]).not.toHaveLength(0)
    }
  })

  it('applies nested slice presets and resets the selected ensemble to air', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Apply slice preset' }))
    await user.click(
      screen.getByRole('option', {
        name: 'Add Cerebrospinal fluid (CSF)',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Select center ensemble' }))

    expect(screen.getByText('SELECTED 064:064')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sample preset' }).textContent).toContain(
      'Cerebrospinal fluid (CSF)',
    )
    expect(screen.getByText(/K · \(37 °C\)/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Apply slice preset' }))
    await user.click(screen.getByRole('option', { name: 'Reset' }))

    expect(screen.getByRole('button', { name: 'Sample preset' }).textContent).toContain(
      'Surrounding Air',
    )
    expect(screen.getByText(/K · \(22 °C\)/)).toBeTruthy()
  })

  it('routes camera and viewport controls while clearing a stale selection', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Reset camera' }))
    expect(mocks.resetCamera).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Select center ensemble' }))
    expect(screen.getByText('Static nuclear properties')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Viewport rendering mode' }))
    await user.click(screen.getByRole('option', { name: 'Block View' }))

    expect(screen.queryByText('Static nuclear properties')).toBeNull()
    expect(screen.getByText('CUTAWAY BLOCK')).toBeTruthy()
    expect(
      screen.getByRole('region', { name: 'Cutaway hydrogen ensemble block' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Slice 3D graph' })).toBeNull()
    expect(screen.getByTestId('lab-scene').dataset.renderMode).toBe('block')
  })

  it('propagates field strength and realism choices into simulation and scene state', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(
      screen.getByRole('button', { name: 'B zero field strength in tesla' }),
    )
    await user.click(screen.getByRole('option', { name: '7' }))
    await user.click(
      screen.getByRole('button', { name: /0 of 6 realism options enabled/i }),
    )
    await user.click(screen.getByRole('option', { name: 'B0 inhomogeneity' }))
    await user.click(
      screen.getByRole('option', { name: 'Intravoxel dephasing' }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('lab-scene').dataset.fieldStrength).toBe('7')
      expect(screen.getByTestId('lab-scene').dataset.fieldUniformity).toBe(
        'non-uniform',
      )
      const fidOptions = mocks.fidHook.mock.calls.at(-1)?.[0]
      expect(fidOptions).toMatchObject({
        fieldStrengthTesla: 7,
        fieldUniformity: 'non-uniform',
        intravoxelDephasing: true,
      })
    })
  })
})
