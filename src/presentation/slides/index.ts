import { titleSlideModule } from './TitleSlide'
import { whatWeMeasureSlideModule } from './WhatWeMeasureSlide'

export const presentationSlides = [
  titleSlideModule,
  whatWeMeasureSlideModule,
]

export type {
  NavigationDirection,
  PresentationSlideModule,
  SlideStateProps,
} from './types'
