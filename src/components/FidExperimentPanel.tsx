import { useMemo } from 'react'
import type { FidSignalPoint } from '../simulation/fid'

interface FidExperimentPanelProps {
  graphWindowEndMilliseconds: number
  graphWindowStartMilliseconds: number
  signalPoints: ReadonlyArray<FidSignalPoint>
  timeStepMilliseconds: number
}

const GRAPH = {
  width: 440,
  height: 250,
  left: 58,
  right: 14,
  top: 18,
  bottom: 42,
}

function formatGraphTime(timeMilliseconds: number) {
  return Number.isInteger(timeMilliseconds)
    ? timeMilliseconds.toFixed(0)
    : timeMilliseconds.toFixed(2)
}

function FidGraph({
  windowEndMilliseconds,
  windowStartMilliseconds,
  points,
}: {
  windowEndMilliseconds: number
  windowStartMilliseconds: number
  points: ReadonlyArray<FidSignalPoint>
}) {
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const baselineY = GRAPH.top + plotHeight / 2
  const windowDurationMilliseconds =
    windowEndMilliseconds - windowStartMilliseconds
  const { laboratoryEnvelopePath, rotatingFramePath } = useMemo(() => {
    const graphX = (timeMilliseconds: number) =>
      GRAPH.left +
      ((timeMilliseconds - windowStartMilliseconds) /
        windowDurationMilliseconds) *
        plotWidth
    const graphY = (voltage: number) =>
      GRAPH.top + ((1 - voltage) / 2) * plotHeight
    const rotatingPath = points
      .map((point, index) => {
        const x = graphX(point.timeMilliseconds)
        const y = graphY(point.normalizedVoltage)
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')

    if (points.length === 0) {
      return { laboratoryEnvelopePath: '', rotatingFramePath: rotatingPath }
    }

    const upperEnvelope = points.map((point) => {
      const magnitude = Math.hypot(
        point.normalizedVoltage,
        point.normalizedQuadratureVoltage,
      )
      return `${graphX(point.timeMilliseconds).toFixed(2)} ${graphY(magnitude).toFixed(2)}`
    })
    const lowerEnvelope = [...points].reverse().map((point) => {
      const magnitude = Math.hypot(
        point.normalizedVoltage,
        point.normalizedQuadratureVoltage,
      )
      return `${graphX(point.timeMilliseconds).toFixed(2)} ${graphY(-magnitude).toFixed(2)}`
    })

    return {
      laboratoryEnvelopePath: `M ${upperEnvelope.join(' L ')} L ${lowerEnvelope.join(' L ')} Z`,
      rotatingFramePath: rotatingPath,
    }
  }, [
    plotHeight,
    plotWidth,
    points,
    windowDurationMilliseconds,
    windowStartMilliseconds,
  ])
  const latestPoint = points[points.length - 1]

  return (
    <div className="fid-graph-shell">
      <div className="fid-graph-readout">
        <div className="fid-graph-legend">
          <span className="rotating-frame">Rotating frame</span>
          <span className="laboratory-frame">Lab-frame envelope</span>
        </div>
        <strong>
          {latestPoint ? latestPoint.normalizedVoltage.toFixed(4) : '—'}
        </strong>
      </div>
      <svg
        className="fid-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="img"
        aria-label="Rotating-frame voltage and laboratory-frame carrier envelope over elapsed simulation time"
      >
        {laboratoryEnvelopePath && (
          <path
            className="fid-laboratory-envelope"
            d={laboratoryEnvelopePath}
          />
        )}
        <g className="fid-grid">
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

        <g className="fid-axis-labels">
          <text x={GRAPH.left - 10} y={GRAPH.top + 4} textAnchor="end">
            +1
          </text>
          <text x={GRAPH.left - 10} y={baselineY + 4} textAnchor="end">
            {formatGraphTime(windowStartMilliseconds)}
          </text>
          <text
            x={GRAPH.left - 10}
            y={GRAPH.top + plotHeight + 4}
            textAnchor="end"
          >
            −1
          </text>
          <text
            x={GRAPH.left}
            y={GRAPH.top + plotHeight + 19}
            textAnchor="middle"
          >
            0
          </text>
          <text
            x={GRAPH.left + plotWidth / 2}
            y={GRAPH.top + plotHeight + 19}
            textAnchor="middle"
          >
            {formatGraphTime(
              windowStartMilliseconds + windowDurationMilliseconds / 2,
            )}
          </text>
          <text
            x={GRAPH.left + plotWidth}
            y={GRAPH.top + plotHeight + 19}
            textAnchor="middle"
          >
            {formatGraphTime(windowEndMilliseconds)}
          </text>
          <text
            className="fid-x-axis-title"
            x={GRAPH.left + plotWidth / 2}
            y={GRAPH.height - 3}
            textAnchor="middle"
          >
            Time (ms)
          </text>
          <text
            className="fid-y-axis-title"
            x={14}
            y={GRAPH.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${GRAPH.top + plotHeight / 2})`}
          >
            Induced voltage (normalized)
          </text>
        </g>

        {rotatingFramePath && (
          <path className="fid-signal-path" d={rotatingFramePath} />
        )}
      </svg>
    </div>
  )
}

function T1RelaxationGraph({
  windowEndMilliseconds,
  windowStartMilliseconds,
  points,
}: {
  windowEndMilliseconds: number
  windowStartMilliseconds: number
  points: ReadonlyArray<FidSignalPoint>
}) {
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const midpointY = GRAPH.top + plotHeight / 2
  const windowDurationMilliseconds =
    windowEndMilliseconds - windowStartMilliseconds
  const relaxationPath = useMemo(() => {
    const graphX = (timeMilliseconds: number) =>
      GRAPH.left +
      ((timeMilliseconds - windowStartMilliseconds) /
        windowDurationMilliseconds) *
        plotWidth
    const graphY = (normalizedMagnetization: number) =>
      GRAPH.top + ((1 - normalizedMagnetization) / 2) * plotHeight

    return points
      .map((point, index) => {
        const x = graphX(point.timeMilliseconds)
        const y = graphY(point.normalizedLongitudinalMagnetization)
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }, [
    plotHeight,
    plotWidth,
    points,
    windowDurationMilliseconds,
    windowStartMilliseconds,
  ])
  const latestPoint = points[points.length - 1]

  return (
    <div className="fid-graph-shell t1-graph-shell">
      <div className="fid-graph-readout">
        <div className="fid-graph-legend">
          <span className="longitudinal-magnetization">
            Longitudinal M<sub>z</sub>
          </span>
        </div>
        <strong>
          M<sub>z</sub> / M<sub>0</sub> ={' '}
          {latestPoint
            ? latestPoint.normalizedLongitudinalMagnetization.toFixed(4)
            : '—'}
        </strong>
      </div>
      <svg
        className="fid-graph"
        viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
        role="img"
        aria-label="Longitudinal magnetization returning to equilibrium after the RF pulse"
      >
        <g className="fid-grid">
          <line
            x1={GRAPH.left}
            y1={GRAPH.top}
            x2={GRAPH.left + plotWidth}
            y2={GRAPH.top}
          />
          <line
            x1={GRAPH.left}
            y1={midpointY}
            x2={GRAPH.left + plotWidth}
            y2={midpointY}
          />
          <line
            x1={GRAPH.left}
            y1={GRAPH.top + plotHeight}
            x2={GRAPH.left + plotWidth}
            y2={GRAPH.top + plotHeight}
          />
          <line
            x1={GRAPH.left}
            y1={GRAPH.top}
            x2={GRAPH.left}
            y2={GRAPH.top + plotHeight}
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

        <g className="fid-axis-labels">
          <text x={GRAPH.left - 10} y={GRAPH.top + 4} textAnchor="end">
            M₀
          </text>
          <text x={GRAPH.left - 10} y={midpointY + 4} textAnchor="end">
            {formatGraphTime(windowStartMilliseconds)}
          </text>
          <text
            x={GRAPH.left - 10}
            y={GRAPH.top + plotHeight + 4}
            textAnchor="end"
          >
            −M₀
          </text>
          <text
            x={GRAPH.left}
            y={GRAPH.top + plotHeight + 19}
            textAnchor="middle"
          >
            0
          </text>
          <text
            x={GRAPH.left + plotWidth / 2}
            y={GRAPH.top + plotHeight + 19}
            textAnchor="middle"
          >
            {formatGraphTime(
              windowStartMilliseconds + windowDurationMilliseconds / 2,
            )}
          </text>
          <text
            x={GRAPH.left + plotWidth}
            y={GRAPH.top + plotHeight + 19}
            textAnchor="middle"
          >
            {formatGraphTime(windowEndMilliseconds)}
          </text>
          <text
            className="fid-x-axis-title"
            x={GRAPH.left + plotWidth / 2}
            y={GRAPH.height - 3}
            textAnchor="middle"
          >
            Time (ms)
          </text>
          <text
            className="fid-y-axis-title"
            x={14}
            y={GRAPH.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${GRAPH.top + plotHeight / 2})`}
          >
            Longitudinal magnetization
          </text>
        </g>

        {relaxationPath && (
          <path className="t1-relaxation-path" d={relaxationPath} />
        )}
      </svg>
    </div>
  )
}

function FidExperimentPanel({
  graphWindowEndMilliseconds,
  graphWindowStartMilliseconds,
  signalPoints,
  timeStepMilliseconds,
}: FidExperimentPanelProps) {
  return (
    <>
      <section className="fid-experiment-section">
        <div className="section-heading">
          <div>
            <span className="section-index">01</span>
            <h2>
              Free Induction Decay (T<sub>2</sub><sup>*</sup>)
            </h2>
          </div>
        </div>

        <FidGraph
          windowEndMilliseconds={graphWindowEndMilliseconds}
          windowStartMilliseconds={graphWindowStartMilliseconds}
          points={signalPoints}
        />

        <p className="fid-graph-note">
          The rotating-frame trace is shown directly; the unresolved laboratory
          carrier is shown by its exact ± envelope. Signals are normalized because
          coil sensitivity and geometry are not yet modeled. Simulation sampling
          interval Δt = {timeStepMilliseconds} ms/tick.
        </p>
      </section>

      <section className="t1-relaxation-section">
        <div className="section-heading">
          <div>
            <span className="section-index">02</span>
            <h2>
              T<sub>1</sub> Relaxation
            </h2>
          </div>
        </div>

        <T1RelaxationGraph
          windowEndMilliseconds={graphWindowEndMilliseconds}
          windowStartMilliseconds={graphWindowStartMilliseconds}
          points={signalPoints}
        />

        <p className="fid-graph-note">
          The curve remains at M<sub>0</sub> before excitation. After the 90°
          pulse, it is the M<sub>0</sub>-weighted sum of every active ensemble’s
          longitudinal recovery using that ensemble’s T<sub>1</sub>. Additional
          pulses rotate the magnetization from its state at that instant.
        </p>
      </section>
    </>
  )
}

export default FidExperimentPanel
