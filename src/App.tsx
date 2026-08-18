import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import LabScene, {
  type EnsembleSelection,
  GRID_SIZE,
  type LabSceneHandle,
  type ReferenceFrame,
  type RenderMode,
  type SliceGraphMode,
} from './components/LabScene'
import DarkSelect from './components/DarkSelect'
import FidExperimentPanel from './components/FidExperimentPanel'
import GradientEncodingExperimentPanel from './components/GradientEncodingExperimentPanel'
import GradientRecalledEchoExperimentPanel, {
  type GradientChannelId,
} from './components/GradientRecalledEchoExperimentPanel'
import RealismMenu, {
  type RealismOptionId,
} from './components/RealismMenu'
import SimulationControls, {
  type SimulationTimeStep,
} from './components/SimulationControls'
import SpinEchoExperimentPanel from './components/SpinEchoExperimentPanel'
import TwoDimensionalGradientEncodingExperimentPanel from './components/TwoDimensionalGradientEncodingExperimentPanel'
import { useFidSimulation } from './hooks/useFidSimulation'
import { useGradientAcquisition } from './hooks/useGradientAcquisition'
import { useGradientEncodingPlayback } from './hooks/useGradientEncodingPlayback'
import {
  createBlockSimulationEnsembles,
  createHydrogenEnsembles,
  type FieldUniformity,
  PHYSICAL_CONSTANTS,
  SAMPLE_PRESETS,
  type SamplePresetId,
  type SupportedFieldStrengthTesla,
} from './models/HydrogenEnsemble'
import { simplifiedBrainSampleAt } from './presets/simplifiedBrain'
import { createFidEnsembleStates } from './simulation/fid'
import {
  calibrateRfPulseForFlipAngle,
  copyGradientPulses,
  createDefaultTransmitFrequencyBand,
  DEFAULT_ADC_PULSES,
  DEFAULT_PHASE_ENCODING_PULSES,
  DEFAULT_READOUT_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  DEFAULT_SLICE_SELECTION_PULSES,
  GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientSignalPointAt,
  type GradientPulse,
  type TransmitFrequencyBand,
} from './simulation/gradientEncoding'
import {
  createDefaultSpatialGradientProfiles,
  spatialFourierTimeWindowMilliseconds,
  spatialProjectionMaximumFieldOffsetTesla,
  type SpatialGradientProfile,
} from './simulation/spatialGradient'

type B0Tesla = '1.5' | '3' | '7'

const B0_OPTIONS: ReadonlyArray<{ id: B0Tesla; label: string }> = [
  { id: '1.5', label: '1.5' },
  { id: '3', label: '3' },
  { id: '7', label: '7' },
]
// LabScene owns a long-lived Three.js animation loop. Bump this key whenever
// the data contract consumed inside that loop changes so Vite hot reload does
// not leave an already-mounted scene running an incompatible closure.
const LAB_SCENE_RUNTIME_VERSION = 'spatial-gradient-acquisition-end-v3'
const CONTROL_PANEL_MINIMUM_WIDTH = 418
const VIEWPORT_MINIMUM_WIDTH = 320
const CONTROL_PANEL_KEYBOARD_STEP = 48
const EMPTY_GRADIENT_PULSES: ReadonlyArray<GradientPulse> = []
const SPATIAL_PROJECTION_END_TIME_MILLISECONDS =
  spatialFourierTimeWindowMilliseconds(
    spatialProjectionMaximumFieldOffsetTesla(GRID_SIZE),
  )
const DEFAULT_GRADIENT_CHANNELS_ENABLED: Readonly<
  Record<GradientChannelId, boolean>
> = {
  adc: true,
  rf: true,
  'slice-selection': true,
  'phase-encoding': true,
  readout: true,
}
const B0_TESLA_VALUES: Readonly<
  Record<B0Tesla, SupportedFieldStrengthTesla>
> = {
  '1.5': 1.5,
  '3': 3,
  '7': 7,
}
type ExperimentId =
  | 'gradient-encoding'
  | 'gradient-encoding-2d'
  | 'gradient-recalled-echo'
  | 'ping'
  | 'spin-echo'

const EXPERIMENTS: ReadonlyArray<{ id: ExperimentId; label: string }> = [
  { id: 'ping', label: 'Ping Experiment' },
  { id: 'spin-echo', label: 'Spin Echo Experiment' },
  { id: 'gradient-encoding', label: '1D Gradient Encoding Experiment' },
  { id: 'gradient-encoding-2d', label: '2D Gradient Encoding Experiment' },
  {
    id: 'gradient-recalled-echo',
    label: 'Gradient Recalled Echo Experiment',
  },
]
const RENDER_MODE_OPTIONS: ReadonlyArray<{
  id: RenderMode
  label: string
}> = [
  { id: 'slice', label: 'Slice View' },
  { id: 'block', label: 'Block View' },
  { id: 'stacked', label: 'Stacked View' },
]
const REFERENCE_FRAME_OPTIONS: ReadonlyArray<{
  id: ReferenceFrame
  label: string
}> = [
  { id: 'laboratory-slowed', label: 'Laboratory Frame (Slowed)' },
  { id: 'rotating', label: 'Rotating Frame' },
]
const SLICE_GRAPH_OPTIONS: ReadonlyArray<{
  id: SliceGraphMode
  label: string
}> = [
  { id: 'none', label: 'No 3D Graph' },
  {
    id: 'frequency-laboratory',
    label: '3D Frequency (Laboratory Frame)',
  },
  {
    id: 'frequency-rotating',
    label: '3D Frequency (Rotating Frame)',
  },
  { id: 'magnetic-field', label: '3D Magnetic Field Gradient' },
  { id: 'phase', label: '3D Phase' },
  { id: 'amplitude', label: '3D Amplitude' },
]

