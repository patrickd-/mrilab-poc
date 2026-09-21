import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { PRE_RF_SAMPLE_TIME_MS } from '../howWeMeasure2/tissueComparison'
import { contrastTissueAt, type ContrastTiming, type ContrastTissue } from './contrastModel'

const LEFT = 40, BOTTOM = 254, HEIGHT = 310, TOP = 70
const WAVE = 'M-7 13 Q2 20 -7 27 M0 10 Q12 20 0 30'

function PulseTag({ x, tagX = x, yellow = false, label, title }: { x: number; tagX?: number; yellow?: boolean; label?: string; title: string }) {
  return <g transform={`translate(${x} 0)`} className={yellow ? 'contrast-marker contrast-marker--yellow' : 'contrast-marker'} aria-label={title}>
    <line className="voltage-trace__pulse-line" x1="0" x2="0" y1={tagX === x ? 43 : 54} y2={BOTTOM} />
    {tagX !== x ? <path className="voltage-trace__pulse-line" fill="none" d={`M${tagX - x} 44 L0 54`} /> : null}
    <g transform={`translate(${tagX - x} 0)`}>
    <path className="voltage-trace__tag" d={label ? 'M-19 5 H19 V32 L0 44 L-19 32Z' : 'M-14 5 H14 V32 L0 44 L-14 32Z'} />
    {label ? <text x="0" y="27" textAnchor="middle">{label}</text> : <path className="voltage-trace__rf-symbol" d={WAVE} />}
    </g>
  </g>
}

