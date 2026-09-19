import { useEffect, useState } from 'react'
import { startPlayPlan, type PlanPlayback, type PlayPlan } from './playPlan'

export function usePlayPlan(plan: PlayPlan, enabled: boolean, resetKey = 0) {
  const [playback, setPlayback] = useState<PlanPlayback | null>(null)
  useEffect(() => {
    // Publish the future t=0 now, so the renderer can record the waiting period.
    // The physics model applies scheduled pulses only once their time arrives.
    setPlayback(enabled ? startPlayPlan(plan, performance.now() +
      plan.layoutDurationMilliseconds + plan.settleDelayMilliseconds) : null)
  }, [plan, enabled, resetKey])
  return playback
}
