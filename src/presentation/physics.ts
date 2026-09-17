import {
  PHYSICAL_CONSTANTS,
  PROTON_GYROMAGNETIC_RATIO,
} from '../models/HydrogenEnsemble'

export const TOTAL_PROTONS = 2e21
export const HALF_PROTONS = TOTAL_PROTONS / 2
export const BODY_TEMPERATURE_KELVIN = 310

/**
 * Thermal-equilibrium spin polarization for a spin-1/2 proton ensemble:
 * P = tanh(hbar * gamma * B0 / (2 * kB * T)).
 *
 * P is the full population difference divided by the total population, not
 * the shift of either individual population away from N / 2.
 * https://pmc.ncbi.nlm.nih.gov/articles/PMC5965996/
 */
export function protonPolarizationAt(
  fieldStrengthTesla: number,
  temperatureKelvin = BODY_TEMPERATURE_KELVIN,
) {
  const nonNegativeField = Math.max(0, fieldStrengthTesla)
  const thermalArgument =
    (PHYSICAL_CONSTANTS.diracConstant *
      PROTON_GYROMAGNETIC_RATIO *
      nonNegativeField) /
    (2 * PHYSICAL_CONSTANTS.boltzmannConstant * temperatureKelvin)

  return Math.tanh(thermalArgument)
}

/** Full excess N_parallel - N_antiparallel. */
export function excessProtonsAt(
  fieldStrengthTesla: number,
  temperatureKelvin = BODY_TEMPERATURE_KELVIN,
) {
  return Math.round(
    TOTAL_PROTONS *
      protonPolarizationAt(fieldStrengthTesla, temperatureKelvin),
  )
}

export function protonPopulationsAt(
  fieldStrengthTesla: number,
  temperatureKelvin = BODY_TEMPERATURE_KELVIN,
) {
  const excessProtons = excessProtonsAt(
    fieldStrengthTesla,
    temperatureKelvin,
  )
  const halfPopulationDifference = excessProtons / 2

  return {
    parallel: HALF_PROTONS + halfPopulationDifference,
    antiparallel: HALF_PROTONS - halfPopulationDifference,
    excess: excessProtons,
  }
}

export function formatProtonCount(value: number) {
  return Math.round(value).toLocaleString('en-US')
}
