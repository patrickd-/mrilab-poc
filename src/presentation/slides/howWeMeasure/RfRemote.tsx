import type { Ref } from 'react'

// Illustrative propagation delay, not the physical radio-wave travel time.
export const RF_WAVE_TRAVEL_MS = 180
export const RF_WAVE_DURATION_MS = 1000

export interface RfWave {
  sequence: number
  x: number
  y: number
  radius: number
}

export function RfRemote({ onFlick, disabled, transmitting, antennaRef }: {
  onFlick: () => void
  disabled: boolean
  transmitting: boolean
  antennaRef: Ref<SVGCircleElement>
}) {
  return (
    <button className={`rf-remote${transmitting ? ' rf-remote--transmitting' : ''}`}
      aria-label="Flick the remote control to send a 90° RF pulse"
      disabled={disabled} onClick={onFlick} type="button">
      <svg viewBox="0 0 160 260" aria-hidden="true">
        <path d="M108 104 L112 16" stroke="#101925" strokeWidth="13" strokeLinecap="round" />
        <path d="M108 99 L112 16" stroke="#b5cad6" strokeWidth="7" strokeLinecap="round" />
        <path d="M110 81 L111 35" stroke="#f1f8fb" strokeWidth="2" strokeLinecap="round" />
        <circle ref={antennaRef} cx="112" cy="16" r="7" fill="#e3eff5" stroke="#607f91" strokeWidth="2" />
        <rect x="18" y="92" width="128" height="161" rx="25" fill="#0a101a" />
        <rect x="14" y="86" width="128" height="161" rx="25" fill="#324556" stroke="#7d96a9" strokeWidth="2" />
        <path d="M30 102 Q78 88 125 102 L125 223 Q78 238 30 223Z" fill="#22303f" />
        <path d="M25 117 L25 213 M132 117 L132 213" stroke="#496173" strokeWidth="2" />
        <circle cx="80" cy="148" r="40" fill="#0b121b" stroke="#718799" strokeWidth="3" />
        <g className="rf-remote__red-button">
          <circle cx="80" cy="148" r="33" fill="#85152a" />
          <circle cx="80" cy="142" r="33" fill="#ff394e" stroke="#ff8690" strokeWidth="2" />
          <path d="M56 129 Q71 113 91 120" stroke="#ffd0cb" strokeWidth="5" strokeLinecap="round" fill="none" />
        </g>
        <circle className="rf-remote__led" cx="80" cy="204" r="4" fill="#57777c" />
        <path d="M63 221 H97 M68 227 H92" stroke="#728897" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}

export function RfWavefront({ wave }: { wave: RfWave | null }) {
  if (!wave) return null
  return (
    <svg className="rf-wavefront" aria-hidden="true" data-testid="rf-wavefront" key={wave.sequence}>
      <g transform={`translate(${wave.x} ${wave.y})`}>
        {[0, 55, 110].map(delay => (
          <circle key={delay} className="rf-wavefront__ring" r={wave.radius}
            style={{ animationDelay: `${delay}ms`, animationDuration: `${RF_WAVE_DURATION_MS}ms` }} />
        ))}
      </g>
    </svg>
  )
}
