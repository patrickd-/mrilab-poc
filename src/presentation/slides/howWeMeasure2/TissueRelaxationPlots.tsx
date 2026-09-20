import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import type { SamplePresetId } from '../../../models/HydrogenEnsemble'
import type { FidEnsembleState } from '../../../simulation/fid'
import { csfCollectionAt } from './csfDephasing'
import { realTimeClock, type PlaybackClock } from '../../playback/simulationClock'
import { comparisonSampleTimes, tissueRelaxationAt, PRE_RF_SAMPLE_TIME_MS, zoomComparisonWindow, TISSUE_COMPARISON_PLAN, type ComparisonTissue } from './tissueComparison'

const LEFT = 40
const ZERO_Y = 254
const SCALE_Y = 184
const HEIGHT = 310

export function TissueRelaxationPlots({ tissues, startedAt, highlighted, entering, csfOnly = false, ensembleStates, showIntrinsicReference = false, clock = realTimeClock }: {
  tissues: readonly ComparisonTissue[]
  startedAt: number | null
  highlighted: SamplePresetId | null
  entering: boolean
  csfOnly?: boolean
  ensembleStates?: readonly FidEnsembleState[]
  showIntrinsicReference?: boolean
  clock?: PlaybackClock
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const paths = useRef<Record<string, SVGPathElement | null>>({})
  const [width, setWidth] = useState(620)
  const [hoverFraction, setHoverFraction] = useState<number | null>(null)
  const descriptionId = useId()
  const plan = TISSUE_COMPARISON_PLAN
  const [timeWindow, setTimeWindow] = useState(plan.durationMilliseconds)
  const leadIn = plan.layoutDurationMilliseconds + plan.settleDelayMilliseconds
  const right = width - 20
  const timeX = (time: number) => LEFT + (time + timeWindow * 0.08) / (timeWindow * 1.08) * (right - LEFT)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const zoom = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('svg')) return
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1)
      setTimeWindow(current => zoomComparisonWindow(current, delta))
    }
    container.addEventListener('wheel', zoom, { passive: false })
    return () => container.removeEventListener('wheel', zoom)
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const rect = svg.getBoundingClientRect()
      if (rect.height > 0) setWidth(Math.max(440, rect.width / rect.height * HEIGHT))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const activeTissues = csfOnly ? tissues.filter(tissue => tissue.id === 'cerebrospinal-fluid') : tissues
    const activeKeys = new Set(activeTissues.flatMap(tissue => [`${tissue.id}-signal`, `${tissue.id}-longitudinal`]))
    activeKeys.add('intrinsic-reference')
    Object.entries(paths.current).forEach(([key, path]) => { if (activeKeys.has(key)) path?.setAttribute('d', '') })
    if (startedAt === null) return
    const times = [...new Set([...comparisonSampleTimes(tissues), -timeWindow * 0.08, timeWindow])].sort((a, b) => a - b)
    const curves: Record<string, string> = {}
    let index = 0
    let frame = 0
    const animate = () => {
      const elapsed = Math.max(-leadIn, Math.min(plan.durationMilliseconds, clock.now() - startedAt))
      while (index < times.length && times[index] <= elapsed) {
        const time = times[index++]
        for (const tissue of activeTissues) {
          const intrinsic = tissueRelaxationAt(tissue, startedAt + time)
          const m = ensembleStates && tissue.id === 'cerebrospinal-fluid'
            ? csfCollectionAt(ensembleStates, tissue.excitation, startedAt + time) : intrinsic
          for (const kind of ['signal', 'longitudinal'] as const) {
            if (time < -timeWindow * 0.08 || time > timeWindow) continue
            // The left-hand limit and post-RF value share exactly x(t=0),
            // since the pulse is instantaneous.
            const plotTime = time === PRE_RF_SAMPLE_TIME_MS ? 0 : time
            const x = LEFT + (plotTime + timeWindow * 0.08) / (timeWindow * 1.08) * (right - LEFT)
            const key = `${tissue.id}-${kind}`
            curves[key] = (curves[key] ?? '') + `${curves[key] ? 'L' : 'M'}${x.toFixed(3)} ${(ZERO_Y - SCALE_Y * m[kind]).toFixed(3)} `
            if (showIntrinsicReference && kind === 'signal') {
              const key = 'intrinsic-reference'
              curves[key] = (curves[key] ?? '') + `${curves[key] ? 'L' : 'M'}${x.toFixed(3)} ${(ZERO_Y - SCALE_Y * intrinsic.signal).toFixed(3)} `
            }
          }
        }
      }
      for (const [key, path] of Object.entries(paths.current)) {
        if (!activeKeys.has(key)) continue
        path?.setAttribute('d', curves[key] ?? '')
        path?.setAttribute('data-elapsed-ms', String(elapsed))
      }
      if (elapsed < plan.durationMilliseconds && !clock.paused) frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [tissues, startedAt, leadIn, right, plan, timeWindow, csfOnly, ensembleStates, showIntrinsicReference, clock, clock.paused])

  const hover = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = Math.min(rect.width / width, rect.height / HEIGHT)
    if (scale <= 0) return
    const x = (event.clientX - rect.left - (rect.width - width * scale) / 2) / scale
    const y = (event.clientY - rect.top) / scale
    setHoverFraction(x >= LEFT && x <= right && y >= 44 && y <= ZERO_Y
      ? (x - LEFT) / (right - LEFT) : null)
  }

  const unitScale = timeWindow < 2000 ? 1 : 1000
  const roughStep = timeWindow / 6
  const power = 10 ** Math.floor(Math.log10(roughStep))
  const step = [1, 2, 5, 10].find(value => value * power >= roughStep)! * power
  const ticks = Array.from({ length: Math.floor(timeWindow / step) + 1 }, (_, index) => index * step)

  return <div className="tissue-plots" ref={containerRef} tabIndex={0}
    aria-label="Tissue comparison graphs. Scroll or press plus and minus to zoom time; press zero to reset zoom."
    onKeyDown={event => {
      if (event.key === '+' || event.key === '=' || event.key === '-') {
        event.preventDefault()
        setTimeWindow(current => zoomComparisonWindow(current, event.key === '-' ? 100 : -100))
      } else if (event.key === '0') setTimeWindow(plan.durationMilliseconds)
    }}>
    {(['signal', 'longitudinal'] as const).map(kind => {
      return <div className={`tissue-plot tissue-plot--${kind}`} key={kind}>
      <svg ref={kind === 'signal' ? svgRef : undefined} viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="xMidYMin meet" role="img" aria-label={kind === 'signal' ? 'Tissue transverse signal over time' : 'Tissue longitudinal magnetization over time'}
        aria-describedby={`${descriptionId}-${kind}`} data-time-window-ms={timeWindow}
        onMouseMove={hover} onMouseLeave={() => setHoverFraction(null)}>
        <desc id={`${descriptionId}-${kind}`}>
          Equal-volume CSF, cortical bone, white matter and gray matter on a common scale relative to CSF equilibrium magnetization.
          {unitScale === 1 ? 'Time is in milliseconds.' : 'Time is in seconds.'} Both time axes zoom together without restarting the simulation.
          All receive the same 90 degree pulse at zero. Hover or focus a tissue sphere to highlight its curves. RF timing is not editable.
          {showIntrinsicReference ? 'The observed T2-star signal is the magnitude of the summed ensemble vectors; the dim curve is intrinsic CSF T2.' : ''}
        </desc>
        <g className="voltage-trace__grid">
          {[70, 162, ZERO_Y].map(y => <line key={y} x1="34" x2={right + 6} y1={y} y2={y} />)}
          {ticks.slice(1).map(time => <line key={time} x1={timeX(time)} x2={timeX(time)} y1="54" y2={ZERO_Y} />)}
        </g>
        <path className="voltage-trace__axis" d={`M34 54 V${ZERO_Y} H${right + 8} M29 63 L34 54 L39 63 M${right - 1} ${ZERO_Y - 5} L${right + 8} ${ZERO_Y} L${right - 1} ${ZERO_Y + 5}`} />
        <text className="tissue-plot__identity" x="-18" y="42">T<tspan dy="4" fontSize="22">{kind === 'signal' ? '2' : '1'}</tspan>{kind === 'signal' && showIntrinsicReference ? <tspan dy="-12" fontSize="20">*</tspan> : null}</text>
        <text className="tissue-plot__time-unit" x={right} y="239" textAnchor="end">t ({unitScale === 1 ? 'ms' : 's'})</text>
        <text className="voltage-trace__tick" x="26" y="260" textAnchor="end">0</text>
        <text className="voltage-trace__tick" x="26" y="76" textAnchor="end">1</text>
        {ticks.map(time => <text key={time} className="voltage-trace__tick" x={timeX(time)} y="282" textAnchor="middle">{Number((time / unitScale).toPrecision(4))}</text>)}
        {kind === 'signal' && showIntrinsicReference ? <path ref={path => { paths.current['intrinsic-reference'] = path }}
          className="tissue-plot__curve" data-testid="csf-intrinsic-reference" stroke={tissues[0].color} opacity="0.25" /> : null}
        {tissues.map(tissue => <path key={tissue.id}
          ref={path => { paths.current[`${tissue.id}-${kind}`] = path }}
          className="tissue-plot__curve" data-testid={`${tissue.id}-${kind}`} data-tissue={tissue.id}
          stroke={tissue.color} opacity={csfOnly && tissue.id !== 'cerebrospinal-fluid' ? 0 : highlighted && highlighted !== tissue.id ? 0.16 : 1} />)}
        <g transform={`translate(${timeX(0)} 0)`} aria-label="90° RF pulse at 0 s">
          <line className="voltage-trace__pulse-line" x1="0" x2="0" y1="43" y2={ZERO_Y} />
          {kind === 'signal' ? <>
            <path className="voltage-trace__tag" d="M-14 5 H14 V32 L0 44 L-14 32Z" />
            <path className="voltage-trace__rf-symbol" d="M-7 13 Q2 20 -7 27 M0 10 Q12 20 0 30" />
          </> : null}
        </g>
        {hoverFraction !== null ? <line className="voltage-trace__hover" data-testid={`tissue-${kind}-hover`}
          x1={LEFT + hoverFraction * (right - LEFT)} x2={LEFT + hoverFraction * (right - LEFT)} y1="44" y2={ZERO_Y} /> : null}
        {entering && kind === 'signal' ? <path className="tissue-plot__outgoing-voltage" d={`M${LEFT} 162 H${timeX(0)}`} /> : null}
      </svg>
    </div>})}
  </div>
}
