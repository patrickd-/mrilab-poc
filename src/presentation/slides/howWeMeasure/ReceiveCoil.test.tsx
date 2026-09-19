// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReceiveCoil } from './ReceiveCoil'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('moves to both sides of zero, damps the swings, settles, and cancels on unmount', () => {
  let frame: FrameRequestCallback = () => {}
  const cancel = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 12 })
  vi.stubGlobal('cancelAnimationFrame', cancel)
  vi.spyOn(performance, 'now').mockReturnValue(0)
  const { rerender, unmount } = render(<ReceiveCoil excitation={{ fieldStrengthTesla: 3, pulseTimesMilliseconds: [] }} />)
  const needle = screen.getByTestId('voltmeter-needle')
  expect(screen.queryByText('0 V')).toBeNull()
  expect(needle.getAttribute('transform')).toBe('rotate(0 390 252)')
  rerender(<ReceiveCoil excitation={{ fieldStrengthTesla: 3, pulseTimesMilliseconds: [0] }} />)
  frame(350)
  const first = Number(needle.getAttribute('data-relative-voltage'))
  expect(first).toBeGreaterThan(0.8)
  expect(needle.getAttribute('transform')).not.toBe('rotate(0 390 252)')
  frame(1050)
  expect(Number(needle.getAttribute('data-relative-voltage'))).toBeLessThan(-0.5)
  frame(350 + 1000 / 0.7)
  expect(Number(needle.getAttribute('data-relative-voltage'))).toBeLessThan(first)
  frame(30000)
  expect(needle.getAttribute('transform')).toBe('rotate(0 390 252)')
  unmount()
  expect(cancel).toHaveBeenCalledWith(12)
})
