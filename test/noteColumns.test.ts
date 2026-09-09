import { describe, it, expect } from 'vitest'
import { gigNoteColumns, syncNoteColumns, changesFor, withStoredColumns } from '../shared/noteColumns'
import { parseNote } from '../shared/reviewParse'

// Verbatim production note bodies, the same ones `reviewParse.test.ts` uses.
// An extractor tested against prose invented to suit it has been tested
// against nothing.
const SOFAR = `Sofar's stripped-down, quiet-room, no-banter format is about as close a match as exists for Doug's solo vocals + acoustic guitar setup. No fee, application open now via web form. NOT SUBMITTED — drafted the field values below for Doug's review since this run can't responsibly drive a live browser unattended overnight. Drafted values: Artist name 'Doug McArthur'; contact email doug@dougmcarthur.net; live performance video left blank for Doug to pick. Doug should pick the video and submit himself when ready.`

const CANMORE = `Annual folk festival in Canmore, AB. Genre fit is strong: folk, alt-country, roots, acoustic singer-songwriter. NOTE: submissions not open as of July 2026 — check back in September 2026. Application not filled — pending Doug's review when open.`

const LISTENING_ROOM = `Eastern Manitoba listening room in the 117-year-old St. John's Heritage Church, ~100km from Winnipeg. No online application — booking runs through their Facebook page.`

const CRUCIAL = `Chicago-based boutique sync agency, active since 2003. Direct relationships with music supervisors; non-exclusive 3-year agreements; 50/50 split. General contact email info@crucialmusic.com decoded from Cloudflare email protection on their contact page using standard XOR decryption.`

const BANK_ROBBER = `Sync licensing agency (Hoboken NJ / NYC) — roster spans indie-rock, pop, electro, folk; founded by Lyle Hysen. Sync/TV/film requests go to attn: Patrick Massaro per their official submission page. They explicitly will not open attachments — streaming links only.`

describe('gigNoteColumns — the facts worth storing', () => {
  it('reads a note that says nothing was sent', () => {
    const c = gigNoteColumns({ fitNotes: SOFAR })
    expect(c.submissionState).toBe('not_submitted')
    expect(c.storedSubmissionState).toBe('not_submitted')
    expect(c.submissionMethod).toBe('form')
  })

  it('writes null rather than the word "unknown"', () => {
    // `unknown` is the absence of a claim, not a finding. A column holding
    // that word reads as one.
    const c = gigNoteColumns({ fitNotes: 'A nice festival in a field.' })
    expect(c.submissionState).toBe('unknown')
    expect(c.storedSubmissionState).toBeNull()
  })

  it('picks up the blockers as a list, not a flag', () => {
    const c = gigNoteColumns({ fitNotes: SOFAR })
    const blockers = JSON.parse(c.blockedOn!) as string[]
    expect(blockers.length).toBeGreaterThan(0)
    expect(blockers.join(' ')).toMatch(/video/i)
  })

  it('leaves blocked_on null rather than an empty array', () => {
    const c = gigNoteColumns({ fitNotes: LISTENING_ROOM })
    expect(c.blockedOn).toBeNull()
  })

  it('finds the location, which is what the cost estimate has been missing', () => {
    expect(gigNoteColumns({ fitNotes: CANMORE }).location).toBe('Canmore, AB')
  })

  it('stores a fee only when it is money you pay out', () => {
    const cost = gigNoteColumns({ fitNotes: '', fee: '$85 CAD first entry', paid: 1 })
    expect(cost.feeAmount).toBe(85)
    expect(cost.feeCurrency).toBe('CAD')

    // The one that would invert the sign of the number: this row's dollar
    // figure is money coming in.
    const payout = gigNoteColumns({
      fitNotes: '', fee: 'None to audition (paid performance fee if selected: $800 solo)', paid: 0,
    })
    expect(payout.feeAmount).toBeNull()
    expect(payout.feeCurrency).toBeNull()
  })

  it('drops a submission method the column cannot hold', () => {
    // The parser knows `dm` — one gig is booked through a Facebook page — and
    // `submission_method` has three values. A fourth would be a value the
    // wire type says cannot exist.
    const c = gigNoteColumns({ fitNotes: LISTENING_ROOM })
    expect(c.submissionMethod).toBeNull()
  })
})

describe('syncNoteColumns', () => {
  it('reads the confirmation method out of the note', () => {
    expect(syncNoteColumns({ notes: CRUCIAL }).confirmationMethod).toBe('email')
  })

  it('is null when the note names a contact without naming a channel', () => {
    // Bank Robber's note says who to write to and never says how. "Send it to
    // Patrick" is not the same claim as "they take email submissions", and
    // the parser is right not to make the second one.
    expect(syncNoteColumns({ notes: BANK_ROBBER }).confirmationMethod).toBeNull()
  })

  it('is null when the note does not say', () => {
    expect(syncNoteColumns({ notes: 'A boutique agency in Portland.' }).confirmationMethod).toBeNull()
  })
})

