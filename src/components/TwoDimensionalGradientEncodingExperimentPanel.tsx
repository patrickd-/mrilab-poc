import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  gradientStrengthMilliteslaPerMeter,
  maximumEndpointFieldOffsetMillitesla,
  type SpatialGradientProfile,
} from '../simulation/spatialGradient'
import {
  createDefaultTwoDimensionalEncodingGradients,
  TWO_DIMENSIONAL_ENCODING_STAGE_DURATION_MILLISECONDS,
  twoDimensionalEncodingState,
  type TwoDimensionalGradientVector,
} from '../simulation/twoDimensionalEncoding'
import KSpaceEncodingMaps from './KSpaceEncodingMaps'

type GradientAxis = 'x' | 'y'
type GradientEndpoint = 'start' | 'end'
type EncodingStage = 'frequency' | 'phase'

interface DualSpatialGradientGraphProps {
  enabled: boolean
  fieldOfViewMillimeters: number
  maximumFieldOffsetMillitesla: number
  onChange: (profiles: TwoDimensionalGradientVector) => void
  onEnabledChange: (enabled: boolean) => void
  onReset: () => void
  profiles: TwoDimensionalGradientVector
  stage: EncodingStage
}

interface EndpointDragState {
  axis: GradientAxis
  endpoint: GradientEndpoint
  pointerId: number
}

const GRAPH = {
  bottom: 34,
  height: 190,
  left: 48,
  right: 18,
  top: 16,
  width: 460,
}
const KEYBOARD_FIELD_STEP_MILLITESLA = 0.08

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatFieldOffset(value: number) {
  const normalizedValue = Math.abs(value) < 0.005 ? 0 : value
  const sign = normalizedValue > 0 ? '+' : normalizedValue < 0 ? '−' : ''
  return `${sign}${Math.abs(normalizedValue).toFixed(2)}`
}

function updateEndpoint(
  profile: SpatialGradientProfile,
  endpoint: GradientEndpoint,
  fieldOffsetMillitesla: number,
) {
  return endpoint === 'start'
    ? {
        ...profile,
        startFieldOffsetMillitesla: fieldOffsetMillitesla,
      }
    : {
        ...profile,
        endFieldOffsetMillitesla: fieldOffsetMillitesla,
      }
}

