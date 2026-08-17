// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RealismMenu from './RealismMenu'

describe('RealismMenu', () => {
  it('renders all six independent realism options', async () => {
    const user = userEvent.setup()
    render(<RealismMenu enabledOptions={[]} onToggle={vi.fn()} />)

    const trigger = screen.getByRole('button', {
      name: '0 of 6 realism options enabled',
    })
    await user.click(trigger)

    expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBe(
      'true',
    )
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'B0 inhomogeneity',
      'B1 inhomogeneity',
      'Gradient imperfections',
      'Intravoxel dephasing',
      'Receiver noise',
      'Tissue heterogeneity',
    ])
  })

  it('toggles an option without closing the multiselect', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const { rerender } = render(
      <RealismMenu enabledOptions={[]} onToggle={onToggle} />,
    )
    await user.click(
      screen.getByRole('button', {
        name: '0 of 6 realism options enabled',
      }),
    )
    await user.click(screen.getByRole('option', { name: 'Receiver noise' }))

    expect(onToggle).toHaveBeenCalledWith('receiver-noise')
    expect(screen.getByRole('listbox')).not.toBeNull()

    rerender(
      <RealismMenu
        enabledOptions={['receiver-noise']}
        onToggle={onToggle}
      />,
    )
    expect(
      screen.getByRole('option', { name: 'Receiver noise' }).getAttribute(
        'aria-selected',
      ),
    ).toBe('true')
    expect(
      screen.getByRole('button', {
        name: '1 of 6 realism options enabled',
      }),
    ).not.toBeNull()
  })

  it('closes with Escape and an outside pointer press', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <RealismMenu enabledOptions={[]} onToggle={vi.fn()} />
        <button type="button">Outside</button>
      </div>,
    )
    const trigger = screen.getByRole('button', {
      name: '0 of 6 realism options enabled',
    })

    await user.click(trigger)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    await user.click(trigger)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
