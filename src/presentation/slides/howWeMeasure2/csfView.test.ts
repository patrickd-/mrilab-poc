import { expect, it } from 'vitest'
import { csfViewVector, splitCsfOrigins } from './csfView'

it('splits full-sized copies from the original center instead of growing distant spheres from zero', () => {
  const source = { x: 0, y: 0, radius: 130, shell: 0.5 }
  const daughters = splitCsfOrigins(source, 36)
  expect(daughters).toHaveLength(36)
  for (const pose of daughters) {
    expect(pose.x).toBe(source.x)
    expect(pose.y).toBe(source.y)
    expect(pose.radius).toBe(source.radius)
  }
  expect(daughters.reduce((opacity, pose) => opacity + pose.shell, 0)).toBe(0.5)
  daughters[0].x = 10
  expect(source.x).toBe(0)
  expect(daughters[1].x).toBe(0)
})

it('looks down B0 while keeping both transverse components in the screen plane', () => {
  const aligned = csfViewVector({ x: 0, y: 0, z: 1 }, Math.PI / 2)
  expect(aligned.y).toBeCloseTo(0, 12)
  expect(aligned.z).toBeCloseTo(1, 12)
  const m = { x: 0.3, y: 0.4, z: 0.5 }
  const viewed = csfViewVector(m, Math.PI / 2)
  expect(viewed.x).toBeCloseTo(m.x, 12)
  expect(viewed.y).toBeCloseTo(m.y, 12)
  expect(viewed.z).toBeCloseTo(m.z, 12)
  expect(csfViewVector(m, 0)).toEqual({ x: m.x, y: m.z, z: -m.y })
  for (const angle of [0, 0.2, 0.8, Math.PI / 2]) {
    const vector = csfViewVector(m, angle)
    expect(Math.hypot(vector.x, vector.y, vector.z)).toBeCloseTo(Math.hypot(m.x, m.y, m.z), 12)
  }
})