function DualSpatialGradientGraph({
  enabled,
  fieldOfViewMillimeters,
  maximumFieldOffsetMillitesla,
  onChange,
  onEnabledChange,
  onReset,
  profiles,
  stage,
}: DualSpatialGradientGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<EndpointDragState | null>(null)
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null)
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const zeroY = GRAPH.top + plotHeight / 2
  const amplitudeHeight = plotHeight / 2
  const stageName = stage === 'phase' ? 'Phase encoding' : 'Frequency encoding'
  const stageSubscript = stage === 'phase' ? 'PE' : 'FE'

  const positionToX = (normalizedPosition: number) =>
    GRAPH.left + normalizedPosition * plotWidth
  const fieldOffsetToY = (fieldOffsetMillitesla: number) =>
    zeroY -
    (fieldOffsetMillitesla / maximumFieldOffsetMillitesla) * amplitudeHeight
  const fieldOffsetFromClientY = (clientY: number) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) return 0
    const svgY = ((clientY - bounds.top) / bounds.height) * GRAPH.height
    return clamp(
      ((zeroY - svgY) / amplitudeHeight) * maximumFieldOffsetMillitesla,
      -maximumFieldOffsetMillitesla,
      maximumFieldOffsetMillitesla,
    )
  }

  const changeEndpoint = (
    axis: GradientAxis,
    endpoint: GradientEndpoint,
    fieldOffsetMillitesla: number,
  ) => {
    onChange({
      ...profiles,
      [axis]: updateEndpoint(
        profiles[axis],
        endpoint,
        fieldOffsetMillitesla,
      ),
    })
  }

  const beginDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    axis: GradientAxis,
    endpoint: GradientEndpoint,
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { axis, endpoint, pointerId: event.pointerId }
    setActiveEndpoint(`${axis}-${endpoint}`)
  }

  const continueDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    changeEndpoint(
      drag.axis,
      drag.endpoint,
      fieldOffsetFromClientY(event.clientY),
    )
  }

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setActiveEndpoint(null)
  }

  const handleKeyDown = (
    event: ReactKeyboardEvent<SVGCircleElement>,
    axis: GradientAxis,
    endpoint: GradientEndpoint,
  ) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const currentValue =
      endpoint === 'start'
        ? profiles[axis].startFieldOffsetMillitesla
        : profiles[axis].endFieldOffsetMillitesla
    const direction = event.key === 'ArrowUp' ? 1 : -1
    changeEndpoint(
      axis,
      endpoint,
      clamp(
        currentValue + direction * KEYBOARD_FIELD_STEP_MILLITESLA,
        -maximumFieldOffsetMillitesla,
        maximumFieldOffsetMillitesla,
      ),
    )
  }

  return (
    <div
      className={`gradient-input spatial-gradient-input dual-spatial-gradient-input${
        enabled ? '' : ' disabled'
      } dual-spatial-gradient-${stage}`}
    >
      <header className="gradient-input-heading">
        <strong className="formula">
          G<sub>{stageSubscript}</sub>
        </strong>
        <span>{stageName} gradient</span>
        <div className="gradient-input-actions">
          <label className="gradient-channel-toggle">
            <input
              type="checkbox"
              checked={enabled}
              aria-label={`Enable ${stageName.toLowerCase()} gradient`}
              onChange={(event) =>
                onEnabledChange(event.currentTarget.checked)
              }
            />
            <span>On</span>
          </label>
          <button
            className="gradient-input-reset"
            type="button"
            aria-label={`Reset ${stageName.toLowerCase()} gradient`}
            onClick={onReset}
          >
            Reset
          </button>
        </div>
      </header>

      <div className="dual-spatial-gradient-legend" aria-hidden="true">
        <span className="x-axis">Gx · x-axis profile</span>
        <span className="y-axis">Gy · y-axis profile</span>
      </div>

      <svg
        ref={svgRef}
        className="gradient-input-graph spatial-gradient-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="group"
        aria-label={`${stageName} gradient with editable G x and G y lines`}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g className="spatial-gradient-grid" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((position) => (
            <line
              key={`position-${position}`}
              x1={positionToX(position)}
              y1={GRAPH.top}
              x2={positionToX(position)}
              y2={GRAPH.top + plotHeight}
            />
          ))}
          {[-1, -0.5, 0.5, 1].map((fieldFraction) => (
            <line
              key={`field-${fieldFraction}`}
              x1={GRAPH.left}
              y1={fieldOffsetToY(
                fieldFraction * maximumFieldOffsetMillitesla,
              )}
              x2={GRAPH.left + plotWidth}
              y2={fieldOffsetToY(
                fieldFraction * maximumFieldOffsetMillitesla,
              )}
            />
          ))}
        </g>
        <line
          className="spatial-gradient-zero-axis"
          x1={GRAPH.left}
          y1={zeroY}
          x2={GRAPH.left + plotWidth}
          y2={zeroY}
          aria-hidden="true"
        />

        {(['x', 'y'] as const).map((axis) => {
          const profile = profiles[axis]
          const startY = fieldOffsetToY(
            profile.startFieldOffsetMillitesla,
          )
          const endY = fieldOffsetToY(profile.endFieldOffsetMillitesla)
          return (
            <g key={axis}>
              <polygon
                className={`spatial-gradient-fill spatial-gradient-fill-${axis}`}
                points={`${GRAPH.left},${zeroY} ${GRAPH.left},${startY} ${
                  GRAPH.left + plotWidth
                },${endY} ${GRAPH.left + plotWidth},${zeroY}`}
                aria-hidden="true"
              />
              <line
                className={`spatial-gradient-line spatial-gradient-line-${axis}`}
                x1={GRAPH.left}
                y1={startY}
                x2={GRAPH.left + plotWidth}
                y2={endY}
                aria-hidden="true"
              />
            </g>
          )
        })}

        {[-1, 0, 1].map((fieldFraction) => (
          <text
            className="spatial-gradient-axis-value"
            key={`field-label-${fieldFraction}`}
            x={GRAPH.left - 8}
            y={
              fieldOffsetToY(
                fieldFraction * maximumFieldOffsetMillitesla,
              ) + 3
            }
            textAnchor="end"
            aria-hidden="true"
          >
            {formatFieldOffset(
              fieldFraction * maximumFieldOffsetMillitesla,
            )}
          </text>
        ))}
        {[0, 0.5, 1].map((position) => (
          <text
            className="spatial-gradient-axis-value"
            key={`position-label-${position}`}
            x={positionToX(position)}
            y={GRAPH.top + plotHeight + 18}
            textAnchor="middle"
            aria-hidden="true"
          >
            {Math.round(position * fieldOfViewMillimeters)}
          </text>
        ))}
        <text
          className="spatial-gradient-axis-title"
          x={GRAPH.left + plotWidth / 2}
          y={GRAPH.height - 3}
          textAnchor="middle"
          aria-hidden="true"
        >
          position along x / y · mm
        </text>
        <text
          className="spatial-gradient-axis-title"
          textAnchor="middle"
          transform={`translate(13 ${GRAPH.top + plotHeight / 2}) rotate(-90)`}
          aria-hidden="true"
        >
          ΔB₀ · mT
        </text>

        {(['x', 'y'] as const).flatMap((axis) =>
          (['start', 'end'] as const).map((endpoint) => {
            const fieldOffsetMillitesla =
              endpoint === 'start'
                ? profiles[axis].startFieldOffsetMillitesla
                : profiles[axis].endFieldOffsetMillitesla
            const normalizedPosition = endpoint === 'start' ? 0 : 1
            const positionMillimeters =
              normalizedPosition * fieldOfViewMillimeters
            const endpointKey = `${axis}-${endpoint}`
            const handleOffset = axis === 'x' ? -6 : 6

            return (
              <g className="spatial-gradient-endpoint" key={endpointKey}>
                <circle
                  className={`spatial-gradient-endpoint-grip spatial-gradient-endpoint-grip-${axis}`}
                  cx={positionToX(normalizedPosition) + handleOffset}
                  cy={fieldOffsetToY(fieldOffsetMillitesla)}
                  r="4"
                  aria-hidden="true"
                />
                <circle
                  className={`spatial-gradient-endpoint-hit${
                    activeEndpoint === endpointKey ? ' active' : ''
                  }`}
                  cx={positionToX(normalizedPosition) + handleOffset}
                  cy={fieldOffsetToY(fieldOffsetMillitesla)}
                  r="11"
                  role="slider"
                  tabIndex={0}
                  aria-label={`${stageName} G ${axis} gradient ${positionMillimeters} millimeter endpoint`}
                  aria-orientation="vertical"
                  aria-valuemin={-maximumFieldOffsetMillitesla}
                  aria-valuemax={maximumFieldOffsetMillitesla}
                  aria-valuenow={fieldOffsetMillitesla}
                  aria-valuetext={`${formatFieldOffset(
                    fieldOffsetMillitesla,
                  )} millitesla field offset`}
                  onPointerDown={(event) =>
                    beginDrag(event, axis, endpoint)
                  }
                  onKeyDown={(event) =>
                    handleKeyDown(event, axis, endpoint)
                  }
                />
              </g>
            )
          }),
        )}
      </svg>

      <footer className="spatial-gradient-meta dual-spatial-gradient-meta">
        <span className="x-axis">
          Gx{' '}
          {formatFieldOffset(
            gradientStrengthMilliteslaPerMeter(
              profiles.x,
              fieldOfViewMillimeters,
            ),
          )}{' '}
          mT/m
        </span>
        <span className="y-axis">
          Gy{' '}
          {formatFieldOffset(
            gradientStrengthMilliteslaPerMeter(
              profiles.y,
              fieldOfViewMillimeters,
            ),
          )}{' '}
          mT/m
        </span>
        <strong>
          τ = {TWO_DIMENSIONAL_ENCODING_STAGE_DURATION_MILLISECONDS.toFixed(2)}{' '}
          ms
        </strong>
      </footer>
    </div>
  )
}

