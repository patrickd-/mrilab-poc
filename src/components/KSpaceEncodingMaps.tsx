import { useEffect, useRef } from 'react'
import { spatialEncodingBasisAt } from '../simulation/gradientEncoding'

interface KSpaceEncodingMapsProps {
  gridSize: number
  kxCyclesPerMeter: number
  kyCyclesPerMeter: number
  phaseOffsetRadians?: number
}

type EncodingComponent = 'imaginary' | 'real'

function componentLabel(component: EncodingComponent) {
  return component === 'real' ? 'Real · cos φ' : 'Imaginary · sin φ'
}

function EncodingMap({
  component,
  gridSize,
  kxCyclesPerMeter,
  kyCyclesPerMeter,
  phaseOffsetRadians = 0,
}: KSpaceEncodingMapsProps & { component: EncodingComponent }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let context: CanvasRenderingContext2D | null = null
    try {
      context = canvas.getContext('2d')
    } catch {
      return
    }
    if (!context) return

    const image = context.createImageData(gridSize, gridSize)
    for (let row = 0; row < gridSize; row += 1) {
      for (let column = 0; column < gridSize; column += 1) {
        const basis = spatialEncodingBasisAt(
          column,
          row,
          gridSize,
          kxCyclesPerMeter,
          kyCyclesPerMeter,
          phaseOffsetRadians,
        )
        const value = component === 'real' ? basis.real : basis.imaginary
        const grayscale = Math.round(((value + 1) / 2) * 255)
        const pixelOffset = (row * gridSize + column) * 4
        image.data[pixelOffset] = grayscale
        image.data[pixelOffset + 1] = grayscale
        image.data[pixelOffset + 2] = grayscale
        image.data[pixelOffset + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
  }, [
    component,
    gridSize,
    kxCyclesPerMeter,
    kyCyclesPerMeter,
    phaseOffsetRadians,
  ])

  const label = componentLabel(component)
  return (
    <figure className="k-space-encoding-map">
      <figcaption>
        <strong>{label}</strong>
        <span>{component === 'real' ? 'Re{eⁱᵠ}' : 'Im{eⁱᵠ}'}</span>
      </figcaption>
      <canvas
        ref={canvasRef}
        width={gridSize}
        height={gridSize}
        role="img"
        aria-label={`${label} spatial encoding map at kx ${(kxCyclesPerMeter / 1000).toFixed(3)} and ky ${(kyCyclesPerMeter / 1000).toFixed(3)} cycles per millimeter`}
      />
      <div className="k-space-grayscale-key" aria-hidden="true">
        <span>−1</span>
        <i />
        <span>+1</span>
      </div>
    </figure>
  )
}

function KSpaceEncodingMaps(props: KSpaceEncodingMapsProps) {
  const kxCyclesPerMillimeter = props.kxCyclesPerMeter / 1000
  const kyCyclesPerMillimeter = props.kyCyclesPerMeter / 1000

  return (
    <section
      className="k-space-encoding-maps"
      aria-label="Current complex spatial encoding basis"
    >
      <EncodingMap component="real" {...props} />
      <EncodingMap component="imaginary" {...props} />
      <footer>
        <span>
          k<sub>x</sub> = {kxCyclesPerMillimeter.toFixed(3)} cycles/mm
        </span>
        <span>
          k<sub>y</sub> = {kyCyclesPerMillimeter.toFixed(3)} cycles/mm
        </span>
      </footer>
    </section>
  )
}

export default KSpaceEncodingMaps