describe('changesFor — a backfill that cannot undo a decision', () => {
  it('proposes a value for an empty column', () => {
    expect(changesFor({ location: null }, { location: 'Canmore, AB' })).toEqual([
      { column: 'location', from: null, to: 'Canmore, AB' },
    ])
  })

  it('leaves a column that already holds something', () => {
    // Whatever the note now says. A value set by hand is a decision, and an
    // extractor re-run is not allowed to quietly undo one.
    expect(changesFor({ location: 'Winnipeg, MB' }, { location: 'Canmore, AB' })).toEqual([])
  })

  it('treats an empty string as empty, because SQLite will hand one back', () => {
    expect(changesFor({ location: '' }, { location: 'Canmore, AB' })).toHaveLength(1)
  })

  it('proposes nothing when the extractor found nothing', () => {
    expect(changesFor({ location: null }, { location: null })).toEqual([])
  })

  it('is idempotent — a second run over its own output changes nothing', () => {
    const first = changesFor({ location: null, submissionState: null }, { location: 'Canmore, AB', submissionState: 'not_submitted' })
    const applied: Record<string, unknown> = {}
    for (const change of first) applied[change.column] = change.to
    expect(changesFor(applied, { location: 'Canmore, AB', submissionState: 'not_submitted' })).toEqual([])
  })
})

describe('what the dry run against production caught', () => {
  // Four defects the fixtures never showed and the real 34 rows did. Each is
  // pinned with the production string that exposed it, because a backfill
  // freezes a wrong reading into a column where a read-time one at least
  // changes when the parser is fixed.

  it('does not read the method out of a negation', () => {
    // Winnipeg Folk Festival. "No web form" was matching `web form` before
    // anything reached the email branch, so the one festival that explicitly
    // has no form came out as `form`.
    const note = `No web form: submit by emailing music@winnipegfolkfestival.ca with a short bio, a current live performance video, and three relevant web links (website/SoundCloud/YouTube/Facebook), noting 'Manitoba' in the subject line.`
    expect(gigNoteColumns({ fitNotes: note }).submissionMethod).toBe('email')
  })

  it('still reads a form that is really there', () => {
    expect(gigNoteColumns({ fitNotes: 'Single-page intake form at the URL.' }).submissionMethod).toBe('form')
  })

  it('does not take the location out of a drafted mailing address', () => {
    // Home Routes is a national touring circuit. The note drafts a form's
    // answers, one of which is your own address — which was being stored as
    // where the gig is, and would have costed the trip as a drive across town.
    const note = `Winnipeg-headquartered national network booking regional touring circuits. Drafted field values for Doug to copy in himself: Contact Name: Doug McArthur; Mailing Address: needs Doug, only 'Winnipeg, MB' on file; Country: Canada.`
    expect(gigNoteColumns({ fitNotes: note }).location).toBeNull()
  })

  it('still takes a location the narrative states', () => {
    const note = `Doug's hometown flagship folk festival at Birds Hill Park, MB — strong genre fit.`
    expect(gigNoteColumns({ fitNotes: note }).location).toBe('Birds Hill Park, MB')
  })

  it('does not file the submission state again as a blocker', () => {
    // "Not submitted; needs your review." is the column next to it, not work
    // to do. Three rows would have carried it as both.
    const note = `Submission window hasn't opened yet. Not submitted; needs Doug's review.`
    expect(gigNoteColumns({ fitNotes: note }).blockedOn).toBeNull()
  })

  it('keeps a blocker that says something the state does not', () => {
    const note = `Equity/identity self-disclosure checkboxes intentionally left blank — not filled in on Doug's behalf.`
    expect(gigNoteColumns({ fitNotes: note }).blockedOn).not.toBeNull()
  })

  it('writes a currency only where the fee text names one', () => {
    // `parseFee` falls back to USD. Writing that fallback into a column turns
    // a default into a claim — and one production fee really is CAD.
    const unnamed = gigNoteColumns({ fitNotes: '', fee: '$35 (non-members) / $25 (members) — REQUIRED, non-refundable', paid: 1 })
    expect(unnamed.feeAmount).toBe(35)
    expect(unnamed.feeCurrency).toBeNull()

    const named = gigNoteColumns({ fitNotes: '', fee: '$85 CAD first entry / $75 CAD each additional entry', paid: 1 })
    expect(named.feeCurrency).toBe('CAD')
  })
})

