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
      data-pulses={JSON.stringify(props.excitation.pulseEvents)}
      data-cells={props.states.length} data-paused={props.clock?.paused ?? false} />,
}))
const Slide = howWeMeasure2SlideModule.Component
const props = { fieldStrengthTesla: 1.5, direction: 'forward' as const, setFieldStrengthTesla: () => {} }
afterEach(() => vi.useRealTimers())

function clickGraphAt(time: number, kind: 'transverse signal' | 'longitudinal magnetization' = 'transverse signal') {
  const graph = screen.getByRole('img', { name: `Tissue ${kind} over time` })
  vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 620, height: 310 } as DOMRect)
  const window = Number(graph.getAttribute('data-time-window-ms'))
  fireEvent.click(graph, { clientX: 40 + (time + window * 0.08) / (window * 1.08) * 560, clientY: 120 })
}

it('places and moves one real 180-degree pulse from either graph, preserving it for the stacked replay', () => {
  vi.useFakeTimers()
  const { rerender } = render(<Slide {...props} stateIndex={2} />)
  const scene = () => screen.getByTestId('csf-renderer')
  const pulses = () => JSON.parse(scene().getAttribute('data-pulses')!) as { timeMilliseconds: number; kind: string }[]
  fireEvent.click(scene())
  clickGraphAt(2000)
  expect(pulses()).toHaveLength(1)
  expect(screen.queryByTestId('signal-refocus-marker')).toBeNull()
  rerender(<Slide {...props} stateIndex={5} />)
  fireEvent.click(scene())
  act(() => vi.advanceTimersByTime(1000))
  clickGraphAt(-100)
  expect(pulses()).toHaveLength(1)
  clickGraphAt(2000)
  expect(pulses()).toHaveLength(2)
  const yellowTag = screen.getByTestId('signal-refocus-marker')
  const redTag = screen.getByLabelText('90° RF pulse at 0 s', { selector: '.tissue-plot--signal g' })
  for (const part of ['voltage-trace__tag', 'voltage-trace__rf-symbol']) {
    expect(yellowTag.querySelector(`.${part}`)?.getAttribute('d')).toBe(redTag.querySelector(`.${part}`)?.getAttribute('d'))
  }
  expect(yellowTag.querySelector('text')).toBeNull()
  expect(pulses()[1].kind).toBe('180-x')
  expect(pulses()[1].timeMilliseconds - pulses()[0].timeMilliseconds).toBeCloseTo(2000)
  expect(Number(screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('data-elapsed-ms'))).toBe(-200)
  for (const kind of ['signal', 'longitudinal']) {
    expect(Number(screen.getByTestId(`${kind}-refocus-marker`).getAttribute('data-time-ms'))).toBeCloseTo(2000)
  }
  clickGraphAt(1234.5, 'longitudinal magnetization')
  expect(pulses()).toHaveLength(2)
  expect(pulses()[1].timeMilliseconds - pulses()[0].timeMilliseconds).toBeCloseTo(1234.5)
  act(() => vi.advanceTimersByTime(2800))
  // The exact echo sample comes from the same pulse list sent to the renderer.
  const path = screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('d')!
  const echoX = 40 + (2469 + 960) / 12960 * 560
  const echoY = 254 - 184 * Math.exp(-2469 / 2100)
  expect(path).toContain(`${echoX.toFixed(3)} ${echoY.toFixed(3)}`)
  // T1 inversion must be a vertical step, not a ramp or a clipped negative value.
  const t1 = screen.getByTestId('cerebrospinal-fluid-longitudinal').getAttribute('d')!
  const pulseX = (40 + (1234.5 + 960) / 12960 * 560).toFixed(3)
  const mz = 1 - Math.exp(-1234.5 / 4300)
  expect(t1).toContain(`${pulseX} ${(162 - 92 * mz).toFixed(3)} L${pulseX} ${(162 + 92 * mz).toFixed(3)}`)
  rerender(<Slide {...props} stateIndex={6} />)
  expect(pulses()).toHaveLength(0)
  fireEvent.click(scene())
  expect(pulses()[1].timeMilliseconds - pulses()[0].timeMilliseconds).toBeCloseTo(1234.5)
  rerender(<Slide {...props} stateIndex={4} />)
  expect(screen.queryByTestId('signal-refocus-marker')).toBeNull()
  rerender(<Slide {...props} stateIndex={5} />)
  fireEvent.click(scene())
  expect(pulses()).toHaveLength(1)
})

it('extends the time range for late echoes and holds a newly scheduled pulse while paused', () => {
  vi.useFakeTimers()
  const clock = new SimulationClock()
  const { rerender } = render(<Slide {...props} stateIndex={5} simulationClock={clock} />)
  fireEvent.click(screen.getByTestId('csf-renderer'))
  clock.setPaused(true)
  rerender(<Slide {...props} stateIndex={5} simulationClock={clock} />)
  clickGraphAt(8000)
  const graph = screen.getByRole('img', { name: 'Tissue transverse signal over time' })
  expect(Number(graph.getAttribute('data-time-window-ms'))).toBeCloseTo(17000)
  act(() => vi.advanceTimersByTime(20000))
  expect(Number(screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('data-elapsed-ms'))).toBe(-200)
  clock.setPaused(false)
  rerender(<Slide {...props} stateIndex={5} simulationClock={clock} />)
  act(() => vi.advanceTimersByTime(16250))
  expect(Number(screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('data-elapsed-ms'))).toBeGreaterThan(16000)
})

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
