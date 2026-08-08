/**
 * The screen plan a run declares before it starts building.
 *
 * The model decides the screen count itself during art direction, so without a
 * declared plan the UI can only count slides after the fact. `declare_plan` makes
 * that intent visible; the plan stays advisory — a run may end up building more or
 * fewer screens, and `reconcilePlan` is what keeps the rail honest when it does.
 */

export type PlannedScreen = {
  name: string
  role: string
}

export type RunPlanEntry = PlannedScreen & {
  status: 'planned' | 'building' | 'built'
  /** True for a screen that was built although the plan did not announce it. */
  unplanned: boolean
}

const MAX_PLANNED_SCREENS = 12

const cleanField = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

/** Reads the raw `declare_plan` tool input off the stream without trusting its shape. */
export const parsePlanInput = (input: unknown): PlannedScreen[] => {
  const data = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const screens = Array.isArray(data['screens']) ? data['screens'] : []

  return screens
    .map((entry) => {
      const screen = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
      return { name: cleanField(screen['name'], 40), role: cleanField(screen['role'], 60) }
    })
    .filter((screen) => screen.name.length > 0)
    .slice(0, MAX_PLANNED_SCREENS)
}

/**
 * Projects the declared plan onto the number of screens actually built.
 *
 * `builtCount` counts finished screens; the next entry is the one in progress.
 * Extra screens beyond the plan are appended as unplanned rather than dropped, and a
 * plan that overshoots keeps its remaining entries visible while the run is live.
 */
export const reconcilePlan = (options: {
  plan: PlannedScreen[]
  builtCount: number
  running: boolean
}): RunPlanEntry[] => {
  const { plan, builtCount, running } = options
  const entries: RunPlanEntry[] = plan.map((screen, index) => ({
    ...screen,
    status: index < builtCount ? 'built' : (index === builtCount && running ? 'building' : 'planned'),
    unplanned: false,
  }))

  for (let index = plan.length; index < builtCount; index += 1) {
    entries.push({
      name: `Screen ${index + 1}`,
      role: '',
      status: 'built',
      unplanned: true,
    })
  }

  // A live run is always working on something. Once the declared plan is exhausted —
  // or when no plan was declared at all — the screen in progress still needs an entry,
  // otherwise the rail claims the run is finished while it keeps building.
  if (running && builtCount >= plan.length) {
    entries.push({
      name: `Screen ${builtCount + 1}`,
      role: '',
      status: 'building',
      unplanned: true,
    })
  }

  // A finished run never shows screens it did not build.
  return running ? entries : entries.filter((entry) => entry.status === 'built')
}
