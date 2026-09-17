import { howWeMeasureSlideModule } from './HowWeMeasureSlide'
import { titleSlideModule } from './TitleSlide'
import { whatWeMeasureSlideModule } from './WhatWeMeasureSlide'

export const presentationSlides = [
  titleSlideModule,
  whatWeMeasureSlideModule,
  howWeMeasureSlideModule,
]

export type {
  NavigationDirection,
  PresentationSlideModule,
  SlideStateProps,
} from './types'
