// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import GradientEncodingExperimentPanel, {
  combinedSpatialFieldOffsetMilliteslaAt,
  createDefaultSpatialGradientProfiles,
  gradientStrengthMilliteslaPerMeter,
} from './GradientEncodingExperimentPanel'

function StatefulGradientEncodingExperimentPanel() {
  const defaults = createDefaultSpatialGradientProfiles(128)
  const [xEnabled, setXEnabled] = useState(true)
  const [xProfile, setXProfile] = useState(defaults.x)
  const [yEnabled, setYEnabled] = useState(true)
  const [yProfile, setYProfile] = useState(defaults.y)

  return (
    <GradientEncodingExperimentPanel
      fieldOfViewMillimeters={128}
      xEnabled={xEnabled}
      xProfile={xProfile}
      yEnabled={yEnabled}
      yProfile={yProfile}
      onXEnabledChange={setXEnabled}
      onXProfileChange={setXProfile}
      onYEnabledChange={setYEnabled}
      onYProfileChange={setYProfile}
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
  it('renders two spatial endpoint editors without a redundant 2D preview', () => {
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
    expect(screen.queryByRole('img')).toBeNull()
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
