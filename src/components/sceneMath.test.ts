import { describe, expect, it } from 'vitest'
import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import { MAXIMUM_GRADIENT_TESLA_PER_METER } from '../simulation/gradientEncoding'
import {
  amplitudeHeight,
  createBlockLayout,
  laboratoryFrequencyHeight,
  magneticFieldHeight,
  phaseHeight,
  rotatingFrequencyHeight,
  sliceFrequencyField,
  sliceMagneticField,
  smoothGridValues,
} from './sceneMath'

describe('block scene layout', () => {
  it('maps one source quadrant onto three orthogonal cut faces', () => {
    const layout = createBlockLayout(4, 1)

    expect(layout.sourceIndices).toEqual([
      10, 11, 14, 15,
      10, 11, 14, 15,
      10, 11, 14, 15,
    ])
    expect(Array.from(layout.simulatedPositions.slice(0, 12))).toEqual([
      0.5, -0.5, 0,
      1.5, -0.5, 0,
      0.5, -1.5, 0,
      1.5, -1.5, 0,
    ])
    expect(Array.from(layout.simulatedPositions.slice(12, 24))).toEqual([
      -0.5, -0.5, 0.5,
      -0.5, -0.5, 1.5,
      -0.5, -1.5, 0.5,
      -0.5, -1.5, 1.5,
    ])
    expect(Array.from(layout.simulatedPositions.slice(24))).toEqual([
      0.5, 0.5, 0.5,
      1.5, 0.5, 0.5,
      0.5, 0.5, 1.5,
      1.5, 0.5, 1.5,
    ])
  })

  it('keeps context points on the remaining outer shell only', () => {
    const { contextPositions } = createBlockLayout(4, 1)
    const positions = Array.from(
      { length: contextPositions.length / 3 },
      (_, index) => Array.from(contextPositions.slice(index * 3, index * 3 + 3)),
    )

    expect(positions.length).toBeGreaterThan(0)
    for (const [x, y, z] of positions) {
      expect([x, y, z].some((coordinate) => Math.abs(coordinate) === 1.5)).toBe(
        true,
      )
      expect(x >= 0.5 && y <= -0.5 && z >= 0.5).toBe(false)
    }
  })
})

describe('slice surface smoothing', () => {
  it('preserves a constant surface, including at its boundaries', () => {
    expect(Array.from(smoothGridValues(new Float32Array(9).fill(0.7), 3))).toEqual(
      expect.arrayContaining(Array(9).fill(expect.closeTo(0.7, 5))),
    )
  })

  it('uses normalized 1-2-1 weights at the center, edges, and corners', () => {
    const impulse = new Float32Array(9)
    impulse[4] = 1
    const smoothed = smoothGridValues(impulse, 3)

    expect(smoothed[4]).toBeCloseTo(1 / 4)
    expect(smoothed[1]).toBeCloseTo(1 / 6)
    expect(smoothed[0]).toBeCloseTo(1 / 9)
    expect(Array.from(impulse)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0])
  })

  it('rejects a value array that does not match the grid dimensions', () => {
    expect(() => smoothGridValues([1, 2], 2)).toThrow(RangeError)
  })
})

describe('slice frequency surface', () => {
  const zeros = new Float64Array(9)
  const hertzPerMillimeter =
    (PROTON_GYROMAGNETIC_RATIO *
      MAXIMUM_GRADIENT_TESLA_PER_METER *
      1e-3) /
    (2 * Math.PI)

  it('makes phase encoding slope only along the row/y direction', () => {
    const field = sliceFrequencyField(zeros, 3, 1, 0)

    expect(Array.from(field.frequencyOffsetsHertz.slice(0, 3))).toEqual(
      Array(3).fill(expect.closeTo(hertzPerMillimeter, 8)),
    )
    expect(Array.from(field.frequencyOffsetsHertz.slice(3, 6))).toEqual([0, 0, 0])
    expect(Array.from(field.frequencyOffsetsHertz.slice(6))).toEqual(
      Array(3).fill(expect.closeTo(-hertzPerMillimeter, 8)),
    )
  })

  it('makes readout encoding slope only along the column/x direction', () => {
    const field = sliceFrequencyField(zeros, 3, 0, 1)

    for (let row = 0; row < 3; row += 1) {
      expect(Array.from(field.frequencyOffsetsHertz.slice(row * 3, row * 3 + 3))).toEqual([
        expect.closeTo(-hertzPerMillimeter, 8),
        0,
        expect.closeTo(hertzPerMillimeter, 8),
      ])
    }
  })

  it('adds both gradient axes and the local static-field offset', () => {
    const staticOffsets = new Float64Array(9).fill(10)
    const field = sliceFrequencyField(staticOffsets, 3, 0.5, -0.25)

    expect(field.frequencyOffsetsHertz[4]).toBeCloseTo(10)
    expect(field.frequencyOffsetsHertz[0]).toBeCloseTo(
      10 + hertzPerMillimeter * 0.75,
    )
    expect(field.frequencyOffsetsHertz[8]).toBeCloseTo(
      10 - hertzPerMillimeter * 0.75,
    )
    expect(field.maximumAbsoluteFrequencyOffsetHertz).toBeCloseTo(
      10 + hertzPerMillimeter * 0.75,
    )
  })

  it('rejects static offsets with the wrong dimensions', () => {
    expect(() => sliceFrequencyField([0], 2, 0, 0)).toThrow(RangeError)
  })
})

