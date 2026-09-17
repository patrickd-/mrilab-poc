import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * A single static proton-ensemble sphere using the MRI Lab's geometry, CSF
 * color, Phong shading, and lighting. Opacity is slightly higher here so the
 * lecture-sized sphere stays legible over the magnetic-field lines.
 */
export function ProtonSphereGraphic() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [webGlReady, setWebGlReady] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof WebGLRenderingContext === 'undefined') return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      })
    } catch {
      return
    }

    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'proton-sphere__canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 20)
    camera.position.set(0, 0, 4.25)

    const ambientLight = new THREE.AmbientLight('#b8dcea', 1.35)
    const keyLight = new THREE.DirectionalLight('#e7f8ff', 2.1)
    keyLight.position.set(-3, 4.5, 6)
    scene.add(ambientLight, keyLight)

    const geometry = new THREE.SphereGeometry(1, 40, 28)
    const material = new THREE.MeshPhongMaterial({
      color: '#55c4e8',
      emissive: '#07151b',
      specular: '#bceeff',
      shininess: 72,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
    const sphere = new THREE.Mesh(geometry, material)
    scene.add(sphere)

    const render = () => {
      const size = Math.max(1, host.clientWidth)
      renderer.setSize(size, size, false)
      renderer.render(scene, camera)
    }
    render()
    setWebGlReady(true)

    const resizeObserver = new ResizeObserver(render)
    resizeObserver.observe(host)

    return () => {
      resizeObserver.disconnect()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className={`proton-sphere__surface${webGlReady ? ' proton-sphere__surface--webgl' : ''}`}
      ref={hostRef}
    >
      <span className="proton-sphere__fallback" />
    </div>
  )
}
