import { useEffect, useId, useState } from 'react'
import {
  AI_PROVIDERS,
  type AiProviderId,
} from '../ai/provider-catalog'
import {
  ENVIRONMENT_AI_PROVIDER_KEYS,
  getAiProviderAvailability,
  readStoredAiProviderKeys,
  writeStoredAiProviderKeys,
  type AiProviderKeys,
} from '../ai/provider-config'
import { LockKeyhole } from './icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Input } from './ui/input'

export type AiApiKeysDialogProps = {
  open: boolean
  focusProviderId?: AiProviderId
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export const AiApiKeysDialog = ({
  open,
  focusProviderId,
  onOpenChange,
  onSaved,
}: AiApiKeysDialogProps) => {
  const formId = useId()
  // Remount via parent `key` when opening so draft always loads from storage.
  const [draft, setDraft] = useState<AiProviderKeys>(readStoredAiProviderKeys)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      const targetId = focusProviderId ?? AI_PROVIDERS[0]?.id
      if (!targetId) return
      const node = document.getElementById(`${formId}-${targetId}`)
      if (!(node instanceof HTMLInputElement)) return
      node.focus()
      node.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, focusProviderId, formId])

  const handleSave = () => {
    writeStoredAiProviderKeys(draft)
    onSaved()
    onOpenChange(false)
  }

  const envAvailability = getAiProviderAvailability(ENVIRONMENT_AI_PROVIDER_KEYS)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="ai-keys-dialog">
        <AlertDialogHeader>
          <AlertDialogMedia className="ai-keys-dialog-media">
            <LockKeyhole size={17} />
          </AlertDialogMedia>
          <AlertDialogTitle>API keys</AlertDialogTitle>
          <AlertDialogDescription>
            Keys stay in this browser and are sent only to the provider you select.
            Optional <code>.env.local</code> values still work for local development.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="ai-keys-dialog-fields">
          {AI_PROVIDERS.map((provider) => {
            const inputId = `${formId}-${provider.id}`
            const hasEnvFallback = envAvailability[provider.id] && !draft[provider.id]
            return (
              <label className="ai-keys-dialog-field" htmlFor={inputId} key={provider.id}>
                <span>{provider.label}</span>
                <Input
                  id={inputId}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={hasEnvFallback ? 'Using .env.local' : 'Paste API key'}
                  value={draft[provider.id]}
                  onChange={(event) => {
                    const value = event.target.value
                    setDraft((current) => ({ ...current, [provider.id]: value }))
                  }}
                />
              </label>
            )
          })}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel className="ai-keys-dialog-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className="ai-keys-dialog-save"
            onClick={handleSave}
          >
            Save keys
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
