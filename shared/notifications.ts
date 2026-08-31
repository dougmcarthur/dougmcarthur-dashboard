/**
 * What the bell has to say.
 *
 * Pure: takes the queue, the connection health and what you have already seen,
 * and returns a list. No I/O, no dates of its own beyond the one passed in, so
 * every rule below is testable without a database.
 *
 * The distinction the whole feature rests on: **a notification is an event,
 * the dashboard shows state.** "18 items need a decision" is state — it is
 * already on the Overview, it stays true until you act, and putting it in a
 * feed guarantees the feed is never empty. What belongs here is the delta: the
 * thing that changed while you were not looking.
 *
 * Everything in this file is a *condition* — a fact about right now, derived
 * fresh on every read. Nothing is stored but your read and dismiss marks, so a
 * condition that stops holding stops being reported without anything having to
 * clean up after it.
 */

import type { ReviewItem, QueueSummary } from './reviewQueue'

/**
 * Three tiers, not five. More than three and nobody remembers what they mean.
 *
 * The UI carries these as lightness rather than a third hue, so severity
 * survives colour blindness and the palette stays at two colours.
 */
export type Tier = 'critical' | 'attention' | 'info'

export interface Notification {
  /** Identity of the condition, stable across reads. Not a row id. */
  key: string
  tier: Tier
  title: string
  body: string
  /** Hash route to the thing this is about. */
  href: string
  /** Label for the one action, when there is a useful one. */
  action?: string
  read: boolean
  /** ISO timestamp this condition was first observed. */
  firstSeen: string
}

export interface Mark {
  dedupeKey: string
  firstSeen: string
  readAt: string | null
  dismissedAt: string | null
}

/** What the generator needs to know about the outside world. */
export interface HealthInput {
  calendarConfigured: boolean
  gmailConfigured: boolean
  emailConfigured: boolean
}

const TIER_RANK: Record<Tier, number> = { critical: 0, attention: 1, info: 2 }

/** Deadline horizon that counts as "on the clock". Matches the queue's own. */
const DUE_SOON_DAYS = 14

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Connection failures.
 *
 * These are the only notifications that can cost you something: approving a
 * gig with Calendar down silently fails to create the event, and the pitch
 * reconciler cannot read Gmail to tell you a draft was already sent. Everything
 * else here is an inconvenience.
 */
function connectionNotes(health: HealthInput): Array<Omit<Notification, 'read' | 'firstSeen'>> {
  const out: Array<Omit<Notification, 'read' | 'firstSeen'>> = []

  if (!health.calendarConfigured) {
    out.push({
      key: 'connection:calendar',
      tier: 'critical',
      title: 'Google Calendar disconnected',
      body: 'Approving a gig will not create an event.',
      href: '#settings',
      action: 'Reconnect',
    })
  }
  if (!health.gmailConfigured) {
    out.push({
      key: 'connection:gmail',
      tier: 'critical',
      title: 'Gmail disconnected',
      body: 'Sync cannot reconcile pitch statuses from sent mail.',
      href: '#settings',
      action: 'Reconnect',
    })
  }
  if (!health.emailConfigured) {
    out.push({
      key: 'connection:email',
      tier: 'critical',
      title: 'Email sending unavailable',
      body: 'The weekly digest cannot be delivered.',
      href: '#settings',
      action: 'Reconnect',
    })
  }
  return out
}

/**
 * Rot in the data itself.
 *
 * Critical rather than informational because these are silent: a reminder
 * pointing at a deleted gig will never fire, and a row whose status says
 * submitted while its note says otherwise is lying to every other screen.
 */
function healthNotes(summary: QueueSummary): Array<Omit<Notification, 'read' | 'firstSeen'>> {
  const out: Array<Omit<Notification, 'read' | 'firstSeen'>> = []
  const h = summary.health

  if (h.conflicts > 0) {
    out.push({
      key: 'health:conflicts',
      tier: 'critical',
      title: `${plural(h.conflicts, 'item contradicts', 'items contradict')} its own note`,
      body: 'Marked finished, but the note says it was never submitted.',
      href: '#review/conflict',
      action: 'Review',
    })
  }
  if (h.orphanedReminders > 0) {
    out.push({
      key: 'health:orphans',
      tier: 'critical',
      title: `${plural(h.orphanedReminders, 'reminder points', 'reminders point')} at a deleted item`,
      body: 'These will never fire and nothing else will surface them.',
      href: '#settings',
    })
  }
  return out
}

