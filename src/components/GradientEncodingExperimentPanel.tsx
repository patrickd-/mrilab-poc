import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  GradientPlaybackSpeed,
  GradientPlaybackStatus,
} from '../hooks/useGradientEncodingPlayback'
import { ADC_DWELL_TIME_MILLISECONDS } from '../hooks/useGradientAcquisition'
import {
  appliedGradientAmplitudeAt,
  createDefaultTransmitFrequencyBand,
  DEFAULT_ADC_PULSES,
  DEFAULT_PHASE_ENCODING_PULSES,
  DEFAULT_READOUT_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  DEFAULT_SLICE_SELECTION_PULSES,
  gradientKSpaceCyclesPerMeterAt,
  matchHalfAreaSliceRephasing,
  MAXIMUM_GRADIENT_TESLA_PER_METER,
  MAXIMUM_RF_B1_TESLA,
  rfPulseB1TeslaAt,
  rfPulseNominalFlipAngleRadiansAt,
  rfPeakB1TeslaForFlipAngle,
  rfPulseTimeBandwidthProduct,
  sliceRephasingAreaRatio,
  transmitBandwidthAngularRadiansPerMillisecond,
  type GradientPulse,
  type GradientSignalPoint,
  type TransmitFrequencyBand,
} from '../simulation/gradientEncoding'
import DarkSelect from './DarkSelect'
import GradientAcquisitionGraph from './GradientAcquisitionGraph'
import KSpaceEncodingMaps from './KSpaceEncodingMaps'
import SliceSelectionMappingGraph from './SliceSelectionMappingGraph'

export type PulseHandle = 'left' | 'right' | 'top'
export type GradientChannelId =
  | 'adc'
  | 'rf'
  | 'slice-selection'
  | 'phase-encoding'
  | 'readout'

interface DragState {
  handle: PulseHandle
  initialPulses: GradientPulse[]
  originAmplitude: number
  originTime: number
  pointerId: number
  pulseIndex: number
}

interface EditableGradientGraphProps {
  amplitudeEditable?: boolean
  channelEnabled: boolean
  description: string
  durationMilliseconds: number
  gradientImperfections: boolean
  guideTime: number | null
  label: 'RF' | 'SS' | 'PE' | 'RO' | 'ADC'
  linkedPulses?: boolean
  maintainHalfAreaRephasing?: boolean
  onChange: (pulses: GradientPulse[]) => void
  onEnabledChange: (enabled: boolean) => void
  onGuideTimeChange: (time: number | null) => void
  onReset: () => void
  playheadTime: number | null
  pulses: ReadonlyArray<GradientPulse>
  referenceWaveforms: ReadonlyArray<ReadonlyArray<GradientPulse>>
  rfReferenceTransmitFrequencyBand?: TransmitFrequencyBand
  rfTransmitFrequencyBand?: TransmitFrequencyBand
}

interface GradientEncodingExperimentPanelProps {
  adcPulses: ReadonlyArray<GradientPulse>
  adcSignalPoints: ReadonlyArray<GradientSignalPoint>
  durationMilliseconds: number
  enabledChannels: Readonly<Record<GradientChannelId, boolean>>
  gradientImperfections: boolean
  gridSize: number
  onPause: () => void
  onAdcPulsesChange: (pulses: GradientPulse[]) => void
  onAdcReset: () => void
  onChannelEnabledChange: (
    channel: GradientChannelId,
    enabled: boolean,
  ) => void
  onRfExcitationPulsesChange: (pulses: GradientPulse[]) => void
  onRfExcitationReset: () => void
  onPhaseEncodingPulsesChange: (pulses: GradientPulse[]) => void
  onPhaseEncodingReset: () => void
  onReadoutPulsesChange: (pulses: GradientPulse[]) => void
  onReadoutReset: () => void
  onSliceSelectionPulsesChange: (pulses: GradientPulse[]) => void
  onSliceSelectionReset: () => void
  onTransmitFrequencyBandChange: (band: TransmitFrequencyBand) => void
  onTransmitFrequencyBandReset: () => void
  onSimulationReset: () => void
  onSpeedChange: (speed: GradientPlaybackSpeed) => void
  onStart: () => void
  phaseEncodingPulses: ReadonlyArray<GradientPulse>
  readoutPulses: ReadonlyArray<GradientPulse>
  rfExcitationPulses: ReadonlyArray<GradientPulse>
  sliceSelectionPulses: ReadonlyArray<GradientPulse>
  speed: GradientPlaybackSpeed
  status: GradientPlaybackStatus
  timeMilliseconds: number
  transmitFrequencyBand: TransmitFrequencyBand
}

