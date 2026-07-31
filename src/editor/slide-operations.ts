import type { Slide, ToolId } from '../types'

export type SlideRemoval = {
  slides: Slide[]
  activeSlideId: string | null
}

export type SlidePanelReveal = {
  activeTool: ToolId
  openSidebar: true
}

/**
 * Manual blank-screen creation from an empty project should open Templates.
 * AI creation uses a separate path and must not reveal a tool panel.
 */
export const panelRevealForAddedSlide = (
  slideCountBeforeAdd: number,
): SlidePanelReveal | null => (
  slideCountBeforeAdd === 0
    ? { activeTool: 'templates', openSidebar: true }
    : null
)

export const removeSlide = (
  slides: Slide[],
  slideId: string,
  activeSlideId: string,
): SlideRemoval | null => {
  const index = slides.findIndex((slide) => slide.id === slideId)
  if (index === -1) return null

  const fallback = slides[index - 1] ?? slides[index + 1] ?? null
  return {
    slides: slides.filter((slide) => slide.id !== slideId),
    activeSlideId: activeSlideId === slideId ? fallback?.id ?? null : activeSlideId,
  }
}
