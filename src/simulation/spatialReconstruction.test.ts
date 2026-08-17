import { describe, expect, it } from 'vitest'
import type { SpatialFourierProjection } from './spatialGradient'
import {
  addBackprojection,
  backprojectionGrayscalePixels,
  backprojectSpatialProjection,
  spatialProjectionAngleBin,
} from './spatialReconstruction'

function centeredProjection(): SpatialFourierProjection {
  return {
    maximumFrequencyKilohertz: 2,
    signalPoints: [],
    spectrumPoints: [-2, -1, 0, 1, 2].map(
      (frequencyKilohertz) => ({
        angularFrequencyRadiansPerSecond:
          frequencyKilohertz * 2 * Math.PI * 1000,
        density: frequencyKilohertz === 0 ? 1 : 0,
        frequencyKilohertz,
        magnitude: frequencyKilohertz === 0 ? 1 : 0,
      }),
    ),
    timeWindowMilliseconds: 1,
  }
}

describe('spatial projection angle coverage', () => {
  it('treats opposite gradient directions as the same projection angle', () => {
    expect(spatialProjectionAngleBin(1, 0)).toBe(0)
    expect(spatialProjectionAngleBin(-1, 0)).toBe(0)
    expect(spatialProjectionAngleBin(0, 1)).toBe(90)
    expect(spatialProjectionAngleBin(0, 0)).toBeNull()
  })
})

describe('unfiltered spatial backprojection', () => {
  it('smears one frequency sample perpendicular to the x gradient', () => {
    const smear = backprojectSpatialProjection(
      centeredProjection(),
      {
        centerFieldOffsetMillitesla: 0,
        xGradientMilliteslaPerMeter: 20,
        yGradientMilliteslaPerMeter: 0,
      },
      5,
      5,
    )

    expect(smear[2]).toBeGreaterThan(smear[0])
    expect(smear[2]).toBeCloseTo(smear[12], 12)
    expect(smear[12]).toBeCloseTo(smear[22], 12)
  })

  it('rotates the smear with the gradient direction', () => {
    const smear = backprojectSpatialProjection(
      centeredProjection(),
      {
        centerFieldOffsetMillitesla: 0,
        xGradientMilliteslaPerMeter: 0,
        yGradientMilliteslaPerMeter: 20,
      },
      5,
      5,
    )

    expect(smear[10]).toBeGreaterThan(smear[0])
    expect(smear[10]).toBeCloseTo(smear[12], 12)
    expect(smear[12]).toBeCloseTo(smear[14], 12)
  })

  it('adds projections and converts the result to opaque grayscale pixels', () => {
    const accumulator = new Float64Array([0, 1, 2])
    addBackprojection(accumulator, [1, 1, 1])
    expect(Array.from(accumulator)).toEqual([1, 2, 3])

    const pixels = backprojectionGrayscalePixels(accumulator)
    expect(pixels).toHaveLength(12)
    expect(pixels[0]).toBeLessThan(pixels[4])
    expect(pixels[4]).toBeLessThan(pixels[8])
    expect([pixels[3], pixels[7], pixels[11]]).toEqual([255, 255, 255])
  })

  it('rejects mismatched accumulator dimensions', () => {
    expect(() => addBackprojection(new Float64Array(2), [1])).toThrow(
      RangeError,
    )
  })
})
