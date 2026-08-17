// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHydrogenEnsembles } from '../models/HydrogenEnsemble'
import { createFidEnsembleStates } from '../simulation/fid'
import GradientEncodingExperimentPanel, {
  combinedSpatialFieldOffsetMilliteslaAt,
  createDefaultSpatialGradientProfiles,
  gradientStrengthMilliteslaPerMeter,
} from './GradientEncodingExperimentPanel'

const TEST_ENSEMBLE_STATES = createFidEnsembleStates(
  createHydrogenEnsembles(2),
  1.5,
  'uniform',
  { includeAirEnsembles: true },
)

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

function StatefulGradientEncodingExperimentPanel() {
  const defaults = createDefaultSpatialGradientProfiles(128)
  const [xEnabled, setXEnabled] = useState(true)
  const [xProfile, setXProfile] = useState(defaults.x)
  const [yEnabled, setYEnabled] = useState(true)
  const [yProfile, setYProfile] = useState(defaults.y)

  return (
    <GradientEncodingExperimentPanel
      ensembleStates={TEST_ENSEMBLE_STATES}
      fieldOfViewMillimeters={128}
      playbackSpeed="10"
      playbackStatus="idle"
      playbackTimeMilliseconds={0}
      xEnabled={xEnabled}
      xProfile={xProfile}
      yEnabled={yEnabled}
      yProfile={yProfile}
      onXEnabledChange={setXEnabled}
      onXProfileChange={setXProfile}
      onYEnabledChange={setYEnabled}
      onYProfileChange={setYProfile}
      onPause={vi.fn()}
      onPlaybackSpeedChange={vi.fn()}
      onReset={vi.fn()}
      onStart={vi.fn()}
    />
  )
}

describe('fundamental spatial gradient model', () => {
  it('combines orthogonal linear field profiles into one spatial field', () => {
    const profiles = createDefaultSpatialGradientProfiles(128)

    expect(profiles.x.startFieldOffsetMillitesla).toBeCloseTo(-1.28, 10)
    expect(profiles.x.endFieldOffsetMillitesla).toBeCloseTo(1.28, 10)
    expect(gradientStrengthMilliteslaPerMeter(profiles.x, 128)).toBeCloseTo(
      20,
      10,
    )
    expect(
      combinedSpatialFieldOffsetMilliteslaAt(
        profiles.x,
        profiles.y,
        0,
        0,
      ),
    ).toBeCloseTo(-1.28, 10)
    expect(
      combinedSpatialFieldOffsetMilliteslaAt(
        profiles.x,
        profiles.y,
        1,
        1,
      ),
    ).toBeCloseTo(1.28, 10)
  })
})

