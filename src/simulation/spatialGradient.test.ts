import { describe, expect, it } from 'vitest'
import { visualizedSpatialPhaseIncrementRadians } from './spatialGradient'

describe('idealized spatial-gradient phase visualization', () => {
  it('preserves field direction and relative phase rates', () => {
    expect(
      visualizedSpatialPhaseIncrementRadians(0.001, 1000),
    ).toBeCloseTo(1, 12)
    expect(
      visualizedSpatialPhaseIncrementRadians(-0.002, 1000),
    ).toBeCloseTo(-2, 12)
    expect(visualizedSpatialPhaseIncrementRadians(0, 1000)).toBe(0)
  })

  it('accumulates the same phase independently of frame subdivision', () => {
    const oneFrame = visualizedSpatialPhaseIncrementRadians(0.00128, 1000)
    const sixtyFrames = Array.from({ length: 60 }).reduce<number>(
      (phase) =>
        phase +
        visualizedSpatialPhaseIncrementRadians(0.00128, 1000 / 60),
      0,
    )

    expect(sixtyFrames).toBeCloseTo(oneFrame, 12)
  })
})
