import { useCallback, useMemo, useRef, useState } from 'react'
import { MagneticFieldBackdrop } from '../components/MagneticFieldBackdrop'
import { startPlayPlan, type PlanPlayback } from '../playback/playPlan'
import { realTimeClock } from '../playback/simulationClock'
import { CsfEnsembleGraphic } from './howWeMeasure2/CsfEnsembleGraphic'
import { TissueRelaxationPlots } from './howWeMeasure2/TissueRelaxationPlots'
import { createComparisonTissues } from './howWeMeasure2/tissueComparison'
import { RaceTrack } from './howWeMeasure3/RaceTrack'
import { createRaceEnsembles, RACE_MOTION, racePlayPlan } from './howWeMeasure3/protonRace'
import type { PresentationSlideModule, SlideStateProps } from './types'
import './howWeMeasure/how-we-measure.css'
import './howWeMeasure2/tissue-comparison.css'
import './howWeMeasure3/proton-race.css'

function HowWeMeasure3Slide({ fieldStrengthTesla, direction, simulationClock }: SlideStateProps) {
  const clock = simulationClock ?? realTimeClock
  const [refocusTime, setRefocusTime] = useState<number | null>(null)
  const [playback, setPlayback] = useState<PlanPlayback | null>(null)
  const settled = useRef(false)
  const plan = useMemo(() => racePlayPlan(refocusTime), [refocusTime])
  const racers = useMemo(() => createRaceEnsembles(fieldStrengthTesla), [fieldStrengthTesla])
  const tissues = useMemo(() => createComparisonTissues(fieldStrengthTesla, playback?.pulseEvents), [fieldStrengthTesla, playback])
  const onSettled = useCallback(() => {
    if (settled.current) return
    settled.current = true
    setPlayback(startPlayPlan(plan, clock.now() + plan.settleDelayMilliseconds))
  }, [plan, clock])
  const placePulse = (time: number) => {
    if (!settled.current) return
    setRefocusTime(time)
    const updated = racePlayPlan(time)
    setPlayback(startPlayPlan(updated, clock.now() + updated.settleDelayMilliseconds))
  }

  return <div className="tissue-comparison proton-race" data-csf-step="race" data-transition-started="true" data-transition-complete="true">
    <MagneticFieldBackdrop className="tissue-comparison__field" fieldStrengthTesla={fieldStrengthTesla} nonUniform />
    <RaceTrack />
    <CsfEnsembleGraphic step={7} states={racers} excitation={tissues[0].excitation} motion={RACE_MOTION}
      immediate={direction === 'backward'} clock={clock} onSettled={onSettled}
      endsAt={playback ? playback.startedAt + plan.durationMilliseconds : undefined} />
    <TissueRelaxationPlots tissues={tissues} startedAt={playback?.startedAt ?? null} highlighted={null}
      entering={false} csfOnly ensembleStates={racers} showIntrinsicReference clock={clock}
      refocusTime={refocusTime} onPlaceRefocusingPulse={playback ? placePulse : undefined}
      durationMilliseconds={plan.durationMilliseconds} />
  </div>
}

export const howWeMeasure3SlideModule: PresentationSlideModule = {
  id: 'how-we-measure-3', heading: 'How are we measuring?', stateCount: 1,
  pauseFromState: 0, Component: HowWeMeasure3Slide,
}