const GRAPH = {
  width: 460,
  height: 180,
  left: 42,
  right: 16,
  top: 18,
  bottom: 30,
}
const MINIMUM_PULSE_DURATION = 0.025
const KEYBOARD_TIME_STEP = 0.01
const KEYBOARD_AMPLITUDE_STEP = 0.05
const PHASE_ENCODING_REFERENCE_LEVELS = [
  -1,
  -5 / 7,
  -3 / 7,
  -1 / 7,
  1 / 7,
  3 / 7,
  5 / 7,
  1,
] as const
const PHASE_ENCODING_REFERENCE_WAVEFORMS =
  PHASE_ENCODING_REFERENCE_LEVELS.map((level) =>
    DEFAULT_PHASE_ENCODING_PULSES.map((pulse) => ({
      ...pulse,
      amplitude: pulse.amplitude * level,
    })),
  )
const READOUT_REFERENCE_WAVEFORMS = [DEFAULT_READOUT_PULSES]
const ADC_REFERENCE_WAVEFORMS = [DEFAULT_ADC_PULSES]
const RF_EXCITATION_REFERENCE_WAVEFORMS = [DEFAULT_RF_EXCITATION_PULSES]
const SLICE_SELECTION_REFERENCE_WAVEFORMS = [
  DEFAULT_SLICE_SELECTION_PULSES,
]
const GRADIENT_PLAYBACK_SPEED_OPTIONS: ReadonlyArray<{
  id: GradientPlaybackSpeed
  label: string
}> = [
  { id: '0.25', label: '0.25×' },
  { id: '0.5', label: '0.5×' },
  { id: '1', label: '1×' },
  { id: '2', label: '2×' },
  { id: '4', label: '4×' },
]

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function updatePulses(
  initialPulses: ReadonlyArray<GradientPulse>,
  pulseIndex: number,
  handle: PulseHandle,
  deltaTime: number,
  targetAmplitude: number,
  linkedPulses: boolean,
  maintainHalfAreaRephasing = false,
) {
  const pulses = initialPulses.map((pulse) => ({ ...pulse }))
  const pulse = pulses[pulseIndex]
  const previousPulse = pulses[pulseIndex - 1]
  const nextPulse = pulses[pulseIndex + 1]

  if (handle === 'left') {
    if (linkedPulses && previousPulse) {
      const boundary = clamp(
        pulse.start + deltaTime,
        previousPulse.start + MINIMUM_PULSE_DURATION,
        pulse.end - MINIMUM_PULSE_DURATION,
      )
      previousPulse.end = boundary
      pulse.start = boundary
    } else {
      pulse.start = clamp(
        pulse.start + deltaTime,
        0,
        pulse.end - MINIMUM_PULSE_DURATION,
      )
    }
  } else if (handle === 'right') {
    if (linkedPulses && nextPulse) {
      const boundary = clamp(
        pulse.end + deltaTime,
        pulse.start + MINIMUM_PULSE_DURATION,
        nextPulse.end - MINIMUM_PULSE_DURATION,
      )
      pulse.end = boundary
      nextPulse.start = boundary
    } else {
      pulse.end = clamp(
        pulse.end + deltaTime,
        pulse.start + MINIMUM_PULSE_DURATION,
        1,
      )
    }
  } else {
    pulse.amplitude = clamp(targetAmplitude, -1, 1)

    if (linkedPulses && previousPulse) {
      const adjustedDelta = clamp(
        deltaTime,
        previousPulse.start + MINIMUM_PULSE_DURATION - pulse.start,
        1 - pulse.end,
      )
      pulse.start += adjustedDelta
      pulse.end += adjustedDelta
      previousPulse.end = pulse.start
    } else if (linkedPulses && nextPulse) {
      const adjustedDelta = clamp(
        deltaTime,
        -pulse.start,
        nextPulse.end - MINIMUM_PULSE_DURATION - pulse.end,
      )
      pulse.start += adjustedDelta
      pulse.end += adjustedDelta
      nextPulse.start = pulse.end
    } else {
      const adjustedDelta = clamp(deltaTime, -pulse.start, 1 - pulse.end)
      pulse.start += adjustedDelta
      pulse.end += adjustedDelta
    }
  }

  return maintainHalfAreaRephasing &&
    !(pulseIndex === 1 && handle === 'top')
    ? matchHalfAreaSliceRephasing(pulses)
    : pulses
}

