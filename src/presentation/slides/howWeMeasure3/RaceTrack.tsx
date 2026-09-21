import { useEffect, useId, useRef, useState } from 'react'
import { RACER_COUNT, raceTrackGeometry } from './protonRace'

export function RaceTrack() {
  const checkerId = useId().replace(/:/g, '')
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
  const square = track.laneWidth / 6
  return <svg className="proton-race-track" ref={ref} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <defs>
      <pattern id={checkerId} patternUnits="userSpaceOnUse" x={track.left} y={track.startY - square} width={square * 2} height={square * 2}>
        <rect width={square * 2} height={square * 2} fill="#f1f4f5" />
        <path d={`M0 0 H${square} V${square} H0Z M${square} ${square} H${square * 2} V${square * 2} H${square}Z`} fill="#111820" />
      </pattern>
    </defs>
    {Array.from({ length: RACER_COUNT }, (_, index) => <rect key={index} className="proton-race-track__surface"
      x={track.left + index * track.laneWidth} y="0" width={track.laneWidth} height={height}
      fill={`hsl(${270 - index / (RACER_COUNT - 1) * 240} 55% 24%)`} />)}
    {Array.from({ length: RACER_COUNT + 1 }, (_, index) => <line key={index} className="proton-race-track__lane"
      x1={track.left + index * track.laneWidth} x2={track.left + index * track.laneWidth} y1="0" y2={height} />)}
    <rect data-testid="race-checkerboard" x={track.left} y={track.startY - square}
      width={track.right - track.left} height={square * 2} fill={`url(#${checkerId})`} />
  </svg>
}
