// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VoltageTrace } from './VoltageTrace'
import { FID_PLAY_PLAN, startPlayPlan } from '../../playback/playPlan'
const VOLTAGE_TRACE_DURATION_MS = FID_PLAY_PLAN.durationMilliseconds
import { createPresentationCsfState, createTransverseReturnPulse, presentationMagnetizationAt, presentationReceivedVoltageAt } from './protonExcitation'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('plots only elapsed signal, backfills dropped frames, and uses the meter voltage', () => {
  let frame: FrameRequestCallback = () => {}
  const cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 42 })
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const now = vi.spyOn(performance, 'now').mockReturnValue(-300)
  const excitation = { fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: 1000, kind: '90-y' as const }] }
  const { rerender, unmount } = render(<VoltageTrace excitation={excitation} startedAt={null} />)
  const path = screen.getByTestId('voltage-trace-signal')
  expect(path.getAttribute('d')).toBe('')
  rerender(<VoltageTrace excitation={excitation} startedAt={1000} />)
  expect(path.getAttribute('d')?.match(/[ML]/g)).toHaveLength(1)
  now.mockReturnValue(900)
  frame(899)
  expect(path.getAttribute('data-elapsed-ms')).toBe('-100')
  const baseline = [...path.getAttribute('d')!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)]
  expect(baseline).toHaveLength(61)
  expect(baseline.every(point => Number(point[2]) === 162)).toBe(true)
  expect(Number(baseline.at(-1)![1])).toBeLessThan(40 + 1300 / 13300 * 380)
  now.mockReturnValue(1400)
  frame(1399)
  const points = [...path.getAttribute('d')!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)]
  expect(points).toHaveLength(86)
  const last = points.at(-1)!
  const voltage = presentationReceivedVoltageAt(createPresentationCsfState(3), excitation, 1400)
  expect(Number(last[1])).toBeCloseTo(40 + 1700 / 13300 * 380, 2)
  expect(Number(last[2])).toBeCloseTo(162 - 92 * voltage, 2)
  now.mockReturnValue(1000 + VOLTAGE_TRACE_DURATION_MS + 5000)
  act(() => frame(0))
  expect(path.getAttribute('data-elapsed-ms')).toBe(String(VOLTAGE_TRACE_DURATION_MS))
  expect(path.getAttribute('d')?.match(/[ML]/g)).toHaveLength(666)
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
  const rf = screen.getByRole('img', { name: '90° RF pulse at 0 s' })
  expect(rf.querySelector('.voltage-trace__rf-symbol')).toBeTruthy()
  expect(screen.queryByText('90°')).toBeNull()
  expect(screen.queryByText('-1')).toBeNull()
  const markerTransform = screen.getByRole('img', { name: '180° RF pulse at 2 s' }).getAttribute('transform')!
  expect(Number(markerTransform.match(/translate\(([^ ]+)/)![1])).toBeCloseTo(40 + 3300 / 7300 * 380)
  expect(screen.getByText('6')).toBeTruthy()
  expect(screen.queryByText('12')).toBeNull()
})

it('tracks the cursor, freezes the original trace once, and maps clicks through SVG letterboxing', () => {
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(performance, 'now').mockReturnValue(4000)
  const onPlace = vi.fn()
  const excitation = { fieldStrengthTesla: 3, pulseEvents: startPlayPlan(FID_PLAY_PLAN, 1000).pulseEvents }
  const { rerender } = render(<VoltageTrace excitation={excitation} startedAt={1000} onPlaceRepeatPulse={onPlace} />)
  const svg = screen.getByRole('img', { name: 'Induced voltage over time' })
  // 2x scale plus 60px horizontal letterboxing on both sides.
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 1000, height: 620 } as DOMRect)
  const point = (time: number) => ({ clientX: 70 + 2 * (40 + (time + 1300) / 13300 * 380), clientY: 220 })
  fireEvent.mouseMove(svg, point(2000))
  expect(Number(screen.getByTestId('voltage-trace-hover').getAttribute('x1'))).toBeCloseTo(40 + 3300 / 13300 * 380)
  const original = screen.getByTestId('voltage-trace-signal').getAttribute('d')
  fireEvent.click(svg, point(-500))
  expect(onPlace).not.toHaveBeenCalled()
  fireEvent.click(svg, point(2000))
  expect(onPlace).toHaveBeenLastCalledWith(2000)
  expect(screen.getByTestId('voltage-trace-reference').getAttribute('d')).toBe(original)
  rerender(<VoltageTrace excitation={excitation} startedAt={5000} onPlaceRepeatPulse={onPlace} />)
  fireEvent.click(svg, point(5000))
  expect(onPlace).toHaveBeenLastCalledWith(5000)
  expect(screen.getByTestId('voltage-trace-reference').getAttribute('d')).toBe(original)
  fireEvent.mouseLeave(svg)
  expect(screen.queryByTestId('voltage-trace-hover')).toBeNull()
})

