import { describe, expect, it } from 'vitest'
import { PROTON_GYROMAGNETIC_RATIO } from '../models/HydrogenEnsemble'
import {
  createSpatialFourierProjection,
  projectedPositionMillimetersAtFrequency,
  spatialFourierTimeWindowMilliseconds,
  spatialPhaseRadiansAt,
  type SpatialProjectionEnsemble,
} from './spatialGradient'

function projectionEnsemble(
  overrides: Partial<SpatialProjectionEnsemble> = {},
): SpatialProjectionEnsemble {
  return {
    column: 0,
    equilibriumMagnetization: 1,
    fieldVariationTesla: 0,
    gridSize: 2,
    row: 0,
    ...overrides,
  }
}

describe('idealized spatial-gradient phase', () => {
  it('recomputes physical phase directly from field and experiment time', () => {
    expect(spatialPhaseRadiansAt(0.001, 2)).toBeCloseTo(
      (PROTON_GYROMAGNETIC_RATIO * 0.001 * 2) / 1000,
      12,
    )
    expect(spatialPhaseRadiansAt(-0.001, 2)).toBeCloseTo(
      -spatialPhaseRadiansAt(0.001, 2),
      12,
    )
    expect(spatialPhaseRadiansAt(0.001, 0)).toBe(0)
  })
})

describe('1D spatial Fourier projection', () => {
  it('maps frequency onto position along the effective gradient', () => {
    const frequencyAt64MillimetersKilohertz =
      ((PROTON_GYROMAGNETIC_RATIO / (2 * Math.PI)) *
        0.02 *
        0.064) /
      1000

    expect(
      projectedPositionMillimetersAtFrequency(
        frequencyAt64MillimetersKilohertz,
        0,
        20,
      ),
    ).toBeCloseTo(64, 10)
    expect(
      projectedPositionMillimetersAtFrequency(20, 0, 0),
    ).toBeNull()
  })

  it('produces a constant signal and centered spectrum without a gradient', () => {
    const projection = createSpatialFourierProjection(
      [projectionEnsemble(), projectionEnsemble({ column: 1 })],
      null,
      null,
      0.00512,
      64,
    )

    projection.signalPoints.forEach((point) => {
      expect(point.real).toBeCloseTo(1, 10)
      expect(point.imaginary).toBeCloseTo(0, 10)
      expect(point.magnitude).toBeCloseTo(1, 10)
    })
    expect(projection.spectrumPoints[32].magnitude).toBeCloseTo(1, 12)
    expect(projection.timeWindowMilliseconds).toBeCloseTo(
      spatialFourierTimeWindowMilliseconds(0.00512, 64),
      12,
    )
    expect(projection.signalPoints.at(-1)?.timeMilliseconds).toBeCloseTo(
      projection.timeWindowMilliseconds,
      12,
    )
  })

  it('maps a symmetric gradient to a symmetric frequency projection', () => {
    const projection = createSpatialFourierProjection(
      [projectionEnsemble(), projectionEnsemble({ column: 1 })],
      {
        startFieldOffsetMillitesla: -1,
        endFieldOffsetMillitesla: 1,
      },
      null,
      0.002,
      64,
    )
    const occupied = projection.spectrumPoints
      .map((point, index) => ({ index, magnitude: point.magnitude }))
      .filter((point) => point.magnitude > 0.99)

    expect(occupied).toHaveLength(2)
    expect(occupied[0].index + occupied[1].index).toBe(64)
    projection.signalPoints.forEach((point) => {
      expect(point.imaginary).toBeCloseTo(0, 9)
    })
  })

  it('weights the transformed projection by ensemble magnetization', () => {
    const projection = createSpatialFourierProjection(
      [
        projectionEnsemble({ equilibriumMagnetization: 1 }),
        projectionEnsemble({ column: 1, equilibriumMagnetization: 3 }),
      ],
      {
        startFieldOffsetMillitesla: -1,
        endFieldOffsetMillitesla: 1,
      },
      null,
      0.002,
      64,
    )
    const occupied = projection.spectrumPoints.filter(
      (point) => point.magnitude > 0,
    )

    expect(occupied).toHaveLength(2)
    expect(occupied[1].magnitude / occupied[0].magnitude).toBeCloseTo(3, 10)
  })
})