/**
 * Deadlines, one notification per item rather than one summary row.
 *
 * Summarising them ("3 items are due soon") would be smaller, but it also
 * makes them undismissable individually — and the one you have already dealt
 * with would keep the count up. One key per item, so each can be put away.
 */
function timingNotes(summary: QueueSummary): Array<Omit<Notification, 'read' | 'firstSeen'>> {
  return summary.timing
    .filter((r) => r.band === 'overdue' || (r.band === 'due_soon' && r.daysUntil <= DUE_SOON_DAYS))
    .map((r) => {
      const overdue = r.band === 'overdue'
      const days = Math.abs(r.daysUntil)
      return {
        key: `${overdue ? 'overdue' : 'due'}:${r.kind}:${r.id}`,
        // Overdue is still `attention`, not `critical`. Critical is reserved
        // for things that are broken; a missed deadline is a decision that
        // went badly, and colouring both the same makes neither mean anything.
        tier: 'attention' as Tier,
        title: r.title,
        body: overdue
          ? `Deadline passed ${plural(days, 'day', 'days')} ago.`
          : days === 0
            ? 'Deadline is today.'
            : `Deadline in ${plural(days, 'day', 'days')}.`,
        href: '#review/timing',
        action: 'Open',
      }
    })
}

/**
 * Snoozes that have come back.
 *
 * Grouped, because these arrive in clumps — a research run that touches six
 * rows wakes all six at once, and six identical notifications is a flood
 * rather than information. The names go in the body.
 */
function snoozeNotes(items: ReviewItem[], today: string): Array<Omit<Notification, 'read' | 'firstSeen'>> {
  const woken = items.filter(
    (i) => i.snooze.until !== null && !i.snooze.active && i.snooze.until <= today,
  )
  if (woken.length === 0) return []

  const names = woken.slice(0, 3).map((i) => i.title)
  const rest = woken.length - names.length

  return [
    {
      // The key carries the count, so waking two more items produces a new
      // notification rather than silently hiding inside one you already read.
      key: `snooze:woke:${woken.length}`,
      tier: 'attention',
      title: `${plural(woken.length, 'snoozed item', 'snoozed items')} came back`,
      body: rest > 0 ? `${names.join(', ')}, and ${rest} more.` : `${names.join(', ')}.`,
      href: '#review/needs',
      action: 'Review',
    },
  ]
}

/**
 * Builds the list.
 *
 * `marks` supplies read/dismiss state and the first-seen timestamp; anything
 * without a mark is new and unread. Dismissal lasts for the day — a critical
 * whose cause still holds returns tomorrow, because "dismiss" on something
 * broken means "not now", not "never".
 */
export function buildNotifications(input: {
  items: ReviewItem[]
  summary: QueueSummary
  health: HealthInput
  marks: Mark[]
  /** ISO timestamp; the date part is used for the dismissal window. */
  now: string
}): { items: Notification[]; unread: number; unreadCritical: number } {
  const today = input.now.slice(0, 10)
  const seen = new Map(input.marks.map((m) => [m.dedupeKey, m]))

  const raw = [
    ...connectionNotes(input.health),
    ...healthNotes(input.summary),
    ...timingNotes(input.summary),
    ...snoozeNotes(input.items, today),
  ]

  const items = raw
    .filter((n) => {
      const mark = seen.get(n.key)
      if (!mark?.dismissedAt) return true
      // Dismissed today: stay hidden. Dismissed before today: raise it again.
      return mark.dismissedAt.slice(0, 10) < today
    })
    .map((n) => {
      const mark = seen.get(n.key)
      return {
        ...n,
        read: Boolean(mark?.readAt),
        firstSeen: mark?.firstSeen ?? input.now,
      }
    })
    .sort((a, b) => {
      const tier = TIER_RANK[a.tier] - TIER_RANK[b.tier]
      if (tier !== 0) return tier
      // Newest first inside a tier, then by key so the order is stable across
      // reads when two conditions were first seen in the same millisecond.
      return b.firstSeen.localeCompare(a.firstSeen) || a.key.localeCompare(b.key)
    })

  const unread = items.filter((n) => !n.read)
  return {
    items,
    unread: unread.length,
    unreadCritical: unread.filter((n) => n.tier === 'critical').length,
  }
}
