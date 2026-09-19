import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { SamplePresetId } from '../../models/HydrogenEnsemble'
import { MagneticFieldBackdrop } from '../components/MagneticFieldBackdrop'
import { ProtonSphere } from '../components/ProtonSphere'
import { usePlayPlan } from '../playback/usePlayPlan'
import { ReceiveCoil } from './howWeMeasure/ReceiveCoil'
import { TissueRelaxationPlots } from './howWeMeasure2/TissueRelaxationPlots'
import { createComparisonTissues, TISSUE_COMPARISON_PLAN } from './howWeMeasure2/tissueComparison'
import type { PresentationSlideModule, SlideStateProps } from './types'
import './howWeMeasure/how-we-measure.css'
import './howWeMeasure2/tissue-comparison.css'

// The layout has its own completion event; schedule RF only after it finishes.
const POST_LAYOUT_PLAY_PLAN = { ...TISSUE_COMPARISON_PLAN, layoutDurationMilliseconds: 0 }

function HowWeMeasure2Slide({ fieldStrengthTesla, stateIndex, direction }: SlideStateProps) {
  const [transitionStarted, setTransitionStarted] = useState(false)
  const [entering, setEntering] = useState(true)
  const firstSpecimen = useRef<HTMLElement>(null)
  const playback = usePlayPlan(POST_LAYOUT_PLAY_PLAN, !entering, `${fieldStrengthTesla}:${stateIndex}`)
  const [highlighted, setHighlighted] = useState<SamplePresetId | null>(null)
  const tissues = useMemo(() => createComparisonTissues(fieldStrengthTesla, playback?.pulseEvents), [fieldStrengthTesla, playback])
  const quietReceiver = useMemo(() => ({ fieldStrengthTesla, pulseEvents: [] }), [fieldStrengthTesla])

  useEffect(() => {
    const specimen = firstSpecimen.current
    const finishEntrance = (event: AnimationEvent) => {
      if (event.target === specimen) setEntering(false)
    }
    specimen?.addEventListener('animationend', finishEntrance)
    return () => specimen?.removeEventListener('animationend', finishEntrance)
  }, [])

  useEffect(() => {
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
  return <div className="tissue-comparison" data-transition-started={transitionStarted} data-transition-complete={!entering} style={{
    '--comparison-layout-duration': `${TISSUE_COMPARISON_PLAN.layoutDurationMilliseconds}ms`,
    '--comparison-csf-start-scale': 1.35 * previousSphereWidth / sphereWidth,
  } as CSSProperties}>
    <MagneticFieldBackdrop className="tissue-comparison__field" fieldStrengthTesla={fieldStrengthTesla} />
    {entering ? <div className="tissue-comparison__outgoing-receiver" aria-hidden="true"><ReceiveCoil excitation={quietReceiver} /></div> : null}
    {tissues.map((tissue, index) => <figure key={tissue.id}
      ref={index === 0 ? firstSpecimen : undefined}
      className={`tissue-specimen tissue-specimen--${index}`} tabIndex={0}
      aria-label={`${tissue.label} proton ensemble`} data-testid={`specimen-${tissue.id}`}
      style={{ '--tissue-color': tissue.color } as CSSProperties}
      onMouseEnter={() => setHighlighted(tissue.id)} onMouseLeave={() => setHighlighted(null)}
      onFocus={() => setHighlighted(tissue.id)} onBlur={() => setHighlighted(null)}>
      <ProtonSphere orientation="up" showCone={false} showNetMagnet={fieldStrengthTesla > 0}
        color={tissue.color} excitation={tissue.excitation} ariaLabel={`${tissue.label} magnetization`} />
      <figcaption>{tissue.label}</figcaption>
    </figure>)}
    <TissueRelaxationPlots tissues={tissues} startedAt={playback?.startedAt ?? null} highlighted={highlighted} entering={entering} />
  </div>
}

export const howWeMeasure2SlideModule: PresentationSlideModule = {
  id: 'how-we-measure-2',
  heading: 'How are we measuring?',
  stateCount: 1,
  Component: HowWeMeasure2Slide,
}
