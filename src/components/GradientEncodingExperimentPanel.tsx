import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  createDefaultSpatialGradientProfiles,
  gradientStrengthMilliteslaPerMeter,
  maximumEndpointFieldOffsetMillitesla,
  type SpatialGradientProfile,
} from '../simulation/spatialGradient'

export {
  combinedSpatialFieldOffsetMilliteslaAt,
  createDefaultSpatialGradientProfiles,
  gradientStrengthMilliteslaPerMeter,
} from '../simulation/spatialGradient'

type GradientAxis = 'x' | 'y'
type GradientEndpoint = 'start' | 'end'

interface GradientEncodingExperimentPanelProps {
  fieldOfViewMillimeters: number
  onXEnabledChange: (enabled: boolean) => void
  onXProfileChange: (profile: SpatialGradientProfile) => void
  onYEnabledChange: (enabled: boolean) => void
  onYProfileChange: (profile: SpatialGradientProfile) => void
  xEnabled: boolean
  xProfile: SpatialGradientProfile
  yEnabled: boolean
  yProfile: SpatialGradientProfile
}

interface SpatialGradientGraphProps {
  axis: GradientAxis
  enabled: boolean
  fieldOfViewMillimeters: number
  maximumFieldOffsetMillitesla: number
  onChange: (profile: SpatialGradientProfile) => void
  onEnabledChange: (enabled: boolean) => void
  onReset: () => void
  profile: SpatialGradientProfile
}

interface EndpointDragState {
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

function SpatialGradientGraph({
  axis,
  enabled,
  fieldOfViewMillimeters,
  maximumFieldOffsetMillitesla,
  onChange,
  onEnabledChange,
  onReset,
  profile,
}: SpatialGradientGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<EndpointDragState | null>(null)
  const [activeEndpoint, setActiveEndpoint] =
    useState<GradientEndpoint | null>(null)
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const zeroY = GRAPH.top + plotHeight / 2
  const amplitudeHeight = plotHeight / 2
  const axisLabel = axis.toUpperCase()
  const lineClassName = `spatial-gradient-line spatial-gradient-line-${axis}`

  const positionToX = (normalizedPosition: number) =>
    GRAPH.left + normalizedPosition * plotWidth
  const fieldOffsetToY = (fieldOffsetMillitesla: number) =>
    zeroY -
    (fieldOffsetMillitesla / maximumFieldOffsetMillitesla) *
      amplitudeHeight
  const fieldOffsetFromClientY = (clientY: number) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) return 0
    const svgY = ((clientY - bounds.top) / bounds.height) * GRAPH.height
    return clamp(
      ((zeroY - svgY) / amplitudeHeight) *
        maximumFieldOffsetMillitesla,
      -maximumFieldOffsetMillitesla,
      maximumFieldOffsetMillitesla,
    )
  }

  const beginDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    endpoint: GradientEndpoint,
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { endpoint, pointerId: event.pointerId }
    setActiveEndpoint(endpoint)
  }

  const continueDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    onChange(
      updateEndpoint(
        profile,
        drag.endpoint,
        fieldOffsetFromClientY(event.clientY),
      ),
    )
  }

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setActiveEndpoint(null)
  }

  const handleKeyDown = (
    event: ReactKeyboardEvent<SVGCircleElement>,
    endpoint: GradientEndpoint,
  ) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const currentValue =
      endpoint === 'start'
        ? profile.startFieldOffsetMillitesla
        : profile.endFieldOffsetMillitesla
    const direction = event.key === 'ArrowUp' ? 1 : -1
    onChange(
      updateEndpoint(
        profile,
        endpoint,
        clamp(
          currentValue + direction * KEYBOARD_FIELD_STEP_MILLITESLA,
          -maximumFieldOffsetMillitesla,
          maximumFieldOffsetMillitesla,
        ),
      ),
    )
  }

  const endpoints: ReadonlyArray<{
    endpoint: GradientEndpoint
    fieldOffsetMillitesla: number
    normalizedPosition: number
  }> = [
    {
      endpoint: 'start',
      fieldOffsetMillitesla: profile.startFieldOffsetMillitesla,
      normalizedPosition: 0,
    },
    {
      endpoint: 'end',
      fieldOffsetMillitesla: profile.endFieldOffsetMillitesla,
      normalizedPosition: 1,
    },
  ]
  const startY = fieldOffsetToY(profile.startFieldOffsetMillitesla)
  const endY = fieldOffsetToY(profile.endFieldOffsetMillitesla)
  const gradientStrength = gradientStrengthMilliteslaPerMeter(
    profile,
    fieldOfViewMillimeters,
  )

  return (
    <div
      className={`gradient-input spatial-gradient-input gradient-input-g${axis}${
        enabled ? '' : ' disabled'
      }`}
    >
      <header className="gradient-input-heading">
        <strong className="formula">
          G<sub>{axis}</sub>
        </strong>
        <span>{axisLabel}-axis field profile</span>
        <div className="gradient-input-actions">
          <label className="gradient-channel-toggle">
            <input
              type="checkbox"
              checked={enabled}
              aria-label={`Enable G ${axis} spatial gradient`}
              onChange={(event) =>
                onEnabledChange(event.currentTarget.checked)
              }
            />
            <span>On</span>
          </label>
          <button
            className="gradient-input-reset"
            type="button"
            aria-label={`Reset G ${axis} spatial gradient`}
            onClick={onReset}
          >
            Reset
          </button>
        </div>
      </header>

      <svg
        ref={svgRef}
        className="gradient-input-graph spatial-gradient-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="group"
        aria-label={`G ${axis} spatial gradient editable line`}
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
        <polygon
          className={`spatial-gradient-fill spatial-gradient-fill-${axis}`}
          points={`${GRAPH.left},${zeroY} ${GRAPH.left},${startY} ${
            GRAPH.left + plotWidth
          },${endY} ${GRAPH.left + plotWidth},${zeroY}`}
          aria-hidden="true"
        />
        <line
          className={lineClassName}
          x1={GRAPH.left}
          y1={startY}
          x2={GRAPH.left + plotWidth}
          y2={endY}
          aria-hidden="true"
        />

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
          {axis} · mm
        </text>
        <text
          className="spatial-gradient-axis-title"
          textAnchor="middle"
          transform={`translate(13 ${GRAPH.top + plotHeight / 2}) rotate(-90)`}
          aria-hidden="true"
        >
          ΔB₀ · mT
        </text>

        {endpoints.map(
          ({ endpoint, fieldOffsetMillitesla, normalizedPosition }) => {
            const x = positionToX(normalizedPosition)
            const y = fieldOffsetToY(fieldOffsetMillitesla)
            const positionMillimeters =
              normalizedPosition * fieldOfViewMillimeters

            return (
              <g className="spatial-gradient-endpoint" key={endpoint}>
                <circle
                  className={`spatial-gradient-endpoint-grip spatial-gradient-endpoint-grip-${axis}`}
                  cx={x}
                  cy={y}
                  r="4"
                  aria-hidden="true"
                />
                <circle
                  className={`spatial-gradient-endpoint-hit${
                    activeEndpoint === endpoint ? ' active' : ''
                  }`}
                  cx={x}
                  cy={y}
                  r="13"
                  role="slider"
                  tabIndex={0}
                  aria-label={`G ${axis} gradient ${positionMillimeters} millimeter endpoint`}
                  aria-orientation="vertical"
                  aria-valuemin={-maximumFieldOffsetMillitesla}
                  aria-valuemax={maximumFieldOffsetMillitesla}
                  aria-valuenow={fieldOffsetMillitesla}
                  aria-valuetext={`${formatFieldOffset(
                    fieldOffsetMillitesla,
                  )} millitesla field offset`}
                  onPointerDown={(event) => beginDrag(event, endpoint)}
                  onKeyDown={(event) => handleKeyDown(event, endpoint)}
                />
              </g>
            )
          },
        )}
      </svg>

      <footer className="spatial-gradient-meta">
        <span>
          0 mm {formatFieldOffset(profile.startFieldOffsetMillitesla)} mT
        </span>
        <span>
          {fieldOfViewMillimeters} mm{' '}
          {formatFieldOffset(profile.endFieldOffsetMillitesla)} mT
        </span>
        <strong>{formatFieldOffset(gradientStrength)} mT/m</strong>
      </footer>
    </div>
  )
}

