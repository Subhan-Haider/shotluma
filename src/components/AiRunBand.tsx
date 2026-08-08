import { getNarrationLines, type NarrationState } from '../ai/run-narration'
import { reconcilePlan, type PlannedScreen, type RunPlanEntry } from '../ai/run-plan'
import { Button } from './ui/button'

export type AiRunBandPhase = 'running' | 'done' | 'error'

export type AiRunBandProps = {
  phase: AiRunBandPhase
  /** Screen name in edit mode; the rail is hidden and this names the target instead. */
  targetName?: string
  narration: NarrationState
  plan: PlannedScreen[]
  slidesBuilt: number
  toolCallCount: number
  /** Human-readable detail of the most recent tool call, e.g. "Preview checked". */
  latestActivity: string
  summary: string
  errorMessage: string | null
  onCancel: () => void
  onClose: () => void
  onRetry: () => void
}

const ScreenRail = ({ entries }: { entries: RunPlanEntry[] }) => (
  <div className="ai-run-band__rail">
    <b>SCREENS</b>
    <div className="ai-run-band__rail-list">
      {entries.map((entry, index) => (
        <div
          className={`ai-run-band__screen ai-run-band__screen--${entry.status}`}
          key={`${entry.name}-${index}`}
        >
          <i />
          <span className="ai-run-band__screen-name">{entry.name}</span>
        </div>
      ))}
    </div>
  </div>
)

const kickerText = (options: {
  phase: AiRunBandPhase
  targetName?: string
  entries: RunPlanEntry[]
  plannedTotal: number
}): string => {
  const { phase, targetName, entries, plannedTotal } = options
  if (phase === 'error') return 'RUN STOPPED'
  if (targetName) {
    return phase === 'done' ? `UPDATED · ${targetName}` : `EDITING · ${targetName}`
  }
  if (phase === 'done') {
    const built = entries.length
    return `DONE · ${built} ${built === 1 ? 'SCREEN' : 'SCREENS'}`
  }

  const current = entries.find((entry) => entry.status === 'building')
  const position = current ? entries.indexOf(current) + 1 : entries.length
  const total = Math.max(plannedTotal, entries.length, position)
  const suffix = current?.role ? ` · ${current.role.toUpperCase()}` : ''
  return `SCREEN ${position} OF ${total}${suffix}`
}

const BandActions = ({
  phase,
  toolCallCount,
  latestActivity,
  onCancel,
  onClose,
  onRetry,
}: Pick<
  AiRunBandProps,
  'phase' | 'toolCallCount' | 'latestActivity' | 'onCancel' | 'onClose' | 'onRetry'
>) => (
  <div className="ai-run-band__meta">
    {phase === 'running' && <span className="ai-run-band__spinner" />}
    {/* A bare count says only that something happened. The latest tool detail says
        what, which is the only live signal for a model that streams no reasoning. */}
    {phase === 'running' && latestActivity
      ? (
          <small className="ai-run-band__activity">
            <b>{toolCallCount}</b>
            {latestActivity}
          </small>
        )
      : (
          <small>
            {toolCallCount} {toolCallCount === 1 ? 'action' : 'actions'}
          </small>
        )}
    {phase === 'running' && (
      <Button type="button" variant="outline" className="ai-modal-btn-secondary" onClick={onCancel}>
        Cancel
      </Button>
    )}
    {phase === 'done' && (
      <Button type="button" className="export-button ai-modal-generate" onClick={onClose}>
        <b>Done</b>
      </Button>
    )}
    {phase === 'error' && (
      <Button type="button" variant="outline" className="ai-modal-btn-secondary" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
)

export const AiRunBand = ({
  phase,
  targetName,
  narration,
  plan,
  slidesBuilt,
  toolCallCount,
  latestActivity,
  summary,
  errorMessage,
  onCancel,
  onClose,
  onRetry,
}: AiRunBandProps) => {
  const entries = reconcilePlan({ plan, builtCount: slidesBuilt, running: phase === 'running' })
  const showRail = !targetName && entries.length > 0
  const lines = getNarrationLines(narration)
  const closing = phase === 'error' ? (errorMessage ?? 'The run stopped unexpectedly.') : ''
  const closingText = phase === 'done' ? summary : closing

  return (
    <div
      className={`ai-run-band${showRail ? '' : ' ai-run-band--narrow'}`}
      role="status"
      aria-live="polite"
      aria-label={phase === 'running' ? 'AI run in progress' : 'AI run finished'}
    >
      <div className="ai-run-band__main">
        <div className="ai-run-band__kicker">
          {kickerText({ phase, ...(targetName ? { targetName } : {}), entries, plannedTotal: plan.length })}
        </div>
        <div className={`ai-run-band__live${phase === 'error' ? ' ai-run-band__live--error' : ''}`}>
          <div className="ai-run-band__live-inner">
            {closingText
              ? closingText
              : lines.map((line, index) => (
                  <span
                    className={`ai-run-band__line ai-run-band__line--${line.source}${
                      index < lines.length - 1 ? ' ai-run-band__line--past' : ''
                    }`}
                    key={line.id}
                  >
                    {line.text}
                  </span>
                ))}
            {!closingText && lines.length === 0 && (
              <span className="ai-run-band__line ai-run-band__line--waiting">
                {latestActivity || 'Starting up …'}
              </span>
            )}
          </div>
        </div>
        <BandActions
          phase={phase}
          toolCallCount={toolCallCount}
          latestActivity={latestActivity}
          onCancel={onCancel}
          onClose={onClose}
          onRetry={onRetry}
        />
      </div>
      {showRail && <ScreenRail entries={entries} />}
    </div>
  )
}
