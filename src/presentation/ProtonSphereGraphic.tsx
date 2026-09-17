import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * A single static proton-ensemble sphere using the MRI Lab's geometry, CSF
 * color, Phong shading, and lighting. Opacity is slightly higher here so the
 * lecture-sized sphere stays legible over the magnetic-field lines.
 */
export function ProtonSphereGraphic({
  orientation,
  showCone,
  fieldArrowOpacity,
  animateConeChange,
  showNetMagnet,
}: {
  orientation?: 'up' | 'down'
  showCone: boolean
  fieldArrowOpacity: number
  animateConeChange: boolean
  showNetMagnet: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const coneMaterialRef = useRef<THREE.MeshPhongMaterial | null>(null)
  const arrowMaterialRef = useRef<THREE.MeshPhongMaterial | null>(null)
  const sphereMaterialRef = useRef<THREE.MeshPhongMaterial | null>(null)
  const netMagnetRef = useRef<THREE.Group | null>(null)
  const renderRef = useRef<(() => void) | null>(null)
  const coneAnimationRef = useRef(0)

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
    camera.position.set(0, 0, 5.1)

    const ambientLight = new THREE.AmbientLight('#b8dcea', 1.35)
    const keyLight = new THREE.DirectionalLight('#e7f8ff', 2.1)
    keyLight.position.set(-3, 4.5, 6)
    scene.add(ambientLight, keyLight)

    const geometry = new THREE.SphereGeometry(1, 40, 28)
    const depthMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
    })
    const depthSphere = new THREE.Mesh(geometry, depthMaterial)
    depthSphere.renderOrder = 0
    scene.add(depthSphere)

    let coneGeometry: THREE.ConeGeometry | null = null
    let coneMaterial: THREE.MeshPhongMaterial | null = null
    if (orientation) {
      coneGeometry = new THREE.ConeGeometry(0.78, 1.7, 40, 1, false)
      coneMaterial = new THREE.MeshPhongMaterial({
        color: '#ff7866',
        emissive: '#48140f',
        specular: '#ffd2c8',
        shininess: 86,
        transparent: true,
        opacity: showCone ? 0.96 : 0,
        depthWrite: false,
      })
      const cone = new THREE.Mesh(coneGeometry, coneMaterial)
      cone.position.y = orientation === 'up' ? 0.55 : -0.55
      if (orientation === 'up') cone.rotation.z = Math.PI
      cone.renderOrder = 1
      scene.add(cone)
      coneMaterialRef.current = coneMaterial
    }

    const material = new THREE.MeshPhongMaterial({
      color: '#55c4e8',
      emissive: '#07151b',
      specular: showNetMagnet ? '#000000' : '#bceeff',
      shininess: showNetMagnet ? 0 : 72,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
    const sphere = new THREE.Mesh(geometry, material)
    sphere.renderOrder = 2
    scene.add(sphere)
    sphereMaterialRef.current = material

    const arrowShaftGeometry = new THREE.CylinderGeometry(
      0.065,
      0.065,
      1.05,
      16,
    )
    const arrowHeadGeometry = new THREE.ConeGeometry(0.2, 0.38, 20)
    const arrowMaterial = new THREE.MeshPhongMaterial({
      color: '#18ff68',
      emissive: '#00a83f',
      emissiveIntensity: 1.2,
      specular: '#effff5',
      shininess: 88,
      transparent: true,
      opacity: fieldArrowOpacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const arrowShaft = new THREE.Mesh(arrowShaftGeometry, arrowMaterial)
    arrowShaft.position.y = -0.12
    arrowShaft.renderOrder = 3
    const arrowHead = new THREE.Mesh(arrowHeadGeometry, arrowMaterial)
    arrowHead.position.y = 0.59
    arrowHead.renderOrder = 3
    scene.add(arrowShaft, arrowHead)
    arrowMaterialRef.current = arrowMaterial

    const magnetHalfGeometry = new THREE.BoxGeometry(0.54, 0.78, 0.4)
    const northMaterial = new THREE.MeshPhongMaterial({
      color: '#ff0018',
      emissive: '#ff0018',
      emissiveIntensity: 1.9,
      specular: '#ffffff',
      shininess: 96,
      depthTest: false,
      toneMapped: false,
    })
    const southMaterial = new THREE.MeshPhongMaterial({
      color: '#006cff',
      emissive: '#006cff',
      emissiveIntensity: 1.9,
      specular: '#ffffff',
      shininess: 96,
      depthTest: false,
      toneMapped: false,
    })
    const netMagnet = new THREE.Group()
    netMagnet.rotation.y = -0.18
    netMagnet.visible = showNetMagnet

    const northHalf = new THREE.Mesh(magnetHalfGeometry, northMaterial)
    northHalf.position.y = 0.39
    northHalf.renderOrder = 3
    const southHalf = new THREE.Mesh(magnetHalfGeometry, southMaterial)
    southHalf.position.y = -0.39
    southHalf.renderOrder = 3
    netMagnet.add(northHalf, southHalf)

    const labelPlaneGeometry = new THREE.PlaneGeometry(0.38, 0.38)
    const labelTextures: THREE.CanvasTexture[] = []
    const labelMaterials: THREE.MeshBasicMaterial[] = []
    const makePoleLabel = (label: 'N' | 'S', y: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#ffffff'
      context.font = '700 82px Manrope, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(label, canvas.width / 2, canvas.height / 2 + 3)

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      const labelMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
      const labelMesh = new THREE.Mesh(labelPlaneGeometry, labelMaterial)
      labelMesh.position.set(0, y, 0.205)
      labelMesh.renderOrder = 4
      netMagnet.add(labelMesh)
      labelTextures.push(texture)
      labelMaterials.push(labelMaterial)
    }
    makePoleLabel('N', 0.39)
    makePoleLabel('S', -0.39)
    scene.add(netMagnet)
    netMagnetRef.current = netMagnet

    const render = () => {
      const size = Math.max(1, host.clientWidth)
      renderer.setSize(size, size, false)
      renderer.render(scene, camera)
    }
    renderRef.current = render
    render()

    const resizeObserver = new ResizeObserver(render)
    resizeObserver.observe(host)

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(coneAnimationRef.current)
      renderRef.current = null
      coneMaterialRef.current = null
      arrowMaterialRef.current = null
      sphereMaterialRef.current = null
      netMagnetRef.current = null
      geometry.dispose()
      depthMaterial.dispose()
      coneGeometry?.dispose()
      coneMaterial?.dispose()
      material.dispose()
      arrowShaftGeometry.dispose()
      arrowHeadGeometry.dispose()
      arrowMaterial.dispose()
      magnetHalfGeometry.dispose()
      northMaterial.dispose()
      southMaterial.dispose()
      labelPlaneGeometry.dispose()
      labelTextures.forEach((texture) => texture.dispose())
      labelMaterials.forEach((labelMaterial) => labelMaterial.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [orientation])

  useEffect(() => {
    const netMagnet = netMagnetRef.current
    const sphereMaterial = sphereMaterialRef.current
    const render = renderRef.current
    if (!netMagnet || !sphereMaterial || !render) return
    netMagnet.visible = showNetMagnet
    sphereMaterial.specular.set(showNetMagnet ? '#000000' : '#bceeff')
    sphereMaterial.shininess = showNetMagnet ? 0 : 72
    render()
  }, [showNetMagnet])

  useEffect(() => {
    const arrowMaterial = arrowMaterialRef.current
    const render = renderRef.current
    if (!arrowMaterial || !render) return
    arrowMaterial.opacity = fieldArrowOpacity
    render()
  }, [fieldArrowOpacity])

  useEffect(() => {
    const coneMaterial = coneMaterialRef.current
    const render = renderRef.current
    if (!coneMaterial || !render) return

    cancelAnimationFrame(coneAnimationRef.current)
    const fromOpacity = coneMaterial.opacity
    const toOpacity = showCone ? 0.96 : 0
    if (fromOpacity === toOpacity) return
    if (!animateConeChange) {
      coneMaterial.opacity = toOpacity
      render()
      return
    }
    const startedAt = performance.now()

    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 420)
      const easedProgress = 1 - (1 - progress) ** 3
      coneMaterial.opacity =
        fromOpacity + (toOpacity - fromOpacity) * easedProgress
      render()
      if (progress < 1) {
        coneAnimationRef.current = requestAnimationFrame(update)
      }
    }
    coneAnimationRef.current = requestAnimationFrame(update)

    return () => cancelAnimationFrame(coneAnimationRef.current)
  }, [animateConeChange, showCone])

  return (
    <div
      aria-hidden="true"
      className="proton-sphere__surface"
      data-cone-orientation={orientation}
      data-cone-visible={orientation ? showCone : undefined}
      data-field-arrow-opacity={fieldArrowOpacity}
      data-net-magnet-visible={showNetMagnet}
      ref={hostRef}
    />
  )
}
