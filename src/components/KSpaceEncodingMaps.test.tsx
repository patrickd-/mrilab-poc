// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import KSpaceEncodingMaps from './KSpaceEncodingMaps'

describe('KSpaceEncodingMaps', () => {
  it('paints real and imaginary grayscale values for each ensemble', () => {
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
      render(
        <KSpaceEncodingMaps
          gridSize={3}
          kxCyclesPerMeter={250}
          kyCyclesPerMeter={0}
        />,
      )

      expect(
        screen.getByRole('img', { name: /Real .* spatial encoding map/i }),
      ).not.toBeNull()
      expect(
        screen.getByRole('img', {
          name: /Imaginary .* spatial encoding map/i,
        }),
      ).not.toBeNull()
      expect(putImageData).toHaveBeenCalledTimes(2)

      const centerPixelOffset = (1 * 3 + 1) * 4
      const rightPixelOffset = (1 * 3 + 2) * 4
      const [realImage, imaginaryImage] = images

      expect(realImage.data[centerPixelOffset]).toBe(255)
      expect(imaginaryImage.data[centerPixelOffset]).toBe(128)
      expect(realImage.data[rightPixelOffset]).toBe(128)
      expect(imaginaryImage.data[rightPixelOffset]).toBe(255)
      expect(realImage.data[rightPixelOffset + 3]).toBe(255)
    } finally {
      getContext.mockRestore()
    }
  })
})
