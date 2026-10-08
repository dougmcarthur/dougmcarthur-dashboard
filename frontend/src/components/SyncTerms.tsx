import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, type SyncTarget } from '../api'
import {
  checkRunLines,
  pitchGate,
  targetsToRead,
  termsOf,
  type TermsFacts,
  type TermsState,
} from '../../../shared/syncTerms'
import { localToday, shortDate } from '../format'
import { Banner, Card } from './ui/Surface'
import { Button } from './ui/Button'

/**
 * What a sync target's own site says about pitches from people it does not
 * know, wherever the target is shown.
 *
 * One component for the Sync page and the Review pane, and the words come from
 * `termsOf`, so the two cannot describe the same company in different ways. The
 * rule it holds is the one the feature exists for: a refusal is not a footnote.
 * It is the first thing on the row, it carries the sentence the page used and a
 * link to the page, and the way past it is a deliberate act with the quote beside
 * the button, never a default.
 *
 * Silence is shown as silence. "No policy found" is not green and is never
 * worded as permission.
 */

const CHIP: Record<TermsState, string> = {
  closed: 'bg-danger-bg text-danger-fg border-danger-line',
  overridden: 'bg-warn-bg/60 text-warn-fg border-warn-line',
  open: 'bg-success-bg text-success-fg border-success-line',
  silent: 'bg-sunken text-muted border-line',
  unreadable: 'bg-sunken text-muted border-line',
  unchecked: 'bg-sunken text-muted border-line',
}

