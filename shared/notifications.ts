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
 * There are two kinds and they need different mechanisms, which is the part
 * worth getting right:
 *
 *  - **Conditions** — a connection being down, an item being overdue — are
 *    facts about right now, derived fresh on every read. Nothing is stored but
 *    your read and dismiss marks, so a condition that stops holding stops being
 *    reported without anything having to clean up after it.
 *  - **Events** — a run finishing, a digest going out — happened at a moment
 *    and are not recoverable from current state, so they are rows (see
 *    migration 0007) and arrive here as `events`.
 *
 * They are merged into one sorted list and the client never learns there were
 * two mechanisms. Forcing either into the other's shape is what makes these
 * systems rot: conditions would go stale, and events would be invented.
 */

import type { ReviewItem, QueueSummary } from './reviewQueue'

/**
 * Three tiers, not five. More than three and nobody remembers what they mean.
 *
 * The UI carries these as lightness rather than a third hue, so severity
 * survives colour blindness and the palette stays at two colours.
 */
import { stalledTasks, type TaskHistory } from './taskCadence'
import { taskLabel } from './taskLabels'

export type Tier = 'critical' | 'attention' | 'info'

/**
 * What a notification is *about*, which is the axis worth filtering on.
 *
 * The first four are conditions, the last three events. That split matters to
 * this module and to dismissal, but not to someone scanning the list, so it is
 * not what the filter offers — the filter offers these.
 */
export type NotificationKind =
  | 'connection'
  | 'health'
  | 'timing'
  | 'snooze'
  | 'automation'
  | 'digest'
  | 'reconcile'

/** Filter labels, here rather than in the UI so every consumer agrees. */
export const KIND_LABELS: Record<NotificationKind, string> = {
  connection: 'Connections',
  health: 'Data health',
  timing: 'Deadlines',
  snooze: 'Snoozes',
  automation: 'Automation',
  digest: 'Digest',
  reconcile: 'Reconcile',
}

export interface Notification {
  /** Identity, stable across reads. For events, the row ids it covers. */
  key: string
  kind: NotificationKind
  tier: Tier
  title: string
  body: string
  /** Hash route to the thing this is about. */
  href: string
  /** Label for the one action, when there is a useful one. */
  action?: string
  read: boolean
  /** ISO timestamp this condition was first observed, or the event happened. */
  firstSeen: string
  /**
   * Derived fresh, or a stored row. The client shows both the same way; what
   * it changes is what dismissal means — see `buildNotifications`.
   */
  source: 'condition' | 'event'
  /** How many rows a grouped event row stands for. 1 for everything else. */
  count: number
}

