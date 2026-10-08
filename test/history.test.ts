import { describe, it, expect } from 'vitest'
import { buildHistory, groupByDay, type HistoryRun } from '../shared/history'
import { runEventKey, runTier, runTitle } from '../shared/runEvents'
import { buildNotifications, type StoredEvent } from '../shared/notifications'
import { buildReviewQueue, summariseQueue } from '../shared/reviewQueue'

const NOW = '2026-10-07T13:00:00.000Z'
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString()

let nextId = 1
function run(o: Partial<HistoryRun> = {}): HistoryRun {
  return {
    id: nextId++,
    taskId: 'gig-festival-scan',
    runAt: hoursAgo(1),
    status: 'ok',
    summary: null,
    itemsAdded: 0,
    ...o,
  }
}

function event(o: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: nextId++,
    kind: 'digest',
    tier: 'info',
    title: 'Weekly digest sent',
    body: null,
    href: null,
    actionLabel: null,
    createdAt: hoursAgo(1),
    readAt: null,
    dismissedAt: null,
    dedupeKey: null,
    ...o,
  }
}

/** The bell's echo of a run, as `POST /api/task-runs` writes it. */
function echoOf(r: HistoryRun, o: Partial<StoredEvent> = {}): StoredEvent {
  return event({
    kind: 'automation',
    title: runTitle(r.taskId, r.status, r.itemsAdded ?? 0),
    body: r.summary,
    tier: runTier(r.status),
    dedupeKey: runEventKey(r.taskId, r.runAt),
    createdAt: r.runAt,
    ...o,
  })
}

const build = (runs: HistoryRun[], events: StoredEvent[], limit = 30) => buildHistory({ runs, events, limit })

describe('a run', () => {
  it('is listed from the run itself, with its own fields', () => {
    const r = run({ itemsAdded: 3, summary: 'Swept the usual listings.' })
    const [entry] = build([r], []).entries
    expect(entry.kind).toBe('automation')
    expect(entry.title).toBe('Gig research added 3 items')
    expect(entry.status).toBe('ok')
    expect(entry.at).toBe(r.runAt)
  })

  it('never shows the task id', () => {
    const [entry] = build([run({ taskId: 'brand-new-agent' })], []).entries
    expect(JSON.stringify(entry)).not.toContain('brand-new-agent')
  })

  it('carries a report only when the run said something', () => {
    expect(build([run({ summary: null })], []).entries[0].report).toBeNull()
    expect(build([run({ summary: 'Timed out.' })], []).entries[0].report?.intro).toEqual(['Timed out.'])
  })

  it('reads one line for the body and keeps the rest for the report', () => {
    const summary = 'Filed three:\n1. Alpha — first\n2. Beta — second\n3. Gamma — third'
    const [entry] = build([run({ summary, itemsAdded: 3 })], []).entries
    expect(entry.body).toBe('Alpha, Beta and Gamma')
    expect(entry.report?.entries).toHaveLength(3)
  })

  it('rates a run that did not come back fine as attention, never critical', () => {
    expect(build([run({ status: 'failed' })], []).entries[0].tier).toBe('attention')
  })

  it('has nowhere to send you, since it is already on the page that lists it', () => {
    const [entry] = build([run()], []).entries
    expect(entry.href).toBeNull()
    expect(entry.action).toBeNull()
  })

  it('files a timestamp with a space and no zone as UTC', () => {
    // Two production rows hold `2026-07-17 19:24:50`. Read as local time that is
    // twelve hours out under TZ=Pacific/Auckland, enough to land on another day.
    const [entry] = build([run({ runAt: '2026-07-17 19:24:50' })], []).entries
    expect(entry.at).toBe('2026-07-17T19:24:50.000Z')
  })
})

