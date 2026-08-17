// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  createDefaultTransmitFrequencyBand,
  maximumSliceMappingAngularFrequencyKilradiansPerSecond,
  sliceMappingAngularFrequencyKilradiansPerSecondAt,
  type TransmitFrequencyBand,
} from '../simulation/gradientEncoding'
import SliceSelectionMappingGraph from './SliceSelectionMappingGraph'

const GRID_SIZE = 128
const DEFAULT_GRADIENT_AMPLITUDE = 0.58
const DEFAULT_BAND = createDefaultTransmitFrequencyBand(GRID_SIZE)
const MAXIMUM_FREQUENCY =
  maximumSliceMappingAngularFrequencyKilradiansPerSecond(GRID_SIZE)

function Harness({
  gradientAmplitude = DEFAULT_GRADIENT_AMPLITUDE,
  initialBand = DEFAULT_BAND,
}: {
  gradientAmplitude?: number
  initialBand?: TransmitFrequencyBand
}) {
  const [band, setBand] = useState(initialBand)
  return (
    <SliceSelectionMappingGraph
      gradientAmplitude={gradientAmplitude}
      gridSize={GRID_SIZE}
      transmitFrequencyBand={band}
      onChange={setBand}
      onReset={() => setBand(DEFAULT_BAND)}
    />
  )
}

function lowerSlider() {
  return screen.getByRole('slider', {
    name: 'lower transmit-band angular frequency',
  })
}

function upperSlider() {
  return screen.getByRole('slider', {
    name: 'upper transmit-band angular frequency',
  })
}

describe('SliceSelectionMappingGraph', () => {
  it('reports the default 1 mm isocenter selection', () => {
    render(<Harness />)

    expect(screen.getByText(/zc = 63\.50 mm · Δz = 1\.00 mm/)).not.toBeNull()
    expect(Number(lowerSlider().getAttribute('aria-valuenow'))).toBeCloseTo(
      DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond,
      12,
    )
    expect(Number(upperSlider().getAttribute('aria-valuenow'))).toBeCloseTo(
      DEFAULT_BAND.upperAngularFrequencyKilradiansPerSecond,
      12,
    )
  })

  it('supports Home and End to select the complete graph range', () => {
    render(<Harness />)

    fireEvent.keyDown(lowerSlider(), { key: 'Home' })
    fireEvent.keyDown(upperSlider(), { key: 'End' })

    expect(Number(lowerSlider().getAttribute('aria-valuenow'))).toBe(0)
    expect(Number(upperSlider().getAttribute('aria-valuenow'))).toBeCloseTo(
      MAXIMUM_FREQUENCY,
      12,
    )
    expect(screen.getByText(/Δz = 218\.97 mm/)).not.toBeNull()
  })

  it('moves each boundary with the arrow keys while preserving minimum width', () => {
    render(<Harness />)
    const initialLower = Number(lowerSlider().getAttribute('aria-valuenow'))
    const initialUpper = Number(upperSlider().getAttribute('aria-valuenow'))

    fireEvent.keyDown(lowerSlider(), { key: 'ArrowUp' })
    fireEvent.keyDown(upperSlider(), { key: 'ArrowDown' })

    expect(Number(lowerSlider().getAttribute('aria-valuenow'))).toBeCloseTo(
      initialLower + 0.05,
      12,
    )
    expect(Number(upperSlider().getAttribute('aria-valuenow'))).toBeCloseTo(
      initialUpper - 0.05,
      12,
    )
    expect(
      Number(upperSlider().getAttribute('aria-valuenow')) -
        Number(lowerSlider().getAttribute('aria-valuenow')),
    ).toBeGreaterThanOrEqual(0.02)
  })

  it('moves a transmit-band boundary by pointer dragging', () => {
    const onChange = vi.fn()
    render(
      <SliceSelectionMappingGraph
        gradientAmplitude={DEFAULT_GRADIENT_AMPLITUDE}
        gridSize={GRID_SIZE}
        transmitFrequencyBand={DEFAULT_BAND}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    )
    const graph = screen.getByRole('group', {
      name: 'Slice-selection frequency-to-position mapping',
    }) as unknown as SVGSVGElement
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({
      bottom: 245,
      height: 245,
      left: 0,
      right: 460,
      top: 0,
      width: 460,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const slider = lowerSlider() as unknown as SVGLineElement & {
      setPointerCapture: (pointerId: number) => void
    }
    slider.setPointerCapture = vi.fn()

    fireEvent.pointerDown(slider, { clientY: 180, pointerId: 3 })
    fireEvent.pointerMove(graph, { clientY: 140, pointerId: 3 })
    fireEvent.pointerUp(graph, { clientY: 140, pointerId: 3 })

    expect(slider.setPointerCapture).toHaveBeenCalledWith(3)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(
      onChange.mock.calls.at(-1)?.[0]
        .lowerAngularFrequencyKilradiansPerSecond,
    ).toBeGreaterThan(
      onChange.mock.calls[0][0].lowerAngularFrequencyKilradiansPerSecond,
    )
  })

  it('resets an edited transmit band to its default', () => {
    render(<Harness />)
    fireEvent.keyDown(lowerSlider(), { key: 'Home' })
    fireEvent.keyDown(upperSlider(), { key: 'End' })

    fireEvent.click(screen.getByRole('button', { name: 'Reset transmit bandwidth' }))

    expect(Number(lowerSlider().getAttribute('aria-valuenow'))).toBeCloseTo(
      DEFAULT_BAND.lowerAngularFrequencyKilradiansPerSecond,
      12,
    )
    expect(screen.getByText(/zc = 63\.50 mm · Δz = 1\.00 mm/)).not.toBeNull()
  })

  it('reports whole-volume and no-overlap states for zero GSS', () => {
    const { rerender } = render(
      <SliceSelectionMappingGraph
        gradientAmplitude={0}
        gridSize={GRID_SIZE}
        transmitFrequencyBand={DEFAULT_BAND}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByText('No spatial overlap')).not.toBeNull()

    rerender(
      <SliceSelectionMappingGraph
        gradientAmplitude={0}
        gridSize={GRID_SIZE}
        transmitFrequencyBand={{
          lowerAngularFrequencyKilradiansPerSecond: 0,
          upperAngularFrequencyKilradiansPerSecond: 0.2,
        }}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByText('Whole volume selected')).not.toBeNull()
  })

  it('mirrors the reported slice center for negative GSS', () => {
    const frequencyPerLayer =
      sliceMappingAngularFrequencyKilradiansPerSecondAt(
        1,
        GRID_SIZE,
        DEFAULT_GRADIENT_AMPLITUDE,
      )
    const band = {
      lowerAngularFrequencyKilradiansPerSecond: frequencyPerLayer * 79.5,
      upperAngularFrequencyKilradiansPerSecond: frequencyPerLayer * 80.5,
    }
    const { rerender } = render(
      <SliceSelectionMappingGraph
        gradientAmplitude={DEFAULT_GRADIENT_AMPLITUDE}
        gridSize={GRID_SIZE}
        transmitFrequencyBand={band}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByText(/zc = 80\.00 mm/)).not.toBeNull()

    rerender(
      <SliceSelectionMappingGraph
        gradientAmplitude={-DEFAULT_GRADIENT_AMPLITUDE}
        gridSize={GRID_SIZE}
        transmitFrequencyBand={band}
        onChange={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByText(/zc = 47\.00 mm/)).not.toBeNull()
  })
})
