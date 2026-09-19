import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MagneticFieldBackdrop } from '../components/MagneticFieldBackdrop'
import { ProtonSphere } from '../components/ProtonSphere'
import { FlickingHand } from './howWeMeasure/FlickingHand'
import { SpinningTopGraphic } from './howWeMeasure/SpinningTopGraphic'
import { ReceiveCoil } from './howWeMeasure/ReceiveCoil'
import { VoltageTrace } from './howWeMeasure/VoltageTrace'
import { FID_PLAY_PLAN } from '../playback/playPlan'
import { usePlayPlan } from '../playback/usePlayPlan'
import type { RfPulseEvent } from '../../simulation/fid'
import { FLICK_CONTACT_MS, FLICK_DURATION_MS } from './howWeMeasure/flickTiming'
import { RfRemote, RfWavefront, RF_WAVE_DURATION_MS, RF_WAVE_TRAVEL_MS, type RfWave } from './howWeMeasure/RfRemote'
import './howWeMeasure/how-we-measure.css'
import type { PresentationSlideModule, SlideStateProps } from './types'

function HowWeMeasureSlide({
  fieldStrengthTesla,
  stateIndex,
}: SlideStateProps) {
  const [flickSequence, setFlickSequence] = useState(0)
  const [isFlicking, setIsFlicking] = useState(false)
  const [manualPulses, setManualPulses] = useState<RfPulseEvent[]>([])
  const [wave, setWave] = useState<RfWave | null>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const antennaRef = useRef<SVGCircleElement>(null)
  const showRemote = stateIndex >= 3
  const showTrace = stateIndex >= 5
  const [repeatPulse, setRepeatPulse] = useState<{ time: number; revision: number } | null>(null)
  const tracePlan = useMemo(() => repeatPulse ? {
    ...FID_PLAY_PLAN,
    events: [...FID_PLAY_PLAN.events, {
      type: 'rf-pulse' as const, kind: '90-y' as const,
      timeMilliseconds: repeatPulse.time, label: 'Recovered 90°',
      spoilTransverseBeforePulse: true,
    }],
  } : FID_PLAY_PLAN, [repeatPulse])
  const [renderControls, setRenderControls] = useState(!showTrace)
  const playback = usePlayPlan(tracePlan, showTrace, fieldStrengthTesla)
  const showTop = stateIndex >= 1 && !showRemote
  const [renderTop, setRenderTop] = useState(showTop)
  const showHand = stateIndex >= 2
  const excitation = useMemo(() => showRemote ? {
    fieldStrengthTesla,
    pulseEvents: fieldStrengthTesla > 0
      ? (showTrace ? playback?.pulseEvents ?? [] : manualPulses) : [],
  } : undefined, [showRemote, showTrace, fieldStrengthTesla, manualPulses, playback])

  useEffect(() => {
    setRepeatPulse(null)
  }, [showTrace, fieldStrengthTesla])

  useEffect(() => {
    setIsFlicking(false)
    setFlickSequence(0)
    setWave(null)
    setManualPulses([])
  }, [showRemote])

  useEffect(() => {
    if (!showTrace) {
      setRenderControls(true)
      return
    }
    // This next demonstration is a fresh acquisition from equilibrium, so the
    // first recorded pulse is a 90-degree flip regardless of earlier flicks.
    setIsFlicking(false)
    setManualPulses([])
    setWave(null)
    const exitTimer = window.setTimeout(() => setRenderControls(false), FID_PLAY_PLAN.layoutDurationMilliseconds)
    return () => {
      window.clearTimeout(exitTimer)
    }
  }, [showTrace, fieldStrengthTesla])

  useEffect(() => {
    if (showTop) {
      setRenderTop(true)
      return
    }
    const timer = window.setTimeout(() => setRenderTop(false), 720)
    return () => window.clearTimeout(timer)
  }, [showTop])

  useEffect(() => {
    if (!isFlicking || showTrace) return
    const rechargeTimer = window.setTimeout(() => setIsFlicking(false), FLICK_DURATION_MS)
    if (!showRemote) return () => window.clearTimeout(rechargeTimer)

    const contactTimer = window.setTimeout(() => {
      const scene = sceneRef.current?.getBoundingClientRect()
      const antenna = antennaRef.current?.getBoundingClientRect()
      const proton = sceneRef.current?.querySelector('.how-we-measure__proton')?.getBoundingClientRect()
      if (!scene || !antenna || !proton) return
      const x = antenna.x + antenna.width / 2 - scene.x
      const y = antenna.y + antenna.height / 2 - scene.y
      const distance = Math.hypot(proton.x + proton.width / 2 - scene.x - x,
        proton.y + proton.height / 2 - scene.y - y)
      setWave({ sequence: performance.now(), x, y,
        radius: distance * RF_WAVE_DURATION_MS / RF_WAVE_TRAVEL_MS })
    }, FLICK_CONTACT_MS)
    const excitationTimer = window.setTimeout(() => {
      if (fieldStrengthTesla > 0) {
        const timeMilliseconds = performance.now()
        setManualPulses(pulses => [...pulses, { timeMilliseconds, kind: '90-y' }])
      }
    }, FLICK_CONTACT_MS + RF_WAVE_TRAVEL_MS)
    return () => {
      window.clearTimeout(rechargeTimer)
      window.clearTimeout(contactTimer)
      window.clearTimeout(excitationTimer)
    }
  }, [isFlicking, showRemote, showTrace, fieldStrengthTesla])

  const flick = () => {
    if (isFlicking || showTrace) return
    setIsFlicking(true)
    if (showRemote) setWave(null)
    if (!showRemote) setFlickSequence((sequence) => sequence + 1)
  }

  return (
    <div className={`how-we-measure-scene${showRemote ? ' how-we-measure-scene--remote' : ''}${showTrace ? ' how-we-measure-scene--trace' : ''}`} ref={sceneRef}
      style={{ '--measurement-layout-duration': `${FID_PLAY_PLAN.layoutDurationMilliseconds}ms` } as CSSProperties}>
      <MagneticFieldBackdrop
        className="how-we-measure__field"
        fieldStrengthTesla={fieldStrengthTesla}
      />

      <ProtonSphere
        ariaLabel="Proton sphere with net magnetization"
        className={`how-we-measure__proton${showTop ? ' how-we-measure__proton--replaced' : ''}`}
        orientation="up"
        showCone={false}
        showNetMagnet={fieldStrengthTesla > 0}
        excitation={excitation}
      />

      {renderTop ? <div className={`how-we-measure__top${showTop ? '' : ' how-we-measure__top--replaced'}`} aria-hidden={!showTop}>
        <SpinningTopGraphic flickSequence={flickSequence} />
      </div> : null}
      {showRemote && renderControls ? <>
        <RfRemote onFlick={flick} disabled={isFlicking || showTrace} transmitting={isFlicking && wave !== null} antennaRef={antennaRef} />
        <RfWavefront wave={wave} />
      </> : null}
      {showHand && renderControls ? (
        <FlickingHand isFlicking={isFlicking} onFlick={flick} disabled={showTrace}
          ariaLabel={showRemote ? 'Flick the remote control button' : undefined} />
      ) : null}
      {stateIndex >= 4 && excitation ? <ReceiveCoil excitation={excitation} /> : null}
      {showTrace && excitation ? <VoltageTrace key={fieldStrengthTesla}
        excitation={excitation} startedAt={playback?.startedAt ?? null} plan={tracePlan}
        onPlaceRepeatPulse={time => setRepeatPulse(previous => ({ time, revision: (previous?.revision ?? 0) + 1 }))} /> : null}
    </div>
  )
}

export const howWeMeasureSlideModule: PresentationSlideModule = {
  id: 'how-we-measure',
  heading: 'How are we measuring?',
  stateCount: 6,
  Component: HowWeMeasureSlide,
}
