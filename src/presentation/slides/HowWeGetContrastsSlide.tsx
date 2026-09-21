import { useMemo, useState } from 'react'
import { ContrastPlots } from './contrasts/ContrastPlots'
import { createContrastTissues, EMPTY_CONTRAST_TIMING } from './contrasts/contrastModel'
import { MriContrastImage } from './contrasts/MriContrastImage'
import type { PresentationSlideModule, SlideStateProps } from './types'
import './howWeMeasure/how-we-measure.css'
import './howWeMeasure2/tissue-comparison.css'
import './contrasts/contrasts.css'

function HowWeGetContrastsSlide({ fieldStrengthTesla }: SlideStateProps) {
  const [timing, setTiming] = useState(EMPTY_CONTRAST_TIMING)
  const tissues = useMemo(() => createContrastTissues(fieldStrengthTesla), [fieldStrengthTesla])
  return <div className="contrast-slide">
    <MriContrastImage timing={timing} />
    <ContrastPlots tissues={tissues} timing={timing} onChange={setTiming} />
  </div>
}

export const howWeGetContrastsSlideModule: PresentationSlideModule = {
  id: 'how-we-get-contrasts', heading: 'How do we get contrasts?', stateCount: 1,
  Component: HowWeGetContrastsSlide,
}
