import { useEffect, useRef, useState } from 'react'
import { RACER_COUNT, raceTrackGeometry } from './protonRace'

export function RaceTrack() {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 520, height: 700 })
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const measure = () => {
      const { width, height } = svg.getBoundingClientRect()
      if (width > 0 && height > 0) setSize({ width, height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])
  const { width, height } = size
  const track = raceTrackGeometry(width, height)
  return <svg className="proton-race-track" ref={ref} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <rect className="proton-race-track__ground" x={track.left} y="0" width={track.right - track.left} height={height} />
    {Array.from({ length: RACER_COUNT + 1 }, (_, index) => <line key={index} className="proton-race-track__lane"
      x1={track.left + index * track.laneWidth} x2={track.left + index * track.laneWidth} y1="0" y2={height} />)}
    <line className="proton-race-track__start" x1={track.left} x2={track.right} y1={track.startY} y2={track.startY} />
    <g transform={`translate(${width / 2} ${track.startY - track.radius - 28})`}>
      <rect x="-108" y="-18" width="216" height="32" rx="6" />
      <text textAnchor="middle" y="5">START / FINISH</text>
    </g>
  </svg>
}
