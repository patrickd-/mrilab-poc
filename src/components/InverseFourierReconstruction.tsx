import { useEffect, useRef } from 'react'
import type { GradientAcquisitionRun } from '../hooks/useGradientAcquisition'
import type { GradientSignalPoint } from '../simulation/gradientEncoding'

interface InverseFourierReconstructionProps {
  acquisitionRuns: ReadonlyArray<GradientAcquisitionRun>
  gridSize: number
  voxelSizeMillimeters: number
}

interface ReconstructionAccumulator {
  gridSize: number
  imaginary: Float64Array
  processedPointCounts: Map<number, number>
  real: Float64Array
  voxelSizeMillimeters: number
}

function createAccumulator(
  gridSize: number,
  voxelSizeMillimeters: number,
): ReconstructionAccumulator {
  const pixelCount = gridSize * gridSize
  return {
    gridSize,
    imaginary: new Float64Array(pixelCount),
    processedPointCounts: new Map(),
    real: new Float64Array(pixelCount),
    voxelSizeMillimeters,
  }
}

/**
 * Adds complex k-space samples to an inverse transform accumulator. The MRI
 * signal model uses exp(+i 2π k·r), so reconstruction uses its conjugate.
 */
export function accumulateInverseFourierSamples(
  real: Float64Array,
  imaginary: Float64Array,
  gridSize: number,
  points: ReadonlyArray<GradientSignalPoint>,
  voxelSizeMillimeters = 1,
) {
  const expectedLength = gridSize * gridSize
  if (real.length !== expectedLength || imaginary.length !== expectedLength) {
    throw new RangeError('Reconstruction buffers must match the image grid')
  }

  const gridCenter = (gridSize - 1) / 2
  const voxelSizeMeters = voxelSizeMillimeters * 1e-3
  points.forEach((point) => {
    const signalReal = point.normalizedInPhaseSignal
    const signalImaginary = point.normalizedQuadratureSignal
    const phaseStepX =
      2 * Math.PI * point.kxCyclesPerMeter * voxelSizeMeters
    const cosineStepX = Math.cos(phaseStepX)
    const sineStepX = Math.sin(phaseStepX)

    for (let row = 0; row < gridSize; row += 1) {
      const positionYMeters = (gridCenter - row) * voxelSizeMeters
      const rowStartPhase =
        2 *
        Math.PI *
        (point.kxCyclesPerMeter * -gridCenter * voxelSizeMeters +
          point.kyCyclesPerMeter * positionYMeters)
      let cosine = Math.cos(rowStartPhase)
      let sine = Math.sin(rowStartPhase)

      for (let column = 0; column < gridSize; column += 1) {
        const pixelIndex = row * gridSize + column
        // (I + iQ)(cos φ - i sin φ)
        real[pixelIndex] += signalReal * cosine + signalImaginary * sine
        imaginary[pixelIndex] +=
          signalImaginary * cosine - signalReal * sine

        const nextCosine =
          cosine * cosineStepX - sine * sineStepX
        sine = sine * cosineStepX + cosine * sineStepX
        cosine = nextCosine
      }
    }
  })
}

function accumulatorNeedsRebuild(
  accumulator: ReconstructionAccumulator,
  acquisitionRuns: ReadonlyArray<GradientAcquisitionRun>,
  gridSize: number,
  voxelSizeMillimeters: number,
) {
  if (accumulator.gridSize !== gridSize) return true
  if (accumulator.voxelSizeMillimeters !== voxelSizeMillimeters) return true
  const currentRunIds = new Set(acquisitionRuns.map((run) => run.id))
  for (const runId of accumulator.processedPointCounts.keys()) {
    if (!currentRunIds.has(runId)) return true
  }
  return acquisitionRuns.some(
    (run) =>
      run.points.length <
      (accumulator.processedPointCounts.get(run.id) ?? 0),
  )
}

