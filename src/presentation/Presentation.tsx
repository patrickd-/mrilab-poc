import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  presentationSlides,
  type NavigationDirection,
} from './slides'
import { SimulationClock } from './playback/simulationClock'

interface PresentationCursor {
  slideIndex: number
  stateIndex: number
}

interface OutgoingSlide extends PresentationCursor {
  replayVersion: number
  fieldStrengthTesla: number
}

const FIRST_CURSOR: PresentationCursor = {
  slideIndex: 0,
  stateIndex: 0,
}

const DEMONSTRATION_FIELD_TESLA = 1.5

function isFirstCursor(cursor: PresentationCursor) {
  return cursor.slideIndex === 0 && cursor.stateIndex === 0
}

function isLastCursor(cursor: PresentationCursor) {
  const lastSlideIndex = presentationSlides.length - 1
  return (
    cursor.slideIndex === lastSlideIndex &&
    cursor.stateIndex === presentationSlides[lastSlideIndex].stateCount - 1
  )
}

function nextCursor(cursor: PresentationCursor): PresentationCursor {
  const slide = presentationSlides[cursor.slideIndex]
  if (cursor.stateIndex < slide.stateCount - 1) {
    return { ...cursor, stateIndex: cursor.stateIndex + 1 }
  }
  if (cursor.slideIndex < presentationSlides.length - 1) {
    return { slideIndex: cursor.slideIndex + 1, stateIndex: 0 }
  }
  return cursor
}

function previousCursor(cursor: PresentationCursor): PresentationCursor {
  if (cursor.stateIndex > 0) {
    return { ...cursor, stateIndex: cursor.stateIndex - 1 }
  }
  if (cursor.slideIndex > 0) {
    const previousSlideIndex = cursor.slideIndex - 1
    return {
      slideIndex: previousSlideIndex,
      stateIndex: presentationSlides[previousSlideIndex].stateCount - 1,
    }
  }
  return cursor
}

export function Presentation() {
  const [cursor, setCursor] = useState(FIRST_CURSOR)
  const [direction, setDirection] = useState<NavigationDirection>('initial')
  const [fieldStrengthTesla, setFieldStrengthTesla] = useState(0)
  const [replayVersion, setReplayVersion] = useState(0)
  const [outgoing, setOutgoing] = useState<OutgoingSlide | null>(null)
  const [simulationClock] = useState(() => new SimulationClock())
  const [paused, setPaused] = useState(false)
  const pauseSimulation = useCallback((pause: boolean) => {
    simulationClock.setPaused(pause)
    setPaused(pause)
  }, [simulationClock])
  const cursorRef = useRef(cursor)

  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  const goForward = useCallback(() => {
    if (isLastCursor(cursorRef.current)) return
    const current = cursorRef.current
    const currentSlide = presentationSlides[current.slideIndex]
    setOutgoing(currentSlide.animateExit && nextCursor(current).slideIndex !== current.slideIndex
      ? { ...current, replayVersion, fieldStrengthTesla: currentSlide.preserveFieldStrength ? fieldStrengthTesla : DEMONSTRATION_FIELD_TESLA }
      : null)
    pauseSimulation(false)
    setDirection('forward')
    setCursor(nextCursor)
  }, [pauseSimulation, replayVersion, fieldStrengthTesla])

  const goBackward = useCallback(() => {
    if (isFirstCursor(cursorRef.current)) return
    setOutgoing(null)
    pauseSimulation(false)
    setDirection('backward')
    setCursor(previousCursor)
  }, [pauseSimulation])

  useEffect(() => {
    const isPresentationKey = (event: KeyboardEvent) =>
      !event.altKey && !event.ctrlKey && !event.metaKey &&
      ['ArrowRight', 'ArrowLeft', ' '].includes(event.key)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPresentationKey(event)) return
      // Capture before focused sliders/buttons can consume presentation shortcuts.
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      if (event.key === 'ArrowRight') goForward()
      else if (event.key === 'ArrowLeft') goBackward()
      else {
        const current = cursorRef.current
        const { pauseFromState } = presentationSlides[current.slideIndex]
        if (pauseFromState !== undefined && current.stateIndex >= pauseFromState) {
          pauseSimulation(!simulationClock.paused)
        }
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isPresentationKey(event)) return
      // Space also activates native buttons on keyup; suppress that second action.
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [goBackward, goForward, pauseSimulation, simulationClock])

  const slide = presentationSlides[cursor.slideIndex]
  const activeFieldStrengthTesla = slide.preserveFieldStrength
    ? fieldStrengthTesla : DEMONSTRATION_FIELD_TESLA
  useEffect(() => {
    if (!slide.preserveFieldStrength) setFieldStrengthTesla(DEMONSTRATION_FIELD_TESLA)
  }, [slide.preserveFieldStrength])
  const Slide = slide.Component
  const Outgoing = outgoing ? presentationSlides[outgoing.slideIndex].Component : null
  const presentationClassName = useMemo(
    () => `presentation presentation--${direction}`,
    [direction],
  )

  return (
    <main
      className={presentationClassName}
      data-slide={slide.id}
      data-slide-state={cursor.stateIndex}
      data-field-strength-tesla={activeFieldStrengthTesla}
    >
      <header className="presentation-bar">
        <h1 aria-label={slide.heading || 'Title slide'}>
          {slide.heading || '\u00a0'}
        </h1>
        <nav aria-label="Presentation navigation">
          {slide.pauseFromState !== undefined && cursor.stateIndex >= slide.pauseFromState ?
            <button aria-label={paused ? 'Resume simulation' : 'Pause simulation'} aria-pressed={paused}
              type="button" onClick={() => pauseSimulation(!paused)}>
              <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                {paused ? <path d="M7 4 L20 12 L7 20 Z" /> : <path d="M6 4 H10 V20 H6 Z M14 4 H18 V20 H14 Z" />}
              </svg>
            </button> : null}
          <button aria-label="Replay current step" type="button" onClick={() => {
            setOutgoing(null)
            pauseSimulation(false)
            setDirection('forward')
            setReplayVersion(version => version + 1)
          }}>
            <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 5v6h-6 M20 11a8 8 0 1 0-2 6" />
            </svg>
          </button>
          <button
            aria-label="Previous step"
            disabled={isFirstCursor(cursor)}
            onClick={goBackward}
            type="button"
          >
            ◀
          </button>
          <button
            aria-label="Next step"
            disabled={isLastCursor(cursor)}
            onClick={goForward}
            type="button"
          >
            ▶
          </button>
        </nav>
      </header>

      <section aria-live="polite" className="presentation-stage">
        {Outgoing && outgoing ? <Outgoing
          key={`${presentationSlides[outgoing.slideIndex].id}:${outgoing.replayVersion}`}
          direction="forward" stateIndex={outgoing.stateIndex} fieldStrengthTesla={outgoing.fieldStrengthTesla}
          setFieldStrengthTesla={setFieldStrengthTesla} simulationClock={simulationClock} exiting
          onExitComplete={() => setOutgoing(current => current === outgoing ? null : current)} /> : null}
        <Slide
          key={`${slide.id}:${replayVersion}`}
          direction={direction}
          fieldStrengthTesla={activeFieldStrengthTesla}
          setFieldStrengthTesla={setFieldStrengthTesla}
          stateIndex={cursor.stateIndex}
          simulationClock={simulationClock}
        />
      </section>
    </main>
  )
}
