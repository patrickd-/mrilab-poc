// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { howWeMeasure2SlideModule } from '../HowWeMeasure2Slide'

// jsdom has no WebGL/paint clock. Explicitly finish a renderer transition.
vi.mock('./CsfEnsembleGraphic', () => ({
  CsfEnsembleGraphic: (props: ComponentProps<typeof import('./CsfEnsembleGraphic').CsfEnsembleGraphic>) =>
    <div data-testid="csf-renderer" onClick={props.onSettled} data-step={props.step}
      data-pulse-time={props.excitation.pulseEvents[0]?.timeMilliseconds ?? ''}
      data-cells={props.states.length} />,
}))
const Slide = howWeMeasure2SlideModule.Component
const props = { fieldStrengthTesla: 1.5, direction: 'forward' as const, setFieldStrengthTesla: () => {} }
afterEach(() => vi.useRealTimers())

it('replays single/grid acquisitions after motion, hides the grid, and reveals measured T2-star', () => {
  vi.useFakeTimers()
  const { container, rerender } = render(<Slide {...props} stateIndex={1} />)
  const scene = () => screen.getByTestId('csf-renderer')
  const signal = () => screen.getByTestId('cerebrospinal-fluid-signal')
  expect(scene().getAttribute('data-pulse-time')).toBe('')
  fireEvent.click(scene())
  act(() => vi.advanceTimersByTime(800))
  expect(signal().getAttribute('d')).not.toBe('')
  expect(container.querySelectorAll('.tissue-specimen')).toHaveLength(0)
  for (const name of ['cortical-bone', 'white-matter', 'gray-matter']) {
    expect(screen.getByTestId(`${name}-signal`).getAttribute('opacity')).toBe('0')
  }
  rerender(<Slide {...props} stateIndex={2} />)
  expect(scene().getAttribute('data-cells')).toBe('36')
  expect(scene().getAttribute('data-pulse-time')).toBe('')
  expect(signal().getAttribute('d')).toBe('')
  fireEvent.click(scene())
  act(() => vi.advanceTimersByTime(800))
  const pulse = scene().getAttribute('data-pulse-time')
  rerender(<Slide {...props} stateIndex={3} />)
  fireEvent.click(scene())
  expect(scene().getAttribute('data-pulse-time')).toBe(pulse)
  rerender(<Slide {...props} stateIndex={4} />)
  fireEvent.click(scene())
  expect(container.querySelector('.field-backdrop--nonuniform')).toBeTruthy()
  expect(scene().getAttribute('data-pulse-time')).toBe(pulse)
  rerender(<Slide {...props} stateIndex={5} />)
  expect(signal().getAttribute('d')).toBe('')
  expect(scene().getAttribute('data-pulse-time')).toBe('')
  fireEvent.click(scene())
  act(() => vi.advanceTimersByTime(800))
  expect(container.querySelector('.tissue-plot--signal .tissue-plot__identity')?.textContent).toBe('T2*')
  expect(container.querySelector('.tissue-plot--longitudinal .tissue-plot__identity')?.textContent).toBe('T1')
  expect(screen.getByTestId('csf-intrinsic-reference').getAttribute('opacity')).toBe('0.25')
  expect(screen.getByTestId('csf-intrinsic-reference').getAttribute('d')).not.toBe(signal().getAttribute('d'))
  const beforeStack = scene().getAttribute('data-pulse-time')
  const curve = signal().getAttribute('d')
  rerender(<Slide {...props} stateIndex={6} />)
  fireEvent.click(scene())
  expect(scene().getAttribute('data-pulse-time')).toBe(beforeStack)
  expect(signal().getAttribute('d')).toBe(curve)
})

it('can replay the stacked step directly and leave before any scheduled pulse', () => {
  vi.useFakeTimers()
  const { unmount } = render(<Slide {...props} stateIndex={6} />)
  expect(screen.getByTestId('csf-renderer').getAttribute('data-pulse-time')).toBe('')
  fireEvent.click(screen.getByTestId('csf-renderer'))
  expect(screen.getByTestId('csf-renderer').getAttribute('data-pulse-time')).not.toBe('')
  unmount()
  act(() => vi.advanceTimersByTime(15000))
  expect(screen.queryByTestId('csf-renderer')).toBeNull()
})
