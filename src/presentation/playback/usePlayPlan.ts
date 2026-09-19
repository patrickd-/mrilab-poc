import { useEffect, useState } from 'react'
import { startPlayPlan, type PlanPlayback, type PlayPlan } from './playPlan'

export function usePlayPlan(plan: PlayPlan, enabled: boolean, resetKey = 0) {
  const [playback, setPlayback] = useState<PlanPlayback | null>(null)
  useEffect(() => {
    setPlayback(null)
    if (!enabled) return
    const timer = window.setTimeout(() => {
      setPlayback(startPlayPlan(plan, performance.now()))
    }, plan.layoutDurationMilliseconds + plan.settleDelayMilliseconds)
    return () => window.clearTimeout(timer)
  }, [plan, enabled, resetKey])
  return playback
}
