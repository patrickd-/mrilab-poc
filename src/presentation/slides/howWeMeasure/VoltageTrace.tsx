import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import {
  createPresentationCsfState,
  presentationMagnetizationAt,
  presentationReceivedVoltageAt,
  type ProtonExcitation,
} from './protonExcitation'
import { FID_PLAY_PLAN, type PlayPlan } from '../../playback/playPlan'

const START_X = 40
const END_X = 420
const ZERO_Y = 162
const VOLTAGE_SCALE = 92

export function VoltageTrace({ excitation, startedAt, plan = FID_PLAY_PLAN, onPlaceRepeatPulse,
  showLongitudinal = false, showEnvelope = false }: {
  excitation: ProtonExcitation
  startedAt: number | null
  plan?: PlayPlan
  onPlaceRepeatPulse?: (timeMilliseconds: number) => void
  showLongitudinal?: boolean
  showEnvelope?: boolean
}) {
  const pathRef = useRef<SVGPathElement>(null)
  const longitudinalRef = useRef<SVGPathElement>(null)
  const envelopeRef = useRef<SVGPathElement>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [referenceCurves, setReferenceCurves] = useState<{ voltage: string; longitudinal: string; envelope: string } | null>(null)
  const [complete, setComplete] = useState(false)
  const descriptionId = useId()
  const leadIn = plan.layoutDurationMilliseconds + plan.settleDelayMilliseconds

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    setComplete(false)
    for (const target of [path, longitudinalRef.current, envelopeRef.current]) {
      target?.setAttribute('d', '')
      target?.setAttribute('data-elapsed-ms', '0')
    }
    if (startedAt === null) return
    const state = createPresentationCsfState(excitation.fieldStrengthTesla)
    let nextSample = -leadIn
    let curve = ''
    let longitudinalCurve = ''
    let envelopeCurve = ''
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
        if (showLongitudinal || showEnvelope) {
          const m = presentationMagnetizationAt(state, excitation, startedAt + nextSample)
          // M is the actual longitudinal component, normalized to M0. The
          // positive voltage envelope is the actual transverse magnitude.
          longitudinalCurve += `${longitudinalCurve === '' ? 'M' : 'L'}${x.toFixed(2)} ${(254 - 184 * m.z).toFixed(2)} `
          envelopeCurve += `${envelopeCurve === '' ? 'M' : 'L'}${x.toFixed(2)} ${(ZERO_Y - VOLTAGE_SCALE * Math.hypot(m.x, m.y)).toFixed(2)} `
        }
        nextSample += plan.sampleIntervalMilliseconds
      }
      path.setAttribute('d', curve)
      path.setAttribute('data-elapsed-ms', String(elapsed))
      for (const [target, data] of [[longitudinalRef.current, longitudinalCurve], [envelopeRef.current, envelopeCurve]] as const) {
        target?.setAttribute('d', data)
        target?.setAttribute('data-elapsed-ms', String(elapsed))
      }
      if (elapsed < plan.durationMilliseconds) frame = requestAnimationFrame(animate)
      else setComplete(true)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [excitation, startedAt, plan, leadIn, showLongitudinal, showEnvelope])

  const timeTicks = Array.from({ length: 7 }, (_, index) => index / 6 * plan.durationMilliseconds / 1000)
  const timeX = (milliseconds: number) => START_X + (milliseconds + leadIn) / (plan.durationMilliseconds + leadIn) * (END_X - START_X)
  const cursorX = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    // Match xMidYMin meet, including the horizontal letterbox on tall screens.
    const scale = Math.min(rect.width / 440, rect.height / 310)
    if (scale <= 0) return null
    const x = (event.clientX - rect.left - (rect.width - 440 * scale) / 2) / scale
    const y = (event.clientY - rect.top) / scale
    return x >= START_X && x <= END_X && y >= 0 && y <= 276 ? x : null
  }
  const placePulse = (event: MouseEvent<SVGSVGElement>) => {
    if (!onPlaceRepeatPulse || startedAt === null) return
    const x = cursorX(event)
    if (x === null || x <= timeX(0)) return
    const time = (x - START_X) / (END_X - START_X) * (plan.durationMilliseconds + leadIn) - leadIn
    // Stay after the fixed excitation and leave one sample after the new pulse.
    const snappedTime = Math.max(plan.sampleIntervalMilliseconds, Math.min(
      plan.durationMilliseconds - plan.sampleIntervalMilliseconds,
      Math.round(time / plan.sampleIntervalMilliseconds) * plan.sampleIntervalMilliseconds,
    ))
    setReferenceCurves(previous => previous ?? {
      voltage: pathRef.current?.getAttribute('d') ?? '',
      longitudinal: longitudinalRef.current?.getAttribute('d') ?? '',
      envelope: envelopeRef.current?.getAttribute('d') ?? '',
    })
    onPlaceRepeatPulse(snappedTime)
  }

  const graph = (longitudinal: boolean) => (
    <div className={`voltage-trace${longitudinal ? ' voltage-trace--longitudinal' : ''}`}>
      <svg viewBox="0 0 440 310" preserveAspectRatio="xMidYMin meet" role="img"
        aria-label={longitudinal ? 'Longitudinal magnetization over time' : 'Induced voltage over time'}
        aria-describedby={`${descriptionId}-${longitudinal}`}
        onMouseMove={event => setHoverX(cursorX(event))} onMouseLeave={() => setHoverX(null)}
        onClick={placePulse}>
        <desc id={`${descriptionId}-${longitudinal}`}>
          {longitudinal ? 'Longitudinal magnetization normalized to its equilibrium value, from the simulated proton state.'
            : 'Induced voltage on a relative scale, using the same slowed precession as the magnet and voltmeter.'}
          Negative time records the lead-in before the pulse at t=0; time is in seconds.
          {onPlaceRepeatPulse ? ' Click after t=0 to place or move a repeat pulse and replay. The repeat pulse applies only the additional angle needed to return the current magnetization to the transverse plane, preserving its length and phase. This idealized instantaneous pulse can still produce a voltage step. The original trace stays dimmed for comparison.' : ''}
        </desc>
        <g className="voltage-trace__grid">
          {[70, ZERO_Y, 254].map(y => <line key={y} x1="34" x2="426" y1={y} y2={y} />)}
          {timeTicks.slice(1).map(second => {
            const x = timeX(second * 1000)
            return <line key={second} x1={x} x2={x} y1="54" y2="271" />
          })}
        </g>
        <path className="voltage-trace__axis" d="M34 54 V276 H428 M29 63 L34 54 L39 63 M419 271 L428 276 L419 281" />
        <text className="voltage-trace__label" x="-18" y="42">{longitudinal ? 'M' : 'Volts'}</text>
        <text className="voltage-trace__label" x="427" y="260">t</text>
        <text className="voltage-trace__tick" x="26" y={longitudinal ? 260 : 168} textAnchor="end">0</text>
        {longitudinal ? <text className="voltage-trace__tick" x="26" y="76" textAnchor="end">1</text> : null}
        {timeTicks.map(second => (
          <text className="voltage-trace__tick" key={second}
            x={timeX(second * 1000)} y="300" textAnchor="middle">{Number(second.toFixed(2))}</text>
        ))}
        {referenceCurves !== null ? <path className="voltage-trace__signal voltage-trace__signal--reference"
          data-testid={longitudinal ? 'magnetization-trace-reference' : 'voltage-trace-reference'}
          d={longitudinal ? referenceCurves.longitudinal : referenceCurves.voltage} /> : null}
        <path className="voltage-trace__signal" data-testid={longitudinal ? 'magnetization-trace-signal' : 'voltage-trace-signal'}
          ref={longitudinal ? longitudinalRef : pathRef} />
        {!longitudinal && showEnvelope ? <>
          {referenceCurves ? <path className="voltage-trace__envelope voltage-trace__signal--reference" d={referenceCurves.envelope} /> : null}
          <path className="voltage-trace__envelope" data-testid="voltage-trace-envelope" ref={envelopeRef} />
        </> : null}
        {plan.events.map((event, index) => (
          <g key={index} transform={`translate(${timeX(event.timeMilliseconds)} 0)`}
            role="img" aria-label={`${event.label} RF pulse at ${event.timeMilliseconds / 1000} s${longitudinal ? ' on magnetization graph' : ''}`}>
            <line className="voltage-trace__pulse-line" x1="0" x2="0" y1="43" y2="276" />
            {!longitudinal ? <>
              <path className="voltage-trace__tag" d="M-14 5 H14 V32 L0 44 L-14 32Z" />
              <path className="voltage-trace__rf-symbol" d="M-7 13 Q2 20 -7 27 M0 10 Q12 20 0 30" />
            </> : null}
          </g>
        ))}
        {hoverX !== null ? <line className="voltage-trace__hover" data-testid={longitudinal ? 'magnetization-trace-hover' : 'voltage-trace-hover'}
          x1={hoverX} x2={hoverX} y1="44" y2="276" /> : null}
        {showEnvelope && complete ? <text className="voltage-trace__identity" x="414" y="37" textAnchor="end"
          data-testid={longitudinal ? 'magnetization-trace-identity' : 'voltage-trace-identity'}>
          T<tspan baselineShift="sub" fontSize="22">{longitudinal ? '1' : '2'}</tspan>
        </text> : null}
      </svg>
    </div>
  )

  return <>{graph(false)}{showLongitudinal ? graph(true) : null}</>
}
