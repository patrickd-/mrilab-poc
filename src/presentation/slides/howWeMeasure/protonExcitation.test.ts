import { describe, expect, it } from 'vitest'
import { createPresentationCsfState, createTransverseReturnPulse, presentationMagnetizationAt, presentationReceivedVoltageAt } from './protonExcitation'
import { fidEnsembleMagnetizationStateAt } from '../../../simulation/fid'

describe('presentation CSF magnetization', () => {
  it.each([[1.5, 2100], [3, 2000], [7, 1000]])('uses lab CSF relaxation at %s T', (field, t2) => {
    const state = createPresentationCsfState(field)
    expect(state.longitudinalRelaxationTimeMilliseconds).toBe(4300)
    expect(state.transverseRelaxationTimeMilliseconds).toBe(t2)
    expect(state.fieldVariationTesla).toBe(0)
  })

  it('stays aligned until RF arrives, then flips 90 degrees', () => {
    const state = createPresentationCsfState(3)
    const excitation = { fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: 720, kind: '90-y' as const }] }
    expect(presentationMagnetizationAt(state, excitation, 719)).toEqual({ x: 0, y: 0, z: 1 })
    const flipped = presentationMagnetizationAt(state, excitation, 720)
    expect(flipped.x).toBeCloseTo(1)
    expect(flipped.z).toBeCloseTo(0)
  })

  it('precesses while T2 decays and T1 recovers in real time', () => {
    const state = createPresentationCsfState(3)
    const excitation = { fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' as const }] }
    const afterT2 = presentationMagnetizationAt(state, excitation, 2000)
    expect(Math.hypot(afterT2.x, afterT2.y)).toBeCloseTo(Math.exp(-1))
    expect(Math.abs(afterT2.y)).toBeGreaterThan(0.1)
    const afterT1 = presentationMagnetizationAt(state, excitation, 4300)
    expect(afterT1.z).toBeCloseTo(1 - Math.exp(-1))
    const relaxed = presentationMagnetizationAt(state, excitation, 50000)
    expect(relaxed.z).toBeCloseTo(1, 4)
    expect(Math.hypot(relaxed.x, relaxed.y)).toBeLessThan(1e-8)
  })

  it.each([[1.5, 0.7], [3, 1.4]])('uses the doubled visual carrier at %s T without speeding relaxation', (field, hertz) => {
    const state = createPresentationCsfState(field)
    const excitation = { fieldStrengthTesla: field, pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' as const }] }
    const quarterPeriod = 1000 / hertz / 4
    const m = presentationMagnetizationAt(state, excitation, quarterPeriod)
    expect(m.x).toBeCloseTo(0, 10)
    expect(m.y).toBeCloseTo(Math.exp(-quarterPeriod / state.transverseRelaxationTimeMilliseconds), 10)
    expect(m.z).toBeCloseTo(1 - Math.exp(-quarterPeriod / 4300), 10)
  })

  it('rotates the existing state on another pulse rather than restarting recovery', () => {
    const state = createPresentationCsfState(3)
    const second = presentationMagnetizationAt(state, {
      fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' as const }, { timeMilliseconds: 1000, kind: '90-y' as const }],
    }, 1000)
    expect(second.z).toBeCloseTo(-Math.exp(-1000 / 2000))
    expect(Math.hypot(second.x, second.y)).toBeCloseTo(1 - Math.exp(-1000 / 4300))
  })

  it('interpolates continuous slider fields and does not excite at zero field', () => {
    expect(createPresentationCsfState(5).transverseRelaxationTimeMilliseconds).toBe(1500)
    expect(presentationMagnetizationAt(createPresentationCsfState(0), {
      fieldStrengthTesla: 0, pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' as const }],
    }, 1000)).toEqual({ x: 0, y: 0, z: 1 })
  })

  it.each([100, 1000, 4300, 20000])('returns to 90° after %s ms with only the missing angle, preserving length and phase', delay => {
    const state = createPresentationCsfState(3)
    const initial = { timeMilliseconds: 1000, kind: '90-y' as const }
    const repeat = createTransverseReturnPulse(state, 1000 + delay, [initial])
    const excitation = { fieldStrengthTesla: 3, pulseEvents: [initial, repeat] }
    expect(presentationMagnetizationAt(state, excitation, 1000 + delay - 1)).toEqual(
      presentationMagnetizationAt(state, { ...excitation, pulseEvents: [initial] }, 1000 + delay - 1),
    )
    const flipped = presentationMagnetizationAt(state, excitation, 1000 + delay)
    const recovered = 1 - Math.exp(-delay / 4300)
    const remaining = Math.exp(-delay / 2000)
    const length = Math.hypot(remaining, recovered)
    expect(repeat.rotation!.angleRadians).toBeCloseTo(Math.atan2(recovered, remaining), 10)
    expect(repeat.rotation!.angleRadians).toBeGreaterThan(0)
    expect(repeat.rotation!.angleRadians).toBeLessThan(Math.PI / 2)
    expect(Math.hypot(flipped.x, flipped.y)).toBeCloseTo(length, 10)
    const before = presentationMagnetizationAt(state, { ...excitation, pulseEvents: [initial] }, 1000 + delay)
    expect(Math.atan2(flipped.y, flipped.x)).toBeCloseTo(Math.atan2(before.y, before.x), 10)
    expect(flipped.z).toBeCloseTo(0, 10)
    const later = presentationMagnetizationAt(state, excitation, 1000 + delay + 2000)
    expect(Math.hypot(later.x, later.y)).toBeCloseTo(length * Math.exp(-1), 10)
    expect(later.z).toBeCloseTo(1 - Math.exp(-2000 / 4300), 10)
  })

  it('aligns the RF axis with a nonzero rotating-frame phase rather than assuming +x magnetization', () => {
    const state = createPresentationCsfState(1.5)
    state.spinPackets = state.spinPackets.map(packet => ({ ...packet, angularFrequencyOffsetRadiansPerMillisecond: 0.003 }))
    const initial = { timeMilliseconds: 0, kind: '90-y' as const }
    const before = fidEnsembleMagnetizationStateAt(state, 750, [initial])
    const pulse = createTransverseReturnPulse(state, 750, [initial])
    const after = fidEnsembleMagnetizationStateAt(state, 750, [initial, pulse])
    expect(pulse.rotation!.axisPhaseRadians).toBeCloseTo(before.precessionPhaseRadians + Math.PI / 2, 10)
    expect(after.zFraction).toBeCloseTo(0, 10)
    expect(after.transverseFraction).toBeCloseTo(Math.hypot(before.transverseFraction, before.zFraction), 10)
    expect(after.precessionPhaseRadians).toBeCloseTo(before.precessionPhaseRadians, 10)
  })

  it('uses no extra rotation while already transverse and approaches a full 90° pulse after recovery', () => {
    const state = createPresentationCsfState(1.5)
    const initial = { timeMilliseconds: 0, kind: '90-y' as const }
    expect(createTransverseReturnPulse(state, 0, [initial]).rotation!.angleRadians).toBeCloseTo(0, 10)
    expect(createTransverseReturnPulse(state, 100000, [initial]).rotation!.angleRadians).toBeCloseTo(Math.PI / 2, 10)
  })

  it.each(['90-y', '180-x'] as const)('matches the original %s pulse when explicitly prescribing the same rotation', kind => {
    const state = createPresentationCsfState(1.5)
    const initial = { timeMilliseconds: 0, kind: '90-y' as const }
    const pulse = { timeMilliseconds: 1000, kind }
    const rotation = kind === '90-y'
      ? { angleRadians: Math.PI / 2, axisPhaseRadians: Math.PI / 2 }
      : { angleRadians: Math.PI, axisPhaseRadians: 0 }
    const expected = fidEnsembleMagnetizationStateAt(state, 1400, [initial, pulse])
    const actual = fidEnsembleMagnetizationStateAt(state, 1400, [initial, { ...pulse, rotation }])
    expect(actual.xFraction).toBeCloseTo(expected.xFraction, 10)
    expect(actual.yFraction).toBeCloseTo(expected.yFraction, 10)
    expect(actual.zFraction).toBeCloseTo(expected.zFraction, 10)
  })
})

