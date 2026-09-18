// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { howWeMeasureSlideModule } from './HowWeMeasureSlide'
import { FLICK_CONTACT_MS, FLICK_DURATION_MS } from './howWeMeasure/flickTiming'
import { RF_WAVE_TRAVEL_MS } from './howWeMeasure/RfRemote'

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
