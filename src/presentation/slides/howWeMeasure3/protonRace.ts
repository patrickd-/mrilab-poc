import { PROTON_GYROMAGNETIC_RATIO } from '../../../models/HydrogenEnsemble'
import type { FidEnsembleState } from '../../../simulation/fid'
import { createPresentationCsfState, presentationCarrierFrequencyHz, type ProtonExcitation } from '../howWeMeasure/protonExcitation'
import type { CsfEnsembleMotion } from '../howWeMeasure2/CsfEnsembleGraphic'
import { csfEchoPlayPlan, csfFrequencyOffsetHz } from '../howWeMeasure2/csfDephasing'

export const RACER_COUNT = 6

/** Six lanes sample the same smooth field profile along its horizontal midline. */
export function createRaceEnsembles(fieldStrengthTesla: number): FidEnsembleState[] {
  const base = createPresentationCsfState(fieldStrengthTesla)
  return Array.from({ length: RACER_COUNT }, (_, index) => {
    const omega = 2 * Math.PI * csfFrequencyOffsetHz(2 * index / (RACER_COUNT - 1) - 1, 0) / 1000
    const fieldVariationTesla = omega * 1000 / PROTON_GYROMAGNETIC_RATIO
    return { ...base, index, column: index, row: 0, gridSize: RACER_COUNT,
      angularFrequencyOffsetRadiansPerMillisecond: omega, fieldVariationTesla,
      fieldVariationPpm: fieldVariationTesla / fieldStrengthTesla * 1e6,
      spinPackets: [{ offsetXMillimeters: 0, offsetYMillimeters: 0,
        angularFrequencyOffsetRadiansPerMillisecond: omega, weight: 1 }],
    }
  })
}

export function raceFrequencyHz(state: FidEnsembleState, fieldStrengthTesla: number) {
  return presentationCarrierFrequencyHz(fieldStrengthTesla) +
    state.angularFrequencyOffsetRadiansPerMillisecond * 1000 / (2 * Math.PI)
}

/** Unwrapped race coordinate: v*t, then v*(2*tau-t). Do not clamp or wrap:
 * racers can leave the view and return after a late pulse. Reversing running
 * direction is a metaphor; the underlying Bloch frequencies are NOT reversed. */
export function raceDistanceTurns(state: FidEnsembleState, excitation: ProtonExcitation, now: number) {
  const firstPulse = excitation.pulseEvents[0]
  if (!firstPulse || excitation.fieldStrengthTesla <= 0 || now < firstPulse.timeMilliseconds) return 0
  const elapsed = now - firstPulse.timeMilliseconds
  const refocus = excitation.pulseEvents.find(pulse => pulse.kind === '180-x')
  const time = refocus && now >= refocus.timeMilliseconds
    ? 2 * (refocus.timeMilliseconds - firstPulse.timeMilliseconds) - elapsed : elapsed
  return raceFrequencyHz(state, excitation.fieldStrengthTesla) * time / 1000
}

/** Shared SVG/canvas geometry: keep the old 6x6 cell radius and spacing. */
export function raceTrackGeometry(width: number, height: number) {
  const size = Math.min(width, height)
  const laneWidth = size * 0.145
  return { laneWidth, left: (width - RACER_COUNT * laneWidth) / 2,
    right: (width + RACER_COUNT * laneWidth) / 2,
    startY: size * 0.22, radius: size * 0.064 }
}

export const RACE_MOTION: CsfEnsembleMotion = {
  label: 'Six proton racers, from weaker field on the left to stronger field on the right',
  poseAt(index, width, height) {
    const track = raceTrackGeometry(width, height)
    return { x: track.left + (index + 0.5) * track.laneWidth - width / 2,
      y: height / 2 - track.startY, radius: track.radius, shell: 0.5 }
  },
  offsetAt(state, excitation, now, width, height) {
    return { x: 0, y: -raceDistanceTurns(state, excitation, now) * Math.min(width, height) * 0.4 }
  },
}

export function racePlayPlan(refocusTime: number | null) {
  const plan = csfEchoPlayPlan(refocusTime)
  // Leave time for even the slowest returning racer to exit above the start.
  return { ...plan, durationMilliseconds: Math.max(plan.durationMilliseconds,
    refocusTime === null ? 0 : 2 * refocusTime + 4000) }
}
