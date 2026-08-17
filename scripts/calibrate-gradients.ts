import { calibrateGradientEncoding } from '../src/simulation/gradientCalibration'

function numericArgument(name: string) {
  const prefix = `--${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))
  return value === undefined ? undefined : Number(value.slice(prefix.length))
}

const report = calibrateGradientEncoding({
  adcDwellTimeMilliseconds: numericArgument('adc-dwell-ms'),
  gradientImperfections: process.argv.includes('--imperfections'),
  gridSize: numericArgument('grid-size'),
  voxelSizeMillimeters: numericArgument('voxel-mm'),
})

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const fixed = (value: number, digits = 6) => value.toFixed(digits)
const recommendedReadout = report.recommended.readoutPulses

console.log('MRI gradient calibration')
console.log(
  `Matrix/FOV: ${report.options.gridSize} × ${report.options.gridSize} / ${fixed(
    report.target.fieldOfViewMillimeters,
    3,
  )} mm (${fixed(report.options.voxelSizeMillimeters, 3)} mm cells)`,
)
console.log(
  `Target k-space: ${fixed(report.target.minimumKCyclesPerMeter, 4)} to ${fixed(
    report.target.maximumKCyclesPerMeter,
    4,
  )} cycles/m; Δk = ${fixed(report.target.kSpaceStepCyclesPerMeter, 6)} cycles/m`,
)
console.log('')
console.log('Current defaults')
console.log(
  `  G_PE line: ${fixed(report.current.phaseEncodingKyCyclesPerMeter, 4)} cycles/m`,
)
console.log(
  `  G_RO traversal: ${fixed(report.current.readoutStartKxCyclesPerMeter, 4)} to ${fixed(
    report.current.readoutEndKxCyclesPerMeter,
    4,
  )} cycles/m`,
)
console.log('')
console.log('Recommended waveform amplitudes (fraction of configured 30 mT/m)')
console.log(
  `  G_PE center line: 0; step = ${fixed(
    report.recommended.phaseEncodingAmplitudeStep,
    9,
  )}; range = ${fixed(
    report.recommended.phaseEncodingMinimumAmplitude,
    6,
  )} to ${fixed(report.recommended.phaseEncodingMaximumAmplitude, 6)}`,
)
console.log(
  `  G_RO prephaser: ${fixed(recommendedReadout[0].amplitude, 6)}`,
)
console.log(
  `  G_RO readout: ${fixed(recommendedReadout[1].amplitude, 6)}`,
)
console.log(
  `  Echo center: ${fixed(report.recommended.echoCenterTimeMilliseconds, 3)} ms`,
)
console.log(
  `  ADC: ${report.recommended.adcSampleCount} samples at ${fixed(
    report.options.adcDwellTimeMilliseconds,
    3,
  )} ms dwell; ${fixed(
    report.recommended.readoutOversamplingFactor,
    3,
  )}× readout oversampling`,
)
console.log('')
console.log(
  `Center-out ky order: ${report.recommended.phaseEncodingLinesCenterOut
    .slice(0, 12)
    .map((line) => line.index)
    .join(', ')} …`,
)

if (report.warnings.length > 0) {
  console.log('')
  console.log('Diagnostics')
  report.warnings.forEach((warning) => console.log(`  - ${warning}`))
}
