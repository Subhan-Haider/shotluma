import { applyChromaKeyToImageData, type ChromaKeyOptions } from './chroma-key'

const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to decode image for chroma-key removal.'))
    image.src = dataUrl
  })

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to encode transparent PNG as a data URL.'))
    }
    reader.onerror = () => reject(new Error('Failed to encode transparent PNG as a data URL.'))
    reader.readAsDataURL(blob)
  })

/**
 * Remove a solid chroma-key backdrop from a data-URL image and return a PNG data URL.
 * Uses the Canvas 2D API (same-origin / data-URL sources only).
 */
export async function removeChromaKeyBackground(
  dataUrl: string,
  options: ChromaKeyOptions = {},
): Promise<string> {
  const image = await loadImageFromDataUrl(dataUrl)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D context is unavailable for chroma-key removal.')

  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (width <= 0 || height <= 0) {
    throw new Error('Image has no measurable dimensions for chroma-key removal.')
  }

  canvas.width = width
  canvas.height = height
  context.drawImage(image, 0, 0)
  const frame = context.getImageData(0, 0, width, height)
  applyChromaKeyToImageData(frame, options)
  context.putImageData(frame, 0, 0)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new Error('Failed to export transparent PNG from canvas.'))
      },
      'image/png',
    )
  })

  return blobToDataUrl(blob)
}
