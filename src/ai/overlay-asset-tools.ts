import { generateImage, tool } from 'ai'
import { z } from 'zod'
import { ASSET_CHROMA_KEY_HEX } from './chroma-key'
import {
  OVERLAY_ASSET_SIZE_MAP,
  buildOverlayAssetPrompt,
  type OverlayAssetSize,
} from './overlay-asset-prompt'
import { getAiProviderKey } from './provider-config'
import { removeChromaKeyBackground } from './remove-chroma-key-background'
import {
  assetNotFoundMessage,
  notFound,
  type ToolContext,
} from './tool-context'

const dataUrlToBase64 = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return dataUrl
  return dataUrl.slice(comma + 1)
}

const sanitizeAssetName = (name: string): string => {
  const trimmed = name.trim().replace(/[^\w.\- ]+/g, '').slice(0, 64)
  return trimmed.length > 0 ? trimmed : 'overlay-asset'
}

type OverlayAssetToolResult =
  | {
    ok: true
    assetId: string
    name: string
    chromaKey: typeof ASSET_CHROMA_KEY_HEX
    nextStep: string
    image: string
    mediaType: 'image/png'
  }
  | { ok: false; error: string }

const resolveReferenceImages = (
  controller: ToolContext['controller'],
  referenceAssetIds: string[] | undefined,
): { ok: true; images: string[] } | { ok: false; error: string } => {
  const images: string[] = []
  for (const assetId of referenceAssetIds ?? []) {
    const src = controller.getAssetSrc(assetId)
    if (!src) return notFound(assetNotFoundMessage(assetId))
    images.push(dataUrlToBase64(src))
  }
  return { ok: true, images }
}

const generateChromaKeyedOverlay = async (options: {
  apiKey: string
  prompt: string
  referenceImages: string[]
  size: OverlayAssetSize
  quality: 'low' | 'medium' | 'high'
  abortSignal?: AbortSignal
}): Promise<{ dataUrl: string } | { ok: false; error: string }> => {
  try {
    const { createOpenAI } = await import('@ai-sdk/openai')
    const openai = createOpenAI({ apiKey: options.apiKey })
    const fullPrompt = buildOverlayAssetPrompt(options.prompt)

    const { image } = await generateImage({
      model: openai.image('gpt-image-2'),
      prompt: options.referenceImages.length > 0
        ? { text: fullPrompt, images: options.referenceImages }
        : fullPrompt,
      size: OVERLAY_ASSET_SIZE_MAP[options.size],
      providerOptions: {
        openai: {
          quality: options.quality,
          background: 'opaque',
          outputFormat: 'png',
        },
      },
      ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    })

    const mediaType = image.mediaType || 'image/png'
    return { dataUrl: `data:${mediaType};base64,${image.base64}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Overlay asset generation failed: ${message}` }
  }
}

const cutoutAssetName = (
  controller: ToolContext['controller'],
  assetId: string,
  name: string | undefined,
): string => {
  const sourceName = controller.snapshot().assets.find((asset) => asset.id === assetId)?.name
  const fallback = sourceName ? sourceName.replace(/\.png$/i, '') : 'overlay-asset'
  const baseName = sanitizeAssetName(name ?? fallback)
  return `${baseName.replace(/-cutout$/i, '')}-cutout.png`
}