function EditableGradientGraph({
  amplitudeEditable = true,
  channelEnabled,
  description,
  durationMilliseconds,
  gradientImperfections,
  guideTime,
  label,
  linkedPulses = false,
  maintainHalfAreaRephasing = false,
  onChange,
  onEnabledChange,
  onGuideTimeChange,
  onReset,
  playheadTime,
  pulses,
  referenceWaveforms,
  rfReferenceTransmitFrequencyBand,
  rfTransmitFrequencyBand,
}: EditableGradientGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const digitalGate = label === 'ADC'
  const baselineY = digitalGate
    ? GRAPH.top + plotHeight - 8
    : GRAPH.top + plotHeight / 2
  const amplitudeHeight = digitalGate
    ? plotHeight - 16
    : plotHeight / 2 - 8
  const timeToX = (time: number) => GRAPH.left + time * plotWidth
  const amplitudeToY = (amplitude: number) =>
    baselineY - amplitude * amplitudeHeight

  const pointerCoordinates = (clientX: number, clientY: number) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) return { amplitude: 0, time: 0 }

    const svgX = ((clientX - bounds.left) / bounds.width) * GRAPH.width
    const svgY = ((clientY - bounds.top) / bounds.height) * GRAPH.height
    return {
      amplitude: clamp((baselineY - svgY) / amplitudeHeight, -1, 1),
      time: clamp((svgX - GRAPH.left) / plotWidth, 0, 1),
    }
  }

  const beginDrag = (
    event: ReactPointerEvent<SVGLineElement>,
    pulseIndex: number,
    handle: PulseHandle,
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const coordinates = pointerCoordinates(event.clientX, event.clientY)
    onGuideTimeChange(coordinates.time)
    dragRef.current = {
      handle,
      initialPulses: pulses.map((pulse) => ({ ...pulse })),
      originAmplitude: coordinates.amplitude,
      originTime: coordinates.time,
      pointerId: event.pointerId,
      pulseIndex,
    }
    setActiveHandle(`${pulseIndex}-${handle}`)
  }

  const continueDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const coordinates = pointerCoordinates(event.clientX, event.clientY)
    onGuideTimeChange(coordinates.time)
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const initialPulse = drag.initialPulses[drag.pulseIndex]
    onChange(
      updatePulses(
        drag.initialPulses,
        drag.pulseIndex,
        drag.handle,
        coordinates.time - drag.originTime,
        initialPulse.amplitude +
          coordinates.amplitude -
          drag.originAmplitude,
        linkedPulses,
        maintainHalfAreaRephasing,
      ),
    )
  }

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setActiveHandle(null)

    const bounds = svgRef.current?.getBoundingClientRect()
    if (
      !bounds ||
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      onGuideTimeChange(null)
    }
  }

  const handleKeyDown = (
    event: ReactKeyboardEvent<SVGLineElement>,
    pulseIndex: number,
    handle: PulseHandle,
  ) => {
    let deltaTime = 0
    let targetAmplitude = pulses[pulseIndex].amplitude

    if (event.key === 'ArrowLeft') deltaTime = -KEYBOARD_TIME_STEP
    else if (event.key === 'ArrowRight') deltaTime = KEYBOARD_TIME_STEP
    else if (handle === 'top' && event.key === 'ArrowUp') {
      targetAmplitude += KEYBOARD_AMPLITUDE_STEP
    } else if (handle === 'top' && event.key === 'ArrowDown') {
      targetAmplitude -= KEYBOARD_AMPLITUDE_STEP
    } else {
      return
    }

    event.preventDefault()
    onChange(
      updatePulses(
        pulses,
        pulseIndex,
        handle,
        deltaTime,
        targetAmplitude,
        linkedPulses,
        maintainHalfAreaRephasing,
      ),
    )
  }

  const waveformPath = pulses.reduce((path, pulse) => {
    return `${path} H ${timeToX(pulse.start)} V ${amplitudeToY(
      pulse.amplitude,
    )} H ${timeToX(pulse.end)} V ${baselineY}`
  }, `M ${GRAPH.left} ${baselineY}`)
  const referenceWaveformPath = (
    referencePulses: ReadonlyArray<GradientPulse>,
  ) => {
    const firstPulse = referencePulses[0]
    if (!firstPulse) return ''

    return referencePulses.reduce((path, pulse) => {
      return `${path} H ${timeToX(pulse.start)} V ${amplitudeToY(
        pulse.amplitude,
      )} H ${timeToX(pulse.end)} V ${baselineY}`
    }, `M ${timeToX(firstPulse.start)} ${baselineY}`)
  }
  const rfWaveformPath = (
    waveformPulses: ReadonlyArray<GradientPulse>,
    transmitFrequencyBand: TransmitFrequencyBand,
  ) => {
    const segments = waveformPulses.map((pulse) => {
      const sampleCount = 160
      const points = Array.from({ length: sampleCount + 1 }, (_, index) => {
        const normalizedPulseTime = index / sampleCount
        const normalizedTime =
          pulse.start + (pulse.end - pulse.start) * normalizedPulseTime
        const b1Fraction =
          rfPulseB1TeslaAt(
            pulse,
            transmitFrequencyBand,
            normalizedTime * durationMilliseconds,
            durationMilliseconds,
          ) / MAXIMUM_RF_B1_TESLA
        return `${index === 0 ? 'M' : 'L'} ${timeToX(
          normalizedTime,
        )} ${amplitudeToY(b1Fraction)}`
      }).join(' ')
      return `M ${timeToX(pulse.start)} ${baselineY} ${points} L ${timeToX(
        pulse.end,
      )} ${baselineY}`
    })
    return segments.join(' ')
  }
  const displayedWaveformPath =
    label === 'RF' && rfTransmitFrequencyBand
      ? rfWaveformPath(pulses, rfTransmitFrequencyBand)
      : `${waveformPath} H ${GRAPH.left + plotWidth}`
  const appliedWaveformPath = gradientImperfections
    ? Array.from({ length: 161 }, (_, index) => {
        const normalizedTime = index / 160
        const amplitude = appliedGradientAmplitudeAt(
          pulses,
          normalizedTime * durationMilliseconds,
          durationMilliseconds,
          true,
        )
        return `${index === 0 ? 'M' : 'L'} ${timeToX(
          normalizedTime,
        )} ${amplitudeToY(amplitude)}`
      }).join(' ')
    : ''
  return (
    <div
      className={`gradient-input gradient-input-${label.toLowerCase()}${
        channelEnabled ? '' : ' disabled'
      }`}
    >
      <header className="gradient-input-heading">
        <strong className="formula">
          {label === 'RF' ? (
            <>B<sub>1</sub></>
          ) : label === 'ADC' ? (
            <>ADC</>
          ) : (
            <>G<sub>{label}</sub></>
          )}
        </strong>
        <span>{description}</span>
        <div className="gradient-input-actions">
          <label className="gradient-channel-toggle">
            <input
              type="checkbox"
              checked={channelEnabled}
              aria-label={`Enable ${description.toLowerCase()}`}
              onChange={(event) =>
                onEnabledChange(event.currentTarget.checked)
              }
            />
            <span>On</span>
          </label>
          <button
            className="gradient-input-reset"
            type="button"
            title={`Reset ${description.toLowerCase()}`}
            aria-label={`Reset ${description.toLowerCase()}`}
            onClick={onReset}
          >
            Reset
          </button>
        </div>
      </header>

      <svg
        ref={svgRef}
        className="gradient-input-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="group"
        aria-label={`${description} editable waveform`}
        onPointerMove={continueDrag}
        onPointerEnter={(event) =>
          onGuideTimeChange(
            pointerCoordinates(event.clientX, event.clientY).time,
          )
        }
        onPointerLeave={() => {
          if (!dragRef.current) onGuideTimeChange(null)
        }}
        onPointerUp={endDrag}
        onPointerCancel={(event) => {
          endDrag(event)
          onGuideTimeChange(null)
        }}
      >
        <g className="gradient-input-grid" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((time) => (
            <line
              key={`time-${time}`}
              x1={timeToX(time)}
              y1={GRAPH.top}
              x2={timeToX(time)}
              y2={GRAPH.top + plotHeight}
            />
          ))}
          {(digitalGate ? [0.5, 1] : [-1, -0.5, 0.5, 1]).map((amplitude) => (
            <line
              key={`amplitude-${amplitude}`}
              x1={GRAPH.left}
              y1={amplitudeToY(amplitude)}
              x2={GRAPH.left + plotWidth}
              y2={amplitudeToY(amplitude)}
            />
          ))}
        </g>

        <line
          className="gradient-zero-axis"
          x1={GRAPH.left}
          y1={baselineY}
          x2={GRAPH.left + plotWidth}
          y2={baselineY}
          aria-hidden="true"
        />
        <text
          className={`gradient-amplitude-label${
            label === 'RF' ? ' rf-b1-amplitude-label' : ''
          }`}
          textAnchor="middle"
          transform={`translate(13 ${baselineY}) rotate(-90)`}
          aria-hidden="true"
        >
          {label === 'RF'
            ? 'B₁ · µT'
            : label === 'ADC'
              ? 'gate'
              : 'mT/m'}
        </text>
        <g className="gradient-reference-waveforms" aria-hidden="true">
          {referenceWaveforms.map((referencePulses, index) => (
            <path
              key={index}
              d={
                label === 'RF' && rfReferenceTransmitFrequencyBand
                  ? rfWaveformPath(
                      referencePulses,
                      rfReferenceTransmitFrequencyBand,
                    )
                  : referenceWaveformPath(referencePulses)
              }
            />
          ))}
        </g>
        {guideTime !== null && (
          <line
            className="gradient-timing-guide"
            x1={timeToX(guideTime)}
            y1={GRAPH.top}
            x2={timeToX(guideTime)}
            y2={GRAPH.top + plotHeight}
            aria-hidden="true"
          />
        )}
        {playheadTime !== null && (
          <line
            className="gradient-playhead"
            x1={timeToX(playheadTime)}
            y1={GRAPH.top}
            x2={timeToX(playheadTime)}
            y2={GRAPH.top + plotHeight}
            aria-hidden="true"
          />
        )}
        <text
          className="gradient-time-label"
          x={GRAPH.left + plotWidth + 2}
          y={baselineY - 6}
          aria-hidden="true"
        >
          t
        </text>

        {label !== 'RF' && pulses.map((pulse, pulseIndex) => {
          const x = timeToX(pulse.start)
          const width = timeToX(pulse.end) - x
          const amplitudeY = amplitudeToY(pulse.amplitude)
          const y = Math.min(baselineY, amplitudeY)
          const height = Math.max(1, Math.abs(baselineY - amplitudeY))

          return (
            <rect
              key={`fill-${pulseIndex}`}
              className="gradient-pulse-fill"
              x={x}
              y={y}
              width={width}
              height={height}
              aria-hidden="true"
            />
          )
        })}

        <path
          className="gradient-waveform"
          d={displayedWaveformPath}
          aria-hidden="true"
        />
        {gradientImperfections && (
          <path
            className="gradient-applied-waveform"
            d={appliedWaveformPath}
            aria-hidden="true"
          />
        )}

        {pulses.flatMap((pulse, pulseIndex) => {
          const startX = timeToX(pulse.start)
          const endX = timeToX(pulse.end)
          const amplitudeY = amplitudeToY(pulse.amplitude)
          const handles: ReadonlyArray<{
            handle: PulseHandle
            x1: number
            x2: number
            y1: number
            y2: number
          }> = [
            {
              handle: 'left',
              x1: startX,
              x2: startX,
              y1: baselineY,
              y2: amplitudeY,
            },
            {
              handle: 'right',
              x1: endX,
              x2: endX,
              y1: amplitudeY,
              y2: baselineY,
            },
            ...(amplitudeEditable
              ? [
                  {
                    handle: 'top' as const,
                    x1: startX,
                    x2: endX,
                    y1: amplitudeY,
                    y2: amplitudeY,
                  },
                ]
              : []),
          ]

          return handles.map((coordinates) => {
            const { handle, ...lineCoordinates } = coordinates
            const handleKey = `${pulseIndex}-${handle}`
            const value =
              handle === 'top'
                ? label === 'RF'
                  ? `${(
                      pulse.amplitude *
                      MAXIMUM_RF_B1_TESLA *
                      1e6
                    ).toFixed(2)} microtesla peak B1`
                  : `${(
                      pulse.amplitude *
                      MAXIMUM_GRADIENT_TESLA_PER_METER *
                      1e3
                    ).toFixed(2)} mT/m`
                : `${Math.round(
                    (handle === 'left' ? pulse.start : pulse.end) * 100,
                  )}%`
            const numericValue =
              handle === 'top'
                ? pulse.amplitude
                : handle === 'left'
                  ? pulse.start
                  : pulse.end

            return (
              <g
                className={`gradient-handle gradient-handle-${handle}`}
                key={handleKey}
              >
                <line
                  className="gradient-handle-stroke"
                  {...lineCoordinates}
                />
                <line
                  className={`gradient-handle-hit${
                    activeHandle === handleKey ? ' active' : ''
                  }`}
                  {...lineCoordinates}
                  role="slider"
                  tabIndex={0}
                  aria-valuemin={handle === 'top' ? -1 : 0}
                  aria-valuemax={1}
                  aria-valuenow={numericValue}
                  aria-valuetext={value}
                  aria-label={`${description}, pulse ${pulseIndex + 1}, ${
                    handle
                  } handle: ${value}`}
                  onPointerDown={(event) =>
                    beginDrag(event, pulseIndex, handle)
                  }
                  onKeyDown={(event) =>
                    handleKeyDown(event, pulseIndex, handle)
                  }
                />
              </g>
            )
          })
        })}
      </svg>
    </div>
  )
}

