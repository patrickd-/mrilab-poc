import { useEffect, useId, useRef } from 'react'
import {
  createPresentationCsfState,
  presentationReceivedVoltageAt,
  type ProtonExcitation,
} from './protonExcitation'

export const MEASUREMENT_LAYOUT_MS = 1100
export const MEASUREMENT_PULSE_DELAY_MS = 200
export const VOLTAGE_TRACE_DURATION_MS = 12000
const SAMPLE_INTERVAL_MS = 20
const ORIGIN_X = 88
const END_X = 414
const ZERO_Y = 174
const VOLTAGE_SCALE = 74

export function VoltageTrace({ excitation, startedAt }: {
  excitation: ProtonExcitation
  startedAt: number | null
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const descriptionId = useId()

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    path.setAttribute('d', '')
    path.setAttribute('data-elapsed-ms', '0')
    if (startedAt === null) return
    const state = createPresentationCsfState(excitation.fieldStrengthTesla)
    let nextSample = 0
    let curve = ''
    let frame = 0
    const animate = (now: number) => {
      const elapsed = Math.max(0, Math.min(VOLTAGE_TRACE_DURATION_MS, now - startedAt))
      // Sample the very same receiver function as the needle. Backfill missed
      // frames at a fixed cadence; never reveal measurements ahead of time.
      while (nextSample <= elapsed) {
        const voltage = presentationReceivedVoltageAt(state, excitation, startedAt + nextSample)
        const x = ORIGIN_X + nextSample / VOLTAGE_TRACE_DURATION_MS * (END_X - ORIGIN_X)
        const y = ZERO_Y - voltage * VOLTAGE_SCALE
        curve += `${nextSample === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
        nextSample += SAMPLE_INTERVAL_MS
      }
      path.setAttribute('d', curve)
      path.setAttribute('data-elapsed-ms', String(elapsed))
      if (elapsed < VOLTAGE_TRACE_DURATION_MS) frame = requestAnimationFrame(animate)
    }
    animate(performance.now())
    return () => cancelAnimationFrame(frame)
  }, [excitation, startedAt])

  return (
    <div className="voltage-trace">
      <svg viewBox="0 0 440 320" role="img" aria-label="Induced voltage over time"
        aria-describedby={descriptionId}>
        <desc id={descriptionId}>
          Induced voltage on a relative scale, using the same slowed precession
          as the magnet and voltmeter. Time is in seconds after the 90-degree pulse.
        </desc>
        <g className="voltage-trace__grid">
          {[100, ZERO_Y, 248].map(y => <line key={y} x1="56" x2="420" y1={y} y2={y} />)}
          {[2, 4, 6, 8, 10, 12].map(second => {
            const x = ORIGIN_X + second / 12 * (END_X - ORIGIN_X)
            return <line key={second} x1={x} x2={x} y1="86" y2="265" />
          })}
        </g>
        <path className="voltage-trace__axis" d="M56 84 V270 H425 M51 93 L56 84 L61 93 M416 265 L425 270 L416 275" />
        <text className="voltage-trace__label" x="14" y="69">Volts</text>
        <text className="voltage-trace__label" x="424" y="254">t</text>
        <text className="voltage-trace__tick" x="42" y="180" textAnchor="end">0</text>
        {[0, 2, 4, 6, 8, 10, 12].map(second => (
          <text className="voltage-trace__tick" key={second}
            x={ORIGIN_X + second / 12 * (END_X - ORIGIN_X)} y="294" textAnchor="middle">{second}</text>
        ))}
        <line className="voltage-trace__pulse-line" x1={ORIGIN_X} x2={ORIGIN_X} y1="54" y2="270" />
        <path className="voltage-trace__tag" d="M60 10 H116 V40 L88 57 L60 40Z" />
        <circle cx="88" cy="48" r="2.5" fill="#151b23" />
        <text className="voltage-trace__tag-label" x="88" y="33" textAnchor="middle">90°</text>
        <path className="voltage-trace__signal" data-testid="voltage-trace-signal" ref={pathRef} />
      </svg>
    </div>
  )
}
