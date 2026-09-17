import { useEffect, useRef } from 'react'

export const PROTON_BURST_PARTICLE_COUNT = 4_200

interface ProtonParticle {
  angle: number
  radiusFraction: number
  delayMilliseconds: number
  durationMilliseconds: number
  initialRadiusPixels: number
  targetOffsetX: number
  targetOffsetY: number
}

const PARTICLES: ReadonlyArray<ProtonParticle> = Array.from(
  { length: PROTON_BURST_PARTICLE_COUNT },
  (_, index) => ({
    angle: index * 2.399_963_229_728_653,
    radiusFraction: Math.sqrt(((index * 619) % 4_199) / 4_198),
    delayMilliseconds: 680 + ((index * 149) % 631),
    durationMilliseconds: 760 + ((index * 83) % 321),
    initialRadiusPixels: 0.8 + (index % 7) * 0.25,
    targetOffsetX: Math.sin(index * 1.73) * 1.6,
    targetOffsetY: Math.cos(index * 1.31) * 1.6,
  }),
)

function createProtonSprite() {
  const sprite = document.createElement('canvas')
  sprite.width = 96
  sprite.height = 96
  const context = sprite.getContext('2d')
  if (!context) return sprite

  const gradient = context.createRadialGradient(34, 28, 2, 48, 48, 44)
  gradient.addColorStop(0, 'rgba(240, 254, 255, 0.98)')
  gradient.addColorStop(0.12, 'rgba(157, 235, 246, 0.88)')
  gradient.addColorStop(0.58, 'rgba(85, 196, 232, 0.62)')
  gradient.addColorStop(1, 'rgba(8, 43, 58, 0.2)')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(48, 48, 44, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = 'rgba(177, 242, 250, 0.7)'
  context.lineWidth = 2
  context.stroke()

  return sprite
}

export function ProtonBurst({ animate }: { animate: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (
      !canvas ||
      !animate ||
      typeof CanvasRenderingContext2D === 'undefined'
    ) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) return

    const sprite = createProtonSprite()
    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    let width = 1
    let height = 1
    let animationFrame = 0
    const startedAt = performance.now()

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }
    resize()

    const render = (now: number) => {
      const elapsed = now - startedAt
      const originCenterX = width * 0.23
      const originCenterY = height * 0.5
      const originRadiusX = width * 0.041
      const originRadiusY = height * 0.092
      const targetX = width * 0.65
      const targetY = height * 0.5
      const targetRadius = Math.min(89, Math.max(59, width * 0.06))
      let hasActiveOrFutureParticles = false

      context.clearRect(0, 0, width, height)
      PARTICLES.forEach((particle) => {
        const localElapsed = elapsed - particle.delayMilliseconds
        if (localElapsed < 0) {
          hasActiveOrFutureParticles = true
          return
        }
        const progress = localElapsed / particle.durationMilliseconds
        if (progress >= 1) return
        hasActiveOrFutureParticles = true

        const startX =
          originCenterX +
          Math.cos(particle.angle) * originRadiusX * particle.radiusFraction
        const startY =
          originCenterY +
          Math.sin(particle.angle) * originRadiusY * particle.radiusFraction
        const x =
          startX +
          (targetX + particle.targetOffsetX - startX) * progress
        const y =
          startY +
          (targetY + particle.targetOffsetY - startY) * progress
        const radius =
          particle.initialRadiusPixels +
          (targetRadius - particle.initialRadiusPixels) * progress ** 2.25
        const fadeIn = Math.min(1, progress / 0.06)
        const fadeOut = Math.min(1, (1 - progress) / 0.08)

        context.globalAlpha = 0.18 * fadeIn * fadeOut
        context.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2)
      })
      context.globalAlpha = 1

      if (hasActiveOrFutureParticles) {
        animationFrame = requestAnimationFrame(render)
      } else {
        context.clearRect(0, 0, width, height)
      }
    }

    animationFrame = requestAnimationFrame(render)
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    return () => {
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      context.clearRect(0, 0, width, height)
    }
  }, [animate])

  return (
    <canvas
      aria-hidden="true"
      className="proton-burst"
      data-particle-count={PROTON_BURST_PARTICLE_COUNT}
      ref={canvasRef}
    />
  )
}
