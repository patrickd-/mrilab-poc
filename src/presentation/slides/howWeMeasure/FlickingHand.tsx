import { useId, useLayoutEffect, useMemo, useRef } from 'react'
import handSvg from './flick-hand.svg?raw'
import { FLICK_SOURCE_DURATION_SECONDS, FLICK_PLAYBACK_RATE } from './flickTiming'

export function FlickingHand({
  isFlicking,
  onFlick,
  ariaLabel = 'Flick the spinning top',
  disabled = false,
}: {
  isFlicking: boolean
  onFlick: () => void
  ariaLabel?: string
  disabled?: boolean
}) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const id = useId()
  // Keep the supplied artwork and articulated SVG animations intact. Scope
  // references so separate instances never share clip paths or animated parts.
  const artwork = useMemo(() => {
    const prefix = `flick-${id.replace(/[^a-zA-Z0-9_-]/g, '')}-`
    return {
      __html: handSvg
        .replace(/id="([^"]+)"/g, `id="${prefix}$1"`)
        .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`)
        .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
        .replace(/aria-labelledby="([^"]+)"/g, (_, ids: string) =>
          `aria-labelledby="${ids.split(' ').map((value) => prefix + value).join(' ')}"`,
        ),
    }
  }, [id])

  useLayoutEffect(() => {
    const svg = hostRef.current?.querySelector('svg')
    // jsdom does not implement the SVG animation clock.
    if (!svg || typeof svg.pauseAnimations !== 'function') return
    svg.pauseAnimations()
    svg.setCurrentTime(0)
    if (!isFlicking) return

    const startedAt = performance.now()
    let frame = 0
    const animate = (now: number) => {
      const time = Math.min(
        FLICK_SOURCE_DURATION_SECONDS,
        ((now - startedAt) / 1000) * FLICK_PLAYBACK_RATE,
      )
      svg.setCurrentTime(time)
      if (time < FLICK_SOURCE_DURATION_SECONDS) {
        frame = requestAnimationFrame(animate)
      }
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [isFlicking])

  return (
    <button
      aria-label={ariaLabel}
      className={`flicking-hand${isFlicking ? ' flicking-hand--flicking' : ''}`}
      disabled={isFlicking || disabled}
      onClick={onFlick}
      type="button"
    >
      <span
        aria-hidden="true"
        className="flicking-hand__artwork"
        ref={hostRef}
        dangerouslySetInnerHTML={artwork}
      />
    </button>
  )
}
