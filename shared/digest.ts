/**
 * What the weekly email says.
 *
 * A diff, not a report. The dashboard already answers "what is the state of
 * everything"; an email that repeats that teaches you to skim it. What an
 * email can do that the dashboard cannot is tell you what moved since you last
 * looked, so every group here is a change rather than a status.
 *
 * Pure: takes the queue, what was reported last time, and today's date, and
 * returns groups. No I/O, no formatting, no send. The Worker supplies the
 * prior reports and writes back the new marks; this decides what is worth
 * saying, and can be tested without a database or a mailbox.
 */

import type { ReviewItem } from './reviewQueue'

export type DigestGroupId = 'new' | 'actionable' | 'changed' | 'stale'

export interface DigestLine {
  key: string
  kind: ReviewItem['kind']
  id: number
  title: string
  /** The same sentence the card shows — one description of an item, everywhere. */
  rationale: string
  /** Deep link into the Review screen at this item. */
  href: string
  fingerprint: string
}

export interface DigestGroup {
  id: DigestGroupId
  heading: string
  lines: DigestLine[]
}

export interface Digest {
  groups: DigestGroup[]
  /** Nothing worth sending. The caller must not send an empty digest. */
  empty: boolean
  /** Marks to persist once the send succeeds — never before. */
  marks: Array<{ entityType: string; entityId: number; grp: DigestGroupId; fingerprint: string }>
}

/** What the digest last said about an item, from `digest_reports`. */
export interface PriorReport {
  entityType: string
  entityId: number
  grp: string
  fingerprint: string
  /** ISO timestamp of that mention — the cooldown for "going stale". */
  reportedAt: string
}

const HEADINGS: Record<DigestGroupId, string> = {
  new: 'New since last time',
  actionable: 'Now actionable',
  changed: 'Changed under you',
  stale: 'Going stale',
}

/** Cap on the stale group, so the rot surfaces a little at a time. */
const STALE_LIMIT = 3

/**
 * How long a stale item stays quiet after being named.
 *
 * "Going stale" is the one group that deliberately repeats, and it has to be.
 * These items never change — that is the entire complaint about them — so
 * under the never-repeat rule they would be mentioned once when discovered and
 * then be invisible forever, which is the exact failure the group exists to
 * prevent. So they repeat on a cooldown instead: named, then silent for a
 * month, then eligible again. Four weeks rather than one, so a pile that is
 * genuinely stuck nags occasionally instead of weekly.
 */
const STALE_COOLDOWN_DAYS = 28

/**
 * The facts that make an item worth mentioning again.
 *
 * Deliberately narrow. `updated_at` is not in here: a research run rewriting a
 * note without changing anything material would otherwise resurface the item
 * every week. Deadline, fee, status, snooze and the flag set are what change
 * whether you would do something differently.
 *
 * Written as named fields rather than positional ones because these are
 * persisted and compared weeks apart. A positional format reads fine until
 * something is inserted in the middle, at which point every stored fingerprint
 * silently means something else and the whole backlog reports as changed.
 */
export function fingerprint(item: ReviewItem): string {
  return [
    `status=${item.status}`,
    `deadline=${item.deadline.date ?? '-'}`,
    `opens=${item.deadline.opensAt ?? '-'}`,
    `fee=${item.fee.required ? (item.fee.amount ?? 'y') : '-'}`,
    `snooze=${item.snooze.until ?? '-'}`,
    `flags=${item.flags.map((f) => f.id).sort().join(',')}`,
  ].join(';')
}

/** Reads one field back out of a stored fingerprint. */
function field(fp: string, name: string): string | null {
  const hit = fp.split(';').find((part) => part.startsWith(`${name}=`))
  return hit ? hit.slice(name.length + 1) : null
}

function line(item: ReviewItem): DigestLine {
  return {
    key: item.key,
    kind: item.kind,
    id: item.id,
    title: item.title,
    rationale: item.decision.rationale,
    href: `#review/all`,
    fingerprint: fingerprint(item),
  }
}

