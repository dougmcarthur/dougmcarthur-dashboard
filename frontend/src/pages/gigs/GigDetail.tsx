import { type GigOpportunity, type GigStatus } from '../../api'
import {
  normaliseGigStatus,
  nextGigStatuses,
  gigStatusMeta,
} from '../../../../shared/gigStatus'
import { formatPerformanceSpan } from '../../../../shared/performance'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { ApplicationPanel } from './ApplicationPanel'
import { CostPanel } from './CostPanel'

/**
 * The one-click moves worth having on the row itself, by the status you are on.
 * Everything else in `nextGigStatuses` is still reachable from the picker
 * beside them — this is only about which two are worth a button.
 */
const QUICK: Partial<Record<GigStatus, GigStatus[]>> = {
  shortlisted: ['submitted'],
  preparing: ['submitted'],
  submitted: ['acknowledged'],
  acknowledged: ['invited'],
  invited: ['booked'],
}

/** The read-only expansion under a table row. */
export function GigDetail({
  gig,
  onEdit,
  onStatusChange,
  isPatching,
}: {
  gig: GigOpportunity
  onEdit: () => void
  onStatusChange: (status: GigStatus) => void
  isPatching: boolean
}) {
  const status = normaliseGigStatus(gig.status)
  const meta = gigStatusMeta(status)
  const moves = nextGigStatuses(status)
  const quick = (QUICK[status] ?? []).filter((s) => moves.includes(s))
  const span = formatPerformanceSpan(gig.performanceStart, gig.performanceEnd)
  // Phase 3's workspace, and only where phase 3 is the question. A discovered
  // gig has not been decided on and a declined one cannot be applied to, so
  // offering either a form reader is offering work that cannot land.
  const applying = status === 'shortlisted' || meta.phase === 'apply'

  return (
    <div className="space-y-4 max-w-3xl">
      {(gig.fitRationale || gig.fitNotes) && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Why it fits</p>
          <p className="text-sm text-body leading-relaxed">{gig.fitRationale ?? gig.fitNotes}</p>
        </div>
      )}

      {/*
        Given its own line rather than a chip in the row below. A performance
        date is the only thing on this pane that means you will be standing on
        a stage, and the whole pipeline rename exists because it used to look
        like everything else.
      */}
      {span && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">On stage</p>
          <p className="text-sm font-semibold text-ink">{span}</p>
          {status !== 'booked' && (
            <p className="text-xs text-faint mt-0.5">
              Pencilled in. Nothing reaches your calendar until this is booked.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="bg-surface px-2.5 py-1 rounded-md border border-line text-body" title={meta.meaning}>
          {meta.decider === 'them' ? 'Their move' : meta.decider === 'you' ? 'Your move' : 'No decision yet'}
        </span>
        {gig.submissionMethod && (
          <span className="bg-surface px-2.5 py-1 rounded-md border border-line text-body">Submit via {gig.submissionMethod}</span>
        )}
        {gig.audienceSize && (
          <span className="bg-surface px-2.5 py-1 rounded-md border border-line text-body">~{gig.audienceSize.toLocaleString()} audience</span>
        )}
        {gig.showEventId ? (
          <span className="bg-surface px-2.5 py-1 rounded-md border border-success-line text-success-fg">📅 On your calendar</span>
        ) : gig.googleEventId ? (
          <span className="bg-surface px-2.5 py-1 rounded-md border border-line text-body">📅 Deadline reminder set</span>
        ) : null}
        {gig.url && (
          <a href={gig.url} target="_blank" rel="noreferrer" className="bg-surface px-2.5 py-1 rounded-md border border-line text-info-fg hover:bg-info-bg transition-colors">
            Open link ↗
          </a>
        )}
      </div>

      <div className="flex gap-2 flex-wrap items-center pt-1">
        {quick.map((s) => (
          <Button key={s} variant="info" disabled={isPatching} onClick={() => onStatusChange(s)}>
            {gigStatusMeta(s).label}
          </Button>
        ))}
        {moves.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Move to
            <Select
              // A picker rather than a button per move: `submitted` alone has
              // six of them, and a row of six buttons reads as six things you
              // are supposed to do.
              filter
              value=""
              disabled={isPatching}
              onChange={(e) => e.target.value && onStatusChange(e.target.value as GigStatus)}
            >
              <option value="">—</option>
              {moves.map((s) => (
                <option key={s} value={s} title={gigStatusMeta(s).meaning}>
                  {gigStatusMeta(s).label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Button variant="neutral" onClick={onEdit}>
          Edit details
        </Button>
      </div>

      {/*
        The clock is read once, here, and handed down — `visaLead` takes the
        date as an argument for the same reason the queue does.
      */}
      <div className="border-t border-line pt-4">
        <CostPanel gig={gig} today={new Date().toISOString().slice(0, 10)} />
      </div>

      {applying && (
        <div className="border-t border-line pt-4">
          <ApplicationPanel gigId={gig.id} />
        </div>
      )}
    </div>
  )
}
