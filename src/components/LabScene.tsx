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
import { NON_UNIFORM_FIELD_MODEL } from '../models/HydrogenEnsemble'
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
const STACKED_ARROW_WIDTH_SCALE = 0.24
const STACKED_ARROW_LENGTH_SCALE = 0.82
const B1_PULSE_VISIBILITY_MILLISECONDS = 700
const B1_ARROW_WIDTH_SCALE = 0.45
const FID_FIELD_VARIATION_PALETTE = [
  new THREE.Color('#32e6ff'),
  new THREE.Color('#4f7dff'),
  new THREE.Color('#a855f7'),
  new THREE.Color('#ff4fbc'),
  new THREE.Color('#ffd166'),
] as const
const FOCUS_DURATION = 650

interface FocusTransition {
  fromCamera: THREE.Vector3
  toCamera: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  startedAt: number
}

interface B1PulseVisualization {
  pulseEvent: RfPulseEvent
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
      b1ArrowHeads: THREE.InstancedMesh
      b1ArrowShafts: THREE.InstancedMesh
      ensembles: THREE.InstancedMesh
      fieldArrowHeads: THREE.InstancedMesh
      fieldArrowShafts: THREE.InstancedMesh
      fidArrowMaterial: THREE.MeshBasicMaterial
      stackedFieldArrowHead: THREE.Mesh
      stackedFieldArrowShaft: THREE.Mesh
      stackedB1ArrowHead: THREE.Mesh
      stackedB1ArrowShaft: THREE.Mesh
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
    const b1PulseVisualizationRef =
      useRef<B1PulseVisualization | null>(null)
    const observedPulseCountRef = useRef(fidPulseEvents.length)
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
      const previousPulseCount = observedPulseCountRef.current
      observedPulseCountRef.current = fidPulseEvents.length

      if (fidPulseEvents.length === 0) {
        b1PulseVisualizationRef.current = null
        const modeObjects = modeObjectsRef.current
        if (modeObjects) {
          modeObjects.b1ArrowHeads.visible = false
          modeObjects.b1ArrowShafts.visible = false
          modeObjects.stackedB1ArrowHead.visible = false
          modeObjects.stackedB1ArrowShaft.visible = false
        }
      } else if (fidPulseEvents.length > previousPulseCount) {
        b1PulseVisualizationRef.current = {
          pulseEvent: fidPulseEvents[fidPulseEvents.length - 1],
          startedAt: performance.now(),
        }
      }

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
        color: '#ffffff',
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

      const b1ArrowMaterial = new THREE.MeshBasicMaterial({
        color: '#ff7866',
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.92,
        toneMapped: false,
      })
      const b1ArrowShafts = new THREE.InstancedMesh(
        arrowShaftGeometry,
        b1ArrowMaterial,
        GRID_SIZE * GRID_SIZE,
      )
      const b1ArrowHeads = new THREE.InstancedMesh(
        arrowHeadGeometry,
        b1ArrowMaterial,
        GRID_SIZE * GRID_SIZE,
      )
      const stackedB1ArrowShaft = new THREE.Mesh(
        arrowShaftGeometry,
        b1ArrowMaterial,
      )
      const stackedB1ArrowHead = new THREE.Mesh(
        arrowHeadGeometry,
        b1ArrowMaterial,
      )
      b1ArrowShafts.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      b1ArrowHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      b1ArrowShafts.frustumCulled = false
      b1ArrowHeads.frustumCulled = false
      b1ArrowShafts.renderOrder = 20
      b1ArrowHeads.renderOrder = 20
      stackedB1ArrowShaft.renderOrder = 20
      stackedB1ArrowHead.renderOrder = 20
      stackedB1ArrowShaft.scale.set(
        B1_ARROW_WIDTH_SCALE,
        B1_ARROW_WIDTH_SCALE,
        1,
      )
      stackedB1ArrowHead.scale.set(
        B1_ARROW_WIDTH_SCALE,
        B1_ARROW_WIDTH_SCALE,
        1,
      )
      b1ArrowShafts.visible = false
      b1ArrowHeads.visible = false
      stackedB1ArrowShaft.visible = false
      stackedB1ArrowHead.visible = false
      scene.add(
        b1ArrowShafts,
        b1ArrowHeads,
        stackedB1ArrowShaft,
        stackedB1ArrowHead,
      )

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
        b1ArrowHeads,
        b1ArrowShafts,
        ensembles,
        fieldArrowHeads: arrowHeads,
        fieldArrowShafts: arrowShafts,
        fidArrowMaterial,
        stackedFieldArrowHead,
        stackedFieldArrowShaft,
        stackedB1ArrowHead,
        stackedB1ArrowShaft,
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
      const fidArrowColor = new THREE.Color()
      const fidArrowHsl = { h: 0, s: 0, l: 0 }
      const b1ArrowMatrix = new THREE.Matrix4()
      const b1ArrowPosition = new THREE.Vector3()
      const b1ArrowDirection = new THREE.Vector3()
      const b1ArrowQuaternion = new THREE.Quaternion()
      const b1ArrowLocalDirection = new THREE.Vector3(0, 0, 1)
      const b1ArrowScale = new THREE.Vector3(
        B1_ARROW_WIDTH_SCALE,
        B1_ARROW_WIDTH_SCALE,
        1,
      )
      let renderedB1PulseStartedAt = -1

      const hideFidArrow = (index: number) => {
        fidArrowShafts.setMatrixAt(index, hiddenMatrix)
        fidArrowHeads.setMatrixAt(index, hiddenMatrix)
      }