export function buildDigest(input: {
  items: ReviewItem[]
  prior: PriorReport[]
  /** Today, for the stale cooldown only. Everything else reads the queue's flags. */
  today?: string
}): Digest {
  // The only clock this module needs, and only for the cooldown. Urgency comes
  // from the queue's flags, which were computed against the queue's own date —
  // a second opinion here could disagree with how the cards were ranked.
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const seen = new Map(input.prior.map((p) => [`${p.entityType}-${p.entityId}`, p]))

  const buckets: Record<DigestGroupId, ReviewItem[]> = { new: [], actionable: [], changed: [], stale: [] }

  for (const item of input.items) {
    // A snoozed item is deliberately silent. Reporting something you told the
    // app to stop asking about is the fastest way to make the email unwelcome.
    if (item.snooze.active) continue

    const before = seen.get(item.key)
    const now = fingerprint(item)

    if (!before) {
      // Never mentioned. New to you whether the row is new or the digest is.
      buckets.new.push(item)
      continue
    }

    // The rule the plan sets: never repeat an item that has not changed.
    if (before.fingerprint === now) continue

    // "Now actionable" means it became actionable, not that it is actionable
    // and something moved. An item already inside its deadline window that
    // merely gained a fee belongs under "changed under you" — filing it as
    // newly actionable makes the group that is supposed to earn the email
    // indistinguishable from the group that does not.
    //
    // A snooze ending is read off the row, not off the stored fingerprint.
    // Snoozed items are never reported, so no mark ever records that one WAS
    // snoozed — checking the prior fingerprint for a snooze made the whole
    // branch unreachable, and every lapsed snooze arrived as "changed".
    //
    // `snoozed_until` survives the lapse, so a row holding a date that is no
    // longer in force is exactly a snooze that has ended, whether it ran out or
    // was broken by the item changing. The second test stops it being sticky:
    // once a wake has been reported, the mark carries that date, and a later
    // edit is an ordinary change rather than a second awakening.
    const snoozeEnded = item.snooze.until !== null && !item.snooze.active
    const wakeAlreadyReported = field(before.fingerprint, 'snooze') === item.snooze.until
    const wokeUp = snoozeEnded && !wakeAlreadyReported

    const wasDue = /overdue|due_soon/.test(field(before.fingerprint, 'flags') ?? '')
    const isDue = item.flags.some((f) => f.id === 'overdue' || f.id === 'due_soon')
    const justOpened = item.deadline.opensInDays !== null && item.deadline.opensInDays <= 0

    if (wokeUp || (isDue && !wasDue) || justOpened) buckets.actionable.push(item)
    else buckets.changed.push(item)
  }

  // Going stale: the no-deadline pile, oldest first, a few at a time, and
  // silent for a month after each mention. Without the cooldown this group
  // reprints the same three names every week until they are dealt with, which
  // is how an email stops being read.
  const offCooldown = (i: ReviewItem) => {
    const before = seen.get(i.key)
    if (!before) return true
    const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(before.reportedAt)) / 86_400_000
    return days >= STALE_COOLDOWN_DAYS
  }

  const stale = input.items
    .filter((i) => !i.snooze.active && i.deadline.date === null && i.deadline.opensAt === null)
    .filter((i) => i.source.kind !== 'promo')
    .filter(offCooldown)
    .filter((i) => !buckets.new.includes(i) && !buckets.changed.includes(i) && !buckets.actionable.includes(i))
    .sort((a, b) => {
      const at = a.source.kind === 'promo' ? '' : a.source.row.discoveredAt
      const bt = b.source.kind === 'promo' ? '' : b.source.row.discoveredAt
      return at.localeCompare(bt)
    })
    .slice(0, STALE_LIMIT)
  buckets.stale = stale

  const order: DigestGroupId[] = ['new', 'actionable', 'changed', 'stale']
  const groups = order
    .map((id) => ({ id, heading: HEADINGS[id], lines: buckets[id].map(line) }))
    .filter((g) => g.lines.length > 0)

  return {
    groups,
    empty: groups.length === 0,
    // Marks cover every group including stale, so an item mentioned as going
    // stale is not mentioned again next week unchanged.
    marks: groups.flatMap((g) =>
      g.lines.map((l) => ({
        entityType: l.kind,
        entityId: l.id,
        grp: g.id,
        fingerprint: l.fingerprint,
      })),
    ),
  }
}