describe('whether a run is still unread', () => {
  it('follows its echo on the bell', () => {
    const r = run()
    expect(build([r], [echoOf(r)]).entries[0].read).toBe(false)
    expect(build([r], [echoOf(r, { readAt: NOW })]).entries[0].read).toBe(true)
  })

  it('names the echo, so reading it here clears the badge there', () => {
    const r = run()
    const echo = echoOf(r)
    expect(build([r], [echo]).entries[0].readKey).toBe(`event:automation:${echo.id}`)
  })

  it('reads as read once the echo has been pruned, with nothing left to mark', () => {
    // A run a month old has been out of the bell for a month. An unread dot no
    // button can clear is the failure the bell's own rules were written against.
    const [entry] = build([run({ runAt: hoursAgo(24 * 40) })], []).entries
    expect(entry.read).toBe(true)
    expect(entry.readKey).toBeNull()
  })

  it('does not list the echo as a second entry', () => {
    const r = run()
    expect(build([r], [echoOf(r)]).entries).toHaveLength(1)
  })

  it('does not mistake another run of the same task for this one', () => {
    const a = run({ runAt: hoursAgo(2) })
    const b = run({ runAt: hoursAgo(1) })
    const entries = build([a, b], [echoOf(a, { readAt: NOW }), echoOf(b)]).entries
    expect(entries.map((e) => e.read)).toEqual([false, true])
  })
})

describe('an event', () => {
  it('is listed with its own words', () => {
    const [entry] = build([], [event({ body: 'The digest went out.' })]).entries
    expect(entry.title).toBe('Weekly digest sent')
    expect(entry.body).toBe('The digest went out.')
    expect(entry.readKey).toBe(`event:digest:${entry.key.split(':')[1]}`)
  })

  it('is listed after it was dismissed in the bell', () => {
    // Dismissing puts something away from the bell. It does not unhappen.
    const entries = build([], [event({ dismissedAt: NOW, readAt: NOW })]).entries
    expect(entries).toHaveLength(1)
    expect(entries[0].read).toBe(true)
  })

  it('keeps a link that goes somewhere', () => {
    const [entry] = build([], [event({ href: '#review/mail', actionLabel: 'Read them' })]).entries
    expect(entry.href).toBe('#review/mail')
    expect(entry.action).toBe('Read them')
  })

  it('drops a link to this page, and the button that went with it', () => {
    for (const href of ['#runs', '#runs/automation']) {
      const [entry] = build([], [event({ href, actionLabel: 'View run' })]).entries
      expect(entry.href, href).toBeNull()
      expect(entry.action, href).toBeNull()
    }
  })

  it('is never the one that holds a run, whatever kind it is filed under', () => {
    const r = run()
    const echo = echoOf(r)
    expect(build([], [echo]).entries).toEqual([])
  })
})

describe('the timeline', () => {
  it('merges runs and events newest first', () => {
    const entries = build(
      [run({ runAt: hoursAgo(5) }), run({ runAt: hoursAgo(1) })],
      [event({ createdAt: hoursAgo(3), title: 'Middle' })],
    ).entries
    expect(entries.map((e) => e.title)).toEqual(['Gig research ran, nothing new', 'Middle', 'Gig research ran, nothing new'])
    expect(entries.map((e) => e.at)).toEqual([hoursAgo(1), hoursAgo(3), hoursAgo(5)])
  })

  it('stops at the limit and gives the cursor for what is next', () => {
    const runs = [1, 2, 3, 4, 5].map((h) => run({ runAt: hoursAgo(h) }))
    const page = build(runs, [], 3)
    expect(page.entries).toHaveLength(3)
    expect(page.next).toBe(hoursAgo(3))
  })

  it('has no cursor on the last page', () => {
    expect(build([run(), run({ runAt: hoursAgo(2) })], [], 5).next).toBeNull()
  })

  it('does not split two entries that share the last timestamp across the line', () => {
    // The next page starts strictly after the cursor, so the second of two
    // simultaneous entries would be on neither page.
    const at = hoursAgo(2)
    const page = build([run({ runAt: hoursAgo(1) }), run({ runAt: at, taskId: 'a' }), run({ runAt: at, taskId: 'b' })], [], 2)
    expect(page.entries).toHaveLength(3)
    expect(page.next).toBeNull()
  })

  it('orders simultaneous entries the same way every time', () => {
    // Two reads of the same rows must not swap places, or a list re-renders
    // under the cursor for no reason anyone can see.
    const at = hoursAgo(1)
    const first = run({ id: 900, runAt: at, taskId: 'a' })
    const second = run({ id: 901, runAt: at, taskId: 'b' })
    const forwards = build([first, second], []).entries.map((e) => e.key)
    const backwards = build([second, first], []).entries.map((e) => e.key)
    expect(forwards).toEqual(backwards)
  })
})

