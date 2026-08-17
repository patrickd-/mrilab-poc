// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DarkSelect from './DarkSelect'

const OPTIONS = [
  { id: 'zero', label: '0' },
  { id: 'half', label: '0.5' },
  { id: 'seven', label: '7' },
] as const

describe('DarkSelect', () => {
  it('shows every option regardless of the selected value', async () => {
    const user = userEvent.setup()
    render(
      <DarkSelect
        ariaLabel="Field strength"
        value="zero"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Field strength' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await user.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '0',
      '0.5',
      '7',
    ])
    expect(screen.getByRole('option', { name: '0' }).getAttribute('aria-selected')).toBe(
      'true',
    )
  })

  it('emits a selection and closes the listbox', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DarkSelect
        ariaLabel="Field strength"
        value="zero"
        options={OPTIONS}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Field strength' }))
    await user.click(screen.getByRole('option', { name: '7' }))

    expect(onChange).toHaveBeenCalledWith('seven')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes with Escape or an outside pointer press', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <DarkSelect
          ariaLabel="Field strength"
          value="zero"
          options={OPTIONS}
          onChange={vi.fn()}
        />
        <button type="button">Outside</button>
      </div>,
    )

    const trigger = screen.getByRole('button', { name: 'Field strength' })
    await user.click(trigger)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    await user.click(trigger)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
