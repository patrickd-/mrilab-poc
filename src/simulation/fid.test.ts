import { describe, expect, it } from 'vitest'
import {
  createHydrogenEnsembles,
  HydrogenEnsemble,
  type FieldDirection,
} from '../models/HydrogenEnsemble'
import {
  createFidEnsembleStates,
  fidEnsembleMagnetizationStateAt,
  fidSignalPointAt,
  normalizedFidSignal,
  normalizedLongitudinalMagnetization,
  receiverNoiseAt,
  transmitFieldScaleAt,
  type FidEnsembleState,
  type FidSpinPacketState,
  type RfPulseEvent,
} from './fid'

const DEFAULT_FIELD_DIRECTION: FieldDirection = { x: 0, y: 0, z: 1 }
const NINETY_Y: RfPulseEvent = { timeMilliseconds: 0, kind: '90-y' }

function spinPacket(
  angularFrequencyOffsetRadiansPerMillisecond = 0,
  weight = 1,
): FidSpinPacketState {
  return {
    offsetXMillimeters: 0,
    offsetYMillimeters: 0,
    angularFrequencyOffsetRadiansPerMillisecond,
    weight,
  }
}

function fidState(
  overrides: Partial<FidEnsembleState> = {},
): FidEnsembleState {
  return {
    index: 0,
    column: 4,
    row: 4,
    layer: 3.5,
    gridSize: 8,
    equilibriumMagnetization: 1,
    longitudinalRelaxationTimeMilliseconds: 100,
    transverseRelaxationTimeMilliseconds: 100,
    angularFrequencyOffsetRadiansPerMillisecond: 0,
    fieldVariationTesla: 0,
    fieldVariationPpm: 0,
    fieldTiltAngleRadians: 0,
    fieldDirection: DEFAULT_FIELD_DIRECTION,
    transmitFieldScale: 1,
    spinPackets: [spinPacket()],
    ...overrides,
  }
}

describe('receiver realism', () => {
  it('generates deterministic noise for a given sample time', () => {
    expect(receiverNoiseAt(12.3456)).toEqual(receiverNoiseAt(12.3456))
    expect(receiverNoiseAt(12.3456)).not.toEqual(receiverNoiseAt(12.3457))
  })

  it('approximates zero-mean Gaussian noise with the configured deviation', () => {
    const samples = Array.from({ length: 10_000 }, (_, index) =>
      receiverNoiseAt(index / 10),
    )
    const channels = samples.flatMap(({ inPhase, quadrature }) => [
      inPhase,
      quadrature,
    ])
    const mean =
      channels.reduce((sum, sample) => sum + sample, 0) / channels.length
    const standardDeviation = Math.sqrt(
      channels.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) /
        channels.length,
    )

    expect(Math.abs(mean)).toBeLessThan(4e-4)
    expect(standardDeviation).toBeCloseTo(1 / 80, 3)
  })

  it('keeps B1 uniform when disabled', () => {
    expect(transmitFieldScaleAt(0, 0, 128, 7, false)).toBe(1)
    expect(transmitFieldScaleAt(127, 127, 128, 7, false)).toBe(1)
  })

  it('uses a normalized asymmetric B1 profile whose strength grows with B0', () => {
    expect(transmitFieldScaleAt(63.5, 63.5, 128, 7, true)).toBe(1)

    const scaleAt1Point5T = transmitFieldScaleAt(127, 0, 128, 1.5, true)
    const scaleAt7T = transmitFieldScaleAt(127, 0, 128, 7, true)

    expect(scaleAt1Point5T).toBeGreaterThan(1)
    expect(scaleAt7T).toBeGreaterThan(scaleAt1Point5T)
    expect(Math.abs(scaleAt7T - 1)).toBeLessThanOrEqual(0.15)
  })
})

