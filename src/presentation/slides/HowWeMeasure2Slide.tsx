import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { SamplePresetId } from '../../models/HydrogenEnsemble'
import { MagneticFieldBackdrop } from '../components/MagneticFieldBackdrop'
import { ProtonSphere } from '../components/ProtonSphere'
import { usePlayPlan } from '../playback/usePlayPlan'
import { startPlayPlan, type PlanPlayback } from '../playback/playPlan'
import { ReceiveCoil } from './howWeMeasure/ReceiveCoil'
import { TissueRelaxationPlots } from './howWeMeasure2/TissueRelaxationPlots'
import { createComparisonTissues, TISSUE_COMPARISON_PLAN } from './howWeMeasure2/tissueComparison'
import { CsfEnsembleGraphic } from './howWeMeasure2/CsfEnsembleGraphic'
import { createCsfGrid, csfEchoPlayPlan } from './howWeMeasure2/csfDephasing'
import { realTimeClock } from '../playback/simulationClock'
import type { PresentationSlideModule, SlideStateProps } from './types'
import './howWeMeasure/how-we-measure.css'
import './howWeMeasure2/tissue-comparison.css'

// The layout has its own completion event; schedule RF only after it finishes.
const POST_LAYOUT_PLAY_PLAN = { ...TISSUE_COMPARISON_PLAN, layoutDurationMilliseconds: 0 }

