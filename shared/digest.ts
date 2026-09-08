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

import type { FlagId, ReviewItem } from './reviewQueue'
import { awaitingDecision } from './reviewQueue'

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

/**
 * One line of the "everything else" summary: a count and where to see it.
 *
 * Never a list of items. The whole point of collapsing the tail into counts is
 * that the dashboard already renders the tail, and an email that reproduces it
 * is one you learn to scroll past.
 */
export interface DigestRollup {
  id: string
  /** Reads as a sentence after the count: "4 cost money to enter". */
  label: string
  count: number
  /** Deep link into the Review screen, filtered to exactly these rows. */
  href: string
}

export interface Digest {
  /**
   * The five things most worth doing something about right now, ranked by the
   * queue's own score so the email and the deck cannot disagree about what
   * matters. Unlike the change groups this is current state, not a diff: an
   * item you did not act on last week is still the most important thing this
   * week, and saying so again is the job.
   */
  focus: DigestLine[]
  /** Everything else, as counts. Never a reason to send on its own. */
  rollups: DigestRollup[]
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
 * How many items lead the email.
 *
 * Five because the list has to be finishable in one sitting to be worth
 * ranking at all. A "top ten" is a backlog with an opinion; a top five is a
 * plan for the week. Everything below it is counted, not listed.
 */
const FOCUS_LIMIT = 5

/**
 * Whether this is something that can actually be done today.
 *
 * A submission window that has not opened is the case this exists for. Those
 * rows are real work and rank highly on urgency, but no amount of intent gets
 * them submitted before the window opens, so putting one at the top of a "do
 * these now" list spends the most valuable line in the email on a row whose
 * only correct action is to wait. They stay in the rollups, and reach the top
 * five by themselves on the week the window opens.
 */
function actionableNow(item: ReviewItem): boolean {
  if (item.snooze.active) return false
  if (item.deadline.opensInDays !== null && item.deadline.opensInDays > 0) return false
  // `vague_deadline` is an observation about the data, not a thing to do.
  return item.flags.some((f) => f.id !== 'vague_deadline')
}

/**
 * Flags in the order that decides which bucket an item is counted under.
 *
 * Deliberately the same precedence `decisionCopy` uses to pick a sentence: an
 * item described to you as a money decision must not then be counted under
 * "waiting on you", or the totals and the copy tell different stories about
 * the same row.
 */
const BUCKET_ORDER: Array<{ flag: FlagId; one: string; many: string; filter: string }> = [
  { flag: 'conflict', one: 'contradicts its own status', many: 'contradict their own status', filter: 'conflict' },
  { flag: 'reply_due', one: 'is waiting on a reply from you', many: 'are waiting on a reply from you', filter: 'reply' },
  // Above `overdue` for the same reason `decisionCopy` puts it there: on a row
  // you already sent, a deadline in the past is expected and says nothing.
  { flag: 'no_reply', one: 'has gone unanswered for six weeks or more', many: 'have gone unanswered for six weeks or more', filter: 'waiting' },
  { flag: 'overdue', one: 'is past its deadline', many: 'are past their deadline', filter: 'timing' },
  { flag: 'paid', one: 'costs money to enter', many: 'cost money to enter', filter: 'paid' },
  { flag: 'issue', one: 'has a flagged problem', many: 'have a flagged problem', filter: 'needs' },
  { flag: 'due_soon', one: 'is due within two weeks', many: 'are due within two weeks', filter: 'timing' },
  { flag: 'blocked', one: 'needs something only you can supply', many: 'need something only you can supply', filter: 'blocked' },
  { flag: 'not_submitted', one: 'is drafted but never sent', many: 'are drafted but never sent', filter: 'needs' },
  { flag: 'window', one: 'is waiting for a window to open', many: 'are waiting for a window to open', filter: 'timing' },
]

/**
 * Where an item with no flag worth acting on is counted.
 *
 * Bucketing these by kind rather than dropping them: they are the bulk of the
 * queue, and "18 sync targets sitting where they were pitched" is a fact worth
 * one line — it is the shape of the backlog, and the reason the deck never
 * empties. Lumping them under one "everything else" total would hide which
 * pile is actually growing.
 */
const IDLE_BUCKET: Record<ReviewItem['kind'], { one: string; many: string }> = {
  gig: { one: 'is open-ended, with nothing forcing it', many: 'are open-ended, with nothing forcing them' },
  sync: { one: 'is a sync target sitting where it was pitched', many: 'are sync targets sitting where they were pitched' },
  promo: { one: 'is an approved post not marked published', many: 'are approved posts not marked published' },
}

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

  // The queue arrives sorted by score, so "most important" is just the first
  // few that can actually be acted on today.
  //
  // The digest reports more than the Review queue does: alongside what needs
  // deciding, it names the idle piles, which carry no flags at all and are the
  // shape of the backlog. So this is not simply `awaitingDecision`.
  //
  // What it must not do is count a *decided* row under a flag bucket, because
  // every such line deep-links into a Review filter that would then refuse to
  // show it — an email promising rows that are not there when you arrive. A
  // gig you passed on keeps its flags, so that is exactly what used to happen.
  const live = input.items.filter(
    (i) => awaitingDecision(i) || (!i.snooze.active && i.flags.length === 0),
  )
  const focus = live.filter((i) => awaitingDecision(i) && actionableNow(i)).slice(0, FOCUS_LIMIT)
  const inFocus = new Set(focus.map((i) => i.key))

  // Everything the top five did not name, counted once each under its most
  // decisive flag. Counting an item under every flag it carries would make the
  // totals sum to more than the queue, which reads as an error even when each
  // individual number is right.
  const tallies = new Map<string, { one: string; many: string; filter: string; count: number }>()
  for (const item of live) {
    if (inFocus.has(item.key)) continue
    // An unopened window decides the bucket on its own, ahead of every other
    // flag. It is the reason the item is down here rather than in the top
    // five, and counting a row you cannot submit yet under "drafted but never
    // sent" reads as a reproach for not having done something impossible.
    const shut = item.deadline.opensInDays !== null && item.deadline.opensInDays > 0
    const bucket = shut
      ? BUCKET_ORDER.find((b) => b.flag === 'window')
      : BUCKET_ORDER.find((b) => item.flags.some((f) => f.id === b.flag))
    const idle = IDLE_BUCKET[item.kind]
    const id = bucket ? bucket.flag : `idle_${item.kind}`
    const filter = bucket ? bucket.filter : 'all'
    const seen = tallies.get(id)
    if (seen) seen.count += 1
    else tallies.set(id, { one: bucket?.one ?? idle.one, many: bucket?.many ?? idle.many, filter, count: 1 })
  }

  const rollupOrder = [...BUCKET_ORDER.map((b) => b.flag), 'idle_gig', 'idle_sync', 'idle_promo']
  const rollups: DigestRollup[] = rollupOrder
    .filter((id) => tallies.has(id))
    .map((id) => {
      const t = tallies.get(id)!
      // "1 have a flagged problem" is the kind of line that makes a generated
      // email read as generated. The counts reach 1 often enough to matter.
      return { id, label: t.count === 1 ? t.one : t.many, count: t.count, href: `#review/${t.filter}` }
    })

  return {
    focus: focus.map(line),
    rollups,
    groups,
    // Rollups never earn a send on their own. They are context for the five
    // above them, and an email whose entire content is "18 things are still
    // where you left them" is the one that trains you to stop opening these.
    empty: focus.length === 0 && groups.length === 0,
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
