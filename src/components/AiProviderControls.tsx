import {
  AI_PROVIDERS,
  AI_REASONING_EFFORT_LABELS,
  clampAiReasoningEffort,
  findAiModelById,
  getAiModel,
  getAiProvider,
  type AiModelSelection,
  type AiProviderId,
  type AiReasoningEffort,
} from '../ai/provider-catalog'
import {
  AlertCircle,
  ChatGpt,
  ChevronDown,
  Claude,
  GoogleGemini,
  Grok,
  KimiAi,
  Qwen,
} from './icons'
import { Button } from './ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import type { AiProviderAvailability } from '../ai/provider-config'
import type { ComponentType } from 'react'

const AI_PROVIDER_ICONS: Record<AiProviderId, ComponentType<{ className?: string; size?: number }>> = {
  moonshot: KimiAi,
  google: GoogleGemini,
  qwen: Qwen,
  openai: ChatGpt,
  anthropic: Claude,
  xai: Grok,
}

export type AiProviderControlsProps = {
  selection: AiModelSelection
  availability: AiProviderAvailability
  transportAvailability: AiProviderAvailability
  onModelSelect: (providerId: AiProviderId, modelId: string) => void
  onReasoningEffortChange: (reasoningEffort: AiReasoningEffort) => void
  onManageKeys: (providerId: AiProviderId) => void
}

const triggerLabel = (
  modelLabel: string,
  reasoningEffort: AiReasoningEffort | undefined,
): string => {
  if (!reasoningEffort) return modelLabel
  return `${modelLabel} · ${AI_REASONING_EFFORT_LABELS[reasoningEffort]}`
}

export const AiProviderControls = ({
  selection,
  availability,
  transportAvailability,
  onModelSelect,
  onReasoningEffortChange,
  onManageKeys,
}: AiProviderControlsProps) => {
  const provider = getAiProvider(selection.provider)
  const model = getAiModel(selection)
  const isConfigured = availability[selection.provider]
  const isTransportAvailable = transportAvailability[selection.provider]
  const reasoningEffort = clampAiReasoningEffort(model, selection.reasoningEffort)
  const SelectedIcon = AI_PROVIDER_ICONS[selection.provider]

  return (
    <Popover>
      <PopoverTrigger
        render={(
          <Button
            type="button"
            variant="outline"
            className="ai-model-picker-trigger"
            aria-label="AI model and reasoning effort"
          />
        )}
      >
        <span
          className={`ai-model-picker-status${isConfigured ? ' is-ready' : ' is-missing'}`}
          aria-hidden="true"
        />
        <SelectedIcon className="ai-provider-icon" size={15} />
        <span className="ai-model-picker-trigger__label">
          {triggerLabel(model.label, reasoningEffort)}
        </span>
        <ChevronDown size={14} className="ai-model-picker-trigger__chevron" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="ai-model-picker-popover"
      >
        <div className="ai-model-picker-section">
          <span className="ai-model-picker-section__label" id="ai-model-label">
            Model
          </span>
          <Select
            value={selection.model}
            onValueChange={(value) => {
              if (typeof value !== 'string') return
              const match = findAiModelById(value)
              onModelSelect(match.provider.id, match.model.id)
            }}
          >
            <SelectTrigger
              id="ai-model-trigger"
              className="ai-provider-trigger"
              aria-labelledby="ai-model-label"
              aria-label="AI model"
            >
              <SelectValue>
                <span>{`${provider.label} · ${model.label}`}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" className="ai-modal-select-content">
              {AI_PROVIDERS.map((option) => {
                const ProviderIcon = AI_PROVIDER_ICONS[option.id]
                return (
                  <SelectGroup key={option.id}>
                    <SelectLabel>
                      <ProviderIcon className="ai-provider-icon" size={14} />
                      <span>
                        {availability[option.id]
                          ? option.label
                          : transportAvailability[option.id]
                            ? `${option.label} · key missing`
                            : `${option.label} · local proxy unavailable`}
                      </span>
                    </SelectLabel>
                    {option.models.map((modelOption) => (
                      <SelectItem key={modelOption.id} value={modelOption.id}>
                        {modelOption.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {model.reasoningEfforts && reasoningEffort && (
          <div className="ai-model-picker-section">
            <span className="ai-model-picker-section__label" id="ai-effort-label">
              Reasoning effort
            </span>
            <div
              className="ai-effort-segmented"
              role="radiogroup"
              aria-labelledby="ai-effort-label"
            >
              {model.reasoningEfforts.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={reasoningEffort === option}
                  className={reasoningEffort === option ? 'is-active' : undefined}
                  onClick={() => onReasoningEffortChange(option)}
                >
                  {AI_REASONING_EFFORT_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="ai-provider-meta">
          <small className="ai-provider-description">{model.description}</small>
          <button
            type="button"
            className="ai-provider-keys-link"
            onClick={() => onManageKeys(selection.provider)}
          >
            API keys
          </button>
        </div>

        {!isConfigured && (
          <div className="ai-provider-warning" role="alert">
            <AlertCircle size={15} />
            <div className="ai-provider-warning-body">
              <span>
                {isTransportAvailable
                  ? <><b>API key missing.</b> Add your {provider.label} key to generate with this model.</>
                  : <><b>Local proxy unavailable.</b> Moonshot can be used only from localhost.</>}
              </span>
              {isTransportAvailable && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ai-provider-warning-action"
                  onClick={() => onManageKeys(selection.provider)}
                >
                  Enter API key
                </Button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
