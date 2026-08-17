export const PHYSICAL_CONSTANTS = Object.freeze({
  planckConstant: 6.626_070_15e-34,
  diracConstant: 1.054_571_817e-34,
  boltzmannConstant: 1.380_649e-23,
})

export const NON_UNIFORM_FIELD_MODEL = Object.freeze({
  maximumVariationPpm: 1,
  radialExponent: 2,
  maximumOffParallelDegrees: 1e-4,
  angularExponent: 2,
})

export const PROTON_GYROMAGNETIC_RATIO = 2.675_221_870_8e8

export type FieldUniformity = 'uniform' | 'non-uniform'
export type SupportedFieldStrengthTesla = 1.5 | 3 | 7
export type SamplePresetId =
  | 'air'
  | 'cortical-bone'
  | 'cerebrospinal-fluid'
  | 'gray-matter'
  | 'white-matter'

export const SAMPLE_PRESETS: ReadonlyArray<{
  id: SamplePresetId
  label: string
  temperatureCelsius: number
  totalProtonCount: number
}> = Object.freeze([
  {
    id: 'air',
    label: 'Surrounding Air',
    temperatureCelsius: 22,
    totalProtonCount: 6.5e14,
  },
  {
    id: 'cortical-bone',
    label: 'Cortical bone',
    temperatureCelsius: 37,
    totalProtonCount: 1.7e19,
  },
  {
    id: 'cerebrospinal-fluid',
    label: 'Cerebrospinal fluid (CSF)',
    temperatureCelsius: 37,
    totalProtonCount: 6.6e19,
  },
  {
    id: 'gray-matter',
    label: 'Gray matter',
    temperatureCelsius: 37,
    totalProtonCount: 5.3e19,
  },
  {
    id: 'white-matter',
    label: 'White matter',
    temperatureCelsius: 37,
    totalProtonCount: 4.6e19,
  },
])

interface RelaxationTimesMilliseconds {
  t1: number
  t2: number
  t2Star: number
}

// T2* supplies the tissue-dependent, reversibly refocusable component of the
// intravoxel frequency spread. Brain values use published 1.5/3/7 T in-vivo
// measurements; CSF uses published 3/7 T values and a 1.5 T extrapolation.
// Cortical bone is clamped to its shorter intrinsic T2 so T2* never exceeds T2.
const RELAXATION_TIMES_MS: Readonly<
  Record<
    SupportedFieldStrengthTesla,
    Readonly<Record<SamplePresetId, RelaxationTimesMilliseconds>>
  >
> = {
  1.5: {
    air: { t1: 0, t2: 0, t2Star: 0 },
    'cortical-bone': { t1: 110, t2: 0.4, t2Star: 0.4 },
    'cerebrospinal-fluid': { t1: 4300, t2: 2100, t2Star: 550 },
    'gray-matter': { t1: 1200, t2: 84, t2Star: 84 },
    'white-matter': { t1: 650, t2: 80, t2Star: 66.2 },
  },
  3: {
    air: { t1: 0, t2: 0, t2Star: 0 },
    'cortical-bone': { t1: 150, t2: 0.4, t2Star: 0.4 },
    'cerebrospinal-fluid': { t1: 4300, t2: 2000, t2Star: 333.5 },
    'gray-matter': { t1: 1610, t2: 72, t2Star: 66 },
    'white-matter': { t1: 840, t2: 71, t2Star: 53.2 },
  },
  7: {
    air: { t1: 0, t2: 0, t2Star: 0 },
    'cortical-bone': { t1: 425, t2: 0.4, t2Star: 0.4 },
    'cerebrospinal-fluid': { t1: 4300, t2: 1000, t2Star: 168 },
    'gray-matter': { t1: 1940, t2: 47, t2Star: 33.2 },
    'white-matter': { t1: 1130, t2: 47, t2Star: 26.8 },
  },
}

const TISSUE_HETEROGENEITY_PHASE: Readonly<Record<SamplePresetId, number>> = {
  air: 0,
  'cortical-bone': 0.7,
  'cerebrospinal-fluid': 1.9,
  'gray-matter': 3.1,
  'white-matter': 4.4,
}

function smoothTissueVariationAt(
  column: number,
  row: number,
  gridSize: number,
  phase: number,
) {
  const x = ((column + 0.5) / gridSize) * 2 * Math.PI
  const y = ((row + 0.5) / gridSize) * 2 * Math.PI
  return (
    (Math.sin(1.35 * x + phase) * Math.cos(0.9 * y - 0.7 * phase) +
      0.5 * Math.sin(2.1 * y - 1.7 * x + 0.5 * phase)) /
    1.5
  )
}

export interface FieldDirection {
  x: number
  y: number
  z: number
}

