import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ADC_DWELL_TIME_MILLISECONDS,
  type GradientAcquisitionRun,
} from '../hooks/useGradientAcquisition'
import type { GradientPlaybackStatus } from '../hooks/useGradientEncodingPlayback'
import {
  cartesianKSpaceBoundsForGrid,
  gradientKSpaceCyclesPerMeterAt,
  type GradientPulse,
} from '../simulation/gradientEncoding'

interface KSpaceAcquisitionGraphProps {
  acquisitionRuns: ReadonlyArray<GradientAcquisitionRun>
  currentKxCyclesPerMeter: number
  currentKyCyclesPerMeter: number
  durationMilliseconds: number
  encodingStartTimeMilliseconds: number
  gradientImperfections: boolean
  gridSize: number
  onReconstructionVoxelSizeChange: (voxelSizeMillimeters: number) => void
  phaseEncodingPulses: ReadonlyArray<GradientPulse>
  readoutPulses: ReadonlyArray<GradientPulse>
  reconstructionVoxelSizeMillimeters: number
  status: GradientPlaybackStatus
}

const GRAPH = {
  width: 460,
  height: 378,
  left: 75,
  top: 18,
  size: 300,
}
const AXIS_SAMPLE_COUNT = 160
const MINIMUM_EXTENT_CYCLES_PER_METER = 500
const MINIMUM_NYQUIST_CYCLES_PER_METER = 50
const KEYBOARD_NYQUIST_STEP_CYCLES_PER_METER = 50

interface SupportDragState {
  pointerId: number
}

function niceSymmetricExtent(maximumAbsoluteValue: number) {
  const boundedMaximum = Math.max(
    MINIMUM_EXTENT_CYCLES_PER_METER,
    maximumAbsoluteValue,
  )
  const magnitude = 10 ** Math.floor(Math.log10(boundedMaximum))
  return Math.ceil(boundedMaximum / magnitude) * magnitude
}

function formatKSpaceAxisValue(cyclesPerMeter: number) {
  const cyclesPerMillimeter = cyclesPerMeter / 1000
  if (Math.abs(cyclesPerMillimeter) >= 10) {
    return cyclesPerMillimeter.toFixed(0)
  }
  if (Math.abs(cyclesPerMillimeter) >= 1) {
    return cyclesPerMillimeter.toFixed(1)
  }
  return cyclesPerMillimeter.toFixed(2)
}

function grayscaleForSignal(
  magnitude: number,
  maximumMagnitude: number,
) {
  const relativeMagnitude =
    maximumMagnitude < 1e-12
      ? 0
      : Math.min(1, Math.max(0, magnitude / maximumMagnitude))
  const grayscale = Math.round(26 + 229 * Math.sqrt(relativeMagnitude))
  return `rgb(${grayscale}, ${grayscale}, ${grayscale})`
}