type TissueSamplePresetId = Exclude<SamplePresetId, 'air'>
type SlicePresetAction =
  | 'reset'
  | 'phantom-3-circles'
  | 'simplified-brain'
  | TissueSamplePresetId

const SLICE_PRESET_OPTIONS: ReadonlyArray<{
  id: SlicePresetAction
  label: string
}> = [
  { id: 'reset', label: 'Reset' },
  { id: 'phantom-3-circles', label: 'Phantom (3 circles)' },
  { id: 'simplified-brain', label: 'Simplified Brain' },
  { id: 'cortical-bone', label: 'Add Cortical bone' },
  {
    id: 'cerebrospinal-fluid',
    label: 'Add Cerebrospinal fluid (CSF)',
  },
  { id: 'gray-matter', label: 'Add Gray matter' },
  { id: 'white-matter', label: 'Add White matter' },
]

const SLICE_PRESET_RADIUS: Readonly<Record<TissueSamplePresetId, number>> = {
  'cortical-bone': 0.88,
  'cerebrospinal-fluid': 0.72,
  'gray-matter': 0.56,
  'white-matter': 0.4,
}

const PHANTOM_CIRCLE_CENTER_FRACTIONS = [0.25, 0.5, 0.75] as const
const PHANTOM_CIRCLE_RADIUS_FRACTION = 0.125

function SlicePresetMenu({
  onApply,
}: {
  onApply: (action: SlicePresetAction) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
  }, [open])

  return (
    <div className="dark-select slice-preset-select" ref={rootRef}>
      <button
        className="dark-select-trigger"
        type="button"
        aria-label="Apply slice preset"
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      >
        <span>Apply preset</span>
        <span className="select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="dark-select-options" id={listboxId} role="listbox">
          {SLICE_PRESET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                onApply(option.id)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.8 6.9A6.5 6.5 0 1 0 16.4 12h-1.8a4.8 4.8 0 1 1-.3-3.7l-2.7-.1v1.7h4.8V5.2h-1.7l.1 1.7Z" />
    </svg>
  )
}

function ScientificValue({
  value,
  significantDigits = 4,
}: {
  value: number
  significantDigits?: number
}) {
  if (value === 0) return <>0</>

  const [coefficient, rawExponent] = value
    .toExponential(significantDigits - 1)
    .split('e')
  const exponent = String(Number(rawExponent)).replace('-', '−')

  return (
    <>
      {coefficient} × 10<sup>{exponent}</sup>
    </>
  )
}

function formatRelaxationTime(value: number) {
  return value === 0 ? 0 : Number(value.toPrecision(4))
}

