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

interface PresentationCursor {
  slideIndex: number
  stateIndex: number
}

const FIRST_CURSOR: PresentationCursor = {
  slideIndex: 0,
  stateIndex: 0,
}

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
  const cursorRef = useRef(cursor)

  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  const goForward = useCallback(() => {
    if (isLastCursor(cursorRef.current)) return
    setDirection('forward')
    setCursor(nextCursor)
  }, [])

  const goBackward = useCallback(() => {
    if (isFirstCursor(cursorRef.current)) return
    setDirection('backward')
    setCursor(previousCursor)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'ArrowRight' && !isLastCursor(cursorRef.current)) {
        event.preventDefault()
        goForward()
      } else if (event.key === 'ArrowLeft' && !isFirstCursor(cursorRef.current)) {
        event.preventDefault()
        goBackward()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goBackward, goForward])

  const slide = presentationSlides[cursor.slideIndex]
  const Slide = slide.Component
  const presentationClassName = useMemo(
    () => `presentation presentation--${direction}`,
    [direction],
  )

  return (
    <main
      className={presentationClassName}
      data-slide={slide.id}
      data-slide-state={cursor.stateIndex}
    >
      <header className="presentation-bar">
        <h1 aria-label={slide.heading || 'Title slide'}>
          {slide.heading || '\u00a0'}
        </h1>
        <nav aria-label="Presentation navigation">
          <button aria-label="Replay current step" type="button" onClick={() => {
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
        <Slide
          key={`${slide.id}:${replayVersion}`}
          direction={direction}
          fieldStrengthTesla={fieldStrengthTesla}
          setFieldStrengthTesla={setFieldStrengthTesla}
          stateIndex={cursor.stateIndex}
        />
      </section>
    </main>
  )
}
