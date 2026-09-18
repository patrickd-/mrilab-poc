import { HydrogenEnsemble } from '../../../models/HydrogenEnsemble'
import { createFidEnsembleStates, fidEnsembleMagnetizationStateAt } from '../../../simulation/fid'

export interface ProtonExcitation {
  fieldStrengthTesla: number
  pulseTimesMilliseconds: readonly number[]
}

export function createPresentationCsfState(fieldStrengthTesla: number) {
  const ensemble = new HydrogenEnsemble(0, 1, 1, 3)
  ensemble.samplePreset = 'cerebrospinal-fluid'
  // The presentation slider is continuous. Interpolate the lab's tissue table
  // between supported fields, holding its endpoints outside the table range.
  const low = fieldStrengthTesla <= 3 ? 1.5 : 3
  const high = fieldStrengthTesla <= 3 ? 3 : 7
  const fraction = Math.max(0, Math.min(1, (fieldStrengthTesla - low) / (high - low)))
  const [state] = createFidEnsembleStates([ensemble], low, 'uniform')
  const upper = ensemble.sampleProperties(high)
  state.longitudinalRelaxationTimeMilliseconds += fraction *
    (upper.longitudinalRelaxationTimeMilliseconds - state.longitudinalRelaxationTimeMilliseconds)
  state.transverseRelaxationTimeMilliseconds += fraction *
    (upper.transverseRelaxationTimeMilliseconds - state.transverseRelaxationTimeMilliseconds)
  return state
}

export function presentationMagnetizationAt(
  state: ReturnType<typeof createPresentationCsfState>,
  excitation: ProtonExcitation,
  nowMilliseconds: number,
) {
  const pulses = excitation.fieldStrengthTesla > 0
    ? excitation.pulseTimesMilliseconds.map(timeMilliseconds => ({ timeMilliseconds, kind: '90-y' as const }))
    : []
  const magnetization = fidEnsembleMagnetizationStateAt(state, nowMilliseconds, pulses)
  // Only the visible laboratory-frame carrier is slowed (0.7 turns/s at 3 T).
  // Pulse rotations and real-time CSF T1/T2 relaxation use the lab's Bloch model.
  const phase = magnetization.excited
    ? (nowMilliseconds - pulses[0].timeMilliseconds) / 1000 * 2 * Math.PI * 0.7 * excitation.fieldStrengthTesla / 3
    : 0
  return {
    x: magnetization.xFraction * Math.cos(phase) - magnetization.yFraction * Math.sin(phase),
    y: magnetization.xFraction * Math.sin(phase) + magnetization.yFraction * Math.cos(phase),
    z: magnetization.zFraction,
  }
}
