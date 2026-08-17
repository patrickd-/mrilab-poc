// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GradientEncodingExperimentPanel, {
  combinedSpatialFieldOffsetMilliteslaAt,
  createDefaultSpatialGradientProfiles,
  createGradientHeightmap,
  gradientStrengthMilliteslaPerMeter,
} from './GradientEncodingExperimentPanel'

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

  it('maps the lowest and highest combined field offsets to black and white', () => {
    const profiles = createDefaultSpatialGradientProfiles(128)
    const heightmap = createGradientHeightmap(
      profiles.x,
      profiles.y,
      3,
    )

    expect(heightmap.minimumFieldOffsetMillitesla).toBeCloseTo(-1.28, 10)
    expect(heightmap.maximumFieldOffsetMillitesla).toBeCloseTo(1.28, 10)
    expect(Array.from(heightmap.rgba.slice(0, 4))).toEqual([0, 0, 0, 255])
    expect(Array.from(heightmap.rgba.slice(8, 12))).toEqual([
      255,
      255,
      255,
      255,
    ])
  })
})

describe('GradientEncodingExperimentPanel', () => {
  it('renders two spatial endpoint editors and their combined heightmap', () => {
    const { getContext, images } = mockCanvasContext()

    try {
      render(<GradientEncodingExperimentPanel fieldOfViewMillimeters={128} />)

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
          name: /grayscale magnetic gradient heightmap from −1\.28 to \+1\.28 millitesla/i,
        }),
      ).not.toBeNull()
      expect(images).toHaveLength(1)
      expect(images[0].data[0]).toBe(0)
      expect(images[0].data.at(-4)).toBe(255)
    } finally {
      getContext.mockRestore()
    }
  })

  it('lets each fixed spatial endpoint move vertically by dragging', () => {
    const { getContext } = mockCanvasContext()

    try {
      const { container } = render(
        <GradientEncodingExperimentPanel fieldOfViewMillimeters={128} />,
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
      render(<GradientEncodingExperimentPanel fieldOfViewMillimeters={128} />)
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
})