function ContrastPlot({ kind, tissues, timing, onChange, hoverTime, onHover, highlighted }: {
  kind: 'signal' | 'longitudinal'; tissues: readonly ContrastTissue[]; timing: ContrastTiming
  onChange: (timing: ContrastTiming) => void; hoverTime: number | null; onHover: (time: number | null) => void
  highlighted: string | null
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(620)
  const initialWindow = kind === 'signal' ? 400 : 6000
  const [timeWindow, setTimeWindow] = useState(initialWindow)
  const right = width - 20
  const timeX = (time: number) => LEFT + (time / timeWindow + 0.08) / 1.08 * (right - LEFT)
  const zoom = (current: number, delta: number) => Math.max(1, Math.min(12000, current * Math.exp(Math.max(-300, Math.min(300, delta)) * 0.004)))
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const rect = svg.getBoundingClientRect()
      if (rect.height > 0) setWidth(Math.max(440, rect.width / rect.height * HEIGHT))
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1)
      setTimeWindow(current => zoom(current, delta))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(svg)
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => { observer?.disconnect(); svg.removeEventListener('wheel', wheel) }
  }, [])

  const curves = useMemo(() => {
    const times = new Set([-timeWindow * 0.08, PRE_RF_SAMPLE_TIME_MS, 0, timeWindow])
    for (let i = 1; i < 600; i++) times.add(timeWindow * i / 600)
    // Resolve cortical bone's submillisecond decay and each instantaneous RF event.
    for (const tissue of tissues) {
      for (let i = 1; i <= 100; i++) times.add(tissue.state.transverseRelaxationTimeMilliseconds * i / 10)
    }
    if (timing.te !== null) {
      times.add(timing.te / 2 + PRE_RF_SAMPLE_TIME_MS); times.add(timing.te / 2); times.add(timing.te)
    }
    if (timing.tr !== null) times.add(timing.tr)
    const ordered = [...times].filter(t => t >= -timeWindow * 0.08 && t <= timeWindow).sort((a, b) => a - b)
    return tissues.map(tissue => ({ id: tissue.id, color: tissue.color, path: ordered.map((time, index) => {
      const value = contrastTissueAt(tissue, time, timing)[kind]
      const plotTime = time === PRE_RF_SAMPLE_TIME_MS ? 0 : time
      const x = LEFT + (plotTime / timeWindow + 0.08) / 1.08 * (width - 60)
      return `${index ? 'L' : 'M'}${x.toFixed(3)} ${(BOTTOM - (BOTTOM - TOP) * value).toFixed(3)}`
    }).join(' ') }))
  }, [tissues, timing, kind, timeWindow, width])

  const timeAt = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = Math.min(rect.width / width, rect.height / HEIGHT)
    if (scale <= 0) return null
    const x = (event.clientX - rect.left - (rect.width - width * scale) / 2) / scale
    return Math.max(0, Math.min(timeWindow, ((x - LEFT) / (right - LEFT) * 1.08 - 0.08) * timeWindow))
  }
  const unitScale = timeWindow < 2000 ? 1 : 1000
  const roughStep = timeWindow / 6
  const power = 10 ** Math.floor(Math.log10(roughStep))
  const step = [1, 2, 5, 10].find(value => value * power >= roughStep)! * power
  const ticks = Array.from({ length: Math.floor(timeWindow / step) + 1 }, (_, index) => index * step)
  const selected = kind === 'signal' ? timing.te : timing.tr
  // Keep short-TE annotations readable without shifting their actual timing lines.
  const refocusTagX = timing.te === null ? 0 : Math.max(timeX(timing.te / 2), timeX(0) + 36)
  const echoLabelX = timing.te === null ? 0 : Math.min(right - 14, Math.max(timeX(timing.te), refocusTagX + 34))
  const inView = (time: number | null): time is number => time !== null && time <= timeWindow

  return <div className={`tissue-plot tissue-plot--${kind}`}>
    <svg ref={svgRef} className="contrast-plot" viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="xMidYMin meet"
      role="img" tabIndex={0} aria-label={kind === 'signal' ? 'T2 signal: click to set TE' : 'T1 recovery: click to set TR'}
      data-testid={`contrast-${kind}-plot`} data-time-window-ms={timeWindow} data-ensemble-count={tissues.reduce((n, t) => n + t.ensembles.length, 0)}
      onMouseMove={event => onHover(timeAt(event))} onMouseLeave={() => onHover(null)}
      onClick={event => {
        const time = timeAt(event)
        if (time === null) return
        onChange({ ...timing, [kind === 'signal' ? 'te' : 'tr']: time <= 1e-6 ? null : time })
      }}
      onKeyDown={event => {
        if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); setTimeWindow(current => zoom(current, event.key === '-' ? 100 : -100)) }
        else if (event.key === '0') setTimeWindow(initialWindow)
        else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onChange({ ...timing, [kind === 'signal' ? 'te' : 'tr']: null }) }
      }}>
      <desc>All curves are evaluated immediately from six ensembles per tissue. Scroll to zoom this time axis.
        Click to set {kind === 'signal' ? 'echo time TE; the refocusing pulse follows at TE/2.' : 'repetition time TR, selecting the available longitudinal recovery before excitation.'}
        Click at zero or press Delete to clear this timing. Unset TR means full recovery; unset TE means zero echo delay.
        Transverse curves include field-offset dephasing; longitudinal curves show the independent saturation-recovery preparation.</desc>
      <g className="voltage-trace__grid">
        {[TOP, 162, BOTTOM].map(y => <line key={y} x1="34" x2={right + 6} y1={y} y2={y} />)}
        {ticks.slice(1).map(time => <line key={time} x1={timeX(time)} x2={timeX(time)} y1="54" y2={BOTTOM} />)}
      </g>
      <path className="voltage-trace__axis" d={`M34 54 V${BOTTOM} H${right + 8} M29 63 L34 54 L39 63 M${right - 1} ${BOTTOM - 5} L${right + 8} ${BOTTOM} L${right - 1} ${BOTTOM + 5}`} />
      <text className="tissue-plot__identity" x="-18" y="42">T<tspan dy="4" fontSize="22">{kind === 'signal' ? '2' : '1'}</tspan></text>
      <text className="tissue-plot__time-unit" x={right} y="239" textAnchor="end">t ({unitScale === 1 ? 'ms' : 's'})</text>
      <text className="voltage-trace__tick" x="26" y="260" textAnchor="end">0</text>
      <text className="voltage-trace__tick" x="26" y="76" textAnchor="end">1</text>
      {ticks.map(time => <text key={time} className="voltage-trace__tick" x={timeX(time)} y="282" textAnchor="middle">{Number((time / unitScale).toPrecision(4))}</text>)}
      {curves.map(curve => <path key={curve.id} className="tissue-plot__curve" data-testid={`contrast-${curve.id}-${kind}`}
        stroke={curve.color} opacity={highlighted && highlighted !== curve.id ? 0.16 : 1} d={curve.path} />)}
      {kind === 'signal' ? <>
        <PulseTag x={timeX(0)} title="90° excitation at zero" />
        {inView(timing.te === null ? null : timing.te / 2) ? <g data-testid="contrast-refocus-marker" data-time-ms={timing.te! / 2}>
          <PulseTag x={timeX(timing.te! / 2)} tagX={refocusTagX} yellow title={`180° refocusing pulse at ${timing.te! / 2} ms`} />
        </g> : null}
      </> : null}
      {inView(selected) ? kind === 'signal'
        ? <g className="contrast-echo-marker" transform={`translate(${timeX(selected)} 0)`} data-testid="contrast-te-marker" data-time-ms={selected}>
          <line x1="0" x2="0" y1="43" y2={BOTTOM} />
          {echoLabelX !== timeX(selected) ? <line x1={echoLabelX - timeX(selected)} x2="0" y1="34" y2="43" /> : null}
          <text x={echoLabelX - timeX(selected)} y="28" textAnchor="middle">TE</text>
        </g>
        : <g data-testid="contrast-tr-marker" data-time-ms={selected}><PulseTag x={timeX(selected)} label="TR" title={`Repetition time ${selected} ms`} /></g>
        : null}
      {inView(selected) ? tissues.map(tissue => <circle key={tissue.id} cx={timeX(selected)}
        cy={BOTTOM - (BOTTOM - TOP) * contrastTissueAt(tissue, selected, timing)[kind]} r="4" fill={tissue.color} stroke="#080d11" strokeWidth="1" />) : null}
      {inView(hoverTime) ? <line className="voltage-trace__hover" data-testid={`contrast-${kind}-hover`}
        x1={timeX(hoverTime)} x2={timeX(hoverTime)} y1="44" y2={BOTTOM} /> : null}
    </svg>
  </div>
}

export function ContrastPlots({ tissues, timing, onChange }: { tissues: readonly ContrastTissue[]; timing: ContrastTiming; onChange: (timing: ContrastTiming) => void }) {
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  return <div className="tissue-plots contrast-plots">
    {(['signal', 'longitudinal'] as const).map(kind => <ContrastPlot key={kind} kind={kind} tissues={tissues} timing={timing}
      onChange={onChange} hoverTime={hoverTime} onHover={setHoverTime} highlighted={highlighted} />)}
    <div className="contrast-legend" aria-label="Tissue colors">
      {tissues.map(tissue => <button key={tissue.id} type="button" style={{ color: tissue.color }}
        onMouseEnter={() => setHighlighted(tissue.id)} onMouseLeave={() => setHighlighted(null)}
        onFocus={() => setHighlighted(tissue.id)} onBlur={() => setHighlighted(null)}>{tissue.label}</button>)}
    </div>
  </div>
}