describe('RF rotations and free evolution', () => {
  it('remains at thermal equilibrium until a pulse is applied', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(
      fidState(),
      1000,
      [],
    )

    expect(magnetization).toEqual({
      excited: false,
      xFraction: 0,
      yFraction: 0,
      zFraction: 1,
      transverseFraction: 0,
      longitudinalFraction: 1,
      precessionPhaseRadians: 0,
      flipAngleRadians: 0,
    })
  })

  it('rotates equilibrium magnetization by 90 degrees about y', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(
      fidState(),
      0,
      [NINETY_Y],
    )

    expect(magnetization.excited).toBe(true)
    expect(magnetization.xFraction).toBeCloseTo(1, 12)
    expect(magnetization.yFraction).toBeCloseTo(0, 12)
    expect(magnetization.zFraction).toBeCloseTo(0, 12)
    expect(magnetization.flipAngleRadians).toBeCloseTo(Math.PI / 2, 12)
  })

  it('uses the local B1 scale as the RF flip-angle multiplier', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(
      fidState({ transmitFieldScale: 0.5 }),
      0,
      [NINETY_Y],
    )

    expect(magnetization.xFraction).toBeCloseTo(Math.SQRT1_2, 12)
    expect(magnetization.zFraction).toBeCloseTo(Math.SQRT1_2, 12)
    expect(magnetization.flipAngleRadians).toBeCloseTo(Math.PI / 4, 12)
  })

  it('precesses at the packet angular-frequency offset', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(
      fidState({
        transverseRelaxationTimeMilliseconds: 1e12,
        spinPackets: [spinPacket(Math.PI / 2)],
      }),
      1,
      [NINETY_Y],
    )

    expect(magnetization.xFraction).toBeCloseTo(0, 9)
    expect(magnetization.yFraction).toBeCloseTo(1, 9)
    expect(magnetization.precessionPhaseRadians).toBeCloseTo(
      Math.PI / 2,
      9,
    )
  })

  it('applies T2 decay and T1 recovery after a 90-degree pulse', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(
      fidState({
        longitudinalRelaxationTimeMilliseconds: 100,
        transverseRelaxationTimeMilliseconds: 50,
      }),
      50,
      [NINETY_Y],
    )

    expect(magnetization.transverseFraction).toBeCloseTo(Math.exp(-1), 12)
    expect(magnetization.longitudinalFraction).toBeCloseTo(
      1 - Math.exp(-0.5),
      12,
    )
  })

  it('treats zero relaxation times as immediate equilibrium and no transverse signal', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(
      fidState({
        longitudinalRelaxationTimeMilliseconds: 0,
        transverseRelaxationTimeMilliseconds: 0,
      }),
      1,
      [NINETY_Y],
    )

    expect(magnetization.transverseFraction).toBe(0)
    expect(magnetization.longitudinalFraction).toBe(1)
  })

  it('ignores pulses scheduled after the requested state time', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(fidState(), 5, [
      { timeMilliseconds: 10, kind: '90-y' },
    ])

    expect(magnetization.excited).toBe(false)
    expect(magnetization.longitudinalFraction).toBe(1)
  })

  it('allows a second 90-degree pulse to invert coherent magnetization', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(fidState(), 0, [
      NINETY_Y,
      NINETY_Y,
    ])

    expect(magnetization.transverseFraction).toBeCloseTo(0, 12)
    expect(magnetization.longitudinalFraction).toBeCloseTo(-1, 12)
  })

  it('normalizes spin-packet weights before returning magnetization', () => {
    const magnetization = fidEnsembleMagnetizationStateAt(
      fidState({ spinPackets: [spinPacket(0, 2), spinPacket(0, 2)] }),
      0,
      [NINETY_Y],
    )

    expect(magnetization.xFraction).toBeCloseTo(1, 12)
    expect(magnetization.longitudinalFraction).toBeCloseTo(0, 12)
  })

  it('rephases symmetric packets into a spin echo after a 180-degree pulse', () => {
    const state = fidState({
      longitudinalRelaxationTimeMilliseconds: 1e12,
      transverseRelaxationTimeMilliseconds: 1e12,
      spinPackets: [spinPacket(Math.PI / 40, 0.5), spinPacket(-Math.PI / 40, 0.5)],
    })
    const withoutRefocusing = fidEnsembleMagnetizationStateAt(state, 20, [
      NINETY_Y,
    ])
    const withRefocusing = fidEnsembleMagnetizationStateAt(state, 20, [
      NINETY_Y,
      { timeMilliseconds: 10, kind: '180-x' },
    ])

    expect(withoutRefocusing.transverseFraction).toBeCloseTo(0, 9)
    expect(withRefocusing.transverseFraction).toBeCloseTo(1, 9)
    expect(withRefocusing.xFraction).toBeCloseTo(1, 9)
  })
})

