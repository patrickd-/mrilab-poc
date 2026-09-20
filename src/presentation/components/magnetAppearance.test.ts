import { expect, it } from 'vitest'
import { createMagnetPoleMaterial } from './magnetAppearance'

it('uses the bright post-shell material for both poles in every presentation renderer', () => {
  for (const [pole, color] of [['N', 'ff0018'], ['S', '006cff']] as const) {
    const material = createMagnetPoleMaterial(pole)
    expect(material.color.getHexString()).toBe(color)
    expect(material.emissive.getHexString()).toBe(color)
    expect(material.emissiveIntensity).toBe(1.9)
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBe(1)
    expect(material.toneMapped).toBe(false)
    material.dispose()
  }
})
