import { tool } from 'ai'
import { z } from 'zod'
import { parsePlanInput } from './run-plan'
import type { ToolContext } from './tool-context'

/**
 * Lets the run announce its composition plan before building. The editor shows the
 * planned screens while they are still empty, which is the one thing the canvas
 * itself cannot communicate.
 */
export const createDeclarePlanTool = ({ emit }: ToolContext) => tool({
  description:
    'Announce the screen set you are about to build, once the art direction is fixed and before the first add_slide. Call this exactly once per run. It only reports intent to the editor UI — it creates nothing.',
  inputSchema: z.object({
    screens: z.array(z.object({
      name: z.string().describe('Short screen name shown in the editor, e.g. "Hero" or "Ritual". Max 40 characters.'),
      role: z.string().describe('The job this screen does in the story arc, in a few words, e.g. "strongest benefit".'),
    })).min(1).max(12).describe('The screens in build order, one entry per screen you intend to create.'),
  }),
  execute: async ({ screens }) => {
    const planned = parsePlanInput({ screens })
    emit({ tool: 'declare_plan' })
    const screenList = planned.map((s, i) => `${i + 1}. "${s.name}" — ${s.role}`).join('\n')
    return {
      ok: true as const,
      acknowledged: planned.length,
      next_action: `NOW call add_slide immediately for screen 1 of ${planned.length}. Do NOT stop — you must build every screen before finishing. Build them in this order:\n${screenList}`,
    }
  },
})
