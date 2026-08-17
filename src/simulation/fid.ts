import {
  fieldProfileAt,
  type FieldDirection,
  type FieldUniformity,
  type HydrogenEnsemble,
  type SupportedFieldStrengthTesla,
} from '../models/HydrogenEnsemble'

export const FID_GRAPH_INITIAL_RANGE_MILLISECONDS = 100
export const FID_GRAPH_MAXIMUM_WINDOW_MILLISECONDS = 5000
const NORMALIZED_RECEIVER_NOISE_STANDARD_DEVIATION = 1 / 80
const B1_MAXIMUM_FRACTIONAL_DEVIATION: Readonly<
  Record<SupportedFieldStrengthTesla, number>
> = {
  1.5: 0.04,
  3: 0.08,
  7: 0.15,
}
const INTRAVOXEL_SAMPLE_OFFSETS_MILLIMETERS = [-1 / 3, 0, 1 / 3] as const
// Equal-probability standard-normal quantiles for a deterministic 3 x 3
// isochromat grid. Their static offsets approximate reversible T2* decay.
const INTRAVOXEL_FREQUENCY_QUANTILES = [
  -1.593,
  -0.967,
  -0.59,
  -0.282,
  0,
  0.282,
  0.59,
  0.967,
  1.593,
] as const
const INTRAVOXEL_QUANTILE_STANDARD_DEVIATION = Math.sqrt(
  INTRAVOXEL_FREQUENCY_QUANTILES.reduce<number>(
    (sum, quantile) => sum + quantile ** 2,
    0,
  ) / INTRAVOXEL_FREQUENCY_QUANTILES.length,
)

export interface FidSpinPacketState {
  offsetXMillimeters: number
  offsetYMillimeters: number
  angularFrequencyOffsetRadiansPerMillisecond: number
  weight: number
}

export interface FidEnsembleState {
  index: number
  column: number
  row: number
  layer: number
  gridSize: number
  equilibriumMagnetization: number
  longitudinalRelaxationTimeMilliseconds: number
  transverseRelaxationTimeMilliseconds: number
  angularFrequencyOffsetRadiansPerMillisecond: number
  fieldVariationTesla: number
  fieldVariationPpm: number
  fieldTiltAngleRadians: number
  fieldDirection: FieldDirection
  transmitFieldScale: number
  spinPackets: ReadonlyArray<FidSpinPacketState>
}

export interface FidRealismOptions {
  b1Inhomogeneity?: boolean
  intravoxelDephasing?: boolean
  tissueHeterogeneity?: boolean
}

export type RfPulseKind = '90-y' | '180-x'

export interface RfPulseEvent {
  timeMilliseconds: number
  kind: RfPulseKind
}

export interface FidEnsembleMagnetizationState {
  excited: boolean
  xFraction: number
  yFraction: number
  zFraction: number
  transverseFraction: number
  longitudinalFraction: number
  precessionPhaseRadians: number
  flipAngleRadians: number
}

export interface FidSignalPoint {
  timeMilliseconds: number
  normalizedVoltage: number
  normalizedQuadratureVoltage: number
  normalizedLongitudinalMagnetization: number
}

function hashedUnitInterval(seed: number) {
  let hash = seed >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b)
  hash ^= hash >>> 16
  return ((hash >>> 0) + 0.5) / 0x100000000
}

export function receiverNoiseAt(timeMilliseconds: number) {
  const sampleKey = Math.round(timeMilliseconds * 10_000)
  const uniformRadius = hashedUnitInterval(sampleKey ^ 0x2f6e2b1)
  const uniformAngle = hashedUnitInterval(sampleKey ^ 0x68bc21d)
  const radius = Math.sqrt(-2 * Math.log(uniformRadius))
  const angle = 2 * Math.PI * uniformAngle

  return {
    inPhase:
      radius *
      Math.cos(angle) *
      NORMALIZED_RECEIVER_NOISE_STANDARD_DEVIATION,
    quadrature:
      radius *
      Math.sin(angle) *
      NORMALIZED_RECEIVER_NOISE_STANDARD_DEVIATION,
  }
}

