// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import GradientEncodingExperimentPanel, {
  combinedSpatialFieldOffsetMilliteslaAt,
  createDefaultSpatialGradientProfiles,
  createGradientHeightmap,
  gradientStrengthMilliteslaPerMeter,
  magneticFieldHeightColor,
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

function mockCanvasContext() {
  const images: Array<{ data: Uint8ClampedArray }> = []
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() =>
      ({
        createImageData: (width: number, height: number) => {
          const image = {
            data: new Uint8ClampedArray(width * height * 4),
          }
          images.push(image)
          return image
        },
        putImageData: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
    )

  return { getContext, images }
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

  it('maps field offsets onto one fixed physical color scale', () => {
    const profiles = createDefaultSpatialGradientProfiles(128)
    const heightmap = createGradientHeightmap(
      profiles.x,
      profiles.y,
      3,
    )

    expect(heightmap.minimumFieldOffsetMillitesla).toBeCloseTo(-1.28, 10)
    expect(heightmap.maximumFieldOffsetMillitesla).toBeCloseTo(1.28, 10)
    expect(heightmap.displayMinimumFieldOffsetMillitesla).toBeCloseTo(
      -5.12,
      10,
    )
    expect(heightmap.displayMaximumFieldOffsetMillitesla).toBeCloseTo(
      5.12,
      10,
    )
    expect(magneticFieldHeightColor(0)).toEqual([68, 1, 84])
    expect(magneticFieldHeightColor(0.5)).toEqual([33, 145, 140])
    expect(magneticFieldHeightColor(1)).toEqual([253, 231, 37])
    expect(Array.from(heightmap.rgba.slice(0, 3))).toEqual(
      magneticFieldHeightColor(0.375),
    )
    expect(heightmap.rgba[3]).toBe(255)
    expect(Array.from(heightmap.rgba.slice(8, 11))).toEqual(
      magneticFieldHeightColor(0.625),
    )
    expect(heightmap.rgba[11]).toBe(255)
  })

  it('changes gradually while summing both gradient axes per pixel', () => {
    const flat = {
      endFieldOffsetMillitesla: 0,
      startFieldOffsetMillitesla: 0,
    }
    const gentleRise = {
      endFieldOffsetMillitesla: 0.08,
      startFieldOffsetMillitesla: 0,
    }
    const xOnly = createGradientHeightmap(gentleRise, flat, 2, 5.12)
    const xAndY = createGradientHeightmap(
      gentleRise,
      gentleRise,
      2,
      5.12,
    )

    expect(Array.from(xOnly.rgba.slice(0, 3))).toEqual(
      magneticFieldHeightColor(0.5),
    )
    expect(Array.from(xOnly.rgba.slice(4, 7))).toEqual(
      magneticFieldHeightColor((0.08 + 5.12) / 10.24),
    )
    expect(Array.from(xAndY.rgba.slice(4, 7))).toEqual(
      magneticFieldHeightColor((0.16 + 5.12) / 10.24),
    )
    expect(Array.from(xAndY.rgba.slice(8, 11))).toEqual(
      magneticFieldHeightColor(0.5),
    )
  })
})

describe('GradientEncodingExperimentPanel', () => {
  it('renders two spatial endpoint editors and their combined heightmap', () => {
    const { getContext, images } = mockCanvasContext()

    try {
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
        screen.getByRole('img', {
          name: /magnetic gradient color heightmap with actual field offsets from −1\.28 to \+1\.28 millitesla on a fixed −5\.12 to \+5\.12 millitesla scale/i,
        }),
      ).not.toBeNull()
      expect(images).toHaveLength(1)
      expect(Array.from(images[0].data.slice(0, 3))).toEqual(
        magneticFieldHeightColor(0.375),
      )
      expect(Array.from(images[0].data.slice(-4, -1))).toEqual(
        magneticFieldHeightColor(0.625),
      )
    } finally {
      getContext.mockRestore()
    }
  })

  it('lets each fixed spatial endpoint move vertically by dragging', () => {
    const { getContext } = mockCanvasContext()

    try {
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
    } finally {
      getContext.mockRestore()
    }
  })

  it('supports keyboard adjustment and per-axis reset', () => {
    const { getContext } = mockCanvasContext()

    try {
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
    } finally {
      getContext.mockRestore()
    }
  })

  it('disables an axis contribution without discarding its profile', () => {
    const { getContext, images } = mockCanvasContext()

    try {
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
      const disabledPreview = images.at(-1)?.data
      expect(Array.from(disabledPreview?.slice(0, 3) ?? [])).toEqual(
        magneticFieldHeightColor(0.5),
      )
      expect(Array.from(disabledPreview?.slice(-4, -1) ?? [])).toEqual(
        magneticFieldHeightColor(0.5),
      )

      fireEvent.click(xToggle)
      expect((xToggle as HTMLInputElement).checked).toBe(true)
      expect(xStartHandle.getAttribute('aria-valuenow')).toBe('-1.28')
    } finally {
      getContext.mockRestore()
    }
  })
})