function GradientEncodingExperimentPanel({
  adcPulses,
  adcSignalPoints,
  durationMilliseconds,
  enabledChannels,
  gradientImperfections,
  gridSize,
  onPause,
  onAdcPulsesChange,
  onAdcReset,
  onChannelEnabledChange,
  onRfExcitationPulsesChange,
  onRfExcitationReset,
  onPhaseEncodingPulsesChange,
  onPhaseEncodingReset,
  onReadoutPulsesChange,
  onReadoutReset,
  onSliceSelectionPulsesChange,
  onSliceSelectionReset,
  onTransmitFrequencyBandChange,
  onTransmitFrequencyBandReset,
  onSimulationReset,
  onSpeedChange,
  onStart,
  phaseEncodingPulses,
  readoutPulses,
  rfExcitationPulses,
  sliceSelectionPulses,
  speed,
  status,
  timeMilliseconds,
  transmitFrequencyBand,
}: GradientEncodingExperimentPanelProps) {
  const [timingGuideTime, setTimingGuideTime] = useState<number | null>(null)
  const playheadTime =
    status === 'idle'
      ? null
      : clamp(timeMilliseconds / durationMilliseconds, 0, 1)
  const rfExcitationPulse = rfExcitationPulses[0]
  const sliceMappingGradientAmplitude = rfExcitationPulse
    ? appliedGradientAmplitudeAt(
        sliceSelectionPulses,
        ((rfExcitationPulse.start + rfExcitationPulse.end) / 2) *
          durationMilliseconds,
        durationMilliseconds,
        gradientImperfections,
      )
    : 0
  const defaultTransmitFrequencyBand =
    createDefaultTransmitFrequencyBand(gridSize)
  const rfDurationMilliseconds = rfExcitationPulse
    ? (rfExcitationPulse.end - rfExcitationPulse.start) *
      durationMilliseconds
    : 0
  const rfBandwidthKilohertz =
    Math.abs(
      transmitBandwidthAngularRadiansPerMillisecond(transmitFrequencyBand),
    ) /
    (2 * Math.PI)
  const rfTimeBandwidthProduct = rfExcitationPulse
    ? rfPulseTimeBandwidthProduct(
        rfExcitationPulse,
        transmitFrequencyBand,
        durationMilliseconds,
      )
    : 0
  const rfPeakB1Microtesla = rfExcitationPulse
    ? Math.abs(rfExcitationPulse.amplitude) * MAXIMUM_RF_B1_TESLA * 1e6
    : 0
  const rfPeakB1ForNinetyDegreesMicrotesla = rfExcitationPulse
    ? rfPeakB1TeslaForFlipAngle(
        rfExcitationPulse,
        transmitFrequencyBand,
        Math.PI / 2,
        durationMilliseconds,
      ) * 1e6
    : 0
  const rfNinetyDegreeTargetAvailable =
    rfPeakB1ForNinetyDegreesMicrotesla <=
    MAXIMUM_RF_B1_TESLA * 1e6 + 1e-6
  const rfNominalFlipDegrees = rfExcitationPulse
    ? (rfPulseNominalFlipAngleRadiansAt(
        rfExcitationPulse,
        transmitFrequencyBand,
        rfExcitationPulse.end * durationMilliseconds,
        durationMilliseconds,
      ) *
        180) /
      Math.PI
    : 0
  const rephasingAreaRatio = sliceRephasingAreaRatio(sliceSelectionPulses)
  const rephasingAreaMatched =
    rephasingAreaRatio !== null &&
    Math.abs(rephasingAreaRatio - 0.5) < 0.001
  const encodingStartTimeMilliseconds = rfExcitationPulse
    ? rfExcitationPulse.end * durationMilliseconds
    : 0
  const kxCyclesPerMeter = gradientKSpaceCyclesPerMeterAt(
    enabledChannels.readout ? readoutPulses : [],
    timeMilliseconds,
    durationMilliseconds,
    gradientImperfections,
    encodingStartTimeMilliseconds,
  )
  const kyCyclesPerMeter = gradientKSpaceCyclesPerMeterAt(
    enabledChannels['phase-encoding'] ? phaseEncodingPulses : [],
    timeMilliseconds,
    durationMilliseconds,
    gradientImperfections,
    encodingStartTimeMilliseconds,
  )

  return (
    <>
      <div className="gradient-playback-controls gradient-playback-controls-top">
        <div className="gradient-playback-actions">
          <button
            className="fid-control-button primary transport"
            type="button"
            title={status === 'running' ? 'Pause sequence' : 'Play sequence'}
            aria-label={
              status === 'running'
                ? 'Pause gradient sequence'
                : status === 'paused'
                  ? 'Resume gradient sequence'
                  : status === 'complete'
                    ? 'Replay gradient sequence'
                    : 'Play gradient sequence'
            }
            onClick={status === 'running' ? onPause : onStart}
          >
            <span aria-hidden="true">
              {status === 'running' ? '❚❚' : '▶'}
            </span>
          </button>
          <DarkSelect
            className="gradient-playback-speed-select"
            ariaLabel="Gradient sequence playback speed"
            value={speed}
            options={GRADIENT_PLAYBACK_SPEED_OPTIONS}
            onChange={onSpeedChange}
          />
          <button
            className="fid-control-button"
            type="button"
            disabled={status === 'idle'}
            onClick={onSimulationReset}
          >
            Reset
          </button>
        </div>

        <div className="gradient-playback-meta">
          <span className={`fid-status ${status}`}>{status}</span>
          <span>
            G<sub>SS</sub> ⟂ G<sub>PE</sub> ⟂ G<sub>RO</sub>
          </span>
          <strong>
            {timeMilliseconds.toFixed(2)} / {durationMilliseconds} ms
          </strong>
        </div>
      </div>

      <section className="gradient-slice-selection-section">
        <div className="section-heading">
          <div>
            <span className="section-index">01</span>
            <h2>Slice Selection</h2>
          </div>
        </div>

        <p className="gradient-input-instructions">
          The coral B₁ trace is a Hamming-windowed sinc pulse. Its duration,
          transmit bandwidth, and peak B₁ determine the time-bandwidth
          product and nominal flip. G<sub>SS</sub> acts during RF; its opposite
          rewinder defaults to half the selection-lobe area. Gradient full
          scale is ±
          {MAXIMUM_GRADIENT_TESLA_PER_METER * 1e3} mT/m. RF Reset recalibrates
          the current bandwidth to 90° when it fits within the B₁ limit.
          {gradientImperfections &&
            ' Dashed yellow shows the applied gradient response.'}
        </p>

        <div className="gradient-timing-diagram">
          <EditableGradientGraph
            channelEnabled={enabledChannels.rf}
            description="RF excitation pulse"
            durationMilliseconds={durationMilliseconds}
            gradientImperfections={false}
            guideTime={timingGuideTime}
            label="RF"
            pulses={rfExcitationPulses}
            playheadTime={playheadTime}
            referenceWaveforms={RF_EXCITATION_REFERENCE_WAVEFORMS}
            rfReferenceTransmitFrequencyBand={
              defaultTransmitFrequencyBand
            }
            rfTransmitFrequencyBand={transmitFrequencyBand}
            onChange={onRfExcitationPulsesChange}
            onEnabledChange={(enabled) =>
              onChannelEnabledChange('rf', enabled)
            }
            onGuideTimeChange={setTimingGuideTime}
            onReset={onRfExcitationReset}
          />
          <div className="rf-pulse-meta" aria-label="RF pulse derived properties">
            <span>
              T<sub>RF</sub> = {rfDurationMilliseconds.toFixed(2)} ms
            </span>
            <span>BW = {rfBandwidthKilohertz.toFixed(3)} kHz</span>
            <span>TBW = {rfTimeBandwidthProduct.toFixed(2)}</span>
            <strong>
              α<sub>nominal</sub> = {rfNominalFlipDegrees.toFixed(1)}° · B
              <sub>1, peak</sub> = {rfPeakB1Microtesla.toFixed(2)} /{' '}
              {(MAXIMUM_RF_B1_TESLA * 1e6).toFixed(0)} µT
            </strong>
            <strong
              className={
                rfNinetyDegreeTargetAvailable
                  ? 'rf-pulse-target'
                  : 'rf-pulse-limit-warning'
              }
            >
              90° target: B<sub>1, peak</sub> ={' '}
              {Number.isFinite(rfPeakB1ForNinetyDegreesMicrotesla)
                ? rfPeakB1ForNinetyDegreesMicrotesla.toFixed(2)
                : '—'}{' '}
              µT
              {!rfNinetyDegreeTargetAvailable &&
                ' · exceeds limit; reduce bandwidth or |GSS|'}
            </strong>
          </div>
          <EditableGradientGraph
            channelEnabled={enabledChannels['slice-selection']}
            description="Slice selection gradient"
            durationMilliseconds={durationMilliseconds}
            gradientImperfections={gradientImperfections}
            guideTime={timingGuideTime}
            label="SS"
            linkedPulses
            maintainHalfAreaRephasing
            pulses={sliceSelectionPulses}
            playheadTime={playheadTime}
            referenceWaveforms={SLICE_SELECTION_REFERENCE_WAVEFORMS}
            onChange={onSliceSelectionPulsesChange}
            onEnabledChange={(enabled) =>
              onChannelEnabledChange('slice-selection', enabled)
            }
            onGuideTimeChange={setTimingGuideTime}
            onReset={onSliceSelectionReset}
          />
          <div
            className={`slice-rephasing-meta${
              rephasingAreaMatched ? ' matched' : ' warning'
            }`}
            aria-label="Slice rephasing area"
          >
            <span>
              |A<sub>rephase</sub> / A<sub>select</sub>| ={' '}
              {rephasingAreaRatio?.toFixed(3) ?? '—'}
            </span>
            <strong>target 0.500</strong>
          </div>
          <SliceSelectionMappingGraph
            gradientAmplitude={sliceMappingGradientAmplitude}
            gridSize={gridSize}
            transmitFrequencyBand={transmitFrequencyBand}
            onChange={onTransmitFrequencyBandChange}
            onReset={onTransmitFrequencyBandReset}
          />
        </div>
      </section>

      <section className="gradient-encoding-section">
        <div className="section-heading">
          <div>
            <span className="section-index">02</span>
            <h2>Phase &amp; Frequency Encoding</h2>
          </div>
        </div>

        <p className="gradient-input-instructions">
          Gray lines mark the default encoding steps on the shared 20 ms
          timeline. G<sub>PE</sub> occupies the middle interval; readout
          prephasing leads directly into positive acquisition. The grayscale
          maps show cos φ and sin φ for the integrated k-space coordinate
          under the playhead.
          {gradientImperfections &&
            ' Dashed yellow shows the applied gradient response.'}
        </p>

        <div className="gradient-timing-diagram">
          <EditableGradientGraph
            channelEnabled={enabledChannels['phase-encoding']}
            description="Phase encoding gradient"
            durationMilliseconds={durationMilliseconds}
            gradientImperfections={gradientImperfections}
            guideTime={timingGuideTime}
            label="PE"
            pulses={phaseEncodingPulses}
            playheadTime={playheadTime}
            referenceWaveforms={PHASE_ENCODING_REFERENCE_WAVEFORMS}
            onChange={onPhaseEncodingPulsesChange}
            onEnabledChange={(enabled) =>
              onChannelEnabledChange('phase-encoding', enabled)
            }
            onGuideTimeChange={setTimingGuideTime}
            onReset={onPhaseEncodingReset}
          />
          <EditableGradientGraph
            channelEnabled={enabledChannels.readout}
            description="Readout gradient"
            durationMilliseconds={durationMilliseconds}
            gradientImperfections={gradientImperfections}
            guideTime={timingGuideTime}
            label="RO"
            linkedPulses
            pulses={readoutPulses}
            playheadTime={playheadTime}
            referenceWaveforms={READOUT_REFERENCE_WAVEFORMS}
            onChange={onReadoutPulsesChange}
            onEnabledChange={(enabled) =>
              onChannelEnabledChange('readout', enabled)
            }
            onGuideTimeChange={setTimingGuideTime}
            onReset={onReadoutReset}
          />
          <KSpaceEncodingMaps
            gridSize={gridSize}
            kxCyclesPerMeter={kxCyclesPerMeter}
            kyCyclesPerMeter={kyCyclesPerMeter}
          />
        </div>
      </section>

      <section className="gradient-k-space-section">
        <div className="section-heading">
          <div>
            <span className="section-index">03</span>
            <h2>K-Space Exploration</h2>
          </div>
        </div>

        <p className="gradient-input-instructions">
          ADC is a receiver gate, not an applied field. Its edges set the
          acquisition window; complex signal samples are recorded every{' '}
          {ADC_DWELL_TIME_MILLISECONDS.toFixed(2)} ms while the gate is high.
        </p>

        <div className="gradient-timing-diagram">
          <EditableGradientGraph
            amplitudeEditable={false}
            channelEnabled={enabledChannels.adc}
            description="Signal acquisition window"
            durationMilliseconds={durationMilliseconds}
            gradientImperfections={false}
            guideTime={timingGuideTime}
            label="ADC"
            pulses={adcPulses}
            playheadTime={playheadTime}
            referenceWaveforms={ADC_REFERENCE_WAVEFORMS}
            onChange={onAdcPulsesChange}
            onEnabledChange={(enabled) =>
              onChannelEnabledChange('adc', enabled)
            }
            onGuideTimeChange={setTimingGuideTime}
            onReset={onAdcReset}
          />
          <GradientAcquisitionGraph
            adcPulses={adcPulses}
            durationMilliseconds={durationMilliseconds}
            points={adcSignalPoints}
          />
        </div>
      </section>
    </>
  )
}

export default GradientEncodingExperimentPanel
