// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FidSignalPoint } from '../simulation/fid'
import FidExperimentPanel from './FidExperimentPanel'

const POINTS: FidSignalPoint[] = [
  {
    timeMilliseconds: 0,
    normalizedVoltage: 1,
    normalizedQuadratureVoltage: 0,
    normalizedLongitudinalMagnetization: 0,
  },
  {
    timeMilliseconds: 50,
    normalizedVoltage: -0.3,
    normalizedQuadratureVoltage: 0.4,
    normalizedLongitudinalMagnetization: 0.25,
  },
  {
    timeMilliseconds: 100,
    normalizedVoltage: 0.1,
    normalizedQuadratureVoltage: 0,
    normalizedLongitudinalMagnetization: 0.5,
  },
]

describe('FidExperimentPanel', () => {
  it('renders empty FID and T1 graphs without data paths', () => {
    const { container } = render(
      <FidExperimentPanel
        graphWindowEndMilliseconds={100}
        graphWindowStartMilliseconds={0}
        signalPoints={[]}
        timeStepMilliseconds={1}
      />,
    )

    expect(
      [...container.querySelectorAll('.fid-graph-readout strong')].map(
        (readout) => readout.textContent,
      ),
    ).toEqual(['—', 'Mz / M0 = —'])
    expect(container.querySelector('.fid-signal-path')).toBeNull()
    expect(container.querySelector('.fid-laboratory-envelope')).toBeNull()
    expect(container.querySelector('.t1-relaxation-path')).toBeNull()
  })

  it('plots rotating I, the complex-magnitude envelope, and longitudinal recovery', () => {
    const { container } = render(
      <FidExperimentPanel
        graphWindowEndMilliseconds={100}
        graphWindowStartMilliseconds={0}
        signalPoints={POINTS}
        timeStepMilliseconds={0.25}
      />,
    )

    expect(screen.getByText('0.1000')).not.toBeNull()
    expect(
      container.querySelector('.t1-graph-shell .fid-graph-readout strong')
        ?.textContent,
    ).toBe('Mz / M0 = 0.5000')
    expect(container.querySelector('.fid-signal-path')?.getAttribute('d')).toContain('L')
    expect(
      container.querySelector('.fid-laboratory-envelope')?.getAttribute('d'),
    ).toMatch(/Z$/)
    expect(container.querySelector('.t1-relaxation-path')?.getAttribute('d')).toContain('L')
    expect(screen.getByText(/Δt = 0\.25 ms\/tick/)).not.toBeNull()
  })

  it('labels a shifted sliding time window', () => {
    render(
      <FidExperimentPanel
        graphWindowEndMilliseconds={6000}
        graphWindowStartMilliseconds={1000}
        signalPoints={POINTS.map((point) => ({
          ...point,
          timeMilliseconds: point.timeMilliseconds + 1000,
        }))}
        timeStepMilliseconds={5}
      />,
    )

    expect(screen.getAllByText('1000').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3500').length).toBeGreaterThan(0)
    expect(screen.getAllByText('6000').length).toBeGreaterThan(0)
  })
})
