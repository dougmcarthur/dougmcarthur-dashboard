import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPENING_LEAD_DAYS,
  MAX_OPENING_LEAD_DAYS,
  NUDGE_DEFAULTS,
  NUDGE_KINDS,
  addDays,
  goesTo,
  normaliseDestination,
  normaliseLeadDays,
  nudgeKindSpec,
  owesReply,
  planNudges,
  type NudgePreferences,
  type NudgeRow,
} from '../shared/nudgeRouting'

const row = (o: Partial<NudgeRow> = {}): NudgeRow => ({
  name: 'Winnipeg Folk Festival',
  status: 'shortlisted',
  opensAt: '2026-11-01',
  deadline: '2027-01-15',
  showStart: null,
  showEndExclusive: null,
  replyDueOn: null,
  ...o,
})

const plan = (r: Partial<NudgeRow> = {}, p: Partial<NudgePreferences> = {}) =>
  planNudges(row(r), { ...NUDGE_DEFAULTS, ...p })

const on = (surface: 'tasks' | 'calendar', r?: Partial<NudgeRow>, p?: Partial<NudgePreferences>) =>
  plan(r, p).filter((n) => n.surface === surface)

describe('which surface each kind is even allowed to reach', () => {
  it('never lets a confirmed show become a task', () => {
    // Ticking off a festival you played is not a thing anybody wants, and a
    // task list is a list of work outstanding. A show is neither.
    expect(nudgeKindSpec('show').choices).not.toContain('tasks')
    expect(nudgeKindSpec('show').choices).not.toContain('both')
  })

  it('never lets a reply you owe become a calendar entry', () => {
    // There is no hour at which "chase this" happens. It is a state the row
    // is in, and an all-day entry claiming otherwise is a lie about a time.
    expect(nudgeKindSpec('reply').choices).not.toContain('calendar')
    expect(nudgeKindSpec('reply').choices).not.toContain('both')
  })

  it('lets the application work go either way, because that is the real choice', () => {
    for (const id of ['deadline', 'opens'] as const) {
      expect(nudgeKindSpec(id).choices, id).toEqual(['tasks', 'calendar', 'both', 'off'])
    }
  })

  it('offers every kind a way to be switched off', () => {
    for (const spec of NUDGE_KINDS) expect(spec.choices, spec.id).toContain('off')
  })

  it('makes the first choice the default, so a screen can read one list', () => {
    for (const spec of NUDGE_KINDS) {
      expect(NUDGE_DEFAULTS[spec.id], spec.id).toBe(spec.choices[0])
    }
  })
})

describe('the default split', () => {
  it('puts the work in Tasks and nothing on the calendar while you are applying', () => {
    expect(on('calendar')).toEqual([])
    expect(on('tasks').map((n) => n.kind)).toEqual(['opens', 'deadline'])
  })

  it('puts the show on the calendar and nothing in Tasks once it is booked', () => {
    const r = { status: 'booked', showStart: '2027-07-09', showEndExclusive: '2027-07-12' }
    expect(on('tasks', r)).toEqual([])
    const show = on('calendar', r)[0]
    // No prefix and no emoji. This one is the show.
    expect(show.title).toBe('Winnipeg Folk Festival')
    expect(show.endDateExclusive).toBe('2027-07-12')
  })
})

describe('the day the window opens, plus one', () => {
  it('holds the task back so the prep exists when you get there', () => {
    // A form that was not accepting applications yesterday has no fields to
    // read until it is. A task due that same morning sends you to an empty
    // application panel, which is worse than no task.
    expect(DEFAULT_OPENING_LEAD_DAYS).toBe(1)
    expect(on('tasks').find((n) => n.kind === 'opens')?.date).toBe('2026-11-02')
  })

  it('lets a deployment whose agents run hourly ask for none of it', () => {
    expect(on('tasks', {}, { openingLeadDays: 0 }).find((n) => n.kind === 'opens')?.date).toBe('2026-11-01')
  })

  it('crosses a month boundary without inventing a date', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    // Leap day, which is the one every hand-rolled date helper gets wrong.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('returns prose unchanged rather than producing Invalid Date', () => {
    expect(addDays('rolling intake', 1)).toBe('rolling intake')
  })
})

