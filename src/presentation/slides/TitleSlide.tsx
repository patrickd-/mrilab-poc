import type { PresentationSlideModule, SlideStateProps } from './types'

function TitleSlide(_props: SlideStateProps) {
  return (
    <div className="title-slide">
      <h2>
        MRI
        <br />
        Intuition
      </h2>
    </div>
  )
}

export const titleSlideModule: PresentationSlideModule = {
  id: 'title',
  heading: '',
  stateCount: 1,
  Component: TitleSlide,
}
