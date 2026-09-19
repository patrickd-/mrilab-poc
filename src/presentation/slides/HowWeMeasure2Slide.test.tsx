// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { howWeMeasure2SlideModule } from './HowWeMeasure2Slide'
import { SAMPLE_COLORS } from '../../models/sampleColors'
import { COMPARISON_TISSUE_IDS, TISSUE_COMPARISON_PLAN } from './howWeMeasure2/tissueComparison'

const Slide = howWeMeasure2SlideModule.Component
afterEach(() => vi.useRealTimers())

it('starts playback on backward entry without waiting for disabled CSS animations', () => {
  vi.useFakeTimers()
  const { container } = render(<Slide fieldStrengthTesla={1.5} stateIndex={0} direction="backward" setFieldStrengthTesla={() => {}} />)
  expect(container.querySelector('.tissue-comparison')?.getAttribute('data-transition-complete')).toBe('true')
  for (const sphere of container.querySelectorAll('[data-rf-pulse-count]')) expect(sphere.getAttribute('data-rf-pulse-count')).toBe('1')
  act(() => vi.advanceTimersByTime(TISSUE_COMPARISON_PLAN.settleDelayMilliseconds + 30))
  expect(screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('d')).not.toBe('')
})

function finishEntrance() {
  act(() => vi.advanceTimersByTime(32))
  act(() => vi.advanceTimersByTime(TISSUE_COMPARISON_PLAN.layoutDurationMilliseconds))
  fireEvent.animationEnd(screen.getByTestId('specimen-cerebrospinal-fluid'))
}

it('rearranges into four lab-colored tissues, then excites them together with fixed RF timing', () => {
  vi.useFakeTimers()
  const { container } = render(<Slide fieldStrengthTesla={1.5} stateIndex={0} direction="forward" setFieldStrengthTesla={() => {}} />)
  const delay = TISSUE_COMPARISON_PLAN.layoutDurationMilliseconds + TISSUE_COMPARISON_PLAN.settleDelayMilliseconds
  for (const id of COMPARISON_TISSUE_IDS) {
    const sphere = screen.getByTestId(`specimen-${id}`).querySelector('[data-sphere-color]')!
    expect(sphere.getAttribute('data-sphere-color')).toBe(SAMPLE_COLORS[id])
    expect(sphere.getAttribute('data-sample-preset')).toBe(id)
    expect(sphere.getAttribute('data-rf-pulse-count')).toBe('0')
    expect(screen.getByTestId(`${id}-signal`).getAttribute('d')).toBe('')
  }
  expect(container.querySelector('.tissue-comparison__outgoing-receiver')).toBeTruthy()
  expect(container.querySelector('.tissue-comparison')?.getAttribute('data-transition-started')).toBe('false')
  act(() => vi.advanceTimersByTime(16))
  expect(container.querySelector('.tissue-comparison')?.getAttribute('data-transition-started')).toBe('false')
  act(() => vi.advanceTimersByTime(16))
  expect(container.querySelector('.tissue-comparison')?.getAttribute('data-transition-started')).toBe('true')
  // A slow frame must not start RF before the actual CSS motion is complete.
  act(() => vi.advanceTimersByTime(delay + 1000))
  for (const sphere of container.querySelectorAll('[data-rf-pulse-count]')) expect(sphere.getAttribute('data-rf-pulse-count')).toBe('0')
  fireEvent.animationEnd(screen.getByTestId('specimen-cerebrospinal-fluid').querySelector('figcaption')!)
  expect(container.querySelector('.tissue-comparison')?.getAttribute('data-transition-complete')).toBe('false')
  fireEvent.animationEnd(screen.getByTestId('specimen-cerebrospinal-fluid'))
  for (const sphere of container.querySelectorAll('[data-rf-pulse-count]')) expect(sphere.getAttribute('data-rf-pulse-count')).toBe('1')
  act(() => vi.advanceTimersByTime(TISSUE_COMPARISON_PLAN.settleDelayMilliseconds + 30))
  expect(container.querySelector('.tissue-comparison__outgoing-receiver')).toBeNull()
  expect(container.querySelector('.tissue-plot__outgoing-voltage')).toBeNull()
  for (const id of COMPARISON_TISSUE_IDS) expect(screen.getByTestId(`${id}-signal`).getAttribute('d')).not.toBe('')
  const points = [...screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('d')!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)]
  const pulseX = (40 + 0.08 / 1.08 * 560).toFixed(3)
  const atPulse = points.filter(point => point[1] === pulseX)
  expect(atPulse.map(point => point[2])).toEqual(['254.000', '70.000'])
  expect(container.querySelectorAll('.voltage-trace__tag')).toHaveLength(1)
  const graph = screen.getByRole('img', { name: 'Tissue transverse signal over time' })
  const before = screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('d')
  fireEvent.click(graph, { clientX: 300, clientY: 150 })
  expect(container.querySelectorAll('.voltage-trace__tag')).toHaveLength(1)
  expect(screen.getByTestId('cerebrospinal-fluid-signal').getAttribute('d')).toBe(before)
})

