import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

interface GradientPulse {
  start: number
  end: number
  amplitude: number
}

type PulseHandle = 'left' | 'right' | 'top'

interface DragState {
  handle: PulseHandle
  initialPulses: GradientPulse[]
  originAmplitude: number
  originTime: number
  pointerId: number
  pulseIndex: number
}

interface EditableGradientGraphProps {
  description: string
  guideTime: number | null
  label: 'PE' | 'RO'
  linkedPulses?: boolean
  onChange: (pulses: GradientPulse[]) => void
  onGuideTimeChange: (time: number | null) => void
  onReset: () => void
  pulses: ReadonlyArray<GradientPulse>
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
const DEFAULT_PHASE_ENCODING_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.12, end: 0.32, amplitude: 0.52 },
]
const DEFAULT_READOUT_PULSES: ReadonlyArray<GradientPulse> = [
  { start: 0.12, end: 0.32, amplitude: -0.42 },
  { start: 0.32, end: 0.72, amplitude: 0.52 },
]

function copyPulses(pulses: ReadonlyArray<GradientPulse>) {
  return pulses.map((pulse) => ({ ...pulse }))
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function updatePulses(
  initialPulses: ReadonlyArray<GradientPulse>,
  pulseIndex: number,
  handle: PulseHandle,
  deltaTime: number,
  targetAmplitude: number,
  linkedPulses: boolean,
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

  return pulses
}

function EditableGradientGraph({
  description,
  guideTime,
  label,
  linkedPulses = false,
  onChange,
  onGuideTimeChange,
  onReset,
  pulses,
}: EditableGradientGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const baselineY = GRAPH.top + plotHeight / 2
  const amplitudeHeight = plotHeight / 2 - 8
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
      ),
    )
  }

  const waveformPath = pulses.reduce((path, pulse) => {
    return `${path} H ${timeToX(pulse.start)} V ${amplitudeToY(
      pulse.amplitude,
    )} H ${timeToX(pulse.end)} V ${baselineY}`
  }, `M ${GRAPH.left} ${baselineY}`)

  return (
    <div className={`gradient-input gradient-input-${label.toLowerCase()}`}>
      <header className="gradient-input-heading">
        <strong className="formula">
          G<sub>{label}</sub>
        </strong>
        <span>{description}</span>
        <button
          className="gradient-input-reset"
          type="button"
          title={`Reset ${description.toLowerCase()}`}
          aria-label={`Reset ${description.toLowerCase()}`}
          onClick={onReset}
        >
          Reset
        </button>
      </header>

      <svg
        ref={svgRef}
        className="gradient-input-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="group"
        aria-label={`${description} editable gradient waveform`}
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
          {[-1, -0.5, 0.5, 1].map((amplitude) => (
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
        <text
          className="gradient-time-label"
          x={GRAPH.left + plotWidth + 2}
          y={baselineY - 6}
          aria-hidden="true"
        >
          t
        </text>

        {pulses.map((pulse, pulseIndex) => {
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
          d={`${waveformPath} H ${GRAPH.left + plotWidth}`}
          aria-hidden="true"
        />

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
            {
              handle: 'top',
              x1: startX,
              x2: endX,
              y1: amplitudeY,
              y2: amplitudeY,
            },
          ]

          return handles.map((coordinates) => {
            const { handle, ...lineCoordinates } = coordinates
            const handleKey = `${pulseIndex}-${handle}`
            const value =
              handle === 'top'
                ? pulse.amplitude.toFixed(2)
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

function GradientEncodingExperimentPanel() {
  const [timingGuideTime, setTimingGuideTime] = useState<number | null>(null)
  const [phaseEncodingPulses, setPhaseEncodingPulses] = useState<
    GradientPulse[]
  >(() => copyPulses(DEFAULT_PHASE_ENCODING_PULSES))
  const [readoutPulses, setReadoutPulses] = useState<GradientPulse[]>(() =>
    copyPulses(DEFAULT_READOUT_PULSES),
  )

  return (
    <section className="gradient-encoding-section">
      <div className="section-heading">
        <div>
          <span className="section-index">01</span>
          <h2>Phase &amp; Frequency Encoding</h2>
        </div>
      </div>

      <p className="gradient-input-instructions">
        Drag a pulse top to move it or change amplitude. Drag either side to
        adjust timing.
      </p>

      <div className="gradient-timing-diagram">
        <EditableGradientGraph
          description="Phase encoding gradient"
          guideTime={timingGuideTime}
          label="PE"
          pulses={phaseEncodingPulses}
          onChange={setPhaseEncodingPulses}
          onGuideTimeChange={setTimingGuideTime}
          onReset={() =>
            setPhaseEncodingPulses(copyPulses(DEFAULT_PHASE_ENCODING_PULSES))
          }
        />
        <EditableGradientGraph
          description="Readout gradient"
          guideTime={timingGuideTime}
          label="RO"
          linkedPulses
          pulses={readoutPulses}
          onChange={setReadoutPulses}
          onGuideTimeChange={setTimingGuideTime}
          onReset={() =>
            setReadoutPulses(copyPulses(DEFAULT_READOUT_PULSES))
          }
        />
      </div>
    </section>
  )
}

export default GradientEncodingExperimentPanel
