// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FlickingHand } from './FlickingHand'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('plays the supplied SVG at double speed, then resets for another flick', () => {
  let nextFrame: FrameRequestCallback = () => {}
  const cancelFrame = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame = callback
    return 42
  })
  vi.stubGlobal('cancelAnimationFrame', cancelFrame)
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  const onFlick = vi.fn()
  const { container, rerender, unmount } = render(
    <FlickingHand isFlicking={false} onFlick={onFlick} />,
  )
  const svg = container.querySelector('svg')!
  const pause = vi.fn()
  const seek = vi.fn()
  svg.pauseAnimations = pause
  svg.setCurrentTime = seek
  const button = screen.getByRole('button', { name: 'Flick the spinning top' })
  fireEvent.click(button)
  expect(onFlick).toHaveBeenCalledOnce()

  rerender(<FlickingHand isFlicking onFlick={onFlick} />)
  expect(pause).toHaveBeenCalledOnce()
  expect(seek).toHaveBeenLastCalledWith(0)
  expect((button as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(button)
  expect(onFlick).toHaveBeenCalledOnce()

  nextFrame(1250)
  expect(seek).toHaveBeenLastCalledWith(0.5)
  nextFrame(1540)
  expect(seek).toHaveBeenLastCalledWith(1.08)
  nextFrame(2700)
  expect(seek).toHaveBeenLastCalledWith(3.1)

  rerender(<FlickingHand isFlicking={false} onFlick={onFlick} />)
  expect(seek).toHaveBeenLastCalledWith(0)
  expect((button as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button)
  expect(onFlick).toHaveBeenCalledTimes(2)
  rerender(<FlickingHand isFlicking onFlick={onFlick} />)
  nextFrame(1250)
  expect(seek).toHaveBeenLastCalledWith(0.5)
  unmount()
  expect(cancelFrame).toHaveBeenLastCalledWith(42)
})

it('keeps all artwork references local to each hand instance', () => {
  const { container } = render(<>
    <FlickingHand isFlicking={false} onFlick={() => {}} />
    <FlickingHand isFlicking={false} onFlick={() => {}} />
  </>)
  const allIds = [...container.querySelectorAll('[id]')].map(node => node.id)
  expect(new Set(allIds).size).toBe(allIds.length)
  for (const svg of container.querySelectorAll('svg')) {
    expect(svg.querySelectorAll('animateTransform').length).toBeGreaterThan(0)
    for (const node of svg.querySelectorAll('[href]')) {
      const reference = node.getAttribute('href')!
      expect(svg.querySelector(reference)).not.toBeNull()
    }
    for (const node of svg.querySelectorAll('[clip-path]')) {
      const reference = node.getAttribute('clip-path')!.slice(4, -1)
      expect(svg.querySelector(reference)).not.toBeNull()
    }
  }
})
