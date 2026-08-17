import {
  blockSimulationSourceIndices,
  PROTON_GYROMAGNETIC_RATIO,
  type SupportedFieldStrengthTesla,
} from '../models/HydrogenEnsemble'
import { MAXIMUM_GRADIENT_TESLA_PER_METER } from '../simulation/gradientEncoding'
import {
  spatialFieldOffsetMilliteslaAt,
  type SpatialGradientProfile,
} from '../simulation/spatialGradient'

export interface BlockLayout {
  contextPositions: Float32Array
  simulatedPositions: Float32Array
  sourceIndices: number[]
}

/**
 * Produces the three simulated cut faces and the faint outer-shell context
 * points used by Block View. Keeping this independent of Three.js makes the
 * geometry contract cheap to verify for small representative grids.
 */
export function createBlockLayout(
  gridSize: number,
  gridSpacing: number,
): BlockLayout {
  const cutSize = Math.floor(gridSize / 2)
  const gridOffset = ((gridSize - 1) * gridSpacing) / 2
  const sourceIndices = blockSimulationSourceIndices(gridSize)
  const simulatedPositions = new Float32Array(sourceIndices.length * 3)
  const cutBoundary = (cutSize - 1) * gridSpacing - gridOffset

  const setSimulatedPosition = (
    index: number,
    x: number,
    y: number,
    z: number,
  ) => {
    const offset = index * 3
    simulatedPositions[offset] = x
    simulatedPositions[offset + 1] = y
    simulatedPositions[offset + 2] = z
  }

  let simulatedIndex = 0
  for (let row = cutSize; row < gridSize; row += 1) {
    for (let column = cutSize; column < gridSize; column += 1) {
      setSimulatedPosition(
        simulatedIndex,
        column * gridSpacing - gridOffset,
        gridOffset - row * gridSpacing,
        0,
      )
      simulatedIndex += 1
    }
  }

  for (let row = cutSize; row < gridSize; row += 1) {
    for (let column = cutSize; column < gridSize; column += 1) {
      const y = gridOffset - row * gridSpacing
      const z = column * gridSpacing - gridOffset
      setSimulatedPosition(simulatedIndex, cutBoundary, y, z)
      simulatedIndex += 1
    }
  }

  for (let row = cutSize; row < gridSize; row += 1) {
    for (let column = cutSize; column < gridSize; column += 1) {
      const x = column * gridSpacing - gridOffset
      const z = row * gridSpacing - gridOffset
      setSimulatedPosition(simulatedIndex, x, -cutBoundary, z)
      simulatedIndex += 1
    }
  }

  const contextPositionValues: number[] = []
  for (let layer = 0; layer < gridSize; layer += 1) {
    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        const inRemovedCorner =
          column >= cutSize && row >= cutSize && layer >= cutSize
        const onHorizontalCutFace =
          layer === cutSize - 1 && column >= cutSize && row >= cutSize
        const onVerticalXCutFace =
          column === cutSize - 1 && row >= cutSize && layer >= cutSize
        const onVerticalYCutFace =
          row === cutSize - 1 && column >= cutSize && layer >= cutSize
        const onOuterSurface =
          column === 0 ||
          column === gridSize - 1 ||
          row === 0 ||
          row === gridSize - 1 ||
          layer === 0 ||
          layer === gridSize - 1

        if (
          inRemovedCorner ||
          onHorizontalCutFace ||
          onVerticalXCutFace ||
          onVerticalYCutFace ||
          !onOuterSurface
        ) {
          continue
        }

        contextPositionValues.push(
          column * gridSpacing - gridOffset,
          gridOffset - row * gridSpacing,
          layer * gridSpacing - gridOffset,
        )
      }
    }
  }

  return {
    contextPositions: new Float32Array(contextPositionValues),
    simulatedPositions,
    sourceIndices,
  }
}

/** Applies the renderer's separable 1-2-1 neighborhood filter. */
export function smoothGridValues(
  values: ArrayLike<number>,
  gridSize: number,
) {
  if (values.length !== gridSize * gridSize) {
    throw new RangeError('Grid value count must equal gridSize squared')
  }

  const smoothed = new Float32Array(values.length)
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      let weightedValue = 0
      let totalWeight = 0

      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        const sampleRow = row + rowOffset
        if (sampleRow < 0 || sampleRow >= gridSize) continue

        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          const sampleColumn = column + columnOffset
          if (sampleColumn < 0 || sampleColumn >= gridSize) continue
          const weight =
            (rowOffset === 0 ? 2 : 1) *
            (columnOffset === 0 ? 2 : 1)
          weightedValue +=
            values[sampleRow * gridSize + sampleColumn] * weight
          totalWeight += weight
        }
      }

      smoothed[row * gridSize + column] = weightedValue / totalWeight
    }
  }
  return smoothed
}

export interface SliceFrequencyField {
  frequencyOffsetsHertz: Float64Array
  maximumAbsoluteFrequencyOffsetHertz: number
}

export interface SliceMagneticField {
  fieldOffsetsTesla: Float64Array
  maximumAbsoluteFieldOffsetTesla: number
}

export function larmorFrequencyOffsetHertzFromFieldOffsetTesla(
  fieldOffsetTesla: number,
) {
  return (
    (PROTON_GYROMAGNETIC_RATIO * fieldOffsetTesla) / (2 * Math.PI)
  )
}

/**
 * Adds static B0 variation, active GRE gradients, and optional fundamental
 * spatial profiles into one longitudinal field offset for every ensemble.
 */
