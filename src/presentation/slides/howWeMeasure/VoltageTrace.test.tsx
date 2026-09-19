// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VoltageTrace } from './VoltageTrace'
import { FID_PLAY_PLAN, startPlayPlan } from '../../playback/playPlan'
const VOLTAGE_TRACE_DURATION_MS = FID_PLAY_PLAN.durationMilliseconds
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
  const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
  const excitation = { fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: 1000, kind: '90-y' as const }] }
  const { rerender, unmount } = render(<VoltageTrace excitation={excitation} startedAt={null} />)
  const path = screen.getByTestId('voltage-trace-signal')
  expect(path.getAttribute('d')).toBe('')
  rerender(<VoltageTrace excitation={excitation} startedAt={1000} />)
  expect(path.getAttribute('d')?.match(/[ML]/g)).toHaveLength(1)
  now.mockReturnValue(1400)
  frame(1399)
  const points = [...path.getAttribute('d')!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)]
  expect(points).toHaveLength(21)
  const last = points.at(-1)!
  const voltage = presentationReceivedVoltageAt(createPresentationCsfState(3), excitation, 1400)
  expect(Number(last[1])).toBeCloseTo(88 + 400 / 12000 * 326, 2)
  expect(Number(last[2])).toBeCloseTo(174 - 74 * voltage, 2)
  now.mockReturnValue(1000 + VOLTAGE_TRACE_DURATION_MS + 5000)
  frame(0)
  expect(path.getAttribute('data-elapsed-ms')).toBe(String(VOLTAGE_TRACE_DURATION_MS))
  expect(path.getAttribute('d')?.match(/[ML]/g)).toHaveLength(601)
  // Returning to the setup state must clear the previous capture.
  rerender(<VoltageTrace excitation={excitation} startedAt={null} />)
  expect(path.getAttribute('d')).toBe('')
  unmount()
  expect(cancel).toHaveBeenCalledWith(42)
})

it('derives additional pulse markers and the time range from the play plan', () => {
  const plan = {
    ...FID_PLAY_PLAN, durationMilliseconds: 6000,
    events: [...FID_PLAY_PLAN.events, { type: 'rf-pulse' as const, timeMilliseconds: 2000, kind: '180-x' as const, label: '180°' }],
  }
  render(<VoltageTrace startedAt={null} plan={plan}
    excitation={{ fieldStrengthTesla: 3, pulseEvents: startPlayPlan(plan, 0).pulseEvents }} />)
  expect(screen.getByText('90°')).toBeTruthy()
  const markerTransform = screen.getByText('180°').parentElement!.getAttribute('transform')!
  expect(Number(markerTransform.match(/translate\(([^ ]+)/)![1])).toBeCloseTo(88 + 326 / 3)
  expect(screen.getByText('6')).toBeTruthy()
  expect(screen.queryByText('12')).toBeNull()
})
