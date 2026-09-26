import { type GigOpportunity, type GigStatus } from '../../api'
import { normaliseGigStatus } from '../../../../shared/gigStatus'
import { gigFlag, gigMoves, gigStage } from '../../../../shared/gigStage'
import { formatPerformanceSpan } from '../../../../shared/performance'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { ApplicationPanel } from './ApplicationPanel'
import { CostPanel } from './CostPanel'
import { Caption } from '../../components/ui/Surface'
import { DraftedMessage } from '../../components/DraftedMessage'
import { depersonalise, splitDraftedMessage } from '../../../../shared/reviewParse'
import { mappablePlace, mapsLink } from '../../../../shared/travelDistance'

/** The read-only expansion under a table row. */
export function GigDetail({
  gig,
  onEdit,
  onStatusChange,
  onDelete,
  isPatching,
  today,
}: {
  gig: GigOpportunity
  onEdit: () => void
  onStatusChange: (status: GigStatus) => void
  /** Absent where a caller has nothing to delete with. */
  onDelete?: () => void
  isPatching: boolean
  /** The reader's local date, from the page — see `localToday`. */
  today: string
}) {
  const status = normaliseGigStatus(gig.status)
  // Every move the pipeline offers, in the stage language. The forward one
  // gets a button; the rest are in the picker, because an Applied gig has
  // five and a row of five buttons reads as five things you ought to do.
  const moves = gigMoves(status, gig.type)
  const quick = moves.filter((m) => m.tone === 'go').slice(0, 1)
  const others = moves.filter((m) => !quick.includes(m))
  const span = formatPerformanceSpan(gig.performanceStart, gig.performanceEnd)
  // Phase 3's workspace, and only where phase 3 is the question. A discovered
  // gig has not been decided on and a declined one cannot be applied to, so
  // offering either a form reader is offering work that cannot land.
  const stage = gigStage(status)
  const applying = stage === 'in_progress'
  // Asked of the stage and its flag: an Applied gig is their move unless they
  // asked for something or made an offer, and then it is yours again.
  // The note is prose with, sometimes, a message to send buried in it. Split
  // the message out so it can be read and copied on its own; the rest is the
  // reasoning, in the second person like the Review screen shows it.
  const why = splitDraftedMessage(gig.fitRationale ?? gig.fitNotes ?? '')
  const whoseMove =
    stage === 'closed' ? null : stage === 'applied' && !gigFlag(status) ? 'Their move' : 'Your move'

  return (
    <div className="space-y-4 max-w-3xl">
      {why.rest && (
        <div>
          <Caption spaced>Why it fits</Caption>
          <p className="text-sm text-body leading-relaxed">{depersonalise(why.rest)}</p>
        </div>
      )}

      {why.message && <DraftedMessage body={why.message.body} channel={why.message.channel} />}

      {/*
        Given its own line rather than a chip in the row below. A performance
        date is the only thing on this pane that means you will be standing on
        a stage, and the whole pipeline rename exists because it used to look
        like everything else.
      */}
      {span && (
        <div>
          <Caption className="mb-1">On stage</Caption>
          <p className="text-sm font-semibold text-ink">{span}</p>
          {status !== 'booked' && (
            <p className="text-xs text-faint mt-0.5">
              Pencilled in. Nothing reaches your calendar until it is accepted.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {/*
          Where it is, and a way to see it — only when there is one place to
          show. A link rather than an embedded map: nothing loads from any map
          service until somebody asks for it.
        */}
        {mapsLink(gig) && (
          <a
            href={mapsLink(gig)!}
            target="_blank"
            rel="noreferrer"
            className="bg-surface px-2.5 py-1 rounded-md border border-line text-info-fg hover:bg-info-bg"
          >
            {mappablePlace(gig)} · Open in Maps ↗
          </a>
        )}
        {whoseMove && (
          <span className="bg-surface px-2.5 py-1 rounded-md border border-line text-body">{whoseMove}</span>
        )}
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
        {quick.map((m) => (
          <Button key={m.to} variant="info" title={m.meaning} disabled={isPatching} onClick={() => onStatusChange(m.to)}>
            {m.label}
          </Button>
        ))}
        {others.length > 0 && (
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
              {others.map((m) => (
                <option key={m.to} value={m.to} title={m.meaning}>
                  {m.label}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Button variant="neutral" onClick={onEdit}>
          Edit details
        </Button>
        {/*
          Deleting lives here rather than on the table row, where it was drawn
          once per row — thirty-four destructive controls on a screen you open
          to read. Somebody who has decided to delete a gig has opened it, and
          this is where they are. `ml-auto` puts it at the far end, away from
          the two controls you press without thinking.
        */}
        {onDelete ? (
          <Button
            variant="quiet"
            className="ml-auto text-faint hover:text-danger-fg"
            disabled={isPatching}
            onClick={onDelete}
          >
            Delete
          </Button>
        ) : null}
      </div>

      {/*
        The page reads the clock once and hands the date down — `visaLead`
        takes it as an argument for the same reason the queue does. It used to
        be read here as the UTC date, which from 7pm in Winnipeg is tomorrow,
        so the visa lead time came up a day short every evening.
      */}
      <div className="border-t border-line pt-4">
        <CostPanel gig={gig} today={today} />
      </div>

      {applying && (
        <div className="border-t border-line pt-4">
          <ApplicationPanel gigId={gig.id} />
        </div>
      )}
    </div>
  )
}
