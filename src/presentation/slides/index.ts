import { measurementSlideModule } from './MeasurementSlide'
import { titleSlideModule } from './TitleSlide'

export const presentationSlides = [
  titleSlideModule,
  measurementSlideModule,
]

export type {
  NavigationDirection,
  PresentationSlideModule,
  SlideStateProps,
} from './types'
