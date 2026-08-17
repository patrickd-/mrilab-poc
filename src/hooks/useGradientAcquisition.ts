import { useEffect, useRef, useState } from 'react'
import {
  ADC_DWELL_TIME_MILLISECONDS,
  adcGateActiveAt,
  type GradientPulse,
  type GradientSignalPoint,
} from '../simulation/gradientEncoding'
import type { GradientPlaybackStatus } from './useGradientEncodingPlayback'

export { ADC_DWELL_TIME_MILLISECONDS } from '../simulation/gradientEncoding'

export interface GradientAcquisitionRun {
  id: number
  points: ReadonlyArray<GradientSignalPoint>
}

interface UseGradientAcquisitionOptions {
  active: boolean
  adcEnabled: boolean
  adcPulses: ReadonlyArray<GradientPulse>
  durationMilliseconds: number
  resetRevision: number
  sampleAt: (timeMilliseconds: number) => GradientSignalPoint
  status: GradientPlaybackStatus
  timeMilliseconds: number
}

export function useGradientAcquisition({
  active,
  adcEnabled,
  adcPulses,
  durationMilliseconds,
  resetRevision,
  sampleAt,
  status,
  timeMilliseconds,
}: UseGradientAcquisitionOptions) {
  const [currentSignalPoints, setCurrentSignalPoints] = useState<
    GradientSignalPoint[]
  >([])
  const [acquisitionRuns, setAcquisitionRuns] = useState<
    GradientAcquisitionRun[]
  >([])
  const nextSampleTimeRef = useRef(0)
  const previousTimeRef = useRef(0)
  const currentRunIdRef = useRef<number | null>(null)
  const nextRunIdRef = useRef(0)
  const resetRevisionRef = useRef(resetRevision)
  const sampleAtRef = useRef(sampleAt)
  sampleAtRef.current = sampleAt

  useEffect(() => {
    if (resetRevision !== resetRevisionRef.current) {
      resetRevisionRef.current = resetRevision
      nextSampleTimeRef.current = 0
      previousTimeRef.current = 0
      currentRunIdRef.current = null
      nextRunIdRef.current = 0
      setCurrentSignalPoints((currentPoints) =>
        currentPoints.length === 0 ? currentPoints : [],
      )
      setAcquisitionRuns((currentRuns) =>
        currentRuns.length === 0 ? currentRuns : [],
      )
      return
    }

    if (!active || status === 'idle') {
      nextSampleTimeRef.current = 0
      previousTimeRef.current = 0
      currentRunIdRef.current = null
      setCurrentSignalPoints((currentPoints) =>
        currentPoints.length === 0 ? currentPoints : [],
      )
      return
    }

    const boundedTimeMilliseconds = Math.min(
      durationMilliseconds,
      Math.max(0, timeMilliseconds),
    )
    if (boundedTimeMilliseconds < previousTimeRef.current) {
      nextSampleTimeRef.current = 0
      currentRunIdRef.current = null
      setCurrentSignalPoints([])
    }
    if (currentRunIdRef.current === null) {
      currentRunIdRef.current = nextRunIdRef.current
      nextRunIdRef.current += 1
    }
    previousTimeRef.current = boundedTimeMilliseconds

    const acquiredPoints: GradientSignalPoint[] = []
    let nextSampleTimeMilliseconds = nextSampleTimeRef.current
    while (
      nextSampleTimeMilliseconds <= boundedTimeMilliseconds + 1e-9 &&
      nextSampleTimeMilliseconds <= durationMilliseconds
    ) {
      if (
        adcEnabled &&
        adcGateActiveAt(
          adcPulses,
          nextSampleTimeMilliseconds,
          durationMilliseconds,
        )
      ) {
        acquiredPoints.push(sampleAtRef.current(nextSampleTimeMilliseconds))
      }
      nextSampleTimeMilliseconds += ADC_DWELL_TIME_MILLISECONDS
    }
    nextSampleTimeRef.current = nextSampleTimeMilliseconds

    if (acquiredPoints.length > 0) {
      const currentRunId = currentRunIdRef.current
      setCurrentSignalPoints((currentPoints) => [
        ...currentPoints,
        ...acquiredPoints,
      ])
      setAcquisitionRuns((currentRuns) => {
        const latestRun = currentRuns[currentRuns.length - 1]
        if (latestRun?.id === currentRunId) {
          return [
            ...currentRuns.slice(0, -1),
            {
              ...latestRun,
              points: [...latestRun.points, ...acquiredPoints],
            },
          ]
        }
        return [
          ...currentRuns,
          { id: currentRunId, points: acquiredPoints },
        ]
      })
    }
  }, [
    active,
    adcEnabled,
    adcPulses,
    durationMilliseconds,
    resetRevision,
    status,
    timeMilliseconds,
  ])

  return { acquisitionRuns, currentSignalPoints }
}