export function transmitFieldScaleAt(
  column: number,
  row: number,
  gridSize: number,
  fieldStrengthTesla: SupportedFieldStrengthTesla,
  enabled: boolean,
) {
  if (!enabled) return 1

  const center = (gridSize - 1) / 2
  const normalizedX = (column - center) / center
  const normalizedY = (center - row) / center
  // A smooth asymmetric transmit profile stands in for coil loading and
  // wavelength effects. The polynomial is normalized to stay within ±1.
  const profile =
    (0.6 * normalizedX -
      0.35 * normalizedY +
      0.25 * normalizedX * normalizedY) /
    1.2

  return 1 + B1_MAXIMUM_FRACTIONAL_DEVIATION[fieldStrengthTesla] * profile
}

export function fidEnsembleMagnetizationStateAt(
  state: FidEnsembleState,
  timeMilliseconds: number,
  pulseEvents: ReadonlyArray<RfPulseEvent>,
): FidEnsembleMagnetizationState {
  let xFraction = 0
  let yFraction = 0
  let zFraction = 0
  let totalWeight = 0
  let pulseCount = 0

  state.spinPackets.forEach((spinPacket) => {
    let packetXFraction = 0
    let packetYFraction = 0
    let packetZFraction = 1
    let previousTimeMilliseconds = 0
    let packetPulseCount = 0

    const evolveMagnetization = (durationMilliseconds: number) => {
      if (durationMilliseconds <= 0) return

      const transverseDecay =
        state.transverseRelaxationTimeMilliseconds === 0
          ? 0
          : Math.exp(
              -durationMilliseconds /
                state.transverseRelaxationTimeMilliseconds,
            )
      const phase =
        spinPacket.angularFrequencyOffsetRadiansPerMillisecond *
        durationMilliseconds
      const cosPhase = Math.cos(phase)
      const sinPhase = Math.sin(phase)
      const previousX = packetXFraction
      const previousY = packetYFraction

      packetXFraction =
        transverseDecay *
        (previousX * cosPhase - previousY * sinPhase)
      packetYFraction =
        transverseDecay *
        (previousX * sinPhase + previousY * cosPhase)
      packetZFraction =
        state.longitudinalRelaxationTimeMilliseconds === 0
          ? 1
          : 1 +
            (packetZFraction - 1) *
              Math.exp(
                -durationMilliseconds /
                  state.longitudinalRelaxationTimeMilliseconds,
              )
    }

    pulseEvents.forEach((pulseEvent) => {
      if (pulseEvent.timeMilliseconds > timeMilliseconds) return

      evolveMagnetization(
        Math.max(
          0,
          pulseEvent.timeMilliseconds - previousTimeMilliseconds,
        ),
      )

      if (pulseEvent.kind === '90-y') {
        // An instantaneous rotation about the rotating-frame y-axis.
        const angleRadians = (Math.PI / 2) * state.transmitFieldScale
        const cosAngle = Math.cos(angleRadians)
        const sinAngle = Math.sin(angleRadians)
        const previousX = packetXFraction
        const previousZ = packetZFraction
        packetXFraction = previousX * cosAngle + previousZ * sinAngle
        packetZFraction = -previousX * sinAngle + previousZ * cosAngle
      } else {
        // An instantaneous rotation about the rotating-frame x-axis.
        const angleRadians = Math.PI * state.transmitFieldScale
        const cosAngle = Math.cos(angleRadians)
        const sinAngle = Math.sin(angleRadians)
        const previousY = packetYFraction
        const previousZ = packetZFraction
        packetYFraction = previousY * cosAngle - previousZ * sinAngle
        packetZFraction = previousY * sinAngle + previousZ * cosAngle
      }
      previousTimeMilliseconds = pulseEvent.timeMilliseconds
      packetPulseCount += 1
    })

    evolveMagnetization(
      Math.max(0, timeMilliseconds - previousTimeMilliseconds),
    )

    xFraction += packetXFraction * spinPacket.weight
    yFraction += packetYFraction * spinPacket.weight
    zFraction += packetZFraction * spinPacket.weight
    totalWeight += spinPacket.weight
    pulseCount = Math.max(pulseCount, packetPulseCount)
  })

  if (totalWeight > 0 && totalWeight !== 1) {
    xFraction /= totalWeight
    yFraction /= totalWeight
    zFraction /= totalWeight
  }

  const transverseFraction = Math.hypot(xFraction, yFraction)
  const precessionPhaseRadians =
    transverseFraction < 1e-12 ? 0 : Math.atan2(yFraction, xFraction)

  return {
    excited: pulseCount > 0,
    xFraction,
    yFraction,
    zFraction,
    transverseFraction,
    longitudinalFraction: zFraction,
    precessionPhaseRadians,
    flipAngleRadians: Math.atan2(transverseFraction, zFraction),
  }
}

