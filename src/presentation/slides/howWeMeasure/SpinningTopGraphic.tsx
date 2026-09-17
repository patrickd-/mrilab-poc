import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { FLICK_CONTACT_MS } from './flickTiming'

const SECTOR_COLORS = [
  '#eb4052', '#ffb638', '#ffe6a0', '#36c49b',
  '#21a9d0', '#3263b9', '#9063be', '#f27d87',
]

export function SpinningTopGraphic({
  flickSequence,
}: {
  flickSequence: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const flickStartedAtRef = useRef<number | null>(null)
  const pendingContactRef = useRef<number | null>(null)

  useEffect(() => {
    if (flickSequence > 0) {
      pendingContactRef.current = performance.now() + FLICK_CONTACT_MS
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

    const ambientLight = new THREE.HemisphereLight('#eaf4ff', '#384257', 2.1)
    const keyLight = new THREE.DirectionalLight('#fff0d6', 3.2)
    keyLight.position.set(-3.5, 5, 6)
    const rimLight = new THREE.DirectionalLight('#a3e7ff', 2.4)
    rimLight.position.set(4, 2, -3)
    scene.add(ambientLight, keyLight, rimLight)

    const precessionPivot = new THREE.Group()
    const tiltPivot = new THREE.Group()
    const spinner = new THREE.Group()
    precessionPivot.add(tiltPivot)
    tiltPivot.add(spinner)
    scene.add(precessionPivot)

    // A rounded lacquered crown and tapered underside, with the paint wrapped
    // around the lathe itself so the equator stays smooth while it rotates.
    const profileCurve = new THREE.SplineCurve([
      new THREE.Vector2(0.07, -0.93),
      new THREE.Vector2(0.3, -0.67),
      new THREE.Vector2(0.64, -0.37),
      new THREE.Vector2(0.94, -0.12),
      new THREE.Vector2(0.99, 0.01),
      new THREE.Vector2(0.91, 0.23),
      new THREE.Vector2(0.65, 0.46),
      new THREE.Vector2(0.31, 0.59),
      new THREE.Vector2(0.12, 0.61),
    ])
    const bodyProfile = profileCurve.getPoints(70)
    const bodyGeometry = new THREE.LatheGeometry(bodyProfile, 128)
    const bodyMaterials = SECTOR_COLORS.map(
      (color) =>
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.32,
          metalness: 0.08,
          clearcoat: 0.8,
          clearcoatRoughness: 0.23,
        }),
    )
    const indicesPerSector = 16 * (bodyProfile.length - 1) * 6
    for (let sector = 0; sector < SECTOR_COLORS.length; sector += 1) {
      bodyGeometry.addGroup(sector * indicesPerSector, indicesPerSector, sector)
    }
    spinner.add(new THREE.Mesh(bodyGeometry, bodyMaterials))

    const brassMaterial = new THREE.MeshStandardMaterial({
      color: '#e9bc69', metalness: 0.65, roughness: 0.3,
    })
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: '#273c59', metalness: 0.25, roughness: 0.3,
    })
    const stemGeometry = new THREE.LatheGeometry([
      new THREE.Vector2(0.13, 0.58),
      new THREE.Vector2(0.13, 0.66),
      new THREE.Vector2(0.085, 0.7),
      new THREE.Vector2(0.085, 1.08),
      new THREE.Vector2(0.125, 1.13),
      new THREE.Vector2(0.125, 1.2),
      new THREE.Vector2(0.09, 1.24),
      new THREE.Vector2(0, 1.24),
    ], 48)
    spinner.add(new THREE.Mesh(stemGeometry, stemMaterial))
    const tipGeometry = new THREE.ConeGeometry(0.075, 0.24, 32)
    const tip = new THREE.Mesh(tipGeometry, brassMaterial)
    tip.rotation.z = Math.PI
    tip.position.y = -1.025
    spinner.add(tip)
    const rimGeometry = new THREE.TorusGeometry(0.985, 0.025, 12, 128)
    const rim = new THREE.Mesh(rimGeometry, brassMaterial)
    rim.rotation.x = Math.PI / 2
    spinner.add(rim)
    const collarGeometry = new THREE.TorusGeometry(0.135, 0.025, 12, 48)
    const collar = new THREE.Mesh(collarGeometry, brassMaterial)
    collar.rotation.x = Math.PI / 2
    collar.position.y = 0.65
    spinner.add(collar)

    let animationFrame = 0
    let previousTime = performance.now()
    let spinAngle = 0
    const renderFrame = (now: number) => {
      const deltaSeconds = Math.min(0.05, (now - previousTime) / 1000)
      previousTime = now
      spinAngle += deltaSeconds * 4.6
      spinner.rotation.y = spinAngle

      // A second flick must not reset the existing wobble before contact.
      const pendingContact = pendingContactRef.current
      if (pendingContact !== null && now >= pendingContact) {
        flickStartedAtRef.current = pendingContact
        pendingContactRef.current = null
      }
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
      bodyMaterials.forEach((material) => material.dispose())
      stemGeometry.dispose()
      stemMaterial.dispose()
      tipGeometry.dispose()
      rimGeometry.dispose()
      collarGeometry.dispose()
      brassMaterial.dispose()
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
