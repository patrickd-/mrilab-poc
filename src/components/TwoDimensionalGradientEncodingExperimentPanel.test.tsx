// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHydrogenEnsembles } from '../models/HydrogenEnsemble'
import { createFidEnsembleStates } from '../simulation/fid'
import {
  createDefaultTwoDimensionalEncodingGradients,
  type TwoDimensionalGradientVector,
} from '../simulation/twoDimensionalEncoding'
import TwoDimensionalGradientEncodingExperimentPanel from './TwoDimensionalGradientEncodingExperimentPanel'

const putImageData = vi.fn()
const TEST_ENSEMBLE_STATES = (() => {
  const ensembles = createHydrogenEnsembles(8)
  ensembles.forEach((ensemble) => {
    ensemble.samplePreset = 'cerebrospinal-fluid'
  })
  return createFidEnsembleStates(ensembles, 1.5, 'uniform')
})()

beforeEach(() => {
  putImageData.mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData,
      }) as unknown as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

function StatefulPanel() {
  const defaults = createDefaultTwoDimensionalEncodingGradients(8)
  const [phaseProfiles, setPhaseProfiles] =
    useState<TwoDimensionalGradientVector>(defaults.phase)
  const [frequencyProfiles, setFrequencyProfiles] =
    useState<TwoDimensionalGradientVector>(defaults.frequency)
  const [phaseEnabled, setPhaseEnabled] = useState(true)
  const [frequencyEnabled, setFrequencyEnabled] = useState(true)

  return (
    <TwoDimensionalGradientEncodingExperimentPanel
      ensembleStates={TEST_ENSEMBLE_STATES}
      frequencyEnabled={frequencyEnabled}
      frequencyProfiles={frequencyProfiles}
      gridSize={8}
      phaseEnabled={phaseEnabled}
      phaseProfiles={phaseProfiles}
      onFrequencyEnabledChange={setFrequencyEnabled}
      onFrequencyProfilesChange={setFrequencyProfiles}
      onPhaseEnabledChange={setPhaseEnabled}
      onPhaseProfilesChange={setPhaseProfiles}
    />
  )
}