it('highlights both tissue curves on hover or keyboard focus without resetting playback', () => {
  vi.useFakeTimers()
  render(<Slide fieldStrengthTesla={1.5} stateIndex={0} direction="forward" setFieldStrengthTesla={() => {}} />)
  finishEntrance()
  act(() => vi.advanceTimersByTime(4000))
  const csf = screen.getByTestId('cerebrospinal-fluid-signal')
  const curve = csf.getAttribute('d')
  const specimen = screen.getByTestId('specimen-white-matter')
  fireEvent.mouseEnter(specimen)
  expect(csf.getAttribute('opacity')).toBe('0.16')
  expect(screen.getByTestId('white-matter-signal').getAttribute('opacity')).toBe('1')
  expect(screen.getByTestId('white-matter-longitudinal').getAttribute('opacity')).toBe('1')
  expect(csf.getAttribute('d')).toBe(curve)
  fireEvent.mouseLeave(specimen)
  expect(csf.getAttribute('opacity')).toBe('1')
  fireEvent.focus(specimen)
  expect(csf.getAttribute('opacity')).toBe('0.16')
  fireEvent.blur(specimen)
  expect(csf.getAttribute('opacity')).toBe('1')
})

it('zooms both graphs with either wheel, shares hover time, and never changes the playback epoch', () => {
  vi.useFakeTimers()
  const { container } = render(<Slide fieldStrengthTesla={1.5} stateIndex={0} direction="forward" setFieldStrengthTesla={() => {}} />)
  finishEntrance()
  act(() => vi.advanceTimersByTime(5000))
  const upper = screen.getByRole('img', { name: 'Tissue transverse signal over time' })
  const lower = screen.getByRole('img', { name: 'Tissue longitudinal magnetization over time' })
  const signal = screen.getByTestId('cerebrospinal-fluid-signal')
  const elapsed = Number(signal.getAttribute('data-elapsed-ms'))
  const curve = signal.getAttribute('d')
  fireEvent.wheel(upper, { deltaY: -200, deltaMode: 0 })
  expect(Number(upper.getAttribute('data-time-window-ms'))).toBeLessThan(6000)
  expect(lower.getAttribute('data-time-window-ms')).toBe(upper.getAttribute('data-time-window-ms'))
  expect(signal.getAttribute('d')).not.toBe(curve)
  expect(Math.abs(Number(signal.getAttribute('data-elapsed-ms')) - elapsed)).toBeLessThan(17)
  fireEvent.wheel(lower, { deltaY: -200, deltaMode: 0 })
  expect(screen.getAllByText('t (ms)')).toHaveLength(2)
  vi.spyOn(lower, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 620, height: 310 } as DOMRect)
  fireEvent.mouseMove(lower, { clientX: 300, clientY: 160 })
  expect(screen.getByTestId('tissue-signal-hover').getAttribute('x1')).toBe(screen.getByTestId('tissue-longitudinal-hover').getAttribute('x1'))
  const guideX = screen.getByTestId('tissue-signal-hover').getAttribute('x1')
  fireEvent.wheel(lower, { deltaY: -100, deltaMode: 0 })
  expect(screen.getByTestId('tissue-signal-hover').getAttribute('x1')).toBe(guideX)
  fireEvent.keyDown(container.querySelector('.tissue-plots')!, { key: '0' })
  expect(upper.getAttribute('data-time-window-ms')).toBe('6000')
  expect(container.querySelectorAll('.voltage-trace__tag')).toHaveLength(1)
  for (let i = 0; i < 9; i++) fireEvent.wheel(upper, { deltaY: -300, deltaMode: 0 })
  expect(upper.getAttribute('data-time-window-ms')).toBe('1')
  const pulseX = (40 + 0.08 / 1.08 * 560).toFixed(3)
  for (const [kind, expected] of [['signal', ['254.000', '70.000']], ['longitudinal', ['70.000', '254.000']]] as const) {
    const points = [...screen.getByTestId(`cerebrospinal-fluid-${kind}`).getAttribute('d')!.matchAll(/[ML]([\d.]+) ([\d.]+)/g)]
    expect(points.filter(point => point[1] === pulseX).map(point => point[2])).toEqual(expected)
  }
})
