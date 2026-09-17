import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  HALF_PROTONS,
  TOTAL_PROTONS,
  excessProtonsAt,
  formatProtonCount,
} from './physics'
import { ProtonBurst } from './ProtonBurst'
import { ProtonSphereGraphic } from './ProtonSphereGraphic'

const LAST_STEP = 9

type NavigationDirection = 'initial' | 'forward' | 'backward'

function AnimatedCount({
  value,
  animate,
  duration = 900,
}: {
  value: number
  animate: boolean
  duration?: number
}) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value)

  useEffect(() => {
    if (!animate) {
      setDisplayValue(value)
      return
    }

    let animationFrame = 0
    const startedAt = performance.now()
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const easedProgress = 1 - (1 - progress) ** 3
      setDisplayValue(value * easedProgress)
      if (progress < 1) {
        animationFrame = requestAnimationFrame(update)
      }
    }
    animationFrame = requestAnimationFrame(update)

    return () => cancelAnimationFrame(animationFrame)
  }, [animate, duration, value])

  return <>{formatProtonCount(displayValue)}</>
}

function LiquidDrop({ compact }: { compact: boolean }) {
  return (
    <svg
      aria-label="A drop of cerebrospinal fluid"
      className={`csf-drop${compact ? ' csf-drop--compact' : ''}`}
      role="img"
      viewBox="0 0 220 280"
    >
      <defs>
        <radialGradient id="drop-fill" cx="38%" cy="30%" r="70%">
          <stop offset="0" stopColor="#dffbff" stopOpacity="0.9" />
          <stop offset="0.34" stopColor="#68dbe8" stopOpacity="0.74" />
          <stop offset="1" stopColor="#168dbe" stopOpacity="0.58" />
        </radialGradient>
        <filter id="drop-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M110 12C94 51 36 113 36 177c0 47 33 85 74 85s74-38 74-85C184 113 126 51 110 12Z"
        fill="url(#drop-fill)"
        filter="url(#drop-glow)"
        stroke="#a9f3ff"
        strokeOpacity="0.7"
        strokeWidth="2"
      />
      <ellipse cx="84" cy="162" fill="#fff" opacity="0.24" rx="15" ry="34" />
    </svg>
  )
}

function ProtonSphere({
  orientation,
  showCone,
  fieldArrowOpacity = 0,
  animateConeChange = false,
  className = '',
}: {
  orientation?: 'up' | 'down'
  showCone: boolean
  fieldArrowOpacity?: number
  animateConeChange?: boolean
  className?: string
}) {
  return (
    <div
      aria-label={orientation ? `${orientation} spin proton ensemble` : 'Representative proton ensemble'}
      className={`proton-sphere ${className}`}
    >
      <ProtonSphereGraphic
        animateConeChange={animateConeChange}
        fieldArrowOpacity={fieldArrowOpacity}
        orientation={orientation}
        showCone={showCone}
      />
    </div>
  )
}