describe('days', () => {
  const utcDay = (iso: string) => iso.slice(0, 10)

  it('groups consecutive entries under the day they fall on', () => {
    const entries = build(
      [run({ runAt: '2026-10-07T09:00:00.000Z' }), run({ runAt: '2026-10-07T01:00:00.000Z' }), run({ runAt: '2026-10-05T09:00:00.000Z' })],
      [],
    ).entries
    const groups = groupByDay(entries, utcDay)
    expect(groups.map((g) => [g.day, g.entries.length])).toEqual([
      ['2026-10-07', 2],
      ['2026-10-05', 1],
    ])
  })

  it('files an entry by the reader\'s own day, which is not always the server\'s', () => {
    // Seven in the evening in Winnipeg is tomorrow in UTC.
    const winnipeg = (iso: string) =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Winnipeg' })
    const [entry] = build([run({ runAt: '2026-10-08T00:30:00.000Z' })], []).entries
    expect(utcDay(entry.at)).toBe('2026-10-08')
    expect(groupByDay([entry], winnipeg)[0].day).toBe('2026-10-07')
  })

  it('says nothing for no entries', () => {
    expect(groupByDay([], utcDay)).toEqual([])
  })
})

describe('what the bell shows of the same thing', () => {
  const build2 = (events: StoredEvent[], limit?: number) => {
    const items = buildReviewQueue({ today: '2026-10-07' })
    return buildNotifications({
      items,
      summary: summariseQueue(items, { orphanedReminders: 0 }),
      health: { calendarConfigured: true, gmailConfigured: true, emailConfigured: true },
      marks: [],
      events,
      now: NOW,
      limit,
    })
  }

  it('reads a run echo as what the run filed, not as its report', () => {
    const summary = 'Read the brief at length. '.repeat(20) + '\n1. Alpha — one\n2. Beta — two'
    const r = run({ summary, itemsAdded: 2 })
    const [item] = build2([echoOf(r)]).items
    expect(item.body).toBe('Alpha and Beta')
  })

  it('cuts any other long body to one line', () => {
    const [item] = build2([event({ body: 'word '.repeat(100) })]).items
    expect(item.body.length).toBeLessThanOrEqual(140)
    expect(item.body.endsWith('…')).toBe(true)
  })

  it('summarises a group by its newest member', () => {
    const items = build2([
      event({ id: 1, kind: 'reconcile', title: 'Newest', createdAt: hoursAgo(1) }),
      event({ id: 2, kind: 'reconcile', title: 'Older', createdAt: hoursAgo(2) }),
    ]).items
    expect(items[0].title).toBe('2 reconcile updates')
    expect(items[0].body).toBe('Latest: Newest')
  })

  it('opens History on the type, from a group', () => {
    const items = build2([
      event({ id: 1, kind: 'reconcile', createdAt: hoursAgo(1) }),
      event({ id: 2, kind: 'reconcile', createdAt: hoursAgo(2) }),
    ]).items
    expect(items[0].href).toBe('#runs/reconcile')
  })

  it('lifts the cap for the page the cap sends you to', () => {
    const many = Array.from({ length: 40 }, (_, i) => event({ kind: 'digest', createdAt: hoursAgo(i * 30) }))
    expect(build2(many).items).toHaveLength(20)
    expect(build2(many, Infinity).items).toHaveLength(40)
  })
})
