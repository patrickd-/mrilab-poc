// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { howWeMeasureSlideModule } from './HowWeMeasureSlide'
import { FLICK_CONTACT_MS, FLICK_DURATION_MS } from './howWeMeasure/flickTiming'
import { RF_WAVE_TRAVEL_MS } from './howWeMeasure/RfRemote'
import { FID_PLAY_PLAN } from '../playback/playPlan'

const MEASUREMENT_LAYOUT_MS = FID_PLAY_PLAN.layoutDurationMilliseconds
const MEASUREMENT_PULSE_DELAY_MS = FID_PLAY_PLAN.settleDelayMilliseconds

const Slide = howWeMeasureSlideModule.Component
const props = { stateIndex: 3, fieldStrengthTesla: 3, setFieldStrengthTesla: () => {}, direction: 'forward' as const }
afterEach(() => vi.useRealTimers())

it('emits at contact, excites on wave arrival, and supports repeated remote flicks', () => {
  vi.useFakeTimers()
  const { container } = render(<Slide {...props} />)
  const magnet = container.querySelector('[data-rf-pulse-count]')!
  const hand = screen.getByRole('button', { name: 'Flick the remote control button' })
  fireEvent.click(hand)
  act(() => vi.advanceTimersByTime(FLICK_CONTACT_MS - 1))
  expect(screen.queryByTestId('rf-wavefront')).toBeNull()
  expect(magnet.getAttribute('data-rf-pulse-count')).toBe('0')
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByTestId('rf-wavefront')).toBeTruthy()
  expect(magnet.getAttribute('data-rf-pulse-count')).toBe('0')
  act(() => vi.advanceTimersByTime(RF_WAVE_TRAVEL_MS))
  expect(magnet.getAttribute('data-rf-pulse-count')).toBe('1')
  act(() => vi.advanceTimersByTime(FLICK_DURATION_MS))
  expect((hand as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: /send a 90° RF pulse/ }))
  expect(screen.queryByTestId('rf-wavefront')).toBeNull()
  act(() => vi.advanceTimersByTime(FLICK_CONTACT_MS + RF_WAVE_TRAVEL_MS))
  expect(magnet.getAttribute('data-rf-pulse-count')).toBe('2')
})

