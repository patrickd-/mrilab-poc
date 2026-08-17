import { useCallback, useEffect, useState } from 'react'
import type { GradientAcquisitionRun } from './useGradientAcquisition'
import type {
  GradientPlaybackSpeed,
  GradientPlaybackStatus,
} from './useGradientEncodingPlayback'
import {
  createKSpaceAutoFillPlan,
  type KSpaceAutoFillPlan,
} from '../simulation/kSpaceCoverage'
import type {
  GradientChannelId,
  GradientPulse,
} from '../simulation/gradientEncoding'

interface AutoFillState {
  currentAcquisitionIndex: number
  expectedRunCount: number
  originalSpeed: GradientPlaybackSpeed
  plan: KSpaceAutoFillPlan
  stage: 'configuring' | 'acquiring'
}

interface UseKSpaceAutoFillOptions {
  acquisitionRuns: ReadonlyArray<GradientAcquisitionRun>
  adcPulses: ReadonlyArray<GradientPulse>
  coveragePercentage: number
  enabledChannels: Readonly<Record<GradientChannelId, boolean>>
  encodingStartTimeMilliseconds: number
  gradientImperfections: boolean
  gridSize: number
  onAdcPulsesChange: (pulses: GradientPulse[]) => void
  onChannelEnabledChange: (
    channel: GradientChannelId,
    enabled: boolean,
  ) => void
  onPause: () => void
  onPhaseEncodingPulsesChange: (pulses: GradientPulse[]) => void
  onReadoutPulsesChange: (pulses: GradientPulse[]) => void
  onSpeedChange: (speed: GradientPlaybackSpeed) => void
  onStart: () => void
  phaseEncodingPulses: ReadonlyArray<GradientPulse>
  readoutPulses: ReadonlyArray<GradientPulse>
  speed: GradientPlaybackSpeed
  status: GradientPlaybackStatus
  voxelSizeMillimeters: number
}

const AUTO_FILL_SPEED: GradientPlaybackSpeed = '4'
const PULSE_TOLERANCE = 1e-10

function pulsesEqual(
  first: ReadonlyArray<GradientPulse>,
  second: ReadonlyArray<GradientPulse>,
) {
  return (
    first.length === second.length &&
    first.every(
      (pulse, index) =>
        Math.abs(pulse.start - second[index].start) < PULSE_TOLERANCE &&
        Math.abs(pulse.end - second[index].end) < PULSE_TOLERANCE &&
        Math.abs(pulse.amplitude - second[index].amplitude) <
          PULSE_TOLERANCE,
    )
  )
}

function phasePulsesForAcquisition(
  plan: KSpaceAutoFillPlan,
  acquisitionIndex: number,
) {
  const amplitude = plan.phaseEncodingAmplitudes[acquisitionIndex]
  return plan.phaseEncodingPulseTemplate.map((pulse) => ({
    ...pulse,
    amplitude,
  }))
}