export function createFidEnsembleStates(
  ensembles: ReadonlyArray<HydrogenEnsemble>,
  fieldStrengthTesla: SupportedFieldStrengthTesla,
  fieldUniformity: FieldUniformity,
  {
    b1Inhomogeneity = false,
    intravoxelDephasing = false,
    tissueHeterogeneity = false,
  }: FidRealismOptions = {},
) {
  const states: FidEnsembleState[] = []

  ensembles.forEach((ensemble) => {
    if (ensemble.samplePreset === 'air') return

    const sampleProperties = ensemble.sampleProperties(
      fieldStrengthTesla,
      tissueHeterogeneity,
    )
    const magneticProperties = ensemble.magneticProperties(
      fieldStrengthTesla,
      fieldUniformity,
    )
    const intrinsicT2Milliseconds =
      sampleProperties.transverseRelaxationTimeMilliseconds
    const effectiveT2StarMilliseconds =
      sampleProperties.effectiveTransverseRelaxationTimeMilliseconds
    // Model the refocusable contribution as a Gaussian static frequency
    // distribution. Its width is calibrated so intrinsic T2 decay multiplied
    // by the packet coherence reaches e^-1 at the preset T2* time.
    const susceptibilityAngularFrequencyStandardDeviation =
      intrinsicT2Milliseconds > 0 && effectiveT2StarMilliseconds > 0
        ? Math.sqrt(
            2 *
              Math.max(
                0,
                1 -
                  effectiveT2StarMilliseconds /
                    intrinsicT2Milliseconds,
              ),
          ) / effectiveT2StarMilliseconds
        : 0
    const spinPackets: FidSpinPacketState[] = intravoxelDephasing
      ? INTRAVOXEL_SAMPLE_OFFSETS_MILLIMETERS.flatMap(
          (offsetYMillimeters, sampleRow) =>
            INTRAVOXEL_SAMPLE_OFFSETS_MILLIMETERS.map(
              (offsetXMillimeters, sampleColumn) => {
                const fieldProfile = fieldProfileAt(
                  ensemble.column + offsetXMillimeters,
                  ensemble.row - offsetYMillimeters,
                  ensemble.gridSize,
                  fieldUniformity,
                )
                const localFieldVariationTesla =
                  fieldStrengthTesla * (fieldProfile.fieldScale - 1)
                const packetIndex =
                  sampleRow *
                    INTRAVOXEL_SAMPLE_OFFSETS_MILLIMETERS.length +
                  sampleColumn

                return {
                  offsetXMillimeters,
                  offsetYMillimeters,
                  angularFrequencyOffsetRadiansPerMillisecond:
                    (ensemble.gyromagneticRatio *
                      localFieldVariationTesla) /
                      1000 +
                    (INTRAVOXEL_FREQUENCY_QUANTILES[packetIndex] /
                      INTRAVOXEL_QUANTILE_STANDARD_DEVIATION) *
                      susceptibilityAngularFrequencyStandardDeviation,
                  weight:
                    1 /
                    INTRAVOXEL_SAMPLE_OFFSETS_MILLIMETERS.length ** 2,
                }
              },
            ),
        )
      : [
          {
            offsetXMillimeters: 0,
            offsetYMillimeters: 0,
            angularFrequencyOffsetRadiansPerMillisecond:
              magneticProperties.larmorAngularFrequencyVariation / 1000,
            weight: 1,
          },
        ]

    states.push({
      index: ensemble.index,
      column: ensemble.column,
      row: ensemble.row,
      layer: ensemble.layer,
      gridSize: ensemble.gridSize,
      equilibriumMagnetization: magneticProperties.boltzmannMagnetization,
      longitudinalRelaxationTimeMilliseconds:
        sampleProperties.longitudinalRelaxationTimeMilliseconds,
      transverseRelaxationTimeMilliseconds:
        sampleProperties.transverseRelaxationTimeMilliseconds,
      angularFrequencyOffsetRadiansPerMillisecond:
        magneticProperties.larmorAngularFrequencyVariation / 1000,
      fieldVariationTesla: magneticProperties.fieldVariationTesla,
      fieldVariationPpm: magneticProperties.fieldVariationPpm,
      fieldTiltAngleRadians: magneticProperties.tiltAngleRadians,
      fieldDirection: magneticProperties.direction,
      transmitFieldScale: transmitFieldScaleAt(
        ensemble.column,
        ensemble.row,
        ensemble.gridSize,
        fieldStrengthTesla,
        b1Inhomogeneity,
      ),
      spinPackets,
    })
  })

  return states
}

