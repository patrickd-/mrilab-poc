import { describe, expect, it } from 'vitest'
import type { SamplePresetId } from '../models/HydrogenEnsemble'
import { simplifiedBrainSampleAt } from './simplifiedBrain'

const GRID_SIZE = 128

describe('simplified brain preset', () => {
  it('uses every available material in an axial head layout', () => {
    const samples = Array.from(
      { length: GRID_SIZE * GRID_SIZE },
      (_, index) =>
        simplifiedBrainSampleAt(
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
      expect(samples.filter((sample) => sample === material).length).toBeGreaterThan(
        20,
      )
    })
  })

  it('places recognizable layers and internal structures', () => {
    expect(simplifiedBrainSampleAt(0, 0, GRID_SIZE)).toBe('air')
    expect(simplifiedBrainSampleAt(64, 4, GRID_SIZE)).toBe(
      'cortical-bone',
    )
    expect(simplifiedBrainSampleAt(64, 9, GRID_SIZE)).toBe(
      'cerebrospinal-fluid',
    )
    expect(simplifiedBrainSampleAt(50, 18, GRID_SIZE)).toBe('gray-matter')
    expect(simplifiedBrainSampleAt(45, 45, GRID_SIZE)).toBe('white-matter')
    expect(simplifiedBrainSampleAt(57, 64, GRID_SIZE)).toBe(
      'cerebrospinal-fluid',
    )
    expect(simplifiedBrainSampleAt(48, 64, GRID_SIZE)).toBe('gray-matter')
  })

  it('is horizontally symmetric across the ensemble slice', () => {
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let column = 0; column < GRID_SIZE / 2; column += 1) {
        expect(simplifiedBrainSampleAt(column, row, GRID_SIZE)).toBe(
          simplifiedBrainSampleAt(GRID_SIZE - 1 - column, row, GRID_SIZE),
        )
      }
    }
  })
})