describe('receive-coil voltage', () => {
  const state = createPresentationCsfState(3)
  const excitation = { fieldStrengthTesla: 3, pulseEvents: [{ timeMilliseconds: 1000, kind: '90-y' as const }] }
  const period = 1000 / 1.4

  it('reads zero before RF, then alternates polarity with precession', () => {
    expect(presentationReceivedVoltageAt(state, excitation, 999)).toBe(0)
    expect(presentationReceivedVoltageAt(state, excitation, 1000 + period / 4)).toBeGreaterThan(0.8)
    expect(presentationReceivedVoltageAt(state, excitation, 1000 + period * 3 / 4)).toBeLessThan(-0.5)
  })

  it('keeps a fixed gain so successive swings decay with T2', () => {
    const first = presentationReceivedVoltageAt(state, excitation, 1000 + period / 4)
    const later = presentationReceivedVoltageAt(state, excitation, 1000 + period * 5 / 4)
    expect(later / first).toBeCloseTo(Math.exp(-period / 2000), 10)
    expect(Math.abs(presentationReceivedVoltageAt(state, excitation, 50000))).toBeLessThan(1e-8)
  })

  it('reflects repeated pulse rotations, including a reduced transverse signal', () => {
    const now = 1100
    const once = presentationReceivedVoltageAt(state, { ...excitation, pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' as const }] }, now)
    const twice = presentationReceivedVoltageAt(state, { ...excitation, pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' as const }, { timeMilliseconds: 1000, kind: '90-y' as const }] }, now)
    expect(Math.abs(twice)).toBeLessThan(Math.abs(once))
    expect(presentationReceivedVoltageAt(state, { ...excitation, fieldStrengthTesla: 0 }, now)).toBe(0)
  })
})
