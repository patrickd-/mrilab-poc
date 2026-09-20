import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { SAMPLE_COLORS } from '../../../models/sampleColors'
import type { FidEnsembleState } from '../../../simulation/fid'
import { presentationMagnetizationAt, type ProtonExcitation } from '../howWeMeasure/protonExcitation'
import { CSF_GRID_SIDE, CSF_LAYOUT_MS } from './csfDephasing'
import { createMagnetPoleMaterial } from '../../components/magnetAppearance'
import { csfViewVector, splitCsfOrigins, type CsfPose } from './csfView'

interface Props {
  step: number
  states: readonly FidEnsembleState[]
  excitation: ProtonExcitation
  immediate: boolean
  onSettled: () => void
}

/** One renderer and shared geometry for all 36 ensembles, including stacking. */
export function CsfEnsembleGraphic(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const updateRef = useRef<((props: Props) => void) | null>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof WebGLRenderingContext === 'undefined') return
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000)
    camera.position.z = 1000
    scene.add(new THREE.AmbientLight('#b8dcea', 1.35))
    const light = new THREE.DirectionalLight('#e7f8ff', 2.1)
    light.position.set(-3, 4.5, 6)
    scene.add(light)
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 24)
    const barGeometry = new THREE.BoxGeometry(0.54, 0.78, 0.4)
    const labelGeometry = new THREE.PlaneGeometry(0.38, 0.38)
    const poleMaterials = [createMagnetPoleMaterial('N'), createMagnetPoleMaterial('S')]
    const textures: THREE.CanvasTexture[] = []
    const labelMaterials = ['N', 'S'].map(label => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 128
      const context = canvas.getContext('2d')!
      context.fillStyle = 'white'
      context.font = '700 82px Manrope, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(label, 64, 67)
      const map = new THREE.CanvasTexture(canvas)
      map.colorSpace = THREE.SRGBColorSpace
      textures.push(map)
      return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false })
    })
    const objects = Array.from({ length: CSF_GRID_SIDE ** 2 }, () => {
      const group = new THREE.Group()
      const shellMaterial = new THREE.MeshPhongMaterial({
        color: SAMPLE_COLORS['cerebrospinal-fluid'], emissive: '#07151b',
        specular: '#000000', shininess: 0, transparent: true, opacity: 0.5, depthWrite: false,
      })
      const shell = new THREE.Mesh(sphereGeometry, shellMaterial)
      shell.renderOrder = 2
      const magnet = new THREE.Group()
      const labels: THREE.Mesh[] = []
      for (let pole = 0; pole < 2; pole++) {
        const y = pole === 0 ? 0.39 : -0.39
        const half = new THREE.Mesh(barGeometry, poleMaterials[pole])
        half.position.y = y
        half.renderOrder = 3
        magnet.add(half)
        const label = new THREE.Mesh(labelGeometry, labelMaterials[pole])
        label.position.set(0, y, 0.205)
        label.renderOrder = 4
        magnet.add(label)
        labels.push(label)
      }
      group.add(shell, magnet)
      scene.add(group)
      return { group, magnet, shellMaterial, labels }
    })
    let width = 1, height = 1, frame = 0, transitionAt = 0, lastStep = -1
    let current: CsfPose[] = [], from: CsfPose[] = [], target: CsfPose[] = []
    let input = latest.current
    let settled = false
    const up = new THREE.Vector3(0, 1, 0)
    const vector = new THREE.Vector3()
    const facing = new THREE.Quaternion().setFromAxisAngle(up, -0.18)
    const poses = (step: number): CsfPose[] => {
      const size = Math.min(width, height)
      return objects.map((_, index) => {
        const grid = step >= 2 && step <= 5
        const x = ((index % 6) - 2.5) * size * 0.145
        const y = (2.5 - Math.floor(index / 6)) * size * 0.145
        return { x: grid ? x : 0, y: grid ? y : 0,
          radius: grid ? size * 0.064 : (index === 0 || step === 6 ? size * 0.25 : 0),
          shell: step === 6 && index > 0 ? 0 : 0.5,
          thickness: step === 6 ? 0.18 : 1 }
      })
    }
    const animate = () => {
      const now = performance.now()
      const fraction = input.immediate ? 1 : Math.min(1, (now - transitionAt) / CSF_LAYOUT_MS)
      const blend = fraction * fraction * (3 - 2 * fraction)
      current = target.map((pose, index) => {
        const start = from[index] ?? pose
        const mix = (key: keyof CsfPose) => start[key] + (pose[key] - start[key]) * blend
        return { x: mix('x'), y: mix('y'), radius: mix('radius'), shell: mix('shell'), thickness: mix('thickness') }
      })
      for (let index = 0; index < objects.length; index++) {
        const { group, magnet, shellMaterial, labels } = objects[index]
        const pose = current[index]
        group.position.set(pose.x, pose.y, 0)
        group.scale.setScalar(Math.max(0.0001, pose.radius))
        group.visible = pose.radius > 0.1
        shellMaterial.opacity = pose.shell
        // Overlapping letters become a white patch in stacked mode; the
        // red/blue halves still identify the poles of every individual magnet.
        labels.forEach(label => { label.visible = pose.thickness > 0.5 })
        const m = presentationMagnetizationAt(input.states[index], input.excitation, now)
        const view = csfViewVector(m, (input.step === 1 ? blend : 1) * Math.PI / 2)
        vector.set(view.x, view.y, view.z)
        const length = vector.length()
        if (length > 1e-8) magnet.quaternion.setFromUnitVectors(up, vector.normalize()).multiply(facing)
        magnet.scale.set(pose.thickness, Math.max(1e-5, length), pose.thickness)
      }
      renderer.render(scene, camera)
      if (fraction === 1 && !settled) { settled = true; input.onSettled() }
      const lastPulse = input.excitation.pulseEvents.at(-1)?.timeMilliseconds
      if (fraction < 1 || ((input.step !== 3 && input.step !== 4) && lastPulse !== undefined && now < lastPulse + 12000)) frame = requestAnimationFrame(animate)
    }
    const update = (next: Props) => {
      input = next
      if (lastStep !== next.step) {
        from = current.length ? current : poses(next.step === 1 ? 1 : next.step === 6 ? 5 : next.step - 1)
        if (lastStep === -1 && next.step === 1 && !next.immediate) {
          from[0] = { ...from[0], x: -width * 0.25, y: height * (0.5 - (0.27 - 0.08) / 0.84),
            radius: Math.max(100, Math.min(145, window.innerWidth * 0.09)) * 0.365 }
        }
        if (next.step === 2 && (lastStep === 1 || lastStep === -1)) {
          from = splitCsfOrigins(from[0], objects.length)
        }
        target = poses(next.step)
        transitionAt = performance.now()
        settled = false
        lastStep = next.step
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(animate)
    }
    const resize = () => {
      const nextWidth = Math.max(1, host.clientWidth), nextHeight = Math.max(1, host.clientHeight)
      if (nextWidth === width && nextHeight === height && lastStep !== -1) return
      width = nextWidth; height = nextHeight
      renderer.setSize(width, height)
      camera.left = -width / 2; camera.right = width / 2
      camera.top = height / 2; camera.bottom = -height / 2
      camera.updateProjectionMatrix()
      if (current.length) current = target = from = poses(input.step)
      update(input)
    }
    updateRef.current = update
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame); updateRef.current = null
      sphereGeometry.dispose(); barGeometry.dispose(); labelGeometry.dispose()
      objects.forEach(object => object.shellMaterial.dispose())
      poleMaterials.forEach(material => material.dispose())
      labelMaterials.forEach(material => material.dispose())
      textures.forEach(texture => texture.dispose())
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
    }
  }, [])

  useEffect(() => updateRef.current?.(props), [props.step, props.states, props.excitation, props.immediate, props.onSettled])

  return <div className="csf-ensemble-scene" ref={hostRef} role="img"
    aria-label={props.step === 6 ? '36 CSF magnetizations in one stacked sphere' : props.step === 1 ? 'Enlarged CSF ensemble' : '6 by 6 CSF ensemble grid'}
    data-view="top-down" data-magnet-count={props.step === 1 ? 1 : 36} data-rf-pulse-count={props.excitation.pulseEvents.length}
    data-hidden={props.step === 3 || props.step === 4} />
}
