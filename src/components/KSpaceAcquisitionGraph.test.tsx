// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GradientSignalPoint } from '../simulation/gradientEncoding'
import KSpaceAcquisitionGraph from './KSpaceAcquisitionGraph'

const phaseEncodingPulses = [
  { start: 0.34, end: 0.52, amplitude: 0.5 },
]
const readoutPulses = [
  { start: 0.34, end: 0.52, amplitude: -0.4 },
  { start: 0.52, end: 0.78, amplitude: 0.5 },
]

function signalPoint(
  timeMilliseconds: number,
  kxCyclesPerMeter: number,
  kyCyclesPerMeter: number,
  magnitude: number,
): GradientSignalPoint {
  return {
    kxCyclesPerMeter,
    kyCyclesPerMeter,
    normalizedInPhaseSignal: magnitude,
    normalizedMagnitude: magnitude,
    normalizedQuadratureSignal: 0,
    timeMilliseconds,
  }
}

function renderGraph(
  overrides: Partial<
    React.ComponentProps<typeof KSpaceAcquisitionGraph>
  > = {},
) {
  return render(
    <KSpaceAcquisitionGraph
      acquisitionRuns={[]}
      currentKxCyclesPerMeter={0}
      currentKyCyclesPerMeter={0}
      durationMilliseconds={20}
      encodingStartTimeMilliseconds={6.8}
      gradientImperfections={false}
      gridSize={128}
      onReconstructionVoxelSizeChange={() => {}}
      phaseEncodingPulses={phaseEncodingPulses}
      readoutPulses={readoutPulses}
      reconstructionVoxelSizeMillimeters={1}
      status="idle"
      {...overrides}
    />,
  )
}

describe('KSpaceAcquisitionGraph', () => {
  it('starts with an empty trace and a cursor at the k-space origin', () => {
    const { container } = renderGraph()

    expect(
      screen.getByRole('img', {
        name: /k-space trajectory with 0 adc-acquired complex signal samples/i,
      }),
    ).not.toBeNull()
    expect(
      container.querySelectorAll('.k-space-acquired-trace line'),
    ).toHaveLength(0)
    expect(
      container.querySelector('.k-space-cursor')?.getAttribute('transform'),
    ).toBe('translate(225 168)')
  })

  it('moves the cursor to the current integrated kx and ky coordinate', () => {
    const { container, rerender } = renderGraph()
    const initialTransform = container
      .querySelector('.k-space-cursor')
      ?.getAttribute('transform')

    rerender(
      <KSpaceAcquisitionGraph
        acquisitionRuns={[]}
        currentKxCyclesPerMeter={1200}
        currentKyCyclesPerMeter={-600}
        durationMilliseconds={20}
        encodingStartTimeMilliseconds={6.8}
        gradientImperfections={false}
        gridSize={128}
        onReconstructionVoxelSizeChange={() => {}}
        phaseEncodingPulses={phaseEncodingPulses}
        readoutPulses={readoutPulses}
        reconstructionVoxelSizeMillimeters={1}
        status="running"
      />,
    )

    expect(
      container.querySelector('.k-space-cursor')?.getAttribute('transform'),
    ).not.toBe(initialTransform)
    expect(container.querySelector('.k-space-cursor.running')).not.toBeNull()
  })

  it('draws only contiguous ADC samples and brightens stronger signal segments', () => {
    const points = [
      signalPoint(10, -1000, 500, 0.01),
      signalPoint(10.02, -500, 500, 0.09),
      signalPoint(10.04, 0, 500, 1),
      signalPoint(11, 800, 500, 0.5),
    ]
    const { container } = renderGraph({
      acquisitionRuns: [{ id: 0, points }],
    })
    const segments = Array.from(
      container.querySelectorAll<SVGLineElement>(
        '.k-space-acquired-trace line',
      ),
    )

    expect(segments).toHaveLength(2)
    const firstGrayscale = Number(
      segments[0].getAttribute('stroke')?.match(/\d+/)?.[0],
    )
    const secondGrayscale = Number(
      segments[1].getAttribute('stroke')?.match(/\d+/)?.[0],
    )
    expect(secondGrayscale).toBeGreaterThan(firstGrayscale)
    expect(
      screen.getByText(/1 acquisition · 4 samples · max \|S\| 1\.00/),
    ).not.toBeNull()
  })

  it('shades the Cartesian Nyquist support used by the reconstruction grid', () => {
    const { container } = renderGraph()
    const support = container.querySelector<SVGRectElement>(
      '.k-space-reconstruction-support',
    )

    expect(support?.getAttribute('data-k-min')).toBe('-500')
    expect(support?.getAttribute('data-k-max-exclusive')).toBe('500')
    expect(Number(support?.getAttribute('width'))).toBeGreaterThan(0)
    expect(screen.getByText(/±0\.50 cycles\/mm/i)).not.toBeNull()
  })

  it('previews a square resize while dragging and commits only on release', () => {
    const onVoxelSizeChange = vi.fn()
    const { container } = renderGraph({
      onReconstructionVoxelSizeChange: onVoxelSizeChange,
    })
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
    const handle = screen.getAllByRole('slider', {
      name: /reconstruction nyquist extent/i,
    })[1]
    Object.defineProperty(handle, 'setPointerCapture', {
      value: vi.fn(),
    })

    fireEvent.pointerDown(handle, {
      clientX: 250,
      clientY: 143,
      pointerId: 7,
    })
    fireEvent.pointerMove(graph, {
      clientX: 275,
      clientY: 118,
      pointerId: 7,
    })

    expect(onVoxelSizeChange).not.toHaveBeenCalled()
    expect(
      Number(
        container
          .querySelector('.k-space-reconstruction-support')
          ?.getAttribute('data-k-max-exclusive'),
      ),
    ).toBeCloseTo(1000, 8)

    fireEvent.pointerUp(graph, {
      clientX: 275,
      clientY: 118,
      pointerId: 7,
    })
    expect(onVoxelSizeChange).toHaveBeenCalledTimes(1)
    expect(onVoxelSizeChange).toHaveBeenCalledWith(0.5)
  })

  it('renders a single ADC sample as a grayscale point', () => {
    const { container } = renderGraph({
      acquisitionRuns: [
        { id: 0, points: [signalPoint(10, 0, 500, 0.25)] },
      ],
    })

    expect(
      container.querySelector('.k-space-acquired-trace circle'),
    ).not.toBeNull()
  })

  it('retains multiple acquisitions without connecting replay boundaries', () => {
    const firstRun = [
      signalPoint(10, -1000, -500, 0.2),
      signalPoint(10.02, -500, -500, 0.3),
    ]
    const secondRun = [
      signalPoint(10, -1000, 500, 0.4),
      signalPoint(10.02, -500, 500, 0.5),
    ]
    const { container } = renderGraph({
      acquisitionRuns: [
        { id: 0, points: firstRun },
        { id: 1, points: secondRun },
      ],
    })

    expect(
      container.querySelectorAll('.k-space-acquired-trace line'),
    ).toHaveLength(2)
    expect(screen.getByText(/2 acquisitions · 4 samples/)).not.toBeNull()
  })
})
