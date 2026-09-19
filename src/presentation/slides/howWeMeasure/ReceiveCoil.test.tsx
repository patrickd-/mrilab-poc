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
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  const { rerender, unmount } = render(<ReceiveCoil excitation={{ fieldStrengthTesla: 3, pulseEvents: [] }} />)
  const needle = screen.getByTestId('voltmeter-needle')
  expect(screen.queryByText('0 V')).toBeNull()
  expect(needle.getAttribute('transform')).toBe('rotate(0 390 252)')
  rerender(<ReceiveCoil excitation={{ fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' as const }] }} />)
  now.mockReturnValue(175)
  frame(174)
  const first = Number(needle.getAttribute('data-relative-voltage'))
  expect(first).toBeGreaterThan(0.8)
  expect(needle.getAttribute('transform')).not.toBe('rotate(0 390 252)')
  now.mockReturnValue(525)
  frame(524)
  expect(Number(needle.getAttribute('data-relative-voltage'))).toBeLessThan(-0.5)
  now.mockReturnValue(175 + 1000 / 1.4)
  frame(0)
  expect(Number(needle.getAttribute('data-relative-voltage'))).toBeLessThan(first)
  now.mockReturnValue(30000)
  frame(0)
  expect(needle.getAttribute('transform')).toBe('rotate(0 390 252)')
  unmount()
  expect(cancel).toHaveBeenCalledWith(12)
})