it('shares hover coordinates and RF timing across both graphs, with tags only above the voltage plot', () => {
  const onPlace = vi.fn()
  const { container } = render(<VoltageTrace excitation={{ fieldStrengthTesla: 1.5, pulseEvents: [] }}
    startedAt={null} showLongitudinal onPlaceRepeatPulse={onPlace} />)
  const upper = screen.getByRole('img', { name: 'Induced voltage over time' })
  const lower = screen.getByRole('img', { name: 'Longitudinal magnetization over time' })
  for (const graph of [upper, lower]) {
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 440, height: 310 } as DOMRect)
    fireEvent.mouseMove(graph, { clientX: 180, clientY: 140 })
    expect(screen.getByTestId('voltage-trace-hover').getAttribute('x1')).toBe('180')
    expect(screen.getByTestId('magnetization-trace-hover').getAttribute('x1')).toBe('180')
    fireEvent.mouseLeave(graph)
    expect(screen.queryByTestId('voltage-trace-hover')).toBeNull()
    expect(screen.queryByTestId('magnetization-trace-hover')).toBeNull()
  }
  expect(upper.querySelectorAll('.voltage-trace__tag')).toHaveLength(1)
  expect(lower.querySelectorAll('.voltage-trace__tag')).toHaveLength(0)
  const markers = container.querySelectorAll('.voltage-trace__pulse-line')
  expect(markers).toHaveLength(2)
  expect(markers[0].parentElement?.getAttribute('transform')).toBe(markers[1].parentElement?.getAttribute('transform'))
})

it('plots actual longitudinal recovery and transverse envelope and reveals identities only at completion', () => {
  let frame: FrameRequestCallback = () => {}
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const now = vi.spyOn(performance, 'now').mockReturnValue(-1300)
  const state = createPresentationCsfState(1.5)
  const initial = { timeMilliseconds: 0, kind: '90-y' as const }
  const repeat = createTransverseReturnPulse(state, 2000, [initial])
  const excitation = { fieldStrengthTesla: 1.5, pulseEvents: [initial, repeat] }
  const { rerender } = render(<VoltageTrace excitation={excitation} startedAt={0} showLongitudinal showEnvelope />)
  const longitudinal = screen.getByTestId('magnetization-trace-signal')
  const envelope = screen.getByTestId('voltage-trace-envelope')
  expect(longitudinal.getAttribute('d')).toBe('M40.00 70.00 ')
  expect(screen.queryByTestId('voltage-trace-identity')).toBeNull()
  const points = (path: HTMLElement) => [...path.getAttribute('d')!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)]
  for (const time of [0, 2000, 4300]) {
    now.mockReturnValue(time)
    act(() => frame(time))
    const m = presentationMagnetizationAt(state, excitation, time)
    expect(Number(points(longitudinal).at(-1)![2])).toBeCloseTo(254 - 184 * m.z, 2)
    expect(Number(points(envelope).at(-1)![2])).toBeCloseTo(162 - 92 * Math.hypot(m.x, m.y), 2)
    expect(longitudinal.getAttribute('data-elapsed-ms')).toBe(screen.getByTestId('voltage-trace-signal').getAttribute('data-elapsed-ms'))
    expect(screen.queryByTestId('magnetization-trace-identity')).toBeNull()
  }
  now.mockReturnValue(12000)
  act(() => frame(12000))
  expect(screen.getByTestId('voltage-trace-identity').textContent).toBe('T2')
  expect(screen.getByTestId('magnetization-trace-identity').textContent).toBe('T1')
  for (const id of ['voltage-trace-identity', 'magnetization-trace-identity']) {
    expect(screen.getByTestId(id).querySelector('tspan')?.getAttribute('dy')).toBe('4')
  }
  rerender(<VoltageTrace excitation={excitation} startedAt={13000} showLongitudinal showEnvelope />)
  expect(screen.queryByTestId('voltage-trace-identity')).toBeNull()
  expect(screen.queryByTestId('magnetization-trace-identity')).toBeNull()
})
