import type { GradientAcquisitionRun } from '../hooks/useGradientAcquisition'
import { calibrateGradientEncoding } from './gradientCalibration'
import {
  ADC_DWELL_TIME_MILLISECONDS,
  cartesianKSpaceBoundsForGrid,
  DEFAULT_ADC_PULSES,
  DEFAULT_RF_EXCITATION_PULSES,
  GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
  gradientKSpaceCyclesPerMeterAt,
  type GradientPulse,
} from './gradientEncoding'

export interface KSpaceCoverageReport {
  coveredBinCount: number
  coveredBins: Uint8Array
  coveredBinsPerPhaseLine: Uint16Array
  percentage: number
  totalBinCount: number
}

export interface KSpaceAutoFillPlan {
  adcPulses: ReadonlyArray<GradientPulse>
  phaseEncodingAmplitudes: ReadonlyArray<number>
  phaseEncodingPulseTemplate: ReadonlyArray<GradientPulse>
  predictedCoveredBinCount: number
  readoutPulses: ReadonlyArray<GradientPulse>
  totalBinCount: number
}

const BIN_TOLERANCE = 1e-8
const MAXIMUM_NORMALIZED_GRADIENT_AMPLITUDE = 1

function coordinateBinIndex(
  coordinateCyclesPerMeter: number,
  gridSize: number,
  minimumKCyclesPerMeter: number,
  kSpaceStepCyclesPerMeter: number,
) {
  const fractionalIndex =
    (coordinateCyclesPerMeter - minimumKCyclesPerMeter) /
    kSpaceStepCyclesPerMeter
  const nearestIndex = Math.round(fractionalIndex)
  if (
    nearestIndex < 0 ||
    nearestIndex >= gridSize ||
    Math.abs(fractionalIndex - nearestIndex) > 0.5 + BIN_TOLERANCE
  ) {
    return null
  }
  return nearestIndex
}

export function kSpaceCoverageForGrid(
  acquisitionRuns: ReadonlyArray<GradientAcquisitionRun>,
  gridSize: number,
  voxelSizeMillimeters: number,
): KSpaceCoverageReport {
  const bounds = cartesianKSpaceBoundsForGrid(
    gridSize,
    voxelSizeMillimeters,
  )
  const totalBinCount = gridSize * gridSize
  const coveredBins = new Uint8Array(totalBinCount)
  const coveredBinsPerPhaseLine = new Uint16Array(gridSize)
  let coveredBinCount = 0

  acquisitionRuns.forEach((run) => {
    run.points.forEach((point) => {
      const xIndex = coordinateBinIndex(
        point.kxCyclesPerMeter,
        gridSize,
        bounds.minimumKCyclesPerMeter,
        bounds.kSpaceStepCyclesPerMeter,
      )
      const yIndex = coordinateBinIndex(
        point.kyCyclesPerMeter,
        gridSize,
        bounds.minimumKCyclesPerMeter,
        bounds.kSpaceStepCyclesPerMeter,
      )
      if (xIndex === null || yIndex === null) return

      const binIndex = yIndex * gridSize + xIndex
      if (coveredBins[binIndex] === 1) return
      coveredBins[binIndex] = 1
      coveredBinsPerPhaseLine[yIndex] += 1
      coveredBinCount += 1
    })
  })

  return {
    coveredBinCount,
    coveredBins,
    coveredBinsPerPhaseLine,
    percentage: (coveredBinCount / totalBinCount) * 100,
    totalBinCount,
  }
}