function FieldBackdrop({ fieldStrengthTesla }: { fieldStrengthTesla: number }) {
  const fieldLineOpacity =
    0.34 * (1 - Math.exp(-fieldStrengthTesla / 1.5))
  return (
    <div aria-hidden="true" className="field-backdrop">
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

function FieldStrengthControl({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <aside className="field-control">
      <div className="field-control__readout">
        <span>B<sub>0</sub></span>
        <output>{value.toFixed(1)} Tesla</output>
      </div>
      <div className="field-control__slider-wrap">
        <input
          aria-label="B0 magnetic field strength"
          className="field-control__slider"
          max="10"
          min="0"
          onChange={(event) => onChange(Number(event.target.value))}
          step="0.1"
          type="range"
          value={value}
        />
        <div className="field-control__track" aria-hidden="true" />
        {[
          { value: 1.5, label: '1.5 T' },
          { value: 3, label: '3.0 T' },
          { value: 7, label: '7 T' },
        ].map((mark) => (
          <span
            aria-hidden="true"
            className="field-control__mark"
            key={mark.value}
            style={{ bottom: `${mark.value * 10}%` }}
          >
            {mark.label}
          </span>
        ))}
      </div>
    </aside>
  )
}

function MeasurementScene({
  step,
  direction,
  fieldStrengthTesla,
  setFieldStrengthTesla,
}: {
  step: number
  direction: NavigationDirection
  fieldStrengthTesla: number
  setFieldStrengthTesla: (value: number) => void
}) {
  const compactDrop = step >= 5
  const labelsOnDrop = step >= 6
  const showField = step >= 8
  const finalExcessState = step >= 9
  const excess = excessProtonsAt(fieldStrengthTesla)
  const arrowOpacity = showField
    ? Math.min(0.86, fieldStrengthTesla / 11.5)
    : 0
  const splitPixels = 104 + fieldStrengthTesla * 6
  const lineGapPixels = fieldStrengthTesla * 4.5
  const spinSystemStyle = {
    '--spin-split': `${splitPixels}px`,
    '--line-gap': `${lineGapPixels}px`,
  } as CSSProperties

  return (
    <div className="measurement-scene">
      {showField ? <FieldBackdrop fieldStrengthTesla={fieldStrengthTesla} /> : null}

      {step >= 2 ? <LiquidDrop compact={compactDrop} /> : null}

      {step >= 3 ? (
        <div className={`sample-label sample-label--name${labelsOnDrop ? ' sample-label--left' : ''}`}>
          Cerebrospinal Fluid <span>(CSF)</span>
        </div>
      ) : null}

      {step >= 4 ? (
        <div className={`sample-label sample-label--count${labelsOnDrop ? ' sample-label--left' : ''}`}>
          <strong>
            ≈<AnimatedCount
              animate={step === 4 && direction === 'forward'}
              value={TOTAL_PROTONS}
            />
          </strong>
          <span>Hydrogen Protons</span>
        </div>
      ) : null}

      {step === 5 ? (
        <>
          <ProtonBurst animate={direction === 'forward'} />
          <ProtonSphere className="proton-sphere--representative" showCone={false} />
        </>
      ) : null}

      {step >= 6 ? (
        <div
          className={`spin-system${finalExcessState ? ' spin-system--excess' : ''}`}
          style={spinSystemStyle}
        >
          <div className="spin-state spin-state--up">
            <div className="spin-state__label spin-state__label--up" data-testid="up-population">
              {step === 6
                ? 'UP'
                : step === 7
                  ? `≈${formatProtonCount(HALF_PROTONS)}`
                  : finalExcessState
                    ? `≈${formatProtonCount(excess)}`
                    : `≈${formatProtonCount(HALF_PROTONS + excess)}`}
            </div>
            <ProtonSphere
              animateConeChange={direction === 'forward'}
              className="proton-sphere--spin"
              fieldArrowOpacity={arrowOpacity}
              orientation="up"
              showCone={!finalExcessState}
            />
            {finalExcessState ? <div className="spin-state__caption">Excess protons</div> : null}
          </div>

          <div className="energy-separator" />
          {showField ? <div className="energy-separator energy-separator--second" /> : null}
          <div
            aria-hidden={finalExcessState}
            className="spin-state spin-state--down"
          >
            <ProtonSphere
              animateConeChange={direction === 'forward'}
              className="proton-sphere--spin"
              fieldArrowOpacity={arrowOpacity}
              orientation="down"
              showCone
            />
            <div className="spin-state__label spin-state__label--down" data-testid="down-population">
              {step === 6
                ? 'DOWN'
                : step === 7
                  ? `≈${formatProtonCount(HALF_PROTONS)}`
                  : `≈${formatProtonCount(HALF_PROTONS - excess)}`}
            </div>
          </div>
        </div>
      ) : null}

      {showField ? (
        <FieldStrengthControl
          onChange={setFieldStrengthTesla}
          value={fieldStrengthTesla}
        />
      ) : null}
    </div>
  )
}

export function Presentation() {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<NavigationDirection>('initial')
  const [fieldStrengthTesla, setFieldStrengthTesla] = useState(0)
  const stepRef = useRef(step)

  useEffect(() => {
    stepRef.current = step
  }, [step])

  const goForward = useCallback(() => {
    setDirection('forward')
    setStep((currentStep) => Math.min(LAST_STEP, currentStep + 1))
  }, [])

  const goBackward = useCallback(() => {
    setDirection('backward')
    setStep((currentStep) => Math.max(0, currentStep - 1))
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'ArrowRight' && stepRef.current < LAST_STEP) {
        event.preventDefault()
        goForward()
      } else if (event.key === 'ArrowLeft' && stepRef.current > 0) {
        event.preventDefault()
        goBackward()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goBackward, goForward])

  const heading = step === 0 ? '' : 'What are we measuring?'
  const presentationClassName = useMemo(
    () => `presentation presentation--${direction}`,
    [direction],
  )

  return (
    <main className={presentationClassName} data-step={step}>
      <header className="presentation-bar">
        <h1 aria-label={heading || 'Title slide'}>{heading || '\u00a0'}</h1>
        <nav aria-label="Presentation navigation">
          <button
            aria-label="Previous step"
            disabled={step === 0}
            onClick={goBackward}
            type="button"
          >
            ◀
          </button>
          <button
            aria-label="Next step"
            disabled={step === LAST_STEP}
            onClick={goForward}
            type="button"
          >
            ▶
          </button>
        </nav>
      </header>

      <section aria-live="polite" className="presentation-stage">
        {step === 0 ? (
          <div className="title-slide">
            <h2>MRI<br />Intuition</h2>
          </div>
        ) : (
          <MeasurementScene
            direction={direction}
            fieldStrengthTesla={fieldStrengthTesla}
            setFieldStrengthTesla={setFieldStrengthTesla}
            step={step}
          />
        )}
      </section>
    </main>
  )
}
