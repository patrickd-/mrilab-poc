import {
  useEffect,
  useState,
  type CSSProperties,
} from 'react'
import { ProtonBurst } from '../ProtonBurst'
import { ProtonSphereGraphic } from '../ProtonSphereGraphic'
import {
  HALF_PROTONS,
  TOTAL_PROTONS,
  formatProtonCount,
  protonPopulationsAt,
} from '../physics'
import type { PresentationSlideModule, SlideStateProps } from './types'

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

function LiquidDrop({ shiftedLeft }: { shiftedLeft: boolean }) {
  return (
    <svg
      aria-label="A drop of cerebrospinal fluid"
      className={`csf-drop${shiftedLeft ? ' csf-drop--left' : ''}`}
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
  showNetMagnet = false,
  className = '',
}: {
  orientation?: 'up' | 'down'
  showCone: boolean
  fieldArrowOpacity?: number
  animateConeChange?: boolean
  showNetMagnet?: boolean
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
        showNetMagnet={showNetMagnet}
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

function WhatWeMeasureSlide({ direction, stateIndex }: SlideStateProps) {
  const [fieldStrengthTesla, setFieldStrengthTesla] = useState(0)
  const step = stateIndex + 1
  const shiftDropLeft = step >= 5
  const labelsOnDrop = step >= 6
  const showField = step >= 8
  const finalExcessState = step >= 9
  const populations = protonPopulationsAt(fieldStrengthTesla)
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
    <div className="what-we-measure-scene">
      {showField ? <FieldBackdrop fieldStrengthTesla={fieldStrengthTesla} /> : null}

      {step >= 2 ? <LiquidDrop shiftedLeft={shiftDropLeft} /> : null}

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
                    ? `≈${formatProtonCount(populations.excess)}`
                    : `≈${formatProtonCount(populations.parallel)}`}
            </div>
            <ProtonSphere
              animateConeChange={direction === 'forward'}
              className="proton-sphere--spin"
              fieldArrowOpacity={finalExcessState ? 0 : arrowOpacity}
              orientation="up"
              showCone={!finalExcessState}
              showNetMagnet={finalExcessState}
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
                  : `≈${formatProtonCount(populations.antiparallel)}`}
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

export const whatWeMeasureSlideModule: PresentationSlideModule = {
  id: 'what-we-measure',
  heading: 'What are we measuring?',
  stateCount: 9,
  Component: WhatWeMeasureSlide,
}
