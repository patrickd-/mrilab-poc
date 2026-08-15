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

const PROTON_GYROMAGNETIC_RATIO = 2.675_221_870_8e8

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
}

const RELAXATION_TIMES_MS: Readonly<
  Record<
    SupportedFieldStrengthTesla,
    Readonly<Record<SamplePresetId, RelaxationTimesMilliseconds>>
  >
> = {
  1.5: {
    air: { t1: 0, t2: 0 },
    'cortical-bone': { t1: 110, t2: 0.4 },
    'cerebrospinal-fluid': { t1: 4300, t2: 2100 },
    'gray-matter': { t1: 1200, t2: 84 },
    'white-matter': { t1: 650, t2: 80 },
  },
  3: {
    air: { t1: 0, t2: 0 },
    'cortical-bone': { t1: 150, t2: 0.4 },
    'cerebrospinal-fluid': { t1: 4300, t2: 2000 },
    'gray-matter': { t1: 1610, t2: 72 },
    'white-matter': { t1: 840, t2: 71 },
  },
  7: {
    air: { t1: 0, t2: 0 },
    'cortical-bone': { t1: 425, t2: 0.4 },
    'cerebrospinal-fluid': { t1: 4300, t2: 1000 },
    'gray-matter': { t1: 1940, t2: 47 },
    'white-matter': { t1: 1130, t2: 47 },
  },
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

  sampleProperties(fieldStrengthTesla: SupportedFieldStrengthTesla) {
    const preset = SAMPLE_PRESETS.find(
      (candidate) => candidate.id === this.samplePreset,
    )!
    const relaxationTimes =
      RELAXATION_TIMES_MS[fieldStrengthTesla][this.samplePreset]

    return {
      temperatureCelsius: preset.temperatureCelsius,
      temperatureKelvin: preset.temperatureCelsius + 273.15,
      totalProtonCount: preset.totalProtonCount,
      longitudinalRelaxationTimeMilliseconds: relaxationTimes.t1,
      transverseRelaxationTimeMilliseconds: relaxationTimes.t2,
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
