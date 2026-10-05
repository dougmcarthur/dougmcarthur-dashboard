import { describe, it, expect } from 'vitest'
import {
  DAILY_FOR_DAYS,
  MISSING_AFTER_DAYS,
  MISSING_UNTIL_DAYS,
  WEEKLY_EVERY_DAYS,
  formRevisit,
  revisitNotice,
  type RevisitGig,
} from '../shared/formRevisit'
import { NO_FORM_NOTE, normalisePrepStatus, prepStateOf } from '../shared/application'

/**
 * When to go back to a form that was not there the first time.
 *
 * Dates are written relative to the fixture's own TODAY, never the clock: the
 * rule is about how many days have passed, and a fixture with a hardcoded date
 * stops meaning what it says the day the real one catches up.
 */

const TODAY = '2026-10-05'

function day(offset: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

/** In progress, a listing address, never looked at: due for a first look. */
function gig(over: Partial<RevisitGig> = {}): RevisitGig {
  return {
    status: 'shortlisted',
    url: 'https://fest.example/artists',
    applicationUrl: null,
    opensAt: null,
    deadline: null,
    prepStatus: null,
    prepNote: null,
    prepCheckedAt: null,
    ...over,
  }
}

/** A look `n` days ago, which found nothing. */
const lookedAt = (n: number, over: Partial<RevisitGig> = {}) =>
  gig({ prepStatus: 'not_found', prepNote: `${NO_FORM_NOTE}.`, prepCheckedAt: `${day(-n)}T08:00:00.000Z`, ...over })

describe('which gigs are looked at', () => {
  it('only the ones you said yes to', () => {
    expect(formRevisit(gig({ status: 'discovered' }), TODAY)).toEqual({ due: false, why: 'not_in_progress' })
    expect(formRevisit(gig({ status: 'submitted' }), TODAY)).toEqual({ due: false, why: 'not_in_progress' })
    expect(formRevisit(gig({ status: 'passed' }), TODAY)).toEqual({ due: false, why: 'not_in_progress' })
    expect(formRevisit(gig({ status: 'shortlisted' }), TODAY).due).toBe(true)
    expect(formRevisit(gig({ status: 'preparing' }), TODAY).due).toBe(true)
  })

  it('leaves a form that has been read alone', () => {
    expect(formRevisit(gig({ prepStatus: 'ready', prepCheckedAt: `${day(-30)}T08:00:00Z` }), TODAY)).toEqual({
      due: false,
      why: 'form_on_file',
    })
  })

  it('leaves a form it cannot read for you, since looking again changes nothing', () => {
    const wall = gig({ prepStatus: 'blocked', prepNote: 'The application form is behind a login.', prepCheckedAt: `${day(-9)}T08:00:00Z` })
    expect(formRevisit(wall, TODAY)).toEqual({ due: false, why: 'needs_you' })
  })

  it('still goes back to a "blocked" row that really meant "no form yet"', () => {
    // Stored before `not_found` existed: the same fact, spelled as a wall.
    const legacy = gig({ prepStatus: 'blocked', prepNote: `${NO_FORM_NOTE} — the application may open later.`, prepCheckedAt: `${day(-9)}T08:00:00Z` })
    expect(formRevisit(legacy, TODAY).due).toBe(true)
  })

  it('has nothing to open without an address', () => {
    expect(formRevisit(gig({ url: null, applicationUrl: null }), TODAY)).toEqual({ due: false, why: 'no_address' })
    expect(formRevisit(gig({ url: null, applicationUrl: 'https://fest.example/form' }), TODAY).due).toBe(true)
  })

  it('stops once the deadline has passed, and not before', () => {
    expect(formRevisit(gig({ deadline: day(-1) }), TODAY)).toEqual({ due: false, why: 'closed' })
    expect(formRevisit(gig({ deadline: TODAY }), TODAY).due).toBe(true)
    // Prose is not a date, and a deadline nobody can read is not a reason to stop.
    expect(formRevisit(gig({ deadline: 'None — rolling artist roster intake' }), TODAY).due).toBe(true)
  })
})

describe('a window with a date', () => {
  it('is not looked at before it opens, however long it has been', () => {
    expect(formRevisit(lookedAt(60, { opensAt: day(1) }), TODAY)).toEqual({ due: false, why: 'not_open_yet' })
    expect(formRevisit(gig({ opensAt: day(30) }), TODAY)).toEqual({ due: false, why: 'not_open_yet' })
  })

  it('is looked at the day it opens, and every day for two weeks', () => {
    expect(formRevisit(gig({ opensAt: TODAY }), TODAY)).toEqual({ due: true, why: 'first_look' })
    for (const since of [0, 1, 5, DAILY_FOR_DAYS]) {
      expect(formRevisit(lookedAt(1, { opensAt: day(-since) }), TODAY), `${since} days after opening`).toEqual({
        due: true,
        why: 'window_open',
      })
    }
  })

  it('is not looked at twice in a day', () => {
    expect(formRevisit(lookedAt(0, { opensAt: day(-3) }), TODAY)).toEqual({ due: false, why: 'checked_recently' })
  })

  it('slows to weekly once the first fortnight has gone by', () => {
    const opensAt = day(-(DAILY_FOR_DAYS + 1))
    expect(formRevisit(lookedAt(WEEKLY_EVERY_DAYS - 1, { opensAt }), TODAY)).toEqual({ due: false, why: 'checked_recently' })
    expect(formRevisit(lookedAt(WEEKLY_EVERY_DAYS, { opensAt }), TODAY)).toEqual({ due: true, why: 'window_open' })
  })
})

describe('a window with no date', () => {
  it('is looked at once straight away, then weekly', () => {
    expect(formRevisit(gig(), TODAY)).toEqual({ due: true, why: 'first_look' })
    expect(formRevisit(lookedAt(WEEKLY_EVERY_DAYS - 1), TODAY)).toEqual({ due: false, why: 'checked_recently' })
    expect(formRevisit(lookedAt(WEEKLY_EVERY_DAYS), TODAY)).toEqual({ due: true, why: 'undated' })
  })

  it('reads a malformed date as no date, rather than as the far future', () => {
    expect(formRevisit(lookedAt(WEEKLY_EVERY_DAYS, { opensAt: 'September' }), TODAY)).toEqual({ due: true, why: 'undated' })
  })
})

describe('a page that could not be reached', () => {
  it('is tried again tomorrow, whatever the window is doing', () => {
    const failed = (over: Partial<RevisitGig>) =>
      gig({ prepStatus: 'failed', prepNote: 'The form URL returned 503.', prepCheckedAt: `${day(-1)}T08:00:00Z`, ...over })
    expect(formRevisit(failed({}), TODAY)).toEqual({ due: true, why: 'retry' })
    expect(formRevisit(failed({ opensAt: day(-40) }), TODAY)).toEqual({ due: true, why: 'retry' })
    // ...but not twice in one day, and not before a window that has not opened.
    expect(formRevisit(failed({ prepCheckedAt: `${TODAY}T08:00:00Z` }), TODAY)).toEqual({ due: false, why: 'checked_recently' })
    expect(formRevisit(failed({ opensAt: day(4) }), TODAY)).toEqual({ due: false, why: 'not_open_yet' })
  })
})

describe('the status a stored row means', () => {
  it('accepts not_found, and reads an unknown value as unread', () => {
    expect(normalisePrepStatus('not_found')).toBe('not_found')
    expect(normalisePrepStatus('weird')).toBe('unread')
  })

  it('reads the old "blocked, no form" row as not found, and a real wall as blocked', () => {
    expect(prepStateOf('blocked', `${NO_FORM_NOTE} — the application may open later.`)).toBe('not_found')
    expect(prepStateOf('blocked', 'The application form is behind a login.')).toBe('blocked')
    expect(prepStateOf('blocked', null)).toBe('blocked')
    expect(prepStateOf('ready', `${NO_FORM_NOTE}.`)).toBe('ready')
  })
})

describe('what the artist is told', () => {
  const g = { id: 7, name: 'Canmore Folk Festival 2027', opensAt: day(-MISSING_AFTER_DAYS) }

  it('says so when the form turns up, with its size and what to do next', () => {
    const n = revisitNotice({ gig: g, before: 'not_found', after: { status: 'ready', fields: 27, note: null }, today: TODAY })!
    expect(n.title).toBe('Canmore Folk Festival 2027: the application form is open — 27 fields read')
    expect(n.body).toMatch(/nothing is sent/i)
    expect(n.tier).toBe('info')
    expect(n.dedupeKey).toBe('form-read:7')
  })

  it('says nothing when a form that was already read is read again', () => {
    expect(revisitNotice({ gig: g, before: 'ready', after: { status: 'ready', fields: 27, note: null }, today: TODAY })).toBeNull()
  })

  it('says a form needs doing by hand, since nothing will look at it again', () => {
    const n = revisitNotice({
      gig: g,
      before: 'unread',
      after: { status: 'blocked', fields: 0, note: 'The application form is behind a login, so it can’t be read automatically.' },
      today: TODAY,
    })!
    expect(n.title).toContain('filled in by hand')
    expect(n.body).toContain('behind a login')
    expect(n.dedupeKey).toBe('form-blocked:7')
  })

  it('says a dated window has no form a week on — once, and with the date named plainly', () => {
    const missing = (today: string) =>
      revisitNotice({ gig: g, before: 'not_found', after: { status: 'not_found', fields: 0, note: `${NO_FORM_NOTE}.` }, today })
    const n = missing(TODAY)!
    expect(n.tier).toBe('attention')
    expect(n.title).toBe(`Canmore Folk Festival 2027: applications opened ${monthDay(g.opensAt)}, and Scout still cannot find the form`)
    expect(n.dedupeKey).toBe('form-missing:7')
    // Not on day six, and not for ever.
    expect(missing(day(-1))).toBeNull()
    expect(revisitNotice({ gig: { ...g, opensAt: day(-MISSING_UNTIL_DAYS) }, before: 'not_found', after: { status: 'not_found', fields: 0, note: null }, today: TODAY })).toBeNull()
  })

  it('stays quiet about an undated window and about a page that did not load', () => {
    expect(revisitNotice({ gig: { ...g, opensAt: null }, before: 'unread', after: { status: 'not_found', fields: 0, note: null }, today: TODAY })).toBeNull()
    expect(revisitNotice({ gig: g, before: 'not_found', after: { status: 'failed', fields: 0, note: 'Returned 503.' }, today: TODAY })).toBeNull()
  })
})

function monthDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}
