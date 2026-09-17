import { useEffect, useState } from 'react'
import { MagneticFieldBackdrop } from '../components/MagneticFieldBackdrop'
import { ProtonSphere } from '../components/ProtonSphere'
import { FlickingHand } from './howWeMeasure/FlickingHand'
import { SpinningTopGraphic } from './howWeMeasure/SpinningTopGraphic'
import { FLICK_DURATION_MS } from './howWeMeasure/flickTiming'
import './howWeMeasure/how-we-measure.css'
import type { PresentationSlideModule, SlideStateProps } from './types'

function HowWeMeasureSlide({
  fieldStrengthTesla,
  stateIndex,
}: SlideStateProps) {
  const [flickSequence, setFlickSequence] = useState(0)
  const [isFlicking, setIsFlicking] = useState(false)
  const showTop = stateIndex >= 1
  const showHand = stateIndex >= 2

  useEffect(() => {
    if (!isFlicking) return
    const rechargeTimer = window.setTimeout(() => setIsFlicking(false), FLICK_DURATION_MS)
    return () => window.clearTimeout(rechargeTimer)
  }, [isFlicking])

  const flickTop = () => {
    if (isFlicking) return
    setIsFlicking(true)
    setFlickSequence((sequence) => sequence + 1)
  }

  return (
    <div className="how-we-measure-scene">
      <MagneticFieldBackdrop
        className="how-we-measure__field"
        fieldStrengthTesla={fieldStrengthTesla}
      />

      <ProtonSphere
        ariaLabel="Proton sphere with net magnetization"
        className={`how-we-measure__proton${showTop ? ' how-we-measure__proton--replaced' : ''}`}
        orientation="up"
        showCone={false}
        showNetMagnet={fieldStrengthTesla > 0}
      />

      {showTop ? <SpinningTopGraphic flickSequence={flickSequence} /> : null}
      {showHand ? (
        <FlickingHand isFlicking={isFlicking} onFlick={flickTop} />
      ) : null}
    </div>
  )
}

export const howWeMeasureSlideModule: PresentationSlideModule = {
  id: 'how-we-measure',
  heading: 'How are we measuring?',
  stateCount: 3,
  Component: HowWeMeasureSlide,
}
