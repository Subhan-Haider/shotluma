import { describe, expect, it, vi } from 'vitest'
import { createDeclarePlanTool } from './plan-tool'
import type { ToolContext } from './tool-context'

const contextWith = (emit: ToolContext['emit']): ToolContext => ({
  controller: {} as ToolContext['controller'],
  emit,
})

type PlanTool = ReturnType<typeof createDeclarePlanTool>
type ExecuteOptions = Parameters<PlanTool['execute']>[1]

/** The AI SDK passes call metadata we do not exercise here. */
const EXECUTE_OPTIONS = { toolCallId: 'call-1', messages: [] } as unknown as ExecuteOptions

const run = async (screens: { name: string; role: string }[]) => {
  const emit = vi.fn()
  const tool = createDeclarePlanTool(contextWith(emit))
  const result = await tool.execute({ screens }, EXECUTE_OPTIONS)
  return { emit, result }
}

describe('createDeclarePlanTool', () => {
  it('acknowledges the declared screens without mutating the project', async () => {
    const { result } = await run([
      { name: 'Hero', role: 'strongest benefit' },
      { name: 'Ritual', role: 'daily use' },
    ])

    expect(result).toMatchObject({ ok: true, acknowledged: 2 })
  })

  it('reports activity so the editor can react to the plan', async () => {
    const { emit } = await run([{ name: 'Hero', role: 'benefit' }])

    expect(emit).toHaveBeenCalledWith({ tool: 'declare_plan' })
  })

  it('counts only screens with a usable name', async () => {
    const { result } = await run([{ name: '  ', role: 'x' }, { name: 'Hero', role: 'y' }])

    expect(result).toMatchObject({ acknowledged: 1 })
  })
})
