import { describe, expect, it } from 'vitest'
import {
  createSpatialFourierProjection,
  type SpatialFourierProjection,
} from './spatialGradient'
import {
  addBackprojection,
  backprojectionGrayscalePixels,
  backprojectSpatialProjection,
  projectionDensitiesForBackprojection,
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
  it('applies a Hann-windowed ramp with signed edge response', () => {
    const filtered = projectionDensitiesForBackprojection(
      centeredProjection(),
      'hann-ramp',
    )

    expect(filtered[2]).toBeGreaterThan(0)
    expect(Array.from(filtered).some((value) => value < 0)).toBe(true)
    expect(filtered).not.toEqual(
      projectionDensitiesForBackprojection(
        centeredProjection(),
        'unfiltered',
      ),
    )
  })

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

    const pixels = backprojectionGrayscalePixels(accumulator, 1)
    expect(pixels).toHaveLength(12)
    expect([pixels[0], pixels[4], pixels[8]]).toEqual([85, 170, 255])
    expect([pixels[3], pixels[7], pixels[11]]).toEqual([255, 255, 255])

    const averagedPixels = backprojectionGrayscalePixels(
      new Float64Array([2, 4, 6]),
      2,
    )
    expect(averagedPixels).toEqual(pixels)
  })

  it('rejects mismatched accumulator dimensions', () => {
    expect(() => addBackprojection(new Float64Array(2), [1])).toThrow(
      RangeError,
    )
  })

  it('keeps filtered projection weight stable across gradient strengths', () => {
    const gridSize = 32
    const fieldOfViewMillimeters = 32
    const ensembles = Array.from(
      { length: gridSize * gridSize },
      (_, index) => {
        const column = index % gridSize
        const row = Math.floor(index / gridSize)
        const x = column - (gridSize - 1) / 2
        const y = (gridSize - 1) / 2 - row
        return {
          column,
          row,
          gridSize,
          fieldVariationTesla: 0,
          equilibriumMagnetization: x ** 2 + y ** 2 <= 8 ** 2 ? 1 : 0,
        }
      },
    )
    const centerValueAtGradient = (gradient: number) => {
      const halfFieldOffset =
        (gradient * fieldOfViewMillimeters) / 2000
      const projection = createSpatialFourierProjection(
        ensembles,
        {
          startFieldOffsetMillitesla: -halfFieldOffset,
          endFieldOffsetMillitesla: halfFieldOffset,
        },
        null,
        0.00512 * 1.02,
      )
      const backprojection = backprojectSpatialProjection(
        projection,
        {
          centerFieldOffsetMillitesla: 0,
          xGradientMilliteslaPerMeter: gradient,
          yGradientMilliteslaPerMeter: 0,
        },
        fieldOfViewMillimeters,
        gridSize,
        'hann-ramp',
      )
      return backprojection[(gridSize / 2) * gridSize + gridSize / 2]
    }

    const weakGradientValue = centerValueAtGradient(10)
    const strongGradientValue = centerValueAtGradient(20)
    expect(strongGradientValue / weakGradientValue).toBeGreaterThan(0.8)
    expect(strongGradientValue / weakGradientValue).toBeLessThan(1.2)
  })

  it('suppresses the low-frequency haze around a circular phantom', () => {
    const gridSize = 16
    const fieldOfViewMillimeters = 16
    const ensembles = Array.from(
      { length: gridSize * gridSize },
      (_, index) => {
        const column = index % gridSize
        const row = Math.floor(index / gridSize)
        const x = column - (gridSize - 1) / 2
        const y = (gridSize - 1) / 2 - row
        return {
          column,
          row,
          gridSize,
          fieldVariationTesla: 0,
          equilibriumMagnetization: x ** 2 + y ** 2 <= 4 ** 2 ? 1 : 0,
        }
      },
    )
    const unfiltered = new Float64Array(gridSize * gridSize)
    const filtered = new Float64Array(gridSize * gridSize)

    for (let angleDegrees = 0; angleDegrees < 180; angleDegrees += 5) {
      const angleRadians = (angleDegrees * Math.PI) / 180
      const xGradient = 20 * Math.cos(angleRadians)
      const yGradient = 20 * Math.sin(angleRadians)
      const xHalfFieldOffset =
        (xGradient * fieldOfViewMillimeters) / 2000
      const yHalfFieldOffset =
        (yGradient * fieldOfViewMillimeters) / 2000
      const projection = createSpatialFourierProjection(
        ensembles,
        {
          startFieldOffsetMillitesla: -xHalfFieldOffset,
          endFieldOffsetMillitesla: xHalfFieldOffset,
        },
        {
          startFieldOffsetMillitesla: -yHalfFieldOffset,
          endFieldOffsetMillitesla: yHalfFieldOffset,
        },
        0.00512 * 1.02,
      )
      const gradient = {
        centerFieldOffsetMillitesla: 0,
        xGradientMilliteslaPerMeter: xGradient,
        yGradientMilliteslaPerMeter: yGradient,
      }
      addBackprojection(
        unfiltered,
        backprojectSpatialProjection(
          projection,
          gradient,
          fieldOfViewMillimeters,
          gridSize,
          'unfiltered',
        ),
      )
      addBackprojection(
        filtered,
        backprojectSpatialProjection(
          projection,
          gradient,
          fieldOfViewMillimeters,
          gridSize,
          'hann-ramp',
        ),
      )
    }

    const regionMean = (values: Float64Array, outside: boolean) => {
      let sum = 0
      let count = 0
      for (let row = 0; row < gridSize; row += 1) {
        for (let column = 0; column < gridSize; column += 1) {
          const x = column - (gridSize - 1) / 2
          const y = (gridSize - 1) / 2 - row
          const radiusSquared = x ** 2 + y ** 2
          if (
            (outside && radiusSquared >= 6 ** 2) ||
            (!outside && radiusSquared <= 3 ** 2)
          ) {
            sum += values[row * gridSize + column]
            count += 1
          }
        }
      }
      return sum / count
    }

    const unfilteredBackground = regionMean(unfiltered, true)
    const unfilteredInterior = regionMean(unfiltered, false)
    const filteredBackground = regionMean(filtered, true)
    const filteredInterior = regionMean(filtered, false)

    expect(Math.abs(filteredBackground) / filteredInterior).toBeLessThan(
      (unfilteredBackground / unfilteredInterior) * 0.05,
    )
    expect(filteredInterior).toBeGreaterThan(0)
    expect(filteredInterior).toBeGreaterThan(
      Math.abs(filteredBackground) * 20,
    )
  })
})