function HowWeMeasure2Slide({ fieldStrengthTesla, stateIndex, direction, simulationClock }: SlideStateProps) {
  const clock = stateIndex > 0 ? simulationClock ?? realTimeClock : realTimeClock
  const [transitionStarted, setTransitionStarted] = useState(false)
  const [entering, setEntering] = useState(true)
  const firstSpecimen = useRef<HTMLElement>(null)
  const initialPlayback = usePlayPlan(POST_LAYOUT_PLAY_PLAN, stateIndex === 0 && !entering, `${fieldStrengthTesla}:${stateIndex}`)
  const [csfPlayback, setCsfPlayback] = useState<PlanPlayback | null>(null)
  const [refocusTime, setRefocusTime] = useState<number | null>(null)
  const csfPlan = useMemo(() => csfEchoPlayPlan(stateIndex >= 5 ? refocusTime : null), [stateIndex >= 5, refocusTime])
  const [showComparisonSpheres, setShowComparisonSpheres] = useState(stateIndex === 0)
  const startedStep = useRef(-1)
  const playback = stateIndex === 0 ? initialPlayback : csfPlayback
  const [highlighted, setHighlighted] = useState<SamplePresetId | null>(null)
  const tissues = useMemo(() => createComparisonTissues(fieldStrengthTesla, playback?.pulseEvents), [fieldStrengthTesla, playback])
  const quietReceiver = useMemo(() => ({ fieldStrengthTesla, pulseEvents: [] }), [fieldStrengthTesla])
  const grid = useMemo(() => createCsfGrid(fieldStrengthTesla, stateIndex >= 5), [fieldStrengthTesla, stateIndex >= 5])
  const onCsfSettled = useCallback(() => {
    if (startedStep.current === stateIndex) return
    startedStep.current = stateIndex
    if ([1, 2, 5, 6].includes(stateIndex)) {
      setCsfPlayback(startPlayPlan(csfPlan, clock.now() + csfPlan.settleDelayMilliseconds))
    }
  }, [stateIndex, clock, csfPlan])

  const placeRefocusingPulse = (timeMilliseconds: number) => {
    if (stateIndex < 5 || csfPlayback === null) return
    setRefocusTime(timeMilliseconds)
    const plan = csfEchoPlayPlan(timeMilliseconds)
    setCsfPlayback(startPlayPlan(plan, clock.now() + plan.settleDelayMilliseconds))
  }

  useEffect(() => {
    startedStep.current = -1
    if (stateIndex < 5) setRefocusTime(null)
    if ([1, 2, 5, 6].includes(stateIndex)) setCsfPlayback(null)
    if (stateIndex === 0) {
      setShowComparisonSpheres(true)
      return
    }
    const timer = window.setTimeout(() => setShowComparisonSpheres(false), 750)
    return () => window.clearTimeout(timer)
  }, [stateIndex, fieldStrengthTesla])

  useEffect(() => {
    const specimen = firstSpecimen.current
    const finishEntrance = (event: AnimationEvent) => {
      if (event.target === specimen) setEntering(false)
    }
    specimen?.addEventListener('animationend', finishEntrance)
    return () => specimen?.removeEventListener('animationend', finishEntrance)
  }, [showComparisonSpheres])

  useEffect(() => {
    if (stateIndex > 0) { setTransitionStarted(true); setEntering(false); return }
    // Four WebGL scenes need to finish mounting before the CSS clock starts.
    // Keep the original layout painted for one frame before releasing motion.
    setTransitionStarted(false)
    setEntering(true)
    setHighlighted(null)
    // The presentation intentionally disables CSS motion on back navigation.
    if (direction === 'backward') {
      setTransitionStarted(true)
      setEntering(false)
      return
    }
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setTransitionStarted(true))
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [fieldStrengthTesla, stateIndex, direction])

  // Match the prior slide's displayed diameter without animating canvas width.
  const previousSphereWidth = Math.max(118, Math.min(178, window.innerWidth * 0.12))
  const sphereWidth = Math.max(100, Math.min(145, window.innerWidth * 0.09))
  return <div className="tissue-comparison" data-csf-step={stateIndex} data-transition-started={stateIndex > 0 || transitionStarted} data-transition-complete={!entering} style={{
    '--comparison-layout-duration': `${TISSUE_COMPARISON_PLAN.layoutDurationMilliseconds}ms`,
    '--comparison-csf-start-scale': 1.35 * previousSphereWidth / sphereWidth,
  } as CSSProperties}>
    <MagneticFieldBackdrop className="tissue-comparison__field" fieldStrengthTesla={fieldStrengthTesla} nonUniform={stateIndex >= 4} />
    {entering && stateIndex === 0 ? <div className="tissue-comparison__outgoing-receiver" aria-hidden="true"><ReceiveCoil excitation={quietReceiver} /></div> : null}
    {showComparisonSpheres && tissues.map((tissue, index) => <figure key={tissue.id}
      ref={index === 0 ? firstSpecimen : undefined}
      className={`tissue-specimen tissue-specimen--${index}`} tabIndex={stateIndex === 0 ? 0 : -1} aria-hidden={stateIndex > 0}
      aria-label={`${tissue.label} proton ensemble`} data-testid={`specimen-${tissue.id}`}
      style={{ '--tissue-color': tissue.color } as CSSProperties}
      onMouseEnter={() => setHighlighted(tissue.id)} onMouseLeave={() => setHighlighted(null)}
      onFocus={() => setHighlighted(tissue.id)} onBlur={() => setHighlighted(null)}>
      <ProtonSphere orientation="up" showCone={false} showNetMagnet={fieldStrengthTesla > 0}
        color={tissue.color} excitation={tissue.excitation} ariaLabel={`${tissue.label} magnetization`} />
      <figcaption>{tissue.label}</figcaption>
    </figure>)}
    {stateIndex > 0 ? <CsfEnsembleGraphic step={stateIndex} states={grid} excitation={tissues[0].excitation}
      immediate={direction === 'backward'} onSettled={onCsfSettled} clock={clock}
      endsAt={csfPlayback ? csfPlayback.startedAt + csfPlan.durationMilliseconds : undefined} /> : null}
    <TissueRelaxationPlots tissues={tissues} startedAt={playback?.startedAt ?? null} highlighted={stateIndex === 0 ? highlighted : null}
      entering={stateIndex === 0 && entering} csfOnly={stateIndex > 0} ensembleStates={stateIndex >= 2 ? grid : undefined}
      showIntrinsicReference={stateIndex >= 5} clock={clock}
      refocusTime={stateIndex >= 5 ? refocusTime : null}
      onPlaceRefocusingPulse={stateIndex >= 5 && csfPlayback !== null ? placeRefocusingPulse : undefined}
      durationMilliseconds={csfPlan.durationMilliseconds} />
  </div>
}

export const howWeMeasure2SlideModule: PresentationSlideModule = {
  id: 'how-we-measure-2',
  heading: 'How are we measuring?',
  stateCount: 7,
  pauseFromState: 1,
  Component: HowWeMeasure2Slide,
}
