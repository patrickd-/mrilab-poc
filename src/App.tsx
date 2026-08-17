import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
import RealismMenu, {
  type RealismOptionId,
} from './components/RealismMenu'
import SimulationControls, {
  type SimulationTimeStep,
} from './components/SimulationControls'
import SpinEchoExperimentPanel from './components/SpinEchoExperimentPanel'
import { useFidSimulation } from './hooks/useFidSimulation'
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
import { createFidEnsembleStates } from './simulation/fid'
import {
  copyGradientPulses,
  DEFAULT_PHASE_ENCODING_PULSES,
  DEFAULT_READOUT_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  DEFAULT_SLICE_SELECTION_PULSES,
  GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  type GradientPulse,
} from './simulation/gradientEncoding'

type B0Tesla = '1.5' | '3' | '7'

const B0_OPTIONS: ReadonlyArray<{ id: B0Tesla; label: string }> = [
  { id: '1.5', label: '1.5' },
  { id: '3', label: '3' },
  { id: '7', label: '7' },
]
const B0_TESLA_VALUES: Readonly<
  Record<B0Tesla, SupportedFieldStrengthTesla>
> = {
  '1.5': 1.5,
  '3': 3,
  '7': 7,
}
type ExperimentId = 'gradient-encoding' | 'ping' | 'spin-echo'

const EXPERIMENTS: ReadonlyArray<{ id: ExperimentId; label: string }> = [
  { id: 'ping', label: 'Ping Experiment' },
  { id: 'spin-echo', label: 'Spin Echo Experiment' },
  { id: 'gradient-encoding', label: 'Gradient Encoding Experiment' },
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
  { id: 'phase', label: '3D Phase' },
  { id: 'amplitude', label: '3D Amplitude' },
]

type TissueSamplePresetId = Exclude<SamplePresetId, 'air'>
type SlicePresetAction = 'reset' | TissueSamplePresetId

const SLICE_PRESET_OPTIONS: ReadonlyArray<{
  id: SlicePresetAction
  label: string
}> = [
  { id: 'reset', label: 'Reset' },
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
  const experimentMenuRef = useRef<HTMLElement>(null)
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
  const [readoutPulses, setReadoutPulses] = useState<GradientPulse[]>(() =>
    copyGradientPulses(DEFAULT_READOUT_PULSES),
  )
  const [rfExcitationPulses, setRfExcitationPulses] = useState<
    GradientPulse[]
  >(() => copyGradientPulses(DEFAULT_RF_EXCITATION_PULSES))
  const [rfFrequencyOffsetKilohertz, setRfFrequencyOffsetKilohertz] =
    useState(0)
  const [sliceSelectionPulses, setSliceSelectionPulses] = useState<
    GradientPulse[]
  >(() => copyGradientPulses(DEFAULT_SLICE_SELECTION_PULSES))
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
  const gradientExperimentSelected =
    selectedExperiment === 'gradient-encoding'
  const gradientEnsembleStates = useMemo(
    () =>
      gradientExperimentSelected
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
      gradientExperimentSelected,
      intravoxelDephasing,
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
    active: gradientExperimentSelected,
    durationMilliseconds: GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  })

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

  const applySlicePreset = (action: SlicePresetAction) => {
    if (action === 'reset') {
      ensembles.forEach((ensemble) => {
        ensemble.samplePreset = 'air'
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

  return (
    <main className="lab-shell">
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
            gradientExperimentSelected && gradientPlayback.status !== 'idle'
          }
          gradientEncodingSelected={gradientExperimentSelected}
          gradientEncodingEnsembleStates={gradientEnsembleStates}
          gradientImperfections={gradientImperfections}
          gradientEncodingTimeMilliseconds={
            gradientPlayback.timeMilliseconds
          }
          gradientPhaseEncodingPulses={phaseEncodingPulses}
          gradientReadoutPulses={readoutPulses}
          gradientRfExcitationPulses={rfExcitationPulses}
          gradientRfFrequencyOffsetKilohertz={rfFrequencyOffsetKilohertz}
          gradientSliceSelectionPulses={sliceSelectionPulses}
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
                <span>{stackedEnsembleCount.toLocaleString()} vectors</span>
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

      <aside className="control-panel">
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
          <div className="active-experiment-view" hidden={selected !== null}>
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
                durationMilliseconds={
                  GRADIENT_SEQUENCE_DURATION_MILLISECONDS
                }
                gradientImperfections={gradientImperfections}
                phaseEncodingPulses={phaseEncodingPulses}
                readoutPulses={readoutPulses}
                rfExcitationPulses={rfExcitationPulses}
                rfFrequencyOffsetKilohertz={rfFrequencyOffsetKilohertz}
                sliceSelectionPulses={sliceSelectionPulses}
                speed={gradientPlayback.speed}
                status={gradientPlayback.status}
                timeMilliseconds={gradientPlayback.timeMilliseconds}
                onPause={gradientPlayback.pause}
                onRfExcitationPulsesChange={setRfExcitationPulses}
                onRfExcitationFrequencyChange={
                  setRfFrequencyOffsetKilohertz
                }
                onRfExcitationReset={() => {
                  setRfExcitationPulses(
                    copyGradientPulses(DEFAULT_RF_EXCITATION_PULSES),
                  )
                  setRfFrequencyOffsetKilohertz(0)
                }}
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
                onSimulationReset={gradientPlayback.reset}
                onSpeedChange={gradientPlayback.setSpeed}
                onStart={gradientPlayback.start}
              />
            )}
          </div>

          {selected &&
            selectedEnsemble &&
            magneticProperties &&
            sampleProperties && (
            <>
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
            </>
          )}
        </div>
      </aside>
    </main>
  )
}

export default App
