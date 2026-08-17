// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HydrogenEnsemble } from '../models/HydrogenEnsemble'
import type { FidSignalPoint } from '../simulation/fid'
import type {
  FidWorkerRequest,
  FidWorkerSnapshot,
} from '../simulation/fidWorkerProtocol'
import { useFidSimulation } from './useFidSimulation'

class MockWorker {
  static instances: MockWorker[] = []

  readonly messages: FidWorkerRequest[] = []
  readonly terminate = vi.fn()
  onmessage: ((event: MessageEvent<FidWorkerSnapshot>) => void) | null = null

  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    MockWorker.instances.push(this)
  }

  postMessage(message: FidWorkerRequest) {
    this.messages.push(message)
  }

  emit(snapshot: FidWorkerSnapshot) {
    this.onmessage?.({ data: snapshot } as MessageEvent<FidWorkerSnapshot>)
  }
}

function tissueEnsembles() {
  const air = new HydrogenEnsemble(0, 0, 0, 2)
  const tissue = new HydrogenEnsemble(1, 1, 0, 2)
  tissue.samplePreset = 'gray-matter'
  return [air, tissue]
}

function signalPoint(timeMilliseconds: number): FidSignalPoint {
  return {
    timeMilliseconds,
    normalizedVoltage: timeMilliseconds / 1000,
    normalizedQuadratureVoltage: 0,
    normalizedLongitudinalMagnetization: 1,
  }
}

const BASE_OPTIONS = {
  active: true,
  ensembles: tissueEnsembles(),
  ensembleRevision: 0,
  fieldStrengthTesla: 1.5 as const,
  fieldUniformity: 'uniform' as const,
  intravoxelDephasing: false,
  b1Inhomogeneity: false,
  receiverNoise: false,
  tissueHeterogeneity: false,
  initialPulseKind: null,
  millisecondsPerTick: 1,
}

