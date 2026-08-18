import { describe, expect, it } from 'vitest'
import type { SamplePresetId } from '../models/HydrogenEnsemble'
import { sheppLoganSampleAt } from './sheppLogan'

const GRID_SIZE = 128

describe('Shepp-Logan MRI phantom preset', () => {
  it('maps the analytic ellipse geometry onto every available material', () => {
    const samples = Array.from(
      { length: GRID_SIZE * GRID_SIZE },
      (_, index) =>
        sheppLoganSampleAt(
          index % GRID_SIZE,
          Math.floor(index / GRID_SIZE),
          GRID_SIZE,
        ),
    )
    const expectedMaterials: SamplePresetId[] = [
      'air',
      'cortical-bone',
      'cerebrospinal-fluid',
      'gray-matter',
      'white-matter',
    ]

    expect(new Set(samples)).toEqual(new Set(expectedMaterials))
    expectedMaterials.forEach((material) => {
      expect(
        samples.filter((sample) => sample === material).length,
      ).toBeGreaterThan(20)
    })
  })

  it('retains the nested shell, tissue, and inclusion regions', () => {
    expect(sheppLoganSampleAt(0, 0, GRID_SIZE)).toBe('air')
    expect(sheppLoganSampleAt(64, 6, GRID_SIZE)).toBe(
      'cortical-bone',
    )
    expect(sheppLoganSampleAt(64, 9, GRID_SIZE)).toBe(
      'cerebrospinal-fluid',
    )
    expect(sheppLoganSampleAt(64, 64, GRID_SIZE)).toBe('gray-matter')
    expect(sheppLoganSampleAt(64, 41, GRID_SIZE)).toBe('white-matter')
    expect(sheppLoganSampleAt(64, 57, GRID_SIZE)).toBe(
      'cerebrospinal-fluid',
    )
    expect(sheppLoganSampleAt(49, 64, GRID_SIZE)).toBe(
      'cerebrospinal-fluid',
    )
  })
})
