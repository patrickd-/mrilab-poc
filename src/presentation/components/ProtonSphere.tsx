import { ProtonSphereGraphic } from '../ProtonSphereGraphic'

export function ProtonSphere({
  orientation,
  showCone,
  fieldArrowOpacity = 0,
  animateConeChange = false,
  showNetMagnet = false,
  className = '',
  ariaLabel,
}: {
  orientation?: 'up' | 'down'
  showCone: boolean
  fieldArrowOpacity?: number
  animateConeChange?: boolean
  showNetMagnet?: boolean
  className?: string
  ariaLabel?: string
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
      />
    </div>
  )
}
