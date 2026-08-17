import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { FidEnsembleState } from '../simulation/fid'
import {
  createSpatialFourierProjection,
  createDefaultSpatialGradientProfiles,
  gradientStrengthMilliteslaPerMeter,
  maximumEndpointFieldOffsetMillitesla,
  projectedPositionMillimetersAtFrequency,
  spatialProjectionMaximumFieldOffsetTesla,
  type SpatialFourierProjection,
  type SpatialGradientProfile,
} from '../simulation/spatialGradient'
import {
  addBackprojection,
  backprojectionGrayscalePixels,
  backprojectSpatialProjection,
  spatialProjectionAngleBin,
  SPATIAL_RECONSTRUCTION_ANGLE_BIN_COUNT,
  SPATIAL_RECONSTRUCTION_GRID_SIZE,
  type SpatialBackprojectionFilter,
} from '../simulation/spatialReconstruction'
import DarkSelect from './DarkSelect'

export {
  combinedSpatialFieldOffsetMilliteslaAt,
  createDefaultSpatialGradientProfiles,
  gradientStrengthMilliteslaPerMeter,
} from '../simulation/spatialGradient'

type GradientAxis = 'x' | 'y'
type GradientEndpoint = 'start' | 'end'

interface GradientEncodingExperimentPanelProps {
  ensembleStates: ReadonlyArray<FidEnsembleState>
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
const PROJECTION_GRAPH = {
  bottom: 56,
  height: 244,
  left: 58,
  right: 18,
  top: 18,
  width: 460,
}
const BACKPROJECTION_FILTER_OPTIONS: ReadonlyArray<{
  id: SpatialBackprojectionFilter
  label: string
}> = [
  { id: 'hann-ramp', label: 'Filtered (Hann ramp)' },
  { id: 'unfiltered', label: 'Unfiltered' },
]

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatFieldOffset(value: number) {
  const normalizedValue = Math.abs(value) < 0.005 ? 0 : value
  const sign = normalizedValue > 0 ? '+' : normalizedValue < 0 ? '−' : ''
  return `${sign}${Math.abs(normalizedValue).toFixed(2)}`
}

function pathFromPoints(
  points: ReadonlyArray<{ x: number; y: number }>,
) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(' ')
}

