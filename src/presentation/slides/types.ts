import type { ComponentType } from 'react'

export type NavigationDirection = 'initial' | 'forward' | 'backward'

export interface SlideStateProps {
  direction: NavigationDirection
  fieldStrengthTesla: number
  setFieldStrengthTesla: (value: number) => void
  stateIndex: number
}

export interface PresentationSlideModule {
  id: string
  heading: string
  stateCount: number
  Component: ComponentType<SlideStateProps>
  /** Intro/exploration slides retain the slider value. Later slides default to
   * the shared 1.5 T demonstration field, including on back navigation/replay. */
  preserveFieldStrength?: boolean
}