describe('TwoDimensionalGradientEncodingExperimentPanel', () => {
  it('renders sequential phase and frequency vector editors with complex maps', () => {
    render(<StatefulPanel />)

    expect(screen.getByText('Phase & Frequency Encoding')).not.toBeNull()
    expect(
      screen.getByRole('group', {
        name: 'Phase encoding gradient with editable G x and G y lines',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('group', {
        name: 'Frequency encoding gradient with editable G x and G y lines',
      }),
    ).not.toBeNull()
    expect(
      screen.getAllByRole('slider', {
        name: /encoding G [xy] gradient .* millimeter endpoint/i,
      }),
    ).toHaveLength(8)
    expect(
      screen.getByRole('img', { name: /Real .* spatial encoding map/i }),
    ).not.toBeNull()
    expect(
      screen.getByRole('img', {
        name: /Imaginary .* spatial encoding map/i,
      }),
    ).not.toBeNull()
    expect(screen.getByLabelText('Encoding order').textContent).toContain(
      'GPE',
    )
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Enable phase encoding ADC',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false)
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Enable frequency encoding ADC',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    expect(screen.getByText('K-Space')).not.toBeNull()
    expect(
      screen.getByRole('img', {
        name: /K-space trajectory with 0 ADC-acquired complex signal samples/i,
      }),
    ).not.toBeNull()
    expect(
      screen.getByText('2D Reconstruction via Inverse Fourier Transform'),
    ).not.toBeNull()
    expect(
      screen.getByRole('img', {
        name: /Partial magnitude MR image from 0 acquisitions and 0 complex k-space samples/i,
      }),
    ).not.toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /auto-fill/i }),
    ).toBeNull()
    expect(putImageData).toHaveBeenCalledTimes(3)
  })

  it('moves the k-space cursor without acquiring when the edited stage ADC is off', () => {
    const { container } = render(<StatefulPanel />)
    const phaseXStart = screen.getByRole('slider', {
      name: 'Phase encoding G x gradient 0 millimeter endpoint',
    })
    const initialValue = Number(phaseXStart.getAttribute('aria-valuenow'))
    const initialKSpaceLabel = screen
      .getByRole('img', {
        name: /K-space trajectory with 0 ADC-acquired complex signal samples/i,
      })
      .getAttribute('aria-label')

    fireEvent.keyDown(phaseXStart, { key: 'ArrowUp' })

    expect(Number(phaseXStart.getAttribute('aria-valuenow'))).toBeCloseTo(
      initialValue + 0.08,
      10,
    )
    expect(putImageData.mock.calls.length).toBeGreaterThan(2)
    const movedKSpace = screen.getByRole('img', {
      name: /K-space trajectory with 0 ADC-acquired complex signal samples/i,
    })
    expect(movedKSpace.getAttribute('aria-label')).not.toBe(
      initialKSpaceLabel,
    )
    expect(
      container.querySelectorAll('.k-space-acquired-trace line'),
    ).toHaveLength(0)
    expect(
      screen.getByText('Awaiting an ADC-enabled gradient update'),
    ).not.toBeNull()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Enable phase encoding gradient',
      }),
    )
    expect(
      screen.getByLabelText('Current complex spatial encoding basis')
        .textContent,
    ).toContain('ky = 0.000 cycles/mm')
  })

  it('acquires the live complex signal and updates reconstruction for an ADC-enabled edit', () => {
    const { container } = render(<StatefulPanel />)
    const frequencyXEnd = screen.getByRole('slider', {
      name: 'Frequency encoding G x gradient 8 millimeter endpoint',
    })

    fireEvent.keyDown(frequencyXEnd, { key: 'ArrowUp' })

    expect(
      screen.getByRole('img', {
        name: /K-space trajectory with 2 ADC-acquired complex signal samples/i,
      }),
    ).not.toBeNull()
    expect(
      container.querySelectorAll('.k-space-acquired-trace line'),
    ).toHaveLength(1)
    expect(screen.getByText('2 complex samples')).not.toBeNull()
    expect(
      screen.getByRole('img', {
        name: /Partial magnitude MR image from 1 acquisition and 2 complex k-space samples/i,
      }),
    ).not.toBeNull()
    expect(putImageData.mock.calls.length).toBeGreaterThan(3)
  })

  it('drives the gradient editors and acquisition by dragging the k-space cursor', () => {
    const { container } = render(<StatefulPanel />)
    const graph = container.querySelector<SVGSVGElement>(
      '.k-space-acquisition-graph',
    )!
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({
      bottom: 378,
      height: 378,
      left: 0,
      right: 460,
      top: 0,
      width: 460,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const frequencyXEnd = screen.getByRole('slider', {
      name: 'Frequency encoding G x gradient 8 millimeter endpoint',
    })
    const initialEndpoint = Number(
      frequencyXEnd.getAttribute('aria-valuenow'),
    )
    const cursor = screen.getByRole('button', {
      name: /drag k-space cursor/i,
    })
    Object.defineProperty(cursor, 'setPointerCapture', {
      value: vi.fn(),
    })

    fireEvent.pointerDown(cursor, { pointerId: 11 })
    fireEvent.pointerMove(graph, {
      clientX: 225,
      clientY: 168,
      pointerId: 11,
    })

    expect(
      Number(frequencyXEnd.getAttribute('aria-valuenow')),
    ).not.toBe(initialEndpoint)
    expect(
      screen.getByRole('img', {
        name: /K-space trajectory with 2 ADC-acquired complex signal samples; cursor at kx 0\.00 and ky 0\.00/i,
      }),
    ).not.toBeNull()
    expect(
      container.querySelectorAll('.k-space-acquired-trace line'),
    ).toHaveLength(1)
  })
})
