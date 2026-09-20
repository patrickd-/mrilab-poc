import { useId, type CSSProperties } from 'react'
import { csfFieldProfile } from '../slides/howWeMeasure2/csfDephasing'

export function MagneticFieldBackdrop({
  fieldStrengthTesla,
  className = '',
  nonUniform = false,
}: {
  fieldStrengthTesla: number
  className?: string
  nonUniform?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const fieldLineOpacity =
    0.34 * (1 - Math.exp(-fieldStrengthTesla / 1.5))

  return (
    <div
      aria-hidden="true"
      className={`field-backdrop${className ? ` ${className}` : ''}${nonUniform ? ' field-backdrop--nonuniform' : ''}`}
    >
      <div className="magnet magnet--north"><span>N</span></div>
      <div className="magnet magnet--south"><span>S</span></div>
      <div
        className="field-lines"
        style={{ '--field-opacity': fieldLineOpacity } as CSSProperties}
      >
        {Array.from({ length: 7 }, (_, index) => (
          <span className="field-line" key={index} />
        ))}
      </div>
      <div className="field-lines field-lines--curved" style={{ '--field-opacity': 0.65 } as CSSProperties}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" data-testid="curved-field-lines">
        <defs>
          {Array.from({ length: 7 }, (_, index) => {
            const x = (index - 3) / 3
            return <linearGradient id={`${id}-field-${index}`} key={index} gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="0">
              {[0, 0.25, 0.5, 0.75, 1].map(t => <stop key={t} offset={t}
                stopColor={`hsl(${210 - csfFieldProfile(x, 2 * t - 1) * 84} 85% 67%)`} />)}
            </linearGradient>
          })}
        </defs>
        {Array.from({ length: 7 }, (_, index) => {
          const x = 12 + index * 76 / 6
          const bulge = 11 * ((index - 3) / 3) ** 3
          const middle = x + bulge * 0.75
          return <g key={index}>
            <path d={`M${x} 100 C${x + bulge} 72 ${x + bulge} 28 ${x} 0`}
              stroke={`url(#${id}-field-${index})`} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <path d={`M${middle - 1.2} 51.5 L${middle} 49 L${middle + 1.2} 51.5`}
              stroke={`url(#${id}-field-${index})`} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
        })}
      </svg>
      </div>
    </div>
  )
}
