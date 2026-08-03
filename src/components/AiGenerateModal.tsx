import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from 'react'
import {
  clampAiReasoningEffort,
  findAiModelById,
  type AiModelSelection,
  type AiProviderId,
} from '../ai/provider-catalog'
import {
  INITIAL_AI_SELECTION,
  getAiProviderTransportAvailability,
  getResolvedAiProviderAvailability,
  type AiProviderAvailability,
} from '../ai/provider-config'
import { runAiGeneration, type AiRunEvent, type AiToolActivity } from '../ai/runner'
import { fileToDataUrl, uid } from '../utils'
import { filterAcceptedImageFiles } from './ai-modal-image-files'
import { shouldCloseAiModalOnKeydown } from './ai-modal-keyboard'
import { AiApiKeysDialog } from './AiApiKeysDialog'
import { AiProviderControls } from './AiProviderControls'
import { CopyCodingPromptButton } from './CopyCodingPrompt'
import { Plus, StartUp02, Upload, X } from './icons'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'
import type { AiEditorController } from '../ai/controller'

type ImageDraft = { id: string; file: File; name: string; dataUrl: string }
type LogEntry = { kind: 'status' | 'tool'; text: string }
type RunPhase = 'idle' | 'running' | 'done' | 'error'

const toImageDrafts = async (files: File[], idPrefix: 'logo' | 'shot'): Promise<ImageDraft[]> =>
  Promise.all(files.map(async (file) => ({
    id: uid(idPrefix),
    file,
    name: file.name,
    dataUrl: await fileToDataUrl(file),
  })))

export type AiGenerateModalProps = {
  open: boolean
  onClose: () => void
  controller: AiEditorController
  targetSlide?: { id: string; name: string }
  onPrepareRun: (files: { name: string; dataUrl: string }[]) => { assetId: string; name: string; dataUrl: string }[]
  onFinished: (slidesCreated: number) => void
  onActivity?: (activity: AiToolActivity | null) => void
}

type ImageDropzoneProps = {
  label: string
  inputRef: RefObject<HTMLInputElement | null>
  onFiles: (files: File[]) => void
  variant?: 'banner' | 'logo' | 'add'
}

type LogoPreviewProps = {
  logo: ImageDraft
  onRemove: () => void
}