describe('the one column a stated value may overwrite', () => {
  // `fee_currency` defaults to 'USD' at insert, so it is never empty and the
  // never-overwrite rule can never reach it — while two production rows say
  // CAD in their own fee text and hold USD.

  it('replaces a defaulted currency with the one the fee text names', () => {
    expect(changesFor({ feeCurrency: 'USD' }, { feeCurrency: 'CAD' })).toEqual([
      { column: 'feeCurrency', from: 'USD', to: 'CAD' },
    ])
  })

  it('records nothing when the stated currency is already stored', () => {
    expect(changesFor({ feeCurrency: 'CAD' }, { feeCurrency: 'CAD' })).toEqual([])
  })

  it('leaves the default alone when the fee text names nothing', () => {
    // `gigNoteColumns` returns null for an unnamed currency, and null is
    // never written. Fourteen rows are in this case, most of them $0 or None:
    // replacing a guess with a different guess is not an improvement.
    const unnamed = gigNoteColumns({ fitNotes: '', fee: '$55 + processing fee', paid: 1 })
    expect(unnamed.feeCurrency).toBeNull()
    expect(changesFor({ feeCurrency: 'USD' }, { feeCurrency: unnamed.feeCurrency })).toEqual([])
  })

  it('does not extend the exception to any other column', () => {
    // The narrowness is the safety. A location or a submission state you set
    // by hand is a decision, and an extractor re-run must not undo one.
    expect(changesFor(
      { location: 'Winnipeg, MB', submissionState: 'submitted', blockedOn: '["x"]' },
      { location: 'Canmore, AB', submissionState: 'not_submitted', blockedOn: '["y"]' },
    )).toEqual([])
  })

  it('is still idempotent end to end', () => {
    const proposed = { feeCurrency: 'CAD', location: 'Canmore, AB' }
    const first = changesFor({ feeCurrency: 'USD', location: null }, proposed)
    const applied: Record<string, unknown> = { feeCurrency: 'USD', location: null }
    for (const change of first) applied[change.column] = change.to
    expect(changesFor(applied, proposed)).toEqual([])
  })
})

describe('withStoredColumns — the column wins over the prose', () => {
  // The bug this fixes: until the queue read the columns, correcting
  // `submission_state` by hand changed the database and nothing you could
  // see. The screen re-derived from the note on every render.
  const NOTE = `Submission status: NOT submitted. Single-page intake form at the URL. Contact Phone: needs Doug, not on file.`

  it('lets a corrected state override what the note implies', () => {
    const parsed = parseNote(NOTE)
    expect(parsed.submissionState).toBe('not_submitted')

    const merged = withStoredColumns(parsed, { submissionState: 'submitted' })
    expect(merged.submissionState).toBe('submitted')
  })

  it('falls back to the note when the column is empty', () => {
    // Null means "the note makes no claim" on most rows, and "nothing has
    // extracted this yet" on any row that reached D1 without a route. Both
    // want the parse, and neither wants a blank.
    const merged = withStoredColumns(parseNote(NOTE), { submissionState: null, blockedOn: null })
    expect(merged.submissionState).toBe('not_submitted')
    expect(merged.blockers.length).toBeGreaterThan(0)
  })

  it('prefers a stored location and method', () => {
    const merged = withStoredColumns(parseNote(NOTE), {
      location: 'Canmore, AB',
      submissionMethod: 'email',
    })
    expect(merged.location).toBe('Canmore, AB')
    expect(merged.submissionMethod).toBe('email')
  })

  it('ignores a stored value that is not one of the states', () => {
    // Status columns are not a closed set — production carries values outside
    // every union. A junk one must not become the answer.
    const merged = withStoredColumns(parseNote(NOTE), { submissionState: 'mailed it probably' })
    expect(merged.submissionState).toBe('not_submitted')
  })

  it('falls back rather than claiming nothing is blocked, on unreadable JSON', () => {
    // "Nothing is blocked" is a claim, and a column nobody can parse is not
    // entitled to make it.
    for (const raw of ['{oops', '[]', '{"a":1}', '[1,2,3]']) {
      const merged = withStoredColumns(parseNote(NOTE), { blockedOn: raw })
      expect(merged.blockers.length, raw).toBeGreaterThan(0)
    }
  })

  it('uses a stored blocker list when it has one', () => {
    const merged = withStoredColumns(parseNote(NOTE), { blockedOn: '["Needs a photo credit"]' })
    expect(merged.blockers).toEqual(['Needs a photo credit'])
  })

  it('leaves the facts that have no column derived', () => {
    // `requirements`, `dealTerms`, `alerts` and the drafted values are
    // rendered and never queried, so they stay parsed. Storing copies would
    // be a parser cache with a staleness bug.
    const parsed = parseNote(NOTE)
    const merged = withStoredColumns(parsed, { submissionState: 'submitted' })
    expect(merged.draftedFields).toBe(parsed.draftedFields)
    expect(merged.alerts).toBe(parsed.alerts)
    expect(merged.requirements).toBe(parsed.requirements)
  })
})
