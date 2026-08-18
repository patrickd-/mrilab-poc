import { useMemo } from 'react'
import type {
  GradientPulse,
  GradientSignalPoint,
} from '../simulation/gradientEncoding'

interface GradientAcquisitionGraphProps {
  adcPulses: ReadonlyArray<GradientPulse>
  durationMilliseconds: number
  emptyLabel?: string
  points: ReadonlyArray<GradientSignalPoint>
  xAxisLabel?: string
}

const GRAPH = {
  width: 460,
  height: 230,
  left: 54,
  right: 16,
  top: 18,
  bottom: 42,
}

function signalPlotRange(points: ReadonlyArray<GradientSignalPoint>) {
  const maximumAbsoluteSignal = points.reduce(
    (maximum, point) =>
      Math.max(
        maximum,
        Math.abs(point.normalizedInPhaseSignal),
        Math.abs(point.normalizedQuadratureSignal),
      ),
    0,
  )
  if (maximumAbsoluteSignal < 1e-12) return 1

  const paddedMaximum = maximumAbsoluteSignal * 1.08
  const exponent = Math.floor(Math.log10(paddedMaximum))
  const magnitude = 10 ** exponent
  const fraction = paddedMaximum / magnitude
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * magnitude
}

function formatSignalAxisValue(value: number) {
  if (value >= 0.01) {
    return value
      .toFixed(value >= 1 ? 1 : 3)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*?)0+$/, '$1')
  }
  return value.toExponential(1).replace('e-', 'e−')
}

function GradientAcquisitionGraph({
  adcPulses,
  durationMilliseconds,
  emptyLabel = 'Awaiting ADC window',
  points,
  xAxisLabel = 'Sequence time (ms)',
}: GradientAcquisitionGraphProps) {
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const baselineY = GRAPH.top + plotHeight / 2
  const firstAdcPulse = adcPulses[0]
  const windowStartMilliseconds =
    (firstAdcPulse?.start ?? 0) * durationMilliseconds
  const windowEndMilliseconds =
    (firstAdcPulse?.end ?? 1) * durationMilliseconds
  const windowDurationMilliseconds = Math.max(
    1e-9,
    windowEndMilliseconds - windowStartMilliseconds,
  )
  const plotRange = signalPlotRange(points)
  const { inPhasePath, quadraturePath } = useMemo(() => {
    const graphX = (timeMilliseconds: number) =>
      GRAPH.left +
      ((timeMilliseconds - windowStartMilliseconds) /
        windowDurationMilliseconds) *
        plotWidth
    const graphY = (signal: number) =>
      GRAPH.top +
      ((plotRange -
        Math.max(-plotRange, Math.min(plotRange, signal))) /
        (2 * plotRange)) *
        plotHeight
    const pathFor = (
      valueAt: (point: GradientSignalPoint) => number,
    ) =>
      points
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'} ${graphX(
              point.timeMilliseconds,
            ).toFixed(2)} ${graphY(valueAt(point)).toFixed(2)}`,
        )
        .join(' ')

    return {
      inPhasePath: pathFor((point) => point.normalizedInPhaseSignal),
      quadraturePath: pathFor(
        (point) => point.normalizedQuadratureSignal,
      ),
    }
  }, [
    plotHeight,
    plotWidth,
    plotRange,
    points,
    windowDurationMilliseconds,
    windowStartMilliseconds,
  ])
  const latestPoint = points[points.length - 1]

  return (
    <div className="gradient-acquisition-graph-shell">
      <header>
        <div className="gradient-acquisition-legend">
          <span className="in-phase">I · real</span>
          <span className="quadrature">Q · imaginary</span>
        </div>
        <strong>
          {latestPoint
            ? `I ${latestPoint.normalizedInPhaseSignal.toFixed(4)} · Q ${latestPoint.normalizedQuadratureSignal.toFixed(4)}`
            : emptyLabel}
        </strong>
      </header>
      <svg
        className="gradient-acquisition-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="img"
        aria-label="Complex signal samples acquired while the ADC gate is high"
      >
        <g className="gradient-acquisition-grid" aria-hidden="true">
          <line
            x1={GRAPH.left}
            y1={GRAPH.top}
            x2={GRAPH.left}
            y2={GRAPH.top + plotHeight}
          />
          <line
            x1={GRAPH.left}
            y1={baselineY}
            x2={GRAPH.left + plotWidth}
            y2={baselineY}
          />
          <line
            x1={GRAPH.left + plotWidth / 2}
            y1={GRAPH.top}
            x2={GRAPH.left + plotWidth / 2}
            y2={GRAPH.top + plotHeight}
          />
          <line
            x1={GRAPH.left + plotWidth}
            y1={GRAPH.top}
            x2={GRAPH.left + plotWidth}
            y2={GRAPH.top + plotHeight}
          />
        </g>
        <g className="gradient-acquisition-axis-labels">
          <text x={GRAPH.left - 9} y={GRAPH.top + 4} textAnchor="end">
            +{formatSignalAxisValue(plotRange)}
          </text>
          <text x={GRAPH.left - 9} y={baselineY + 4} textAnchor="end">
            0
          </text>
          <text
            x={GRAPH.left - 9}
            y={GRAPH.top + plotHeight + 4}
            textAnchor="end"
          >
            −{formatSignalAxisValue(plotRange)}
          </text>
          <text
            x={GRAPH.left}
            y={GRAPH.top + plotHeight + 18}
            textAnchor="middle"
          >
            {windowStartMilliseconds.toFixed(2)}
          </text>
          <text
            x={GRAPH.left + plotWidth / 2}
            y={GRAPH.top + plotHeight + 18}
            textAnchor="middle"
          >
            {(
              windowStartMilliseconds +
              windowDurationMilliseconds / 2
            ).toFixed(2)}
          </text>
          <text
            x={GRAPH.left + plotWidth}
            y={GRAPH.top + plotHeight + 18}
            textAnchor="middle"
          >
            {windowEndMilliseconds.toFixed(2)}
          </text>
          <text
            className="gradient-acquisition-x-axis-title"
            x={GRAPH.left + plotWidth / 2}
            y={GRAPH.height - 3}
            textAnchor="middle"
          >
            {xAxisLabel}
          </text>
          <text
            className="gradient-acquisition-y-axis-title"
            x={13}
            y={GRAPH.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 13 ${GRAPH.top + plotHeight / 2})`}
          >
            Signal (normalized)
          </text>
        </g>
        {inPhasePath && (
          <path className="gradient-acquisition-i-path" d={inPhasePath} />
        )}
        {quadraturePath && (
          <path
            className="gradient-acquisition-q-path"
            d={quadraturePath}
          />
        )}
      </svg>
      <footer>
        <span>{points.length} complex samples</span>
        <span>
          {latestPoint
            ? `|S| = ${latestPoint.normalizedMagnitude.toFixed(4)}`
            : '|S| = —'}
        </span>
      </footer>
    </div>
  )
}

export default GradientAcquisitionGraph