function TwoDimensionalGradientEncodingExperimentPanel({
  frequencyEnabled,
  frequencyProfiles,
  gridSize,
  onFrequencyEnabledChange,
  onFrequencyProfilesChange,
  onPhaseEnabledChange,
  onPhaseProfilesChange,
  phaseEnabled,
  phaseProfiles,
}: {
  frequencyEnabled: boolean
  frequencyProfiles: TwoDimensionalGradientVector
  gridSize: number
  onFrequencyEnabledChange: (enabled: boolean) => void
  onFrequencyProfilesChange: (profiles: TwoDimensionalGradientVector) => void
  onPhaseEnabledChange: (enabled: boolean) => void
  onPhaseProfilesChange: (profiles: TwoDimensionalGradientVector) => void
  phaseEnabled: boolean
  phaseProfiles: TwoDimensionalGradientVector
}) {
  const defaults = useMemo(
    () => createDefaultTwoDimensionalEncodingGradients(gridSize),
    [gridSize],
  )
  const encodingState = useMemo(
    () =>
      twoDimensionalEncodingState(
        phaseProfiles,
        frequencyProfiles,
        gridSize,
        phaseEnabled,
        frequencyEnabled,
      ),
    [
      frequencyEnabled,
      frequencyProfiles,
      gridSize,
      phaseEnabled,
      phaseProfiles,
    ],
  )

  return (
    <section className="fundamental-gradient-section two-dimensional-gradient-section">
      <div className="section-heading">
        <div>
          <span className="section-index">01</span>
          <h2>Phase &amp; Frequency Encoding</h2>
        </div>
      </div>

      <p className="gradient-input-instructions">
        Each editor defines a two-dimensional gradient vector: cyan G
        <sub>x</sub> across x and pink G<sub>y</sub> across y. The phase
        gradient accumulates first; the frequency gradient then adds to that
        phase during the fixed preview interval.
      </p>

      <div className="two-dimensional-gradient-stack">
        <DualSpatialGradientGraph
          enabled={phaseEnabled}
          fieldOfViewMillimeters={gridSize}
          maximumFieldOffsetMillitesla={
            maximumEndpointFieldOffsetMillitesla(gridSize)
          }
          profiles={phaseProfiles}
          stage="phase"
          onChange={onPhaseProfilesChange}
          onEnabledChange={onPhaseEnabledChange}
          onReset={() => onPhaseProfilesChange(defaults.phase)}
        />
        <DualSpatialGradientGraph
          enabled={frequencyEnabled}
          fieldOfViewMillimeters={gridSize}
          maximumFieldOffsetMillitesla={
            maximumEndpointFieldOffsetMillitesla(gridSize)
          }
          profiles={frequencyProfiles}
          stage="frequency"
          onChange={onFrequencyProfilesChange}
          onEnabledChange={onFrequencyEnabledChange}
          onReset={() => onFrequencyProfilesChange(defaults.frequency)}
        />

        <div className="two-dimensional-encoding-order" aria-label="Encoding order">
          <span>
            G<sub>PE</sub> · phase stored
          </span>
          <i aria-hidden="true">→</i>
          <span>
            G<sub>FE</sub> · frequency applied
          </span>
          <i aria-hidden="true">→</i>
          <strong>complex spatial basis</strong>
        </div>

        <KSpaceEncodingMaps
          gridSize={gridSize}
          kxCyclesPerMeter={encodingState.kxCyclesPerMeter}
          kyCyclesPerMeter={encodingState.kyCyclesPerMeter}
          phaseOffsetRadians={encodingState.phaseOffsetRadians}
        />
      </div>
    </section>
  )
}

export default TwoDimensionalGradientEncodingExperimentPanel
