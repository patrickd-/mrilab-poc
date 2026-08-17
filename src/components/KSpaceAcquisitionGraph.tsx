import { useMemo } from 'react'
import { ADC_DWELL_TIME_MILLISECONDS } from '../hooks/useGradientAcquisition'
import type { GradientPlaybackStatus } from '../hooks/useGradientEncodingPlayback'
import {
  gradientKSpaceCyclesPerMeterAt,
  type GradientPulse,
  type GradientSignalPoint,
} from '../simulation/gradientEncoding'

interface KSpaceAcquisitionGraphProps {
  currentKxCyclesPerMeter: number
  currentKyCyclesPerMeter: number
  durationMilliseconds: number
  encodingStartTimeMilliseconds: number
  gradientImperfections: boolean
  phaseEncodingPulses: ReadonlyArray<GradientPulse>
  points: ReadonlyArray<GradientSignalPoint>
  readoutPulses: ReadonlyArray<GradientPulse>
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
const MINIMUM_EXTENT_CYCLES_PER_METER = 1000

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
  currentKxCyclesPerMeter,
  currentKyCyclesPerMeter,
  durationMilliseconds,
  encodingStartTimeMilliseconds,
  gradientImperfections,
  phaseEncodingPulses,
  points,
  readoutPulses,
  status,
}: KSpaceAcquisitionGraphProps) {
  const { extent, maximumMagnitude, segments } = useMemo(() => {
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
    const acquiredSegments = points.slice(1).flatMap((point, index) => {
      const previousPoint = points[index]
      if (
        point.timeMilliseconds - previousPoint.timeMilliseconds >
        ADC_DWELL_TIME_MILLISECONDS * 1.5
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
    })

    return {
      extent: niceSymmetricExtent(maximumKSpaceCoordinate),
      maximumMagnitude: greatestSignalMagnitude,
      segments: acquiredSegments,
    }
  }, [
    currentKxCyclesPerMeter,
    currentKyCyclesPerMeter,
    durationMilliseconds,
    encodingStartTimeMilliseconds,
    gradientImperfections,
    phaseEncodingPulses,
    points,
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

  return (
    <div className="k-space-acquisition-shell">
      <header>
        <div>
          <strong>K-space trajectory</strong>
          <span>ADC-weighted complex signal</span>
        </div>
        <small>
          k<sub>x</sub> {formatKSpaceAxisValue(currentKxCyclesPerMeter)} · k
          <sub>y</sub> {formatKSpaceAxisValue(currentKyCyclesPerMeter)} cycles/mm
        </small>
      </header>

      <svg
        className="k-space-acquisition-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="img"
        aria-label={`K-space trajectory with ${points.length} ADC-acquired complex signal samples; cursor at kx ${formatKSpaceAxisValue(currentKxCyclesPerMeter)} and ky ${formatKSpaceAxisValue(currentKyCyclesPerMeter)} cycles per millimeter`}
      >
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
          {points.length === 1 && (
            <circle
              cx={xForKx(points[0].kxCyclesPerMeter)}
              cy={yForKy(points[0].kyCyclesPerMeter)}
              r="1.6"
              fill={grayscaleForSignal(
                points[0].normalizedMagnitude,
                maximumMagnitude,
              )}
            />
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
        <div className="k-space-signal-key" aria-hidden="true">
          <span>Weak |S|</span>
          <i />
          <span>Strong |S|</span>
        </div>
        <strong>
          {points.length} samples
          {latestPoint
            ? ` · max |S| ${maximumMagnitude.toPrecision(3)}`
            : ''}
        </strong>
      </footer>
    </div>
  )
}

export default KSpaceAcquisitionGraph
