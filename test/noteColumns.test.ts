import { describe, it, expect } from 'vitest'
import { gigNoteColumns, syncNoteColumns, changesFor } from '../shared/noteColumns'

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
