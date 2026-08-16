import { useCallback, useEffect, useRef, useState } from 'react'

export type GradientPlaybackSpeed = '0.25' | '0.5' | '1' | '2' | '4'
export type GradientPlaybackStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'complete'

const BASE_PLAYBACK_DURATION_MILLISECONDS = 4000

interface UseGradientEncodingPlaybackOptions {
  active: boolean
  durationMilliseconds: number
}

export function useGradientEncodingPlayback({
  active,
  durationMilliseconds,
}: UseGradientEncodingPlaybackOptions) {
  const [speed, setSpeed] = useState<GradientPlaybackSpeed>('1')
  const [status, setStatus] = useState<GradientPlaybackStatus>('idle')
  const [timeMilliseconds, setTimeMilliseconds] = useState(0)
  const statusRef = useRef(status)
  const timeRef = useRef(timeMilliseconds)

  const updateStatus = useCallback((nextStatus: GradientPlaybackStatus) => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const updateTime = useCallback((nextTimeMilliseconds: number) => {
    timeRef.current = nextTimeMilliseconds
    setTimeMilliseconds(nextTimeMilliseconds)
  }, [])

  const reset = useCallback(() => {
    updateStatus('idle')
    updateTime(0)
  }, [updateStatus, updateTime])

  const start = useCallback(() => {
    if (!active) return
    if (statusRef.current === 'idle' || statusRef.current === 'complete') {
      updateTime(0)
    }
    updateStatus('running')
  }, [active, updateStatus, updateTime])

  const pause = useCallback(() => {
    if (statusRef.current === 'running') updateStatus('paused')
  }, [updateStatus])

  useEffect(() => {
    if (!active) reset()
  }, [active, reset])

  useEffect(() => {
    if (status !== 'running') return

    let animationFrame = 0
    let previousFrameTime = performance.now()
    const playbackSpeed = Number(speed)

    const advance = (frameTime: number) => {
      const elapsedRealMilliseconds = Math.min(
        100,
        Math.max(0, frameTime - previousFrameTime),
      )
      previousFrameTime = frameTime
      const simulatedElapsedMilliseconds =
        elapsedRealMilliseconds *
        (durationMilliseconds / BASE_PLAYBACK_DURATION_MILLISECONDS) *
        playbackSpeed
      const nextTimeMilliseconds = Math.min(
        durationMilliseconds,
        timeRef.current + simulatedElapsedMilliseconds,
      )
      updateTime(nextTimeMilliseconds)

      if (nextTimeMilliseconds >= durationMilliseconds) {
        updateStatus('complete')
        return
      }
      animationFrame = window.requestAnimationFrame(advance)
    }

    animationFrame = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [durationMilliseconds, speed, status, updateStatus, updateTime])

  return {
    pause,
    reset,
    setSpeed,
    speed,
    start,
    status,
    timeMilliseconds,
  }
}