describe('slice magnetic-field surface', () => {
  it('sums static, timed, and fundamental spatial field offsets', () => {
    const staticOffsets = new Float64Array(9).fill(1e-6)
    const xProfile = {
      startFieldOffsetMillitesla: -1,
      endFieldOffsetMillitesla: 1,
    }
    const yProfile = {
      startFieldOffsetMillitesla: -0.5,
      endFieldOffsetMillitesla: 0.5,
    }
    const field = sliceMagneticField(
      staticOffsets,
      3,
      0.5,
      -0.25,
      xProfile,
      yProfile,
    )
    const timedOffsetAtTopLeft =
      MAXIMUM_GRADIENT_TESLA_PER_METER * 0.001 * 0.75

    expect(field.fieldOffsetsTesla[4]).toBeCloseTo(1e-6, 12)
    expect(field.fieldOffsetsTesla[0]).toBeCloseTo(
      1e-6 - 0.0005 + timedOffsetAtTopLeft,
      12,
    )
    expect(field.fieldOffsetsTesla[8]).toBeCloseTo(
      1e-6 + 0.0005 - timedOffsetAtTopLeft,
      12,
    )
    expect(field.maximumAbsoluteFieldOffsetTesla).toBeGreaterThan(0.0005)
  })

  it('rejects static field offsets with the wrong dimensions', () => {
    expect(() => sliceMagneticField([0], 2, 0, 0)).toThrow(RangeError)
  })
})

describe('slice graph height mappings', () => {
  it('uses field-dependent laboratory-frame baselines', () => {
    expect(laboratoryFrequencyHeight(1.5, 0, 0)).toBeCloseTo(0.3)
    expect(laboratoryFrequencyHeight(3, 0, 0)).toBeCloseTo(0.42)
    expect(laboratoryFrequencyHeight(7, 0, 0)).toBeCloseTo(0.74)
  })

  it('maps magnetic field offsets around the B0-dependent baseline', () => {
    const baseline = magneticFieldHeight(3, 0, 0.005)

    expect(magneticFieldHeight(3, 0.005, 0.005)).toBeGreaterThan(
      baseline,
    )
    expect(magneticFieldHeight(3, -0.005, 0.005)).toBeLessThan(
      baseline,
    )
  })

  it('maps frequency slope around the baseline and clips its extremes', () => {
    const baseline = laboratoryFrequencyHeight(3, 0, 100)
    const high = laboratoryFrequencyHeight(3, 100, 100)
    const low = laboratoryFrequencyHeight(3, -100, 100)

    expect(high - baseline).toBeCloseTo(baseline - low)
    expect(laboratoryFrequencyHeight(3, 1_000, 100)).toBeCloseTo(high)
    expect(laboratoryFrequencyHeight(3, -1_000, 100)).toBeCloseTo(low)
  })

  it('centers and clips the rotating-frame frequency surface', () => {
    expect(rotatingFrequencyHeight(0, 0)).toBe(0.5)
    expect(rotatingFrequencyHeight(0, 100)).toBe(0.5)
    expect(rotatingFrequencyHeight(100, 100)).toBeCloseTo(0.96)
    expect(rotatingFrequencyHeight(-100, 100)).toBeCloseTo(0.04)
    expect(rotatingFrequencyHeight(1_000, 100)).toBeCloseTo(0.96)
  })

  it('soft-limits unwrapped phase monotonically instead of wrapping at pi', () => {
    expect(phaseHeight(0)).toBe(0.5)
    expect(phaseHeight(-Math.PI)).toBeLessThan(0.5)
    expect(phaseHeight(Math.PI)).toBeGreaterThan(0.5)
    expect(phaseHeight(2 * Math.PI)).toBeGreaterThan(phaseHeight(Math.PI))
    expect(phaseHeight(1e9)).toBeLessThan(1)
  })

  it('normalizes amplitude by M0 and clips nonphysical display values', () => {
    expect(amplitudeHeight(5, 10, 0.5)).toBeCloseTo(0.25)
    expect(amplitudeHeight(10, 0, 1)).toBe(0)
    expect(amplitudeHeight(20, 10, 1)).toBe(1)
    expect(amplitudeHeight(10, 10, -1)).toBe(0)
  })
})
