// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TwoDimensionalGradientEncodingExperimentPanel from './TwoDimensionalGradientEncodingExperimentPanel'

const putImageData = vi.fn()

beforeEach(() => {
  putImageData.mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData,
      }) as unknown as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TwoDimensionalGradientEncodingExperimentPanel', () => {
  it('renders sequential phase and frequency vector editors with complex maps', () => {
    render(<TwoDimensionalGradientEncodingExperimentPanel gridSize={8} />)

    expect(screen.getByText('Phase & Frequency Encoding')).not.toBeNull()
    expect(
      screen.getByRole('group', {
        name: 'Phase encoding gradient with editable G x and G y lines',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('group', {
        name: 'Frequency encoding gradient with editable G x and G y lines',
      }),
    ).not.toBeNull()
    expect(screen.getAllByRole('slider')).toHaveLength(8)
    expect(
      screen.getByRole('img', { name: /Real .* spatial encoding map/i }),
    ).not.toBeNull()
    expect(
      screen.getByRole('img', {
        name: /Imaginary .* spatial encoding map/i,
      }),
    ).not.toBeNull()
    expect(screen.getByLabelText('Encoding order').textContent).toContain(
      'GPE',
    )
    expect(putImageData).toHaveBeenCalledTimes(2)
  })

  it('updates the accumulated basis immediately when a gradient changes', () => {
    render(<TwoDimensionalGradientEncodingExperimentPanel gridSize={8} />)
    const phaseXStart = screen.getByRole('slider', {
      name: 'Phase encoding G x gradient 0 millimeter endpoint',
    })
    const initialValue = Number(phaseXStart.getAttribute('aria-valuenow'))

    fireEvent.keyDown(phaseXStart, { key: 'ArrowUp' })

    expect(Number(phaseXStart.getAttribute('aria-valuenow'))).toBeCloseTo(
      initialValue + 0.08,
      10,
    )
    expect(putImageData.mock.calls.length).toBeGreaterThan(2)

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Enable phase encoding gradient',
      }),
    )
    expect(
      screen.getByLabelText('Current complex spatial encoding basis')
        .textContent,
    ).toContain('ky = 0.000 cycles/mm')
  })
})
