import type { FidSimulationStatus } from '../hooks/useFidSimulation'
import DarkSelect from './DarkSelect'

export type SimulationTimeStep = '0.25' | '0.5' | '1' | '2' | '5'

const SIMULATION_TIME_STEP_OPTIONS: ReadonlyArray<{
  id: SimulationTimeStep
  label: string
}> = [
  { id: '0.25', label: '0.25 ms/tick' },
  { id: '0.5', label: '0.5 ms/tick' },
  { id: '1', label: '1 ms/tick' },
  { id: '2', label: '2 ms/tick' },
  { id: '5', label: '5 ms/tick' },
]

interface SimulationControlsProps {
  activeEnsembleCount: number
  emptyMessage: string
  pulseAriaLabel: string
  pulseSymbol: string
  pulseTitle: string
  status: FidSimulationStatus
  timeStep: SimulationTimeStep
  timeMilliseconds: number
  onPause: () => void
  onPulse: () => void
  onReset: () => void
  onStart: () => void
  onTimeStepChange: (timeStep: SimulationTimeStep) => void
}

function SimulationControls({
  activeEnsembleCount,
  emptyMessage,
  pulseAriaLabel,
  pulseSymbol,
  pulseTitle,
  status,
  timeStep,
  timeMilliseconds,
  onPause,
  onPulse,
  onReset,
  onStart,
  onTimeStepChange,
}: SimulationControlsProps) {
  return (
    <div className="fid-simulation-controls">
      <div className="fid-controls">
        <button
          className="fid-control-button primary transport"
          type="button"
          title={status === 'running' ? 'Pause simulation' : 'Play simulation'}
          aria-label={
            status === 'running'
              ? 'Pause simulation'
              : status === 'paused'
                ? 'Resume simulation'
                : 'Start simulation'
          }
          disabled={activeEnsembleCount === 0}
          onClick={status === 'running' ? onPause : onStart}
        >
          <span aria-hidden="true">
            {status === 'running' ? '❚❚' : '▶'}
          </span>
        </button>
        <button
          className="fid-control-button flip-pulse"
          type="button"
          title={pulseTitle}
          aria-label={pulseAriaLabel}
          disabled={status !== 'running' || activeEnsembleCount === 0}
          onClick={onPulse}
        >
          {pulseSymbol}
        </button>
        <DarkSelect
          className="fid-time-step-select"
          ariaLabel="Simulation milliseconds per tick"
          value={timeStep}
          options={SIMULATION_TIME_STEP_OPTIONS}
          onChange={onTimeStepChange}
        />
        <button
          className="fid-control-button"
          type="button"
          disabled={status === 'idle'}
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      <div className="fid-simulation-meta">
        <span className={`fid-status ${status}`}>{status}</span>
        <span>{activeEnsembleCount.toLocaleString()} active ensembles</span>
        <strong>
          {timeMilliseconds.toFixed(Number(timeStep) < 1 ? 2 : 0)} ms
        </strong>
      </div>

      {activeEnsembleCount === 0 && (
        <p className="fid-empty-state">{emptyMessage}</p>
      )}
    </div>
  )
}

export default SimulationControls
