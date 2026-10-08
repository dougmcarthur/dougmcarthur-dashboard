import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { pitchGate, termsOf, type TermsFacts, type TermsState } from '../../../shared/syncTerms'
import { shortDate } from '../format'
import { Banner } from './ui/Surface'
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
  const refresh = () => SHOWS_TARGETS.forEach((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] }))

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
