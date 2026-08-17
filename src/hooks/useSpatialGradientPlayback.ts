import { useCallback, useEffect, useRef, useState } from 'react'

export type SpatialGradientPlaybackSpeed = '5' | '10' | '25' | '50'
export type SpatialGradientPlaybackStatus = 'idle' | 'running' | 'paused'

interface UseSpatialGradientPlaybackOptions {
  active: boolean
}

export function useSpatialGradientPlayback({
  active,
}: UseSpatialGradientPlaybackOptions) {
  const [speed, setSpeed] =
    useState<SpatialGradientPlaybackSpeed>('10')
  const [status, setStatus] =
    useState<SpatialGradientPlaybackStatus>('idle')
  const [timeMilliseconds, setTimeMilliseconds] = useState(0)
  const statusRef = useRef(status)
  const timeRef = useRef(timeMilliseconds)

  const updateStatus = useCallback(
    (nextStatus: SpatialGradientPlaybackStatus) => {
      statusRef.current = nextStatus
      setStatus(nextStatus)
    },
    [],
  )

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
    updateStatus('running')
  }, [active, updateStatus])

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
    const simulatedMicrosecondsPerRealSecond = Number(speed)

    const advance = (frameTime: number) => {
      const elapsedRealMilliseconds = Math.min(
        100,
        Math.max(0, frameTime - previousFrameTime),
      )
      previousFrameTime = frameTime
      const simulatedElapsedMilliseconds =
        (elapsedRealMilliseconds * simulatedMicrosecondsPerRealSecond) /
        1_000_000
      updateTime(timeRef.current + simulatedElapsedMilliseconds)
      animationFrame = window.requestAnimationFrame(advance)
    }

    animationFrame = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [speed, status, updateTime])

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
