export const TOTAL_PROTONS = 2e21
export const HALF_PROTONS = TOTAL_PROTONS / 2
export const BODY_TEMPERATURE_KELVIN = 310

const REFERENCE_FIELD_TESLA = 3
const REFERENCE_EXCESS_PROTONS = 1.48e16
const REFERENCE_POPULATION_SHIFT =
  REFERENCE_EXCESS_PROTONS / TOTAL_PROTONS
const REFERENCE_BOLTZMANN_ARGUMENT = Math.atanh(
  REFERENCE_POPULATION_SHIFT,
)

/**
 * Small-field Boltzmann population shift, calibrated to the lecture's rounded
 * CSF example: about 1.48e16 excess protons at 3 T and body temperature.
 * Keeping tanh here preserves the thermal-equilibrium response outside that
 * reference point while matching the deliberately approximate teaching count.
 */
export function excessProtonsAt(
  fieldStrengthTesla: number,
  temperatureKelvin = BODY_TEMPERATURE_KELVIN,
) {
  const nonNegativeField = Math.max(0, fieldStrengthTesla)
  const thermalArgument =
    REFERENCE_BOLTZMANN_ARGUMENT *
    (nonNegativeField / REFERENCE_FIELD_TESLA) *
    (BODY_TEMPERATURE_KELVIN / temperatureKelvin)

  return Math.round(TOTAL_PROTONS * Math.tanh(thermalArgument))
}

export function formatProtonCount(value: number) {
  return Math.round(value).toLocaleString('en-US')
}
