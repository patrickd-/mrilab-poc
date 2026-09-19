// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VoltageTrace, VOLTAGE_TRACE_DURATION_MS } from './VoltageTrace'
import { createPresentationCsfState, presentationReceivedVoltageAt } from './protonExcitation'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('plots only elapsed signal, backfills dropped frames, and uses the meter voltage', () => {
  let frame: FrameRequestCallback = () => {}
  const cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 42 })
  vi.stubGlobal('cancelAnimationFrame', cancel)
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  const excitation = { fieldStrengthTesla: 3, pulseTimesMilliseconds: [1000] }
  const { rerender, unmount } = render(<VoltageTrace excitation={excitation} startedAt={null} />)
  const path = screen.getByTestId('voltage-trace-signal')
  expect(path.getAttribute('d')).toBe('')
  rerender(<VoltageTrace excitation={excitation} startedAt={1000} />)
  expect(path.getAttribute('d')?.match(/[ML]/g)).toHaveLength(1)
  frame(1400)
  const points = [...path.getAttribute('d')!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)]
  expect(points).toHaveLength(21)
  const last = points.at(-1)!
  const voltage = presentationReceivedVoltageAt(createPresentationCsfState(3), excitation, 1400)
  expect(Number(last[1])).toBeCloseTo(88 + 400 / 12000 * 326, 2)
  expect(Number(last[2])).toBeCloseTo(174 - 74 * voltage, 2)
  frame(1000 + VOLTAGE_TRACE_DURATION_MS + 5000)
  expect(path.getAttribute('data-elapsed-ms')).toBe(String(VOLTAGE_TRACE_DURATION_MS))
  expect(path.getAttribute('d')?.match(/[ML]/g)).toHaveLength(601)
  // Returning to the setup state must clear the previous capture.
  rerender(<VoltageTrace excitation={excitation} startedAt={null} />)
  expect(path.getAttribute('d')).toBe('')
  unmount()
  expect(cancel).toHaveBeenCalledWith(42)
})
