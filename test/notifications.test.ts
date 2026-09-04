import { describe, it, expect } from 'vitest'
import {
  buildNotifications,
  eventIdsFromKey,
  type Mark,
  type HealthInput,
  type StoredEvent,
} from '../shared/notifications'
import { buildReviewQueue, summariseQueue } from '../shared/reviewQueue'
import type { GigOpportunity, SyncTarget } from '../shared/types'

const NOW = '2026-08-25T09:00:00.000Z'
const TODAY = '2026-08-25'

const OK: HealthInput = { calendarConfigured: true, gmailConfigured: true, emailConfigured: true }

/**
 * Deadlines relative to the fixture's own TODAY.
 *
 * These used to be relative to the *real* clock, because `parseDeadline` read
 * it directly while `buildReviewQueue({ today })` injected only snooze maths.
 * That seam is closed — `today` reaches the deadline maths now — so a fixture
 * date means the same thing on every run, which is the point of a fixture.
 */
const dayOffset = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function gig(o: Partial<GigOpportunity> & { id: number; name: string }): GigOpportunity {
  return {
    type: 'festival', organizer: null, submissionMethod: null, audienceSize: null,
    genreFitScore: null, deadline: null, deadlineNote: null, opensAt: null,
    feeAmount: null, feeCurrency: 'USD', fee: null, paid: 0, fitNotes: null,
    fitRationale: null, url: null, status: 'approved', googleEventId: null,
    snoozedUntil: null, snoozedAt: null,
    discoveredAt: '2026-07-01', updatedAt: '2026-08-01', ...o,
  }
}

function sync(o: Partial<SyncTarget> & { id: number; name: string }): SyncTarget {
  return {
    agencyType: null, contactEmail: null, contactRole: null, confirmationMethod: null,
    notes: null, pitchDraft: null, pitchSent: null, status: 'pitched',
    snoozedUntil: null, snoozedAt: null,
    discoveredAt: '2026-06-21', updatedAt: '2026-06-29', reconciledAt: null, ...o,
  }
}

let nextEventId = 1
function event(o: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: o.id ?? nextEventId++,
    kind: 'automation',
    tier: 'info',
    title: 'gig-research added 2 items',
    body: null,
    href: null,
    actionLabel: null,
    createdAt: NOW,
    readAt: null,
    dismissedAt: null,
    ...o,
  }
}

/** Builds the notification list the way the route does. */
function build(input: {
  gigs?: GigOpportunity[]
  sync?: SyncTarget[]
  health?: HealthInput
  marks?: Mark[]
  events?: StoredEvent[]
  orphans?: number
  now?: string
}) {
  const items = buildReviewQueue({ gigs: input.gigs, sync: input.sync, today: TODAY })
  return buildNotifications({
    items,
    summary: summariseQueue(items, { orphanedReminders: input.orphans ?? 0 }),
    health: input.health ?? OK,
    marks: input.marks ?? [],
    events: input.events,
    now: input.now ?? NOW,
  })
}

/** ISO timestamp `h` hours before NOW. */
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString()

const keys = (r: ReturnType<typeof build>) => r.items.map((n) => n.key)

describe('conditions', () => {
  it('says nothing when everything is connected and nothing is due', () => {
    expect(build({}).items).toEqual([])
  })

  it('reports each broken connection separately, so each can be fixed', () => {
    const r = build({ health: { calendarConfigured: false, gmailConfigured: false, emailConfigured: true } })
    expect(keys(r)).toEqual(['connection:calendar', 'connection:gmail'])
    expect(r.items.every((n) => n.tier === 'critical')).toBe(true)
  })

  it('counts orphaned reminders, which nothing else will ever surface', () => {
    expect(keys(build({ orphans: 2 }))).toContain('health:orphans')
  })

  it('reports an overdue deadline as attention, not critical', () => {
    // Critical is reserved for things that are broken. A missed deadline is a
    // decision that went badly; colouring both the same makes neither mean
    // anything.
    const r = build({ gigs: [gig({ id: 1, name: 'Late', deadline: dayOffset(-5) })] })
    const overdue = r.items.find((n) => n.key.startsWith('overdue:'))
    expect(overdue?.tier).toBe('attention')
    expect(overdue?.body).toBe('Deadline passed 5 days ago.')
  })

  it('gives each deadline its own key, so one can be dismissed without the others', () => {
    const r = build({
      gigs: [
        gig({ id: 1, name: 'A', deadline: dayOffset(3) }),
        gig({ id: 2, name: 'B', deadline: dayOffset(6) }),
      ],
    })
    expect(keys(r)).toEqual(expect.arrayContaining(['due:gig:1', 'due:gig:2']))
  })

  it('groups woken snoozes instead of flooding', () => {
    // A research run touching six rows wakes all six at once, and six
    // identical notifications is a flood rather than information.
    const woke = (id: number, name: string) =>
      gig({ id, name, snoozedUntil: '2026-08-24', snoozedAt: '2026-08-01T00:00:00.000Z' })
    const r = build({ gigs: [woke(1, 'One'), woke(2, 'Two'), woke(3, 'Three'), woke(4, 'Four')] })
    const note = r.items.find((n) => n.key.startsWith('snooze:woke'))
    expect(note?.title).toBe('4 snoozed items came back')
    // Three names then a count. Which three is the queue's ordering, not this
    // module's, so the assertion is on the shape.
    expect(note?.body).toMatch(/^(\w+, ){2}\w+, and 1 more\.$/)
  })

  it('leaves a snooze that is still holding alone', () => {
    const r = build({
      gigs: [gig({ id: 1, name: 'Later', snoozedUntil: '2026-09-30', snoozedAt: '2026-08-01T00:00:00.000Z' })],
    })
    expect(keys(r)).toEqual([])
  })
})

