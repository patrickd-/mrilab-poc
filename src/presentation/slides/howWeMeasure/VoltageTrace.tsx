import { useEffect, useId, useRef } from 'react'
import {
  createPresentationCsfState,
  presentationReceivedVoltageAt,
  type ProtonExcitation,
} from './protonExcitation'
import { FID_PLAY_PLAN, type PlayPlan } from '../../playback/playPlan'

const ORIGIN_X = 88
const END_X = 414
const ZERO_Y = 174
const VOLTAGE_SCALE = 74

export function VoltageTrace({ excitation, startedAt, plan = FID_PLAY_PLAN }: {
  excitation: ProtonExcitation
  startedAt: number | null
  plan?: PlayPlan
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
    const animate = () => {
      const elapsed = Math.max(0, Math.min(plan.durationMilliseconds, performance.now() - startedAt))
      // Sample the very same receiver function as the needle. Backfill missed
      // frames at a fixed cadence; never reveal measurements ahead of time.
      while (nextSample <= elapsed) {
        const voltage = presentationReceivedVoltageAt(state, excitation, startedAt + nextSample)
        const x = ORIGIN_X + nextSample / plan.durationMilliseconds * (END_X - ORIGIN_X)
        const y = ZERO_Y - voltage * VOLTAGE_SCALE
        curve += `${nextSample === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
        nextSample += plan.sampleIntervalMilliseconds
      }
      path.setAttribute('d', curve)
      path.setAttribute('data-elapsed-ms', String(elapsed))
      if (elapsed < plan.durationMilliseconds) frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [excitation, startedAt, plan])

  const timeTicks = Array.from({ length: 7 }, (_, index) => index / 6 * plan.durationMilliseconds / 1000)
  const timeX = (milliseconds: number) => ORIGIN_X + milliseconds / plan.durationMilliseconds * (END_X - ORIGIN_X)

  return (
    <div className="voltage-trace">
      <svg viewBox="0 0 440 320" role="img" aria-label="Induced voltage over time"
        aria-describedby={descriptionId}>
        <desc id={descriptionId}>
          Induced voltage on a relative scale, using the same slowed precession
          as the magnet and voltmeter. Time is in seconds from the play plan's start.
        </desc>
        <g className="voltage-trace__grid">
          {[100, ZERO_Y, 248].map(y => <line key={y} x1="56" x2="420" y1={y} y2={y} />)}
          {timeTicks.slice(1).map(second => {
            const x = timeX(second * 1000)
            return <line key={second} x1={x} x2={x} y1="86" y2="265" />
          })}
        </g>
        <path className="voltage-trace__axis" d="M56 84 V270 H425 M51 93 L56 84 L61 93 M416 265 L425 270 L416 275" />
        <text className="voltage-trace__label" x="14" y="69">Volts</text>
        <text className="voltage-trace__label" x="424" y="254">t</text>
        <text className="voltage-trace__tick" x="42" y="180" textAnchor="end">0</text>
        {timeTicks.map(second => (
          <text className="voltage-trace__tick" key={second}
            x={timeX(second * 1000)} y="294" textAnchor="middle">{Number(second.toFixed(2))}</text>
        ))}
        {plan.events.map((event, index) => (
          <g key={index} transform={`translate(${timeX(event.timeMilliseconds)} 0)`}>
            <line className="voltage-trace__pulse-line" x1="0" x2="0" y1="54" y2="270" />
            <path className="voltage-trace__tag" d="M-28 10 H28 V40 L0 57 L-28 40Z" />
            <circle cx="0" cy="48" r="2.5" fill="#151b23" />
            <text className="voltage-trace__tag-label" x="0" y="33" textAnchor="middle">{event.label}</text>
          </g>
        ))}
        <path className="voltage-trace__signal" data-testid="voltage-trace-signal" ref={pathRef} />
      </svg>
    </div>
  )
}
