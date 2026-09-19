import type { RfPulseEvent } from '../../simulation/fid'

export interface PlayPlan {
  layoutDurationMilliseconds: number
  settleDelayMilliseconds: number
  durationMilliseconds: number
  sampleIntervalMilliseconds: number
  /** Event times are relative to acquisition t=0, not the page's clock. */
  events: readonly (RfPulseEvent & { type: 'rf-pulse'; label: string })[]
}

/** Single source for playback timing, simulated RF pulses and graph markers.
 * Add e.g. { type: 'rf-pulse', timeMilliseconds: 2000, kind: '180-x', label: '180°' }
 * to schedule and annotate a later refocusing pulse without changing the player.
 */
export const FID_PLAY_PLAN: PlayPlan = {
  layoutDurationMilliseconds: 1100,
  settleDelayMilliseconds: 200,
  durationMilliseconds: 12000,
  sampleIntervalMilliseconds: 20,
  events: [{ type: 'rf-pulse', timeMilliseconds: 0, kind: '90-y', label: '90°' }],
}

export interface PlanPlayback {
  startedAt: number
  pulseEvents: readonly RfPulseEvent[]
}

export function startPlayPlan(plan: PlayPlan, startedAt: number): PlanPlayback {
  if (plan.durationMilliseconds <= 0 || plan.sampleIntervalMilliseconds <= 0 ||
    plan.layoutDurationMilliseconds < 0 || plan.settleDelayMilliseconds < 0 ||
    plan.events.some(event => event.timeMilliseconds < 0 || event.timeMilliseconds > plan.durationMilliseconds)) {
    throw new Error('Invalid presentation play-plan timing')
  }
  return {
    startedAt,
    pulseEvents: [...plan.events]
      .sort((a, b) => a.timeMilliseconds - b.timeMilliseconds)
      .map(({ type: _type, label: _label, ...event }) => ({
        ...event, timeMilliseconds: startedAt + event.timeMilliseconds,
      })),
  }
}