function SignalFunctionGraph({
  projection,
}: {
  projection: SpatialFourierProjection
}) {
  const plotWidth =
    PROJECTION_GRAPH.width -
    PROJECTION_GRAPH.left -
    PROJECTION_GRAPH.right
  const plotHeight =
    PROJECTION_GRAPH.height -
    PROJECTION_GRAPH.top -
    PROJECTION_GRAPH.bottom
  const baselineY = PROJECTION_GRAPH.top + plotHeight / 2
  const graphX = (timeMilliseconds: number) =>
    PROJECTION_GRAPH.left +
    (timeMilliseconds / projection.timeWindowMilliseconds) * plotWidth
  const graphY = (value: number) =>
    PROJECTION_GRAPH.top + ((1 - value) / 2) * plotHeight
  const { imaginaryPath, realPath } = useMemo(
    () => ({
      imaginaryPath: pathFromPoints(
        projection.signalPoints.map((point) => ({
          x: graphX(point.timeMilliseconds),
          y: graphY(point.imaginary),
        })),
      ),
      realPath: pathFromPoints(
        projection.signalPoints.map((point) => ({
          x: graphX(point.timeMilliseconds),
          y: graphY(point.real),
        })),
      ),
    }),
    [projection],
  )

  return (
    <div className="spatial-projection-graph-shell">
      <header>
        <strong className="formula">S(t)</strong>
        <div className="spatial-projection-legend">
          <span className="signal-real">Re S</span>
          <span className="signal-imaginary">Im S</span>
        </div>
      </header>
      <svg
        className="spatial-projection-graph"
        viewBox={`0 0 ${PROJECTION_GRAPH.width} ${PROJECTION_GRAPH.height}`}
        role="img"
        aria-label="Complex signal function S of time"
      >
        <g className="spatial-projection-grid" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={`time-${fraction}`}
              x1={PROJECTION_GRAPH.left + fraction * plotWidth}
              y1={PROJECTION_GRAPH.top}
              x2={PROJECTION_GRAPH.left + fraction * plotWidth}
              y2={PROJECTION_GRAPH.top + plotHeight}
            />
          ))}
          {[-1, 0, 1].map((value) => (
            <line
              key={`signal-${value}`}
              x1={PROJECTION_GRAPH.left}
              y1={graphY(value)}
              x2={PROJECTION_GRAPH.left + plotWidth}
              y2={graphY(value)}
            />
          ))}
        </g>
        <g className="spatial-projection-axis-labels" aria-hidden="true">
          {[-1, 0, 1].map((value) => (
            <text
              key={`signal-label-${value}`}
              x={PROJECTION_GRAPH.left - 9}
              y={graphY(value) + 3}
              textAnchor="end"
            >
              {value > 0 ? '+1' : value === 0 ? '0' : '−1'}
            </text>
          ))}
          {[0, 0.5, 1].map((fraction) => (
            <text
              key={`time-label-${fraction}`}
              x={PROJECTION_GRAPH.left + fraction * plotWidth}
              y={PROJECTION_GRAPH.top + plotHeight + 19}
              textAnchor="middle"
            >
              {(fraction * projection.timeWindowMilliseconds).toFixed(2)}
            </text>
          ))}
          <text
            className="axis-title"
            x={PROJECTION_GRAPH.left + plotWidth / 2}
            y={PROJECTION_GRAPH.height - 3}
            textAnchor="middle"
          >
            t · ms
          </text>
          <text
            className="axis-title"
            textAnchor="middle"
            transform={`translate(14 ${baselineY}) rotate(-90)`}
          >
            normalized signal
          </text>
        </g>
        <path className="spatial-signal-real" d={realPath} />
        <path className="spatial-signal-imaginary" d={imaginaryPath} />
      </svg>
    </div>
  )
}