/** The pill on a row, so the answer is visible before the row is opened. */
export function TermsChip({ target }: { target: TermsFacts }) {
  const view = termsOf(target)
  return (
    <span
      title={view.summary}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${CHIP[view.state]}`}
    >
      {view.label}
    </span>
  )
}

/** Query keys that show a target, so a change here reaches every screen at once. */
const SHOWS_TARGETS = [['sync'], ['review'], ['overview']] as const

const refreshTargets = (qc: QueryClient) =>
  SHOWS_TARGETS.forEach((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] }))

/**
 * `quiet` is for a screen whose own decision sentence has already said what a
 * refusal means, as the Review pane's does: the banner would be the same
 * sentence a second time, and the chip a third. The quote, the link to the page
 * and the buttons are still shown, since those are what that sentence cannot be.
 */
export function TermsPanel({
  target,
  quiet = false,
}: {
  target: TermsFacts & { id: number; name: string }
  quiet?: boolean
}) {
  const qc = useQueryClient()
  const view = termsOf(target)
  const refresh = () => refreshTargets(qc)

  const check = useMutation({ mutationFn: () => api.sync.checkTerms(target.id), onSuccess: refresh })
  const override = useMutation({
    mutationFn: (on: boolean) => api.sync.patch(target.id, { overrideTerms: on }),
    onSuccess: refresh,
  })
  const busy = check.isPending || override.isPending

  const quote = view.quote && (view.state === 'closed' || view.state === 'overridden' || view.state === 'open')
  const checkLabel = view.state === 'unchecked' ? 'Check their site' : 'Check again'

  return (
    <div className="space-y-2">
      {!(quiet && view.state === 'closed') && (
        <Banner tone={view.state === 'closed' ? 'danger' : view.state === 'open' ? 'success' : 'warn'} size="sm">
          {view.summary}
        </Banner>
      )}

      {quote && (
        <p className="text-sm text-body">
          <span className="text-ink">“{view.quote}”</span>
          {view.url && (
            <>
              {' '}
              <a href={view.url} target="_blank" rel="noreferrer" className="text-xs text-info-fg hover:underline">
                Open the page
              </a>
            </>
          )}
        </p>
      )}

      {/* What was done, when nothing was found: a count of pages, or why none opened. */}
      {!quote && view.quote && <p className="text-xs text-muted">{view.quote}</p>}

      {view.checkedAt && <p className="text-xs text-faint">Checked {shortDate(view.checkedAt)}.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="neutral" size="sm" disabled={busy} onClick={() => check.mutate()}>
          {check.isPending ? 'Reading their site…' : checkLabel}
        </Button>

        {view.state === 'closed' && (
          <Button
            variant="quiet"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (confirm(`Their site says: “${view.quote ?? 'no unsolicited pitches'}”\n\nPitch ${target.name} anyway?`)) {
                override.mutate(true)
              }
            }}
          >
            I have read it, pitch anyway
          </Button>
        )}

        {view.state === 'overridden' && (
          <Button variant="quiet" size="sm" disabled={busy} onClick={() => override.mutate(false)}>
            Block it again
          </Button>
        )}
      </div>

      {(check.error || override.error) && (
        <p className="text-xs text-danger-fg">{((check.error ?? override.error) as Error).message}</p>
      )}
    </div>
  )
}

/** Whether the mail links and Mark Pitched should be offered for this target. */
export function mayPitch(target: TermsFacts): boolean {
  return !pitchGate(target).blocked
}

/* --------------------------------------------------------------------- */
/* Reading every site that has not been read                              */
/* --------------------------------------------------------------------- */

type Run = {
  queued: number
  done: number
  now: string | null
  read: SyncTarget[]
  failed: number
  stopping: boolean
  phase: 'running' | 'done' | 'stopped' | 'broke'
  error: string | null
}

/** Three requests failing in a row means the fourth will: a dropped session, no network. */
const GIVE_UP_AFTER = 3

/**
 * Read the site of every target nobody has read, now, instead of six a night.
 *
 * The nightly pass would get there, and until it does each unread target is one
 * the Gmail drafts panel holds back and one a person can still pitch by hand,
 * which is the gap a refusal slipped through the first time. Which targets is
 * `targetsToRead`, the nightly pass's own rule, so this is the same work sooner
 * and never a different answer.
 *
 * One at a time, from the page, through the route the row's own button uses: a
 * Worker request that read thirty sites would run into its own limits, and a
 * pass you can watch and stop is better than one you wait on. Each target is
 * saved as it is read, so stopping, or leaving the page, loses nothing.
 */
export function CheckAllTerms() {
  const qc = useQueryClient()
  const [run, setRun] = useState<Run | null>(null)
  // Read between awaits, so it cannot be state: a closure would never see the press.
  const stop = useRef(false)
  useEffect(() => {
    stop.current = false
    return () => {
      stop.current = true
    }
  }, [])

  // The whole list, not the page's filtered one: a target hidden by a filter is still unread.
  const { data = [] } = useQuery({ queryKey: ['sync', ''], queryFn: () => api.sync.list() })
  const waiting = targetsToRead(data, localToday())

  async function begin() {
    const queue = targetsToRead(data, localToday())
    if (queue.length === 0) return
    stop.current = false
    setRun({ queued: queue.length, done: 0, now: queue[0].name, read: [], failed: 0, stopping: false, phase: 'running', error: null })

    let streak = 0
    let phase: Run['phase'] = 'done'
    let error: string | null = null
    for (const target of queue) {
      if (stop.current) {
        phase = 'stopped'
        break
      }
      setRun((r) => r && { ...r, now: target.name })
      try {
        const row = await api.sync.checkTerms(target.id)
        streak = 0
        setRun((r) => r && { ...r, done: r.done + 1, read: [...r.read, row] })
      } catch (err) {
        streak += 1
        setRun((r) => r && { ...r, done: r.done + 1, failed: r.failed + 1 })
        if (streak >= GIVE_UP_AFTER) {
          phase = 'broke'
          error = err instanceof Error ? err.message : 'The request failed.'
          break
        }
      }
      // The Sync list only: the Review queue is a full rebuild, once at the end.
      qc.invalidateQueries({ queryKey: ['sync'] })
    }
    setRun((r) => r && { ...r, now: null, stopping: false, phase, error })
    refreshTargets(qc)
  }

  if (!run) {
    if (waiting.length === 0) return null
    const n = waiting.length
    return (
      <Card pad="md" className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-sm text-ink">
            {n} sync {n === 1 ? 'target has' : 'targets have'} not had {n === 1 ? 'its' : 'their'} site read yet.
          </p>
          <p className="mt-0.5 text-xs text-muted">
            The nightly check does six a night on its own. This does them now, a few seconds each. Until a
            site is read, the Gmail drafts panel leaves that target out.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => void begin()}>
          Read {n === 1 ? 'its site' : 'their sites'}
        </Button>
      </Card>
    )
  }

  const running = run.phase === 'running'
  return (
    <Card pad="md">
      <div className="space-y-2" aria-live="polite">
        {running ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 basis-64 text-sm text-ink">
              {run.stopping
                ? 'Stopping after this one…'
                : `Reading ${Math.min(run.done + 1, run.queued)} of ${run.queued}${run.now ? `: ${run.now}` : ''}`}
            </p>
            <Button
              variant="neutral"
              size="sm"
              disabled={run.stopping}
              onClick={() => {
                stop.current = true
                setRun((r) => r && { ...r, stopping: true })
              }}
            >
              Stop
            </Button>
          </div>
        ) : (
          <>
            {checkRunLines({ total: run.queued, read: run.read, failed: run.failed, stopped: run.phase === 'stopped' }).map(
              (line) => (
                <p key={line} className="text-sm text-body">
                  {line}
                </p>
              ),
            )}
            {run.error && <p className="text-xs text-danger-fg">Stopped early: {run.error}</p>}
            <Button variant="neutral" size="sm" onClick={() => setRun(null)}>
              Done
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