describe('GradientEncodingExperimentPanel', () => {
  it('renders two spatial endpoint editors and the linked Fourier graphs', () => {
    render(<StatefulGradientEncodingExperimentPanel />)

    expect(screen.getByText('Frequency Encoding')).not.toBeNull()
    expect(
      screen.getByRole('group', {
        name: 'G x spatial gradient editable line',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('group', {
        name: 'G y spatial gradient editable line',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('img', { name: 'Complex signal function S of time' }),
    ).not.toBeNull()
    expect(
      screen.getByRole('img', {
        name: 'Fourier transform F of angular frequency',
      }),
    ).not.toBeNull()
    expect(screen.getByText('1D Fourier Transform Projection')).not.toBeNull()
    expect(screen.getByText(/r∥ · mm along G/)).not.toBeNull()
    expect(
      screen.getByText('2D Reconstruction by Backprojection'),
    ).not.toBeNull()
    expect(
      screen.getByRole('img', {
        name: 'Accumulated two-dimensional backprojection reconstruction',
      }),
    ).not.toBeNull()
    expect(screen.getByText('1 / 180 angular projections')).not.toBeNull()
  })

  it('accumulates distinct gradient angles and can reset the backprojection', () => {
    render(<StatefulGradientEncodingExperimentPanel />)
    expect(screen.getByText('1 / 180 angular projections')).not.toBeNull()

    fireEvent.keyDown(
      screen.getByRole('slider', {
        name: 'G y gradient 128 millimeter endpoint',
      }),
      { key: 'ArrowUp' },
    )
    expect(screen.getByText('2 / 180 angular projections')).not.toBeNull()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reset backprojection reconstruction',
      }),
    )
    expect(screen.getByText('0 / 180 angular projections')).not.toBeNull()
  })

  it('recomputes both Fourier-linked plots when a gradient is toggled', () => {
    const { container } = render(
      <StatefulGradientEncodingExperimentPanel />,
    )
    const realSignalPath = container.querySelector('.spatial-signal-real')
    const spectrumPath = container.querySelector('.spatial-spectrum-line')
    const initialSignal = realSignalPath?.getAttribute('d')
    const initialSpectrum = spectrumPath?.getAttribute('d')

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Enable G x spatial gradient',
      }),
    )

    expect(realSignalPath?.getAttribute('d')).not.toBe(initialSignal)
    expect(spectrumPath?.getAttribute('d')).not.toBe(initialSpectrum)
  })

  it('lets each fixed spatial endpoint move vertically by dragging', () => {
    const { container } = render(
      <StatefulGradientEncodingExperimentPanel />,
    )
    const graph = screen.getByRole('group', {
      name: 'G x spatial gradient editable line',
    }) as unknown as SVGSVGElement
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({
      bottom: 190,
      height: 190,
      left: 0,
      right: 460,
      top: 0,
      width: 460,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const startHandle = screen.getByRole('slider', {
      name: 'G x gradient 0 millimeter endpoint',
    })
    Object.defineProperty(startHandle, 'setPointerCapture', {
      value: vi.fn(),
    })

    fireEvent.pointerDown(startHandle, {
      clientX: 48,
      clientY: 121,
      pointerId: 9,
    })
    fireEvent.pointerMove(graph, {
      clientX: 48,
      clientY: 16,
      pointerId: 9,
    })
    fireEvent.pointerUp(graph, {
      clientX: 48,
      clientY: 16,
      pointerId: 9,
    })

    expect(
      Number(
        container
          .querySelector(
            '[aria-label="G x gradient 0 millimeter endpoint"]',
          )
          ?.getAttribute('aria-valuenow'),
      ),
    ).toBeCloseTo(2.56, 10)
  })

  it('supports keyboard adjustment and per-axis reset', () => {
    render(<StatefulGradientEncodingExperimentPanel />)
    const endHandle = screen.getByRole('slider', {
      name: 'G y gradient 128 millimeter endpoint',
    })

    fireEvent.keyDown(endHandle, { key: 'ArrowUp' })
    expect(Number(endHandle.getAttribute('aria-valuenow'))).toBeCloseTo(
      0.08,
      10,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset G y spatial gradient' }),
    )
    expect(Number(endHandle.getAttribute('aria-valuenow'))).toBe(0)
  })

  it('disables an axis contribution without discarding its profile', () => {
    render(<StatefulGradientEncodingExperimentPanel />)
    const xToggle = screen.getByRole('checkbox', {
      name: 'Enable G x spatial gradient',
    })
    const xGraph = screen.getByRole('group', {
      name: 'G x spatial gradient editable line',
    })
    const xStartHandle = screen.getByRole('slider', {
      name: 'G x gradient 0 millimeter endpoint',
    })

    expect((xToggle as HTMLInputElement).checked).toBe(true)
    expect(xStartHandle.getAttribute('aria-valuenow')).toBe('-1.28')
    fireEvent.click(xToggle)

    expect((xToggle as HTMLInputElement).checked).toBe(false)
    expect(
      xGraph.closest('.gradient-input')?.classList.contains('disabled'),
    ).toBe(true)
    expect(xStartHandle.getAttribute('aria-valuenow')).toBe('-1.28')
    fireEvent.click(xToggle)
    expect((xToggle as HTMLInputElement).checked).toBe(true)
    expect(xStartHandle.getAttribute('aria-valuenow')).toBe('-1.28')
  })
})
