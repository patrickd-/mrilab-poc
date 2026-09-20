// @vitest-environment jsdom
import type { ComponentProps } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { howWeMeasure2SlideModule } from '../HowWeMeasure2Slide'
import { SimulationClock } from '../../playback/simulationClock'

// jsdom has no WebGL/paint clock. Explicitly finish a renderer transition.
vi.mock('./CsfEnsembleGraphic', () => ({
  CsfEnsembleGraphic: (props: ComponentProps<typeof import('./CsfEnsembleGraphic').CsfEnsembleGraphic>) =>
    <div data-testid="csf-renderer" onClick={props.onSettled} data-step={props.step}
      data-pulse-time={props.excitation.pulseEvents[0]?.timeMilliseconds ?? ''}
      data-cells={props.states.length} data-paused={props.clock?.paused ?? false} />,
}))
const Slide = howWeMeasure2SlideModule.Component
const props = { fieldStrengthTesla: 1.5, direction: 'forward' as const, setFieldStrengthTesla: () => {} }
afterEach(() => vi.useRealTimers())

it('pauses both graphs and the renderer clock, allows zoom while paused, and resumes without catch-up', () => {
  vi.useFakeTimers()
  const clock = new SimulationClock()
  const { rerender } = render(<Slide {...props} stateIndex={5} simulationClock={clock} />)
  fireEvent.click(screen.getByTestId('csf-renderer'))
  act(() => vi.advanceTimersByTime(1200))
  clock.setPaused(true)
  rerender(<Slide {...props} stateIndex={5} simulationClock={clock} />)
  const signal = screen.getByTestId('cerebrospinal-fluid-signal')
  const longitudinal = screen.getByTestId('cerebrospinal-fluid-longitudinal')
  const frozen = [signal.getAttribute('d'), longitudinal.getAttribute('d')]
  const elapsed = Number(signal.getAttribute('data-elapsed-ms'))
  const time = clock.now()
  expect(screen.getByTestId('csf-renderer').getAttribute('data-paused')).toBe('true')
  act(() => vi.advanceTimersByTime(20000))
  expect(clock.now()).toBe(time)
  expect([signal.getAttribute('d'), longitudinal.getAttribute('d')]).toEqual(frozen)
  fireEvent.wheel(screen.getByRole('img', { name: 'Tissue transverse signal over time' }), { deltaY: -200 })
  expect(signal.getAttribute('d')).not.toBe(frozen[0])
  expect(Number(signal.getAttribute('data-elapsed-ms'))).toBe(elapsed)
  clock.setPaused(false)
  rerender(<Slide {...props} stateIndex={5} simulationClock={clock} />)
  act(() => vi.advanceTimersByTime(500))
  expect(screen.getByTestId('csf-renderer').getAttribute('data-paused')).toBe('false')
  expect(Number(signal.getAttribute('data-elapsed-ms'))).toBeGreaterThan(elapsed + 480)
  expect(Number(signal.getAttribute('data-elapsed-ms'))).toBeLessThanOrEqual(elapsed + 500)
  expect(longitudinal.getAttribute('data-elapsed-ms')).toBe(signal.getAttribute('data-elapsed-ms'))
})

it('holds a scheduled excitation if paused during the layout or RF lead-in', () => {
  vi.useFakeTimers()
  const clock = new SimulationClock()
  clock.setPaused(true)
  const { rerender } = render(<Slide {...props} stateIndex={6} simulationClock={clock} />)
  fireEvent.click(screen.getByTestId('csf-renderer'))
  act(() => vi.advanceTimersByTime(5000))
  expect(Number(screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('data-elapsed-ms'))).toBe(-200)
  clock.setPaused(false)
  rerender(<Slide {...props} stateIndex={6} simulationClock={clock} />)
  act(() => vi.advanceTimersByTime(250))
  expect(Number(screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('data-elapsed-ms'))).toBeGreaterThan(0)
})

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
  rerender(<Slide {...props} stateIndex={6} />)
  expect(scene().getAttribute('data-pulse-time')).toBe('')
  expect(signal().getAttribute('d')).toBe('')
  expect(screen.getByTestId('cerebrospinal-fluid-longitudinal').getAttribute('d')).toBe('')
  expect(screen.getByTestId('csf-intrinsic-reference').getAttribute('d')).toBe('')
  fireEvent.click(scene())
  const stackedPulse = scene().getAttribute('data-pulse-time')
  expect(Number(stackedPulse)).toBeGreaterThan(Number(beforeStack))
  act(() => vi.advanceTimersByTime(800))
  expect(signal().getAttribute('d')).not.toBe('')
  expect(screen.getByTestId('cerebrospinal-fluid-longitudinal').getAttribute('d')).not.toBe('')
  fireEvent.click(scene())
  expect(scene().getAttribute('data-pulse-time')).toBe(stackedPulse)
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