      const updateFidArrowColors = (
        states: ReadonlyArray<FidEnsembleState>,
      ) => {
        states.forEach((state) => {
          const fieldVariationFraction = Math.sqrt(
            THREE.MathUtils.clamp(
              Math.abs(state.fieldVariationPpm) /
                NON_UNIFORM_FIELD_MODEL.maximumVariationPpm,
              0,
              1,
            ),
          )
          const tiltFraction = THREE.MathUtils.clamp(
            THREE.MathUtils.radToDeg(state.fieldTiltAngleRadians) /
              NON_UNIFORM_FIELD_MODEL.maximumOffParallelDegrees,
            0,
            1,
          )

          const palettePosition =
            fieldVariationFraction *
            (FID_FIELD_VARIATION_PALETTE.length - 1)
          const lowerColorIndex = Math.floor(palettePosition)
          const upperColorIndex = Math.min(
            lowerColorIndex + 1,
            FID_FIELD_VARIATION_PALETTE.length - 1,
          )
          fidArrowColor.lerpColors(
            FID_FIELD_VARIATION_PALETTE[lowerColorIndex],
            FID_FIELD_VARIATION_PALETTE[upperColorIndex],
            palettePosition - lowerColorIndex,
          )
          fidArrowColor.getHSL(fidArrowHsl)
          fidArrowColor.setHSL(
            fidArrowHsl.h,
            fidArrowHsl.s,
            THREE.MathUtils.clamp(
              fidArrowHsl.l + tiltFraction * 0.16,
              0,
              0.84,
            ),
          )
          fidArrowShafts.setColorAt(state.index, fidArrowColor)
          fidArrowHeads.setColorAt(state.index, fidArrowColor)
        })

        if (fidArrowShafts.instanceColor) {
          fidArrowShafts.instanceColor.needsUpdate = true
        }
        if (fidArrowHeads.instanceColor) {
          fidArrowHeads.instanceColor.needsUpdate = true
        }
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
          if (active) updateFidArrowColors(states)
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

            const phase = magnetizationState.precessionPhaseRadians

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
            if (renderModeRef.current === 'stacked') {
              fidArrowScale.set(
                magnitude * STACKED_ARROW_WIDTH_SCALE,
                magnitude * STACKED_ARROW_WIDTH_SCALE,
                magnitude * STACKED_ARROW_LENGTH_SCALE,
              )
            } else {
              fidArrowScale.setScalar(magnitude)
            }
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

      const hideB1PulseArrows = () => {
        b1ArrowShafts.visible = false
        b1ArrowHeads.visible = false
        stackedB1ArrowShaft.visible = false
        stackedB1ArrowHead.visible = false
      }

      const updateB1PulseArrows = (time: number) => {
        const visualization = b1PulseVisualizationRef.current
        if (!visualization) {
          hideB1PulseArrows()
          return
        }

        const progress =
          (time - visualization.startedAt) /
          B1_PULSE_VISIBILITY_MILLISECONDS
        if (progress >= 1) {
          hideB1PulseArrows()
          b1PulseVisualizationRef.current = null
          return
        }

        const pulseAxisPhase =
          visualization.pulseEvent.kind === '90-y' ? Math.PI / 2 : 0
        b1ArrowDirection.set(
          Math.cos(pulseAxisPhase),
          Math.sin(pulseAxisPhase),
          0,
        )
        b1ArrowQuaternion.setFromUnitVectors(
          b1ArrowLocalDirection,
          b1ArrowDirection,
        )

        if (renderedB1PulseStartedAt !== visualization.startedAt) {
          let b1ArrowIndex = 0
          for (let row = 0; row < GRID_SIZE; row += 1) {
            for (let column = 0; column < GRID_SIZE; column += 1) {
              b1ArrowPosition.set(
                column * GRID_SPACING - GRID_OFFSET,
                GRID_OFFSET - row * GRID_SPACING,
                0,
              )
              b1ArrowMatrix.compose(
                b1ArrowPosition,
                b1ArrowQuaternion,
                b1ArrowScale,
              )
              b1ArrowShafts.setMatrixAt(b1ArrowIndex, b1ArrowMatrix)
              b1ArrowHeads.setMatrixAt(b1ArrowIndex, b1ArrowMatrix)
              b1ArrowIndex += 1
            }
          }
          b1ArrowShafts.instanceMatrix.needsUpdate = true
          b1ArrowHeads.instanceMatrix.needsUpdate = true
          stackedB1ArrowShaft.quaternion.copy(b1ArrowQuaternion)
          stackedB1ArrowHead.quaternion.copy(b1ArrowQuaternion)
          renderedB1PulseStartedAt = visualization.startedAt
        }

        const fadeProgress = Math.max(0, (progress - 0.55) / 0.45)
        b1ArrowMaterial.opacity = 0.92 * (1 - smoothStep(fadeProgress))
        const stacked = renderModeRef.current === 'stacked'
        b1ArrowShafts.visible = !stacked
        b1ArrowHeads.visible = !stacked
        stackedB1ArrowShaft.visible = stacked
        stackedB1ArrowHead.visible = stacked
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
        updateB1PulseArrows(time)

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
        b1ArrowMaterial.dispose()
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
        b1PulseVisualizationRef.current = null
      }
    }, [])

    return <div className="scene-canvas" ref={containerRef} />
  },
)

export default LabScene
