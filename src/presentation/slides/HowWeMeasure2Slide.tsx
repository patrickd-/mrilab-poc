import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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

function HowWeMeasure2Slide({ fieldStrengthTesla, stateIndex }: SlideStateProps) {
  const playback = usePlayPlan(TISSUE_COMPARISON_PLAN, true, `${fieldStrengthTesla}:${stateIndex}`)
  const [entering, setEntering] = useState(true)
  const [highlighted, setHighlighted] = useState<SamplePresetId | null>(null)
  const tissues = useMemo(() => createComparisonTissues(fieldStrengthTesla, playback?.pulseEvents), [fieldStrengthTesla, playback])
  const quietReceiver = useMemo(() => ({ fieldStrengthTesla, pulseEvents: [] }), [fieldStrengthTesla])

  useEffect(() => {
    setEntering(true)
    setHighlighted(null)
    const timer = window.setTimeout(() => setEntering(false), TISSUE_COMPARISON_PLAN.layoutDurationMilliseconds)
    return () => window.clearTimeout(timer)
  }, [fieldStrengthTesla, stateIndex])

  return <div className="tissue-comparison" style={{ '--comparison-layout-duration': `${TISSUE_COMPARISON_PLAN.layoutDurationMilliseconds}ms` } as CSSProperties}>
    <MagneticFieldBackdrop className="tissue-comparison__field" fieldStrengthTesla={fieldStrengthTesla} />
    {entering ? <div className="tissue-comparison__outgoing-receiver" aria-hidden="true"><ReceiveCoil excitation={quietReceiver} /></div> : null}
    {tissues.map((tissue, index) => <figure key={tissue.id}
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