const ImageDropzone = ({
  label,
  inputRef,
  onFiles,
  variant = 'banner',
}: ImageDropzoneProps) => {
  const [isDragging, setIsDragging] = useState(false)
  const dragDepthRef = useRef(0)

  const resetDragState = () => {
    dragDepthRef.current = 0
    setIsDragging(false)
  }

  const handleDragEnter = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current -= 1
    if (dragDepthRef.current <= 0) resetDragState()
  }

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resetDragState()
    const files = filterAcceptedImageFiles(event.dataTransfer.files)
    if (files.length > 0) onFiles(files)
  }

  return (
    <button
      type="button"
      className={`ai-modal-dropzone ai-modal-dropzone--${variant}${isDragging ? ' ai-modal-dropzone--active' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      aria-label={label}
    >
      {variant === 'add' ? <Plus size={16} /> : <Upload size={16} />}
      {variant === 'banner' && <span>{label}</span>}
    </button>
  )
}

const LogoPreview = ({ logo, onRemove }: LogoPreviewProps) => (
  <div className="ai-modal-logo-slot">
    <img src={logo.dataUrl} alt={logo.name} />
    <button
      type="button"
      className="ai-modal-logo-slot__remove"
      onClick={onRemove}
      aria-label={`Remove ${logo.name}`}
    >
      <X size={11} />
    </button>
  </div>
)

type IdleContentProps = {
  isEditMode: boolean
  appName: string
  description: string
  logo: ImageDraft | null
  screenshots: ImageDraft[]
  enableOverlayAssets: boolean
  overlayAssetsAvailable: boolean
  logoInputRef: RefObject<HTMLInputElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  onAppNameChange: (appName: string) => void
  onDescriptionChange: (description: string) => void
  onLogoFiles: (files: File[]) => void
  onRemoveLogo: () => void
  onScreenshotFiles: (files: File[]) => void
  onRemoveScreenshot: (id: string) => void
  onEnableOverlayAssetsChange: (enabled: boolean) => void
}

const IdleContent = ({
  isEditMode,
  appName,
  description,
  logo,
  screenshots,
  enableOverlayAssets,
  overlayAssetsAvailable,
  logoInputRef,
  fileInputRef,
  onAppNameChange,
  onDescriptionChange,
  onLogoFiles,
  onRemoveLogo,
  onScreenshotFiles,
  onRemoveScreenshot,
  onEnableOverlayAssetsChange,
}: IdleContentProps) => (
  <>
    {!isEditMode && (
      <div className="ai-modal-app-row">
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            const files = event.target.files
            if (files?.length) onLogoFiles(Array.from(files))
            event.target.value = ''
          }}
        />
        {logo
          ? <LogoPreview logo={logo} onRemove={onRemoveLogo} />
          : (
              <ImageDropzone
                label="Upload app logo"
                inputRef={logoInputRef}
                onFiles={onLogoFiles}
                variant="logo"
              />
            )}
        <div className="ai-modal-field ai-modal-field--grow">
          <label htmlFor="ai-modal-app-name">App name</label>
          <Input
            id="ai-modal-app-name"
            type="text"
            value={appName}
            onChange={(event) => onAppNameChange(event.target.value)}
            placeholder="e.g. Shotluma"
            autoComplete="off"
          />
        </div>
      </div>
    )}
    <div className="ai-modal-field">
      <div className="ai-modal-field__header">
        <label htmlFor="ai-modal-description">
          {isEditMode ? 'What would you like to change?' : 'What is your app about?'}
        </label>
        {!isEditMode && <CopyCodingPromptButton />}
      </div>
      <Textarea
        id="ai-modal-description"
        rows={4}
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder={isEditMode
          ? 'For example: shorten the headline, make the device larger, and increase contrast …'
          : 'Audience, core features, tone …'}
      />
    </div>
    <div className="ai-modal-field">
      <label>{isEditMode ? 'Screenshots (optional)' : 'Screenshots'}</label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(event) => {
          const files = event.target.files
          if (files?.length) onScreenshotFiles(Array.from(files))
          event.target.value = ''
        }}
      />
      {screenshots.length === 0
        ? (
            <ImageDropzone
              label={isEditMode ? 'Drop or add screenshot' : 'Drop or choose screenshots'}
              inputRef={fileInputRef}
              onFiles={onScreenshotFiles}
            />
          )
        : (
            <div className="ai-modal-thumbs">
              {screenshots.map((shot) => (
                <div className="ai-modal-thumb" key={shot.id}>
                  <img src={shot.dataUrl} alt={shot.name} />
                  <button
                    type="button"
                    onClick={() => onRemoveScreenshot(shot.id)}
                    aria-label={`Remove ${shot.name}`}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              <ImageDropzone
                label="Add screenshot"
                inputRef={fileInputRef}
                onFiles={onScreenshotFiles}
                variant="add"
              />
            </div>
          )}
      {isEditMode && (
        <small className="ai-modal-hint">
          Only needed if you want to use a new image or app screenshot.
        </small>
      )}
    </div>
    <div className="ai-modal-overlay-toggle">
      <Switch
        id="ai-modal-overlay-assets"
        checked={enableOverlayAssets}
        disabled={!overlayAssetsAvailable}
        onCheckedChange={onEnableOverlayAssetsChange}
      />
      <label htmlFor="ai-modal-overlay-assets" className="ai-modal-overlay-toggle__copy">
        <b>Decorative graphics</b>
        <span>
          Adds 1–2 cutout elements on top of your screens — badges, stickers, snippets of your UI. Never device frames or mockups.
        </span>
        <small>
          {overlayAssetsAvailable
            ? 'Uses your OpenAI key'
            : 'Requires an OpenAI API key. Enter it via API keys.'}
        </small>
      </label>
    </div>
  </>
)

const RunningContent = ({
  log,
  logRef,
  reasoningTail,
  assistantText,
}: {
  log: LogEntry[]
  logRef: RefObject<HTMLDivElement | null>
  reasoningTail: string
  assistantText: string
}) => (
  <div className="ai-modal-run">
    <div className="ai-modal-log" ref={logRef}>
      {log.map((entry, index) => (
        <div
          className={`ai-modal-log-entry ai-modal-log-entry--${entry.kind}`}
          key={`${entry.kind}-${index}`}
        >
          {entry.text}
        </div>
      ))}
      <div className="ai-modal-log-entry ai-modal-log-entry--spinner">
        <span className="ai-modal-spinner" />
        {reasoningTail ? `Thinking … ${reasoningTail}` : 'Generating …'}
      </div>
    </div>
    {assistantText && <p className="ai-modal-assistant-text">{assistantText}</p>}
  </div>
)

const ResultContent = ({
  phase,
  doneInfo,
  isEditMode,
  assistantText,
  errorMessage,
}: {
  phase: RunPhase
  doneInfo: { summary: string; slidesCreated: number } | null
  isEditMode: boolean
  assistantText: string
  errorMessage: string | null
}) => {
  if (phase === 'done' && doneInfo) {
    return (
      <div className="ai-modal-result ai-modal-result--done">
        <p>
          {isEditMode
            ? 'Screen updated.'
            : `Done: ${doneInfo.slidesCreated} ${doneInfo.slidesCreated === 1 ? 'screen' : 'screens'} created.`}
        </p>
        {(doneInfo.summary || assistantText) && (
          <p className="ai-modal-assistant-text">
            {doneInfo.summary || assistantText}
          </p>
        )}
      </div>
    )
  }
  if (phase === 'error') {
    return <div className="ai-modal-result ai-modal-result--error"><p>{errorMessage}</p></div>
  }
  return null
}

const ModalFooter = ({
  phase,
  isEditMode,
  canGenerate,
  selection,
  availability,
  transportAvailability,
  onModelSelect,
  onReasoningEffortChange,
  onManageKeys,
  onGenerate,
  onCancel,
  onClose,
  onRetry,
}: {
  phase: RunPhase
  isEditMode: boolean
  canGenerate: boolean
  selection: AiModelSelection
  availability: AiProviderAvailability
  transportAvailability: AiProviderAvailability
  onModelSelect: (provider: AiProviderId, modelId: string) => void
  onReasoningEffortChange: (reasoningEffort: NonNullable<AiModelSelection['reasoningEffort']>) => void
  onManageKeys: (providerId: AiProviderId) => void
  onGenerate: () => void
  onCancel: () => void
  onClose: () => void
  onRetry: () => void
}) => {
  if (phase === 'idle') {
    return (
      <>
        <AiProviderControls
          selection={selection}
          availability={availability}
          transportAvailability={transportAvailability}
          onModelSelect={onModelSelect}
          onReasoningEffortChange={onReasoningEffortChange}
          onManageKeys={onManageKeys}
        />
        <Button
          type="button"
          className="ai-modal-generate"
          onClick={onGenerate}
          disabled={!canGenerate}
        >
          <StartUp02 size={16} data-icon="inline-start" />
          <b>{isEditMode ? 'Edit' : 'Generate'}</b>
        </Button>
      </>
    )
  }
  if (phase === 'running') {
    return (
      <Button type="button" variant="outline" className="ai-modal-btn-secondary" onClick={onCancel}>
        Cancel
      </Button>
    )
  }
  if (phase === 'done') {
    return (
      <Button type="button" className="ai-modal-generate" onClick={onClose}>
        <b>Close</b>
      </Button>
    )
  }
  return (
    <Button type="button" variant="outline" className="ai-modal-btn-secondary" onClick={onRetry}>
      Try again
    </Button>
  )
}

export const AiGenerateModal = ({ open, onClose, controller, targetSlide, onPrepareRun, onFinished, onActivity }: AiGenerateModalProps) => {
  const [appName, setAppName] = useState('')
  const [description, setDescription] = useState('')
  const [logo, setLogo] = useState<ImageDraft | null>(null)
  const [screenshots, setScreenshots] = useState<ImageDraft[]>([])
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [log, setLog] = useState<LogEntry[]>([])
  const [assistantText, setAssistantText] = useState('')
  const [reasoningTail, setReasoningTail] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [doneInfo, setDoneInfo] = useState<{ summary: string; slidesCreated: number } | null>(null)
  const [selection, setSelection] = useState<AiModelSelection>(INITIAL_AI_SELECTION)
  const [enableOverlayAssets, setEnableOverlayAssets] = useState(false)
  const [keysRevision, setKeysRevision] = useState(0)
  const [keysDialogOpen, setKeysDialogOpen] = useState(false)
  const [keysDialogInstance, setKeysDialogInstance] = useState(0)
  const [keysFocusProviderId, setKeysFocusProviderId] = useState<AiProviderId | undefined>()
  const availability: AiProviderAvailability = getResolvedAiProviderAvailability()
  const transportAvailability = getAiProviderTransportAvailability()
  void keysRevision

  const logoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    // Scroll only the log container itself — scrollIntoView would cancel the canvas
    // stage's smooth follow-scroll while the AI is working.
    const node = logRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [log, assistantText])

  const requestClose = () => {
    if (phase === 'running' || keysDialogOpen) return
    setPhase('idle')
    onClose()
  }

  useEffect(() => {
    if (!open || keysDialogOpen) return
    const handleKeydown = (event: KeyboardEvent) => {
      const isNestedPopupOpen = Boolean(document.querySelector(
        '[data-slot="select-content"], [data-slot="popover-content"]',
      ))
      if (shouldCloseAiModalOnKeydown(event, isNestedPopupOpen)) requestClose()
    }
    window.addEventListener('keydown', handleKeydown, true)
    return () => window.removeEventListener('keydown', handleKeydown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase, keysDialogOpen])

  if (!open) return null

  const isEditMode = Boolean(targetSlide)
  const canGenerate = Boolean(description.trim())
    && (isEditMode || (Boolean(appName.trim()) && logo !== null && screenshots.length > 0))
    && availability[selection.provider]

  const refreshAvailability = () => {
    setKeysRevision((current) => current + 1)
  }

  const handleManageKeys = (providerId: AiProviderId) => {
    setKeysFocusProviderId(providerId)
    setKeysDialogInstance((current) => current + 1)
    setKeysDialogOpen(true)
  }

  const handleLogoFiles = async (files: File[]) => {
    const [file] = filterAcceptedImageFiles(files)
    if (!file) return
    const [draft] = await toImageDrafts([file], 'logo')
    if (!draft) return
    setLogo(draft)
  }

  const handleScreenshotFiles = async (files: File[]) => {
    const accepted = filterAcceptedImageFiles(files)
    if (!accepted.length) return
    const drafts = await toImageDrafts(accepted, 'shot')
    setScreenshots((current) => [...current, ...drafts])
  }

  const removeScreenshot = (id: string) => setScreenshots((current) => current.filter((shot) => shot.id !== id))

  const handleModelSelect = (provider: AiProviderId, modelId: string) => {
    const { model } = findAiModelById(modelId)
    const reasoningEffort = clampAiReasoningEffort(model, selection.reasoningEffort)
    setSelection({
      provider,
      model: modelId,
      ...(reasoningEffort ? { reasoningEffort } : {}),
    })
  }

  const handleEvent = (event: AiRunEvent) => {
    if (cancelledRef.current) return
    if (event.type === 'status') setLog((current) => [...current, { kind: 'status', text: event.message }])
    else if (event.type === 'tool') {
      setLog((current) => [...current, { kind: 'tool', text: `${event.name}: ${event.detail}` }])
      setReasoningTail('')
    } else if (event.type === 'text') {
      setAssistantText((current) => current + event.delta)
      setReasoningTail('')
    } else if (event.type === 'reasoning') {
      setReasoningTail((current) => (current + event.delta).slice(-160))
    } else if (event.type === 'done') {
      setDoneInfo({ summary: event.summary, slidesCreated: event.slidesCreated })
      setPhase('done')
      onActivity?.(null)
      onFinished(event.slidesCreated)
    } else {
      setErrorMessage(event.message)
      setPhase('error')
      onActivity?.(null)
    }
  }

  const handleGenerate = async () => {
    if (!canGenerate || phase === 'running') return
    const filesToPrepare = [
      ...screenshots.map((shot) => ({ name: shot.name, dataUrl: shot.dataUrl })),
      ...(!isEditMode && logo ? [{ name: logo.name, dataUrl: logo.dataUrl }] : []),
    ]
    const prepared = onPrepareRun(filesToPrepare)
    const preparedScreenshots = prepared.slice(0, screenshots.length)
    const preparedLogo = !isEditMode && logo ? prepared[screenshots.length] : undefined
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    cancelledRef.current = false
    setLog([])
    setAssistantText('')
    setReasoningTail('')
    setErrorMessage(null)
    setDoneInfo(null)
    setPhase('running')
    await runAiGeneration({
      selection,
      description,
      screenshots: preparedScreenshots,
      ...(!isEditMode && appName.trim() ? { appName: appName.trim() } : {}),
      ...(preparedLogo ? { logo: preparedLogo } : {}),
      controller,
      ...(targetSlide ? { targetSlideId: targetSlide.id } : {}),
      ...(enableOverlayAssets && availability.openai
        ? { enableOverlayAssets: true }
        : {}),
      signal: abortController.signal,
      onEvent: handleEvent,
      ...(onActivity ? { onActivity } : {}),
    })
  }

  const handleCancel = () => {
    cancelledRef.current = true
    abortControllerRef.current?.abort()
    setPhase('idle')
    onActivity?.(null)
  }

  const handleRetry = () => {
    setErrorMessage(null)
    setPhase('idle')
  }

  return (
    <>
      <div
        className={`ai-modal-overlay${phase !== 'idle' ? ' ai-modal-overlay--live' : ''}`}
        onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}
      >
        <div className="ai-modal-card" role="dialog" aria-modal="true" aria-label={isEditMode ? 'Edit screen with AI' : 'Generate with AI'}>
          <div className="ai-modal-header">
            <div className="ai-modal-title">
              <StartUp02 size={16} />
              <div>
                <h2>{isEditMode ? 'Edit screen with AI' : 'Generate with AI'}</h2>
                {targetSlide && <span>{targetSlide.name}</span>}
              </div>
            </div>
            <button className="ai-modal-close" onClick={requestClose} disabled={phase === 'running'} aria-label="Close"><X size={16} /></button>
          </div>

          <div className="ai-modal-body">
            {phase === 'idle' && (
              <IdleContent
                isEditMode={isEditMode}
                appName={appName}
                description={description}
                logo={logo}
                screenshots={screenshots}
                enableOverlayAssets={enableOverlayAssets && availability.openai}
                overlayAssetsAvailable={availability.openai}
                logoInputRef={logoInputRef}
                fileInputRef={fileInputRef}
                onAppNameChange={setAppName}
                onDescriptionChange={setDescription}
                onLogoFiles={(files) => {
                  void handleLogoFiles(files)
                }}
                onRemoveLogo={() => setLogo(null)}
                onScreenshotFiles={(files) => {
                  void handleScreenshotFiles(files)
                }}
                onRemoveScreenshot={removeScreenshot}
                onEnableOverlayAssetsChange={setEnableOverlayAssets}
              />
            )}

            {phase === 'running' && (
              <RunningContent
                log={log}
                logRef={logRef}
                reasoningTail={reasoningTail}
                assistantText={assistantText}
              />
            )}
            <ResultContent
              phase={phase}
              doneInfo={doneInfo}
              isEditMode={isEditMode}
              assistantText={assistantText}
              errorMessage={errorMessage}
            />
          </div>

          <div className={`ai-modal-footer${phase === 'idle' ? ' ai-modal-footer--idle' : ''}`}>
            <ModalFooter
              phase={phase}
              isEditMode={isEditMode}
              canGenerate={canGenerate}
              selection={selection}
              availability={availability}
              transportAvailability={transportAvailability}
              onModelSelect={handleModelSelect}
              onReasoningEffortChange={(reasoningEffort) => {
                setSelection((current) => ({ ...current, reasoningEffort }))
              }}
              onManageKeys={handleManageKeys}
              onGenerate={() => void handleGenerate()}
              onCancel={handleCancel}
              onClose={requestClose}
              onRetry={handleRetry}
            />
          </div>
        </div>
      </div>
      <AiApiKeysDialog
        key={keysDialogInstance}
        open={keysDialogOpen}
        {...(keysFocusProviderId ? { focusProviderId: keysFocusProviderId } : {})}
        onOpenChange={setKeysDialogOpen}
        onSaved={refreshAvailability}
      />
    </>
  )
}
