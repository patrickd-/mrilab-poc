/// <reference lib="webworker" />

import { fidSignalPointAt, type FidEnsembleState, type FidSignalPoint } from '../simulation/fid'
import type {
  FidSimulationStatus,
  FidWorkerRequest,
  FidWorkerSnapshot,
} from '../simulation/fidWorkerProtocol'

const WORK_BUDGET_MILLISECONDS = 7
const SNAPSHOT_INTERVAL_MILLISECONDS = 1000 / 60

let ensembleStates: FidEnsembleState[] = []
let millisecondsPerTick = 2
let status: FidSimulationStatus = 'idle'
let timeMilliseconds = 0
let pulseTimesMilliseconds: number[] = []
let pendingSignalPoints: FidSignalPoint[] = []
let loopTimer: ReturnType<typeof setTimeout> | null = null
let lastSnapshotAt = performance.now()

function signalPointAt(sampleTimeMilliseconds: number) {
  return fidSignalPointAt(
    ensembleStates,
    sampleTimeMilliseconds,
    pulseTimesMilliseconds,
  )
}

function publishSnapshot(replaceSignalPoints = false) {
  const snapshot: FidWorkerSnapshot = {
    type: 'snapshot',
    status,
    timeMilliseconds,
    pulseTimesMilliseconds: [...pulseTimesMilliseconds],
    signalPoints: pendingSignalPoints,
    replaceSignalPoints,
  }

  pendingSignalPoints = []
  lastSnapshotAt = performance.now()
  self.postMessage(snapshot)
}

function cancelLoop() {
  if (loopTimer !== null) clearTimeout(loopTimer)
  loopTimer = null
}

function scheduleLoop() {
  if (loopTimer !== null || status !== 'running') return
  loopTimer = setTimeout(runSimulationBatch, 0)
}

function runSimulationBatch() {
  loopTimer = null
  if (status !== 'running') return

  const batchStartedAt = performance.now()
  do {
    timeMilliseconds += millisecondsPerTick
    pendingSignalPoints.push(signalPointAt(timeMilliseconds))
  } while (
    status === 'running' &&
    performance.now() - batchStartedAt < WORK_BUDGET_MILLISECONDS
  )

  if (
    performance.now() - lastSnapshotAt >=
    SNAPSHOT_INTERVAL_MILLISECONDS
  ) {
    publishSnapshot()
  }
  scheduleLoop()
}

function resetSimulation() {
  cancelLoop()
  status = 'idle'
  timeMilliseconds = 0
  pulseTimesMilliseconds = []
  pendingSignalPoints = []
  publishSnapshot(true)
}

self.onmessage = (event: MessageEvent<FidWorkerRequest>) => {
  const message = event.data

  switch (message.type) {
    case 'configure':
      ensembleStates = message.ensembleStates
      millisecondsPerTick = message.millisecondsPerTick
      resetSimulation()
      break
    case 'set-time-step':
      millisecondsPerTick = message.millisecondsPerTick
      break
    case 'start':
      if (status === 'idle') {
        timeMilliseconds = 0
        pulseTimesMilliseconds = []
        pendingSignalPoints = [signalPointAt(0)]
      }
      status = 'running'
      publishSnapshot()
      scheduleLoop()
      break
    case 'pause':
      if (status !== 'running') break
      status = 'paused'
      cancelLoop()
      publishSnapshot()
      break
    case 'pulse':
      if (status !== 'running' || ensembleStates.length === 0) break
      pulseTimesMilliseconds = [
        ...pulseTimesMilliseconds,
        timeMilliseconds,
      ]
      pendingSignalPoints.push(signalPointAt(timeMilliseconds))
      publishSnapshot()
      break
    case 'reset':
      resetSimulation()
      break
  }
}
