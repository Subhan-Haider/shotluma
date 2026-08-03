import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AiProviderControls } from './AiProviderControls'
import type { ComponentProps, ReactNode } from 'react'

vi.mock('./ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectLabel: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  SelectItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  SelectTrigger: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  SelectValue: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('./ui/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

describe('AI provider controls', () => {
  it('shows a missing-key warning with a button to open the keys dialog', () => {
    const markup = renderToStaticMarkup(
      <AiProviderControls
        selection={{ provider: 'openai', model: 'gpt-5.6-terra' }}
        availability={{
          moonshot: true,
          google: true,
          qwen: true,
          openai: false,
          anthropic: true,
          xai: true,
        }}
        onModelSelect={() => undefined}
        onReasoningEffortChange={() => undefined}
        onManageKeys={() => undefined}
      />,
    )

    expect(markup).toContain('API key missing.')
    expect(markup).toContain('Add your OpenAI key')
    expect(markup).toContain('Enter API key')
    expect(markup).toContain('OpenAI · key missing')
    expect(markup).toContain('API keys')
    expect(markup).not.toContain('.env.local')
  })

  it('does not show a missing-key warning for a configured provider', () => {
    const markup = renderToStaticMarkup(
      <AiProviderControls
        selection={{ provider: 'google', model: 'gemini-3.6-flash' }}
        availability={{
          moonshot: false,
          google: true,
          qwen: false,
          openai: false,
          anthropic: false,
          xai: false,
        }}
        onModelSelect={() => undefined}
        onReasoningEffortChange={() => undefined}
        onManageKeys={() => undefined}
      />,
    )

    expect(markup).not.toContain('API key missing.')
    expect(markup).toContain('Google · Gemini 3.6 Flash')
    expect(markup).toContain('API keys')
  })

  it('shows model-specific reasoning effort chips and omits them for Moonshot', () => {
    const openAiMarkup = renderToStaticMarkup(
      <AiProviderControls
        selection={{
          provider: 'openai',
          model: 'gpt-5.6-sol',
          reasoningEffort: 'high',
        }}
        availability={{
          moonshot: false,
          google: false,
          qwen: false,
          openai: true,
          anthropic: false,
          xai: false,
        }}
        onModelSelect={() => undefined}
        onReasoningEffortChange={() => undefined}
        onManageKeys={() => undefined}
      />,
    )

    expect(openAiMarkup).toContain('Reasoning effort')
    expect(openAiMarkup).not.toContain('Provider default')
    expect(openAiMarkup).toContain('Low')
    expect(openAiMarkup).toContain('Medium')
    expect(openAiMarkup).toContain('High')
    expect(openAiMarkup).toContain('XHigh')
    expect(openAiMarkup).toContain('Max')
    expect(openAiMarkup).toContain('role="radiogroup"')

    const moonshotMarkup = renderToStaticMarkup(
      <AiProviderControls
        selection={{
          provider: 'moonshot',
          model: 'kimi-k3',
          reasoningEffort: 'high',
        }}
        availability={{
          moonshot: true,
          google: false,
          qwen: false,
          openai: false,
          anthropic: false,
          xai: false,
        }}
        onModelSelect={() => undefined}
        onReasoningEffortChange={() => undefined}
        onManageKeys={() => undefined}
      />,
    )

    expect(moonshotMarkup).toContain('Reasoning effort')
    expect(moonshotMarkup).toContain('Low')
    expect(moonshotMarkup).toContain('High')
    expect(moonshotMarkup).toContain('Max')
    expect(moonshotMarkup).not.toContain('Medium')
    expect(moonshotMarkup).not.toContain('Provider default')
    expect(moonshotMarkup).toContain('Moonshot · Kimi K3')
  })
})
