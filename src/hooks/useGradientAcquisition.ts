import { useEffect, useRef, useState } from 'react'
import {
  adcGateActiveAt,
  type GradientPulse,
  type GradientSignalPoint,
} from '../simulation/gradientEncoding'
import type { GradientPlaybackStatus } from './useGradientEncodingPlayback'

export const ADC_DWELL_TIME_MILLISECONDS = 0.02

interface UseGradientAcquisitionOptions {
  active: boolean
  adcEnabled: boolean
  adcPulses: ReadonlyArray<GradientPulse>
  durationMilliseconds: number
  sampleAt: (timeMilliseconds: number) => GradientSignalPoint
  status: GradientPlaybackStatus
  timeMilliseconds: number
}

export function useGradientAcquisition({
  active,
  adcEnabled,
  adcPulses,
  durationMilliseconds,
  sampleAt,
  status,
  timeMilliseconds,
}: UseGradientAcquisitionOptions) {
  const [signalPoints, setSignalPoints] = useState<GradientSignalPoint[]>([])
  const nextSampleTimeRef = useRef(0)
  const previousTimeRef = useRef(0)
  const sampleAtRef = useRef(sampleAt)
  sampleAtRef.current = sampleAt

  useEffect(() => {
    if (!active || status === 'idle') {
      nextSampleTimeRef.current = 0
      previousTimeRef.current = 0
      setSignalPoints((currentPoints) =>
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
      setSignalPoints([])
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
      setSignalPoints((currentPoints) => [
        ...currentPoints,
        ...acquiredPoints,
      ])
    }
  }, [
    active,
    adcEnabled,
    adcPulses,
    durationMilliseconds,
    status,
    timeMilliseconds,
  ])

  return signalPoints
}