export const createOverlayAssetTools = (
  { controller, emit }: ToolContext,
  options?: { abortSignal?: AbortSignal },
) => {
  const createOverlayAsset = tool({
    description: `Generate a cutout-ready overlay graphic with OpenAI gpt-image-2 and register it as an upload asset.

Use this for decorative or product-specific elements that will sit ON TOP of App Store screenshot compositions via add_image — badges, stickers, illustrations, props, extracted UI fragments, custom marks. Do NOT use it for full mockups, device frames, complete screens, or solid slide backgrounds (prefer shapes/icons/text/set_slide_background for those).

gpt-image-2 cannot emit transparency. This tool forces a flat ${ASSET_CHROMA_KEY_HEX} chroma-key backdrop. After generation you MUST call remove_asset_background on the returned assetId before placing the image.

Prompt only the SUBJECT (style, materials, colors of the object). Do not mention backgrounds or transparency — the tool appends the chroma-key constraints. When extracting or matching something from a user screenshot, pass that screenshot's asset id in referenceAssetIds.`,
    inputSchema: z.object({
      prompt: z.string().min(1).describe(
        'Subject-only description of the overlay element to generate. English. No background instructions.',
      ),
      name: z.string().optional().describe(
        'Short filename-style label for the new asset (e.g. "spark-badge"). Defaults to overlay-asset.',
      ),
      referenceAssetIds: z.array(z.string()).max(4).optional().describe(
        'Optional uploaded screenshot/logo asset ids to attach as visual references (e.g. extract a UI chip from a screenshot). Max 4.',
      ),
      size: z.enum(['square', 'portrait', 'landscape']).optional().describe(
        'Output aspect. Defaults to square. Use portrait/landscape only when the subject needs it.',
      ),
      quality: z.enum(['low', 'medium', 'high']).optional().describe(
        'gpt-image-2 quality. Defaults to medium.',
      ),
    }),
    execute: async ({
      prompt,
      name,
      referenceAssetIds,
      size,
      quality,
    }): Promise<OverlayAssetToolResult> => {
      const apiKey = getAiProviderKey('openai')
      if (!apiKey) {
        return {
          ok: false,
          error: 'OpenAI API key missing. Add VITE_OPENAI_API_KEY to .env.local to generate overlay assets.',
        }
      }

      const references = resolveReferenceImages(controller, referenceAssetIds)
      if (!references.ok) return references

      emit({ tool: 'create_overlay_asset' })

      const generated = await generateChromaKeyedOverlay({
        apiKey,
        prompt,
        referenceImages: references.images,
        size: size ?? 'square',
        quality: quality ?? 'medium',
        ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
      })
      if ('ok' in generated) return generated

      const assetName = `${sanitizeAssetName(name ?? 'overlay-asset')}.png`
      const assetId = controller.addAsset({ name: assetName, src: generated.dataUrl })

      return {
        ok: true,
        assetId,
        name: assetName,
        chromaKey: ASSET_CHROMA_KEY_HEX,
        nextStep: `Call remove_asset_background with assetId "${assetId}" before placing with add_image.`,
        image: dataUrlToBase64(generated.dataUrl),
        mediaType: 'image/png',
      }
    },
    toModelOutput: ({ output }) => {
      if (!output.ok) return { type: 'text', value: JSON.stringify(output) }
      return {
        type: 'content',
        value: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              assetId: output.assetId,
              name: output.name,
              chromaKey: output.chromaKey,
              nextStep: output.nextStep,
            }),
          },
          {
            type: 'file',
            mediaType: output.mediaType,
            data: { type: 'data', data: output.image },
          },
        ],
      }
    },
  })

  const removeAssetBackground = tool({
    description: `Remove the solid ${ASSET_CHROMA_KEY_HEX} chroma-key backdrop from an asset created by create_overlay_asset, producing a transparent PNG registered as a NEW asset.

Always run this after create_overlay_asset before placing the graphic with add_image. Uses an in-browser soft chroma-key (no network call). Returns the transparent image so you can verify edge quality.`,
    inputSchema: z.object({
      assetId: z.string().describe('Asset id of the chroma-keyed image from create_overlay_asset.'),
      name: z.string().optional().describe(
        'Optional label for the transparent asset. Defaults to the source name with "-cutout".',
      ),
    }),
    execute: async ({
      assetId,
      name,
    }): Promise<OverlayAssetToolResult> => {
      const src = controller.getAssetSrc(assetId)
      if (!src) return notFound(assetNotFoundMessage(assetId))

      emit({ tool: 'remove_asset_background' })

      try {
        const transparentDataUrl = await removeChromaKeyBackground(src)
        const assetName = cutoutAssetName(controller, assetId, name)
        const nextAssetId = controller.addAsset({ name: assetName, src: transparentDataUrl })

        return {
          ok: true,
          assetId: nextAssetId,
          name: assetName,
          chromaKey: ASSET_CHROMA_KEY_HEX,
          nextStep: `Place with add_image using assetId "${nextAssetId}".`,
          image: dataUrlToBase64(transparentDataUrl),
          mediaType: 'image/png',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, error: `Background removal failed: ${message}` }
      }
    },
    toModelOutput: ({ output }) => {
      if (!output.ok) return { type: 'text', value: JSON.stringify(output) }
      return {
        type: 'content',
        value: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: true,
              assetId: output.assetId,
              name: output.name,
              chromaKey: output.chromaKey,
              nextStep: output.nextStep,
            }),
          },
          {
            type: 'file',
            mediaType: output.mediaType,
            data: { type: 'data', data: output.image },
          },
        ],
      }
    },
  })

  return {
    create_overlay_asset: createOverlayAsset,
    remove_asset_background: removeAssetBackground,
  }
}
