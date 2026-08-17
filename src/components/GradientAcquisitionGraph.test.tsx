// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GradientSignalPoint } from '../simulation/gradientEncoding'
import GradientAcquisitionGraph from './GradientAcquisitionGraph'

const adcPulses = [{ start: 0.5, end: 0.75, amplitude: 1 }]

function point(
  timeMilliseconds: number,
  inPhase: number,
  quadrature: number,
): GradientSignalPoint {
  return {
    kxCyclesPerMeter: timeMilliseconds,
    kyCyclesPerMeter: 0,
    normalizedInPhaseSignal: inPhase,
    normalizedMagnitude: Math.hypot(inPhase, quadrature),
    normalizedQuadratureSignal: quadrature,
    timeMilliseconds,
  }
}

describe('GradientAcquisitionGraph', () => {
  it('plots acquired in-phase and quadrature samples within the ADC window', () => {
    const { container } = render(
      <GradientAcquisitionGraph
        adcPulses={adcPulses}
        durationMilliseconds={20}
        points={[
          point(10, 1, 0),
          point(12.5, 0.25, -0.5),
          point(15, -0.5, 0.25),
        ]}
      />,
    )

    expect(
      screen.getByRole('img', {
        name: /complex signal samples acquired while the adc gate is high/i,
      }),
    ).not.toBeNull()
    expect(
      container
        .querySelector('.gradient-acquisition-i-path')
        ?.getAttribute('d'),
    ).toContain('L')
    expect(
      container
        .querySelector('.gradient-acquisition-q-path')
        ?.getAttribute('d'),
    ).toContain('L')
    expect(screen.getByText('3 complex samples')).not.toBeNull()
    expect(screen.getByText('I -0.5000 · Q 0.2500')).not.toBeNull()
    expect(screen.getByText('10.00')).not.toBeNull()
    expect(screen.getByText('15.00')).not.toBeNull()
  })

  it('shows an empty acquisition state before the ADC window is reached', () => {
    const { container } = render(
      <GradientAcquisitionGraph
        adcPulses={adcPulses}
        durationMilliseconds={20}
        points={[]}
      />,
    )

    expect(screen.getByText('Awaiting ADC window')).not.toBeNull()
    expect(screen.getByText('0 complex samples')).not.toBeNull()
    expect(container.querySelector('.gradient-acquisition-i-path')).toBeNull()
    expect(container.querySelector('.gradient-acquisition-q-path')).toBeNull()
  })
})
