import { expect, it } from 'vitest'
import { MRI_MAP_SIZE, MRI_TISSUE_MAPS, renderMriPixels, validateTissueMaps } from './mriImage'
import { spinEchoIntensity } from './contrastModel'

it('validates all three supplied synthetic 256x256 maps and preserves their matching tissue mask', () => {
  expect(MRI_MAP_SIZE).toEqual({ width: 256, height: 256 })
  const mismatches: [number, number][] = []
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const tissue = MRI_TISSUE_MAPS.density[y][x] > 0
    if ((MRI_TISSUE_MAPS.t1[y][x] > 0) !== tissue || (MRI_TISSUE_MAPS.t2[y][x] > 0) !== tissue) mismatches.push([x, y])
  }
  expect(mismatches).toEqual([])
  expect(() => validateTissueMaps({ density: [[1, 2]], t1: [[1]], t2: [[1]] })).toThrow()
  expect(() => validateTissueMaps({ density: [[1]], t1: [[NaN]], t2: [[1]] })).toThrow()
})

it('renders row-major [y][x], retains a fixed display gain, and interprets T2 as a time constant', () => {
  const maps = { density: [[0, 0.8, 0.2], [1, 0.4, 0.6]], t1: [[0, 900, 900], [900, 900, 900]], t2: [[0, 80, 40], [100, 80, 80]] }
  const baseline = renderMriPixels(maps, { tr: null, te: null })
  expect(Array.from(baseline).filter((_, i) => i % 4 === 0)).toEqual([0, 204, 51, 255, 102, 153])
  const timing = { tr: 500, te: 20 }
  const pixels = renderMriPixels(maps, timing)
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
    const index = (y * 3 + x) * 4
    const value = Math.round(255 * spinEchoIntensity(maps.density[y][x], maps.t1[y][x], maps.t2[y][x], timing))
    expect(Array.from(pixels.slice(index, index + 4))).toEqual([value, value, value, 255])
  }
  expect(Math.max(...pixels.filter((_, i) => i % 4 === 0))).toBeLessThan(255)
})

it('produces distinct spin-density, T1 and T2 images from the real maps and can restore the exact baseline', () => {
  const pd = renderMriPixels(MRI_TISSUE_MAPS, { tr: null, te: null })
  const t1 = renderMriPixels(MRI_TISSUE_MAPS, { tr: 500, te: 10 })
  const t2 = renderMriPixels(MRI_TISSUE_MAPS, { tr: 5000, te: 100 })
  expect(t1.some((v, i) => v !== pd[i])).toBe(true)
  expect(t2.some((v, i) => v !== pd[i])).toBe(true)
  expect(t1.some((v, i) => v !== t2[i])).toBe(true)
  expect(renderMriPixels(MRI_TISSUE_MAPS, { tr: null, te: null }).every((v, i) => v === pd[i])).toBe(true)
  // At every voxel, relaxation only attenuates signal; no per-image rescaling.
  expect(t1.every((v, i) => v <= pd[i])).toBe(true)
  expect(t2.every((v, i) => v <= pd[i])).toBe(true)
})
