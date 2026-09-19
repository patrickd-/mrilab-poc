import { createPresentationCsfState, presentationMagnetizationAt, type ProtonExcitation } from './protonExcitation'

/** Own one cancellable render loop per excitation/session. */
export function animateProtonMagnet(
  excitation: ProtonExcitation,
  apply: (magnetization: ReturnType<typeof presentationMagnetizationAt>) => void,
) {
  const state = createPresentationCsfState(excitation.fieldStrengthTesla)
  let frame = 0
  const animate = () => {
    // RAF's timestamp is the start of its frame; it can precede a pulse created
    // in that same frame. Read the same monotonic clock used to stamp the pulses.
    const now = performance.now()
    const m = presentationMagnetizationAt(state, excitation, now)
    apply(m)
    const pendingPulse = excitation.fieldStrengthTesla > 0 &&
      excitation.pulseEvents.some(pulse => pulse.timeMilliseconds > now)
    if (pendingPulse || Math.hypot(m.x, m.y) > 1e-4 || Math.abs(1 - m.z) > 1e-4) {
      frame = requestAnimationFrame(animate)
    }
  }
  animate()
  return () => cancelAnimationFrame(frame)
}
