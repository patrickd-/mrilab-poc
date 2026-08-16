import { useMemo } from 'react'
import type { FidSignalPoint, RfPulseEvent } from '../simulation/fid'

interface SpinEchoExperimentPanelProps {
  graphWindowEndMilliseconds: number
  graphWindowStartMilliseconds: number
  pulseEvents: ReadonlyArray<RfPulseEvent>
  signalPoints: ReadonlyArray<FidSignalPoint>
  timeMilliseconds: number
  timeStepMilliseconds: number
}

interface EchoTiming {
  pulseTimeMilliseconds: number
  previousPeakTimeMilliseconds: number
  echoTimeMilliseconds: number
  tauMilliseconds: number
}

interface EchoPeak extends EchoTiming {
  magnitude: number
}

interface MeasuredDecayPeak {
  peakTimeMilliseconds: number
  magnitude: number
  kind: 'excitation' | 'echo'
}

const GRAPH = {
  width: 440,
  height: 270,
  left: 58,
  right: 14,
  top: 50,
  bottom: 42,
}

function formatTime(timeMilliseconds: number) {
  return Number.isInteger(timeMilliseconds)
    ? timeMilliseconds.toFixed(0)
    : timeMilliseconds.toFixed(2)
}

function echoTimingsFor(pulseEvents: ReadonlyArray<RfPulseEvent>) {
  const initialPulse = pulseEvents.find((pulse) => pulse.kind === '90-y')
  if (!initialPulse) return []

  const knownPeakTimes = [initialPulse.timeMilliseconds]
  const echoTimings: EchoTiming[] = []

  pulseEvents.forEach((pulse) => {
    if (pulse.kind !== '180-x') return

    const previousPeakTimeMilliseconds = knownPeakTimes.reduce(
      (latestPeak, peakTime) =>
        peakTime <= pulse.timeMilliseconds && peakTime > latestPeak
          ? peakTime
          : latestPeak,
      initialPulse.timeMilliseconds,
    )
    const tauMilliseconds =
      pulse.timeMilliseconds - previousPeakTimeMilliseconds
    if (tauMilliseconds <= 0) return

    const echoTimeMilliseconds =
      pulse.timeMilliseconds + tauMilliseconds
    echoTimings.push({
      pulseTimeMilliseconds: pulse.timeMilliseconds,
      previousPeakTimeMilliseconds,
      echoTimeMilliseconds,
      tauMilliseconds,
    })
    knownPeakTimes.push(echoTimeMilliseconds)
  })

  return echoTimings
}

function signalMagnitudeNear(
  points: ReadonlyArray<FidSignalPoint>,
  targetTimeMilliseconds: number,
  toleranceMilliseconds: number,
) {
  if (points.length === 0) return null

  let lowerBound = 0
  let upperBound = points.length
  while (lowerBound < upperBound) {
    const midpoint = Math.floor((lowerBound + upperBound) / 2)
    if (points[midpoint].timeMilliseconds < targetTimeMilliseconds) {
      lowerBound = midpoint + 1
    } else {
      upperBound = midpoint
    }
  }

  let bestMagnitude = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (
    let index = Math.max(0, lowerBound - 3);
    index < Math.min(points.length, lowerBound + 4);
    index += 1
  ) {
    const point = points[index]
    const distance = Math.abs(
      point.timeMilliseconds - targetTimeMilliseconds,
    )
    if (distance > toleranceMilliseconds || distance > bestDistance) continue

    bestDistance = distance
    bestMagnitude = Math.hypot(
      point.normalizedVoltage,
      point.normalizedQuadratureVoltage,
    )
  }

  return bestMagnitude < 0 ? null : bestMagnitude
}