describe('ordering', () => {
  it('puts what is broken above what merely happened', () => {
    const r = build({
      health: { ...OK, calendarConfigured: false },
      gigs: [gig({ id: 1, name: 'Due', deadline: dayOffset(3) })],
    })
    expect(r.items[0].key).toBe('connection:calendar')
  })
})

describe('read and dismiss', () => {
  const mark = (o: Partial<Mark> & { dedupeKey: string }): Mark => ({
    firstSeen: '2026-08-20T00:00:00.000Z', readAt: null, dismissedAt: null, ...o,
  })

  it('counts unread, and counts criticals separately', () => {
    const r = build({ health: { calendarConfigured: false, gmailConfigured: false, emailConfigured: true } })
    expect(r.unread).toBe(2)
    expect(r.unreadCritical).toBe(2)
  })

  it('drops out of the unread count once read, but stays in the list', () => {
    const r = build({
      health: { ...OK, calendarConfigured: false },
      marks: [mark({ dedupeKey: 'connection:calendar', readAt: '2026-08-24T00:00:00.000Z' })],
    })
    expect(keys(r)).toEqual(['connection:calendar'])
    expect(r.unread).toBe(0)
  })

  it('hides something dismissed today', () => {
    const r = build({
      health: { ...OK, calendarConfigured: false },
      marks: [mark({ dedupeKey: 'connection:calendar', dismissedAt: `${TODAY}T08:00:00.000Z` })],
    })
    expect(keys(r)).toEqual([])
  })

  it('brings a dismissed critical back the next day, because it is still broken', () => {
    // Dismiss means "not now", not "never". The Calendar is still down.
    const r = build({
      health: { ...OK, calendarConfigured: false },
      marks: [mark({ dedupeKey: 'connection:calendar', dismissedAt: '2026-08-24T08:00:00.000Z' })],
    })
    expect(keys(r)).toEqual(['connection:calendar'])
  })

  it('forgets a dismissed condition entirely once it stops holding', () => {
    // The mark survives, but the generator no longer produces the condition,
    // so nothing has to clean up after a reconnect.
    const r = build({
      health: OK,
      marks: [mark({ dedupeKey: 'connection:calendar', dismissedAt: '2026-08-24T08:00:00.000Z' })],
    })
    expect(keys(r)).toEqual([])
  })

  it('keeps first-seen from the mark, so age survives the condition flickering', () => {
    const r = build({
      health: { ...OK, calendarConfigured: false },
      marks: [mark({ dedupeKey: 'connection:calendar', firstSeen: '2026-08-01T00:00:00.000Z' })],
    })
    expect(r.items[0].firstSeen).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('what must never be a notification', () => {
  it('does not report the queue itself', () => {
    // "18 items need a decision" is state: it is already on the Overview and
    // stays true until acted on, so a feed carrying it is never empty.
    const many = Array.from({ length: 18 }, (_, i) =>
      gig({ id: i + 1, name: `Item ${i}`, fitNotes: 'Submission status: NOT submitted.' }),
    )
    const r = build({ gigs: many, sync: [sync({ id: 1, name: 'Agency' })] })
    expect(r.items).toEqual([])
  })
})

describe('events', () => {
  it('merges stored events into the same list as conditions', () => {
    const r = build({ events: [event({ id: 7, title: 'Weekly digest sent' })] })
    expect(keys(r)).toEqual(['event:automation:7'])
    expect(r.items[0].source).toBe('event')
    expect(r.items[0].count).toBe(1)
  })

  it('sorts a critical condition above an event, whatever their ages', () => {
    const r = build({
      health: { ...OK, calendarConfigured: false },
      events: [event({ id: 1, createdAt: NOW })],
    })
    expect(r.items[0].key).toBe('connection:calendar')
  })

  it('collapses same-kind events inside 24 hours into one row', () => {
    const r = build({
      events: [
        event({ id: 1, createdAt: hoursAgo(1), title: 'A' }),
        event({ id: 2, createdAt: hoursAgo(5), title: 'B' }),
        event({ id: 3, createdAt: hoursAgo(20), title: 'C' }),
      ],
    })
    expect(r.items).toHaveLength(1)
    expect(r.items[0].count).toBe(3)
    expect(r.items[0].title).toBe('3 automation updates')
    expect(r.items[0].body).toBe('A; B; C.')
    // The key names the rows it stands for, so read and dismiss act on exactly
    // what was on screen.
    expect(r.items[0].key).toBe('event:automation:1+2+3')
  })

  it('does not collapse across kinds', () => {
    const r = build({
      events: [
        event({ id: 1, kind: 'automation' }),
        event({ id: 2, kind: 'digest', title: 'Weekly digest sent' }),
      ],
    })
    expect(r.items).toHaveLength(2)
  })

  it('starts a new cluster once the gap exceeds the window', () => {
    const r = build({
      events: [
        event({ id: 1, createdAt: hoursAgo(1) }),
        event({ id: 2, createdAt: hoursAgo(30) }),
      ],
    })
    expect(r.items.map((n) => n.count)).toEqual([1, 1])
  })

  it('names the overflow rather than dropping it silently', () => {
    const r = build({
      events: [
        event({ id: 1, createdAt: hoursAgo(1), title: 'A' }),
        event({ id: 2, createdAt: hoursAgo(2), title: 'B' }),
        event({ id: 3, createdAt: hoursAgo(3), title: 'C' }),
        event({ id: 4, createdAt: hoursAgo(4), title: 'D' }),
      ],
    })
    expect(r.items[0].body).toBe('A; B; C, and 1 more.')
  })

  it('keeps a group unread while any member is unread', () => {
    // Collapsing must never bury an unread event inside a row that looks
    // dealt with.
    const r = build({
      events: [
        event({ id: 1, createdAt: hoursAgo(1), readAt: NOW }),
        event({ id: 2, createdAt: hoursAgo(2), readAt: null }),
      ],
    })
    expect(r.items[0].read).toBe(false)
    expect(r.unread).toBe(1)
  })

  it('takes the worst tier in a group, for the same reason', () => {
    const r = build({
      events: [
        event({ id: 1, createdAt: hoursAgo(1), tier: 'info' }),
        event({ id: 2, createdAt: hoursAgo(2), tier: 'critical' }),
      ],
    })
    expect(r.items[0].tier).toBe('critical')
    expect(r.unreadCritical).toBe(1)
  })

  it('hides a dismissed event for good, unlike a dismissed condition', () => {
    // An event already happened; there is nothing for it to come back and
    // tell you.
    const r = build({ events: [event({ id: 1, dismissedAt: '2026-01-01T00:00:00.000Z' })] })
    expect(r.items).toEqual([])
  })

  it('falls back to History for an event whose writer had nowhere to point', () => {
    expect(build({ events: [event({ id: 1 })] }).items[0].href).toBe('#runs')
  })
})

describe('the cap', () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    event({ id: i + 1, kind: i % 2 ? 'automation' : 'digest', createdAt: hoursAgo(i * 30) }),
  )

  it('caps the pane and reports what did not fit', () => {
    const r = build({ events: many })
    expect(r.items).toHaveLength(20)
    expect(r.total).toBe(40)
  })

  it('counts unread across everything, not just the visible page', () => {
    // A badge that only counts the first twenty is a badge that lies once
    // there are twenty-one.
    expect(build({ events: many }).unread).toBe(40)
  })
})

describe('key parsing', () => {
  it('reads the row ids back out of a group key', () => {
    expect(eventIdsFromKey('event:automation:12+13+14')).toEqual([12, 13, 14])
  })

  it('returns nothing for a condition key, so the route can tell them apart', () => {
    expect(eventIdsFromKey('connection:calendar')).toEqual([])
    expect(eventIdsFromKey('overdue:gig:14')).toEqual([])
  })
})
