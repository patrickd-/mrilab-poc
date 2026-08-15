import type { FidEnsembleState, FidSignalPoint } from './fid'

export type FidSimulationStatus = 'idle' | 'running' | 'paused'

export type FidWorkerRequest =
  | {
      type: 'configure'
      ensembleStates: FidEnsembleState[]
      millisecondsPerTick: number
    }
  | { type: 'set-time-step'; millisecondsPerTick: number }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'pulse' }
  | { type: 'reset' }

export interface FidWorkerSnapshot {
  type: 'snapshot'
  status: FidSimulationStatus
  timeMilliseconds: number
  pulseTimesMilliseconds: number[]
  signalPoints: FidSignalPoint[]
  replaceSignalPoints: boolean
}