function KSpaceAcquisitionGraph({
  acquisitionRuns,
  currentKxCyclesPerMeter,
  currentKyCyclesPerMeter,
  durationMilliseconds,
  encodingStartTimeMilliseconds,
  gradientImperfections,
  gridSize,
  onReconstructionVoxelSizeChange,
  phaseEncodingPulses,
  readoutPulses,
  reconstructionVoxelSizeMillimeters,
  status,
}: KSpaceAcquisitionGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const supportDragRef = useRef<SupportDragState | null>(null)
  const draftVoxelSizeRef = useRef<number | null>(null)
  const [draftVoxelSizeMillimeters, setDraftVoxelSizeMillimeters] =
    useState<number | null>(null)
  const controlledReconstructionSupport = cartesianKSpaceBoundsForGrid(
    gridSize,
    reconstructionVoxelSizeMillimeters,
  )
  const displayedVoxelSizeMillimeters =
    draftVoxelSizeMillimeters ?? reconstructionVoxelSizeMillimeters
  const reconstructionSupport = cartesianKSpaceBoundsForGrid(
    gridSize,
    displayedVoxelSizeMillimeters,
  )
  const { extent, maximumMagnitude, points, segments } = useMemo(() => {
    const points = acquisitionRuns.flatMap((run) => run.points)
    const plannedPoints = Array.from(
      { length: AXIS_SAMPLE_COUNT + 1 },
      (_, index) => {
        const timeMilliseconds =
          (index / AXIS_SAMPLE_COUNT) * durationMilliseconds
        return {
          kxCyclesPerMeter: gradientKSpaceCyclesPerMeterAt(
            readoutPulses,
            timeMilliseconds,
            durationMilliseconds,
            gradientImperfections,
            encodingStartTimeMilliseconds,
          ),
          kyCyclesPerMeter: gradientKSpaceCyclesPerMeterAt(
            phaseEncodingPulses,
            timeMilliseconds,
            durationMilliseconds,
            gradientImperfections,
            encodingStartTimeMilliseconds,
          ),
        }
      },
    )
    const maximumKSpaceCoordinate = Math.max(
      Math.abs(currentKxCyclesPerMeter),
      Math.abs(currentKyCyclesPerMeter),
      Math.abs(
        controlledReconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
      ),
      ...plannedPoints.flatMap((point) => [
        Math.abs(point.kxCyclesPerMeter),
        Math.abs(point.kyCyclesPerMeter),
      ]),
      ...points.flatMap((point) => [
        Math.abs(point.kxCyclesPerMeter),
        Math.abs(point.kyCyclesPerMeter),
      ]),
    )
    const greatestSignalMagnitude = Math.max(
      0,
      ...points.map((point) => point.normalizedMagnitude),
    )
    const acquiredSegments = acquisitionRuns.flatMap((run) =>
      run.points.slice(1).flatMap((point, index) => {
        const previousPoint = run.points[index]
        const elapsedMilliseconds =
          point.timeMilliseconds - previousPoint.timeMilliseconds
        if (
          elapsedMilliseconds <= 0 ||
          elapsedMilliseconds > ADC_DWELL_TIME_MILLISECONDS * 1.5
        ) {
          return []
        }
        return [
          {
            from: previousPoint,
            magnitude:
              (previousPoint.normalizedMagnitude +
                point.normalizedMagnitude) /
              2,
            to: point,
          },
        ]
      }),
    )

    return {
      extent: niceSymmetricExtent(maximumKSpaceCoordinate),
      maximumMagnitude: greatestSignalMagnitude,
      points,
      segments: acquiredSegments,
    }
  }, [
    acquisitionRuns,
    currentKxCyclesPerMeter,
    currentKyCyclesPerMeter,
    controlledReconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
    durationMilliseconds,
    encodingStartTimeMilliseconds,
    gradientImperfections,
    phaseEncodingPulses,
    readoutPulses,
  ])
  const xForKx = (kxCyclesPerMeter: number) =>
    GRAPH.left +
    ((kxCyclesPerMeter + extent) / (2 * extent)) * GRAPH.size
  const yForKy = (kyCyclesPerMeter: number) =>
    GRAPH.top +
    ((extent - kyCyclesPerMeter) / (2 * extent)) * GRAPH.size
  const cursorX = xForKx(currentKxCyclesPerMeter)
  const cursorY = yForKy(currentKyCyclesPerMeter)
  const latestPoint = points[points.length - 1]
  const nyquistCyclesPerMeter =
    reconstructionSupport.upperEdgeExclusiveCyclesPerMeter
  const fieldOfViewMillimeters =
    gridSize * displayedVoxelSizeMillimeters

  const voxelSizeForNyquist = (requestedNyquistCyclesPerMeter: number) =>
    (Math.ceil(gridSize / 2) * 1000) /
    (gridSize * requestedNyquistCyclesPerMeter)

  const nyquistAtPointer = (clientX: number, clientY: number) => {
    const bounds = svgRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return nyquistCyclesPerMeter
    }
    const svgX = ((clientX - bounds.left) / bounds.width) * GRAPH.width
    const svgY = ((clientY - bounds.top) / bounds.height) * GRAPH.height
    const kxCyclesPerMeter =
      ((svgX - GRAPH.left) / GRAPH.size) * 2 * extent - extent
    const kyCyclesPerMeter =
      extent - ((svgY - GRAPH.top) / GRAPH.size) * 2 * extent
    return Math.min(
      extent,
      Math.max(
        MINIMUM_NYQUIST_CYCLES_PER_METER,
        Math.abs(kxCyclesPerMeter),
        Math.abs(kyCyclesPerMeter),
      ),
    )
  }

  const updateDraftSupport = (nyquist: number) => {
    const nextVoxelSize = voxelSizeForNyquist(nyquist)
    draftVoxelSizeRef.current = nextVoxelSize
    setDraftVoxelSizeMillimeters(nextVoxelSize)
  }

  const beginSupportDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    supportDragRef.current = { pointerId: event.pointerId }
    updateDraftSupport(nyquistAtPointer(event.clientX, event.clientY))
  }

  const continueSupportDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (supportDragRef.current?.pointerId !== event.pointerId) return
    updateDraftSupport(nyquistAtPointer(event.clientX, event.clientY))
  }

  const endSupportDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (supportDragRef.current?.pointerId !== event.pointerId) return
    supportDragRef.current = null
    const nextVoxelSize = draftVoxelSizeRef.current
    draftVoxelSizeRef.current = null
    setDraftVoxelSizeMillimeters(null)
    if (nextVoxelSize !== null) {
      onReconstructionVoxelSizeChange(nextVoxelSize)
    }
  }

  const cancelSupportDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (supportDragRef.current?.pointerId !== event.pointerId) return
    supportDragRef.current = null
    draftVoxelSizeRef.current = null
    setDraftVoxelSizeMillimeters(null)
  }

  const handleSupportKeyDown = (
    event: ReactKeyboardEvent<SVGCircleElement>,
  ) => {
    let requestedNyquist = nyquistCyclesPerMeter
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      requestedNyquist += KEYBOARD_NYQUIST_STEP_CYCLES_PER_METER
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      requestedNyquist -= KEYBOARD_NYQUIST_STEP_CYCLES_PER_METER
    } else if (event.key === 'Home') {
      requestedNyquist = 500
    } else if (event.key === 'End') {
      requestedNyquist = extent
    } else {
      return
    }
    event.preventDefault()
    onReconstructionVoxelSizeChange(
      voxelSizeForNyquist(
        Math.max(MINIMUM_NYQUIST_CYCLES_PER_METER, requestedNyquist),
      ),
    )
  }

  return (
    <div className="k-space-acquisition-shell">
      <header>
        <div>
          <strong>K-space trajectory</strong>
          <span>ADC-weighted complex signal</span>
        </div>
        <div className="k-space-acquisition-meta">
          <small>
            k<sub>x</sub> {formatKSpaceAxisValue(currentKxCyclesPerMeter)} · k
            <sub>y</sub> {formatKSpaceAxisValue(currentKyCyclesPerMeter)}{' '}
            cycles/mm
          </small>
          <button
            className="gradient-input-reset"
            type="button"
            disabled={reconstructionVoxelSizeMillimeters === 1}
            title="Reset reconstruction support"
            aria-label="Reset reconstruction support"
            onClick={() => onReconstructionVoxelSizeChange(1)}
          >
            Reset support
          </button>
        </div>
      </header>

      <svg
        ref={svgRef}
        className="k-space-acquisition-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="img"
        aria-label={`K-space trajectory with ${points.length} ADC-acquired complex signal samples; cursor at kx ${formatKSpaceAxisValue(currentKxCyclesPerMeter)} and ky ${formatKSpaceAxisValue(currentKyCyclesPerMeter)} cycles per millimeter`}
        onPointerMove={continueSupportDrag}
        onPointerUp={endSupportDrag}
        onPointerCancel={cancelSupportDrag}
      >
        <rect
          className="k-space-reconstruction-support"
          x={xForKx(reconstructionSupport.minimumKCyclesPerMeter)}
          y={yForKy(
            reconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
          )}
          width={
            xForKx(
              reconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
            ) - xForKx(reconstructionSupport.minimumKCyclesPerMeter)
          }
          height={
            yForKy(reconstructionSupport.minimumKCyclesPerMeter) -
            yForKy(
              reconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
            )
          }
          data-k-min={reconstructionSupport.minimumKCyclesPerMeter}
          data-k-max-exclusive={
            reconstructionSupport.upperEdgeExclusiveCyclesPerMeter
          }
          aria-hidden="true"
        >
          <title>
            {gridSize} × {gridSize} reconstruction Nyquist support; samples
            outside this square alias into it
          </title>
        </rect>
        <g className="k-space-reconstruction-handles">
          {[
            [
              reconstructionSupport.minimumKCyclesPerMeter,
              reconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
            ],
            [
              reconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
              reconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
            ],
            [
              reconstructionSupport.minimumKCyclesPerMeter,
              reconstructionSupport.minimumKCyclesPerMeter,
            ],
            [
              reconstructionSupport.upperEdgeExclusiveCyclesPerMeter,
              reconstructionSupport.minimumKCyclesPerMeter,
            ],
          ].map(([kx, ky], index) => (
            <g key={index}>
              <circle
                className="k-space-reconstruction-grip"
                cx={xForKx(kx)}
                cy={yForKy(ky)}
                r="3"
                aria-hidden="true"
              />
              <circle
                className="k-space-reconstruction-hit"
                cx={xForKx(kx)}
                cy={yForKy(ky)}
                r="10"
                role="slider"
                tabIndex={0}
                aria-label="Reconstruction Nyquist extent"
                aria-valuemin={MINIMUM_NYQUIST_CYCLES_PER_METER / 1000}
                aria-valuemax={extent / 1000}
                aria-valuenow={nyquistCyclesPerMeter / 1000}
                aria-valuetext={`plus or minus ${formatKSpaceAxisValue(
                  nyquistCyclesPerMeter,
                )} cycles per millimeter`}
                onPointerDown={beginSupportDrag}
                onKeyDown={handleSupportKeyDown}
              />
            </g>
          ))}
        </g>
        <g className="k-space-acquisition-grid" aria-hidden="true">
          {[-1, -0.5, 0, 0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={xForKx(fraction * extent)}
                y1={GRAPH.top}
                x2={xForKx(fraction * extent)}
                y2={GRAPH.top + GRAPH.size}
              />
              <line
                x1={GRAPH.left}
                y1={yForKy(fraction * extent)}
                x2={GRAPH.left + GRAPH.size}
                y2={yForKy(fraction * extent)}
              />
            </g>
          ))}
        </g>
        <line
          className="k-space-acquisition-axis"
          x1={GRAPH.left}
          y1={yForKy(0)}
          x2={GRAPH.left + GRAPH.size}
          y2={yForKy(0)}
          aria-hidden="true"
        />
        <line
          className="k-space-acquisition-axis"
          x1={xForKx(0)}
          y1={GRAPH.top}
          x2={xForKx(0)}
          y2={GRAPH.top + GRAPH.size}
          aria-hidden="true"
        />

        <g className="k-space-acquired-trace" aria-hidden="true">
          {segments.map((segment, index) => (
            <line
              key={index}
              x1={xForKx(segment.from.kxCyclesPerMeter)}
              y1={yForKy(segment.from.kyCyclesPerMeter)}
              x2={xForKx(segment.to.kxCyclesPerMeter)}
              y2={yForKy(segment.to.kyCyclesPerMeter)}
              stroke={grayscaleForSignal(
                segment.magnitude,
                maximumMagnitude,
              )}
            />
          ))}
          {acquisitionRuns.flatMap((run) =>
            run.points.length === 1
              ? [
                  <circle
                    key={run.id}
                    cx={xForKx(run.points[0].kxCyclesPerMeter)}
                    cy={yForKy(run.points[0].kyCyclesPerMeter)}
                    r="1.6"
                    fill={grayscaleForSignal(
                      run.points[0].normalizedMagnitude,
                      maximumMagnitude,
                    )}
                  />,
                ]
              : [],
          )}
        </g>

        <g
          className={`k-space-cursor ${status}`}
          transform={`translate(${cursorX} ${cursorY})`}
          aria-hidden="true"
        >
          <circle className="cursor-halo" r="5.5" />
          <circle className="cursor-head" r="2.8" />
        </g>

        {[-1, 0, 1].map((fraction) => (
          <text
            className="k-space-axis-value"
            key={`kx-${fraction}`}
            x={xForKx(fraction * extent)}
            y={GRAPH.top + GRAPH.size + 18}
            textAnchor="middle"
            aria-hidden="true"
          >
            {formatKSpaceAxisValue(fraction * extent)}
          </text>
        ))}
        {[-1, 0, 1].map((fraction) => (
          <text
            className="k-space-axis-value"
            key={`ky-${fraction}`}
            x={GRAPH.left - 10}
            y={yForKy(fraction * extent) + 3}
            textAnchor="end"
            aria-hidden="true"
          >
            {formatKSpaceAxisValue(fraction * extent)}
          </text>
        ))}
        <text
          className="k-space-axis-title"
          x={GRAPH.left + GRAPH.size / 2}
          y={GRAPH.height - 3}
          textAnchor="middle"
          aria-hidden="true"
        >
          kₓ · cycles/mm
        </text>
        <text
          className="k-space-axis-title"
          textAnchor="middle"
          transform={`translate(17 ${GRAPH.top + GRAPH.size / 2}) rotate(-90)`}
          aria-hidden="true"
        >
          kᵧ · cycles/mm
        </text>
      </svg>

      <footer>
        <div className="k-space-footer-keys" aria-hidden="true">
          <div className="k-space-signal-key">
            <span>Weak |S|</span>
            <i />
            <span>Strong |S|</span>
          </div>
          <div className="k-space-reconstruction-key">
            <i />
            <span>
              ±{formatKSpaceAxisValue(nyquistCyclesPerMeter)} cycles/mm ·{' '}
              {displayedVoxelSizeMillimeters.toFixed(3)} mm/px ·{' '}
              {fieldOfViewMillimeters.toFixed(1)} mm FOV
            </span>
          </div>
        </div>
        <strong>
          {acquisitionRuns.length} acquisition
          {acquisitionRuns.length === 1 ? '' : 's'} · {points.length} samples
          {latestPoint
            ? ` · max |S| ${maximumMagnitude.toPrecision(3)}`
            : ''}
        </strong>
      </footer>
    </div>
  )
}

export default KSpaceAcquisitionGraph