function paintMagnitudeImage(
  context: CanvasRenderingContext2D,
  accumulator: ReconstructionAccumulator,
) {
  const image = context.createImageData(
    accumulator.gridSize,
    accumulator.gridSize,
  )
  const magnitudes = new Float64Array(accumulator.real.length)
  let maximumMagnitude = 0

  for (let index = 0; index < magnitudes.length; index += 1) {
    const magnitude = Math.hypot(
      accumulator.real[index],
      accumulator.imaginary[index],
    )
    magnitudes[index] = magnitude
    maximumMagnitude = Math.max(maximumMagnitude, magnitude)
  }

  for (let index = 0; index < magnitudes.length; index += 1) {
    const grayscale =
      maximumMagnitude < 1e-12
        ? 0
        : Math.round((magnitudes[index] / maximumMagnitude) * 255)
    const pixelOffset = index * 4
    image.data[pixelOffset] = grayscale
    image.data[pixelOffset + 1] = grayscale
    image.data[pixelOffset + 2] = grayscale
    image.data[pixelOffset + 3] = 255
  }
  context.putImageData(image, 0, 0)
}

function InverseFourierReconstruction({
  acquisitionRuns,
  gridSize,
  voxelSizeMillimeters,
}: InverseFourierReconstructionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const accumulatorRef = useRef<ReconstructionAccumulator>(
    createAccumulator(gridSize, voxelSizeMillimeters),
  )
  const sampleCount = acquisitionRuns.reduce(
    (count, run) => count + run.points.length,
    0,
  )
  const acquisitionLabel = `${acquisitionRuns.length} acquisition${
    acquisitionRuns.length === 1 ? '' : 's'
  }`
  const sampleLabel = `${sampleCount} complex k-space sample${
    sampleCount === 1 ? '' : 's'
  }`

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let context: CanvasRenderingContext2D | null = null
    try {
      context = canvas.getContext('2d')
    } catch {
      return
    }
    if (!context) return

    if (
      accumulatorNeedsRebuild(
        accumulatorRef.current,
        acquisitionRuns,
        gridSize,
        voxelSizeMillimeters,
      )
    ) {
      accumulatorRef.current = createAccumulator(
        gridSize,
        voxelSizeMillimeters,
      )
    }
    const accumulator = accumulatorRef.current

    acquisitionRuns.forEach((run) => {
      const processedPointCount =
        accumulator.processedPointCounts.get(run.id) ?? 0
      const newPoints = run.points.slice(processedPointCount)
      accumulateInverseFourierSamples(
        accumulator.real,
        accumulator.imaginary,
        gridSize,
        newPoints,
        voxelSizeMillimeters,
      )
      accumulator.processedPointCounts.set(run.id, run.points.length)
    })
    paintMagnitudeImage(context, accumulator)
  }, [acquisitionRuns, gridSize, voxelSizeMillimeters])

  const fieldOfViewMillimeters = gridSize * voxelSizeMillimeters

  return (
    <figure className="inverse-fourier-reconstruction">
      <figcaption>
        <div>
          <strong>Magnitude reconstruction</strong>
          <span>Complex inverse Fourier sum</span>
        </div>
        <small>
          {acquisitionLabel} · {sampleCount} sample
          {sampleCount === 1 ? '' : 's'} ·{' '}
          {fieldOfViewMillimeters.toFixed(1)} mm FOV
        </small>
      </figcaption>
      <canvas
        ref={canvasRef}
        width={gridSize}
        height={gridSize}
        role="img"
        aria-label={`Partial MRI magnitude reconstruction from ${acquisitionLabel} and ${sampleLabel} at ${voxelSizeMillimeters.toFixed(3)} millimeter voxels`}
      />
      <footer>
        <span>0</span>
        <i aria-hidden="true" />
        <span>Relative magnitude</span>
        <strong>
          {voxelSizeMillimeters.toFixed(3)} mm/px · current peak 1
        </strong>
      </footer>
    </figure>
  )
}

export default InverseFourierReconstruction
