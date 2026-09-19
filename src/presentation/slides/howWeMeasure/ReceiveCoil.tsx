import { useEffect, useId, useRef } from 'react'
import {
  createPresentationCsfState,
  presentationReceivedVoltageAt,
  type ProtonExcitation,
} from './protonExcitation'

const NEEDLE_MAX_ANGLE = 75
const COIL_PATH = 'M40 232 ' + Array.from({ length: 7 }, (_, turn) => {
  const x = 40 + turn * 18
  return `C${x - 23} 232 ${x - 23} 114 ${x} 114 C${x + 23} 114 ${x + 23} 232 ${x + 18} 232`
}).join(' ')

export function ReceiveCoil({ excitation }: { excitation: ProtonExcitation }) {
  const needleRef = useRef<SVGGElement>(null)
  const descriptionId = useId()

  useEffect(() => {
    const needle = needleRef.current
    if (!needle) return
    const state = createPresentationCsfState(excitation.fieldStrengthTesla)
    const lastPulse = excitation.pulseEvents.at(-1)?.timeMilliseconds
    const settlesAt = lastPulse === undefined ? 0 : lastPulse +
      state.transverseRelaxationTimeMilliseconds * Math.log(1e4)
    let frame = 0
    const animate = () => {
      const now = performance.now()
      const active = lastPulse !== undefined && excitation.fieldStrengthTesla > 0 && now < settlesAt
      const voltage = active ? presentationReceivedVoltageAt(state, excitation, now) : 0
      needle.setAttribute('transform', `rotate(${voltage * NEEDLE_MAX_ANGLE} 390 252)`)
      needle.setAttribute('data-relative-voltage', String(voltage))
      if (active) frame = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [excitation])

  return (
    <svg className="receive-coil" viewBox="0 0 540 370" role="img"
      aria-label="Copper receive coil connected to a center-zero analog voltmeter"
      aria-describedby={descriptionId}>
      <desc id={descriptionId}>
        The needle shows relative induced voltage, synchronized with the proton's
        precession. Its deflection decays with the CSF transverse magnetization.
        Zero is at the center; the scale is not calibrated in volts.
      </desc>

      {/* Both ends of one continuous winding connect to the meter terminals. */}
      <path d="M40 232 V331 Q40 357 66 357 H350 V337"
        fill="none" stroke="#be713c" strokeWidth="7" strokeLinecap="round" />
      <path d="M166 232 H191 Q209 232 209 252 V345 Q209 367 231 367 H430 V337"
        fill="none" stroke="#be713c" strokeWidth="7" strokeLinecap="round" />
      <path d={COIL_PATH} fill="none" stroke="#542d1f" strokeWidth="12" strokeLinecap="round" />
      <path d={COIL_PATH} fill="none" stroke="#d38a53" strokeWidth="8" strokeLinecap="round" />
      <path d={COIL_PATH} fill="none" stroke="#ffcca0" strokeWidth="2" strokeLinecap="round"
        transform="translate(-1 -2)" />

      {/* Dark instrument enclosure and opaque ivory gauge face. */}
      <rect x="251" y="124" width="281" height="226" rx="25" fill="#0b111b" />
      <rect x="246" y="118" width="281" height="226" rx="25" fill="#304352" stroke="#8aa0ae" strokeWidth="2" />
      <rect x="260" y="136" width="253" height="166" rx="15" fill="#f7edce" stroke="#131f2b" strokeWidth="5" />
      <path d="M290 252 A100 100 0 0 1 490 252" fill="none" stroke="#514e46" strokeWidth="2" />
      {Array.from({ length: 13 }, (_, index) => {
        const angle = (-90 + index * 15) * Math.PI / 180
        const major = index % 3 === 0
        return <line key={index}
          x1={390 + Math.sin(angle) * (major ? 87 : 92)}
          y1={252 - Math.cos(angle) * (major ? 87 : 92)}
          x2={390 + Math.sin(angle) * 101} y2={252 - Math.cos(angle) * 101}
          stroke="#45433e" strokeWidth={major ? 3 : 1.5} />
      })}
      <g fill="#343c42" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="700">
        <text x="289" y="279" fontSize="29">−</text>
        <text x="490" y="279" fontSize="29">+</text>
        <text x="390" y="220" fontSize="25">V</text>
      </g>
      <g ref={needleRef} data-testid="voltmeter-needle" data-relative-voltage="0"
        transform="rotate(0 390 252)">
        <path d="M390 156 L387 254 L393 254Z" fill="#cb3831" />
        <path d="M390 254 V267" stroke="#cb3831" strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="390" cy="252" r="9" fill="#293744" stroke="#75868b" strokeWidth="3" />
      <circle cx="350" cy="337" r="9" fill="#b14d3d" stroke="#e5bca0" strokeWidth="2" />
      <circle cx="430" cy="337" r="9" fill="#17212a" stroke="#8aa0ae" strokeWidth="2" />
      <text x="389" y="325" fill="#d8e4e9" textAnchor="middle"
        fontFamily="Manrope, sans-serif" fontSize="17" letterSpacing="2">VOLTMETER</text>
    </svg>
  )
}
