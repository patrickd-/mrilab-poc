// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import SimulationControls from './SimulationControls'

function renderControls(
  overrides: Partial<ComponentProps<typeof SimulationControls>> = {},
) {
  const props: ComponentProps<typeof SimulationControls> = {
    activeEnsembleCount: 10,
    emptyMessage: 'Add tissue first.',
    pulseAriaLabel: 'Apply 90 degree RF pulse',
    pulseSymbol: '∿⊥',
    pulseTitle: '90 degree RF pulse',
    status: 'idle',
    timeStep: '1',
    timeMilliseconds: 0,
    onPause: vi.fn(),
    onPulse: vi.fn(),
    onReset: vi.fn(),
    onStart: vi.fn(),
    onTimeStepChange: vi.fn(),
    ...overrides,
  }
  render(<SimulationControls {...props} />)
  return props
}

describe('SimulationControls', () => {
  it('disables simulation actions and explains an empty sample', () => {
    renderControls({ activeEnsembleCount: 0 })

    expect(
      (screen.getByRole('button', { name: 'Start simulation' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', {
        name: 'Apply 90 degree RF pulse',
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText('Add tissue first.')).not.toBeNull()
    expect(screen.getByText('0 active ensembles')).not.toBeNull()
  })

  it('starts while idle and pauses while running', async () => {
    const user = userEvent.setup()
    const idle = renderControls()

    await user.click(screen.getByRole('button', { name: 'Start simulation' }))
    expect(idle.onStart).toHaveBeenCalledOnce()
  })

  it('uses pause behavior and enables pulse/reset during a running session', async () => {
    const user = userEvent.setup()
    const props = renderControls({ status: 'running', timeMilliseconds: 12 })

    const pause = screen.getByRole('button', { name: 'Pause simulation' })
    expect(pause.textContent).toContain('❚❚')
    await user.click(pause)
    await user.click(
      screen.getByRole('button', { name: 'Apply 90 degree RF pulse' }),
    )
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(props.onPause).toHaveBeenCalledOnce()
    expect(props.onPulse).toHaveBeenCalledOnce()
    expect(props.onReset).toHaveBeenCalledOnce()
    expect(screen.getByText('12 ms')).not.toBeNull()
  })

  it('resumes a paused session through the start callback', async () => {
    const user = userEvent.setup()
    const props = renderControls({ status: 'paused' })

    await user.click(screen.getByRole('button', { name: 'Resume simulation' }))
    expect(props.onStart).toHaveBeenCalledOnce()
  })

  it('changes the simulated milliseconds per tick and formats sub-ms precision', async () => {
    const user = userEvent.setup()
    const props = renderControls({
      status: 'paused',
      timeStep: '0.25',
      timeMilliseconds: 1.234,
    })

    expect(screen.getByText('1.23 ms')).not.toBeNull()
    await user.click(
      screen.getByRole('button', {
        name: 'Simulation milliseconds per tick',
      }),
    )
    expect(screen.getAllByRole('option')).toHaveLength(6)
    await user.click(screen.getByRole('option', { name: '5 ms/tick' }))

    expect(props.onTimeStepChange).toHaveBeenCalledWith('5')
  })
})