function GradientEncodingExperimentPanel({
  fieldOfViewMillimeters,
  onXEnabledChange,
  onXProfileChange,
  onYEnabledChange,
  onYProfileChange,
  xEnabled,
  xProfile,
  yEnabled,
  yProfile,
}: GradientEncodingExperimentPanelProps) {
  const defaults = createDefaultSpatialGradientProfiles(
    fieldOfViewMillimeters,
  )
  const maximumFieldOffset = maximumEndpointFieldOffsetMillitesla(
    fieldOfViewMillimeters,
  )

  return (
    <section className="fundamental-gradient-section">
      <div className="section-heading">
        <div>
          <span className="section-index">01</span>
          <h2>Frequency Encoding</h2>
        </div>
      </div>

      <p className="gradient-input-instructions">
        Drag either endpoint to define the linear ΔB₀ profile across each
        spatial axis. The line slope is the applied gradient strength; the
        enabled G<sub>x</sub> and G<sub>y</sub> profiles are summed directly
        in the 3D magnetic-field and frequency surfaces.
      </p>

      <div className="spatial-gradient-stack">
        <SpatialGradientGraph
          axis="x"
          enabled={xEnabled}
          fieldOfViewMillimeters={fieldOfViewMillimeters}
          maximumFieldOffsetMillitesla={maximumFieldOffset}
          profile={xProfile}
          onChange={onXProfileChange}
          onEnabledChange={onXEnabledChange}
          onReset={() => onXProfileChange(defaults.x)}
        />
        <SpatialGradientGraph
          axis="y"
          enabled={yEnabled}
          fieldOfViewMillimeters={fieldOfViewMillimeters}
          maximumFieldOffsetMillitesla={maximumFieldOffset}
          profile={yProfile}
          onChange={onYProfileChange}
          onEnabledChange={onYEnabledChange}
          onReset={() => onYProfileChange(defaults.y)}
        />
      </div>
    </section>
  )
}

export default GradientEncodingExperimentPanel
