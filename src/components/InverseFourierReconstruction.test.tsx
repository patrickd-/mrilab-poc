// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GradientSignalPoint } from '../simulation/gradientEncoding'
import InverseFourierReconstruction, {
  accumulateInverseFourierSamples,
} from './InverseFourierReconstruction'

function point(
  kxCyclesPerMeter: number,
  inPhase: number,
  quadrature: number,
): GradientSignalPoint {
  return {
    kxCyclesPerMeter,
    kyCyclesPerMeter: 0,
    normalizedInPhaseSignal: inPhase,
    normalizedMagnitude: Math.hypot(inPhase, quadrature),
    normalizedQuadratureSignal: quadrature,
    timeMilliseconds: 10,
  }
}

describe('inverse Fourier reconstruction', () => {
  it('reconstructs a spatially shifted source from complex k-space phase', () => {
    const gridSize = 3
    const real = new Float64Array(gridSize ** 2)
    const imaginary = new Float64Array(gridSize ** 2)
    const spatialFrequency = 1000 / 3
    const phase = (2 * Math.PI) / 3

    accumulateInverseFourierSamples(real, imaginary, gridSize, [
      point(0, 1, 0),
      point(spatialFrequency, Math.cos(phase), Math.sin(phase)),
      point(-spatialFrequency, Math.cos(phase), -Math.sin(phase)),
    ])

    const middleRow = gridSize
    expect(Math.hypot(real[middleRow], imaginary[middleRow])).toBeCloseTo(
      0,
      10,
    )
    expect(
      Math.hypot(real[middleRow + 1], imaginary[middleRow + 1]),
    ).toBeCloseTo(0, 10)
    expect(
      Math.hypot(real[middleRow + 2], imaginary[middleRow + 2]),
    ).toBeCloseTo(3, 10)
  })

  it('rejects reconstruction buffers that do not match the image grid', () => {
    expect(() =>
      accumulateInverseFourierSamples(
        new Float64Array(3),
        new Float64Array(4),
        2,
        [],
      ),
    ).toThrow(/buffers must match/i)
  })

  it('paints a retained magnitude image and clears it with acquisition history', () => {
    const images: Array<{ data: Uint8ClampedArray }> = []
    const putImageData = vi.fn()
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
          putImageData,
        }) as unknown as CanvasRenderingContext2D,
      )

    try {
      const { rerender } = render(
        <InverseFourierReconstruction
          acquisitionRuns={[]}
          gridSize={3}
          voxelSizeMillimeters={1}
        />,
      )
      expect(images[0].data[0]).toBe(0)

      rerender(
        <InverseFourierReconstruction
          acquisitionRuns={[
            { id: 0, points: [point(0, 1, 0)] },
          ]}
          gridSize={3}
          voxelSizeMillimeters={1}
        />,
      )
      expect(
        images[1].data.every(
          (value, index) => index % 4 === 3 || value === 255,
        ),
      ).toBe(true)
      expect(
        screen.getByRole('img', {
          name: /partial magnitude mr image from 1 acquisition and 1 complex k-space sample/i,
        }),
      ).not.toBeNull()

      rerender(
        <InverseFourierReconstruction
          acquisitionRuns={[
            { id: 0, points: [point(0, 1, 0)] },
            {
              id: 1,
              points: [
                point(
                  1000 / 3,
                  Math.cos((2 * Math.PI) / 3),
                  Math.sin((2 * Math.PI) / 3),
                ),
              ],
            },
          ]}
          gridSize={3}
          voxelSizeMillimeters={1}
        />,
      )
      expect(
        images[2].data.some(
          (value, index) => index % 4 !== 3 && value < 255,
        ),
      ).toBe(true)
      expect(
        screen.getByRole('img', {
          name: /partial magnitude mr image from 2 acquisitions and 2 complex k-space samples/i,
        }),
      ).not.toBeNull()

      const oneMillimeterImage = images[2].data.slice()
      rerender(
        <InverseFourierReconstruction
          acquisitionRuns={[
            { id: 0, points: [point(0, 1, 0)] },
            {
              id: 1,
              points: [
                point(
                  1000 / 3,
                  Math.cos((2 * Math.PI) / 3),
                  Math.sin((2 * Math.PI) / 3),
                ),
              ],
            },
          ]}
          gridSize={3}
          voxelSizeMillimeters={0.5}
        />,
      )
      expect(images[3].data).not.toEqual(oneMillimeterImage)
      expect(
        screen.getByRole('img', {
          name: /at 0\.500 millimeter voxels/i,
        }),
      ).not.toBeNull()

      rerender(
        <InverseFourierReconstruction
          acquisitionRuns={[]}
          gridSize={3}
          voxelSizeMillimeters={1}
        />,
      )
      expect(images[4].data[0]).toBe(0)
      expect(putImageData).toHaveBeenCalledTimes(5)
    } finally {
      getContext.mockRestore()
    }
  })
})
