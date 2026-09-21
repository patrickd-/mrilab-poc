// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { howWeGetContrastsSlideModule } from './HowWeGetContrastsSlide'
import { MRI_TISSUE_MAPS } from './contrasts/mriImage'

const Slide = howWeGetContrastsSlideModule.Component
const props = { fieldStrengthTesla: 1.5, stateIndex: 0, direction: 'forward' as const, setFieldStrengthTesla: () => {} }
const putImageData = vi.fn()
beforeEach(() => {
  putImageData.mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData,
  } as unknown as CanvasRenderingContext2D)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

function clickTime(kind: 'signal' | 'longitudinal', time: number) {
  const graph = screen.getByTestId(`contrast-${kind}-plot`)
  vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 620, height: 310 } as DOMRect)
  const window = Number(graph.getAttribute('data-time-window-ms'))
  fireEvent.click(graph, { clientX: 40 + (time / window + 0.08) / 1.08 * 560, clientY: 130 })
}

it('renders the aligned bone density and decay rather than the original map values', () => {
  const { rerender } = render(<Slide {...props} />)
  const boneIndex = MRI_TISSUE_MAPS.density.flat().findIndex(value => value === 0.05) * 4
  const bonePixel = () => putImageData.mock.calls.at(-1)![0].data[boneIndex]
  expect(boneIndex).toBeGreaterThanOrEqual(0)
  expect(bonePixel()).toBe(66) // Original rho=0.05 would have produced 13.
  clickTime('signal', 0.1)
  expect(bonePixel()).toBe(51) // Uses the graph's 0.4 ms T2, not the map's 5 ms.
  clickTime('signal', 10)
  expect(bonePixel()).toBe(0)
  clickTime('signal', 0)
  clickTime('longitudinal', 100)
  expect(bonePixel()).toBe(39) // T1=110 ms at 1.5 T.
  rerender(<Slide {...props} fieldStrengthTesla={3} />)
  expect(bonePixel()).toBe(32) // Re-align from originals: T1=150 ms at 3 T.
})

it('draws all four tissue curves and the complete MRI instantly, without time-based progression', () => {
  vi.useFakeTimers()
  const { container } = render(<Slide {...props} />)
  expect(screen.getByTestId('contrast-image-label').textContent).toBe('Spin/Proton Density Image')
  expect(container.querySelector('.contrast-image small')).toBeNull()
  expect(screen.getByTestId('contrast-signal-plot').getAttribute('data-ensemble-count')).toBe('2048')
  const curves = [...container.querySelectorAll('.tissue-plot__curve')]
  expect(curves).toHaveLength(8)
  const initial = curves.map(curve => curve.getAttribute('d'))
  expect(initial.every(path => path && path.length > 100)).toBe(true)
  expect(putImageData).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(30000))
  expect(curves.map(curve => curve.getAttribute('d'))).toEqual(initial)
  expect(putImageData).toHaveBeenCalledTimes(1)
  expect(screen.queryByTestId('contrast-tr-marker')).toBeNull()
  expect(screen.queryByTestId('contrast-te-marker')).toBeNull()
})

it('edits TR and TE with exact half-TE RF timing and updates the image and curves synchronously', () => {
  render(<Slide {...props} />)
  const baseline = putImageData.mock.calls.at(-1)![0].data.slice()
  clickTime('longitudinal', 500)
  expect(Number(screen.getByTestId('contrast-tr-marker').getAttribute('data-time-ms'))).toBeCloseTo(500)
  expect(screen.getByTestId('contrast-image-label').textContent).toBe('T₁ Weighted Image')
  expect((putImageData.mock.calls.at(-1)![0].data as Uint8ClampedArray).some((v, i) => v !== baseline[i])).toBe(true)
  clickTime('signal', 100)
  expect(Number(screen.getByTestId('contrast-te-marker').getAttribute('data-time-ms'))).toBeCloseTo(100)
  expect(Number(screen.getByTestId('contrast-refocus-marker').getAttribute('data-time-ms'))).toBeCloseTo(50)
  expect(screen.getByTestId('contrast-image-label').textContent).toBe('Mixed T₁ / T₂ Weighted Image')
  clickTime('longitudinal', 5000)
  expect(screen.getByTestId('contrast-image-label').textContent).toBe('T₂ Weighted Image')
  clickTime('signal', 10)
  expect(screen.getByTestId('contrast-image-label').textContent).toBe('Spin/Proton Density Image')
  clickTime('longitudinal', 5)
  expect(screen.getByTestId('contrast-image-label').textContent).toBe('Choose TE shorter than TR')
  expect(screen.getByText('The echo must precede the next excitation.')).toBeTruthy()
  clickTime('longitudinal', 0)
  clickTime('signal', 0)
  expect(screen.queryByTestId('contrast-tr-marker')).toBeNull()
  expect(screen.queryByTestId('contrast-refocus-marker')).toBeNull()
  expect(screen.getByTestId('contrast-image-label').textContent).toBe('Spin/Proton Density Image')
  expect((putImageData.mock.calls.at(-1)![0].data as Uint8ClampedArray).every((v, i) => v === baseline[i])).toBe(true)
})

it('zooms each time axis without changing timing or image data, and refresh resets all choices', () => {
  const { rerender } = render(<Slide {...props} />)
  clickTime('signal', 100)
  const top = screen.getByTestId('contrast-signal-plot'), lower = screen.getByTestId('contrast-longitudinal-plot')
  const imageCount = putImageData.mock.calls.length
  fireEvent.wheel(top, { deltaY: -100 })
  expect(Number(top.getAttribute('data-time-window-ms'))).toBeLessThan(400)
  expect(lower.getAttribute('data-time-window-ms')).toBe('6000')
  expect(putImageData.mock.calls.length).toBe(imageCount)
  expect(Number(screen.getByTestId('contrast-te-marker').getAttribute('data-time-ms'))).toBeCloseTo(100)
  fireEvent.keyDown(top, { key: 'Delete' })
  expect(screen.queryByTestId('contrast-te-marker')).toBeNull()
  clickTime('longitudinal', 700)
  rerender(<Slide key="refresh" {...props} />)
  expect(screen.queryByTestId('contrast-tr-marker')).toBeNull()
  expect(screen.getByTestId('contrast-image-label').textContent).toBe('Spin/Proton Density Image')
})
