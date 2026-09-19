import { HydrogenEnsemble, PROTON_GYROMAGNETIC_RATIO } from '../../../models/HydrogenEnsemble'
import { createFidEnsembleStates, fidEnsembleMagnetizationStateAt, type RfPulseEvent } from '../../../simulation/fid'

export interface ProtonExcitation {
  fieldStrengthTesla: number
  pulseEvents: readonly RfPulseEvent[]
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
    ? excitation.pulseEvents
    : []
  const magnetization = fidEnsembleMagnetizationStateAt(state, nowMilliseconds, pulses)
  // Only the visible laboratory-frame carrier is slowed (1.4 turns/s at 3 T).
  // Pulse rotations and real-time CSF T1/T2 relaxation use the lab's Bloch model.
  const phase = magnetization.excited
    ? (nowMilliseconds - pulses[0].timeMilliseconds) / 1000 * 2 * Math.PI * 1.4 * excitation.fieldStrengthTesla / 3
    : 0
  return {
    x: magnetization.xFraction * Math.cos(phase) - magnetization.yFraction * Math.sin(phase),
    y: magnetization.xFraction * Math.sin(phase) + magnetization.yFraction * Math.cos(phase),
    z: magnetization.zFraction,
  }
}

/** Relative receive voltage for a coil whose sensitive axis is transverse x. */
export function presentationReceivedVoltageAt(
  state: ReturnType<typeof createPresentationCsfState>,
  excitation: ProtonExcitation,
  nowMilliseconds: number,
) {
  if (excitation.fieldStrengthTesla <= 0) return 0
  const m = presentationMagnetizationAt(state, excitation, nowMilliseconds)
  const omega = PROTON_GYROMAGNETIC_RATIO * excitation.fieldStrengthTesla / 1000
  const decayRate = 1 / state.transverseRelaxationTimeMilliseconds
  // Faraday: V ∝ -dMx/dt = Mx/T2 + omega*My. Display the same slowed
  // carrier phase as the magnet, with physical T2 attenuation. Fixed gain
  // relative to M0 (not renormalized each frame) preserves the shrinking FID.
  // Coil geometry/gain aren't calibrated, so this is a relative voltmeter scale.
  return (decayRate * m.x + omega * m.y) / Math.hypot(omega, decayRate)
}
