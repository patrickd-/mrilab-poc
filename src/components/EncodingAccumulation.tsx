import { useMemo } from 'react'
import type { GradientPlaybackStatus } from '../hooks/useGradientEncodingPlayback'
import {
  gradientSpatialFrequencyCyclesPerMeterAt,
  type GradientPulse,
} from '../simulation/gradientEncoding'

interface KSpacePoint {
  kxCyclesPerMeter: number
  kyCyclesPerMeter: number
}

export interface EncodingAcquisition {
  id: number
  kyCyclesPerMeter: number
  readoutPaths: ReadonlyArray<ReadonlyArray<KSpacePoint>>
}

interface EncodingAccumulationProps {
  acquisitions: ReadonlyArray<EncodingAcquisition>
  durationMilliseconds: number
  gradientImperfections: boolean
  phaseEncodingPulses: ReadonlyArray<GradientPulse>
  phaseEncodingReferenceWaveforms: ReadonlyArray<
    ReadonlyArray<GradientPulse>
  >
  readoutPulses: ReadonlyArray<GradientPulse>
  status: GradientPlaybackStatus
  timeMilliseconds: number
}

const KSPACE_GRAPH = {
  width: 460,
  height: 300,
  left: 100,
  top: 18,
  size: 260,
}
const PSF_GRAPH = {
  width: 460,
  height: 190,
  left: 46,
  right: 16,
  top: 18,
  bottom: 34,
}
const SLICE_HALF_WIDTH_MILLIMETERS = 63.5
const READOUT_PATH_SAMPLE_COUNT = 72
const DISTINCT_KY_TOLERANCE_CYCLES_PER_METER = 0.1

function readoutWindows(pulses: ReadonlyArray<GradientPulse>) {
  return pulses.filter((pulse) => pulse.amplitude > 1e-6)
}

function kSpacePointAt(
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  timeMilliseconds: number,
  durationMilliseconds: number,
  gradientImperfections: boolean,
): KSpacePoint {
  return {
    kxCyclesPerMeter: gradientSpatialFrequencyCyclesPerMeterAt(
      readoutPulses,
      timeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
    ),
    kyCyclesPerMeter: gradientSpatialFrequencyCyclesPerMeterAt(
      phaseEncodingPulses,
      timeMilliseconds,
      durationMilliseconds,
      gradientImperfections,
    ),
  }
}

function readoutPathsThrough(
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  throughTimeMilliseconds: number,
  durationMilliseconds: number,
  gradientImperfections: boolean,
) {
  return readoutWindows(readoutPulses).flatMap((pulse) => {
    const startMilliseconds = pulse.start * durationMilliseconds
    const endMilliseconds = Math.min(
      pulse.end * durationMilliseconds,
      throughTimeMilliseconds,
    )
    if (endMilliseconds < startMilliseconds) return []

    const elapsedFraction =
      (endMilliseconds - startMilliseconds) /
      Math.max(Number.EPSILON, durationMilliseconds)
    const sampleCount = Math.max(
      2,
      Math.ceil(READOUT_PATH_SAMPLE_COUNT * elapsedFraction),
    )
    const points = Array.from({ length: sampleCount }, (_, index) => {
      const fraction = sampleCount === 1 ? 0 : index / (sampleCount - 1)
      return kSpacePointAt(
        phaseEncodingPulses,
        readoutPulses,
        startMilliseconds +
          (endMilliseconds - startMilliseconds) * fraction,
        durationMilliseconds,
        gradientImperfections,
      )
    })

    return [points]
  })
}

export function createEncodingAcquisition(
  id: number,
  phaseEncodingPulses: ReadonlyArray<GradientPulse>,
  readoutPulses: ReadonlyArray<GradientPulse>,
  durationMilliseconds: number,
  gradientImperfections: boolean,
): EncodingAcquisition | null {
  const readoutPaths = readoutPathsThrough(
    phaseEncodingPulses,
    readoutPulses,
    durationMilliseconds,
    durationMilliseconds,
    gradientImperfections,
  )
  const points = readoutPaths.flat()
  if (points.length === 0) return null

  return {
    id,
    kyCyclesPerMeter:
      points.reduce((sum, point) => sum + point.kyCyclesPerMeter, 0) /
      points.length,
    readoutPaths,
  }
}

function uniqueKyValues(acquisitions: ReadonlyArray<EncodingAcquisition>) {
  return acquisitions.reduce<number[]>((values, acquisition) => {
    if (
      values.every(
        (value) =>
          Math.abs(value - acquisition.kyCyclesPerMeter) >=
          DISTINCT_KY_TOLERANCE_CYCLES_PER_METER,
      )
    ) {
      values.push(acquisition.kyCyclesPerMeter)
    }
    return values
  }, [])
}

