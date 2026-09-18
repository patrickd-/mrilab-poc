import { describe, expect, it } from 'vitest'
import { createPresentationCsfState, presentationMagnetizationAt } from './protonExcitation'

describe('presentation CSF magnetization', () => {
  it.each([[1.5, 2100], [3, 2000], [7, 1000]])('uses lab CSF relaxation at %s T', (field, t2) => {
    const state = createPresentationCsfState(field)
    expect(state.longitudinalRelaxationTimeMilliseconds).toBe(4300)
    expect(state.transverseRelaxationTimeMilliseconds).toBe(t2)
    expect(state.fieldVariationTesla).toBe(0)
  })

  it('stays aligned until RF arrives, then flips 90 degrees', () => {
    const state = createPresentationCsfState(3)
    const excitation = { fieldStrengthTesla: 3, pulseTimesMilliseconds: [720] }
    expect(presentationMagnetizationAt(state, excitation, 719)).toEqual({ x: 0, y: 0, z: 1 })
    const flipped = presentationMagnetizationAt(state, excitation, 720)
    expect(flipped.x).toBeCloseTo(1)
    expect(flipped.z).toBeCloseTo(0)
  })

  it('precesses while T2 decays and T1 recovers in real time', () => {
    const state = createPresentationCsfState(3)
    const excitation = { fieldStrengthTesla: 3, pulseTimesMilliseconds: [0] }
    const afterT2 = presentationMagnetizationAt(state, excitation, 2000)
    expect(Math.hypot(afterT2.x, afterT2.y)).toBeCloseTo(Math.exp(-1))
    expect(Math.abs(afterT2.y)).toBeGreaterThan(0.1)
    const afterT1 = presentationMagnetizationAt(state, excitation, 4300)
    expect(afterT1.z).toBeCloseTo(1 - Math.exp(-1))
    const relaxed = presentationMagnetizationAt(state, excitation, 50000)
    expect(relaxed.z).toBeCloseTo(1, 4)
    expect(Math.hypot(relaxed.x, relaxed.y)).toBeLessThan(1e-8)
  })

  it('rotates the existing state on another pulse rather than restarting recovery', () => {
    const state = createPresentationCsfState(3)
    const second = presentationMagnetizationAt(state, {
      fieldStrengthTesla: 3, pulseTimesMilliseconds: [0, 1000],
    }, 1000)
    expect(second.z).toBeCloseTo(-Math.exp(-1000 / 2000))
    expect(Math.hypot(second.x, second.y)).toBeCloseTo(1 - Math.exp(-1000 / 4300))
  })

  it('interpolates continuous slider fields and does not excite at zero field', () => {
    expect(createPresentationCsfState(5).transverseRelaxationTimeMilliseconds).toBe(1500)
    expect(presentationMagnetizationAt(createPresentationCsfState(0), {
      fieldStrengthTesla: 0, pulseTimesMilliseconds: [0],
    }, 1000)).toEqual({ x: 0, y: 0, z: 1 })
  })
})
