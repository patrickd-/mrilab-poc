import { describe, expect, it } from 'vitest'
import {
  blockSimulationSourceIndices,
  createBlockSimulationEnsembles,
  createHydrogenEnsembles,
  fieldProfileAt,
  HydrogenEnsemble,
  NON_UNIFORM_FIELD_MODEL,
  PHYSICAL_CONSTANTS,
  PROTON_GYROMAGNETIC_RATIO,
  SAMPLE_PRESETS,
  type SamplePresetId,
  type SupportedFieldStrengthTesla,
} from './HydrogenEnsemble'

const RELAXATION_EXPECTATIONS: Readonly<
  Record<
    SupportedFieldStrengthTesla,
    Readonly<Record<SamplePresetId, readonly [number, number, number]>>
  >
> = {
  1.5: {
    air: [0, 0, 0],
    'cortical-bone': [110, 0.4, 0.4],
    'cerebrospinal-fluid': [4300, 2100, 550],
    'gray-matter': [1200, 84, 84],
    'white-matter': [650, 80, 66.2],
  },
  3: {
    air: [0, 0, 0],
    'cortical-bone': [150, 0.4, 0.4],
    'cerebrospinal-fluid': [4300, 2000, 333.5],
    'gray-matter': [1610, 72, 66],
    'white-matter': [840, 71, 53.2],
  },
  7: {
    air: [0, 0, 0],
    'cortical-bone': [425, 0.4, 0.4],
    'cerebrospinal-fluid': [4300, 1000, 168],
    'gray-matter': [1940, 47, 33.2],
    'white-matter': [1130, 47, 26.8],
  },
}

function ensembleWithPreset(
  samplePreset: SamplePresetId,
  column = 8,
  row = 11,
  gridSize = 32,
) {
  const ensemble = new HydrogenEnsemble(
    row * gridSize + column,
    column,
    row,
    gridSize,
  )
  ensemble.samplePreset = samplePreset
  return ensemble
}

describe('physical constants and static proton properties', () => {
  it('keeps hbar consistent with h / 2pi', () => {
    expect(PHYSICAL_CONSTANTS.diracConstant).toBeCloseTo(
      PHYSICAL_CONSTANTS.planckConstant / (2 * Math.PI),
      9,
    )
  })

  it('defines the expected 1H ensemble properties', () => {
    const ensemble = new HydrogenEnsemble(0, 0, 0, 8)

    expect(ensemble.nucleus).toBe('¹H')
    expect(ensemble.nucleusName).toBe('Hydrogen nuclei')
    expect(ensemble.volumeCubicMillimeters).toBe(1)
    expect(ensemble.totalNuclearSpin).toBe(0.5)
    expect(ensemble.possibleSpinProjectionCount).toBe(2)
    expect(ensemble.gyromagneticRatio).toBe(PROTON_GYROMAGNETIC_RATIO)
    expect(ensemble.magneticMoment).toBeCloseTo(
      PROTON_GYROMAGNETIC_RATIO *
        PHYSICAL_CONSTANTS.diracConstant *
        0.5,
      12,
    )
  })
})

