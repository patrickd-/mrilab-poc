// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FidSignalPoint, RfPulseEvent } from '../simulation/fid'
import SpinEchoExperimentPanel, {
  echoTimingsFor,
  fitEchoDecay,
  signalMagnitudeNear,
} from './SpinEchoExperimentPanel'

function point(
  timeMilliseconds: number,
  magnitude: number,
  quadrature = 0,
): FidSignalPoint {
  return {
    timeMilliseconds,
    normalizedVoltage: magnitude,
    normalizedQuadratureVoltage: quadrature,
    normalizedLongitudinalMagnetization: 0,
  }
}

describe('spin-echo timing calculations', () => {
  it('requires an initial 90-degree excitation', () => {
    expect(
      echoTimingsFor([{ timeMilliseconds: 10, kind: '180-x' }]),
    ).toEqual([])
  })

  it('places an echo one equal tau interval after each 180-degree pulse', () => {
    const events: RfPulseEvent[] = [
      { timeMilliseconds: 0, kind: '90-y' },
      { timeMilliseconds: 10, kind: '180-x' },
      { timeMilliseconds: 30, kind: '180-x' },
    ]

    expect(echoTimingsFor(events)).toEqual([
      {
        pulseTimeMilliseconds: 10,
        previousPeakTimeMilliseconds: 0,
        echoTimeMilliseconds: 20,
        tauMilliseconds: 10,
      },
      {
        pulseTimeMilliseconds: 30,
        previousPeakTimeMilliseconds: 20,
        echoTimeMilliseconds: 40,
        tauMilliseconds: 10,
      },
    ])
  })

  it('ignores refocusing pulses with no positive tau', () => {
    expect(
      echoTimingsFor([
        { timeMilliseconds: 5, kind: '90-y' },
        { timeMilliseconds: 5, kind: '180-x' },
        { timeMilliseconds: 4, kind: '180-x' },
      ]),
    ).toEqual([])
  })
})

describe('spin-echo peak measurement and fitting', () => {
  it('finds the nearest sampled complex magnitude inside tolerance', () => {
    const points = [point(0, 1), point(9.8, 0.3, 0.4), point(10.3, 0.9)]

    expect(signalMagnitudeNear(points, 10, 0.25)).toBeCloseTo(0.5, 12)
    expect(signalMagnitudeNear(points, 10, 0.1)).toBeNull()
    expect(signalMagnitudeNear([], 10, 1)).toBeNull()
  })

  it('recovers T2 from an exact exponential sequence of excitation and echo peaks', () => {
    const t2Milliseconds = 80
    const fit = fitEchoDecay(
      [0, 40, 80].map((peakTimeMilliseconds, index) => ({
        peakTimeMilliseconds,
        magnitude: Math.exp(-peakTimeMilliseconds / t2Milliseconds),
        kind: index === 0 ? ('excitation' as const) : ('echo' as const),
      })),
    )

    expect(fit).not.toBeNull()
    expect(fit?.estimatedT2Milliseconds).toBeCloseTo(t2Milliseconds, 10)
    expect(fit?.magnitudeAt(20)).toBeCloseTo(Math.exp(-0.25), 10)
  })

  it('rejects insufficient, degenerate, and non-decaying peak sets', () => {
    expect(fitEchoDecay([])).toBeNull()
    expect(
      fitEchoDecay([
        { peakTimeMilliseconds: 0, magnitude: 1, kind: 'excitation' },
      ]),
    ).toBeNull()
    expect(
      fitEchoDecay([
        { peakTimeMilliseconds: 0, magnitude: 1, kind: 'excitation' },
        { peakTimeMilliseconds: 10, magnitude: 1.1, kind: 'echo' },
      ]),
    ).toBeNull()
    expect(
      fitEchoDecay([
        { peakTimeMilliseconds: 10, magnitude: 1, kind: 'excitation' },
        { peakTimeMilliseconds: 10, magnitude: 0.5, kind: 'echo' },
      ]),
    ).toBeNull()
  })
})

describe('SpinEchoExperimentPanel', () => {
  it('renders measured echoes, symmetric tau labels, and a fit including the initial peak', () => {
    const t2Milliseconds = 80
    const pulses: RfPulseEvent[] = [
      { timeMilliseconds: 0, kind: '90-y' },
      { timeMilliseconds: 10, kind: '180-x' },
      { timeMilliseconds: 30, kind: '180-x' },
    ]
    const points = Array.from({ length: 41 }, (_, timeMilliseconds) =>
      point(
        timeMilliseconds,
        [0, 20, 40].includes(timeMilliseconds)
          ? Math.exp(-timeMilliseconds / t2Milliseconds)
          : 0.05,
      ),
    )

    const { container } = render(
      <SpinEchoExperimentPanel
        graphWindowEndMilliseconds={100}
        graphWindowStartMilliseconds={0}
        pulseEvents={pulses}
        signalPoints={points}
        timeMilliseconds={40}
        timeStepMilliseconds={1}
      />,
    )

    expect(screen.getByText('T₂ ≈ 80.0 ms')).not.toBeNull()
    expect(screen.getAllByText('180°')).toHaveLength(2)
    expect(screen.getAllByText('echo')).toHaveLength(2)
    expect(screen.getAllByText('τ 10 ms')).toHaveLength(2)
    expect(container.querySelectorAll('.spin-echo-peak-markers circle')).toHaveLength(3)
    expect(container.querySelector('.spin-echo-fit-path')).not.toBeNull()
  })

  it('extends the graph to a pending echo before it has been measured', () => {
    render(
      <SpinEchoExperimentPanel
        graphWindowEndMilliseconds={15}
        graphWindowStartMilliseconds={0}
        pulseEvents={[
          { timeMilliseconds: 0, kind: '90-y' },
          { timeMilliseconds: 10, kind: '180-x' },
        ]}
        signalPoints={[point(0, 1), point(10, 0.5)]}
        timeMilliseconds={10}
        timeStepMilliseconds={1}
      />,
    )

    expect(screen.getByText('T₂ ≈ —')).not.toBeNull()
    expect(screen.getAllByText('20').length).toBeGreaterThan(0)
  })
})