it('cancels pending RF when navigating back and returns with a fresh aligned proton', () => {
  vi.useFakeTimers()
  const { container, rerender } = render(<Slide {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Flick the remote control button' }))
  act(() => vi.advanceTimersByTime(FLICK_CONTACT_MS))
  rerender(<Slide {...props} stateIndex={2} />)
  act(() => vi.advanceTimersByTime(2000))
  rerender(<Slide {...props} />)
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('0')
  expect(screen.queryByTestId('rf-wavefront')).toBeNull()
})

it('still transmits at zero B0 but does not create equilibrium magnetization', () => {
  vi.useFakeTimers()
  const { container } = render(<Slide {...props} fieldStrengthTesla={0} />)
  fireEvent.click(screen.getByRole('button', { name: 'Flick the remote control button' }))
  act(() => vi.advanceTimersByTime(FLICK_CONTACT_MS + RF_WAVE_TRAVEL_MS))
  expect(screen.getByTestId('rf-wavefront')).toBeTruthy()
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('0')
})

it('adds the receiver without interrupting a pulse or resetting ongoing relaxation', () => {
  vi.useFakeTimers()
  const { container, rerender } = render(<Slide {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Flick the remote control button' }))
  act(() => vi.advanceTimersByTime(FLICK_CONTACT_MS))
  rerender(<Slide {...props} stateIndex={4} />)
  expect(screen.getByRole('img', { name: /Copper receive coil/ })).toBeTruthy()
  expect(screen.getByTestId('voltmeter-needle').getAttribute('data-relative-voltage')).toBe('0')
  act(() => vi.advanceTimersByTime(RF_WAVE_TRAVEL_MS + 100))
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('1')
  rerender(<Slide {...props} />)
  expect(screen.queryByRole('img', { name: /Copper receive coil/ })).toBeNull()
  rerender(<Slide {...props} stateIndex={4} />)
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('1')
})

it('moves the controls out, then automatically starts one fresh acquisition at t=0', () => {
  vi.useFakeTimers()
  const { container, rerender } = render(<Slide {...props} stateIndex={4} />)
  fireEvent.click(screen.getByRole('button', { name: /send a 90° RF pulse/ }))
  act(() => vi.advanceTimersByTime(FLICK_CONTACT_MS + RF_WAVE_TRAVEL_MS))
  rerender(<Slide {...props} stateIndex={5} />)
  const magnet = container.querySelector('[data-rf-pulse-count]')!
  const signal = screen.getByTestId('voltage-trace-signal')
  expect(magnet.getAttribute('data-rf-pulse-count')).toBe('1') // Scheduled, not applied yet.
  expect(signal.getAttribute('data-elapsed-ms')).toBe(String(-MEASUREMENT_LAYOUT_MS - MEASUREMENT_PULSE_DELAY_MS))
  expect(screen.getByRole('img', { name: '90° RF pulse at 0 s' })).toBeTruthy()
  expect((screen.getByRole('button', { name: /send a 90° RF pulse/ }) as HTMLButtonElement).disabled).toBe(true)

  act(() => vi.advanceTimersByTime(MEASUREMENT_LAYOUT_MS))
  expect(screen.queryByRole('button', { name: /remote control/ })).toBeNull()
  expect(Number(signal.getAttribute('data-elapsed-ms'))).toBeLessThanOrEqual(-MEASUREMENT_PULSE_DELAY_MS)
  expect(screen.getByTestId('voltmeter-needle').getAttribute('data-relative-voltage')).toBe('0')
  act(() => vi.advanceTimersByTime(MEASUREMENT_PULSE_DELAY_MS - 1))
  expect(Number(signal.getAttribute('data-elapsed-ms'))).toBeLessThan(0)
  expect(screen.getByTestId('voltmeter-needle').getAttribute('data-relative-voltage')).toBe('0')
  act(() => vi.advanceTimersByTime(1))
  expect(magnet.getAttribute('data-rf-pulse-count')).toBe('1')
  expect(signal.getAttribute('d')).toMatch(/^M40\.00 162\.00 /)
  act(() => vi.advanceTimersByTime(3000))
  expect(magnet.getAttribute('data-rf-pulse-count')).toBe('1')
  expect(Number(signal.getAttribute('data-elapsed-ms'))).toBeGreaterThan(2900)
})

it('cancels the automatic pulse on exit and starts a new capture on re-entry', () => {
  vi.useFakeTimers()
  const { container, rerender } = render(<Slide {...props} stateIndex={5} />)
  act(() => vi.advanceTimersByTime(MEASUREMENT_LAYOUT_MS))
  rerender(<Slide {...props} stateIndex={4} />)
  act(() => vi.advanceTimersByTime(2000))
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('0')
  expect(screen.queryByRole('img', { name: 'Induced voltage over time' })).toBeNull()
  expect(screen.getByRole('button', { name: /send a 90° RF pulse/ })).toBeTruthy()
  rerender(<Slide {...props} stateIndex={5} />)
  act(() => vi.advanceTimersByTime(MEASUREMENT_LAYOUT_MS + MEASUREMENT_PULSE_DELAY_MS))
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('1')
  expect(Number(screen.getByTestId('voltage-trace-signal').getAttribute('data-elapsed-ms'))).toBeGreaterThanOrEqual(-16)
})

it('replays with one movable recovery pulse, retains the original trace, and clears on exit', () => {
  vi.useFakeTimers()
  const { container, rerender } = render(<Slide {...props} stateIndex={5} />)
  act(() => vi.advanceTimersByTime(5000))
  const svg = screen.getByRole('img', { name: 'Induced voltage over time' })
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 440, height: 310 } as DOMRect)
  const clickAt = (time: number) => fireEvent.click(svg, {
    clientX: 40 + (time + 1300) / 13300 * 380, clientY: 162,
  })
  const original = screen.getByTestId('voltage-trace-signal').getAttribute('d')
  clickAt(2000)
  expect(screen.getByRole('img', { name: 'Adaptive tip to 90° RF pulse at 2 s' })).toBeTruthy()
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('2')
  expect(screen.getByTestId('voltage-trace-reference').getAttribute('d')).toBe(original)
  expect(Number(screen.getByTestId('voltage-trace-signal').getAttribute('data-elapsed-ms'))).toBeLessThan(0)
  expect(Number(screen.getByTestId('voltmeter-needle').getAttribute('data-relative-voltage'))).toBe(0)
  act(() => vi.advanceTimersByTime(4500))
  expect(Number(screen.getByTestId('voltage-trace-signal').getAttribute('data-elapsed-ms'))).toBeGreaterThan(3000)
  clickAt(4000)
  expect(screen.queryByRole('img', { name: 'Adaptive tip to 90° RF pulse at 2 s' })).toBeNull()
  expect(screen.getByRole('img', { name: 'Adaptive tip to 90° RF pulse at 4 s' })).toBeTruthy()
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('2')
  expect(screen.getByTestId('voltage-trace-reference').getAttribute('d')).toBe(original)
  act(() => vi.advanceTimersByTime(2000))
  clickAt(4000) // Even placing it at the same time starts a fresh run.
  expect(Number(screen.getByTestId('voltage-trace-signal').getAttribute('data-elapsed-ms'))).toBeLessThan(0)
  rerender(<Slide {...props} stateIndex={4} />)
  rerender(<Slide {...props} stateIndex={5} />)
  expect(screen.queryByTestId('voltage-trace-reference')).toBeNull()
  expect(screen.queryByRole('img', { name: /Adaptive tip to 90°/ })).toBeNull()
  expect(container.querySelector('[data-rf-pulse-count]')?.getAttribute('data-rf-pulse-count')).toBe('1')
})