export function normalizedFidSignal(
  states: ReadonlyArray<FidEnsembleState>,
  timeMilliseconds: number,
  pulseEvents: ReadonlyArray<RfPulseEvent>,
) {
  let initialSignal = 0
  let inPhaseSignal = 0
  let quadratureSignal = 0
  let equilibriumMagnetization = 0
  let longitudinalMagnetization = 0

  states.forEach((state) => {
    const magnetizationState = fidEnsembleMagnetizationStateAt(
      state,
      timeMilliseconds,
      pulseEvents,
    )
    const { x: fieldX, y: fieldY, z: fieldZ } = state.fieldDirection
    const transverseBasisLength = Math.sqrt(
      Math.max(0, 1 - fieldX ** 2),
    )
    const safeBasisLength = Math.max(transverseBasisLength, 1e-12)
    const basisX = transverseBasisLength
    const basisY = (-fieldX * fieldY) / safeBasisLength
    const basisZ = (-fieldX * fieldZ) / safeBasisLength
    const quadratureBasisX = fieldY * basisZ - fieldZ * basisY
    const quadratureBasisY = fieldZ * basisX - fieldX * basisZ
    const receiverX =
      basisX * magnetizationState.xFraction +
      quadratureBasisX * magnetizationState.yFraction
    const receiverY =
      basisY * magnetizationState.xFraction +
      quadratureBasisY * magnetizationState.yFraction

    equilibriumMagnetization += state.equilibriumMagnetization
    longitudinalMagnetization +=
      state.equilibriumMagnetization *
      magnetizationState.longitudinalFraction
    initialSignal +=
      state.equilibriumMagnetization * transverseBasisLength
    inPhaseSignal +=
      state.equilibriumMagnetization * receiverX
    quadratureSignal +=
      state.equilibriumMagnetization * receiverY
  })

  return initialSignal === 0
    ? {
        inPhaseVoltage: 0,
        quadratureVoltage: 0,
        longitudinalMagnetization: 0,
      }
    : {
        inPhaseVoltage: inPhaseSignal / initialSignal,
        quadratureVoltage: quadratureSignal / initialSignal,
        longitudinalMagnetization:
          equilibriumMagnetization === 0
            ? 0
            : longitudinalMagnetization / equilibriumMagnetization,
      }
}

export function normalizedLongitudinalMagnetization(
  states: ReadonlyArray<FidEnsembleState>,
  timeMilliseconds: number,
  pulseEvents: ReadonlyArray<RfPulseEvent>,
) {
  let equilibriumMagnetization = 0
  let longitudinalMagnetization = 0

  states.forEach((state) => {
    const magnetizationState = fidEnsembleMagnetizationStateAt(
      state,
      timeMilliseconds,
      pulseEvents,
    )
    equilibriumMagnetization += state.equilibriumMagnetization
    longitudinalMagnetization +=
      state.equilibriumMagnetization *
      magnetizationState.longitudinalFraction
  })

  return equilibriumMagnetization === 0
    ? 0
    : longitudinalMagnetization / equilibriumMagnetization
}

export function fidSignalPointAt(
  states: ReadonlyArray<FidEnsembleState>,
  timeMilliseconds: number,
  pulseEvents: ReadonlyArray<RfPulseEvent>,
  receiverNoise = false,
): FidSignalPoint {
  const signal = normalizedFidSignal(
    states,
    timeMilliseconds,
    pulseEvents,
  )
  const noise = receiverNoise
    ? receiverNoiseAt(timeMilliseconds)
    : { inPhase: 0, quadrature: 0 }
  return {
    timeMilliseconds,
    normalizedVoltage: signal.inPhaseVoltage + noise.inPhase,
    normalizedQuadratureVoltage:
      signal.quadratureVoltage + noise.quadrature,
    normalizedLongitudinalMagnetization:
      signal.longitudinalMagnetization,
  }
}
