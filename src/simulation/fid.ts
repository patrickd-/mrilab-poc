import {
  type FieldDirection,
  type FieldUniformity,
  type HydrogenEnsemble,
  type SupportedFieldStrengthTesla,
} from '../models/HydrogenEnsemble'

export const FID_GRAPH_INITIAL_RANGE_MILLISECONDS = 100
export const FID_GRAPH_MAXIMUM_WINDOW_MILLISECONDS = 5000

export interface FidEnsembleState {
  index: number
  equilibriumMagnetization: number
  longitudinalRelaxationTimeMilliseconds: number
  transverseRelaxationTimeMilliseconds: number
  angularFrequencyOffsetRadiansPerMillisecond: number
  fieldDirection: FieldDirection
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

export function fidEnsembleMagnetizationStateAt(
  state: FidEnsembleState,
  timeMilliseconds: number,
  pulseEvents: ReadonlyArray<RfPulseEvent>,
): FidEnsembleMagnetizationState {
  let xFraction = 0
  let yFraction = 0
  let zFraction = 1
  let previousTimeMilliseconds = 0
  let pulseCount = 0

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
      state.angularFrequencyOffsetRadiansPerMillisecond *
      durationMilliseconds
    const cosPhase = Math.cos(phase)
    const sinPhase = Math.sin(phase)
    const previousX = xFraction
    const previousY = yFraction

    xFraction =
      transverseDecay *
      (previousX * cosPhase - previousY * sinPhase)
    yFraction =
      transverseDecay *
      (previousX * sinPhase + previousY * cosPhase)
    zFraction =
      state.longitudinalRelaxationTimeMilliseconds === 0
        ? 1
        : 1 +
          (zFraction - 1) *
            Math.exp(
              -durationMilliseconds /
                state.longitudinalRelaxationTimeMilliseconds,
            )
  }

  pulseEvents.forEach((pulseEvent) => {
    if (pulseEvent.timeMilliseconds > timeMilliseconds) return

    evolveMagnetization(
      Math.max(0, pulseEvent.timeMilliseconds - previousTimeMilliseconds),
    )

    if (pulseEvent.kind === '90-y') {
      // An instantaneous +90° rotation about the rotating-frame y-axis.
      const previousX = xFraction
      xFraction = zFraction
      zFraction = -previousX
    } else {
      // An instantaneous 180° rotation about the rotating-frame x-axis.
      yFraction = -yFraction
      zFraction = -zFraction
    }
    previousTimeMilliseconds = pulseEvent.timeMilliseconds
    pulseCount += 1
  })

  evolveMagnetization(
    Math.max(0, timeMilliseconds - previousTimeMilliseconds),
  )

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
) {
  const states: FidEnsembleState[] = []

  ensembles.forEach((ensemble) => {
    if (ensemble.samplePreset === 'air') return

    const sampleProperties = ensemble.sampleProperties(fieldStrengthTesla)
    const magneticProperties = ensemble.magneticProperties(
      fieldStrengthTesla,
      fieldUniformity,
    )

    states.push({
      index: ensemble.index,
      equilibriumMagnetization: magneticProperties.boltzmannMagnetization,
      longitudinalRelaxationTimeMilliseconds:
        sampleProperties.longitudinalRelaxationTimeMilliseconds,
      transverseRelaxationTimeMilliseconds:
        sampleProperties.transverseRelaxationTimeMilliseconds,
      angularFrequencyOffsetRadiansPerMillisecond:
        magneticProperties.larmorAngularFrequencyVariation / 1000,
      fieldDirection: magneticProperties.direction,
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
): FidSignalPoint {
  const signal = normalizedFidSignal(
    states,
    timeMilliseconds,
    pulseEvents,
  )
  return {
    timeMilliseconds,
    normalizedVoltage: signal.inPhaseVoltage,
    normalizedQuadratureVoltage: signal.quadratureVoltage,
    normalizedLongitudinalMagnetization:
      signal.longitudinalMagnetization,
  }
}
