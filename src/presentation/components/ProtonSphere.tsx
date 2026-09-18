import { ProtonSphereGraphic } from '../ProtonSphereGraphic'
import type { ProtonExcitation } from '../slides/howWeMeasure/protonExcitation'

export function ProtonSphere({
  orientation,
  showCone,
  fieldArrowOpacity = 0,
  animateConeChange = false,
  showNetMagnet = false,
  className = '',
  ariaLabel,
  excitation,
}: {
  orientation?: 'up' | 'down'
  showCone: boolean
  fieldArrowOpacity?: number
  animateConeChange?: boolean
  showNetMagnet?: boolean
  className?: string
  ariaLabel?: string
  excitation?: ProtonExcitation
}) {
  return (
    <div
      aria-label={
        ariaLabel ??
        (orientation
          ? `${orientation} spin proton ensemble`
          : 'Representative proton ensemble')
      }
      className={`proton-sphere ${className}`}
    >
      <ProtonSphereGraphic
        animateConeChange={animateConeChange}
        fieldArrowOpacity={fieldArrowOpacity}
        orientation={orientation}
        showCone={showCone}
        showNetMagnet={showNetMagnet}
        excitation={excitation}
      />
    </div>
  )
}
