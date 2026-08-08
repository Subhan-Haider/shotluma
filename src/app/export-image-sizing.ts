// html-to-image snapshots an artboard by inlining it into a single SVG data URL
// and rasterising that through an <img>. WebKit gives up on the images nested
// inside such a snapshot once the embedded payload grows past a few hundred
// kilobytes: it still paints text, shapes and backgrounds, but every uploaded
// screenshot and device frame in that artboard comes out empty. A raw
// camera-resolution PNG from an upload is several megabytes once base64-encoded,
// so a single mockup is enough to cross that ceiling. Re-encoding each source at
// the size it actually occupies in the exported PNG keeps a snapshot one or two
// orders of magnitude smaller, with no resolution the export could have used.
//
// This module owns the sizing arithmetic; `export-image-payload.ts` performs the
// canvas work.

export const EXPORT_IMAGE_ENCODE_QUALITY = 0.95

/**
 * Length a single embedded source may reach before it is encoded smaller.
 * Artboards carry a handful of images each, so this leaves a snapshot well
 * inside the payload WebKit still renders.
 */
export const EXPORT_IMAGE_MAX_DATA_URL_LENGTH = 300_000

/**
 * Resolution headroom above an image's export footprint, tried largest first.
 * The exported PNG is rasterised from the artboard rather than from these
 * sources directly, so a source encoded at exactly its footprint is resampled
 * twice and loses detail the original export kept — headroom is only given up
 * when the encoded result does not fit the payload budget.
 */
export const EXPORT_IMAGE_OVERSAMPLE_STEPS = [2, 1.5, 1] as const

export type ExportImageSize = {
  width: number
  height: number
}

export type ExportImageRequest = {
  src: string
  /** Size the image covers in the exported PNG, in export pixels. */
  footprint: ExportImageSize
}

/**
 * Scale factor that covers `footprint` without ever scaling a source up: an
 * upload smaller than the area it is stretched across keeps its own pixels.
 * Both axes are covered, matching the `object-fit: cover` the canvas uses.
 */
export const getExportImageScale = (
  source: ExportImageSize,
  footprint: ExportImageSize,
  oversample: number,
) => {
  if (source.width <= 0 || source.height <= 0) return 1
  const cover = Math.max(footprint.width / source.width, footprint.height / source.height)
  return Math.min(1, cover * oversample)
}

export const getExportImageSize = (
  source: ExportImageSize,
  footprint: ExportImageSize,
  oversample: number,
): ExportImageSize => {
  const scale = getExportImageScale(source, footprint, oversample)
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  }
}

/**
 * Largest footprint requested for each source, so an upload placed on several
 * screens is encoded once at the resolution its biggest placement needs.
 */
export const mergeExportImageRequests = (requests: ExportImageRequest[]) => {
  const merged = new Map<string, ExportImageSize>()
  for (const { src, footprint } of requests) {
    const current = merged.get(src)
    merged.set(src, {
      width: Math.max(footprint.width, current?.width ?? 0),
      height: Math.max(footprint.height, current?.height ?? 0),
    })
  }
  return merged
}
