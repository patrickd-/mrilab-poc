// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Presentation } from './Presentation'
import { excessProtonsAt, formatProtonCount } from './physics'
import { FID_PLAY_PLAN } from './playback/playPlan'

async function advance(user: ReturnType<typeof userEvent.setup>, count: number) {
  const next = screen.getByRole('button', { name: 'Next step' })
  for (let index = 0; index < count; index += 1) {
    await user.click(next)
  }
}

describe('MRI Intuition presentation', () => {
  it('replays the current acquisition without changing the step or B0', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<Presentation />)
      for (let i = 0; i < 8; i++) fireEvent.keyDown(window, { key: 'ArrowRight' })
      fireEvent.change(screen.getByRole('slider'), { target: { value: '3' } })
      for (let i = 0; i < 7; i++) fireEvent.keyDown(window, { key: 'ArrowRight' })
      const wait = FID_PLAY_PLAN.layoutDurationMilliseconds + FID_PLAY_PLAN.settleDelayMilliseconds
      act(() => vi.advanceTimersByTime(wait + 1000))
      const oldMagnet = container.querySelector('[data-rf-pulse-count]')!
      expect(oldMagnet.getAttribute('data-rf-pulse-count')).toBe('1')
      expect(Number(screen.getByTestId('voltage-trace-signal').getAttribute('data-elapsed-ms'))).toBeGreaterThan(900)
      const buttons = screen.getByRole('navigation', { name: 'Presentation navigation' }).querySelectorAll('button')
      expect(buttons[0].getAttribute('aria-label')).toBe('Replay current step')
      fireEvent.click(buttons[0])
      const newMagnet = container.querySelector('[data-rf-pulse-count]')!
      expect(newMagnet).not.toBe(oldMagnet)
      // The pulse is scheduled, but the new trace is still in its flat lead-in.
      expect(newMagnet.getAttribute('data-rf-pulse-count')).toBe('1')
      expect(Number(screen.getByTestId('voltage-trace-signal').getAttribute('data-elapsed-ms'))).toBeLessThan(0)
      expect(container.querySelector('.presentation')?.getAttribute('data-slide-state')).toBe('5')
      expect(screen.getByTestId('voltmeter-needle').getAttribute('data-relative-voltage')).toBe('0')
      act(() => vi.advanceTimersByTime(wait + 300))
      expect(newMagnet.getAttribute('data-rf-pulse-count')).toBe('1')
      expect(Number(screen.getByTestId('voltmeter-needle').getAttribute('data-relative-voltage'))).toBeGreaterThan(0.5)
      // The preserved field value is visible again when navigating to its slider.
      for (let i = 0; i < 7; i++) fireEvent.keyDown(window, { key: 'ArrowLeft' })
      expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('3')
    } finally {
      vi.useRealTimers()
    }
  })

  it('steps through the what-we-measure slide states', async () => {
    const user = userEvent.setup()
    const { container } = render(<Presentation />)

    expect(screen.getByRole('heading', { name: /MRI\s*Intuition/i })).toBeTruthy()
    expect(container.querySelector('.title-slide__orb')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Previous step' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await advance(user, 1)
    expect(screen.getByRole('heading', { name: 'What are we measuring?' })).toBeTruthy()
    expect(screen.queryByLabelText('A drop of cerebrospinal fluid')).toBeNull()

    await advance(user, 1)
    expect(screen.getByLabelText('A drop of cerebrospinal fluid')).toBeTruthy()
    expect(document.querySelector('.presentation')?.getAttribute('data-slide')).toBe('what-we-measure')
    expect(document.querySelector('.presentation')?.getAttribute('data-slide-state')).toBe('1')
    expect(document.querySelector('.presentation')?.classList.contains('presentation--forward')).toBe(true)

    await advance(user, 2)
    expect(screen.getByText(/Cerebrospinal Fluid/)).toBeTruthy()
    expect(screen.getByText('Hydrogen Protons')).toBeTruthy()

    await advance(user, 1)
    expect(screen.getByLabelText('Representative proton ensemble')).toBeTruthy()
    expect(container.querySelector('.csf-drop--left')).toBeTruthy()
    expect(
      container.querySelector('.proton-burst')?.getAttribute(
        'data-particle-count',
      ),
    ).toBe('4200')
    expect(container.querySelector('.proton-sphere__surface')).toBeTruthy()

    await advance(user, 2)
    expect(screen.getByTestId('up-population').textContent).toContain(
      '1,000,000,000,000,000,000,000',
    )
    expect(screen.getByTestId('down-population').textContent).toContain(
      '1,000,000,000,000,000,000,000',
    )
    expect(
      container.querySelectorAll('[data-cone-visible="true"]'),
    ).toHaveLength(2)
  })

  it('updates the populations and energy separation with B0', async () => {
    const user = userEvent.setup()
    const { container } = render(<Presentation />)
    await advance(user, 8)

    const slider = screen.getByRole('slider', {
      name: 'B0 magnetic field strength',
    })
    const fieldLines = container.querySelector('.field-lines') as HTMLElement
    fireEvent.change(slider, { target: { value: '0.5' } })
    const lowFieldOpacity = Number(
      fieldLines.style.getPropertyValue('--field-opacity'),
    )
    expect(lowFieldOpacity).toBeGreaterThan(0.09)
    expect(
      Number(
        container
          .querySelector('[data-cone-orientation="up"]')
          ?.getAttribute('data-field-arrow-opacity'),
      ),
    ).toBeGreaterThan(0)

    fireEvent.change(slider, { target: { value: '3' } })
    const clinicalFieldOpacity = Number(
      fieldLines.style.getPropertyValue('--field-opacity'),
    )

    expect(screen.getByText('3.0 Tesla')).toBeTruthy()
    expect(screen.getByText('3.0 T')).toBeTruthy()
    expect(screen.getByTestId('up-population').textContent).toContain(
      '1,000,009,887,403,312,200,000',
    )
    expect(screen.getByTestId('down-population').textContent).toContain(
      '999,990,112,596,687,800,000',
    )
    expect(
      (container.querySelector('.spin-system') as HTMLElement).style.getPropertyValue(
        '--spin-split',
      ),
    ).toBe('122px')
    expect(clinicalFieldOpacity).toBeGreaterThan(lowFieldOpacity)
    expect(clinicalFieldOpacity).toBeLessThan(0.3)
  })

  it('supports keyboard navigation and retains the interactive field value', async () => {
    const { container } = render(<Presentation />)
    for (let index = 0; index < 8; index += 1) {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    }

    const slider = screen.getByRole('slider', {
      name: 'B0 magnetic field strength',
    })
    fireEvent.change(slider, { target: { value: '7' } })
    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(screen.getByText('Excess protons')).toBeTruthy()
    expect(screen.getByTestId('up-population').textContent).toContain(
      formatProtonCount(excessProtonsAt(7)),
    )
    expect(
      container.querySelector('.spin-state--down[aria-hidden="true"]'),
    ).toBeTruthy()
    expect(
      container
        .querySelector('[data-cone-orientation="up"]')
        ?.getAttribute('data-cone-visible'),
    ).toBe('false')
    expect(
      container
        .querySelector('[data-cone-orientation="up"]')
        ?.getAttribute('data-field-arrow-opacity'),
    ).toBe('0')
    expect(
      container
        .querySelector('[data-cone-orientation="up"]')
        ?.getAttribute('data-net-magnet-visible'),
    ).toBe('true')
    expect(
      (screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)

    fireEvent.change(slider, { target: { value: '0' } })
    expect(
      container
        .querySelector('[data-cone-orientation="up"]')
        ?.getAttribute('data-net-magnet-visible'),
    ).toBe('false')
    fireEvent.change(slider, { target: { value: '7' } })

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('7')
    expect(
      document.querySelector('.presentation')?.classList.contains(
        'presentation--backward',
      ),
    ).toBe(true)
  })

  it('enters the how-we-measure slide and flicks the spinning top', async () => {
    const user = userEvent.setup()
    const { container } = render(<Presentation />)
    await advance(user, 8)

    fireEvent.change(
      screen.getByRole('slider', { name: 'B0 magnetic field strength' }),
      { target: { value: '3' } },
    )
    await advance(user, 2)

    expect(
      screen.getByRole('heading', { name: 'How are we measuring?' }),
    ).toBeTruthy()
    expect(document.querySelector('.presentation')?.getAttribute('data-slide')).toBe(
      'how-we-measure',
    )
    expect(screen.queryByLabelText('A drop of cerebrospinal fluid')).toBeNull()
    expect(screen.queryByText('Excess protons')).toBeNull()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(
      screen.getByLabelText('Proton sphere with net magnetization'),
    ).toBeTruthy()
    expect(
      container
        .querySelector('[data-cone-orientation="up"]')
        ?.getAttribute('data-net-magnet-visible'),
    ).toBe('true')

    await advance(user, 1)
    expect(
      screen.getByRole('img', {
        name: 'Spinning top representing proton precession',
      }),
    ).toBeTruthy()

    await advance(user, 1)
    const hand = screen.getByRole('button', { name: 'Flick the spinning top' })
    await user.click(hand)
    expect(hand.classList.contains('flicking-hand--flicking')).toBe(true)
    expect(
      screen
        .getByRole('img', {
          name: 'Spinning top representing proton precession',
        })
        .getAttribute('data-flick-sequence'),
    ).toBe('1')
    expect(
      (screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    await advance(user, 1)
    expect(screen.getByRole('button', { name: 'Flick the remote control button' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(false)
    await advance(user, 1)
    expect(screen.getByRole('img', { name: /Copper receive coil/ })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(false)
    await advance(user, 1)
    expect(screen.getByRole('img', { name: 'Induced voltage over time' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
