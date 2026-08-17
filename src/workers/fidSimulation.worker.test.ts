import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FidEnsembleState } from '../simulation/fid'
import type {
  FidWorkerRequest,
  FidWorkerSnapshot,
} from '../simulation/fidWorkerProtocol'

interface FakeWorkerScope {
  onmessage: ((event: MessageEvent<FidWorkerRequest>) => void) | null
  postMessage: ReturnType<typeof vi.fn<(snapshot: FidWorkerSnapshot) => void>>
}

function fidState(): FidEnsembleState {
  return {
    index: 0,
    column: 0,
    row: 0,
    layer: 0,
    gridSize: 1,
    equilibriumMagnetization: 1,
    longitudinalRelaxationTimeMilliseconds: 100,
    transverseRelaxationTimeMilliseconds: 100,
    angularFrequencyOffsetRadiansPerMillisecond: 0,
    fieldVariationTesla: 0,
    fieldVariationPpm: 0,
    fieldTiltAngleRadians: 0,
    fieldDirection: { x: 0, y: 0, z: 1 },
    transmitFieldScale: 1,
    spinPackets: [
      {
        offsetXMillimeters: 0,
        offsetYMillimeters: 0,
        angularFrequencyOffsetRadiansPerMillisecond: 0,
        weight: 1,
      },
    ],
  }
}

describe('FID simulation worker protocol', () => {
  let scope: FakeWorkerScope
  let monotonicTime: number

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    monotonicTime = 0
    vi.spyOn(performance, 'now').mockImplementation(() => {
      monotonicTime += 4
      return monotonicTime
    })
    scope = {
      onmessage: null,
      postMessage: vi.fn(),
    }
    vi.stubGlobal('self', scope)
    await import('./fidSimulation.worker')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function send(message: FidWorkerRequest) {
    scope.onmessage?.({ data: message } as MessageEvent<FidWorkerRequest>)
  }

  function snapshots() {
    return scope.postMessage.mock.calls.map(([snapshot]) => snapshot)
  }

  it('publishes a clean idle snapshot when configured', () => {
    send({
      type: 'configure',
      ensembleStates: [fidState()],
      millisecondsPerTick: 0.25,
      receiverNoise: false,
    })

    expect(snapshots()).toEqual([
      {
        type: 'snapshot',
        status: 'idle',
        timeMilliseconds: 0,
        pulseEvents: [],
        signalPoints: [],
        replaceSignalPoints: true,
      },
    ])
  })

  it('starts with the requested initial pulse and an initial signal sample', () => {
    send({
      type: 'configure',
      ensembleStates: [fidState()],
      millisecondsPerTick: 1,
      receiverNoise: false,
    })
    scope.postMessage.mockClear()

    send({ type: 'start', initialPulseKind: '90-y' })

    const [snapshot] = snapshots()
    expect(snapshot.status).toBe('running')
    expect(snapshot.timeMilliseconds).toBe(0)
    expect(snapshot.pulseEvents).toEqual([
      { timeMilliseconds: 0, kind: '90-y' },
    ])
    expect(snapshot.signalPoints).toHaveLength(1)
    expect(snapshot.signalPoints[0].timeMilliseconds).toBe(0)
    expect(snapshot.signalPoints[0].normalizedVoltage).toBeCloseTo(1, 12)
    expect(snapshot.signalPoints[0].normalizedQuadratureVoltage).toBeCloseTo(
      0,
      12,
    )
    expect(
      snapshot.signalPoints[0].normalizedLongitudinalMagnetization,
    ).toBeCloseTo(0, 12)
    expect(snapshot.replaceSignalPoints).toBe(false)
  })

  it('starts without an RF pulse when initialPulseKind is null', () => {
    send({
      type: 'configure',
      ensembleStates: [fidState()],
      millisecondsPerTick: 1,
      receiverNoise: false,
    })
    scope.postMessage.mockClear()

    send({ type: 'start', initialPulseKind: null })

    const [snapshot] = snapshots()
    expect(snapshot.pulseEvents).toEqual([])
    expect(snapshot.signalPoints[0]).toMatchObject({
      normalizedVoltage: 0,
      normalizedQuadratureVoltage: 0,
      normalizedLongitudinalMagnetization: 1,
    })
  })

  it('records manual pulses only in a configured active session', () => {
    send({ type: 'pulse', pulseKind: '90-y' })
    expect(snapshots()).toEqual([])

    send({
      type: 'configure',
      ensembleStates: [fidState()],
      millisecondsPerTick: 1,
      receiverNoise: false,
    })
    send({ type: 'start', initialPulseKind: null })
    scope.postMessage.mockClear()

    send({ type: 'pulse', pulseKind: '90-y' })

    const [snapshot] = snapshots()
    expect(snapshot.pulseEvents).toEqual([
      { timeMilliseconds: 0, kind: '90-y' },
    ])
    expect(snapshot.signalPoints).toHaveLength(1)
    expect(snapshot.signalPoints[0].normalizedVoltage).toBeCloseTo(1, 12)
  })

  it('pauses, resumes without clearing pulses, and resets completely', () => {
    send({
      type: 'configure',
      ensembleStates: [fidState()],
      millisecondsPerTick: 1,
      receiverNoise: false,
    })
    send({ type: 'start', initialPulseKind: '90-y' })
    scope.postMessage.mockClear()

    send({ type: 'pause' })
    expect(snapshots().at(-1)).toMatchObject({
      status: 'paused',
      pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' }],
    })

    send({ type: 'start', initialPulseKind: null })
    expect(snapshots().at(-1)).toMatchObject({
      status: 'running',
      pulseEvents: [{ timeMilliseconds: 0, kind: '90-y' }],
    })

    send({ type: 'reset' })
    expect(snapshots().at(-1)).toEqual({
      type: 'snapshot',
      status: 'idle',
      timeMilliseconds: 0,
      pulseEvents: [],
      signalPoints: [],
      replaceSignalPoints: true,
    })
  })

  it('ignores pause while idle and accepts a time-step update silently', () => {
    send({ type: 'pause' })
    send({ type: 'set-time-step', millisecondsPerTick: 5 })

    expect(snapshots()).toEqual([])
  })

  it('advances as many fixed simulation ticks as fit in one work batch', () => {
    send({
      type: 'configure',
      ensembleStates: [fidState()],
      millisecondsPerTick: 0.25,
      receiverNoise: false,
    })
    send({ type: 'start', initialPulseKind: '90-y' })
    scope.postMessage.mockClear()

    vi.advanceTimersToNextTimer()
    send({ type: 'pause' })

    const snapshot = snapshots().at(-1)
    expect(snapshot).toMatchObject({
      status: 'paused',
      timeMilliseconds: 0.5,
    })
    expect(snapshot?.signalPoints.map((point) => point.timeMilliseconds)).toEqual([
      0.25,
      0.5,
    ])
  })
})