/** A row from `notification_events`, as the route reads it. */
export interface StoredEvent {
  id: number
  kind: string
  tier: string
  title: string
  body: string | null
  href: string | null
  actionLabel: string | null
  createdAt: string
  readAt: string | null
  dismissedAt: string | null
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

/** What a condition generator returns; the rest is filled in from the marks. */
type Draft = Omit<Notification, 'read' | 'firstSeen' | 'source' | 'count'>

const TIER_RANK: Record<Tier, number> = { critical: 0, attention: 1, info: 2 }

/**
 * How close two same-kind events have to be to collapse into one row.
 *
 * Clustered by proximity to each other rather than to `now`, so a burst from
 * last Tuesday collapses just as a burst from this morning does. Grouping only
 * what is recent would leave a long tail of ungrouped rows behind it, which is
 * the flood this is meant to prevent, only slower.
 */
const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000

/** The pane is not a log. Anything past this lives in History. */
const MAX_ITEMS = 20

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
/**
 * A scheduled agent that has stopped reporting.
 *
 * `critical` rather than `attention`, and the distinction is deliberate: a run
 * that *failed* is retried on its next tick and costs you nothing today, which
 * is why `runTier` in the task-runs route rates one `attention`. A schedule
 * that has stopped is not retried by anything. It is plumbing that is broken
 * now and costing you silently — the definition this app reserves `critical`
 * for — and what it costs is festival deadlines passing with no row to show
 * for them.
 *
 * The body says what the task's own history claims its interval is, because
 * "quiet for 28 days" means nothing without "it used to run every 7".
 */
function automationNotes(histories: TaskHistory[], today: string): Draft[] {
  return stalledTasks({ histories, today }).map((task) => ({
    key: `automation:stalled:${task.taskId}`,
    kind: 'automation' as NotificationKind,
    tier: 'critical' as Tier,
    title: `${taskLabel(task.taskId)} has not run in ${task.daysSince} days`,
    body: `It ran about every ${task.everyDays} days until it stopped. Nothing has taken over in the meantime.`,
    href: '#runs',
    action: 'View runs',
  }))
}

function connectionNotes(health: HealthInput): Draft[] {
  const out: Draft[] = []

  if (!health.calendarConfigured) {
    out.push({
      key: 'connection:calendar',
      kind: 'connection',
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
      kind: 'connection',
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
      kind: 'connection',
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
function healthNotes(summary: QueueSummary): Draft[] {
  const out: Draft[] = []
  const h = summary.health

  if (h.conflicts > 0) {
    out.push({
      key: 'health:conflicts',
      kind: 'health',
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
      kind: 'health',
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
function timingNotes(summary: QueueSummary): Draft[] {
  return summary.timing
    .filter((r) => r.band === 'overdue' || (r.band === 'due_soon' && r.daysUntil <= DUE_SOON_DAYS))
    .map((r) => {
      const overdue = r.band === 'overdue'
      const days = Math.abs(r.daysUntil)
      return {
        key: `${overdue ? 'overdue' : 'due'}:${r.kind}:${r.id}`,
        kind: 'timing' as NotificationKind,
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
function snoozeNotes(items: ReviewItem[], today: string): Draft[] {
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
      kind: 'snooze',
      tier: 'attention',
      title: `${plural(woken.length, 'snoozed item', 'snoozed items')} came back`,
      body: rest > 0 ? `${names.join(', ')}, and ${rest} more.` : `${names.join(', ')}.`,
      href: '#review/needs',
      action: 'Review',
    },
  ]
}

/**
 * Clusters stored events into rows.
 *
 * Same kind, within `GROUP_WINDOW_MS` of the cluster's newest member: one row.
 * A research run that touches six rows should not cost six rows in the pane,
 * and the names go in the body where they are still readable.
 *
 * The key carries the member ids, so read and dismiss act on exactly the rows
 * that were on screen when they were clicked, not on whatever the group has
 * since become.
 */
function groupEvents(events: StoredEvent[]): Array<Notification & { ids: number[] }> {
  const live = events
    .filter((e) => !e.dismissedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)

  const clusters: StoredEvent[][] = []
  for (const e of live) {
    const open = clusters.find(
      (c) =>
        c[0].kind === e.kind &&
        Date.parse(c[0].createdAt) - Date.parse(e.createdAt) <= GROUP_WINDOW_MS,
    )
    if (open) open.push(e)
    else clusters.push([e])
  }

  return clusters.map((c) => {
    const head = c[0]
    const kind = head.kind as NotificationKind
    const ids = c.map((e) => e.id)
    // Any unread member makes the row unread. Collapsing must never bury an
    // unread event inside a row that looks dealt with.
    const read = c.every((e) => e.readAt !== null)
    // Worst tier wins, for the same reason.
    const tier = c
      .map((e) => e.tier as Tier)
      .sort((a, b) => TIER_RANK[a] - TIER_RANK[b])[0]

    const names = c.slice(0, 3).map((e) => e.title)
    const rest = c.length - names.length

    return {
      key: `event:${kind}:${ids.join('+')}`,
      kind,
      tier,
      title:
        c.length === 1
          ? head.title
          : `${c.length} ${(KIND_LABELS[kind] ?? kind).toLowerCase()} updates`,
      body:
        c.length === 1
          ? (head.body ?? '')
          : rest > 0
            ? `${names.join('; ')}, and ${plural(rest, 'more', 'more')}.`
            : `${names.join('; ')}.`,
      // History is where everything that happened lives, so it is the right
      // fallback for an event whose writer had nowhere better to point.
      href: (c.length === 1 ? head.href : null) ?? '#runs',
      action: c.length === 1 ? (head.actionLabel ?? undefined) : 'View all',
      read,
      firstSeen: head.createdAt,
      source: 'event' as const,
      count: c.length,
      ids,
    }
  })
}

/**
 * Builds the list.
 *
 * `marks` supplies read/dismiss state and the first-seen timestamp for
 * conditions; anything without a mark is new and unread. Events carry their own
 * read and dismissed columns, because the two mean different things:
 *
 *  - Dismissing a **condition** lasts for the day. A critical whose cause still
 *    holds returns tomorrow — "dismiss" on something broken means "not now",
 *    not "never".
 *  - Dismissing an **event** is permanent. It already happened; there is
 *    nothing for it to come back and tell you.
 */
export function buildNotifications(input: {
  items: ReviewItem[]
  summary: QueueSummary
  health: HealthInput
  marks: Mark[]
  /** Rows from `notification_events`. Absent is the same as none. */
  events?: StoredEvent[]
  /**
   * Every recorded run, grouped by task. Absent is the same as none, which
   * means a caller that does not supply them simply gets no staleness check
   * rather than a claim that nothing is stale.
   */
  taskRuns?: TaskHistory[]
  /** ISO timestamp; the date part is used for the dismissal window. */
  now: string
}): { items: Notification[]; unread: number; unreadCritical: number; total: number } {
  const today = input.now.slice(0, 10)
  const seen = new Map(input.marks.map((m) => [m.dedupeKey, m]))

  const raw = [
    ...connectionNotes(input.health),
    ...automationNotes(input.taskRuns ?? [], input.now),
    ...healthNotes(input.summary),
    ...timingNotes(input.summary),
    ...snoozeNotes(input.items, today),
  ]

  const conditions: Notification[] = raw
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
        source: 'condition' as const,
        count: 1,
      }
    })

  const all = [...conditions, ...groupEvents(input.events ?? [])].sort((a, b) => {
    const tier = TIER_RANK[a.tier] - TIER_RANK[b.tier]
    if (tier !== 0) return tier
    // Newest first inside a tier, then by key so the order is stable across
    // reads when two things were first seen in the same millisecond.
    return b.firstSeen.localeCompare(a.firstSeen) || a.key.localeCompare(b.key)
  })

  // Truncation is by rank, so what falls off the end is always the least
  // urgent and the oldest. The count of what fell off goes back with it.
  const items = all.slice(0, MAX_ITEMS)

  // Counted across everything, not just the visible page: a badge that only
  // counts the first twenty is a badge that lies once there are twenty-one.
  const unread = all.filter((n) => !n.read)
  return {
    items,
    unread: unread.length,
    unreadCritical: unread.filter((n) => n.tier === 'critical').length,
    total: all.length,
  }
}

/**
 * The event row ids a key refers to, or none if it is a condition key.
 *
 * Lives here rather than in the route because the key format is this module's
 * to define, and a parser that drifts from its producer is a silent bug.
 */
export function eventIdsFromKey(key: string): number[] {
  const m = /^event:[a-z_]+:([\d+]+)$/.exec(key)
  if (!m) return []
  return m[1].split('+').map(Number).filter((n) => Number.isInteger(n) && n > 0)
}
