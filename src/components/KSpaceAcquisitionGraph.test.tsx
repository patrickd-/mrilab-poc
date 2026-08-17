// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
      currentKxCyclesPerMeter={0}
      currentKyCyclesPerMeter={0}
      durationMilliseconds={20}
      encodingStartTimeMilliseconds={6.8}
      gradientImperfections={false}
      phaseEncodingPulses={phaseEncodingPulses}
      points={[]}
      readoutPulses={readoutPulses}
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
        currentKxCyclesPerMeter={1200}
        currentKyCyclesPerMeter={-600}
        durationMilliseconds={20}
        encodingStartTimeMilliseconds={6.8}
        gradientImperfections={false}
        phaseEncodingPulses={phaseEncodingPulses}
        points={[]}
        readoutPulses={readoutPulses}
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
    const { container } = renderGraph({ points })
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
    expect(screen.getByText(/4 samples · max \|S\| 1\.00/)).not.toBeNull()
  })

  it('renders a single ADC sample as a grayscale point', () => {
    const { container } = renderGraph({
      points: [signalPoint(10, 0, 500, 0.25)],
    })

    expect(
      container.querySelector('.k-space-acquired-trace circle'),
    ).not.toBeNull()
  })
})