export function useKSpaceAutoFill({
  acquisitionRuns,
  adcPulses,
  coveragePercentage,
  enabledChannels,
  encodingStartTimeMilliseconds,
  gradientImperfections,
  gridSize,
  onAdcPulsesChange,
  onChannelEnabledChange,
  onPause,
  onPhaseEncodingPulsesChange,
  onReadoutPulsesChange,
  onSpeedChange,
  onStart,
  phaseEncodingPulses,
  readoutPulses,
  speed,
  status,
  voxelSizeMillimeters,
}: UseKSpaceAutoFillOptions) {
  const [state, setState] = useState<AutoFillState | null>(null)

  const restoreSpeed = useCallback(
    (activeState: AutoFillState) => {
      if (activeState.originalSpeed !== AUTO_FILL_SPEED) {
        onSpeedChange(activeState.originalSpeed)
      }
    },
    [onSpeedChange],
  )

  const cancel = useCallback(() => {
    if (state) restoreSpeed(state)
    setState(null)
  }, [restoreSpeed, state])

  const stop = useCallback(() => {
    if (status === 'running') onPause()
    cancel()
  }, [cancel, onPause, status])

  const start = useCallback(() => {
    if (state || coveragePercentage >= 100) return
    const plan = createKSpaceAutoFillPlan(
      acquisitionRuns,
      gridSize,
      voxelSizeMillimeters,
      gradientImperfections,
      encodingStartTimeMilliseconds,
    )
    if (plan.phaseEncodingAmplitudes.length === 0) return

    const requiredChannels: GradientChannelId[] = [
      'adc',
      'rf',
      'phase-encoding',
      'readout',
    ]
    requiredChannels.forEach((channel) => {
      if (!enabledChannels[channel]) onChannelEnabledChange(channel, true)
    })
    onAdcPulsesChange(plan.adcPulses.map((pulse) => ({ ...pulse })))
    onReadoutPulsesChange(
      plan.readoutPulses.map((pulse) => ({ ...pulse })),
    )
    onPhaseEncodingPulsesChange(phasePulsesForAcquisition(plan, 0))
    if (speed !== AUTO_FILL_SPEED) onSpeedChange(AUTO_FILL_SPEED)
    setState({
      currentAcquisitionIndex: 0,
      expectedRunCount: acquisitionRuns.length + 1,
      originalSpeed: speed,
      plan,
      stage: 'configuring',
    })
  }, [
    acquisitionRuns,
    coveragePercentage,
    enabledChannels,
    encodingStartTimeMilliseconds,
    gradientImperfections,
    gridSize,
    onAdcPulsesChange,
    onChannelEnabledChange,
    onPhaseEncodingPulsesChange,
    onReadoutPulsesChange,
    onSpeedChange,
    speed,
    state,
    voxelSizeMillimeters,
  ])

  useEffect(() => {
    if (!state) return

    if (coveragePercentage >= 100) {
      restoreSpeed(state)
      setState(null)
      return
    }

    if (state.stage === 'configuring') {
      const expectedPhasePulses = phasePulsesForAcquisition(
        state.plan,
        state.currentAcquisitionIndex,
      )
      const waveformsReady =
        pulsesEqual(adcPulses, state.plan.adcPulses) &&
        pulsesEqual(readoutPulses, state.plan.readoutPulses) &&
        pulsesEqual(phaseEncodingPulses, expectedPhasePulses)
      const channelsReady =
        enabledChannels.adc &&
        enabledChannels.rf &&
        enabledChannels['phase-encoding'] &&
        enabledChannels.readout
      if (!waveformsReady || !channelsReady) return

      onStart()
      setState((currentState) =>
        currentState === state
          ? { ...currentState, stage: 'acquiring' }
          : currentState,
      )
      return
    }

    if (
      state.stage !== 'acquiring' ||
      status !== 'complete' ||
      acquisitionRuns.length < state.expectedRunCount
    ) {
      return
    }

    const nextAcquisitionIndex = state.currentAcquisitionIndex + 1
    if (nextAcquisitionIndex >= state.plan.phaseEncodingAmplitudes.length) {
      restoreSpeed(state)
      setState(null)
      return
    }

    onPhaseEncodingPulsesChange(
      phasePulsesForAcquisition(state.plan, nextAcquisitionIndex),
    )
    setState({
      ...state,
      currentAcquisitionIndex: nextAcquisitionIndex,
      expectedRunCount: acquisitionRuns.length + 1,
      stage: 'configuring',
    })
  }, [
    acquisitionRuns.length,
    adcPulses,
    coveragePercentage,
    enabledChannels,
    onPhaseEncodingPulsesChange,
    onStart,
    phaseEncodingPulses,
    readoutPulses,
    restoreSpeed,
    state,
    status,
  ])

  return {
    active: state !== null,
    cancel,
    completedAcquisitionCount: state?.currentAcquisitionIndex ?? 0,
    plannedAcquisitionCount: state?.plan.phaseEncodingAmplitudes.length ?? 0,
    start,
    stop,
  }
}
