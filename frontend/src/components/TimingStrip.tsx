import type { DueReminder, TimingRow } from '../api'
import { shortDate } from '../format'

/**
 * Block C — everything with a date attached to it, in one list.
 *
 * Deliberately small. Even after recovering every date hiding in prose, only a
 * handful of opportunities have a deadline inside two weeks; a panel sized for
 * a wall of them would be empty most of the time. What earns the space is that
 * these are the only items where waiting has a cost.
 *
 * Three sources, one list: passed deadlines, deadlines coming up, and windows
 * about to open. Reminders join them because "did you submit this?" is the
 * same kind of dated obligation — splitting them into their own panel meant
 * two places to look for the same question.
 *
 * The bands come from the server (`summariseQueue`), not from date arithmetic
 * here, so this list and the deck rank urgency the same way.
 */

const BAND_STYLE: Record<TimingRow['band'], { dot: string; text: string }> = {
  overdue: { dot: 'bg-danger-solid', text: 'text-danger-fg' },
  due_soon: { dot: 'bg-warn-fg', text: 'text-warn-fg' },
  opening: { dot: 'bg-cat-sky-fg', text: 'text-cat-sky-fg' },
}

function countdown(band: TimingRow['band'], days: number): string {
  if (band === 'overdue') return `${Math.abs(days)}d late`
  if (band === 'opening') return days === 0 ? 'Opens today' : `Opens in ${days}d`
  if (days === 0) return 'Due today'
  return days === 1 ? 'Due tomorrow' : `Due in ${days}d`
}

/** Whole days from today to an ISO date, negative once it has passed. */
function daysTo(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - today.getTime()) / 86_400_000)
}

function Row({
  title,
  meta,
  tone,
  right,
  onClick,
  children,
}: {
  title: string
  meta: string
  tone: { dot: string; text: string }
  right: string
  onClick: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-sunken transition-colors"
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink truncate">{title}</p>
        <p className="text-xs text-muted truncate">{meta}</p>
      </div>
      {children}
      <span className={`text-xs font-medium tabular-nums shrink-0 ${tone.text}`}>{right}</span>
    </div>
  )
}

export function TimingStrip({
  rows,
  reminders,
  onNav,
  onSubmitted,
  onDismiss,
  dismissing,
}: {
  rows: TimingRow[]
  reminders: DueReminder[]
  onNav: (page: string) => void
  onSubmitted: (reminder: DueReminder) => void
  onDismiss: (id: number) => void
  dismissing: boolean
}) {
  if (rows.length === 0 && reminders.length === 0) return null

  return (
    <div>
      <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        On the clock
      </h2>

      <div className="bg-surface border border-line rounded-xl shadow-card divide-y divide-line">
        {reminders.map((r) => {
          // Reminders carry a real scheduled date, so they get the same
          // countdown as everything else here rather than a bare date — one
          // list, one way of saying how long you have.
          const days = daysTo(r.scheduledFor)
          return (
            <Row
              key={`reminder-${r.id}`}
              title={r.gigName ?? `${r.entityType} #${r.entityId}`}
              meta={`${shortDate(r.scheduledFor)} · follow-up — did this get submitted?`}
              tone={days < 0 ? BAND_STYLE.overdue : BAND_STYLE.due_soon}
              right={countdown(days < 0 ? 'overdue' : 'due_soon', days)}
              onClick={() => onNav('gigs')}
            >
              <span className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                {r.gigStatus === 'approved' && (
                  <button
                    onClick={() => onSubmitted(r)}
                    className="text-xs px-2 py-0.5 rounded-md bg-info-bg text-info-fg hover:bg-info-bg transition-colors"
                  >
                    Sent
                  </button>
                )}
                <button
                  onClick={() => onDismiss(r.id)}
                  disabled={dismissing}
                  className="text-xs px-2 py-0.5 rounded-md border border-line text-muted hover:bg-sunken disabled:opacity-40 transition-colors"
                >
                  Dismiss
                </button>
              </span>
            </Row>
          )
        })}

        {rows.map((row) => (
          <Row
            key={row.key}
            title={row.title}
            // "about" is not decoration: this date was read out of a sentence,
            // and saying so is the difference between a countdown you can act
            // on and one you have to go and verify first.
            meta={`${row.approximate ? 'about ' : ''}${shortDate(row.date)}${
              row.approximate ? ' — recovered from the note' : ''
            }`}
            tone={BAND_STYLE[row.band]}
            right={countdown(row.band, row.daysUntil)}
            onClick={() => onNav('review')}
          />
        ))}
      </div>
    </div>
  )
}