describe('what nothing writes', () => {
  it('writes nothing at all for an opportunity nobody has decided on', () => {
    expect(plan({ status: 'discovered' })).toEqual([])
  })

  it('does not write a show for a gig that is merely submitted', () => {
    // The bug the whole split exists to prevent, in its earliest form: a
    // deadline entry that looks like a booking on a phone.
    expect(plan({ status: 'submitted', showStart: '2027-07-09' })).toEqual([])
  })

  it('skips an entry whose date is missing rather than guessing one', () => {
    expect(plan({ opensAt: null }).map((n) => n.kind)).toEqual(['deadline'])
    expect(plan({ opensAt: null, deadline: null })).toEqual([])
  })

  it('goes quiet for a kind switched off, and only that kind', () => {
    const kinds = plan({}, { opens: 'off' }).map((n) => n.kind)
    expect(kinds).toEqual(['deadline'])
  })
})

describe('both, for somebody who wants it in two places', () => {
  it('writes one entry per surface, not one entry twice on one', () => {
    const both = plan({}, { deadline: 'both' }).filter((n) => n.kind === 'deadline')
    expect(both.map((n) => n.surface).sort()).toEqual(['calendar', 'tasks'])
    // Same title and same date on both — they are one fact in two places.
    expect(new Set(both.map((n) => `${n.title}|${n.date}`)).size).toBe(1)
  })

  it('is what goesTo reports, so a caller cannot read `both` as neither', () => {
    expect(goesTo('both', 'tasks')).toBe(true)
    expect(goesTo('both', 'calendar')).toBe(true)
    expect(goesTo('off', 'tasks')).toBe(false)
    expect(goesTo('calendar', 'tasks')).toBe(false)
  })
})

describe('a stored preference read back', () => {
  it('refuses a destination the kind does not offer', () => {
    // Worse than the default: the screen would say Calendar and nothing would
    // ever appear there. Same treatment `readDigestSettings` gives an hour
    // that is not a number.
    expect(normaliseDestination('show', 'tasks')).toBe('calendar')
    expect(normaliseDestination('reply', 'calendar')).toBe('tasks')
  })

  it('refuses a value that is not a destination at all', () => {
    for (const junk of ['', '  ', 'yes', 'BOTH', null, undefined]) {
      expect(normaliseDestination('deadline', junk)).toBe('tasks')
    }
  })

  it('keeps a destination the kind does offer', () => {
    expect(normaliseDestination('deadline', 'both')).toBe('both')
    expect(normaliseDestination('show', 'off')).toBe('off')
  })

  it('refuses a lead time that is not a whole number of days in range', () => {
    for (const junk of ['', 'soon', -1, 1.5, MAX_OPENING_LEAD_DAYS + 1, null]) {
      expect(normaliseLeadDays(junk)).toBe(DEFAULT_OPENING_LEAD_DAYS)
    }
    expect(normaliseLeadDays(0)).toBe(0)
    expect(normaliseLeadDays('3')).toBe(3)
    expect(normaliseLeadDays(MAX_OPENING_LEAD_DAYS)).toBe(MAX_OPENING_LEAD_DAYS)
  })
})

describe('the two states where the ball is back with you', () => {
  it('names them, and no others', () => {
    // `info_requested` is the state that exists *because* it stalls if nobody
    // notices. `invited` is the one where an answer is owed and a deadline
    // nobody set is the only thing that would ever surface it.
    expect(owesReply('info_requested')).toBe(true)
    expect(owesReply('invited')).toBe(true)
    for (const s of ['submitted', 'acknowledged', 'booked', 'declined', 'shortlisted']) {
      expect(owesReply(s), s).toBe(false)
    }
  })

  it('produces a task on the date the caller worked out, and only in Tasks', () => {
    const r = { status: 'info_requested', replyDueOn: '2026-09-16' }
    expect(on('calendar', r)).toEqual([])
    expect(on('tasks', r).map((n) => `${n.kind}|${n.date}`)).toEqual(['reply|2026-09-16'])
  })
})
