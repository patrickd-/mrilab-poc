import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type {
  HydrogenEnsemble,
  SamplePresetId,
} from '../models/HydrogenEnsemble'
import {
  fidEnsembleMagnetizationStateAt,
  type FidEnsembleState,
  type RfPulseEvent,
} from '../simulation/fid'

export const GRID_SIZE = 128
const GRID_SPACING = 0.42
const SPHERE_RADIUS = 0.198
const GRID_OFFSET = ((GRID_SIZE - 1) * GRID_SPACING) / 2
const SELECTED_SPHERE_COLOR = new THREE.Color('#ffd166')
const SAMPLE_SPHERE_COLORS: Readonly<Record<SamplePresetId, THREE.Color>> = {
  air: new THREE.Color('#526c78'),
  'cortical-bone': new THREE.Color('#d6a15f'),
  'cerebrospinal-fluid': new THREE.Color('#55c4e8'),
  'gray-matter': new THREE.Color('#b28da9'),
  'white-matter': new THREE.Color('#e7dfba'),
}
const CAMERA_DISTANCE =
  (GRID_OFFSET / Math.tan(THREE.MathUtils.degToRad(20))) * 1.12
const CAMERA_POSITION = new THREE.Vector3(0, 0, CAMERA_DISTANCE)
const CAMERA_TARGET = new THREE.Vector3(0, 0, 0)
const STACKED_CAMERA_POSITION = new THREE.Vector3(0.68, 0.52, 1.08)
const FOCUS_DURATION = 650
const VISUAL_PRECESSION_RADIANS_PER_MILLISECOND = (2 * Math.PI) / 180

interface FocusTransition {
  fromCamera: THREE.Vector3
  toCamera: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  startedAt: number
}

export interface EnsembleSelection {
  column: number
  row: number
  index: number
}

export interface LabSceneHandle {
  resetCamera: () => void
}

export type RenderMode = 'slice' | 'stacked'

interface LabSceneProps {
  ensembleModels: ReadonlyArray<HydrogenEnsemble>
  ensembleRevision: number
  fidEnsembleStates: ReadonlyArray<FidEnsembleState>
  fidPulseEvents: ReadonlyArray<RfPulseEvent>
  fidSimulationActive: boolean
  fidSimulationTimeMilliseconds: number
  renderMode: RenderMode
  selected: EnsembleSelection | null
  onSelect: (selection: EnsembleSelection) => void
}

function gridPosition(column: number, row: number) {
  return new THREE.Vector3(
    column * GRID_SPACING - GRID_OFFSET,
    GRID_OFFSET - row * GRID_SPACING,
    0,
  )
}

function smoothStep(progress: number) {
  return progress * progress * (3 - 2 * progress)
}

