import type { SamplePresetId } from './HydrogenEnsemble'

/** Shared by the simulator and presentation. */
export const SAMPLE_COLORS: Readonly<Record<SamplePresetId, string>> = Object.freeze({
  air: '#526c78',
  'cortical-bone': '#d6a15f',
  'cerebrospinal-fluid': '#55c4e8',
  'gray-matter': '#b28da9',
  'white-matter': '#e7dfba',
})
