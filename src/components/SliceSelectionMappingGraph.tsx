import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  maximumSliceMappingAngularFrequencyKilradiansPerSecond,
  type TransmitFrequencyBand,
} from '../simulation/gradientEncoding'

interface SliceSelectionMappingGraphProps {
  gradientAmplitude: number
  gridSize: number
  onChange: (band: TransmitFrequencyBand) => void
  onReset: () => void
  transmitFrequencyBand: TransmitFrequencyBand
}

type FrequencyBoundary = 'lower' | 'upper'

interface FrequencyDrag {
  boundary: FrequencyBoundary
  pointerId: number
}

const GRAPH = {
  width: 460,
  height: 245,
  left: 58,
  right: 18,
  top: 18,
  bottom: 45,
}
const MINIMUM_BANDWIDTH_KILORADIANS_PER_SECOND = 0.02
const KEYBOARD_FREQUENCY_STEP_KILORADIANS_PER_SECOND = 0.05
const ZERO_GRADIENT_EPSILON = 1e-6

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatFrequency(value: number) {
  return value >= 10 ? value.toFixed(2) : value.toFixed(3)
}

function SliceSelectionMappingGraph({
  gradientAmplitude,
  gridSize,
  onChange,
  onReset,
  transmitFrequencyBand,
}: SliceSelectionMappingGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<FrequencyDrag | null>(null)
  const [activeBoundary, setActiveBoundary] =
    useState<FrequencyBoundary | null>(null)
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const baselineY = GRAPH.top + plotHeight
  const maximumPositionMillimeters = gridSize - 1
  const maximumAngularFrequency =
    maximumSliceMappingAngularFrequencyKilradiansPerSecond(gridSize)
  const lowerAngularFrequency = clamp(
    Math.min(
      transmitFrequencyBand.lowerAngularFrequencyKilradiansPerSecond,
      transmitFrequencyBand.upperAngularFrequencyKilradiansPerSecond,
    ),
    0,
    maximumAngularFrequency,
  )
  const upperAngularFrequency = clamp(
    Math.max(
      transmitFrequencyBand.lowerAngularFrequencyKilradiansPerSecond,
      transmitFrequencyBand.upperAngularFrequencyKilradiansPerSecond,
    ),
    0,
    maximumAngularFrequency,
  )
  const bandwidth = upperAngularFrequency - lowerAngularFrequency
  const positionToX = (positionMillimeters: number) =>
    GRAPH.left +
    (positionMillimeters / maximumPositionMillimeters) * plotWidth
  const frequencyToY = (frequencyKilradiansPerSecond: number) =>
    GRAPH.top +
    ((maximumAngularFrequency - frequencyKilradiansPerSecond) /
      maximumAngularFrequency) *
      plotHeight
  const absoluteGradientAmplitude = Math.abs(gradientAmplitude)
  const mappedFrequencySpan =
    maximumAngularFrequency * absoluteGradientAmplitude
  const angularFrequencySlope =
    maximumPositionMillimeters > 0
      ? mappedFrequencySpan / maximumPositionMillimeters
      : 0
  const gradientPositive = gradientAmplitude >= 0
  const gradientStartFrequency = gradientPositive
    ? 0
    : mappedFrequencySpan
  const gradientEndFrequency = gradientPositive
    ? mappedFrequencySpan
    : 0

  const intersectionAtFrequency = (frequency: number) => {
    if (
      absoluteGradientAmplitude < ZERO_GRADIENT_EPSILON ||
      frequency < 0 ||
      frequency > mappedFrequencySpan
    ) {
      return null
    }

    const positionFromLowerFrequencyEdge =
      frequency / angularFrequencySlope
    return gradientPositive
      ? positionFromLowerFrequencyEdge
      : maximumPositionMillimeters - positionFromLowerFrequencyEdge
  }

  const lowerIntersection = intersectionAtFrequency(lowerAngularFrequency)
  const upperIntersection = intersectionAtFrequency(upperAngularFrequency)
  const overlapLowerFrequency = Math.max(0, lowerAngularFrequency)
  const overlapUpperFrequency = Math.min(
    mappedFrequencySpan,
    upperAngularFrequency,
  )
  const bandOverlapsSlice =
    absoluteGradientAmplitude < ZERO_GRADIENT_EPSILON
      ? lowerAngularFrequency <= 0 && upperAngularFrequency >= 0
      : overlapUpperFrequency > overlapLowerFrequency
  const overlapLowerIntersection = bandOverlapsSlice
    ? intersectionAtFrequency(overlapLowerFrequency)
    : null
  const overlapUpperIntersection = bandOverlapsSlice
    ? intersectionAtFrequency(overlapUpperFrequency)
    : null
  const selectedPositionStart =
    overlapLowerIntersection !== null && overlapUpperIntersection !== null
      ? Math.min(overlapLowerIntersection, overlapUpperIntersection)
      : bandOverlapsSlice &&
          absoluteGradientAmplitude < ZERO_GRADIENT_EPSILON
        ? 0
        : null
  const selectedPositionEnd =
    overlapLowerIntersection !== null && overlapUpperIntersection !== null
      ? Math.max(overlapLowerIntersection, overlapUpperIntersection)
      : bandOverlapsSlice &&
          absoluteGradientAmplitude < ZERO_GRADIENT_EPSILON
        ? maximumPositionMillimeters
        : null
  const theoreticalSliceThickness =
    angularFrequencySlope > ZERO_GRADIENT_EPSILON
      ? bandwidth / angularFrequencySlope
      : null
  const bandCenterFrequency =
    (lowerAngularFrequency + upperAngularFrequency) / 2
  const selectedSliceCenter =
    angularFrequencySlope > ZERO_GRADIENT_EPSILON
      ? gradientPositive
        ? bandCenterFrequency / angularFrequencySlope
        : maximumPositionMillimeters -
          bandCenterFrequency / angularFrequencySlope
      : null

  const frequencyAtPointer = (clientY: number) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds) return 0
    const svgY = ((clientY - bounds.top) / bounds.height) * GRAPH.height
    return clamp(
      maximumAngularFrequency -
        ((svgY - GRAPH.top) / plotHeight) * maximumAngularFrequency,
      0,
      maximumAngularFrequency,
    )
  }

  const updateBoundary = (
    boundary: FrequencyBoundary,
    requestedFrequency: number,
  ) => {
    if (boundary === 'lower') {
      onChange({
        lowerAngularFrequencyKilradiansPerSecond: clamp(
          requestedFrequency,
          0,
          upperAngularFrequency -
            MINIMUM_BANDWIDTH_KILORADIANS_PER_SECOND,
        ),
        upperAngularFrequencyKilradiansPerSecond: upperAngularFrequency,
      })
    } else {
      onChange({
        lowerAngularFrequencyKilradiansPerSecond: lowerAngularFrequency,
        upperAngularFrequencyKilradiansPerSecond: clamp(
          requestedFrequency,
          lowerAngularFrequency +
            MINIMUM_BANDWIDTH_KILORADIANS_PER_SECOND,
          maximumAngularFrequency,
        ),
      })
    }
  }

  const beginDrag = (
    event: ReactPointerEvent<SVGLineElement>,
    boundary: FrequencyBoundary,
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { boundary, pointerId: event.pointerId }
    setActiveBoundary(boundary)
    updateBoundary(boundary, frequencyAtPointer(event.clientY))
  }

  const continueDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    updateBoundary(drag.boundary, frequencyAtPointer(event.clientY))
  }

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setActiveBoundary(null)
  }

  const handleBoundaryKeyDown = (
    event: ReactKeyboardEvent<SVGLineElement>,
    boundary: FrequencyBoundary,
  ) => {
    const currentFrequency =
      boundary === 'lower' ? lowerAngularFrequency : upperAngularFrequency
    let nextFrequency = currentFrequency
    if (event.key === 'ArrowUp') {
      nextFrequency +=
        KEYBOARD_FREQUENCY_STEP_KILORADIANS_PER_SECOND
    } else if (event.key === 'ArrowDown') {
      nextFrequency -=
        KEYBOARD_FREQUENCY_STEP_KILORADIANS_PER_SECOND
    } else if (event.key === 'Home') {
      nextFrequency = 0
    } else if (event.key === 'End') {
      nextFrequency = maximumAngularFrequency
    } else {
      return
    }

    event.preventDefault()
    updateBoundary(boundary, nextFrequency)
  }

  const horizontalBoundaryEndX = (intersection: number | null) =>
    intersection === null
      ? GRAPH.left + plotWidth
      : positionToX(intersection)
  const frequencyBandPath =
    lowerIntersection !== null && upperIntersection !== null
      ? `M ${GRAPH.left} ${frequencyToY(upperAngularFrequency)} L ${
          positionToX(upperIntersection)
        } ${frequencyToY(upperAngularFrequency)} L ${positionToX(
          lowerIntersection,
        )} ${frequencyToY(lowerAngularFrequency)} L ${GRAPH.left} ${
          frequencyToY(lowerAngularFrequency)
        } Z`
      : ''

  return (
    <div className="slice-selection-mapping">
      <header className="gradient-input-heading">
        <strong className="formula">
          ω ↔ z
        </strong>
        <span>Transmit bandwidth mapping</span>
        <button
          className="gradient-input-reset"
          type="button"
          title="Reset transmit bandwidth"
          aria-label="Reset transmit bandwidth"
          onClick={onReset}
        >
          Reset
        </button>
      </header>

      <svg
        ref={svgRef}
        className="slice-selection-mapping-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="group"
        aria-label="Slice-selection frequency-to-position mapping"
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g className="slice-mapping-grid" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={GRAPH.left + fraction * plotWidth}
                y1={GRAPH.top}
                x2={GRAPH.left + fraction * plotWidth}
                y2={baselineY}
              />
              <line
                x1={GRAPH.left}
                y1={GRAPH.top + fraction * plotHeight}
                x2={GRAPH.left + plotWidth}
                y2={GRAPH.top + fraction * plotHeight}
              />
            </g>
          ))}
        </g>
        <line
          className="slice-mapping-axis"
          x1={GRAPH.left}
          y1={GRAPH.top}
          x2={GRAPH.left}
          y2={baselineY}
          aria-hidden="true"
        />
        <line
          className="slice-mapping-axis"
          x1={GRAPH.left}
          y1={baselineY}
          x2={GRAPH.left + plotWidth}
          y2={baselineY}
          aria-hidden="true"
        />
        <line
          className="slice-mapping-gradient-line"
          x1={positionToX(0)}
          y1={frequencyToY(gradientStartFrequency)}
          x2={positionToX(maximumPositionMillimeters)}
          y2={frequencyToY(gradientEndFrequency)}
          aria-hidden="true"
        />
        <text
          className="slice-mapping-gradient-label"
          x={
            gradientPositive
              ? GRAPH.left + plotWidth - 7
              : GRAPH.left + 7
          }
          y={
            frequencyToY(mappedFrequencySpan) -
            (mappedFrequencySpan < maximumAngularFrequency * 0.08 ? 7 : -12)
          }
          textAnchor={gradientPositive ? 'end' : 'start'}
          aria-hidden="true"
        >
          GSS
        </text>

        {frequencyBandPath && (
          <path
            className="slice-mapping-frequency-band"
            d={frequencyBandPath}
            aria-hidden="true"
          />
        )}
        {overlapLowerIntersection !== null &&
          overlapUpperIntersection !== null && (
            <>
              <line
                className="slice-mapping-projection"
                x1={positionToX(overlapLowerIntersection)}
                y1={frequencyToY(overlapLowerFrequency)}
                x2={positionToX(overlapLowerIntersection)}
                y2={baselineY}
                aria-hidden="true"
              />
              <line
                className="slice-mapping-projection"
                x1={positionToX(overlapUpperIntersection)}
                y1={frequencyToY(overlapUpperFrequency)}
                x2={positionToX(overlapUpperIntersection)}
                y2={baselineY}
                aria-hidden="true"
              />
            </>
          )}
        {selectedPositionStart !== null && selectedPositionEnd !== null && (
          <rect
            className="slice-mapping-spatial-band"
            x={positionToX(selectedPositionStart)}
            y={baselineY - 9}
            width={Math.max(
              1,
              positionToX(selectedPositionEnd) -
                positionToX(selectedPositionStart),
            )}
            height="9"
            aria-hidden="true"
          />
        )}

        {(
          [
            {
              boundary: 'upper' as const,
              frequency: upperAngularFrequency,
              intersection: upperIntersection,
            },
            {
              boundary: 'lower' as const,
              frequency: lowerAngularFrequency,
              intersection: lowerIntersection,
            },
          ]
        ).map(({ boundary, frequency, intersection }) => {
          const edgeEndX = horizontalBoundaryEndX(intersection)
          const edgeMiddleX = (GRAPH.left + edgeEndX) / 2
          const hitStartX =
            boundary === 'upper' ? GRAPH.left : edgeMiddleX
          const hitEndX =
            boundary === 'upper' ? edgeMiddleX : edgeEndX
          const gripX =
            boundary === 'upper'
              ? Math.min(edgeEndX - 3, GRAPH.left + 8)
              : Math.max(GRAPH.left + 3, edgeEndX - 8)

          return (
            <g
              className={`slice-mapping-band-handle slice-mapping-band-handle-${boundary}`}
              key={boundary}
            >
              <line
                className="slice-mapping-band-edge"
                x1={GRAPH.left}
                y1={frequencyToY(frequency)}
                x2={edgeEndX}
                y2={frequencyToY(frequency)}
                aria-hidden="true"
              />
              <circle
                className="slice-mapping-band-grip"
                cx={gripX}
                cy={frequencyToY(frequency)}
                r="3.2"
                aria-hidden="true"
              />
              <line
                className={`slice-mapping-band-hit${
                  activeBoundary === boundary ? ' active' : ''
                }`}
                x1={hitStartX}
                y1={frequencyToY(frequency)}
                x2={hitEndX}
                y2={frequencyToY(frequency)}
                role="slider"
                tabIndex={0}
                aria-label={`${boundary} transmit-band angular frequency`}
                aria-orientation="vertical"
                aria-valuemin={0}
                aria-valuemax={maximumAngularFrequency}
                aria-valuenow={frequency}
                aria-valuetext={`${formatFrequency(frequency)} kiloradians per second`}
                onPointerDown={(event) => beginDrag(event, boundary)}
                onKeyDown={(event) =>
                  handleBoundaryKeyDown(event, boundary)
                }
              />
            </g>
          )
        })}

        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <text
            className="slice-mapping-tick"
            key={`position-${fraction}`}
            x={GRAPH.left + fraction * plotWidth}
            y={baselineY + 15}
            textAnchor="middle"
            aria-hidden="true"
          >
            {(fraction * maximumPositionMillimeters).toFixed(
              fraction === 0 || fraction === 1 ? 0 : 2,
            )}
          </text>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <text
            className="slice-mapping-tick"
            key={`frequency-${fraction}`}
            x={GRAPH.left - 8}
            y={frequencyToY(fraction * maximumAngularFrequency) + 3}
            textAnchor="end"
            aria-hidden="true"
          >
            {(fraction * maximumAngularFrequency).toFixed(
              fraction === 0 ? 0 : 1,
            )}
          </text>
        ))}
        <text
          className="slice-mapping-axis-label"
          x={GRAPH.left + plotWidth / 2}
          y={GRAPH.height - 3}
          textAnchor="middle"
          aria-hidden="true"
        >
          slice location z · mm
        </text>
        <text
          className="slice-mapping-axis-label"
          textAnchor="middle"
          transform={`translate(13 ${GRAPH.top + plotHeight / 2}) rotate(-90)`}
          aria-hidden="true"
        >
          ω − ωmin · krad/s
        </text>
      </svg>

      <div className="slice-mapping-meta">
        <span>
          Δω<sub>RF</sub> = {formatFrequency(bandwidth)} krad/s
        </span>
        <span>
          ω = {formatFrequency(lowerAngularFrequency)}–
          {formatFrequency(upperAngularFrequency)} krad/s
        </span>
        <strong>
          {!bandOverlapsSlice
            ? 'No spatial overlap'
            : theoreticalSliceThickness === null
              ? 'Whole volume selected'
              : selectedSliceCenter !== null
                ? `zc = ${selectedSliceCenter.toFixed(2)} mm · Δz = ${theoreticalSliceThickness.toFixed(2)} mm`
                : 'No spatial overlap'}
        </strong>
      </div>
    </div>
  )
}

export default SliceSelectionMappingGraph