function niceSymmetricExtent(values: ReadonlyArray<number>) {
  const maximum = Math.max(1, ...values.map((value) => Math.abs(value)))
  const magnitude = 10 ** Math.floor(Math.log10(maximum))
  return Math.ceil(maximum / magnitude) * magnitude
}

function pathForPoints(
  points: ReadonlyArray<KSpacePoint>,
  xForKx: (kx: number) => number,
  yForKy: (ky: number) => number,
) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${xForKx(
          point.kxCyclesPerMeter,
        )} ${yForKy(point.kyCyclesPerMeter)}`,
    )
    .join(' ')
}

function formatAxisValue(value: number) {
  const absoluteValue = Math.abs(value)
  if (absoluteValue >= 100) return value.toFixed(0)
  if (absoluteValue >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

function EncodingAccumulation({
  acquisitions,
  durationMilliseconds,
  gradientImperfections,
  phaseEncodingPulses,
  phaseEncodingReferenceWaveforms,
  readoutPulses,
  status,
  timeMilliseconds,
}: EncodingAccumulationProps) {
  const plannedPaths = useMemo(
    () =>
      phaseEncodingReferenceWaveforms.flatMap((referencePulses) =>
        readoutPathsThrough(
          referencePulses,
          readoutPulses,
          durationMilliseconds,
          durationMilliseconds,
          gradientImperfections,
        ),
      ),
    [
      durationMilliseconds,
      gradientImperfections,
      phaseEncodingReferenceWaveforms,
      readoutPulses,
    ],
  )
  const sequenceInProgress = status === 'running' || status === 'paused'
  const activePaths = sequenceInProgress
    ? readoutPathsThrough(
        phaseEncodingPulses,
        readoutPulses,
        timeMilliseconds,
        durationMilliseconds,
        gradientImperfections,
      )
    : []
  const currentPoint = sequenceInProgress
    ? kSpacePointAt(
        phaseEncodingPulses,
        readoutPulses,
        timeMilliseconds,
        durationMilliseconds,
        gradientImperfections,
      )
    : null
  const completedPaths = acquisitions.flatMap(
    (acquisition) => acquisition.readoutPaths,
  )
  const allPoints = [
    ...plannedPaths.flat(),
    ...completedPaths.flat(),
    ...activePaths.flat(),
    ...(currentPoint ? [currentPoint] : []),
  ]
  const xExtent = niceSymmetricExtent(
    allPoints.map((point) => point.kxCyclesPerMeter),
  )
  const yExtent = niceSymmetricExtent(
    allPoints.map((point) => point.kyCyclesPerMeter),
  )
  const xForKx = (kx: number) =>
    KSPACE_GRAPH.left +
    ((kx + xExtent) / (2 * xExtent)) * KSPACE_GRAPH.size
  const yForKy = (ky: number) =>
    KSPACE_GRAPH.top +
    ((yExtent - ky) / (2 * yExtent)) * KSPACE_GRAPH.size
  const uniquePhaseEncodingValues = useMemo(
    () => uniqueKyValues(acquisitions),
    [acquisitions],
  )
  const psfWidth = PSF_GRAPH.width - PSF_GRAPH.left - PSF_GRAPH.right
  const psfHeight = PSF_GRAPH.height - PSF_GRAPH.top - PSF_GRAPH.bottom
  const psfPoints = Array.from({ length: 193 }, (_, index) => {
    const fraction = index / 192
    const yMillimeters =
      -SLICE_HALF_WIDTH_MILLIMETERS +
      fraction * SLICE_HALF_WIDTH_MILLIMETERS * 2
    const yMeters = yMillimeters / 1000
    let real = 0
    let imaginary = 0

    uniquePhaseEncodingValues.forEach((ky) => {
      const phase = 2 * Math.PI * ky * yMeters
      real += Math.cos(phase)
      imaginary += Math.sin(phase)
    })

    const magnitude =
      uniquePhaseEncodingValues.length === 0
        ? 0
        : Math.hypot(real, imaginary) /
          uniquePhaseEncodingValues.length
    return {
      x: PSF_GRAPH.left + fraction * psfWidth,
      y: PSF_GRAPH.top + (1 - magnitude) * psfHeight,
    }
  })
  const psfPath = psfPoints
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`,
    )
    .join(' ')
  const psfFillPath = `${psfPath} L ${
    PSF_GRAPH.left + psfWidth
  } ${PSF_GRAPH.top + psfHeight} L ${PSF_GRAPH.left} ${
    PSF_GRAPH.top + psfHeight
  } Z`

  return (
    <div className="encoding-accumulation-visualizations">
      <div className="encoding-accumulation-card">
        <header>
          <div>
            <strong>K-space coverage</strong>
            <span>Frequency × phase encoding</span>
          </div>
          <small>
            {acquisitions.length} acquisition
            {acquisitions.length === 1 ? '' : 's'} ·{' '}
            {uniquePhaseEncodingValues.length} unique k<sub>y</sub>
          </small>
        </header>

        <svg
          className="k-space-coverage-graph"
          viewBox={`0 0 ${KSPACE_GRAPH.width} ${KSPACE_GRAPH.height}`}
          role="img"
          aria-label={`K-space coverage with ${acquisitions.length} completed acquisitions and ${uniquePhaseEncodingValues.length} unique phase-encoding lines`}
        >
          <g className="encoding-graph-grid" aria-hidden="true">
            {[-1, -0.5, 0, 0.5, 1].map((fraction) => (
              <g key={`grid-${fraction}`}>
                <line
                  x1={xForKx(fraction * xExtent)}
                  y1={KSPACE_GRAPH.top}
                  x2={xForKx(fraction * xExtent)}
                  y2={KSPACE_GRAPH.top + KSPACE_GRAPH.size}
                />
                <line
                  x1={KSPACE_GRAPH.left}
                  y1={yForKy(fraction * yExtent)}
                  x2={KSPACE_GRAPH.left + KSPACE_GRAPH.size}
                  y2={yForKy(fraction * yExtent)}
                />
              </g>
            ))}
          </g>
          <line
            className="encoding-graph-axis"
            x1={KSPACE_GRAPH.left}
            y1={yForKy(0)}
            x2={KSPACE_GRAPH.left + KSPACE_GRAPH.size}
            y2={yForKy(0)}
            aria-hidden="true"
          />
          <line
            className="encoding-graph-axis"
            x1={xForKx(0)}
            y1={KSPACE_GRAPH.top}
            x2={xForKx(0)}
            y2={KSPACE_GRAPH.top + KSPACE_GRAPH.size}
            aria-hidden="true"
          />
          <g className="k-space-planned-lines" aria-hidden="true">
            {plannedPaths.map((points, index) => (
              <path
                key={index}
                d={pathForPoints(points, xForKx, yForKy)}
              />
            ))}
          </g>
          <g className="k-space-acquired-lines" aria-hidden="true">
            {acquisitions.flatMap((acquisition) =>
              acquisition.readoutPaths.map((points, pathIndex) => (
                <path
                  key={`${acquisition.id}-${pathIndex}`}
                  d={pathForPoints(points, xForKx, yForKy)}
                />
              )),
            )}
          </g>
          <g className="k-space-active-line" aria-hidden="true">
            {activePaths.map((points, index) => (
              <path
                key={index}
                d={pathForPoints(points, xForKx, yForKy)}
              />
            ))}
            {currentPoint && (
              <circle
                cx={xForKx(currentPoint.kxCyclesPerMeter)}
                cy={yForKy(currentPoint.kyCyclesPerMeter)}
                r="3.5"
              />
            )}
          </g>
          {[-1, 0, 1].map((fraction) => (
            <text
              className="encoding-axis-value"
              key={`kx-${fraction}`}
              x={xForKx(fraction * xExtent)}
              y={KSPACE_GRAPH.top + KSPACE_GRAPH.size + 16}
              textAnchor="middle"
              aria-hidden="true"
            >
              {formatAxisValue(fraction * xExtent)}
            </text>
          ))}
          {[-1, 0, 1].map((fraction) => (
            <text
              className="encoding-axis-value"
              key={`ky-${fraction}`}
              x={KSPACE_GRAPH.left - 8}
              y={yForKy(fraction * yExtent) + 3}
              textAnchor="end"
              aria-hidden="true"
            >
              {formatAxisValue(fraction * yExtent)}
            </text>
          ))}
          <text
            className="encoding-axis-label"
            x={KSPACE_GRAPH.left + KSPACE_GRAPH.size / 2}
            y={KSPACE_GRAPH.height - 2}
            textAnchor="middle"
            aria-hidden="true"
          >
            kx · cycles/m
          </text>
          <text
            className="encoding-axis-label"
            textAnchor="middle"
            transform={`translate(18 ${
              KSPACE_GRAPH.top + KSPACE_GRAPH.size / 2
            }) rotate(-90)`}
            aria-hidden="true"
          >
            ky · cycles/m
          </text>
        </svg>

        <div className="encoding-coverage-legend" aria-hidden="true">
          <span className="planned">Planned</span>
          <span className="acquired">Acquired</span>
          <span className="active">Active</span>
        </div>
      </div>

      <div className="encoding-accumulation-card">
        <header>
          <div>
            <strong>Phase-encoding point spread</strong>
            <span>Recoverable position along y</span>
          </div>
          <small>
            {uniquePhaseEncodingValues.length === 0
              ? 'No phase information yet'
              : uniquePhaseEncodingValues.length === 1
                ? 'No y localization yet'
                : `${uniquePhaseEncodingValues.length} independent phase encodings`}
          </small>
        </header>

        <svg
          className="phase-encoding-psf-graph"
          viewBox={`0 0 ${PSF_GRAPH.width} ${PSF_GRAPH.height}`}
          role="img"
          aria-label={`Phase-encoding point-spread function based on ${uniquePhaseEncodingValues.length} unique phase-encoding lines`}
        >
          <g className="encoding-graph-grid" aria-hidden="true">
            {[0, 0.5, 1].map((magnitude) => (
              <line
                key={`magnitude-${magnitude}`}
                x1={PSF_GRAPH.left}
                y1={PSF_GRAPH.top + (1 - magnitude) * psfHeight}
                x2={PSF_GRAPH.left + psfWidth}
                y2={PSF_GRAPH.top + (1 - magnitude) * psfHeight}
              />
            ))}
            {[-63.5, -31.75, 0, 31.75, 63.5].map(
              (yMillimeters) => (
                <line
                  key={`position-${yMillimeters}`}
                  x1={
                    PSF_GRAPH.left +
                    ((yMillimeters + SLICE_HALF_WIDTH_MILLIMETERS) /
                      (SLICE_HALF_WIDTH_MILLIMETERS * 2)) *
                      psfWidth
                  }
                  y1={PSF_GRAPH.top}
                  x2={
                    PSF_GRAPH.left +
                    ((yMillimeters + SLICE_HALF_WIDTH_MILLIMETERS) /
                      (SLICE_HALF_WIDTH_MILLIMETERS * 2)) *
                      psfWidth
                  }
                  y2={PSF_GRAPH.top + psfHeight}
                />
              ),
            )}
          </g>
          <path
            className="phase-encoding-psf-fill"
            d={psfFillPath}
            aria-hidden="true"
          />
          <path
            className="phase-encoding-psf-line"
            d={psfPath}
            aria-hidden="true"
          />
          {[0, 0.5, 1].map((magnitude) => (
            <text
              className="encoding-axis-value"
              key={`response-${magnitude}`}
              x={PSF_GRAPH.left - 7}
              y={PSF_GRAPH.top + (1 - magnitude) * psfHeight + 3}
              textAnchor="end"
              aria-hidden="true"
            >
              {magnitude.toFixed(1)}
            </text>
          ))}
          {[-63.5, 0, 63.5].map((yMillimeters) => (
            <text
              className="encoding-axis-value"
              key={`label-${yMillimeters}`}
              x={
                PSF_GRAPH.left +
                ((yMillimeters + SLICE_HALF_WIDTH_MILLIMETERS) /
                  (SLICE_HALF_WIDTH_MILLIMETERS * 2)) *
                  psfWidth
              }
              y={PSF_GRAPH.top + psfHeight + 16}
              textAnchor="middle"
              aria-hidden="true"
            >
              {yMillimeters.toFixed(yMillimeters === 0 ? 0 : 1)}
            </text>
          ))}
          <text
            className="encoding-axis-label"
            x={PSF_GRAPH.left + psfWidth / 2}
            y={PSF_GRAPH.height - 2}
            textAnchor="middle"
            aria-hidden="true"
          >
            y · mm
          </text>
          <text
            className="encoding-axis-label"
            textAnchor="middle"
            transform={`translate(13 ${
              PSF_GRAPH.top + psfHeight / 2
            }) rotate(-90)`}
            aria-hidden="true"
          >
            response
          </text>
          {uniquePhaseEncodingValues.length === 0 && (
            <text
              className="encoding-empty-label"
              x={PSF_GRAPH.left + psfWidth / 2}
              y={PSF_GRAPH.top + psfHeight / 2}
              textAnchor="middle"
            >
              Complete an acquisition to begin
            </text>
          )}
        </svg>
      </div>
    </div>
  )
}

export default EncodingAccumulation
