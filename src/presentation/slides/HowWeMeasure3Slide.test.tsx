// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { howWeMeasure3SlideModule } from './HowWeMeasure3Slide'
import { SimulationClock } from '../playback/simulationClock'

vi.mock('./howWeMeasure2/CsfEnsembleGraphic', () => ({
  CsfEnsembleGraphic: (props: ComponentProps<typeof import('./howWeMeasure2/CsfEnsembleGraphic').CsfEnsembleGraphic>) =>
    <div data-testid="race-renderer" onClick={props.onSettled} data-pulses={JSON.stringify(props.excitation.pulseEvents)}
      data-count={props.states.length} data-paused={props.clock?.paused ?? false} data-ends-at={props.endsAt}
      data-positions={JSON.stringify(props.states.map(state => props.motion!.offsetAt(state, props.excitation, props.clock!.now(), 520, 700)))} />,
}))

const Slide = howWeMeasure3SlideModule.Component
const props = { fieldStrengthTesla: 1.5, stateIndex: 0, direction: 'forward' as const, setFieldStrengthTesla: () => {} }
afterEach(() => vi.useRealTimers())

it('starts a fresh six-racer acquisition only after the split, and replays an edited echo with the same pulse list', () => {
  vi.useFakeTimers()
  const clock = new SimulationClock()
  const { container, rerender } = render(<Slide {...props} simulationClock={clock} />)
  const renderer = () => screen.getByTestId('race-renderer')
  const pulses = () => JSON.parse(renderer().getAttribute('data-pulses')!)
  const signal = () => screen.getByTestId('cerebrospinal-fluid-signal')
  expect(renderer().getAttribute('data-count')).toBe('6')
  expect(pulses()).toEqual([])
  expect(signal().getAttribute('d')).toBe('')
  expect(screen.queryByTestId('signal-refocus-marker')).toBeNull()
  expect(container.querySelectorAll('.proton-race-track__lane')).toHaveLength(7)
  expect(screen.queryByText('START / FINISH')).toBeNull()
  expect(screen.getByTestId('race-checkerboard')).toBeTruthy()
  expect(container.querySelectorAll('.field-lines')).toHaveLength(0)
  expect(container.querySelectorAll('.magnet')).toHaveLength(2)
  const lanes = container.querySelectorAll('.proton-race-track__surface')
  expect(lanes).toHaveLength(6)
  expect(new Set(Array.from(lanes, lane => lane.getAttribute('fill'))).size).toBe(6)
  fireEvent.click(renderer())
  const startedAt = pulses()[0].timeMilliseconds
  expect(startedAt).toBe(clock.now() + 200)
  fireEvent.click(renderer())
  expect(pulses()[0].timeMilliseconds).toBe(startedAt)
  act(() => vi.advanceTimersByTime(1000))
  expect(signal().getAttribute('d')).not.toBe('')
  const graph = screen.getByRole('img', { name: 'Tissue transverse signal over time' })
  vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 620, height: 310 } as DOMRect)
  fireEvent.click(graph, { clientX: 40 + (1500 + 960) / 12960 * 560, clientY: 120 })
  expect(pulses()).toHaveLength(2)
  expect(pulses()[1].kind).toBe('180-x')
  expect(pulses()[1].timeMilliseconds - pulses()[0].timeMilliseconds).toBeCloseTo(1500)
  expect(Number(signal().getAttribute('data-elapsed-ms'))).toBe(-200)
  const pulseTime = pulses()[0].timeMilliseconds
  act(() => vi.advanceTimersByTime(3220))
  const echoX = 40 + (3000 + 960) / 12960 * 560
  const echoY = 254 - 184 * Math.exp(-3000 / 2100)
  expect(signal().getAttribute('d')).toContain(`${echoX.toFixed(3)} ${echoY.toFixed(3)}`)
  clock.setPaused(true)
  rerender(<Slide {...props} simulationClock={clock} />)
  const frozen = signal().getAttribute('d')
  const positions = renderer().getAttribute('data-positions')
  act(() => vi.advanceTimersByTime(20000))
  rerender(<Slide {...props} simulationClock={clock} />)
  expect(renderer().getAttribute('data-positions')).toBe(positions)
  expect(signal().getAttribute('d')).toBe(frozen)
  expect(pulses()[0].timeMilliseconds).toBe(pulseTime)
  clock.setPaused(false)
  rerender(<Slide {...props} simulationClock={clock} />)
  act(() => vi.advanceTimersByTime(100))
  expect(signal().getAttribute('d')).not.toBe(frozen)
  // The presentation's refresh remount resets both the race and RF marker.
  rerender(<Slide key="refreshed" {...props} simulationClock={clock} />)
  expect(pulses()).toEqual([])
  expect(signal().getAttribute('d')).toBe('')
  expect(screen.queryByTestId('signal-refocus-marker')).toBeNull()
})