function FourierSpectrumGraph({
  centerFieldOffsetMillitesla,
  effectiveGradientMilliteslaPerMeter,
  projection,
}: {
  centerFieldOffsetMillitesla: number
  effectiveGradientMilliteslaPerMeter: number
  projection: SpatialFourierProjection
}) {
  const plotWidth =
    PROJECTION_GRAPH.width -
    PROJECTION_GRAPH.left -
    PROJECTION_GRAPH.right
  const plotHeight =
    PROJECTION_GRAPH.height -
    PROJECTION_GRAPH.top -
    PROJECTION_GRAPH.bottom
  const graphX = (frequencyKilohertz: number) =>
    PROJECTION_GRAPH.left +
    ((frequencyKilohertz + projection.maximumFrequencyKilohertz) /
      (2 * projection.maximumFrequencyKilohertz)) *
      plotWidth
  const graphY = (magnitude: number) =>
    PROJECTION_GRAPH.top + (1 - magnitude) * plotHeight
  const spectrumPath = useMemo(
    () =>
      pathFromPoints(
        projection.spectrumPoints.map((point) => ({
          x: graphX(point.frequencyKilohertz),
          y: graphY(point.magnitude),
        })),
      ),
    [projection],
  )
  const fillPath = `${spectrumPath} L ${(
    PROJECTION_GRAPH.left + plotWidth
  ).toFixed(2)} ${(PROJECTION_GRAPH.top + plotHeight).toFixed(
    2,
  )} L ${PROJECTION_GRAPH.left.toFixed(2)} ${(
    PROJECTION_GRAPH.top + plotHeight
  ).toFixed(2)} Z`
  const frequencyTicks = [-1, 0, 1].map((fraction) => {
    const frequencyKilohertz =
      fraction * projection.maximumFrequencyKilohertz
    return {
      frequencyKilohertz,
      fraction,
      positionMillimeters: projectedPositionMillimetersAtFrequency(
        frequencyKilohertz,
        centerFieldOffsetMillitesla,
        effectiveGradientMilliteslaPerMeter,
      ),
    }
  })

  return (
    <div className="spatial-projection-graph-shell">
      <header>
        <strong className="formula">F(ω)</strong>
        <span>1D frequency projection</span>
      </header>
      <svg
        className="spatial-projection-graph"
        viewBox={`0 0 ${PROJECTION_GRAPH.width} ${PROJECTION_GRAPH.height}`}
        role="img"
        aria-label="Fourier transform F of angular frequency"
      >
        <g className="spatial-projection-grid" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={`frequency-${fraction}`}
              x1={PROJECTION_GRAPH.left + fraction * plotWidth}
              y1={PROJECTION_GRAPH.top}
              x2={PROJECTION_GRAPH.left + fraction * plotWidth}
              y2={PROJECTION_GRAPH.top + plotHeight}
            />
          ))}
          {[0, 0.5, 1].map((magnitude) => (
            <line
              key={`magnitude-${magnitude}`}
              x1={PROJECTION_GRAPH.left}
              y1={graphY(magnitude)}
              x2={PROJECTION_GRAPH.left + plotWidth}
              y2={graphY(magnitude)}
            />
          ))}
        </g>
        <g className="spatial-projection-axis-labels" aria-hidden="true">
          {[0, 0.5, 1].map((magnitude) => (
            <text
              key={`magnitude-label-${magnitude}`}
              x={PROJECTION_GRAPH.left - 9}
              y={graphY(magnitude) + 3}
              textAnchor="end"
            >
              {magnitude.toFixed(1)}
            </text>
          ))}
          {frequencyTicks.map(
            ({ frequencyKilohertz, fraction, positionMillimeters }) => (
              <g key={`frequency-label-${fraction}`}>
                <text
                  x={graphX(frequencyKilohertz)}
                  y={PROJECTION_GRAPH.top + plotHeight + 17}
                  textAnchor="middle"
                >
                  {frequencyKilohertz.toFixed(0)} kHz
                </text>
                <text
                  className="spatial-position-label"
                  x={graphX(frequencyKilohertz)}
                  y={PROJECTION_GRAPH.top + plotHeight + 31}
                  textAnchor="middle"
                >
                  {positionMillimeters === null
                    ? 'not encoded'
                    : `${positionMillimeters.toFixed(
                        Math.abs(positionMillimeters) >= 100 ? 0 : 1,
                      )} mm`}
                </text>
              </g>
            ),
          )}
          <text
            className="axis-title"
            x={PROJECTION_GRAPH.left + plotWidth / 2}
            y={PROJECTION_GRAPH.height - 3}
            textAnchor="middle"
          >
            ω / 2π · kHz   /   r∥ · mm along G
          </text>
          <text
            className="axis-title"
            textAnchor="middle"
            transform={`translate(14 ${
              PROJECTION_GRAPH.top + plotHeight / 2
            }) rotate(-90)`}
          >
            relative magnitude
          </text>
        </g>
        <path className="spatial-spectrum-fill" d={fillPath} />
        <path className="spatial-spectrum-line" d={spectrumPath} />
      </svg>
    </div>
  )
}