describe('useFidSimulation', () => {
  beforeEach(() => {
    MockWorker.instances = []
    vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker)
  })

  it('constructs, configures, and terminates the simulation worker', () => {
    const { result, unmount } = renderHook(() =>
      useFidSimulation(BASE_OPTIONS),
    )
    const worker = MockWorker.instances[0]

    expect(MockWorker.instances).toHaveLength(1)
    expect(worker.options).toEqual({ type: 'module' })
    expect(worker.url.pathname).toContain('fidSimulation.worker.ts')
    expect(worker.messages[0]).toMatchObject({
      type: 'configure',
      millisecondsPerTick: 1,
      receiverNoise: false,
    })
    if (worker.messages[0].type !== 'configure') {
      throw new Error('Expected configure message')
    }
    expect(worker.messages[0].ensembleStates).toHaveLength(1)
    expect(result.current.ensembleStates).toHaveLength(1)
    expect(worker.messages[1]).toEqual({
      type: 'set-time-step',
      millisecondsPerTick: 1,
    })

    unmount()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('posts transport and RF commands with the selected initial pulse', () => {
    const options = {
      ...BASE_OPTIONS,
      initialPulseKind: '90-y' as const,
    }
    const { result } = renderHook(() => useFidSimulation(options))
    const worker = MockWorker.instances[0]
    worker.messages.length = 0

    act(() => result.current.start())
    act(() => result.current.applyPulse('180-x'))
    act(() => result.current.pause())
    act(() => result.current.reset())

    expect(worker.messages).toEqual([
      { type: 'start', initialPulseKind: '90-y' },
      { type: 'pulse', pulseKind: '180-x' },
      { type: 'pause' },
      { type: 'reset' },
    ])
  })

  it('does not post a start command while inactive', () => {
    const { result } = renderHook(() =>
      useFidSimulation({ ...BASE_OPTIONS, active: false }),
    )
    const worker = MockWorker.instances[0]
    worker.messages.length = 0

    act(() => result.current.start())

    expect(worker.messages).toEqual([])
    expect(result.current.ensembleStates).toEqual([])
  })

  it('updates status, time, pulses, and replaces signal history from snapshots', () => {
    const { result } = renderHook(() => useFidSimulation(BASE_OPTIONS))
    const worker = MockWorker.instances[0]
    const pulseEvents = [{ timeMilliseconds: 0, kind: '90-y' as const }]

    act(() => {
      worker.emit({
        type: 'snapshot',
        status: 'running',
        timeMilliseconds: 25,
        pulseEvents,
        signalPoints: [signalPoint(0), signalPoint(25)],
        replaceSignalPoints: true,
      })
    })

    expect(result.current.status).toBe('running')
    expect(result.current.timeMilliseconds).toBe(25)
    expect(result.current.pulseEvents).toEqual(pulseEvents)
    expect(result.current.signalPoints).toEqual([
      signalPoint(0),
      signalPoint(25),
    ])
    expect(result.current.graphWindowStartMilliseconds).toBe(0)
    expect(result.current.graphWindowEndMilliseconds).toBe(100)
  })

  it('appends snapshots and retains one point before the 5-second sliding window', () => {
    const { result } = renderHook(() => useFidSimulation(BASE_OPTIONS))
    const worker = MockWorker.instances[0]

    act(() => {
      worker.emit({
        type: 'snapshot',
        status: 'running',
        timeMilliseconds: 1000,
        pulseEvents: [],
        signalPoints: [signalPoint(0), signalPoint(500), signalPoint(1000)],
        replaceSignalPoints: true,
      })
      worker.emit({
        type: 'snapshot',
        status: 'paused',
        timeMilliseconds: 6000,
        pulseEvents: [],
        signalPoints: [signalPoint(2000), signalPoint(6000)],
        replaceSignalPoints: false,
      })
    })

    expect(result.current.signalPoints.map(({ timeMilliseconds }) => timeMilliseconds)).toEqual([
      500,
      1000,
      2000,
      6000,
    ])
    expect(result.current.graphWindowStartMilliseconds).toBe(1000)
    expect(result.current.graphWindowEndMilliseconds).toBe(6000)
    expect(result.current.status).toBe('paused')
  })

  it('sends time-step changes without rebuilding ensemble states', () => {
    const { result, rerender } = renderHook(
      ({ millisecondsPerTick }) =>
        useFidSimulation({ ...BASE_OPTIONS, millisecondsPerTick }),
      { initialProps: { millisecondsPerTick: 1 } },
    )
    const worker = MockWorker.instances[0]
    const originalStates = result.current.ensembleStates
    worker.messages.length = 0

    rerender({ millisecondsPerTick: 0.25 })

    expect(result.current.ensembleStates).toBe(originalStates)
    expect(worker.messages).toEqual([
      { type: 'set-time-step', millisecondsPerTick: 0.25 },
    ])
  })

  it('reconfigures realism changes and resets the worker when deactivated', () => {
    const { result, rerender } = renderHook(
      ({ active, receiverNoise, intravoxelDephasing }) =>
        useFidSimulation({
          ...BASE_OPTIONS,
          active,
          receiverNoise,
          intravoxelDephasing,
        }),
      {
        initialProps: {
          active: true,
          receiverNoise: false,
          intravoxelDephasing: false,
        },
      },
    )
    const worker = MockWorker.instances[0]
    worker.messages.length = 0

    rerender({
      active: true,
      receiverNoise: true,
      intravoxelDephasing: true,
    })
    expect(worker.messages[0]).toMatchObject({
      type: 'configure',
      receiverNoise: true,
    })
    if (worker.messages[0].type !== 'configure') {
      throw new Error('Expected configure message')
    }
    expect(worker.messages[0].ensembleStates[0].spinPackets).toHaveLength(9)

    worker.messages.length = 0
    rerender({
      active: false,
      receiverNoise: true,
      intravoxelDephasing: true,
    })
    expect(result.current.ensembleStates).toEqual([])
    expect(worker.messages).toContainEqual({ type: 'reset' })
  })
})