export function sliceMagneticField(
  staticFieldOffsetsTesla: ArrayLike<number>,
  gridSize: number,
  phaseEncodingAmplitude: number,
  readoutAmplitude: number,
  xProfile: SpatialGradientProfile | null = null,
  yProfile: SpatialGradientProfile | null = null,
): SliceMagneticField {
  if (staticFieldOffsetsTesla.length !== gridSize * gridSize) {
    throw new RangeError('Static field count must equal gridSize squared')
  }

  const fieldOffsetsTesla = new Float64Array(gridSize * gridSize)
  let maximumAbsoluteFieldOffsetTesla = 0
  const denominator = Math.max(1, gridSize - 1)

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const index = row * gridSize + column
      const positionXMeters = (column - (gridSize - 1) / 2) * 1e-3
      const positionYMeters = ((gridSize - 1) / 2 - row) * 1e-3
      const timedGradientFieldTesla =
        MAXIMUM_GRADIENT_TESLA_PER_METER *
        (positionXMeters * readoutAmplitude +
          positionYMeters * phaseEncodingAmplitude)
      const spatialGradientFieldTesla =
        ((xProfile
          ? spatialFieldOffsetMilliteslaAt(
              xProfile,
              column / denominator,
            )
          : 0) +
          (yProfile
            ? spatialFieldOffsetMilliteslaAt(
                yProfile,
                1 - row / denominator,
              )
            : 0)) *
        1e-3
      const fieldOffsetTesla =
        staticFieldOffsetsTesla[index] +
        timedGradientFieldTesla +
        spatialGradientFieldTesla

      fieldOffsetsTesla[index] = fieldOffsetTesla
      maximumAbsoluteFieldOffsetTesla = Math.max(
        maximumAbsoluteFieldOffsetTesla,
        Math.abs(fieldOffsetTesla),
      )
    }
  }

  return { fieldOffsetsTesla, maximumAbsoluteFieldOffsetTesla }
}

/**
 * Builds the frequency surface: readout contributes only along x and phase
 * encoding contributes only along y, with static B0 offsets added per voxel.
 */
export function sliceFrequencyField(
  staticFieldFrequencyOffsetsHertz: ArrayLike<number>,
  gridSize: number,
  phaseEncodingAmplitude: number,
  readoutAmplitude: number,
): SliceFrequencyField {
  if (staticFieldFrequencyOffsetsHertz.length !== gridSize * gridSize) {
    throw new RangeError('Static frequency count must equal gridSize squared')
  }

  const frequencyOffsetsHertz = new Float64Array(gridSize * gridSize)
  let maximumAbsoluteFrequencyOffsetHertz = 0

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const index = row * gridSize + column
      const positionXMeters = (column - (gridSize - 1) / 2) * 1e-3
      const positionYMeters = ((gridSize - 1) / 2 - row) * 1e-3
      const gradientFieldTesla =
        MAXIMUM_GRADIENT_TESLA_PER_METER *
        (positionXMeters * readoutAmplitude +
          positionYMeters * phaseEncodingAmplitude)
      const gradientFrequencyHertz =
        (PROTON_GYROMAGNETIC_RATIO * gradientFieldTesla) / (2 * Math.PI)
      const frequencyOffsetHertz =
        staticFieldFrequencyOffsetsHertz[index] + gradientFrequencyHertz

      frequencyOffsetsHertz[index] = frequencyOffsetHertz
      maximumAbsoluteFrequencyOffsetHertz = Math.max(
        maximumAbsoluteFrequencyOffsetHertz,
        Math.abs(frequencyOffsetHertz),
      )
    }
  }

  return { frequencyOffsetsHertz, maximumAbsoluteFrequencyOffsetHertz }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function laboratoryFrequencyHeight(
  fieldStrengthTesla: SupportedFieldStrengthTesla,
  frequencyOffsetHertz: number,
  frequencyHeightScaleHertz: number,
) {
  const nominalHeight = 0.18 + 0.56 * (fieldStrengthTesla / 7)
  const localHeightRange = Math.min(
    0.34,
    nominalHeight - 0.04,
    0.96 - nominalHeight,
  )
  return frequencyHeightScaleHertz > 1e-9
    ? nominalHeight +
        localHeightRange *
          clamp(frequencyOffsetHertz / frequencyHeightScaleHertz, -1, 1)
    : nominalHeight
}

export function rotatingFrequencyHeight(
  frequencyOffsetHertz: number,
  frequencyHeightScaleHertz: number,
) {
  return frequencyHeightScaleHertz > 1e-9
    ? 0.5 +
        0.46 *
          clamp(frequencyOffsetHertz / frequencyHeightScaleHertz, -1, 1)
    : 0.5
}

export function magneticFieldHeight(
  fieldStrengthTesla: SupportedFieldStrengthTesla,
  fieldOffsetTesla: number,
  fieldHeightScaleTesla: number,
) {
  return laboratoryFrequencyHeight(
    fieldStrengthTesla,
    fieldOffsetTesla,
    fieldHeightScaleTesla,
  )
}

/** Soft-limits unwrapped phase without introducing discontinuities at ±pi. */
export function phaseHeight(phaseRadians: number) {
  return 0.5 + Math.atan(phaseRadians / (4 * Math.PI)) / Math.PI
}

export function amplitudeHeight(
  equilibriumMagnetization: number,
  maximumEquilibriumMagnetization: number,
  transverseFraction: number,
) {
  if (maximumEquilibriumMagnetization <= 0) return 0
  return clamp(
    (equilibriumMagnetization / maximumEquilibriumMagnetization) *
      transverseFraction,
    0,
    1,
  )
}
