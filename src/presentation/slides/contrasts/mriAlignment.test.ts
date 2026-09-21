import { expect, it } from 'vitest'
import { createContrastTissues, contrastTissueAt, spinEchoIntensity } from './contrastModel'
import { alignMriTissueMaps, MRI_TISSUE_MAPS, renderMriPixels, validateTissueMaps } from './mriImage'

const sourceClasses = [
  { id: 'cortical-bone', tuple: [0.05, 250, 5], count: 1666 },
  { id: 'cerebrospinal-fluid', tuple: [1, 2569, 329], count: 2864 },
  { id: 'gray-matter', tuple: [0.86, 833, 83], count: 8863 },
  { id: 'white-matter', tuple: [0.77, 500, 70], count: 8171 },
] as const

it.each([1.5, 3, 7])('aligns exactly the four source classes at %s T while retaining every coordinate and unmatched voxel', field => {
  const sourceBefore = JSON.stringify(MRI_TISSUE_MAPS)
  const tissues = createContrastTissues(field)
  const aligned = alignMriTissueMaps(MRI_TISSUE_MAPS, tissues)
  expect(validateTissueMaps(aligned)).toEqual({ width: 256, height: 256 })
  const counts = [0, 0, 0, 0]
  let untouched = 0
  const mismatches: [number, number][] = []
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const original = [MRI_TISSUE_MAPS.density[y][x], MRI_TISSUE_MAPS.t1[y][x], MRI_TISSUE_MAPS.t2[y][x]]
    const classIndex = sourceClasses.findIndex(source => source.tuple.every((value, i) => value === original[i]))
    let expected = original
    if (classIndex >= 0) {
      counts[classIndex]++
      const tissue = tissues.find(tissue => tissue.id === sourceClasses[classIndex].id)!
      expected = [tissue.excitation.equilibriumScale!, tissue.state.longitudinalRelaxationTimeMilliseconds,
        tissue.state.transverseRelaxationTimeMilliseconds]
    } else untouched++
    const actual = [aligned.density[y][x], aligned.t1[y][x], aligned.t2[y][x]]
    if (actual.some((value, i) => value !== expected[i])) mismatches.push([x, y])
  }
  expect(mismatches).toEqual([])
  expect(counts).toEqual(sourceClasses.map(source => source.count))
  expect(untouched).toBe(43972) // 37,776 background + 6,196 other-tissue voxels.
  expect(JSON.stringify(MRI_TISSUE_MAPS)).toBe(sourceBefore)
  expect(aligned.density[0]).not.toBe(MRI_TISSUE_MAPS.density[0])
  expect(aligned.t1[0]).not.toBe(MRI_TISSUE_MAPS.t1[0])
  expect(aligned.t2[0]).not.toBe(MRI_TISSUE_MAPS.t2[0])
})

it('matches the complete original tuple, not density or either relaxation time alone', () => {
  const source = {
    density: [[0.05, 1, 0.86, 0.77], [1, 0.05, 0.86, 0]],
    t1: [[250, 2569, 833, 500], [350, 250, 900, 0]],
    t2: [[5, 329, 83, 70], [70, 6, 83, 0]],
  }
  const aligned = alignMriTissueMaps(source, createContrastTissues(1.5))
  ;[1.7 / 6.6, 1, 5.3 / 6.6, 4.6 / 6.6].forEach((density, index) => {
    expect(aligned.density[0][index]).toBeCloseTo(density, 12)
  })
  expect(aligned.t1[0]).toEqual([110, 4300, 1200, 650])
  expect(aligned.t2[0]).toEqual([0.4, 2100, 84, 80])
  expect(aligned.density[1]).toEqual(source.density[1])
  expect(aligned.t1[1]).toEqual(source.t1[1])
  expect(aligned.t2[1]).toEqual(source.t2[1])
  expect(() => alignMriTissueMaps(source, [])).toThrow('Missing graph tissue')
})

it.each([1.5, 3, 7])('matches the plotted signal at TE before and after grayscale quantization at %s T', field => {
  const tissues = createContrastTissues(field)
  const aligned = alignMriTissueMaps(MRI_TISSUE_MAPS, tissues)
  const representatives = sourceClasses.map(source => {
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const tuple = [MRI_TISSUE_MAPS.density[y][x], MRI_TISSUE_MAPS.t1[y][x], MRI_TISSUE_MAPS.t2[y][x]]
      if (source.tuple.every((value, i) => value === tuple[i])) return { x, y, id: source.id }
    }
    throw new Error(`Missing source class ${source.id}`)
  })
  for (const timing of [
    { tr: null, te: null }, { tr: null, te: 100 }, { tr: 500, te: null },
    { tr: 500, te: 0.1 }, { tr: 500, te: 10 }, { tr: 5000, te: 100 }, { tr: 12000, te: 500 },
  ]) {
    const pixels = renderMriPixels(aligned, timing)
    for (const { x, y, id } of representatives) {
      const tissue = tissues.find(tissue => tissue.id === id)!
      const graphSignal = contrastTissueAt(tissue, timing.te ?? 0, timing).signal
      const imageSignal = spinEchoIntensity(aligned.density[y][x], aligned.t1[y][x], aligned.t2[y][x], timing)
      expect(imageSignal).toBeCloseTo(graphSignal, 12)
      expect(pixels[(y * 256 + x) * 4]).toBe(Math.round(graphSignal * 255))
    }
  }
})
