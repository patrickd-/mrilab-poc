import { SAMPLE_PRESETS, type SamplePresetId } from '../../../models/HydrogenEnsemble'
import { SAMPLE_COLORS } from '../../../models/sampleColors'
import type { RfPulseEvent } from '../../../simulation/fid'
import { FID_PLAY_PLAN } from '../../playback/playPlan'
import { createPresentationTissueState, presentationMagnetizationAt, type ProtonExcitation } from '../howWeMeasure/protonExcitation'

export const TISSUE_COMPARISON_PLAN = {
  ...FID_PLAY_PLAN,
  layoutDurationMilliseconds: 2200,
  durationMilliseconds: 12000,
}

export const PRE_RF_SAMPLE_TIME_MS = -0.000001

export function zoomComparisonWindow(current: number, wheelDeltaPixels: number) {
  return Math.max(1, Math.min(TISSUE_COMPARISON_PLAN.durationMilliseconds,
    current * Math.exp(Math.max(-300, Math.min(300, wheelDeltaPixels)) * 0.004)))
}

export const COMPARISON_TISSUE_IDS = [
  'cerebrospinal-fluid', 'cortical-bone', 'white-matter', 'gray-matter',
] as const satisfies readonly SamplePresetId[]

export interface ComparisonTissue {
  id: SamplePresetId
  label: string
  color: string
  state: ReturnType<typeof createPresentationTissueState>
  excitation: ProtonExcitation
}

export function createComparisonTissues(fieldStrengthTesla: number, pulseEvents: readonly RfPulseEvent[] = []): ComparisonTissue[] {
  const reference = createPresentationTissueState(fieldStrengthTesla).equilibriumMagnetization
  return COMPARISON_TISSUE_IDS.map(id => {
    const state = createPresentationTissueState(fieldStrengthTesla, id)
    return {
      id,
      label: id === 'cerebrospinal-fluid' ? 'CSF' : SAMPLE_PRESETS.find(preset => preset.id === id)!.label,
      color: SAMPLE_COLORS[id],
      state,
      excitation: { fieldStrengthTesla, samplePreset: id, pulseEvents,
        equilibriumScale: reference > 0 ? state.equilibriumMagnetization / reference : 0 },
    }
  })
}

/** Both plots and the 3D magnets share the lab's Bloch state, with one common
 * CSF M0 reference. Equal-volume density differences are not normalized away. */
export function tissueRelaxationAt(tissue: ComparisonTissue, timeMilliseconds: number) {
  const m = presentationMagnetizationAt(tissue.state, tissue.excitation, timeMilliseconds)
  const scale = tissue.excitation.equilibriumScale ?? 1
  return { signal: Math.hypot(m.x, m.y) * scale, longitudinal: m.z * scale }
}

export function comparisonSampleTimes(tissues: readonly ComparisonTissue[]) {
  const plan = TISSUE_COMPARISON_PLAN
  const leadIn = plan.layoutDurationMilliseconds + plan.settleDelayMilliseconds
  // Capture both sides of the instantaneous pulse, avoiding a false ramp
  // during the last regular sampling interval before RF when zoomed in.
  const times = new Set<number>([PRE_RF_SAMPLE_TIME_MS, 0, plan.durationMilliseconds])
  for (let time = -leadIn; time <= plan.durationMilliseconds; time += plan.sampleIntervalMilliseconds) times.add(time)
  // Resolve bone's 0.4 ms decay, even when a display frame arrives much later.
  // These samples preserve its fast kinetics rather than changing the time scale.
  for (const tissue of tissues) {
    const t2 = tissue.state.transverseRelaxationTimeMilliseconds
    for (let index = 1; index <= 100; index++) {
      const time = Number((index * t2 / 10).toFixed(6))
      if (time <= plan.durationMilliseconds) times.add(time)
    }
  }
  return [...times].sort((a, b) => a - b)
}
