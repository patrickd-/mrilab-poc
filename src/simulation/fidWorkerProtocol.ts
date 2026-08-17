import type {
  FidEnsembleState,
  FidSignalPoint,
  RfPulseEvent,
  RfPulseKind,
} from './fid'

export type FidSimulationStatus = 'idle' | 'running' | 'paused'

export type FidWorkerRequest =
  | {
      type: 'configure'
      ensembleStates: FidEnsembleState[]
      millisecondsPerTick: number
      receiverNoise: boolean
    }
  | { type: 'set-time-step'; millisecondsPerTick: number }
  | { type: 'start'; initialPulseKind: RfPulseKind | null }
  | { type: 'pause' }
  | { type: 'pulse'; pulseKind: RfPulseKind }
  | { type: 'reset' }

export interface FidWorkerSnapshot {
  type: 'snapshot'
  status: FidSimulationStatus
  timeMilliseconds: number
  pulseEvents: RfPulseEvent[]
  signalPoints: FidSignalPoint[]
  replaceSignalPoints: boolean
}
