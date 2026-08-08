// Re-encodes the images an artboard shows so a snapshot of it stays inside the
// payload WebKit will still render nested images from. See
// `export-image-sizing.ts` for the sizing rules and why they exist.

import {
  EXPORT_IMAGE_ENCODE_QUALITY,
  EXPORT_IMAGE_MAX_DATA_URL_LENGTH,
  EXPORT_IMAGE_OVERSAMPLE_STEPS,
  getExportImageSize,
  mergeExportImageRequests,
  type ExportImageRequest,
  type ExportImageSize,
} from './export-image-sizing'

const isDataUrl = (src: string) => src.startsWith('data:')

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The image could not be decoded for export.'))
    image.crossOrigin = 'anonymous'
    image.src = src
  })

const hasTransparentPixels = (context: CanvasRenderingContext2D, size: ExportImageSize) => {
  const { data } = context.getImageData(0, 0, size.width, size.height)
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] ?? 255) < 255) return true
  }
  return false
}

// WebP keeps the alpha channel of a device frame at a fraction of PNG's size,
// but canvas WebP encoding is not available in every browser this editor runs
// in. `toDataURL` silently falls back to PNG there, so the MIME type of the
// result is the only reliable feature test.
const encodeCanvas = (canvas: HTMLCanvasElement, isOpaque: boolean) => {
  const webp = canvas.toDataURL('image/webp', EXPORT_IMAGE_ENCODE_QUALITY)
  if (webp.startsWith('data:image/webp')) return webp
  if (isOpaque) return canvas.toDataURL('image/jpeg', EXPORT_IMAGE_ENCODE_QUALITY)
  return canvas.toDataURL('image/png')
}

const encodeAtSize = (image: HTMLImageElement, size: ExportImageSize) => {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, size.width, size.height)
  return encodeCanvas(canvas, !hasTransparentPixels(context, size))
}

const toExportImageSource = async (src: string, footprint: ExportImageSize) => {
  const image = await loadImage(src)
  const source = { width: image.naturalWidth, height: image.naturalHeight }
  let encoded: string | null = null

  for (const oversample of EXPORT_IMAGE_OVERSAMPLE_STEPS) {
    encoded = encodeAtSize(image, getExportImageSize(source, footprint, oversample))
    if (!encoded) return null
    if (encoded.length <= EXPORT_IMAGE_MAX_DATA_URL_LENGTH) break
  }

  if (!encoded) return null
  // A bundled asset is referenced by a short URL that html-to-image inlines at
  // full size later, so length is only comparable when the source is itself a
  // data URL.
  if (isDataUrl(src) && encoded.length >= src.length) return null
  return encoded
}

/**
 * Maps every source that shrinks to its export-sized replacement. Sources that
 * fail to decode, or that are already smaller than the re-encoded version, are
 * left out so callers keep rendering the original.
 */
export const buildExportImageSources = async (requests: ExportImageRequest[]) => {
  const prepared = await Promise.all(
    [...mergeExportImageRequests(requests)].map(async ([src, footprint]) => {
      try {
        return [src, await toExportImageSource(src, footprint)] as const
      } catch {
        // An undecodable source is not worth failing the whole export over —
        // the original src still renders exactly as it does in the editor.
        return [src, null] as const
      }
    }),
  )

  return new Map(
    prepared.filter((entry): entry is readonly [string, string] => entry[1] !== null),
  )
}