export interface FieldProfile {
  radialFraction: number
  fieldScale: number
  tiltAngleRadians: number
  direction: FieldDirection
}

export interface MagneticProperties extends FieldProfile {
  nominalFieldStrengthTesla: SupportedFieldStrengthTesla
  fieldStrengthTesla: number
  fieldVariationTesla: number
  fieldVariationPpm: number
  larmorAngularFrequency: number
  larmorAngularFrequencyVariation: number
  larmorFrequencyHertz: number
  zeemanEnergySplitting: number
  polarization: number
  excessProtonCount: number
  boltzmannMagnetization: number
}

export function fieldProfileAt(
  column: number,
  row: number,
  gridSize: number,
  uniformity: FieldUniformity,
): FieldProfile {
  const center = (gridSize - 1) / 2
  const offsetX = column - center
  const offsetY = center - row
  const radialDistance = Math.hypot(offsetX, offsetY)
  const centralCellRadius = gridSize % 2 === 0 ? Math.SQRT1_2 : 0
  const radialFraction = Math.min(
    1,
    Math.max(0, radialDistance - centralCellRadius) /
      (center - centralCellRadius),
  )

  if (uniformity === 'uniform') {
    return {
      radialFraction,
      fieldScale: 1,
      tiltAngleRadians: 0,
      direction: { x: 0, y: 0, z: 1 },
    }
  }

  const {
    maximumVariationPpm,
    radialExponent,
    maximumOffParallelDegrees,
    angularExponent,
  } = NON_UNIFORM_FIELD_MODEL
  const variationPpm =
    maximumVariationPpm * radialFraction ** radialExponent
  const fieldScale = 1 + variationPpm * 1e-6
  const tiltAngleRadians =
    ((maximumOffParallelDegrees * radialFraction ** angularExponent) / 180) *
    Math.PI
  const outwardX = radialDistance === 0 ? 0 : offsetX / radialDistance
  const outwardY = radialDistance === 0 ? 0 : offsetY / radialDistance
  const radialComponent = Math.sin(tiltAngleRadians)

  return {
    radialFraction,
    fieldScale,
    tiltAngleRadians,
    direction: {
      x: outwardX * radialComponent,
      y: outwardY * radialComponent,
      z: Math.cos(tiltAngleRadians),
    },
  }
}

export class HydrogenEnsemble {
  readonly nucleus = '¹H'
  readonly nucleusName = 'Hydrogen nuclei'
  readonly volumeCubicMillimeters = 1
  readonly totalNuclearSpin = 0.5
  readonly gyromagneticRatio = PROTON_GYROMAGNETIC_RATIO
  samplePreset: SamplePresetId = 'air'

  constructor(
    readonly index: number,
    readonly column: number,
    readonly row: number,
    readonly gridSize: number,
    readonly layer: number = 0,
  ) {}

  get possibleSpinProjectionCount() {
    return 2 * this.totalNuclearSpin + 1
  }

  get magneticMoment() {
    return (
      this.gyromagneticRatio *
      PHYSICAL_CONSTANTS.diracConstant *
      this.totalNuclearSpin
    )
  }

  sampleProperties(
    fieldStrengthTesla: SupportedFieldStrengthTesla,
    tissueHeterogeneity = false,
  ) {
    const preset = SAMPLE_PRESETS.find(
      (candidate) => candidate.id === this.samplePreset,
    )!
    const relaxationTimes =
      RELAXATION_TIMES_MS[fieldStrengthTesla][this.samplePreset]
    const tissuePhase = TISSUE_HETEROGENEITY_PHASE[this.samplePreset]
    const t1Variation = tissueHeterogeneity
      ? smoothTissueVariationAt(
          this.column,
          this.row,
          this.gridSize,
          tissuePhase,
        )
      : 0
    const t2Variation = tissueHeterogeneity
      ? smoothTissueVariationAt(
          this.column,
          this.row,
          this.gridSize,
          tissuePhase + 2.1,
        )
      : 0
    const t2StarVariation = tissueHeterogeneity
      ? smoothTissueVariationAt(
          this.column,
          this.row,
          this.gridSize,
          tissuePhase + 4.2,
        )
      : 0
    const longitudinalRelaxationTimeMilliseconds =
      relaxationTimes.t1 * (1 + 0.05 * t1Variation)
    const transverseRelaxationTimeMilliseconds =
      relaxationTimes.t2 * (1 + 0.08 * t2Variation)
    const baseT2StarRatio =
      relaxationTimes.t2 === 0
        ? 0
        : relaxationTimes.t2Star / relaxationTimes.t2
    const effectiveTransverseRelaxationTimeMilliseconds =
      baseT2StarRatio >= 0.999
        ? transverseRelaxationTimeMilliseconds
        : transverseRelaxationTimeMilliseconds *
          Math.min(1, baseT2StarRatio * (1 + 0.08 * t2StarVariation))

    return {
      temperatureCelsius: preset.temperatureCelsius,
      temperatureKelvin: preset.temperatureCelsius + 273.15,
      totalProtonCount: preset.totalProtonCount,
      longitudinalRelaxationTimeMilliseconds,
      transverseRelaxationTimeMilliseconds,
      effectiveTransverseRelaxationTimeMilliseconds,
    }
  }

