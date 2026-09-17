// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Presentation } from './Presentation'
import { excessProtonsAt, formatProtonCount } from './physics'

async function advance(user: ReturnType<typeof userEvent.setup>, count: number) {
  const next = screen.getByRole('button', { name: 'Next step' })
  for (let index = 0; index < count; index += 1) {
    await user.click(next)
  }
}

describe('MRI Intuition presentation', () => {
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
    expect(container.querySelector('.csf-drop--compact')).toBeTruthy()
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
      (screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('7')
    expect(
      document.querySelector('.presentation')?.classList.contains(
        'presentation--backward',
      ),
    ).toBe(true)
  })
})
