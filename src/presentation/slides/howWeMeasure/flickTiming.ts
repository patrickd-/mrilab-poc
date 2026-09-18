// Original flick.html timeline: release at 0.98 s, full extension at 1.08 s,
// then follow-through and recharge. Play the complete cycle once at 2×.
export const FLICK_SOURCE_DURATION_SECONDS = 3.1
export const FLICK_PLAYBACK_RATE = 2
export const FLICK_DURATION_MS = (FLICK_SOURCE_DURATION_SECONDS * 1000) / FLICK_PLAYBACK_RATE
export const FLICK_CONTACT_MS = 1080 / FLICK_PLAYBACK_RATE
