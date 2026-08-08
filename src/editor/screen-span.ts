import type { CanvasElement, DeviceElement, Slide } from '../types'

// Adjacent App Store screenshots sit flush against each other, so a spanning
// mockup continues on the neighbor exactly one artboard width (100%) away.
// The visual gap between artboards in the editor is chrome only and must not
// offset ghosts, or the exported screens would no longer join seamlessly.
export const SPAN_NEIGHBOR_OFFSET = 100

export const isSpanningDevice = (element: CanvasElement): element is DeviceElement =>
  element.type === 'device' && element.spansScreens === true

export type SpanGhost = {
  /** Copy of the source element shifted into the neighboring screen's coordinate space. */
  element: DeviceElement
  sourceSlideId: string
}

/**
 * Non-interactive continuations of spanning mockups owned by the screens
 * directly before and after `index`, positioned so they line up seamlessly
 * with the original across the shared edge.
 */
export const getSpanGhosts = (slides: Slide[], index: number): SpanGhost[] => {
  const ghosts: SpanGhost[] = []
  const collect = (neighbor: Slide | undefined, offset: number) => {
    if (!neighbor) return
    for (const element of neighbor.elements) {
      if (isSpanningDevice(element)) {
        ghosts.push({ element: { ...element, x: element.x + offset }, sourceSlideId: neighbor.id })
      }
    }
  }
  collect(slides[index - 1], -SPAN_NEIGHBOR_OFFSET)
  collect(slides[index + 1], SPAN_NEIGHBOR_OFFSET)
  return ghosts
}