export function createKSpaceAutoFillPlan(
  acquisitionRuns: ReadonlyArray<GradientAcquisitionRun>,
  gridSize: number,
  voxelSizeMillimeters: number,
  gradientImperfections: boolean,
  encodingStartTimeMilliseconds =
    DEFAULT_RF_EXCITATION_PULSES[0].end *
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
): KSpaceAutoFillPlan {
  const coverage = kSpaceCoverageForGrid(
    acquisitionRuns,
    gridSize,
    voxelSizeMillimeters,
  )
  const calibration = calibrateGradientEncoding({
    gradientImperfections,
    gridSize,
    voxelSizeMillimeters,
    encodingStartTimeMilliseconds,
  })
  const virtualCoveredBins = coverage.coveredBins.slice()
  let predictedCoveredBinCount = coverage.coveredBinCount
  const adcStartTimeMilliseconds =
    DEFAULT_ADC_PULSES[0].start *
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS
  const adcEndTimeMilliseconds =
    DEFAULT_ADC_PULSES[0].end *
    GRADIENT_SEQUENCE_DURATION_MILLISECONDS
  const bounds = cartesianKSpaceBoundsForGrid(
    gridSize,
    voxelSizeMillimeters,
  )
  const unitPhaseEncodingPulses =
    calibration.recommended.phaseEncodingPulsesForCenterLine.map(
      (pulse) => ({ ...pulse, amplitude: 1 }),
    )
  const sampleRecords: Array<{
    kxIndex: number
    unitKyCyclesPerMeter: number
  }> = []

  for (
    let timeMilliseconds = adcStartTimeMilliseconds;
    timeMilliseconds < adcEndTimeMilliseconds - BIN_TOLERANCE;
    timeMilliseconds += ADC_DWELL_TIME_MILLISECONDS
  ) {
    const kxCyclesPerMeter = gradientKSpaceCyclesPerMeterAt(
      calibration.recommended.readoutPulses,
      timeMilliseconds,
      GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
      gradientImperfections,
      encodingStartTimeMilliseconds,
    )
    const kxIndex = coordinateBinIndex(
      kxCyclesPerMeter,
      gridSize,
      bounds.minimumKCyclesPerMeter,
      bounds.kSpaceStepCyclesPerMeter,
    )
    if (kxIndex === null) continue
    sampleRecords.push({
      kxIndex,
      unitKyCyclesPerMeter: gradientKSpaceCyclesPerMeterAt(
        unitPhaseEncodingPulses,
        timeMilliseconds,
        GRADIENT_SEQUENCE_DURATION_MILLISECONDS,
        gradientImperfections,
        encodingStartTimeMilliseconds,
      ),
    })
  }

  const phaseEncodingAmplitudes: number[] = []
  const addPredictedAcquisition = (amplitude: number) => {
    phaseEncodingAmplitudes.push(amplitude)
    sampleRecords.forEach(({ kxIndex, unitKyCyclesPerMeter }) => {
      const kyIndex = coordinateBinIndex(
        amplitude * unitKyCyclesPerMeter,
        gridSize,
        bounds.minimumKCyclesPerMeter,
        bounds.kSpaceStepCyclesPerMeter,
      )
      if (kyIndex === null) return
      const binIndex = kyIndex * gridSize + kxIndex
      if (virtualCoveredBins[binIndex] === 1) return
      virtualCoveredBins[binIndex] = 1
      predictedCoveredBinCount += 1
    })
  }

  calibration.recommended.phaseEncodingLinesCenterOut.forEach((line) => {
    const phaseLineIndex = line.index + Math.floor(gridSize / 2)
    if (coverage.coveredBinsPerPhaseLine[phaseLineIndex] < gridSize) {
      addPredictedAcquisition(line.amplitude)
    }
  })

  // A non-ideal gradient response bends the outermost trajectories slightly.
  // Target any remaining Cartesian cells at their actual ADC sample time.
  for (
    let binIndex = 0;
    binIndex < virtualCoveredBins.length &&
    predictedCoveredBinCount < coverage.totalBinCount;
    binIndex += 1
  ) {
    if (virtualCoveredBins[binIndex] === 1) continue
    const kxIndex = binIndex % gridSize
    const kyIndex = Math.floor(binIndex / gridSize)
    const sample = sampleRecords.find((record) => record.kxIndex === kxIndex)
    if (!sample || Math.abs(sample.unitKyCyclesPerMeter) < 1e-12) continue
    const targetKyCyclesPerMeter =
      bounds.minimumKCyclesPerMeter +
      kyIndex * bounds.kSpaceStepCyclesPerMeter
    const amplitude =
      targetKyCyclesPerMeter / sample.unitKyCyclesPerMeter
    if (
      !Number.isFinite(amplitude) ||
      Math.abs(amplitude) >
        MAXIMUM_NORMALIZED_GRADIENT_AMPLITUDE + BIN_TOLERANCE
    ) {
      continue
    }
    addPredictedAcquisition(amplitude)
  }

  return {
    adcPulses: DEFAULT_ADC_PULSES.map((pulse) => ({ ...pulse })),
    phaseEncodingAmplitudes,
    phaseEncodingPulseTemplate:
      calibration.recommended.phaseEncodingPulsesForCenterLine.map(
        (pulse) => ({ ...pulse }),
      ),
    predictedCoveredBinCount,
    readoutPulses: calibration.recommended.readoutPulses.map((pulse) => ({
      ...pulse,
    })),
    totalBinCount: coverage.totalBinCount,
  }
}
