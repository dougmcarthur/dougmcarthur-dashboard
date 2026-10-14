/**
 * A programme that comes round again, and what an artist's list does about it.
 *
 * One catalog entry is one programme, keyed by its address, and it held the
 * first deadline it was filed with for good. Passing on it was permanent, a
 * snooze woke the row with the old date, and a New call whose date had gone sat
 * in the deck as "Deadline passed" for ever. A grant that runs twice a year was
 * therefore worth one look.
 *
 * Two decisions the owner made, and the rest follows from them:
 *
 *  - **Pass means this intake.** It says nothing about the programme. When the
 *    programme opens again the artist is shown it again, as a new row, with the
 *    sentence that says why. The old row stays as it was, and so does the
 *    decision log's account of what they were looking at when they passed.
 *  - **A row nobody decided on follows the programme.** A New row whose date
 *    has gone is the same decision, a newer date. It is advanced in place, and
 *    because that is a change to what the row says, it wakes a snooze: "nothing
 *    here needs me until the deadline" was said about a different intake.
 *
 * What it will not do, and why:
 *
 *  - **It does not touch an application in flight.** A row In progress or
 *    Applied is not re-offered or moved. Somebody said yes to that intake, and
 *    "Missed the deadline" is the move that closes it and lets this run.
 *  - **It re-offers only what the artist did not apply for.** Passed and missed.
 *    A call they applied to and lost, one they won, one they withdrew from and
 *    one they archived are different sentences, and a row archived with no
 *    outcome is how somebody says "never".
 *  - **It waits for the old intake to have closed.** A row whose own date is
 *    still ahead is not replaced by a later one: it may be a different stream.
 *  - **It never invents a date.** A deadline here is a date the catalog holds.
 *
 * Pure: no clock and no database. `today` is an argument.
 */

import { gigOutcome, gigStage } from './gigStage'
import { isDeliverable } from './catalogMatch'
import { isoDate } from './opportunityCatalog'
import { splitDeadline } from './reviewParse'

/** What an entry holds that a deadline moving needs to carry along. */
export interface IntakeFacts {
  deadline: string | null
  deadlineNote: string | null
  opensAt: string | null
}

/** What changes on an entry when its programme has opened again. */
export interface IntakePatch extends IntakeFacts {
  /** Only a deadline moves; the rest of the entry is the first sighting's. */
  deadline: string
}

/**
 * Whether a sighting is the next intake of an entry whose last one has closed.
 *
 * Only forward, and only from a date that has passed: an entry whose deadline
 * is still ahead is not moved by a later one, since a page naming a later date
 * may be naming a different stream, and a poisoned page should not be able to
 * push a live deadline out of sight.
 */
export function advanceIntake(existing: IntakeFacts, next: IntakeFacts, today: string): IntakePatch | null {
  const was = isoDate(existing.deadline)
  const to = isoDate(next.deadline)
  if (!was || was >= today) return null
  if (!to || to <= was || to < today) return null
  return { deadline: to, deadlineNote: next.deadlineNote ?? null, opensAt: next.opensAt ?? null }
}

/** An entry as the planner reads it. */
export interface IntakeEntry extends IntakeFacts {
  id: number
  name: string
  firstSeenAt: string
  reopenedAt?: string | null
  delivery: string | null
}

/** One of the artist's rows linked to the catalog, in the fourteen-status vocabulary the code reasons in. */
export interface IntakeRow {
  id: number
  opportunityId: number | null
  status: string
  deadline: string | null
}

export type IntakeMove =
  /** A New row follows its programme to the newer date. */
  | { kind: 'advance'; rowId: number; entryId: number; name: string; from: string; to: string; opensAt: string | null; note: string | null }
  /** A passed or missed intake is offered again as a new row. */
  | { kind: 'reoffer'; entryId: number; name: string; last: string; to: string; because: 'passed' | 'missed' }

/**
 * What to do for one artist, given the catalog and their linked rows.
 *
 * Deterministic and idempotent: advancing a row or filing the new one makes the
 * artist hold the entry's date, which is the first thing checked, so the same
 * night's plan run again is empty.
 */
export function planIntakes(input: {
  entries: readonly IntakeEntry[]
  rows: readonly IntakeRow[]
  today: string
}): IntakeMove[] {
  const { entries, rows, today } = input
  const moves: IntakeMove[] = []

  const byEntry = new Map<number, IntakeRow[]>()
  for (const row of rows) {
    if (row.opportunityId === null) continue
    byEntry.set(row.opportunityId, [...(byEntry.get(row.opportunityId) ?? []), row])
  }

  for (const entry of entries) {
    const mine = byEntry.get(entry.id)
    const to = isoDate(entry.deadline)
    // Nothing of theirs, or the programme is not open for anybody.
    if (!mine || !to || to < today) continue
    // A new intake is a new arrival, so it waits out the same holding period
    // and can be blocked by the owner in the same window.
    if (!isDeliverable(entry, today)) continue

    const dated = mine.map((row) => ({ row, date: splitDeadline(row.deadline).date }))
    // They already hold this intake, or a later one. This is what makes a
    // second run find nothing.
    if (dated.some((d) => d.date !== null && d.date >= to)) continue

    // Only an intake that has itself closed is replaced.
    const closed = dated.filter((d): d is { row: IntakeRow; date: string } => d.date !== null && d.date < today)
    if (closed.length === 0) continue

    const undecided = closed
      .filter((d) => gigStage(d.row.status) === 'new')
      .sort((a, b) => b.row.id - a.row.id)
    if (undecided.length > 0) {
      const d = undecided[0]
      moves.push({
        kind: 'advance', rowId: d.row.id, entryId: entry.id, name: entry.name,
        from: d.date, to, opensAt: entry.opensAt, note: entry.deadlineNote,
      })
      continue
    }

    // Somebody said yes to an intake, or is waiting on one. Leave it.
    if (closed.some((d) => {
      const stage = gigStage(d.row.status)
      return stage === 'in_progress' || stage === 'applied'
    })) continue

    const last = [...closed].sort((a, b) => b.date.localeCompare(a.date) || b.row.id - a.row.id)[0]
    const outcome = gigOutcome(last.row.status)
    if (outcome === 'passed' || outcome === 'missed') {
      moves.push({ kind: 'reoffer', entryId: entry.id, name: entry.name, last: last.date, to, because: outcome })
    }
  }
  return moves
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mar 1", with the year only when it is not this one. */
export function dayText(iso: string, today: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[m - 1] ?? '?'} ${d}${String(y) !== today.slice(0, 4) ? `, ${y}` : ''}`
}

/** The sentence a re-offered row opens with, so it is never mistaken for a first sighting. */
export function reofferSentence(move: Extract<IntakeMove, { kind: 'reoffer' }>, today: string): string {
  const what =
    move.because === 'passed'
      ? 'This programme is open again. You passed on the last intake'
      : 'This programme is open again. You missed the last intake'
  return `${what}, which closed ${dayText(move.last, today)}. This one closes ${dayText(move.to, today)}.`
}

/** The sentence for the bell, one per move. */
export function moveSentence(move: IntakeMove, today: string): string {
  return move.kind === 'advance'
    ? `${move.name}: the deadline moved from ${dayText(move.from, today)} to ${dayText(move.to, today)}.`
    : `${move.name}: open again, closes ${dayText(move.to, today)}.`
}
