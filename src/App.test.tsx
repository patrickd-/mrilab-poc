// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SamplePresetId } from './models/HydrogenEnsemble'

const mocks = vi.hoisted(() => ({
  gradientHook: vi.fn(),
  gradientReset: vi.fn(),
  fidHook: vi.fn(),
  fundamentalGradientPanelProps: null as Record<string, any> | null,
  gradientPanelProps: null as Record<string, any> | null,
  resetCamera: vi.fn(),
  sceneProps: null as Record<string, unknown> | null,
  twoDimensionalGradientPanelProps: null as Record<string, any> | null,
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
    mocks.fundamentalGradientPanelProps = props
    return (
      <div data-testid="fundamental-gradient-experiment">
        Fundamental gradient experiment view
        <button
          type="button"
          onClick={() => props.onXEnabledChange(false)}
        >
          Disable fundamental Gx
        </button>
      </div>
    )
  },
}))

vi.mock('./components/GradientRecalledEchoExperimentPanel', () => ({
  default: (props: Record<string, any>) => {
    mocks.gradientPanelProps = props
    return (
      <div data-testid="gradient-recalled-echo-experiment">
        Gradient recalled echo experiment view
        <button type="button" onClick={props.onSimulationReset}>
          Reset gradient simulation
        </button>
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

vi.mock('./components/TwoDimensionalGradientEncodingExperimentPanel', () => ({
  default: (props: Record<string, any>) => {
    mocks.twoDimensionalGradientPanelProps = props
    return (
      <div data-testid="two-dimensional-gradient-experiment">
        Two-dimensional gradient experiment view
        <button
          type="button"
          onClick={() => props.onFrequencyEnabledChange(false)}
        >
          Disable 2D frequency gradient
        </button>
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
    mocks.fundamentalGradientPanelProps = null
    mocks.gradientPanelProps = null
    mocks.sceneProps = null
    mocks.twoDimensionalGradientPanelProps = null
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
      reset: mocks.gradientReset,
      setSpeed: vi.fn(),
      speed: '1',
      start: vi.fn(),
      status: 'idle',
      timeMilliseconds: 0,
    })
    mocks.gradientReset.mockReset()
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

  it('resizes and restores the responsive control panel', () => {
    const { container } = render(<App />)
    const shell = container.querySelector<HTMLElement>('.lab-shell')
    const resizer = screen.getByRole('separator', {
      name: 'Resize control panel',
    })

    expect(shell?.style.getPropertyValue('--control-panel-width')).toBe('')

    fireEvent.keyDown(resizer, { key: 'Home' })
    expect(shell?.style.getPropertyValue('--control-panel-width')).toBe(
      '418px',
    )

    fireEvent.keyDown(resizer, { key: 'ArrowLeft' })
    expect(shell?.style.getPropertyValue('--control-panel-width')).toBe(
      '466px',
    )

    fireEvent.doubleClick(resizer)
    expect(shell?.style.getPropertyValue('--control-panel-width')).toBe('')
  })

  it('keeps an active experiment underneath dismissible ensemble details', async () => {
    const user = userEvent.setup()
    render(<App />)

    await selectExperiment(user, 'Gradient Recalled Echo Experiment')
    expect(
      screen.getByTestId('gradient-recalled-echo-experiment'),
    ).toBeTruthy()
    expect(experimentViewIsHidden()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Select center ensemble' }))
    expect(screen.getByText('Static nuclear properties')).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: /Gradient Recalled Echo Experiment/i,
      }),
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

  it('keeps the fundamental gradient experiment separate from GRE', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(
      screen.getByRole('button', { name: /Select Experiment/i }),
    )
    expect(
      screen.getByRole('option', {
        name: 'Gradient Recalled Echo Experiment',
      }),
    ).toBeTruthy()
    await user.click(
      screen.getByRole('option', {
        name: '1D Gradient Encoding Experiment',
      }),
    )

    expect(
      screen.getByRole('button', {
        name: '1D Gradient Encoding Experiment',
      }),
    ).toBeTruthy()
    expect(
      screen.queryByTestId('gradient-recalled-echo-experiment'),
    ).toBeNull()
    expect(
      screen.getByTestId('fundamental-gradient-experiment'),
    ).toBeTruthy()
    expect(mocks.sceneProps?.gradientEncodingSelected).toBe(false)
    expect(mocks.gradientHook.mock.calls.at(-1)?.[0]).toMatchObject({
      active: false,
    })
    expect(mocks.sceneProps).toMatchObject({
      spatialGradientActive: true,
      spatialGradientEnsembleStates: expect.any(Array),
      spatialGradientXEnabled: true,
      spatialGradientXProfile: {
        endFieldOffsetMillitesla: 1.28,
        startFieldOffsetMillitesla: -1.28,
      },
      spatialGradientYProfile: {
        endFieldOffsetMillitesla: 0,
        startFieldOffsetMillitesla: 0,
      },
      spatialGradientYEnabled: true,
    })
    expect(
      mocks.sceneProps?.spatialGradientEnsembleStates,
    ).toHaveLength(0)
    expect(
      mocks.sceneProps?.spatialGradientTimeMilliseconds,
    ).toBeGreaterThan(1)
    expect(
      mocks.fundamentalGradientPanelProps?.ensembleStates,
    ).toHaveLength(128 * 128)

    await user.click(screen.getByRole('button', { name: 'Slice 3D graph' }))
    await user.click(
      screen.getByRole('option', { name: '3D Magnetic Field Gradient' }),
    )
    expect(mocks.sceneProps?.sliceGraphMode).toBe('magnetic-field')

    await user.click(
      screen.getByRole('button', { name: 'Disable fundamental Gx' }),
    )
    expect(mocks.sceneProps?.spatialGradientXEnabled).toBe(false)
  })

  it('lists a separate 2D gradient encoding workspace after the 1D experiment', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(
      screen.getByRole('button', { name: /Select Experiment/i }),
    )
    const experimentLabels = screen
      .getAllByRole('option')
      .map((option) => option.textContent)

    expect(experimentLabels).toEqual([
      'Ping Experiment',
      'Spin Echo Experiment',
      '1D Gradient Encoding Experiment',
      '2D Gradient Encoding Experiment',
      'Gradient Recalled Echo Experiment',
    ])

    await user.click(
      screen.getByRole('option', {
        name: '2D Gradient Encoding Experiment',
      }),
    )

    expect(
      screen.getByRole('button', {
        name: '2D Gradient Encoding Experiment',
      }),
    ).toBeTruthy()
    expect(
      screen.queryByTestId('fundamental-gradient-experiment'),
    ).toBeNull()
    expect(
      screen.queryByTestId('gradient-recalled-echo-experiment'),
    ).toBeNull()
    expect(
      screen.getByTestId('two-dimensional-gradient-experiment'),
    ).toBeTruthy()
    expect(mocks.twoDimensionalGradientPanelProps).toMatchObject({
      frequencyEnabled: true,
      gridSize: 128,
      phaseEnabled: true,
    })
    expect(mocks.sceneProps).toMatchObject({
      gradientEncodingSelected: false,
      spatialGradientActive: true,
      spatialGradientPhaseXEnabled: true,
      spatialGradientPhaseXProfile: {
        endFieldOffsetMillitesla: 0.64,
        startFieldOffsetMillitesla: -0.64,
      },
      spatialGradientPhaseYEnabled: true,
      spatialGradientPhaseYProfile: {
        endFieldOffsetMillitesla: 0.64,
        startFieldOffsetMillitesla: -0.64,
      },
      spatialGradientTimeMilliseconds: 0.2,
      spatialGradientXEnabled: true,
      spatialGradientXProfile: {
        endFieldOffsetMillitesla: 1.28,
        startFieldOffsetMillitesla: -1.28,
      },
      spatialGradientYEnabled: true,
      spatialGradientYProfile: {
        endFieldOffsetMillitesla: 0,
        startFieldOffsetMillitesla: 0,
      },
    })
    expect(mocks.sceneProps?.spatialGradientEnsembleStates).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Apply slice preset' }))
    await user.click(
      screen.getByRole('option', {
        name: 'Add Cerebrospinal fluid (CSF)',
      }),
    )

    expect(
      (mocks.sceneProps?.spatialGradientEnsembleStates as unknown[]).length,
    ).toBeGreaterThan(0)
    expect(
      (mocks.sceneProps?.spatialGradientEnsembleStates as unknown[]).length,
    ).toBeLessThan(128 * 128)

    await user.click(
      screen.getByRole('button', {
        name: 'Disable 2D frequency gradient',
      }),
    )
    expect(mocks.sceneProps).toMatchObject({
      spatialGradientActive: true,
      spatialGradientPhaseXProfile: {
        endFieldOffsetMillitesla: 0,
        startFieldOffsetMillitesla: 0,
      },
      spatialGradientPhaseYProfile: {
        endFieldOffsetMillitesla: 1.28,
        startFieldOffsetMillitesla: -1.28,
      },
      spatialGradientTimeMilliseconds: 0.1,
      spatialGradientXEnabled: true,
      spatialGradientXProfile: {
        endFieldOffsetMillitesla: 0,
        startFieldOffsetMillitesla: 0,
      },
      spatialGradientYEnabled: true,
      spatialGradientYProfile: {
        endFieldOffsetMillitesla: 1.28,
        startFieldOffsetMillitesla: -1.28,
      },
    })
  })

  it('bypasses disabled gradient channels without discarding their waveforms', async () => {
    const user = userEvent.setup()
    render(<App />)

    await selectExperiment(user, 'Gradient Recalled Echo Experiment')

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

  it('routes an explicit gradient reset through the acquisition reset boundary', async () => {
    const user = userEvent.setup()
    render(<App />)

    await selectExperiment(user, 'Gradient Recalled Echo Experiment')
    await user.click(
      screen.getByRole('button', { name: 'Reset gradient simulation' }),
    )

    expect(mocks.gradientReset).toHaveBeenCalledOnce()
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

  it('applies three diagonal CSF circles for the phantom preset', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Apply slice preset' }))
    await user.click(
      screen.getByRole('option', { name: 'Phantom (3 circles)' }),
    )

    const ensembles = mocks.sceneProps?.ensembleModels as Array<{
      samplePreset: string
    }>
    const sampleAt = (column: number, row: number) =>
      ensembles[row * 128 + column].samplePreset

    expect(sampleAt(32, 32)).toBe('cerebrospinal-fluid')
    expect(sampleAt(64, 64)).toBe('cerebrospinal-fluid')
    expect(sampleAt(95, 95)).toBe('cerebrospinal-fluid')
    expect(sampleAt(32, 95)).toBe('air')
    expect(sampleAt(95, 32)).toBe('air')
    expect(sampleAt(0, 0)).toBe('air')
  })

  it('applies a simplified brain using every available sample type', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Apply slice preset' }))
    await user.click(
      screen.getByRole('option', { name: 'Simplified Brain' }),
    )

    const ensembles = mocks.sceneProps?.ensembleModels as Array<{
      samplePreset: SamplePresetId
    }>
    expect(new Set(ensembles.map((ensemble) => ensemble.samplePreset))).toEqual(
      new Set([
        'air',
        'cortical-bone',
        'cerebrospinal-fluid',
        'gray-matter',
        'white-matter',
      ]),
    )
    expect(ensembles[4 * 128 + 64].samplePreset).toBe('cortical-bone')
    expect(ensembles[45 * 128 + 45].samplePreset).toBe('white-matter')
  })

  it('applies the tissue-mapped Shepp-Logan MRI phantom', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Apply slice preset' }))
    await user.click(
      screen.getByRole('option', { name: 'Shepp–Logan MRI Phantom' }),
    )

    const ensembles = mocks.sceneProps?.ensembleModels as Array<{
      samplePreset: SamplePresetId
    }>
    expect(new Set(ensembles.map((ensemble) => ensemble.samplePreset))).toEqual(
      new Set([
        'air',
        'cortical-bone',
        'cerebrospinal-fluid',
        'gray-matter',
        'white-matter',
      ]),
    )
    expect(ensembles[6 * 128 + 64].samplePreset).toBe('cortical-bone')
    expect(ensembles[64 * 128 + 64].samplePreset).toBe('gray-matter')
    expect(ensembles[41 * 128 + 64].samplePreset).toBe('white-matter')
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
