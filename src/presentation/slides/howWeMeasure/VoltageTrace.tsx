import { useEffect, useId, useRef } from 'react'
import {
  createPresentationCsfState,
  presentationReceivedVoltageAt,
  type ProtonExcitation,
} from './protonExcitation'
import { FID_PLAY_PLAN, type PlayPlan } from '../../playback/playPlan'

const START_X = 40
const END_X = 420
const ZERO_Y = 162
const VOLTAGE_SCALE = 92

export function VoltageTrace({ excitation, startedAt, plan = FID_PLAY_PLAN }: {
  excitation: ProtonExcitation
  startedAt: number | null
  plan?: PlayPlan
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const descriptionId = useId()
  const leadIn = plan.layoutDurationMilliseconds + plan.settleDelayMilliseconds

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    path.setAttribute('d', '')
    path.setAttribute('data-elapsed-ms', '0')
    if (startedAt === null) return
    const state = createPresentationCsfState(excitation.fieldStrengthTesla)
    let nextSample = -leadIn
    let curve = ''
    let frame = 0
    const animate = () => {
      const elapsed = Math.max(-leadIn, Math.min(plan.durationMilliseconds, performance.now() - startedAt))
      // Sample the very same receiver function as the needle. Backfill missed
      // frames at a fixed cadence; never reveal measurements ahead of time.
      while (nextSample <= elapsed) {
        const voltage = presentationReceivedVoltageAt(state, excitation, startedAt + nextSample)
        const x = START_X + (nextSample + leadIn) / (plan.durationMilliseconds + leadIn) * (END_X - START_X)
        const y = ZERO_Y - voltage * VOLTAGE_SCALE
        curve += `${curve === '' ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
        nextSample += plan.sampleIntervalMilliseconds
      }
      path.setAttribute('d', curve)
      path.setAttribute('data-elapsed-ms', String(elapsed))
      if (elapsed < plan.durationMilliseconds) frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [excitation, startedAt, plan, leadIn])

  const timeTicks = Array.from({ length: 7 }, (_, index) => index / 6 * plan.durationMilliseconds / 1000)
  const timeX = (milliseconds: number) => START_X + (milliseconds + leadIn) / (plan.durationMilliseconds + leadIn) * (END_X - START_X)

  return (
    <div className="voltage-trace">
      <svg viewBox="0 0 440 310" preserveAspectRatio="xMidYMin meet" role="img" aria-label="Induced voltage over time"
        aria-describedby={descriptionId}>
        <desc id={descriptionId}>
          Induced voltage on a relative scale, using the same slowed precession
          as the magnet and voltmeter. Negative time records the lead-in before
          the pulse at t=0; time is in seconds.
        </desc>
        <g className="voltage-trace__grid">
          {[70, ZERO_Y, 254].map(y => <line key={y} x1="34" x2="426" y1={y} y2={y} />)}
          {timeTicks.slice(1).map(second => {
            const x = timeX(second * 1000)
            return <line key={second} x1={x} x2={x} y1="54" y2="271" />
          })}
        </g>
        <path className="voltage-trace__axis" d="M34 54 V276 H428 M29 63 L34 54 L39 63 M419 271 L428 276 L419 281" />
        <text className="voltage-trace__label" x="-18" y="42">Volts</text>
        <text className="voltage-trace__label" x="427" y="260">t</text>
        <text className="voltage-trace__tick" x="26" y="168" textAnchor="end">0</text>
        {timeTicks.map(second => (
          <text className="voltage-trace__tick" key={second}
            x={timeX(second * 1000)} y="300" textAnchor="middle">{Number(second.toFixed(2))}</text>
        ))}
        {plan.events.map((event, index) => (
          <g key={index} transform={`translate(${timeX(event.timeMilliseconds)} 0)`}
            role="img" aria-label={`${event.label} RF pulse at ${event.timeMilliseconds / 1000} s`}>
            <line className="voltage-trace__pulse-line" x1="0" x2="0" y1="43" y2="276" />
            <path className="voltage-trace__tag" d="M-14 5 H14 V32 L0 44 L-14 32Z" />
            <path className="voltage-trace__rf-symbol" d="M-7 13 Q2 20 -7 27 M0 10 Q12 20 0 30" />
          </g>
        ))}
        <path className="voltage-trace__signal" data-testid="voltage-trace-signal" ref={pathRef} />
      </svg>
    </div>
  )
}
