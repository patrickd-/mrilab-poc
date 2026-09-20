export interface PlaybackClock {
  now(): number
  readonly paused: boolean
}

export const realTimeClock: PlaybackClock = { now: () => performance.now(), paused: false }

/** A common timebase for RF events, Bloch evolution and graph sampling.
 * Paused wall time is excluded, so resuming never catches up or jumps ahead. */
export class SimulationClock implements PlaybackClock {
  private pausedAt: number | null = null
  private pausedDuration = 0

  constructor(private readonly wallNow: () => number = () => performance.now()) {}

  get paused() { return this.pausedAt !== null }

  now() { return (this.pausedAt ?? this.wallNow()) - this.pausedDuration }

  setPaused(paused: boolean) {
    if (paused === this.paused) return
    const now = this.wallNow()
    if (paused) this.pausedAt = now
    else {
      this.pausedDuration += now - this.pausedAt!
      this.pausedAt = null
    }
  }
}
