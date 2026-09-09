import { describe, it, expect } from 'vitest'
import {
  MAX_SILENCE_DAYS,
  MIN_RUNS_FOR_CADENCE,
  measuredCadence,
  parseRunAt,
  stalledTasks,
  type TaskHistory,
} from '../shared/taskCadence'

/**
 * The real run log, copied out of production on 2026-09-09.
 *
 * Verbatim, including the two `sync-pitch-research` rows stored as
 * `2026-07-17 19:24:50` — a space instead of a `T` and no zone. Those are what
 * the parser actually has to cope with, and inventing tidy fixtures would have
 * hidden the one bug in this module worth having a test for.
 *
 * All three of these agents were scheduled Claude runs on a laptop. They
 * stopped within a week of each other and nobody noticed for a month.
 */
const PRODUCTION: TaskHistory[] = [
  {
    taskId: 'gig-festival-scan',
    runAt: [
      '2026-06-21T18:22:00.000Z', '2026-06-29T01:05:55Z', '2026-07-02T00:00:00Z',
      '2026-07-12T00:00:00Z', '2026-07-15T07:30:00.000Z', '2026-07-31T06:00:00.000Z',
      '2026-08-05T07:00:00.000Z', '2026-08-12T05:30:00Z',
    ],
  },
  {
    taskId: 'sync-pitch-research',
    runAt: [
      '2026-06-21T18:39:00.000Z', '2026-06-29T01:14:34Z', '2026-07-02T00:00:00Z',
      '2026-07-12T21:52:30Z', '2026-07-17 19:24:50', '2026-07-31 14:56:44',
      '2026-08-06T06:00:00.000Z',
    ],
  },
  {
    taskId: 'monthly-promo-checkin',
    runAt: [
      '2026-06-21T19:47:50.000Z', '2026-07-02T08:35:00.000Z', '2026-08-05T07:00:00.000Z',
    ],
  },
]

/** The day this was found. Fixed, so the answer never depends on the clock. */
const TODAY = '2026-09-09T12:00:00.000Z'

describe('parseRunAt', () => {
  it('reads a zoneless timestamp as UTC, not as local time', () => {
    // Date.parse is entitled to treat `2026-07-17 19:24:50` as local. Under
    // TZ=Pacific/Auckland that is twelve hours from the UTC reading, which is
    // enough to move a day count — and the suite runs a second time in
    // Auckland precisely to catch that class of bug.
    expect(parseRunAt('2026-07-17 19:24:50')).toBe(Date.parse('2026-07-17T19:24:50Z'))
  })

  it('reads the ordinary ISO forms unchanged', () => {
    expect(parseRunAt('2026-08-12T05:30:00Z')).toBe(Date.parse('2026-08-12T05:30:00Z'))
    expect(parseRunAt('2026-06-21T18:22:00.000Z')).toBe(Date.parse('2026-06-21T18:22:00.000Z'))
  })

  it('returns null rather than NaN for something that is not a date', () => {
    expect(parseRunAt('last tuesday')).toBeNull()
    expect(parseRunAt('')).toBeNull()
  })
})

describe('measuredCadence', () => {
  it('reads the weekly agents as roughly weekly', () => {
    const weekly = measuredCadence(PRODUCTION[0].runAt)!
    expect(weekly).toBeGreaterThan(5)
    expect(weekly).toBeLessThan(9)
  })

  it('makes no claim below three runs', () => {
    // Two runs is one gap, and one gap is an anecdote.
    expect(measuredCadence(['2026-06-21T00:00:00Z', '2026-06-28T00:00:00Z'])).toBeNull()
    expect(measuredCadence([])).toBeNull()
  })

  it('takes the median so one long gap cannot blind the check', () => {
    // A holiday in the middle of an otherwise daily task. The mean would be
    // 10.75 days and the threshold 27 — a month of silence unremarked.
    const runs = [
      '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z',
      '2026-02-12T00:00:00Z', '2026-02-13T00:00:00Z',
    ]
    expect(measuredCadence(runs)).toBe(1)
  })

  it('ignores duplicate timestamps rather than reading them as no gap', () => {
    // A retried POST writes the same run twice. That is not evidence the task
    // runs continuously, and letting it into the median would say so.
    const runs = [
      '2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z',
      '2026-01-08T00:00:00Z', '2026-01-15T00:00:00Z',
    ]
    expect(measuredCadence(runs)).toBe(7)
  })
})

describe('stalledTasks, against the real history', () => {
  const stalled = stalledTasks({ histories: PRODUCTION, today: TODAY })
  const ids = stalled.map((t) => t.taskId)

  it('catches both weekly agents', () => {
    expect(ids).toContain('gig-festival-scan')
    expect(ids).toContain('sync-pitch-research')
  })

  it('reports the silence and the interval it broke', () => {
    const scan = stalled.find((t) => t.taskId === 'gig-festival-scan')!
    expect(scan.daysSince).toBe(28)
    expect(scan.everyDays).toBe(7)
    expect(scan.overdueBy).toBeGreaterThan(0)
  })

  it('leaves the monthly agent alone, which is the right kind of wrong', () => {
    // 35 days quiet on a ~22-day measured interval, under the 45-day ceiling.
    // It is genuinely late and this does not say so yet. Under-reporting is
    // the safe direction: an alarm you learn to dismiss is worse than none,
    // and the ceiling still raises it inside six weeks.
    expect(ids).not.toContain('monthly-promo-checkin')
  })

  it('puts the worst offender first', () => {
    expect(stalled[0].taskId).toBe('sync-pitch-research')
  })
})

describe('stalledTasks, the cases it must not fire on', () => {
  it('says nothing about a task that is running normally', () => {
    const healthy: TaskHistory[] = [{
      taskId: 'weekly',
      runAt: ['2026-08-19T00:00:00Z', '2026-08-26T00:00:00Z', '2026-09-02T00:00:00Z', '2026-09-08T00:00:00Z'],
    }]
    expect(stalledTasks({ histories: healthy, today: TODAY })).toEqual([])
  })

  it('does not alarm hours after a task that ran twice in a morning', () => {
    // Without the floor, a measured cadence of ten minutes makes any afternoon
    // look like an outage.
    const bursty: TaskHistory[] = [{
      taskId: 'bursty',
      runAt: ['2026-09-09T09:00:00Z', '2026-09-09T09:10:00Z', '2026-09-09T09:20:00Z'],
    }]
    expect(stalledTasks({ histories: bursty, today: TODAY })).toEqual([])
  })

  it('skips a task with too little history rather than guessing', () => {
    const young: TaskHistory[] = [{ taskId: 'new', runAt: ['2026-01-01T00:00:00Z'] }]
    expect(stalledTasks({ histories: young, today: TODAY })).toEqual([])
    expect(MIN_RUNS_FOR_CADENCE).toBe(3)
  })

  it('caps the threshold so a slow task is still raised inside six weeks', () => {
    // Two gaps of a year would otherwise put the threshold past two years.
    const yearly: TaskHistory[] = [{
      taskId: 'yearly',
      runAt: ['2024-09-09T00:00:00Z', '2025-09-09T00:00:00Z', '2026-06-01T00:00:00Z'],
    }]
    const [task] = stalledTasks({ histories: yearly, today: TODAY })
    expect(task?.taskId).toBe('yearly')
    expect(task.daysSince).toBeGreaterThan(MAX_SILENCE_DAYS)
  })

  it('returns nothing rather than throwing when today is unreadable', () => {
    expect(stalledTasks({ histories: PRODUCTION, today: 'whenever' })).toEqual([])
  })
})
