import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type FieldUniformity,
  type HydrogenEnsemble,
  type SupportedFieldStrengthTesla,
} from '../models/HydrogenEnsemble'
import {
  createFidEnsembleStates,
  FID_GRAPH_INITIAL_RANGE_MILLISECONDS,
  FID_GRAPH_MAXIMUM_WINDOW_MILLISECONDS,
  type FidSignalPoint,
} from '../simulation/fid'
import type {
  FidSimulationStatus,
  FidWorkerRequest,
  FidWorkerSnapshot,
} from '../simulation/fidWorkerProtocol'

export type { FidSimulationStatus } from '../simulation/fidWorkerProtocol'

function retainSignalWindow(
  points: FidSignalPoint[],
  currentTimeMilliseconds: number,
) {
  const cutoffMilliseconds = Math.max(
    0,
    currentTimeMilliseconds - FID_GRAPH_MAXIMUM_WINDOW_MILLISECONDS,
  )
  const firstVisibleIndex = points.findIndex(
    (point) => point.timeMilliseconds >= cutoffMilliseconds,
  )

  if (firstVisibleIndex <= 0) return points
  return points.slice(firstVisibleIndex - 1)
}

interface FidSimulationState {
  status: FidSimulationStatus
  timeMilliseconds: number
  pulseTimesMilliseconds: number[]
  signalPoints: FidSignalPoint[]
}

interface UseFidSimulationOptions {
  active: boolean
  ensembles: ReadonlyArray<HydrogenEnsemble>
  ensembleRevision: number
  fieldStrengthTesla: SupportedFieldStrengthTesla
  fieldUniformity: FieldUniformity
  millisecondsPerTick: number
}

export function useFidSimulation({
  active,
  ensembles,
  ensembleRevision,
  fieldStrengthTesla,
  fieldUniformity,
  millisecondsPerTick,
}: UseFidSimulationOptions) {
  const ensembleStates = useMemo(
    () =>
      active
        ? createFidEnsembleStates(
            ensembles,
            fieldStrengthTesla,
            fieldUniformity,
          )
        : [],
    [
      active,
      ensembleRevision,
      ensembles,
      fieldStrengthTesla,
      fieldUniformity,
    ],
  )
  const workerRef = useRef<Worker | null>(null)
  const [simulation, setSimulation] = useState<FidSimulationState>({
    status: 'idle',
    timeMilliseconds: 0,
    pulseTimesMilliseconds: [],
    signalPoints: [],
  })

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/fidSimulation.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<FidWorkerSnapshot>) => {
      const snapshot = event.data
      if (snapshot.type !== 'snapshot') return

      setSimulation((currentSimulation) => ({
        status: snapshot.status,
        timeMilliseconds: snapshot.timeMilliseconds,
        pulseTimesMilliseconds: snapshot.pulseTimesMilliseconds,
        signalPoints: retainSignalWindow(
          snapshot.replaceSignalPoints
            ? snapshot.signalPoints
            : [...currentSimulation.signalPoints, ...snapshot.signalPoints],
          snapshot.timeMilliseconds,
        ),
      }))
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return

    const message: FidWorkerRequest = active
      ? {
          type: 'configure',
          ensembleStates: [...ensembleStates],
          millisecondsPerTick,
        }
      : { type: 'reset' }
    worker.postMessage(message)
  }, [active, ensembleStates])

  useEffect(() => {
    const message: FidWorkerRequest = {
      type: 'set-time-step',
      millisecondsPerTick,
    }
    workerRef.current?.postMessage(message)
  }, [millisecondsPerTick])

  const postToWorker = useCallback((message: FidWorkerRequest) => {
    workerRef.current?.postMessage(message)
  }, [])

  const reset = useCallback(() => {
    postToWorker({ type: 'reset' })
  }, [postToWorker])

  const start = useCallback(() => {
    if (!active) return
    postToWorker({ type: 'start' })
  }, [active, postToWorker])

  const applyFlip = useCallback(() => {
    postToWorker({ type: 'pulse' })
  }, [postToWorker])

  const pause = useCallback(() => {
    postToWorker({ type: 'pause' })
  }, [postToWorker])

  const graphWindowEndMilliseconds = Math.max(
    FID_GRAPH_INITIAL_RANGE_MILLISECONDS,
    simulation.timeMilliseconds,
  )
  const graphWindowStartMilliseconds = Math.max(
    0,
    graphWindowEndMilliseconds -
      FID_GRAPH_MAXIMUM_WINDOW_MILLISECONDS,
  )

  return {
    applyFlip,
    ensembleStates,
    pulseTimesMilliseconds: simulation.pulseTimesMilliseconds,
    graphWindowEndMilliseconds,
    graphWindowStartMilliseconds,
    reset,
    signalPoints: simulation.signalPoints,
    start,
    status: simulation.status,
    pause,
    timeMilliseconds: simulation.timeMilliseconds,
  }
}