describe('sample presets and relaxation values', () => {
  it('contains each preset with its specified temperature and density', () => {
    expect(SAMPLE_PRESETS).toEqual([
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
  })

  it.each([1.5, 3, 7] as const)(
    'returns the tabulated T1, T2, and T2* values at %s T',
    (fieldStrengthTesla) => {
      SAMPLE_PRESETS.forEach(({ id }) => {
        const properties = ensembleWithPreset(id).sampleProperties(
          fieldStrengthTesla,
        )
        const [t1, t2, t2Star] =
          RELAXATION_EXPECTATIONS[fieldStrengthTesla][id]

        expect(properties.longitudinalRelaxationTimeMilliseconds).toBe(t1)
        expect(properties.transverseRelaxationTimeMilliseconds).toBe(t2)
        expect(
          properties.effectiveTransverseRelaxationTimeMilliseconds,
        ).toBeCloseTo(t2Star, 10)
        expect(
          properties.effectiveTransverseRelaxationTimeMilliseconds,
        ).toBeLessThanOrEqual(
          properties.transverseRelaxationTimeMilliseconds,
        )
      })
    },
  )

  it('converts preset temperatures to kelvin', () => {
    expect(ensembleWithPreset('air').sampleProperties(1.5)).toMatchObject({
      temperatureCelsius: 22,
      temperatureKelvin: 295.15,
    })
    expect(
      ensembleWithPreset('gray-matter').sampleProperties(1.5),
    ).toMatchObject({
      temperatureCelsius: 37,
      temperatureKelvin: 310.15,
    })
  })

  it('applies bounded, deterministic tissue heterogeneity', () => {
    const ensemble = ensembleWithPreset('white-matter')
    const homogeneous = ensemble.sampleProperties(3)
    const heterogeneous = ensemble.sampleProperties(3, true)
    const repeated = ensemble.sampleProperties(3, true)

    expect(heterogeneous).toEqual(repeated)
    expect(heterogeneous).not.toEqual(homogeneous)
    expect(
      heterogeneous.longitudinalRelaxationTimeMilliseconds /
        homogeneous.longitudinalRelaxationTimeMilliseconds,
    ).toBeGreaterThanOrEqual(0.95)
    expect(
      heterogeneous.longitudinalRelaxationTimeMilliseconds /
        homogeneous.longitudinalRelaxationTimeMilliseconds,
    ).toBeLessThanOrEqual(1.05)
    expect(
      heterogeneous.transverseRelaxationTimeMilliseconds /
        homogeneous.transverseRelaxationTimeMilliseconds,
    ).toBeGreaterThanOrEqual(0.92)
    expect(
      heterogeneous.transverseRelaxationTimeMilliseconds /
        homogeneous.transverseRelaxationTimeMilliseconds,
    ).toBeLessThanOrEqual(1.08)
    expect(
      heterogeneous.effectiveTransverseRelaxationTimeMilliseconds,
    ).toBeLessThanOrEqual(
      heterogeneous.transverseRelaxationTimeMilliseconds,
    )
  })
})

describe('B0 field profiles', () => {
  it('keeps uniform fields parallel and equal to B0 everywhere', () => {
    const center = fieldProfileAt(63.5, 63.5, 128, 'uniform')
    const edge = fieldProfileAt(127, 63.5, 128, 'uniform')

    expect(center).toMatchObject({
      radialFraction: 0,
      fieldScale: 1,
      tiltAngleRadians: 0,
      direction: { x: 0, y: 0, z: 1 },
    })
    expect(edge.fieldScale).toBe(1)
    expect(edge.tiltAngleRadians).toBe(0)
    expect(edge.direction).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('reaches the configured ppm and angular deviation at the edge', () => {
    const edge = fieldProfileAt(127, 63.5, 128, 'non-uniform')
    const expectedTilt =
      (NON_UNIFORM_FIELD_MODEL.maximumOffParallelDegrees * Math.PI) / 180

    expect(edge.radialFraction).toBe(1)
    expect((edge.fieldScale - 1) * 1e6).toBeCloseTo(
      NON_UNIFORM_FIELD_MODEL.maximumVariationPpm,
      8,
    )
    expect(edge.tiltAngleRadians).toBeCloseTo(expectedTilt, 12)
    expect(edge.direction.x).toBeGreaterThan(0)
    expect(edge.direction.y).toBeCloseTo(0, 12)
    expect(Math.hypot(edge.direction.x, edge.direction.y, edge.direction.z)).toBeCloseTo(
      1,
      12,
    )
  })

  it('is radially symmetric while pointing away from isocenter', () => {
    const right = fieldProfileAt(127, 63.5, 128, 'non-uniform')
    const left = fieldProfileAt(0, 63.5, 128, 'non-uniform')
    const top = fieldProfileAt(63.5, 0, 128, 'non-uniform')

    expect(left.fieldScale).toBeCloseTo(right.fieldScale, 14)
    expect(top.fieldScale).toBeCloseTo(right.fieldScale, 14)
    expect(left.direction.x).toBeCloseTo(-right.direction.x, 14)
    expect(top.direction.y).toBeCloseTo(right.direction.x, 14)
  })
})

describe('derived magnetic properties', () => {
  it.each([1.5, 3, 7] as const)(
    'keeps the Larmor, Zeeman, polarization, excess, and M0 relationships at %s T',
    (fieldStrengthTesla) => {
      const ensemble = ensembleWithPreset('gray-matter')
      const sample = ensemble.sampleProperties(fieldStrengthTesla)
      const magnetic = ensemble.magneticProperties(
        fieldStrengthTesla,
        'uniform',
      )
      const expectedPolarization = Math.tanh(
        (PHYSICAL_CONSTANTS.diracConstant *
          PROTON_GYROMAGNETIC_RATIO *
          fieldStrengthTesla) /
          (2 *
            PHYSICAL_CONSTANTS.boltzmannConstant *
            sample.temperatureKelvin),
      )

      expect(magnetic.fieldStrengthTesla).toBe(fieldStrengthTesla)
      expect(magnetic.fieldVariationTesla).toBe(0)
      expect(magnetic.larmorAngularFrequency).toBeCloseTo(
        PROTON_GYROMAGNETIC_RATIO * fieldStrengthTesla,
        8,
      )
      expect(magnetic.larmorFrequencyHertz).toBeCloseTo(
        magnetic.larmorAngularFrequency / (2 * Math.PI),
        8,
      )
      expect(magnetic.zeemanEnergySplitting).toBeCloseTo(
        PHYSICAL_CONSTANTS.diracConstant *
          magnetic.larmorAngularFrequency,
        12,
      )
      expect(magnetic.polarization).toBeCloseTo(expectedPolarization, 12)
      expect(magnetic.excessProtonCount).toBeCloseTo(
        sample.totalProtonCount * expectedPolarization,
        8,
      )
      expect(magnetic.boltzmannMagnetization).toBeCloseTo(
        ensemble.magneticMoment * magnetic.excessProtonCount,
        10,
      )
    },
  )

  it('applies the non-uniform field variation to local Larmor frequency', () => {
    const ensemble = ensembleWithPreset('gray-matter', 31, 15.5, 32)
    const magnetic = ensemble.magneticProperties(3, 'non-uniform')

    expect(magnetic.fieldVariationPpm).toBeCloseTo(1, 8)
    expect(magnetic.fieldVariationTesla).toBeCloseTo(3e-6, 12)
    expect(magnetic.larmorAngularFrequencyVariation).toBeCloseTo(
      PROTON_GYROMAGNETIC_RATIO * magnetic.fieldVariationTesla,
      8,
    )
  })
})

describe('slice and block ensemble construction', () => {
  it('creates a row-major square slice with a shared mid-plane layer', () => {
    const ensembles = createHydrogenEnsembles(4)

    expect(ensembles).toHaveLength(16)
    expect(ensembles[0]).toMatchObject({
      index: 0,
      column: 0,
      row: 0,
      gridSize: 4,
      layer: 1.5,
    })
    expect(ensembles[6]).toMatchObject({
      index: 6,
      column: 2,
      row: 1,
      layer: 1.5,
    })
    expect(ensembles[15]).toMatchObject({
      index: 15,
      column: 3,
      row: 3,
      layer: 1.5,
    })
  })

  it('maps the lower-right quadrant to three independently simulated faces', () => {
    const source = createHydrogenEnsembles(4)
    source.forEach((ensemble) => {
      ensemble.samplePreset =
        ensemble.index % 2 === 0 ? 'gray-matter' : 'white-matter'
    })
    const indices = blockSimulationSourceIndices(4)
    const block = createBlockSimulationEnsembles(source)

    expect(indices).toEqual([10, 11, 14, 15, 10, 11, 14, 15, 10, 11, 14, 15])
    expect(block).toHaveLength(12)
    expect(block.map((ensemble) => ensemble.index)).toEqual(
      Array.from({ length: 12 }, (_, index) => index),
    )
    expect(block.slice(0, 4).map(({ column, row, layer }) => [column, row, layer])).toEqual([
      [2, 2, 1.5],
      [3, 2, 1.5],
      [2, 3, 1.5],
      [3, 3, 1.5],
    ])
    expect(block.slice(4, 8).map(({ column, row, layer }) => [column, row, layer])).toEqual([
      [1, 2, 2],
      [1, 2, 3],
      [1, 3, 2],
      [1, 3, 3],
    ])
    expect(block.slice(8).map(({ column, row, layer }) => [column, row, layer])).toEqual([
      [2, 1, 2],
      [3, 1, 2],
      [2, 1, 3],
      [3, 1, 3],
    ])
    expect(block.map((ensemble) => ensemble.samplePreset)).toEqual(
      indices.map((index) => source[index].samplePreset),
    )
    expect(block[0]).not.toBe(source[indices[0]])
  })

  it('returns no block ensembles for an empty source', () => {
    expect(createBlockSimulationEnsembles([])).toEqual([])
  })
})
