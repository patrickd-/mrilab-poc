import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const BELT_COLORS = [
  '#ff3659',
  '#ff9f1c',
  '#ffe84a',
  '#31e981',
  '#20c9ff',
  '#5271ff',
  '#a855f7',
  '#ff4fd8',
]

export function SpinningTopGraphic({
  flickSequence,
}: {
  flickSequence: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const flickStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (flickSequence > 0) {
      flickStartedAtRef.current = performance.now()
    }
  }, [flickSequence])

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
    renderer.domElement.className = 'spinning-top__canvas'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30)
    camera.position.set(0, 0.15, 5.4)

    const ambientLight = new THREE.AmbientLight('#cfe6ff', 1.7)
    const keyLight = new THREE.DirectionalLight('#fff5db', 2.8)
    keyLight.position.set(-3.5, 5, 6)
    const rimLight = new THREE.DirectionalLight('#64dff5', 1.5)
    rimLight.position.set(4, -1, 3)
    scene.add(ambientLight, keyLight, rimLight)

    const precessionPivot = new THREE.Group()
    const tiltPivot = new THREE.Group()
    const spinner = new THREE.Group()
    precessionPivot.add(tiltPivot)
    tiltPivot.add(spinner)
    scene.add(precessionPivot)

    const bodyProfile = [
      new THREE.Vector2(0.035, -1.14),
      new THREE.Vector2(0.14, -0.91),
      new THREE.Vector2(0.5, -0.62),
      new THREE.Vector2(0.76, -0.25),
      new THREE.Vector2(0.83, 0.02),
      new THREE.Vector2(0.72, 0.33),
      new THREE.Vector2(0.47, 0.58),
      new THREE.Vector2(0.2, 0.68),
      new THREE.Vector2(0.16, 0.94),
    ]
    const bodyGeometry = new THREE.LatheGeometry(bodyProfile, 64)
    const bodyMaterial = new THREE.MeshPhongMaterial({
      color: '#f6d27a',
      emissive: '#372308',
      specular: '#fff7d6',
      shininess: 92,
    })
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    spinner.add(body)

    const stemGeometry = new THREE.CylinderGeometry(0.13, 0.17, 0.66, 28)
    const stemMaterial = new THREE.MeshPhongMaterial({
      color: '#f1b64d',
      emissive: '#3c2205',
      specular: '#fff1c2',
      shininess: 78,
    })
    const stem = new THREE.Mesh(stemGeometry, stemMaterial)
    stem.position.y = 1.18
    spinner.add(stem)

    const capGeometry = new THREE.SphereGeometry(0.21, 28, 18)
    const capMaterial = new THREE.MeshPhongMaterial({
      color: '#ff4f72',
      emissive: '#6d0c21',
      specular: '#ffe8ed',
      shininess: 88,
    })
    const cap = new THREE.Mesh(capGeometry, capMaterial)
    cap.scale.y = 0.7
    cap.position.y = 1.52
    spinner.add(cap)

    const beltPanelGeometry = new THREE.BoxGeometry(0.39, 0.31, 0.11)
    const beltMaterials = BELT_COLORS.map(
      (color) =>
        new THREE.MeshPhongMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.38,
          specular: '#ffffff',
          shininess: 74,
        }),
    )
    const panelCount = 16
    for (let index = 0; index < panelCount; index += 1) {
      const angle = (index / panelCount) * Math.PI * 2
      const panel = new THREE.Mesh(
        beltPanelGeometry,
        beltMaterials[index % beltMaterials.length],
      )
      panel.position.set(Math.cos(angle) * 0.79, 0, Math.sin(angle) * 0.79)
      panel.rotation.y = -angle - Math.PI / 2
      spinner.add(panel)
    }

    let animationFrame = 0
    let previousTime = performance.now()
    let spinAngle = 0
    const renderFrame = (now: number) => {
      const deltaSeconds = Math.min(0.05, (now - previousTime) / 1000)
      previousTime = now
      spinAngle += deltaSeconds * 7.8
      spinner.rotation.y = spinAngle

      const flickStartedAt = flickStartedAtRef.current
      if (flickStartedAt === null) {
        precessionPivot.rotation.y = 0
        tiltPivot.rotation.z = 0
      } else {
        const elapsedSeconds = Math.max(0, (now - flickStartedAt) / 1000)
        const tilt =
          0.74 *
          Math.exp(-elapsedSeconds / 2.15) *
          (1 + 0.055 * Math.sin(elapsedSeconds * 13))
        precessionPivot.rotation.y = elapsedSeconds * 4.4
        tiltPivot.rotation.z = tilt
        if (tilt < 0.006) {
          flickStartedAtRef.current = null
        }
      }

      renderer.render(scene, camera)
      animationFrame = requestAnimationFrame(renderFrame)
    }

    const resize = () => {
      const width = Math.max(1, host.clientWidth)
      const height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    animationFrame = requestAnimationFrame(renderFrame)

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(animationFrame)
      bodyGeometry.dispose()
      bodyMaterial.dispose()
      stemGeometry.dispose()
      stemMaterial.dispose()
      capGeometry.dispose()
      capMaterial.dispose()
      beltPanelGeometry.dispose()
      beltMaterials.forEach((material) => material.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div
      aria-label="Spinning top representing proton precession"
      className="spinning-top"
      data-flick-sequence={flickSequence}
      role="img"
      ref={hostRef}
    />
  )
}
