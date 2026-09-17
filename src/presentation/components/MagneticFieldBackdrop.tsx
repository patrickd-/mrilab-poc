import type { CSSProperties } from 'react'

export function MagneticFieldBackdrop({
  fieldStrengthTesla,
  className = '',
}: {
  fieldStrengthTesla: number
  className?: string
}) {
  const fieldLineOpacity =
    0.34 * (1 - Math.exp(-fieldStrengthTesla / 1.5))

  return (
    <div
      aria-hidden="true"
      className={`field-backdrop${className ? ` ${className}` : ''}`}
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
    </div>
  )
}