const LabScene = forwardRef<LabSceneHandle, LabSceneProps>(
  function LabScene(
    {
      ensembleModels,
      ensembleRevision,
      fidEnsembleStates,
      fidPulseEvents,
      fidSimulationActive,
      fidSimulationTimeMilliseconds,
      renderMode,
      selected,
      onSelect,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const ensemblesRef = useRef<THREE.InstancedMesh | null>(null)
    const fidArrowShaftsRef = useRef<THREE.InstancedMesh | null>(null)
    const fidArrowHeadsRef = useRef<THREE.InstancedMesh | null>(null)
    const renderModeRef = useRef(renderMode)
    const modeObjectsRef = useRef<{
      boundary: THREE.LineLoop
      ensembles: THREE.InstancedMesh
      fieldArrowHeads: THREE.InstancedMesh
      fieldArrowShafts: THREE.InstancedMesh
      fidArrowMaterial: THREE.MeshBasicMaterial
      stackedFieldArrowHead: THREE.Mesh
      stackedFieldArrowShaft: THREE.Mesh
      stackedSphere: THREE.Mesh
    } | null>(null)
    const fidAnimationRef = useRef({
      active: fidSimulationActive,
      pulseEvents: fidPulseEvents,
      states: fidEnsembleStates,
      timeMilliseconds: fidSimulationTimeMilliseconds,
    })
    const fidArrowsDirtyRef = useRef(true)
    const renderedFidStatesRef = useRef<ReadonlyArray<FidEnsembleState>>([])
    const previousSelectionRef = useRef<number | null>(selected?.index ?? null)
    const selectedIndexRef = useRef<number | null>(selected?.index ?? null)
    const focusTransitionRef = useRef<FocusTransition | null>(null)
    const onSelectRef = useRef(onSelect)

    useEffect(() => {
      onSelectRef.current = onSelect
    }, [onSelect])

    useEffect(() => {
      renderModeRef.current = renderMode
      const modeObjects = modeObjectsRef.current
      if (!modeObjects) return

      const stacked = renderMode === 'stacked'
      modeObjects.ensembles.visible = !stacked
      modeObjects.boundary.visible = !stacked
      modeObjects.fieldArrowShafts.visible = !stacked
      modeObjects.fieldArrowHeads.visible = !stacked
      modeObjects.stackedSphere.visible = stacked
      modeObjects.stackedFieldArrowShaft.visible = stacked
      modeObjects.stackedFieldArrowHead.visible = stacked
      modeObjects.fidArrowMaterial.opacity = stacked ? 0.025 : 1
      modeObjects.fidArrowMaterial.needsUpdate = true
      fidArrowsDirtyRef.current = true

      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return
      focusTransitionRef.current = null
      camera.position.copy(
        stacked ? STACKED_CAMERA_POSITION : CAMERA_POSITION,
      )
      camera.up.set(0, 1, 0)
      controls.target.copy(CAMERA_TARGET)
      controls.update()
    }, [renderMode])

    useEffect(() => {
      fidAnimationRef.current = {
        active: fidSimulationActive,
        pulseEvents: fidPulseEvents,
        states: fidEnsembleStates,
        timeMilliseconds: fidSimulationTimeMilliseconds,
      }
      fidArrowsDirtyRef.current = true
    }, [
      fidEnsembleStates,
      fidPulseEvents,
      fidSimulationActive,
      fidSimulationTimeMilliseconds,
    ])

    useEffect(() => {
      const ensembles = ensemblesRef.current

      if (!selected || renderMode === 'stacked') {
        if (ensembles && previousSelectionRef.current !== null) {
          ensembles.setColorAt(
            previousSelectionRef.current,
            SAMPLE_SPHERE_COLORS[
              ensembleModels[previousSelectionRef.current].samplePreset
            ],
          )
          if (ensembles.instanceColor) {
            ensembles.instanceColor.needsUpdate = true
          }
        }
        previousSelectionRef.current = null
        selectedIndexRef.current = null
        return
      }

      const selectedPosition = gridPosition(selected.column, selected.row)

      if (ensembles) {
        if (previousSelectionRef.current !== null) {
          ensembles.setColorAt(
            previousSelectionRef.current,
            SAMPLE_SPHERE_COLORS[
              ensembleModels[previousSelectionRef.current].samplePreset
            ],
          )
        }
        ensembles.setColorAt(selected.index, SELECTED_SPHERE_COLOR)
        if (ensembles.instanceColor) {
          ensembles.instanceColor.needsUpdate = true
        }
        previousSelectionRef.current = selected.index
        selectedIndexRef.current = selected.index
      }

      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!camera || !controls) return

      const targetDelta = selectedPosition.clone().sub(controls.target)
      focusTransitionRef.current = {
        fromCamera: camera.position.clone(),
        toCamera: camera.position.clone().add(targetDelta),
        fromTarget: controls.target.clone(),
        toTarget: selectedPosition,
        startedAt: performance.now(),
      }
    }, [ensembleModels, renderMode, selected])

    useEffect(() => {
      const ensembles = ensemblesRef.current
      if (!ensembles) return

      ensembleModels.forEach((ensemble, index) => {
        ensembles.setColorAt(
          index,
          index === selectedIndexRef.current
            ? SELECTED_SPHERE_COLOR
            : SAMPLE_SPHERE_COLORS[ensemble.samplePreset],
        )
      })
      if (ensembles.instanceColor) {
        ensembles.instanceColor.needsUpdate = true
      }
    }, [ensembleModels, ensembleRevision])

    useImperativeHandle(ref, () => ({
      resetCamera() {
        const camera = cameraRef.current
        const controls = controlsRef.current
        if (!camera || !controls) return

        focusTransitionRef.current = null
        camera.position.copy(
          renderModeRef.current === 'stacked'
            ? STACKED_CAMERA_POSITION
            : CAMERA_POSITION,
        )
        camera.up.set(0, 1, 0)
        controls.target.copy(CAMERA_TARGET)
        controls.update()
      },
    }))

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#07090c')

      const camera = new THREE.PerspectiveCamera(40, 1, 0.025, 800)
      camera.position.copy(
        renderModeRef.current === 'stacked'
          ? STACKED_CAMERA_POSITION
          : CAMERA_POSITION,
      )
      cameraRef.current = camera

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      container.appendChild(renderer.domElement)

      const controls = new OrbitControls(camera, renderer.domElement)
      controls.target.copy(CAMERA_TARGET)
      controls.enableDamping = true
      controls.dampingFactor = 0.07
      controls.minDistance = 0.12
      controls.maxDistance = CAMERA_DISTANCE * 2.4
      controls.minPolarAngle = 0.08
      controls.maxPolarAngle = Math.PI - 0.08
      controls.zoomSpeed = 0.85
      controls.zoomToCursor = false
      controls.panSpeed = 0.75
      controls.screenSpacePanning = true
      controls.update()
      controlsRef.current = controls

      const ambientLight = new THREE.AmbientLight('#b8dcea', 1.35)
      scene.add(ambientLight)

      const keyLight = new THREE.DirectionalLight('#e7f8ff', 2.1)
      keyLight.position.set(-12, 18, 24)
      scene.add(keyLight)

      const sphereGeometry = new THREE.SphereGeometry(
        SPHERE_RADIUS,
        12,
        8,
      )
      const sphereMaterial = new THREE.MeshPhongMaterial({
        color: '#ffffff',
        emissive: '#07151b',
        specular: '#bceeff',
        shininess: 72,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      })

      const ensembles = new THREE.InstancedMesh(
        sphereGeometry,
        sphereMaterial,
        GRID_SIZE * GRID_SIZE,
      )

      const arrowShaftGeometry = new THREE.CylinderGeometry(
        0.02,
        0.02,
        0.27,
        8,
      )
      arrowShaftGeometry.rotateX(Math.PI / 2)
      arrowShaftGeometry.translate(0, 0, -0.06)

      const arrowHeadGeometry = new THREE.ConeGeometry(0.06, 0.12, 10)
      arrowHeadGeometry.rotateX(Math.PI / 2)
      arrowHeadGeometry.translate(0, 0, 0.135)

      const arrowMaterial = new THREE.MeshBasicMaterial({
        color: '#67e69a',
        transparent: true,
        opacity: 0.5,
        toneMapped: false,
      })
      const arrowShafts = new THREE.InstancedMesh(
        arrowShaftGeometry,
        arrowMaterial,
        GRID_SIZE * GRID_SIZE,
      )
      const arrowHeads = new THREE.InstancedMesh(
        arrowHeadGeometry,
        arrowMaterial,
        GRID_SIZE * GRID_SIZE,
      )
      const fidArrowShaftGeometry = new THREE.CylinderGeometry(
        0.018,
        0.018,
        0.11,
        8,
      )
      fidArrowShaftGeometry.rotateX(Math.PI / 2)
      fidArrowShaftGeometry.translate(0, 0, 0.055)

      const fidArrowHeadGeometry = new THREE.ConeGeometry(0.052, 0.08, 10)
      fidArrowHeadGeometry.rotateX(Math.PI / 2)
      fidArrowHeadGeometry.translate(0, 0, 0.15)

      const fidArrowMaterial = new THREE.MeshBasicMaterial({
        color: '#ff5d5d',
        depthWrite: false,
        transparent: true,
        opacity: renderModeRef.current === 'stacked' ? 0.025 : 1,
        toneMapped: false,
      })
      const fidArrowShafts = new THREE.InstancedMesh(
        fidArrowShaftGeometry,
        fidArrowMaterial,
        GRID_SIZE * GRID_SIZE,
      )
      const fidArrowHeads = new THREE.InstancedMesh(
        fidArrowHeadGeometry,
        fidArrowMaterial,
        GRID_SIZE * GRID_SIZE,
      )
      fidArrowShafts.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      fidArrowHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      fidArrowShafts.frustumCulled = false
      fidArrowHeads.frustumCulled = false
      const instanceMatrix = new THREE.Matrix4()
      const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0)
      let instanceIndex = 0

      for (let row = 0; row < GRID_SIZE; row += 1) {
        for (let column = 0; column < GRID_SIZE; column += 1) {
          instanceMatrix.makeTranslation(
            column * GRID_SPACING - GRID_OFFSET,
            GRID_OFFSET - row * GRID_SPACING,
            0,
          )
          ensembles.setMatrixAt(instanceIndex, instanceMatrix)
          arrowShafts.setMatrixAt(instanceIndex, instanceMatrix)
          arrowHeads.setMatrixAt(instanceIndex, instanceMatrix)
          fidArrowShafts.setMatrixAt(instanceIndex, hiddenMatrix)
          fidArrowHeads.setMatrixAt(instanceIndex, hiddenMatrix)
          ensembles.setColorAt(
            instanceIndex,
            instanceIndex === selected?.index
              ? SELECTED_SPHERE_COLOR
              : SAMPLE_SPHERE_COLORS[
                  ensembleModels[instanceIndex].samplePreset
                ],
          )
          instanceIndex += 1
        }
      }

      ensembles.instanceMatrix.needsUpdate = true
      arrowShafts.instanceMatrix.needsUpdate = true
      arrowHeads.instanceMatrix.needsUpdate = true
      fidArrowShafts.instanceMatrix.needsUpdate = true
      fidArrowHeads.instanceMatrix.needsUpdate = true
      if (ensembles.instanceColor) {
        ensembles.instanceColor.needsUpdate = true
      }
      ensembles.computeBoundingSphere()
      scene.add(ensembles)
      ensemblesRef.current = ensembles

      scene.add(arrowShafts, arrowHeads, fidArrowShafts, fidArrowHeads)
      fidArrowShaftsRef.current = fidArrowShafts
      fidArrowHeadsRef.current = fidArrowHeads

      const boundaryPoints = [
        new THREE.Vector3(-GRID_OFFSET, -GRID_OFFSET, -0.22),
        new THREE.Vector3(GRID_OFFSET, -GRID_OFFSET, -0.22),
        new THREE.Vector3(GRID_OFFSET, GRID_OFFSET, -0.22),
        new THREE.Vector3(-GRID_OFFSET, GRID_OFFSET, -0.22),
      ]
      const boundaryGeometry = new THREE.BufferGeometry().setFromPoints(
        boundaryPoints,
      )
      const boundaryMaterial = new THREE.LineBasicMaterial({
        color: '#648092',
        transparent: true,
        opacity: 0.32,
      })
      const boundary = new THREE.LineLoop(boundaryGeometry, boundaryMaterial)
      scene.add(boundary)

      const stackedSphereMaterial = sphereMaterial.clone()
      stackedSphereMaterial.color.set('#91a8b5')
      stackedSphereMaterial.emissive.set('#101a20')
      stackedSphereMaterial.opacity = 0.18
      const stackedSphere = new THREE.Mesh(
        sphereGeometry,
        stackedSphereMaterial,
      )
      const stackedFieldArrowShaft = new THREE.Mesh(
        arrowShaftGeometry,
        arrowMaterial,
      )
      const stackedFieldArrowHead = new THREE.Mesh(
        arrowHeadGeometry,
        arrowMaterial,
      )
      const stacked = renderModeRef.current === 'stacked'
      ensembles.visible = !stacked
      boundary.visible = !stacked
      arrowShafts.visible = !stacked
      arrowHeads.visible = !stacked
      stackedSphere.visible = stacked
      stackedFieldArrowShaft.visible = stacked
      stackedFieldArrowHead.visible = stacked
      scene.add(
        stackedSphere,
        stackedFieldArrowShaft,
        stackedFieldArrowHead,
      )
      modeObjectsRef.current = {
        boundary,
        ensembles,
        fieldArrowHeads: arrowHeads,
        fieldArrowShafts: arrowShafts,
        fidArrowMaterial,
        stackedFieldArrowHead,
        stackedFieldArrowShaft,
        stackedSphere,
      }

      const slicePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      const intersection = new THREE.Vector3()
      const pointerStart = new THREE.Vector2()

      const handlePointerDown = (event: PointerEvent) => {
        pointerStart.set(event.clientX, event.clientY)
      }

      const handlePointerUp = (event: PointerEvent) => {
        if (renderModeRef.current === 'stacked') return
        if (event.button !== 0) return
        const movement = pointerStart.distanceTo(
          new THREE.Vector2(event.clientX, event.clientY),
        )
        if (movement > 5) return

        const bounds = renderer.domElement.getBoundingClientRect()
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)

        if (!raycaster.ray.intersectPlane(slicePlane, intersection)) return

        const column = Math.round((intersection.x + GRID_OFFSET) / GRID_SPACING)
        const row = Math.round((GRID_OFFSET - intersection.y) / GRID_SPACING)

        if (
          column < 0 ||
          column >= GRID_SIZE ||
          row < 0 ||
          row >= GRID_SIZE
        ) {
          return
        }

        onSelectRef.current({
          column,
          row,
          index: row * GRID_SIZE + column,
        })
      }

      const cancelFocusTransition = () => {
        focusTransitionRef.current = null
      }

      controls.addEventListener('start', cancelFocusTransition)
      renderer.domElement.addEventListener('pointerdown', handlePointerDown)
      renderer.domElement.addEventListener('pointerup', handlePointerUp)

      const resize = () => {
        const { clientWidth, clientHeight } = container
        if (!clientWidth || !clientHeight) return

        renderer.setSize(clientWidth, clientHeight, false)
        camera.aspect = clientWidth / clientHeight
        camera.updateProjectionMatrix()
      }

      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
      resize()

      let animationFrame = 0
      const fidArrowMatrix = new THREE.Matrix4()
      const fidArrowPosition = new THREE.Vector3()
      const fidArrowDirection = new THREE.Vector3()
      const fidArrowScale = new THREE.Vector3()
      const fidArrowQuaternion = new THREE.Quaternion()
      const fidArrowAxis = new THREE.Vector3(0, 0, 1)

      const hideFidArrow = (index: number) => {
        fidArrowShafts.setMatrixAt(index, hiddenMatrix)
        fidArrowHeads.setMatrixAt(index, hiddenMatrix)
      }

      const updateFidArrows = () => {
        if (!fidArrowsDirtyRef.current) return
        fidArrowsDirtyRef.current = false

        const {
          active,
          pulseEvents,
          states,
          timeMilliseconds,
        } = fidAnimationRef.current

        if (!active || states !== renderedFidStatesRef.current) {
          renderedFidStatesRef.current.forEach((state) => {
            hideFidArrow(state.index)
          })
          renderedFidStatesRef.current = active ? states : []
        }

        if (active) {
          states.forEach((state) => {
            const magnetizationState = fidEnsembleMagnetizationStateAt(
              state,
              timeMilliseconds,
              pulseEvents,
            )

            if (!magnetizationState.excited) {
              hideFidArrow(state.index)
              return
            }

            const phase =
              VISUAL_PRECESSION_RADIANS_PER_MILLISECOND *
                timeMilliseconds +
              magnetizationState.precessionPhaseRadians

            fidArrowDirection.set(
              magnetizationState.transverseFraction * Math.cos(phase),
              magnetizationState.transverseFraction * Math.sin(phase),
              magnetizationState.longitudinalFraction,
            )
            const magnitude = Math.min(1, fidArrowDirection.length())

            if (magnitude < 1e-5) {
              hideFidArrow(state.index)
              return
            }

            fidArrowDirection.normalize()
            fidArrowQuaternion.setFromUnitVectors(
              fidArrowAxis,
              fidArrowDirection,
            )
            if (renderModeRef.current === 'stacked') {
              fidArrowPosition.set(0, 0, 0)
            } else {
              const row = Math.floor(state.index / GRID_SIZE)
              const column = state.index % GRID_SIZE
              fidArrowPosition.set(
                column * GRID_SPACING - GRID_OFFSET,
                GRID_OFFSET - row * GRID_SPACING,
                0,
              )
            }
            fidArrowScale.setScalar(magnitude)
            fidArrowMatrix.compose(
              fidArrowPosition,
              fidArrowQuaternion,
              fidArrowScale,
            )
            fidArrowShafts.setMatrixAt(state.index, fidArrowMatrix)
            fidArrowHeads.setMatrixAt(state.index, fidArrowMatrix)
          })
        }

        fidArrowShafts.instanceMatrix.needsUpdate = true
        fidArrowHeads.instanceMatrix.needsUpdate = true
      }

      const animate = (time: number) => {
        const focusTransition = focusTransitionRef.current
        if (focusTransition) {
          const progress = Math.min(
            (time - focusTransition.startedAt) / FOCUS_DURATION,
            1,
          )
          const easedProgress = smoothStep(progress)

          camera.position.lerpVectors(
            focusTransition.fromCamera,
            focusTransition.toCamera,
            easedProgress,
          )
          controls.target.lerpVectors(
            focusTransition.fromTarget,
            focusTransition.toTarget,
            easedProgress,
          )

          if (progress === 1) focusTransitionRef.current = null
        }

        updateFidArrows()
        controls.update()

        renderer.render(scene, camera)
        animationFrame = window.requestAnimationFrame(animate)
      }
      animationFrame = window.requestAnimationFrame(animate)

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() !== 'r') return
        focusTransitionRef.current = null
        camera.position.copy(
          renderModeRef.current === 'stacked'
            ? STACKED_CAMERA_POSITION
            : CAMERA_POSITION,
        )
        camera.up.set(0, 1, 0)
        controls.target.copy(CAMERA_TARGET)
        controls.update()
      }
      window.addEventListener('keydown', handleKeyDown)

      return () => {
        window.cancelAnimationFrame(animationFrame)
        window.removeEventListener('keydown', handleKeyDown)
        controls.removeEventListener('start', cancelFocusTransition)
        renderer.domElement.removeEventListener(
          'pointerdown',
          handlePointerDown,
        )
        renderer.domElement.removeEventListener('pointerup', handlePointerUp)
        resizeObserver.disconnect()
        controls.dispose()

        sphereGeometry.dispose()
        sphereMaterial.dispose()
        stackedSphereMaterial.dispose()
        arrowShaftGeometry.dispose()
        arrowHeadGeometry.dispose()
        arrowMaterial.dispose()
        fidArrowShaftGeometry.dispose()
        fidArrowHeadGeometry.dispose()
        fidArrowMaterial.dispose()
        boundaryGeometry.dispose()
        boundaryMaterial.dispose()

        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
        cameraRef.current = null
        controlsRef.current = null
        ensemblesRef.current = null
        fidArrowShaftsRef.current = null
        fidArrowHeadsRef.current = null
        modeObjectsRef.current = null
        focusTransitionRef.current = null
      }
    }, [])

    return <div className="scene-canvas" ref={containerRef} />
  },
)

export default LabScene
