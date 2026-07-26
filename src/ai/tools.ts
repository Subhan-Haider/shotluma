import { createAddIconTool } from './icon-tool'
import { createInspectionTools } from './inspection-tools'
import { createMediaTools } from './media-tools'
import { createOverlayAssetTools } from './overlay-asset-tools'
import { createSlideTools } from './slide-tools'
import { createAddTextTool } from './text-tool'
import {
  createToolContext,
  type AiToolActivity,
} from './tool-context'
import { createUpdateElementTool } from './update-element-tool'
import type { AiEditorController } from './controller'

export type { AiToolActivity } from './tool-context'

type EditorToolOptions = {
  mode?: 'generate' | 'edit'
  onActivity?: (activity: AiToolActivity) => void
  /** When true, expose gpt-image-2 overlay asset tools (requires OpenAI key). */
  enableOverlayAssets?: boolean
  abortSignal?: AbortSignal
}

export function createEditorTools(
  controller: AiEditorController,
  options?: EditorToolOptions,
) {
  const context = createToolContext(controller, options?.onActivity)
  const {
    add_slide: addSlide,
    delete_slide: deleteSlide,
    ...editableSlideTools
  } = createSlideTools(context)
  const overlayTools = options?.enableOverlayAssets
    ? createOverlayAssetTools(context, {
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      })
    : {}
  const editTools = {
    ...editableSlideTools,
    add_text: createAddTextTool(context),
    add_icon: createAddIconTool(context),
    ...createMediaTools(context),
    update_element: createUpdateElementTool(context),
    ...createInspectionTools(context),
    ...overlayTools,
  }

  if (options?.mode === 'edit') return editTools
  return {
    ...editTools,
    add_slide: addSlide,
    delete_slide: deleteSlide,
  }
}

export type EditorTools = ReturnType<typeof createEditorTools>