function App() {
  const ensembles = useMemo(() => createHydrogenEnsembles(GRID_SIZE), [])
  const sceneRef = useRef<LabSceneHandle>(null)
  const controlPanelRef = useRef<HTMLElement>(null)
  const controlPanelResizeRef = useRef<{
    pointerId: number
    startWidth: number
    startX: number
  } | null>(null)
  const experimentMenuRef = useRef<HTMLElement>(null)
  const [controlPanelWidth, setControlPanelWidth] = useState<number | null>(
    null,
  )
  const [selected, setSelected] = useState<EnsembleSelection | null>(null)
  const [ensembleRevision, setEnsembleRevision] = useState(0)
  const [b0Tesla, setB0Tesla] = useState<B0Tesla>('1.5')
  const [simulationTimeStep, setSimulationTimeStep] =
    useState<SimulationTimeStep>('2')
  const [enabledRealismOptions, setEnabledRealismOptions] = useState<
    RealismOptionId[]
  >([])
  const [renderMode, setRenderMode] = useState<RenderMode>('slice')
  const [sliceGraphMode, setSliceGraphMode] =
    useState<SliceGraphMode>('none')
  const [referenceFrame, setReferenceFrame] =
    useState<ReferenceFrame>('laboratory-slowed')
  const [experimentMenuOpen, setExperimentMenuOpen] = useState(false)
  const [selectedExperiment, setSelectedExperiment] =
    useState<ExperimentId | null>(null)
  const [phaseEncodingPulses, setPhaseEncodingPulses] = useState<
    GradientPulse[]
  >(() => copyGradientPulses(DEFAULT_PHASE_ENCODING_PULSES))
  const [adcPulses, setAdcPulses] = useState<GradientPulse[]>(() =>
    copyGradientPulses(DEFAULT_ADC_PULSES),
  )
  const [readoutPulses, setReadoutPulses] = useState<GradientPulse[]>(() =>
    copyGradientPulses(DEFAULT_READOUT_PULSES),
  )
  const [rfExcitationPulses, setRfExcitationPulses] = useState<
    GradientPulse[]
  >(() => copyGradientPulses(DEFAULT_RF_EXCITATION_PULSES))
  const [transmitFrequencyBand, setTransmitFrequencyBand] =
    useState<TransmitFrequencyBand>(() =>
      createDefaultTransmitFrequencyBand(GRID_SIZE),
    )
  const [sliceSelectionPulses, setSliceSelectionPulses] = useState<
    GradientPulse[]
  >(() => copyGradientPulses(DEFAULT_SLICE_SELECTION_PULSES))
  const [gradientChannelsEnabled, setGradientChannelsEnabled] = useState<
    Record<GradientChannelId, boolean>
  >(() => ({ ...DEFAULT_GRADIENT_CHANNELS_ENABLED }))
  const defaultSpatialGradientProfiles = useMemo(
    () => createDefaultSpatialGradientProfiles(GRID_SIZE),
    [],
  )
  const [spatialGradientXProfile, setSpatialGradientXProfile] =
    useState<SpatialGradientProfile>(defaultSpatialGradientProfiles.x)
  const [spatialGradientYProfile, setSpatialGradientYProfile] =
    useState<SpatialGradientProfile>(defaultSpatialGradientProfiles.y)
  const [spatialGradientXEnabled, setSpatialGradientXEnabled] =
    useState(true)
  const [spatialGradientYEnabled, setSpatialGradientYEnabled] =
    useState(true)
  const [
    gradientAcquisitionResetRevision,
    setGradientAcquisitionResetRevision,
  ] = useState(0)
  const selectedEnsemble = selected ? ensembles[selected.index] : null
  const fieldStrengthTesla = B0_TESLA_VALUES[b0Tesla]
  const fieldUniformity: FieldUniformity = enabledRealismOptions.includes(
    'b0-inhomogeneity',
  )
    ? 'non-uniform'
    : 'uniform'
  const intravoxelDephasing = enabledRealismOptions.includes(
    'intravoxel-dephasing',
  )
  const b1Inhomogeneity = enabledRealismOptions.includes(
    'b1-inhomogeneity',
  )
  const gradientImperfections = enabledRealismOptions.includes(
    'gradient-imperfections',
  )
  const receiverNoise = enabledRealismOptions.includes('receiver-noise')
  const tissueHeterogeneity = enabledRealismOptions.includes(
    'tissue-heterogeneity',
  )
  const simulationEnsembles = useMemo(
    () =>
      renderMode === 'block'
        ? createBlockSimulationEnsembles(ensembles)
        : ensembles,
    [ensembleRevision, ensembles, renderMode],
  )
  const magneticProperties = selectedEnsemble?.magneticProperties(
    fieldStrengthTesla,
    fieldUniformity,
  )
  const sampleProperties = selectedEnsemble?.sampleProperties(
    fieldStrengthTesla,
    tissueHeterogeneity,
  )
  const stackedEnsembleCount = useMemo(
    () =>
      ensembles.reduce(
        (count, ensemble) =>
          count + (ensemble.samplePreset === 'air' ? 0 : 1),
        0,
      ),
    [ensembleRevision, ensembles],
  )
  const simulationExperimentSelected =
    selectedExperiment === 'ping' || selectedExperiment === 'spin-echo'
  const gradientRecalledEchoExperimentSelected =
    selectedExperiment === 'gradient-recalled-echo'
  const spatialGradientExperimentSelected =
    selectedExperiment === 'gradient-encoding'
  const gradientEnsembleStates = useMemo(
    () =>
      gradientRecalledEchoExperimentSelected
        ? createFidEnsembleStates(
            simulationEnsembles,
            fieldStrengthTesla,
            fieldUniformity,
            {
              intravoxelDephasing,
              tissueHeterogeneity,
            },
          )
        : [],
    [
      ensembleRevision,
      simulationEnsembles,
      fieldStrengthTesla,
      fieldUniformity,
      gradientRecalledEchoExperimentSelected,
      intravoxelDephasing,
      tissueHeterogeneity,
    ],
  )
  const spatialGradientEnsembleStates = useMemo(
    () =>
      spatialGradientExperimentSelected
        ? createFidEnsembleStates(
            simulationEnsembles,
            fieldStrengthTesla,
            fieldUniformity,
            {
              tissueHeterogeneity,
            },
          )
        : [],
    [
      ensembleRevision,
      simulationEnsembles,
      fieldStrengthTesla,
      fieldUniformity,
      spatialGradientExperimentSelected,
      tissueHeterogeneity,
    ],
  )
  const spatialProjectionEnsembleStates = useMemo(
    () =>
      spatialGradientExperimentSelected
        ? createFidEnsembleStates(
            ensembles,
            fieldStrengthTesla,
            fieldUniformity,
            {
              includeAirEnsembles: true,
              tissueHeterogeneity,
            },
          )
        : [],
    [
      ensembleRevision,
      ensembles,
      fieldStrengthTesla,
      fieldUniformity,
      spatialGradientExperimentSelected,
      tissueHeterogeneity,
    ],
  )
  const fidSimulation = useFidSimulation({
    active: simulationExperimentSelected,
    ensembles: simulationEnsembles,
    ensembleRevision,
    fieldStrengthTesla,
    fieldUniformity,
    intravoxelDephasing,
    b1Inhomogeneity,
    receiverNoise,
    tissueHeterogeneity,
    initialPulseKind: selectedExperiment === 'spin-echo' ? '90-y' : null,
    millisecondsPerTick: Number(simulationTimeStep),
  })
  const gradientPlayback = useGradientEncodingPlayback({
    active: gradientRecalledEchoExperimentSelected,
    durationMilliseconds: GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  })
  const appliedPhaseEncodingPulses = gradientChannelsEnabled[
    'phase-encoding'
  ]
    ? phaseEncodingPulses
    : EMPTY_GRADIENT_PULSES
  const appliedReadoutPulses = gradientChannelsEnabled.readout
    ? readoutPulses
    : EMPTY_GRADIENT_PULSES
  const appliedRfExcitationPulses = gradientChannelsEnabled.rf
    ? rfExcitationPulses
    : EMPTY_GRADIENT_PULSES
  const appliedSliceSelectionPulses = gradientChannelsEnabled[
    'slice-selection'
  ]
    ? sliceSelectionPulses
    : EMPTY_GRADIENT_PULSES
  const sampleGradientSignalAt = useCallback(
    (timeMilliseconds: number) =>
      gradientSignalPointAt(
        gradientEnsembleStates,
        timeMilliseconds,
        appliedRfExcitationPulses,
        transmitFrequencyBand,
        appliedSliceSelectionPulses,
        appliedPhaseEncodingPulses,
        appliedReadoutPulses,
        GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
        gradientImperfections,
        receiverNoise,
      ),
    [
      appliedPhaseEncodingPulses,
      appliedReadoutPulses,
      appliedRfExcitationPulses,
      appliedSliceSelectionPulses,
      gradientEnsembleStates,
      gradientImperfections,
      receiverNoise,
      transmitFrequencyBand,
    ],
  )
  const gradientAcquisition = useGradientAcquisition({
    active: gradientRecalledEchoExperimentSelected,
    adcEnabled: gradientChannelsEnabled.adc,
    adcPulses,
    durationMilliseconds: GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
    resetRevision: gradientAcquisitionResetRevision,
    sampleAt: sampleGradientSignalAt,
    status: gradientPlayback.status,
    timeMilliseconds: gradientPlayback.timeMilliseconds,
  })
  const resetGradientSimulation = () => {
    gradientPlayback.reset()
    setGradientAcquisitionResetRevision((revision) => revision + 1)
  }

  useEffect(() => {
    if (!experimentMenuOpen) return

    const closeMenusOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (!experimentMenuRef.current?.contains(target)) {
        setExperimentMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeMenusOnOutsideClick)
    return () => {
      document.removeEventListener('pointerdown', closeMenusOnOutsideClick)
    }
  }, [experimentMenuOpen])

  useEffect(() => {
    if (!selected) return

    const dismissEnsembleDetails = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }

    window.addEventListener('keydown', dismissEnsembleDetails)
    return () => {
      window.removeEventListener('keydown', dismissEnsembleDetails)
    }
  }, [selected])

  const selectEnsemble = (selection: EnsembleSelection) => {
    setSelected(selection)
    setExperimentMenuOpen(false)
  }

  const changeRenderMode = (mode: RenderMode) => {
    setRenderMode(mode)
    setSelected(null)
  }

  const toggleRealismOption = (option: RealismOptionId) => {
    setEnabledRealismOptions((currentOptions) =>
      currentOptions.includes(option)
        ? currentOptions.filter((candidate) => candidate !== option)
        : [...currentOptions, option],
    )
  }

  const changeGradientChannelEnabled = (
    channel: GradientChannelId,
    enabled: boolean,
  ) => {
    setGradientChannelsEnabled((currentChannels) => ({
      ...currentChannels,
      [channel]: enabled,
    }))
  }

  const applySlicePreset = (action: SlicePresetAction) => {
    if (action === 'reset') {
      ensembles.forEach((ensemble) => {
        ensemble.samplePreset = 'air'
      })
    } else if (action === 'simplified-brain') {
      ensembles.forEach((ensemble) => {
        ensemble.samplePreset = simplifiedBrainSampleAt(
          ensemble.column,
          ensemble.row,
          ensemble.gridSize,
        )
      })
    } else if (action === 'phantom-3-circles') {
      const maximumCoordinate = GRID_SIZE - 1
      const radiusSquared =
        (GRID_SIZE * PHANTOM_CIRCLE_RADIUS_FRACTION) ** 2
      const circleCenters = PHANTOM_CIRCLE_CENTER_FRACTIONS.map(
        (fraction) => maximumCoordinate * fraction,
      )

      ensembles.forEach((ensemble) => {
        const insideCircle = circleCenters.some((circleCenter) => {
          const offsetX = ensemble.column - circleCenter
          const offsetY = ensemble.row - circleCenter
          return offsetX ** 2 + offsetY ** 2 <= radiusSquared
        })
        if (insideCircle) {
          ensemble.samplePreset = 'cerebrospinal-fluid'
        }
      })
    } else {
      const center = (GRID_SIZE - 1) / 2
      const radius = (GRID_SIZE / 2) * SLICE_PRESET_RADIUS[action]
      const radiusSquared = radius ** 2

      ensembles.forEach((ensemble) => {
        const offsetX = ensemble.column - center
        const offsetY = ensemble.row - center
        if (offsetX ** 2 + offsetY ** 2 <= radiusSquared) {
          ensemble.samplePreset = action
        }
      })
    }

    setEnsembleRevision((revision) => revision + 1)
  }

  const clampControlPanelWidth = useCallback((width: number) => {
    const maximumWidth = Math.max(
      CONTROL_PANEL_MINIMUM_WIDTH,
      window.innerWidth - VIEWPORT_MINIMUM_WIDTH,
    )
    return Math.min(maximumWidth, Math.max(CONTROL_PANEL_MINIMUM_WIDTH, width))
  }, [])

  const beginControlPanelResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0 || window.innerWidth <= 840) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    controlPanelResizeRef.current = {
      pointerId: event.pointerId,
      startWidth:
        controlPanelRef.current?.getBoundingClientRect().width ??
        CONTROL_PANEL_MINIMUM_WIDTH,
      startX: event.clientX,
    }
    document.body.classList.add('resizing-control-panel')
  }

  const continueControlPanelResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resize = controlPanelResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return

    setControlPanelWidth(
      clampControlPanelWidth(resize.startWidth + resize.startX - event.clientX),
    )
  }

  const finishControlPanelResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (controlPanelResizeRef.current?.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    controlPanelResizeRef.current = null
    document.body.classList.remove('resizing-control-panel')
  }

  const resizeControlPanelWithKeyboard = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const currentWidth =
      controlPanelWidth ??
      controlPanelRef.current?.getBoundingClientRect().width ??
      CONTROL_PANEL_MINIMUM_WIDTH
    let nextWidth: number | null = null

    if (event.key === 'ArrowLeft') {
      nextWidth = currentWidth + CONTROL_PANEL_KEYBOARD_STEP
    } else if (event.key === 'ArrowRight') {
      nextWidth = currentWidth - CONTROL_PANEL_KEYBOARD_STEP
    } else if (event.key === 'Home') {
      nextWidth = CONTROL_PANEL_MINIMUM_WIDTH
    } else if (event.key === 'End') {
      nextWidth = window.innerWidth - VIEWPORT_MINIMUM_WIDTH
    }

    if (nextWidth === null) return
    event.preventDefault()
    setControlPanelWidth(clampControlPanelWidth(nextWidth))
  }

  useEffect(() => {
    const keepControlPanelWithinViewport = () => {
      setControlPanelWidth((currentWidth) =>
        currentWidth === null
          ? null
          : clampControlPanelWidth(currentWidth),
      )
    }

    window.addEventListener('resize', keepControlPanelWithinViewport)
    return () => {
      window.removeEventListener('resize', keepControlPanelWithinViewport)
      document.body.classList.remove('resizing-control-panel')
    }
  }, [clampControlPanelWidth])

  return (
    <main
      className="lab-shell"
      style={
        controlPanelWidth === null
          ? undefined
          : ({
              '--control-panel-width': `${controlPanelWidth}px`,
            } as CSSProperties)
      }
    >
      <header className="global-toolbar">
        <div className="slice-preset-control">
          <SlicePresetMenu onApply={applySlicePreset} />
        </div>

        <div className="b0-control">
          <span className="b0-label">
            B<sub>0</sub> <small>Tesla</small>
          </span>
          <DarkSelect
            className="b0-select"
            ariaLabel="B zero field strength in tesla"
            value={b0Tesla}
            options={B0_OPTIONS}
            onChange={setB0Tesla}
          />
        </div>

        <RealismMenu
          enabledOptions={enabledRealismOptions}
          onToggle={toggleRealismOption}
        />
      </header>

      <section
        className="viewport-panel"
        aria-label={
          renderMode === 'stacked'
            ? 'Stacked hydrogen ensemble magnetization'
            : renderMode === 'block'
              ? 'Cutaway hydrogen ensemble block'
              : 'Hydrogen ensemble grid'
        }
      >
        <LabScene
          key={LAB_SCENE_RUNTIME_VERSION}
          ref={sceneRef}
          ensembleModels={ensembles}
          ensembleRevision={ensembleRevision}
          fieldStrengthTesla={fieldStrengthTesla}
          fieldUniformity={fieldUniformity}
          fidEnsembleStates={fidSimulation.ensembleStates}
          fidSimulationActive={
            simulationExperimentSelected && fidSimulation.status !== 'idle'
          }
          fidPulseEvents={fidSimulation.pulseEvents}
          fidSimulationTimeMilliseconds={fidSimulation.timeMilliseconds}
          gradientEncodingActive={
            gradientRecalledEchoExperimentSelected &&
            gradientPlayback.status !== 'idle'
          }
          gradientEncodingSelected={gradientRecalledEchoExperimentSelected}
          gradientEncodingEnsembleStates={gradientEnsembleStates}
          gradientImperfections={gradientImperfections}
          gradientEncodingTimeMilliseconds={
            gradientPlayback.timeMilliseconds
          }
          gradientPhaseEncodingPulses={appliedPhaseEncodingPulses}
          gradientReadoutPulses={appliedReadoutPulses}
          gradientRfExcitationPulses={appliedRfExcitationPulses}
          gradientTransmitFrequencyBand={transmitFrequencyBand}
          gradientSliceSelectionPulses={appliedSliceSelectionPulses}
          spatialGradientActive={spatialGradientExperimentSelected}
          spatialGradientEnsembleStates={spatialGradientEnsembleStates}
          spatialGradientTimeMilliseconds={
            SPATIAL_PROJECTION_END_TIME_MILLISECONDS
          }
          spatialGradientXEnabled={spatialGradientXEnabled}
          spatialGradientXProfile={spatialGradientXProfile}
          spatialGradientYEnabled={spatialGradientYEnabled}
          spatialGradientYProfile={spatialGradientYProfile}
          referenceFrame={referenceFrame}
          renderMode={renderMode}
          sliceGraphMode={sliceGraphMode}
          selected={selected}
          onSelect={selectEnsemble}
        />

        <header className="viewport-header">
          <div>
            <span className="overline">
              {renderMode === 'stacked'
                ? 'Phase domain'
                : renderMode === 'block'
                  ? 'Volumetric domain'
                  : 'Spatial domain'}
            </span>
            <strong>
              {renderMode === 'stacked'
                ? 'STACKED ENSEMBLES'
                : renderMode === 'block'
                  ? 'CUTAWAY BLOCK'
                  : 'ENSEMBLE SLICE'}
            </strong>
          </div>
          <div className="slice-size">
            {renderMode === 'stacked' ? (
              <>
                <span>
                  {(spatialGradientExperimentSelected
                    ? spatialGradientEnsembleStates.length
                    : stackedEnsembleCount
                  ).toLocaleString()} vectors
                </span>
                <small>Spatial positions collapsed</small>
              </>
            ) : renderMode === 'block' ? (
              <>
                <span>{GRID_SIZE} × {GRID_SIZE} × {GRID_SIZE}</span>
                <small>
                  {simulationEnsembles.length.toLocaleString()} simulated
                  surface ensembles
                </small>
                <small>1 ensemble = 1 mm³</small>
              </>
            ) : (
              <>
                <span>{GRID_SIZE} × {GRID_SIZE}</span>
                <small>
                  {(GRID_SIZE * GRID_SIZE).toLocaleString()} ensembles
                </small>
                <small>1 ensemble = 1 mm³</small>
              </>
            )}
          </div>
        </header>

        <div className="viewport-footer">
          <div className="viewport-controls">
            <button
              className="viewport-reset"
              type="button"
              title="Reset camera (R)"
              aria-label="Reset camera"
              onClick={() => sceneRef.current?.resetCamera()}
            >
              <ResetIcon />
              <span>Reset camera</span>
              <kbd>R</kbd>
            </button>
            <DarkSelect
              className="viewport-mode-select"
              ariaLabel="Viewport rendering mode"
              value={renderMode}
              options={RENDER_MODE_OPTIONS}
              onChange={changeRenderMode}
            />
            {renderMode === 'slice' && (
              <DarkSelect
                className="slice-graph-select"
                ariaLabel="Slice 3D graph"
                value={sliceGraphMode}
                options={SLICE_GRAPH_OPTIONS}
                onChange={setSliceGraphMode}
              />
            )}
            <DarkSelect
              className="reference-frame-select"
              ariaLabel="Magnetization reference frame"
              value={referenceFrame}
              options={REFERENCE_FRAME_OPTIONS}
              onChange={setReferenceFrame}
            />
          </div>
          <p>Drag to orbit · Scroll to zoom · Right-drag to pan</p>
        </div>
      </section>

      <aside className="control-panel" ref={controlPanelRef}>
        <div
          className="control-panel-resizer"
          role="separator"
          tabIndex={0}
          aria-label="Resize control panel"
          aria-orientation="vertical"
          aria-valuemin={CONTROL_PANEL_MINIMUM_WIDTH}
          aria-valuemax={
            typeof window === 'undefined'
              ? CONTROL_PANEL_MINIMUM_WIDTH
              : Math.max(
                  CONTROL_PANEL_MINIMUM_WIDTH,
                  window.innerWidth - VIEWPORT_MINIMUM_WIDTH,
                )
          }
          aria-valuenow={controlPanelWidth ?? undefined}
          aria-valuetext={
            controlPanelWidth === null
              ? 'Default width'
              : `${Math.round(controlPanelWidth)} pixels`
          }
          title="Drag to resize · Double-click to restore"
          onDoubleClick={() => setControlPanelWidth(null)}
          onKeyDown={resizeControlPanelWithKeyboard}
          onPointerCancel={finishControlPanelResize}
          onPointerDown={beginControlPanelResize}
          onPointerMove={continueControlPanelResize}
          onPointerUp={finishControlPanelResize}
        />
        <header className="experiment-menu" ref={experimentMenuRef}>
          <button
            className="experiment-trigger"
            type="button"
            aria-haspopup="listbox"
            aria-controls="experiment-options"
            aria-expanded={experimentMenuOpen}
            onClick={() => setExperimentMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setExperimentMenuOpen(false)
            }}
          >
            <span>
              {EXPERIMENTS.find(
                (experiment) => experiment.id === selectedExperiment,
              )?.label ?? 'Select Experiment'}
            </span>
            <span className="select-chevron" aria-hidden="true" />
          </button>

          {experimentMenuOpen && (
            <div
              className="experiment-options"
              id="experiment-options"
              role="listbox"
            >
              {EXPERIMENTS.map((experiment) => (
                <button
                  key={experiment.id}
                  type="button"
                  role="option"
                  aria-selected={selectedExperiment === experiment.id}
                  onClick={() => {
                    setSelectedExperiment(experiment.id)
                    setSelected(null)
                    setExperimentMenuOpen(false)
                  }}
                >
                  {experiment.label}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="panel-content">
          <div
            className="active-experiment-view panel-section-grid"
            hidden={selected !== null}
          >
            {simulationExperimentSelected && (
              <SimulationControls
                activeEnsembleCount={fidSimulation.ensembleStates.length}
                emptyMessage="Apply a non-air sample preset to the slice before starting the experiment."
                pulseAriaLabel={
                  selectedExperiment === 'spin-echo'
                    ? 'Apply a 180 degree refocusing pulse'
                    : 'Apply a 90 degree flip pulse'
                }
                pulseSymbol={
                  selectedExperiment === 'spin-echo' ? '∿↔' : '∿⊥'
                }
                pulseTitle={
                  selectedExperiment === 'spin-echo'
                    ? 'Apply a 180° refocusing pulse'
                    : 'Apply a 90° flip pulse'
                }
                status={fidSimulation.status}
                timeStep={simulationTimeStep}
                timeMilliseconds={fidSimulation.timeMilliseconds}
                onPause={fidSimulation.pause}
                onPulse={() =>
                  fidSimulation.applyPulse(
                    selectedExperiment === 'spin-echo' ? '180-x' : '90-y',
                  )
                }
                onReset={fidSimulation.reset}
                onStart={fidSimulation.start}
                onTimeStepChange={setSimulationTimeStep}
              />
            )}

            {selectedExperiment === 'ping' && (
              <FidExperimentPanel
                graphWindowEndMilliseconds={
                  fidSimulation.graphWindowEndMilliseconds
                }
                graphWindowStartMilliseconds={
                  fidSimulation.graphWindowStartMilliseconds
                }
                signalPoints={fidSimulation.signalPoints}
                timeStepMilliseconds={Number(simulationTimeStep)}
              />
            )}

            {selectedExperiment === 'spin-echo' && (
              <SpinEchoExperimentPanel
                graphWindowEndMilliseconds={
                  fidSimulation.graphWindowEndMilliseconds
                }
                graphWindowStartMilliseconds={
                  fidSimulation.graphWindowStartMilliseconds
                }
                pulseEvents={fidSimulation.pulseEvents}
                signalPoints={fidSimulation.signalPoints}
                timeMilliseconds={fidSimulation.timeMilliseconds}
                timeStepMilliseconds={Number(simulationTimeStep)}
              />
            )}

            {selectedExperiment === 'gradient-encoding' && (
              <GradientEncodingExperimentPanel
                ensembleStates={spatialProjectionEnsembleStates}
                fieldOfViewMillimeters={GRID_SIZE}
                xEnabled={spatialGradientXEnabled}
                xProfile={spatialGradientXProfile}
                yEnabled={spatialGradientYEnabled}
                yProfile={spatialGradientYProfile}
                onXEnabledChange={setSpatialGradientXEnabled}
                onXProfileChange={setSpatialGradientXProfile}
                onYEnabledChange={setSpatialGradientYEnabled}
                onYProfileChange={setSpatialGradientYProfile}
              />
            )}

            {selectedExperiment === 'gradient-encoding-2d' && (
              <TwoDimensionalGradientEncodingExperimentPanel
                gridSize={GRID_SIZE}
              />
            )}

            {selectedExperiment === 'gradient-recalled-echo' && (
              <GradientRecalledEchoExperimentPanel
                adcAcquisitionRuns={gradientAcquisition.acquisitionRuns}
                adcPulses={adcPulses}
                adcSignalPoints={gradientAcquisition.currentSignalPoints}
                durationMilliseconds={
                  GRADIENT_SEQUENCE_DURATION_MILLISECONDS
                }
                enabledChannels={gradientChannelsEnabled}
                gradientImperfections={gradientImperfections}
                gridSize={GRID_SIZE}
                phaseEncodingPulses={phaseEncodingPulses}
                readoutPulses={readoutPulses}
                rfExcitationPulses={rfExcitationPulses}
                sliceSelectionPulses={sliceSelectionPulses}
                speed={gradientPlayback.speed}
                status={gradientPlayback.status}
                timeMilliseconds={gradientPlayback.timeMilliseconds}
                onPause={gradientPlayback.pause}
                onAdcPulsesChange={setAdcPulses}
                onAdcReset={() =>
                  setAdcPulses(copyGradientPulses(DEFAULT_ADC_PULSES))
                }
                onChannelEnabledChange={changeGradientChannelEnabled}
                onRfExcitationPulsesChange={setRfExcitationPulses}
                transmitFrequencyBand={transmitFrequencyBand}
                onRfExcitationReset={() =>
                  setRfExcitationPulses(
                    DEFAULT_RF_EXCITATION_PULSES.map((pulse) =>
                      calibrateRfPulseForFlipAngle(
                        { ...pulse, amplitude: 1 },
                        transmitFrequencyBand,
                      ),
                    ),
                  )
                }
                onPhaseEncodingPulsesChange={setPhaseEncodingPulses}
                onPhaseEncodingReset={() =>
                  setPhaseEncodingPulses(
                    copyGradientPulses(DEFAULT_PHASE_ENCODING_PULSES),
                  )
                }
                onReadoutPulsesChange={setReadoutPulses}
                onReadoutReset={() =>
                  setReadoutPulses(
                    copyGradientPulses(DEFAULT_READOUT_PULSES),
                  )
                }
                onSliceSelectionPulsesChange={setSliceSelectionPulses}
                onSliceSelectionReset={() =>
                  setSliceSelectionPulses(
                    copyGradientPulses(DEFAULT_SLICE_SELECTION_PULSES),
                  )
                }
                onTransmitFrequencyBandChange={setTransmitFrequencyBand}
                onTransmitFrequencyBandReset={() =>
                  setTransmitFrequencyBand(
                    createDefaultTransmitFrequencyBand(GRID_SIZE),
                  )
                }
                onSimulationReset={resetGradientSimulation}
                onSpeedChange={gradientPlayback.setSpeed}
                onStart={gradientPlayback.start}
              />
            )}
          </div>

          {selected &&
            selectedEnsemble &&
            magneticProperties &&
            sampleProperties && (
            <div className="ensemble-details-view panel-section-grid">
              <section className="selection-section" aria-live="polite">
                <div className="section-heading">
                  <div>
                    <span className="section-index">01</span>
                    <h2>Static nuclear properties</h2>
                  </div>
                  <button
                    className="ensemble-details-close"
                    type="button"
                    title="Close ensemble details (Escape)"
                    aria-label="Close ensemble details"
                    onClick={() => setSelected(null)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>

                <div className="nucleus-card">
                  <div
                    className="nucleus-symbol"
                    aria-label={selectedEnsemble.nucleus}
                  >
                    <sup>1</sup>H
                  </div>
                  <div>
                    <strong>Proton ensemble</strong>
                    <span className="nucleus-subtitle">
                      {selectedEnsemble.nucleusName} ·{' '}
                      {selectedEnsemble.volumeCubicMillimeters} mm³
                    </span>
                  </div>
                  <span className="cell-badge">
                    SELECTED {String(selectedEnsemble.column + 1).padStart(3, '0')}:
                    {String(selectedEnsemble.row + 1).padStart(3, '0')}
                  </span>
                </div>

                <dl className="property-list">
                  <div>
                    <dt>Total nuclear spin</dt>
                    <dd className="formula chalk-yellow spin-value">
                      <span>I =</span>
                      <span className="stacked-fraction" aria-label="one half">
                        <span>1</span>
                        <span>2</span>
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Possible spin projections</dt>
                    <dd className="formula chalk-pink">
                      2I + 1 = {selectedEnsemble.possibleSpinProjectionCount}
                    </dd>
                  </div>
                  <div className="gamma-property">
                    <dt>Gyromagnetic ratio</dt>
                    <dd>
                      <span className="formula chalk-green">
                        γ ≈{' '}
                        <ScientificValue
                          value={selectedEnsemble.gyromagneticRatio}
                        />
                      </span>
                      <small>rad · s⁻¹ · T⁻¹</small>
                    </dd>
                  </div>
                  <div className="constant-property">
                    <dt>Planck constant</dt>
                    <dd>
                      <span className="formula chalk-cyan">
                        h ≈{' '}
                        <ScientificValue
                          value={PHYSICAL_CONSTANTS.planckConstant}
                        />
                      </span>
                      <small>J · s</small>
                    </dd>
                  </div>
                  <div className="constant-property">
                    <dt>Dirac constant</dt>
                    <dd>
                      <span className="formula chalk-yellow">
                        ℏ = h/2π ≈{' '}
                        <ScientificValue
                          value={PHYSICAL_CONSTANTS.diracConstant}
                        />
                      </span>
                      <small>J · s</small>
                    </dd>
                  </div>
                  <div className="constant-property">
                    <dt>Boltzmann constant</dt>
                    <dd>
                      <span className="formula chalk-green">
                        k<sub>B</sub> ≈{' '}
                        <ScientificValue
                          value={PHYSICAL_CONSTANTS.boltzmannConstant}
                        />
                      </span>
                      <small>J · K⁻¹</small>
                    </dd>
                  </div>
                  <div className="derived-property">
                    <dt>Magnetic moment</dt>
                    <dd>
                      <span className="formula chalk-coral">
                        μ = γℏI ≈{' '}
                        <ScientificValue value={selectedEnsemble.magneticMoment} />
                      </span>
                      <small>J · T⁻¹</small>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="magnetic-section">
                <div className="section-heading">
                  <div>
                    <span className="section-index">02</span>
                    <h2>Magnetic ensemble properties</h2>
                  </div>
                </div>

                <dl className="property-list magnetic-property-list">
                  <div className="computed-property">
                    <dt>Applied field</dt>
                    <dd>
                      <span className="formula chalk-cyan">
                        B′<sub>0</sub> = B<sub>0</sub> + ΔB ≈{' '}
                        {Number(
                          magneticProperties.fieldStrengthTesla.toPrecision(9),
                        )}
                      </span>
                      <small>T</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>B₀ angular deviation</dt>
                    <dd>
                      <span className="formula chalk-green">
                        Δθ ≈{' '}
                        <ScientificValue
                          value={
                            (magneticProperties.tiltAngleRadians * 180) /
                            Math.PI
                          }
                          significantDigits={3}
                        />
                      </span>
                      <small>degrees from the nominal B₀ direction</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Larmor angular frequency</dt>
                    <dd>
                      <span className="formula chalk-yellow">
                        ω<sub>0</sub> = γB′<sub>0</sub> ≈{' '}
                        <ScientificValue
                          value={magneticProperties.larmorAngularFrequency}
                        />
                      </span>
                      <small>rad · s⁻¹</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Larmor angular frequency variation</dt>
                    <dd>
                      <span className="formula chalk-coral">
                        Δω<sub>0</sub> = γΔB ≈{' '}
                        <ScientificValue
                          value={
                            magneticProperties.larmorAngularFrequencyVariation
                          }
                        />
                      </span>
                      <small>rad · s⁻¹</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Larmor frequency</dt>
                    <dd>
                      <span className="formula chalk-pink">
                        f<sub>0</sub> = ω<sub>0</sub>/2π ≈{' '}
                        {(magneticProperties.larmorFrequencyHertz / 1e6).toFixed(
                          3,
                        )}
                      </span>
                      <small>MHz</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Zeeman energy splitting</dt>
                    <dd>
                      <span className="formula chalk-green">
                        ΔE = ℏω<sub>0</sub> ≈{' '}
                        <ScientificValue
                          value={magneticProperties.zeemanEnergySplitting}
                        />
                      </span>
                      <small>J</small>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="sample-section">
                <div className="section-heading">
                  <div>
                    <span className="section-index">03</span>
                    <h2>Sample properties</h2>
                  </div>
                </div>

                <div className="sample-preset-control">
                  <span>Sample preset</span>
                  <DarkSelect
                    className="sample-preset-select"
                    ariaLabel="Sample preset"
                    value={selectedEnsemble.samplePreset}
                    options={SAMPLE_PRESETS}
                    onChange={(preset: SamplePresetId) => {
                      selectedEnsemble.samplePreset = preset
                      setEnsembleRevision((revision) => revision + 1)
                    }}
                  />
                </div>

                <dl className="property-list sample-property-list">
                  <div className="computed-property">
                    <dt>Temperature</dt>
                    <dd>
                      <span className="formula chalk-coral">
                        T = {sampleProperties.temperatureKelvin}
                      </span>
                      <small>
                        K · ({sampleProperties.temperatureCelsius} °C)
                      </small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Longitudinal relaxation time</dt>
                    <dd>
                      <span className="formula chalk-pink">
                        T<sub>1</sub> ≈{' '}
                        {formatRelaxationTime(
                          sampleProperties.longitudinalRelaxationTimeMilliseconds,
                        )}
                      </span>
                      <small>ms</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Transverse relaxation time</dt>
                    <dd>
                      <span className="formula chalk-yellow">
                        T<sub>2</sub> ≈{' '}
                        {formatRelaxationTime(
                          sampleProperties.transverseRelaxationTimeMilliseconds,
                        )}
                      </span>
                      <small>ms</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Total proton density</dt>
                    <dd>
                      <span className="formula chalk-cyan">
                        N<sub>total</sub> ={' '}
                        <ScientificValue
                          value={sampleProperties.totalProtonCount}
                          significantDigits={2}
                        />
                      </span>
                      <small>protons per 1 mm³ ensemble</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Polarization</dt>
                    <dd>
                      <span className="formula chalk-cyan">
                        P = tanh(ℏγB<sub>0</sub> / 2k<sub>B</sub>T) ≈{' '}
                        <ScientificValue value={magneticProperties.polarization} />
                      </span>
                      <small>dimensionless</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Excess density</dt>
                    <dd>
                      <span className="formula chalk-green">
                        N = N<sub>total</sub> × P ≈{' '}
                        <ScientificValue
                          value={magneticProperties.excessProtonCount}
                        />
                      </span>
                      <small>excess protons per 1 mm³ ensemble</small>
                    </dd>
                  </div>
                  <div className="computed-property">
                    <dt>Boltzmann magnetization</dt>
                    <dd>
                      <span className="formula chalk-yellow">
                        M<sub>0</sub> = μN ≈{' '}
                        <ScientificValue
                          value={magneticProperties.boltzmannMagnetization}
                        />
                      </span>
                      <small>J · T⁻¹ per 1 mm³ ensemble</small>
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </div>
      </aside>
    </main>
  )
}

export default App