describe('FID ensemble-state construction', () => {
  it('filters air and preserves the physical properties of tissue ensembles', () => {
    const ensembles = createHydrogenEnsembles(2)
    ensembles[1].samplePreset = 'gray-matter'
    ensembles[2].samplePreset = 'white-matter'
    const states = createFidEnsembleStates(ensembles, 3, 'uniform')

    expect(states).toHaveLength(2)
    expect(states.map((state) => state.index)).toEqual([1, 2])
    expect(states[0]).toMatchObject({
      column: 1,
      row: 0,
      layer: 0.5,
      gridSize: 2,
      longitudinalRelaxationTimeMilliseconds: 1610,
      transverseRelaxationTimeMilliseconds: 72,
      fieldVariationTesla: 0,
      fieldVariationPpm: 0,
      fieldDirection: DEFAULT_FIELD_DIRECTION,
      transmitFieldScale: 1,
    })
    expect(states[0].spinPackets).toEqual([spinPacket()])
    expect(states[0].equilibriumMagnetization).toBeGreaterThan(0)
  })

  it('creates a normalized 3x3 isochromat grid for intravoxel dephasing', () => {
    const ensemble = new HydrogenEnsemble(0, 10, 12, 32)
    ensemble.samplePreset = 'cerebrospinal-fluid'
    const [state] = createFidEnsembleStates(
      [ensemble],
      3,
      'uniform',
      { intravoxelDephasing: true },
    )

    expect(state.spinPackets).toHaveLength(9)
    expect(
      state.spinPackets.reduce((sum, packet) => sum + packet.weight, 0),
    ).toBeCloseTo(1, 12)
    expect(
      new Set(state.spinPackets.map((packet) => packet.offsetXMillimeters)),
    ).toEqual(new Set([-1 / 3, 0, 1 / 3]))
    expect(
      new Set(state.spinPackets.map((packet) => packet.offsetYMillimeters)),
    ).toEqual(new Set([-1 / 3, 0, 1 / 3]))
    expect(
      Math.min(
        ...state.spinPackets.map(
          (packet) => packet.angularFrequencyOffsetRadiansPerMillisecond,
        ),
      ),
    ).toBeLessThan(0)
    expect(
      Math.max(
        ...state.spinPackets.map(
          (packet) => packet.angularFrequencyOffsetRadiansPerMillisecond,
        ),
      ),
    ).toBeGreaterThan(0)
  })

  it('propagates B0, B1, and tissue-heterogeneity realism options', () => {
    const ensemble = new HydrogenEnsemble(0, 31, 0, 32)
    ensemble.samplePreset = 'white-matter'
    const [baseline] = createFidEnsembleStates(
      [ensemble],
      7,
      'uniform',
    )
    const [realistic] = createFidEnsembleStates(
      [ensemble],
      7,
      'non-uniform',
      { b1Inhomogeneity: true, tissueHeterogeneity: true },
    )

    expect(realistic.fieldVariationPpm).toBeGreaterThan(0)
    expect(realistic.angularFrequencyOffsetRadiansPerMillisecond).not.toBe(0)
    expect(realistic.fieldTiltAngleRadians).toBeGreaterThan(0)
    expect(realistic.transmitFieldScale).not.toBe(1)
    expect(realistic.longitudinalRelaxationTimeMilliseconds).not.toBe(
      baseline.longitudinalRelaxationTimeMilliseconds,
    )
    expect(realistic.transverseRelaxationTimeMilliseconds).not.toBe(
      baseline.transverseRelaxationTimeMilliseconds,
    )
  })
})

