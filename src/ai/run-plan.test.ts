import { describe, expect, it } from 'vitest'
import { parsePlanInput, reconcilePlan } from './run-plan'

const plan = [
  { name: 'Hero', role: 'strongest benefit' },
  { name: 'Feature', role: 'differentiator' },
  { name: 'Ritual', role: 'daily use' },
]

describe('parsePlanInput', () => {
  it('reads names and roles from the declared screens', () => {
    expect(parsePlanInput({ screens: plan })).toEqual(plan)
  })

  it('drops entries without a usable name', () => {
    const parsed = parsePlanInput({ screens: [{ name: '  ', role: 'x' }, { name: 'Hero', role: 'y' }] })
    expect(parsed).toEqual([{ name: 'Hero', role: 'y' }])
  })

  it('tolerates a malformed payload', () => {
    expect(parsePlanInput(undefined)).toEqual([])
    expect(parsePlanInput({ screens: 'nope' })).toEqual([])
    expect(parsePlanInput({ screens: [null, 7] })).toEqual([])
  })

  it('caps the plan so a runaway model cannot flood the rail', () => {
    const screens = Array.from({ length: 40 }, (_, index) => ({ name: `S${index}`, role: 'r' }))
    expect(parsePlanInput({ screens })).toHaveLength(12)
  })

  it('truncates overlong names and roles', () => {
    const [screen] = parsePlanInput({ screens: [{ name: 'x'.repeat(90), role: 'y'.repeat(90) }] })
    expect(screen?.name).toHaveLength(40)
    expect(screen?.role).toHaveLength(60)
  })
})

describe('reconcilePlan', () => {
  it('marks built screens, the current one, and the ones still to come', () => {
    const entries = reconcilePlan({ plan, builtCount: 1, running: true })
    expect(entries.map((entry) => entry.status)).toEqual(['built', 'building', 'planned'])
  })

  it('shows the first screen as building before anything exists', () => {
    const entries = reconcilePlan({ plan, builtCount: 0, running: true })
    expect(entries[0]?.status).toBe('building')
  })

  it('appends screens the plan never announced instead of hiding them', () => {
    const entries = reconcilePlan({ plan, builtCount: 4, running: true })
    expect(entries[3]).toMatchObject({ name: 'Screen 4', status: 'built', unplanned: true })
  })

  it('keeps unbuilt plan entries out of a finished run', () => {
    const entries = reconcilePlan({ plan, builtCount: 2, running: false })
    expect(entries.map((entry) => entry.name)).toEqual(['Hero', 'Feature'])
  })

  it('works without a declared plan by counting built screens', () => {
    const entries = reconcilePlan({ plan: [], builtCount: 2, running: true })
    expect(entries.map((entry) => entry.name)).toEqual(['Screen 1', 'Screen 2', 'Screen 3'])
    expect(entries.map((entry) => entry.status)).toEqual(['built', 'built', 'building'])
    expect(entries.every((entry) => entry.unplanned)).toBe(true)
  })

  it('keeps showing work in progress after the plan is exhausted', () => {
    const entries = reconcilePlan({ plan, builtCount: 3, running: true })
    expect(entries).toHaveLength(4)
    expect(entries[3]).toMatchObject({ status: 'building', unplanned: true })
  })

  it('returns nothing for a finished run that built nothing', () => {
    expect(reconcilePlan({ plan, builtCount: 0, running: false })).toEqual([])
  })
})