function fitEchoDecay(decayPeaks: ReadonlyArray<MeasuredDecayPeak>) {
  if (decayPeaks.length < 2) return null

  const validPeaks = decayPeaks.filter((peak) => peak.magnitude > 1e-8)
  if (validPeaks.length < 2) return null

  const meanTime =
    validPeaks.reduce(
      (sum, peak) => sum + peak.peakTimeMilliseconds,
      0,
    ) / validPeaks.length
  const meanLogMagnitude =
    validPeaks.reduce(
      (sum, peak) => sum + Math.log(peak.magnitude),
      0,
    ) / validPeaks.length
  let covariance = 0
  let timeVariance = 0

  validPeaks.forEach((peak) => {
    const centeredTime = peak.peakTimeMilliseconds - meanTime
    covariance +=
      centeredTime * (Math.log(peak.magnitude) - meanLogMagnitude)
    timeVariance += centeredTime ** 2
  })

  if (timeVariance === 0) return null
  const slope = covariance / timeVariance
  if (slope >= 0) return null

  return {
    estimatedT2Milliseconds: -1 / slope,
    magnitudeAt: (timeMilliseconds: number) =>
      Math.exp(
        meanLogMagnitude + slope * (timeMilliseconds - meanTime),
      ),
  }
}

function SpinEchoExperimentPanel({
  graphWindowEndMilliseconds,
  graphWindowStartMilliseconds,
  pulseEvents,
  signalPoints,
  timeMilliseconds,
  timeStepMilliseconds,
}: SpinEchoExperimentPanelProps) {
  const echoTimings = useMemo(
    () => echoTimingsFor(pulseEvents),
    [pulseEvents],
  )
  const initialPulse = pulseEvents.find((pulse) => pulse.kind === '90-y')
  const pendingEcho = [...echoTimings]
    .reverse()
    .find((echo) => echo.echoTimeMilliseconds > timeMilliseconds)
  const windowEndMilliseconds = Math.max(
    graphWindowEndMilliseconds,
    pendingEcho?.echoTimeMilliseconds ?? 0,
  )
  const originalWindowDuration =
    graphWindowEndMilliseconds - graphWindowStartMilliseconds
  const windowStartMilliseconds = Math.max(
    0,
    Math.min(
      graphWindowStartMilliseconds,
      windowEndMilliseconds - originalWindowDuration,
    ),
  )
  const windowDurationMilliseconds = Math.max(
    1,
    windowEndMilliseconds - windowStartMilliseconds,
  )
  const plotWidth = GRAPH.width - GRAPH.left - GRAPH.right
  const plotHeight = GRAPH.height - GRAPH.top - GRAPH.bottom
  const graphX = (sampleTimeMilliseconds: number) =>
    GRAPH.left +
    ((sampleTimeMilliseconds - windowStartMilliseconds) /
      windowDurationMilliseconds) *
      plotWidth
  const graphY = (magnitude: number) =>
    GRAPH.top + (1 - magnitude) * plotHeight

  const echoPeaks = useMemo(
    () =>
      echoTimings.flatMap<EchoPeak>((echo) => {
        if (echo.echoTimeMilliseconds > timeMilliseconds) return []
        const magnitude = signalMagnitudeNear(
          signalPoints,
          echo.echoTimeMilliseconds,
          Math.max(timeStepMilliseconds * 1.1, 1e-6),
        )
        return magnitude === null ? [] : [{ ...echo, magnitude }]
      }),
    [echoTimings, signalPoints, timeMilliseconds, timeStepMilliseconds],
  )
  const decayPeaks = useMemo<MeasuredDecayPeak[]>(
    () => [
      ...(initialPulse
        ? [
            {
              peakTimeMilliseconds: initialPulse.timeMilliseconds,
              magnitude: 1,
              kind: 'excitation' as const,
            },
          ]
        : []),
      ...echoPeaks.map((peak) => ({
        peakTimeMilliseconds: peak.echoTimeMilliseconds,
        magnitude: peak.magnitude,
        kind: 'echo' as const,
      })),
    ],
    [echoPeaks, initialPulse],
  )
  const decayFit = useMemo(() => fitEchoDecay(decayPeaks), [decayPeaks])
  const { echoPeakPath, fitPath, signalPath } = useMemo(() => {
    const visibleSignalPoints = signalPoints.filter(
      (point) =>
        point.timeMilliseconds >= windowStartMilliseconds &&
        point.timeMilliseconds <= windowEndMilliseconds,
    )
    const nextSignalPath = visibleSignalPoints
      .map((point, index) => {
        const magnitude = Math.hypot(
          point.normalizedVoltage,
          point.normalizedQuadratureVoltage,
        )
        return `${index === 0 ? 'M' : 'L'} ${graphX(point.timeMilliseconds).toFixed(2)} ${graphY(magnitude).toFixed(2)}`
      })
      .join(' ')
    const visibleDecayPeaks = decayPeaks.filter(
      (peak) =>
        peak.peakTimeMilliseconds >= windowStartMilliseconds &&
        peak.peakTimeMilliseconds <= windowEndMilliseconds,
    )
    const nextEchoPeakPath = visibleDecayPeaks
      .map(
        (peak, index) =>
          `${index === 0 ? 'M' : 'L'} ${graphX(peak.peakTimeMilliseconds).toFixed(2)} ${graphY(peak.magnitude).toFixed(2)}`,
      )
      .join(' ')

    if (!decayFit || visibleDecayPeaks.length < 2) {
      return {
        echoPeakPath: nextEchoPeakPath,
        fitPath: '',
        signalPath: nextSignalPath,
      }
    }

    const fitStart = visibleDecayPeaks[0].peakTimeMilliseconds
    const fitEnd =
      visibleDecayPeaks[visibleDecayPeaks.length - 1].peakTimeMilliseconds
    const fitSamples = Array.from({ length: 80 }, (_, index) => {
      const fitTime = fitStart + ((fitEnd - fitStart) * index) / 79
      return `${index === 0 ? 'M' : 'L'} ${graphX(fitTime).toFixed(2)} ${graphY(decayFit.magnitudeAt(fitTime)).toFixed(2)}`
    }).join(' ')

    return {
      echoPeakPath: nextEchoPeakPath,
      fitPath: fitSamples,
      signalPath: nextSignalPath,
    }
  }, [
    decayFit,
    decayPeaks,
    graphX,
    graphY,
    signalPoints,
    windowEndMilliseconds,
    windowStartMilliseconds,
  ])

  const visibleTimings = echoTimings.filter(
    (echo) =>
      echo.echoTimeMilliseconds >= windowStartMilliseconds &&
      echo.previousPeakTimeMilliseconds <= windowEndMilliseconds,
  )

  return (
    <section className="spin-echo-section">
      <div className="section-heading">
        <div>
          <span className="section-index">01</span>
          <h2>Spin Echo Phasor Diagram</h2>
        </div>
      </div>

      <div className="fid-graph-shell spin-echo-graph-shell">
        <div className="fid-graph-readout">
          <div className="fid-graph-legend">
            <span className="spin-echo-signal">Transverse signal</span>
            <span className="spin-echo-fit">Peak-envelope T₂ fit</span>
          </div>
          <strong>
            T₂ ≈{' '}
            {decayFit
              ? `${decayFit.estimatedT2Milliseconds.toFixed(1)} ms`
              : '—'}
          </strong>
        </div>

        <svg
          className="fid-graph"
          viewBox={`0 0 ${GRAPH.width} ${GRAPH.height}`}
          role="img"
          aria-label="Spin echo signal, RF pulses, symmetric tau intervals, and echo-peak T2 fit"
        >
          <g className="fid-grid">
            <line
              x1={GRAPH.left}
              y1={GRAPH.top}
              x2={GRAPH.left}
              y2={GRAPH.top + plotHeight}
            />
            <line
              x1={GRAPH.left}
              y1={GRAPH.top}
              x2={GRAPH.left + plotWidth}
              y2={GRAPH.top}
            />
            <line
              x1={GRAPH.left}
              y1={GRAPH.top + plotHeight / 2}
              x2={GRAPH.left + plotWidth}
              y2={GRAPH.top + plotHeight / 2}
            />
            <line
              x1={GRAPH.left}
              y1={GRAPH.top + plotHeight}
              x2={GRAPH.left + plotWidth}
              y2={GRAPH.top + plotHeight}
            />
          </g>

          {signalPath && <path className="spin-echo-signal-path" d={signalPath} />}
          {echoPeakPath && (
            <path className="spin-echo-peak-path" d={echoPeakPath} />
          )}
          {fitPath && <path className="spin-echo-fit-path" d={fitPath} />}

          <g className="spin-echo-events">
            {initialPulse &&
              initialPulse.timeMilliseconds >= windowStartMilliseconds &&
              initialPulse.timeMilliseconds <= windowEndMilliseconds && (
                <g>
                  <line
                    className="rf-pulse-marker initial"
                    x1={graphX(initialPulse.timeMilliseconds)}
                    y1={GRAPH.top - 5}
                    x2={graphX(initialPulse.timeMilliseconds)}
                    y2={GRAPH.top + plotHeight}
                  />
                  <text
                    x={graphX(initialPulse.timeMilliseconds) + 4}
                    y={GRAPH.top - 9}
                  >
                    90°
                  </text>
                </g>
              )}

            {visibleTimings.map((echo, index) => {
              const pulseX = graphX(echo.pulseTimeMilliseconds)
              const previousPeakX = graphX(
                echo.previousPeakTimeMilliseconds,
              )
              const echoX = graphX(echo.echoTimeMilliseconds)
              const bracketY = 18 + (index % 2) * 13

              return (
                <g key={`${echo.pulseTimeMilliseconds}-${index}`}>
                  <line
                    className="rf-pulse-marker refocusing"
                    x1={pulseX}
                    y1={GRAPH.top - 5}
                    x2={pulseX}
                    y2={GRAPH.top + plotHeight}
                  />
                  <text x={pulseX + 4} y={GRAPH.top - 9}>
                    180°
                  </text>
                  <line
                    className="echo-marker"
                    x1={echoX}
                    y1={GRAPH.top}
                    x2={echoX}
                    y2={GRAPH.top + plotHeight}
                  />
                  <text className="echo-label" x={echoX + 4} y={GRAPH.top + 12}>
                    echo
                  </text>

                  <path
                    className="tau-bracket"
                    d={`M ${previousPeakX} ${bracketY + 3} V ${bracketY} H ${pulseX} V ${bracketY + 3}`}
                  />
                  <text
                    className="tau-label"
                    x={(previousPeakX + pulseX) / 2}
                    y={bracketY - 3}
                    textAnchor="middle"
                  >
                    τ {formatTime(echo.tauMilliseconds)} ms
                  </text>
                  <path
                    className="tau-bracket"
                    d={`M ${pulseX} ${bracketY + 3} V ${bracketY} H ${echoX} V ${bracketY + 3}`}
                  />
                  <text
                    className="tau-label"
                    x={(pulseX + echoX) / 2}
                    y={bracketY - 3}
                    textAnchor="middle"
                  >
                    τ
                  </text>
                </g>
              )
            })}
          </g>

          <g className="spin-echo-peak-markers">
            {decayPeaks.map((peak) => (
              <circle
                key={`${peak.kind}-${peak.peakTimeMilliseconds}`}
                cx={graphX(peak.peakTimeMilliseconds)}
                cy={graphY(peak.magnitude)}
                r={3}
              />
            ))}
          </g>

          <g className="fid-axis-labels">
            <text x={GRAPH.left - 10} y={GRAPH.top + 4} textAnchor="end">
              1
            </text>
            <text
              x={GRAPH.left - 10}
              y={GRAPH.top + plotHeight + 4}
              textAnchor="end"
            >
              0
            </text>
            <text
              x={GRAPH.left}
              y={GRAPH.top + plotHeight + 19}
              textAnchor="middle"
            >
              {formatTime(windowStartMilliseconds)}
            </text>
            <text
              x={GRAPH.left + plotWidth / 2}
              y={GRAPH.top + plotHeight + 19}
              textAnchor="middle"
            >
              {formatTime(
                windowStartMilliseconds + windowDurationMilliseconds / 2,
              )}
            </text>
            <text
              x={GRAPH.left + plotWidth}
              y={GRAPH.top + plotHeight + 19}
              textAnchor="middle"
            >
              {formatTime(windowEndMilliseconds)}
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
              |Mxy| (normalized)
            </text>
          </g>
        </svg>
      </div>

      <p className="fid-graph-note">
        Each 180° pulse reverses static-field phase dispersion. Its predicted
        echo is placed one equal τ interval after the pulse; the initial 90°
        excitation peak and measured echo peaks are used for the displayed
        effective T₂ fit.
      </p>
    </section>
  )
}

export default SpinEchoExperimentPanel