describe('aggregate FID and longitudinal signals', () => {
  it('returns zero voltage for no active ensembles', () => {
    expect(normalizedFidSignal([], 10, [NINETY_Y])).toEqual({
      inPhaseVoltage: 0,
      quadratureVoltage: 0,
      longitudinalMagnetization: 0,
    })
    expect(normalizedLongitudinalMagnetization([], 10, [NINETY_Y])).toBe(0)
  })

  it('reports unit I voltage immediately after an ideal 90-degree pulse', () => {
    const signal = normalizedFidSignal([fidState()], 0, [NINETY_Y])

    expect(signal.inPhaseVoltage).toBeCloseTo(1, 12)
    expect(signal.quadratureVoltage).toBeCloseTo(0, 12)
    expect(signal.longitudinalMagnetization).toBeCloseTo(0, 12)
  })

  it('reports quadrature voltage after a quarter-turn of free precession', () => {
    const signal = normalizedFidSignal(
      [
        fidState({
          transverseRelaxationTimeMilliseconds: 1e12,
          spinPackets: [spinPacket(Math.PI / 2)],
        }),
      ],
      1,
      [NINETY_Y],
    )

    expect(signal.inPhaseVoltage).toBeCloseTo(0, 9)
    expect(signal.quadratureVoltage).toBeCloseTo(1, 9)
  })

  it('weights signal and longitudinal recovery by equilibrium magnetization', () => {
    const signal = normalizedFidSignal(
      [
        fidState({
          equilibriumMagnetization: 1,
          longitudinalRelaxationTimeMilliseconds: 100,
        }),
        fidState({
          index: 1,
          equilibriumMagnetization: 3,
          longitudinalRelaxationTimeMilliseconds: 200,
        }),
      ],
      100,
      [NINETY_Y],
    )
    const expectedLongitudinal =
      ((1 - Math.exp(-1)) + 3 * (1 - Math.exp(-0.5))) / 4

    expect(signal.longitudinalMagnetization).toBeCloseTo(
      expectedLongitudinal,
      12,
    )
    expect(
      normalizedLongitudinalMagnetization(
        [
          fidState({
            equilibriumMagnetization: 1,
            longitudinalRelaxationTimeMilliseconds: 100,
          }),
          fidState({
            index: 1,
            equilibriumMagnetization: 3,
            longitudinalRelaxationTimeMilliseconds: 200,
          }),
        ],
        100,
        [NINETY_Y],
      ),
    ).toBeCloseTo(expectedLongitudinal, 12)
  })

  it('allows oppositely phased ensembles to cancel coherently', () => {
    const signal = normalizedFidSignal(
      [
        fidState({
          transverseRelaxationTimeMilliseconds: 1e12,
          spinPackets: [spinPacket(Math.PI / 2)],
        }),
        fidState({
          index: 1,
          transverseRelaxationTimeMilliseconds: 1e12,
          spinPackets: [spinPacket(-Math.PI / 2)],
        }),
      ],
      1,
      [NINETY_Y],
    )

    expect(signal.inPhaseVoltage).toBeCloseTo(0, 9)
    expect(signal.quadratureVoltage).toBeCloseTo(0, 9)
  })

  it('adds deterministic receiver noise only to I and Q', () => {
    const states = [fidState()]
    const clean = fidSignalPointAt(states, 12.5, [NINETY_Y], false)
    const noisy = fidSignalPointAt(states, 12.5, [NINETY_Y], true)
    const expectedNoise = receiverNoiseAt(12.5)

    expect(noisy.timeMilliseconds).toBe(12.5)
    expect(noisy.normalizedVoltage - clean.normalizedVoltage).toBeCloseTo(
      expectedNoise.inPhase,
      12,
    )
    expect(
      noisy.normalizedQuadratureVoltage -
        clean.normalizedQuadratureVoltage,
    ).toBeCloseTo(expectedNoise.quadrature, 12)
    expect(noisy.normalizedLongitudinalMagnetization).toBe(
      clean.normalizedLongitudinalMagnetization,
    )
  })
})
