import { useEffect, useRef } from 'react'
import { contrastLabel, validContrastTiming, type ContrastTiming } from './contrastModel'
import { MRI_MAP_SIZE, MRI_TISSUE_MAPS, renderMriPixels } from './mriImage'

export function MriContrastImage({ timing }: { timing: ContrastTiming }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const figureRef = useRef<HTMLElement>(null)
  useEffect(() => {
    for (const animation of figureRef.current?.getAnimations?.() ?? []) {
      if (animation.pending && animation.playState === 'running' && animation.startTime === null) animation.startTime = document.timeline.currentTime
    }
  }, [])
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    const image = context.createImageData(MRI_MAP_SIZE.width, MRI_MAP_SIZE.height)
    image.data.set(renderMriPixels(MRI_TISSUE_MAPS, timing))
    context.putImageData(image, 0, 0)
  }, [timing])
  const label = contrastLabel(timing)
  return <figure ref={figureRef} className="contrast-image" data-tr-ms={timing.tr ?? ''} data-te-ms={timing.te ?? ''}>
    <canvas ref={ref} width={MRI_MAP_SIZE.width} height={MRI_MAP_SIZE.height} role="img"
      aria-label={`${label}: synthetic MRI slice`} />
    <figcaption>
      <strong data-testid="contrast-image-label">{label}</strong>
      <div className="contrast-image__timing"><span>TR {timing.tr === null ? '—' : `${Math.round(timing.tr)} ms`}</span><span>TE {timing.te === null ? '—' : `${Number(timing.te.toFixed(1))} ms`}</span></div>
      <small>{validContrastTiming(timing) ? 'Synthetic tissue-model estimates' : 'The echo must precede the next excitation.'}</small>
    </figcaption>
  </figure>
}