  magneticProperties(
    nominalFieldStrengthTesla: SupportedFieldStrengthTesla,
    uniformity: FieldUniformity,
  ): MagneticProperties {
    const sampleProperties = this.sampleProperties(nominalFieldStrengthTesla)
    const fieldProfile = fieldProfileAt(
      this.column,
      this.row,
      this.gridSize,
      uniformity,
    )
    const fieldStrengthTesla =
      nominalFieldStrengthTesla * fieldProfile.fieldScale
    const fieldVariationTesla =
      fieldStrengthTesla - nominalFieldStrengthTesla
    const larmorAngularFrequency =
      this.gyromagneticRatio * fieldStrengthTesla
    const polarization = Math.tanh(
      (PHYSICAL_CONSTANTS.diracConstant *
        this.gyromagneticRatio *
        nominalFieldStrengthTesla) /
        (2 *
          PHYSICAL_CONSTANTS.boltzmannConstant *
          sampleProperties.temperatureKelvin),
    )
    const excessProtonCount =
      sampleProperties.totalProtonCount * polarization

    return {
      ...fieldProfile,
      nominalFieldStrengthTesla,
      fieldStrengthTesla,
      fieldVariationTesla,
      fieldVariationPpm:
        (fieldVariationTesla / nominalFieldStrengthTesla) * 1e6,
      larmorAngularFrequency,
      larmorAngularFrequencyVariation:
        this.gyromagneticRatio * fieldVariationTesla,
      larmorFrequencyHertz: larmorAngularFrequency / (2 * Math.PI),
      zeemanEnergySplitting:
        PHYSICAL_CONSTANTS.diracConstant * larmorAngularFrequency,
      polarization,
      excessProtonCount,
      boltzmannMagnetization: this.magneticMoment * excessProtonCount,
    }
  }
}

export function createHydrogenEnsembles(gridSize: number) {
  return Array.from({ length: gridSize * gridSize }, (_, index) => {
    const row = Math.floor(index / gridSize)
    const column = index % gridSize
    return new HydrogenEnsemble(index, column, row, gridSize)
  })
}

/**
 * Block View places the complete source slice on the central plane. Its
 * lower-right quadrant is the horizontal cut face, while two additional
 * copies form the vertical cut faces. The returned indices deliberately
 * match the renderer's block instance order.
 */
export function blockSimulationSourceIndices(gridSize: number) {
  const cutSize = Math.floor(gridSize / 2)
  const indices = Array.from(
    { length: gridSize * gridSize },
    (_, index) => index,
  )

  for (let face = 0; face < 2; face += 1) {
    for (let row = cutSize; row < gridSize; row += 1) {
      for (let column = cutSize; column < gridSize; column += 1) {
        indices.push(row * gridSize + column)
      }
    }
  }

  return indices
}

/**
 * Builds independently simulated copies for Block View while preserving the
 * source slice as the authority for material presets and sidebar selection.
 */
export function createBlockSimulationEnsembles(
  sourceEnsembles: ReadonlyArray<HydrogenEnsemble>,
) {
  if (sourceEnsembles.length === 0) return []

  const sourceIndices = blockSimulationSourceIndices(
    sourceEnsembles[0].gridSize,
  )

  return sourceIndices.map((sourceIndex, simulationIndex) => {
    const source = sourceEnsembles[sourceIndex]
    const planeEnsembleCount = source.gridSize ** 2
    const cutSize = Math.floor(source.gridSize / 2)
    const faceEnsembleCount = cutSize ** 2
    let column = source.column
    let row = source.row
    let layer = cutSize - 1

    if (simulationIndex >= planeEnsembleCount) {
      const faceIndex = Math.floor(
        (simulationIndex - planeEnsembleCount) / faceEnsembleCount,
      )
      if (faceIndex === 0) {
        column = cutSize - 1
        layer = source.column
      } else {
        row = cutSize - 1
        layer = source.row
      }
    }

    const copy = new HydrogenEnsemble(
      simulationIndex,
      column,
      row,
      source.gridSize,
      layer,
    )
    copy.samplePreset = source.samplePreset
    return copy
  })
}