function SpatialBackprojectionReconstruction({
  centerFieldOffsetMillitesla,
  fieldOfViewMillimeters,
  projection,
  sourceKey,
  xGradientMilliteslaPerMeter,
  yGradientMilliteslaPerMeter,
}: {
  centerFieldOffsetMillitesla: number
  fieldOfViewMillimeters: number
  projection: SpatialFourierProjection
  sourceKey: ReadonlyArray<FidEnsembleState>
  xGradientMilliteslaPerMeter: number
  yGradientMilliteslaPerMeter: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const filteredAccumulatorRef = useRef(
    new Float64Array(
      SPATIAL_RECONSTRUCTION_GRID_SIZE *
        SPATIAL_RECONSTRUCTION_GRID_SIZE,
    ),
  )
  const unfilteredAccumulatorRef = useRef(
    new Float64Array(
      SPATIAL_RECONSTRUCTION_GRID_SIZE *
        SPATIAL_RECONSTRUCTION_GRID_SIZE,
    ),
  )
  const acquiredAnglesRef = useRef(
    new Uint8Array(SPATIAL_RECONSTRUCTION_ANGLE_BIN_COUNT),
  )
  const sourceKeyRef = useRef(sourceKey)
  const acquiredProjectionCountRef = useRef(0)
  const [acquiredProjectionCount, setAcquiredProjectionCount] =
    useState(0)
  const [imageRevision, setImageRevision] = useState(0)
  const [filter, setFilter] =
    useState<SpatialBackprojectionFilter>('hann-ramp')

  const clearReconstruction = () => {
    filteredAccumulatorRef.current.fill(0)
    unfilteredAccumulatorRef.current.fill(0)
    acquiredAnglesRef.current.fill(0)
    acquiredProjectionCountRef.current = 0
    setAcquiredProjectionCount(0)
    setImageRevision((revision) => revision + 1)
  }

  useEffect(() => {
    if (sourceKeyRef.current === sourceKey) return
    sourceKeyRef.current = sourceKey
    clearReconstruction()
  }, [sourceKey])

  useEffect(() => {
    const angleBin = spatialProjectionAngleBin(
      xGradientMilliteslaPerMeter,
      yGradientMilliteslaPerMeter,
    )
    if (angleBin === null || acquiredAnglesRef.current[angleBin]) return

    const gradient = {
      centerFieldOffsetMillitesla,
      xGradientMilliteslaPerMeter,
      yGradientMilliteslaPerMeter,
    }
    const unfilteredBackprojection = backprojectSpatialProjection(
      projection,
      gradient,
      fieldOfViewMillimeters,
      SPATIAL_RECONSTRUCTION_GRID_SIZE,
      'unfiltered',
    )
    const filteredBackprojection = backprojectSpatialProjection(
      projection,
      gradient,
      fieldOfViewMillimeters,
      SPATIAL_RECONSTRUCTION_GRID_SIZE,
      'hann-ramp',
    )
    addBackprojection(
      unfilteredAccumulatorRef.current,
      unfilteredBackprojection,
    )
    addBackprojection(
      filteredAccumulatorRef.current,
      filteredBackprojection,
    )
    acquiredAnglesRef.current[angleBin] = 1
    acquiredProjectionCountRef.current += 1
    setAcquiredProjectionCount(acquiredProjectionCountRef.current)
    setImageRevision((revision) => revision + 1)
  }, [
    centerFieldOffsetMillitesla,
    fieldOfViewMillimeters,
    projection,
    sourceKey,
    xGradientMilliteslaPerMeter,
    yGradientMilliteslaPerMeter,
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const imageData = context.createImageData(
      SPATIAL_RECONSTRUCTION_GRID_SIZE,
      SPATIAL_RECONSTRUCTION_GRID_SIZE,
    )
    imageData.data.set(
      backprojectionGrayscalePixels(
        filter === 'hann-ramp'
          ? filteredAccumulatorRef.current
          : unfilteredAccumulatorRef.current,
        acquiredProjectionCount,
      ),
    )
    context.putImageData(imageData, 0, 0)
  }, [acquiredProjectionCount, filter, imageRevision])

  const coveragePercentage =
    (acquiredProjectionCount /
      SPATIAL_RECONSTRUCTION_ANGLE_BIN_COUNT) *
    100

  return (
    <div className="spatial-reconstruction-shell">
      <header>
        <div>
          <strong>
            Accumulated {filter === 'hann-ramp' ? 'filtered' : 'unfiltered'}{' '}
            backprojection
          </strong>
          <span>
            {filter === 'hann-ramp'
              ? 'Hann-windowed ramp · linear grayscale'
              : 'Raw projection smears · linear grayscale'}
          </span>
        </div>
        <div className="spatial-reconstruction-actions">
          <DarkSelect
            className="spatial-reconstruction-filter-select"
            ariaLabel="Backprojection filter"
            value={filter}
            options={BACKPROJECTION_FILTER_OPTIONS}
            onChange={setFilter}
          />
          <button
            className="gradient-input-reset"
            type="button"
            aria-label="Reset backprojection reconstruction"
            disabled={acquiredProjectionCount === 0}
            onClick={clearReconstruction}
          >
            Reset
          </button>
        </div>
      </header>
      <canvas
        ref={canvasRef}
        width={SPATIAL_RECONSTRUCTION_GRID_SIZE}
        height={SPATIAL_RECONSTRUCTION_GRID_SIZE}
        role="img"
        aria-label="Accumulated two-dimensional backprojection reconstruction"
      />
      <footer>
        <span>
          {acquiredProjectionCount} /{' '}
          {SPATIAL_RECONSTRUCTION_ANGLE_BIN_COUNT} angular projections
        </span>
        <strong>{coveragePercentage.toFixed(1)}% angular coverage</strong>
      </footer>
    </div>
  )
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
  ensembleStates,
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
  const xGradientStrength = xEnabled
    ? gradientStrengthMilliteslaPerMeter(xProfile, fieldOfViewMillimeters)
    : 0
  const yGradientStrength = yEnabled
    ? gradientStrengthMilliteslaPerMeter(yProfile, fieldOfViewMillimeters)
    : 0
  const effectiveGradientStrength = Math.hypot(
    xGradientStrength,
    yGradientStrength,
  )
  const centerFieldOffsetMillitesla =
    (xEnabled
      ? (xProfile.startFieldOffsetMillitesla +
          xProfile.endFieldOffsetMillitesla) /
        2
      : 0) +
    (yEnabled
      ? (yProfile.startFieldOffsetMillitesla +
          yProfile.endFieldOffsetMillitesla) /
        2
      : 0)
  const projection = useMemo(
    () =>
      createSpatialFourierProjection(
        ensembleStates,
        xEnabled ? xProfile : null,
        yEnabled ? yProfile : null,
        spatialProjectionMaximumFieldOffsetTesla(fieldOfViewMillimeters),
      ),
    [
      ensembleStates,
      fieldOfViewMillimeters,
      xEnabled,
      xProfile,
      yEnabled,
      yProfile,
    ],
  )

  return (
    <>
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

      <section className="fundamental-gradient-section spatial-projection-section">
        <div className="section-heading">
          <div>
            <span className="section-index">02</span>
            <h2>1D Fourier Transform Projection</h2>
          </div>
        </div>

        <p className="gradient-input-instructions">
          Every ensemble contributes to the complex received signal according
          to its proton-weighted magnetization and gradient-shifted frequency.
          F(ω) is the corresponding one-dimensional projection along the
          combined G<sub>x</sub> and G<sub>y</sub> direction.
        </p>

        <div className="spatial-projection-stack">
          <SignalFunctionGraph projection={projection} />
          <FourierSpectrumGraph
            centerFieldOffsetMillitesla={centerFieldOffsetMillitesla}
            effectiveGradientMilliteslaPerMeter={
              effectiveGradientStrength
            }
            projection={projection}
          />
        </div>
      </section>

      <section className="fundamental-gradient-section spatial-reconstruction-section">
        <div className="section-heading">
          <div>
            <span className="section-index">03</span>
            <h2>2D Reconstruction by Backprojection</h2>
          </div>
        </div>

        <p className="gradient-input-instructions">
          Each newly explored gradient angle spreads its F(ω) projection
          back across the slice, perpendicular to G. The accumulated smears
          can be viewed raw or after a Hann-windowed ramp filter suppresses
          the low-frequency backprojection haze.
        </p>

        <SpatialBackprojectionReconstruction
          centerFieldOffsetMillitesla={centerFieldOffsetMillitesla}
          fieldOfViewMillimeters={fieldOfViewMillimeters}
          projection={projection}
          sourceKey={ensembleStates}
          xGradientMilliteslaPerMeter={xGradientStrength}
          yGradientMilliteslaPerMeter={yGradientStrength}
        />
      </section>
    </>
  )
}

export default GradientEncodingExperimentPanel
