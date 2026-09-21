import { howWeMeasureSlideModule } from './HowWeMeasureSlide'
import { howWeMeasure2SlideModule } from './HowWeMeasure2Slide'
import { howWeMeasure3SlideModule } from './HowWeMeasure3Slide'
import { titleSlideModule } from './TitleSlide'
import { whatWeMeasureSlideModule } from './WhatWeMeasureSlide'

export const presentationSlides = [
  titleSlideModule,
  whatWeMeasureSlideModule,
  howWeMeasureSlideModule,
  howWeMeasure2SlideModule,
  howWeMeasure3SlideModule,
]

export type {
  NavigationDirection,
  PresentationSlideModule,
  SlideStateProps,
} from './types'
