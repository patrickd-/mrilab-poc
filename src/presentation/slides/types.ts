import type { ComponentType } from 'react'

export type NavigationDirection = 'initial' | 'forward' | 'backward'

export interface SlideStateProps {
  direction: NavigationDirection
  stateIndex: number
}

export interface PresentationSlideModule {
  id: string
  heading: string
  stateCount: number
  Component: ComponentType<SlideStateProps>
}
