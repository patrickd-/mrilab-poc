import * as THREE from 'three'

/** Keep every presentation magnet in the same bright, post-shell render pass. */
export function createMagnetPoleMaterial(pole: 'N' | 'S') {
  const color = pole === 'N' ? '#ff0018' : '#006cff'
  return new THREE.MeshPhongMaterial({
    color, emissive: color, emissiveIntensity: 1.9, shininess: 96,
    specular: '#ffffff', toneMapped: false, transparent: true,
  })
}
