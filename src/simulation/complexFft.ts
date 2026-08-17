export function complexFourierTransformInPlace(
  real: Float64Array,
  imaginary: Float64Array,
  inverse: boolean,
) {
  const length = real.length
  if (
    length !== imaginary.length ||
    length < 2 ||
    (length & (length - 1)) !== 0
  ) {
    throw new RangeError('Complex FFT length must be a power of two')
  }

  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1
    while (reversed & bit) {
      reversed ^= bit
      bit >>= 1
    }
    reversed ^= bit
    if (index < reversed) {
      ;[real[index], real[reversed]] = [real[reversed], real[index]]
      ;[imaginary[index], imaginary[reversed]] = [
        imaginary[reversed],
        imaginary[index],
      ]
    }
  }

  for (let size = 2; size <= length; size *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size
    const stepReal = Math.cos(angle)
    const stepImaginary = Math.sin(angle)

    for (let offset = 0; offset < length; offset += size) {
      let twiddleReal = 1
      let twiddleImaginary = 0
      for (let localIndex = 0; localIndex < size / 2; localIndex += 1) {
        const evenIndex = offset + localIndex
        const oddIndex = evenIndex + size / 2
        const oddReal =
          real[oddIndex] * twiddleReal -
          imaginary[oddIndex] * twiddleImaginary
        const oddImaginary =
          real[oddIndex] * twiddleImaginary +
          imaginary[oddIndex] * twiddleReal
        const evenReal = real[evenIndex]
        const evenImaginary = imaginary[evenIndex]

        real[evenIndex] = evenReal + oddReal
        imaginary[evenIndex] = evenImaginary + oddImaginary
        real[oddIndex] = evenReal - oddReal
        imaginary[oddIndex] = evenImaginary - oddImaginary

        const nextTwiddleReal =
          twiddleReal * stepReal - twiddleImaginary * stepImaginary
        twiddleImaginary =
          twiddleReal * stepImaginary + twiddleImaginary * stepReal
        twiddleReal = nextTwiddleReal
      }
    }
  }

  if (inverse) {
    for (let index = 0; index < length; index += 1) {
      real[index] /= length
      imaginary[index] /= length
    }
  }
}
