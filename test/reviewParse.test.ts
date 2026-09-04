import { describe, it, expect } from 'vitest'
import { daysUntil } from '../shared/reviewParse'
import { buildReviewQueue } from '../shared/reviewQueue'
import {
  parseNote,
  parseFee,
  parseDeadline,
  splitDeadline,
  findDate,
  splitSentences,
} from '../shared/reviewParse'

// Fixtures below are verbatim excerpts of production rows in the D1 database
// `dougmcarthur-music-hq` — the exact prose these parsers have to cope with.

const HOME_ROUTES = `Best match this round. Winnipeg-headquartered national network booking 6-concert, Oct–May regional touring circuits for solo & duo acoustic artists in homes/community spaces — matches Doug's vocals+guitar, no band setup exactly. Hosts cover accommodation/meals; Home Routes handles SOCAN paperwork.

Submission status: NOT submitted. Single-page intake form at the URL. Drafted field values for Doug to copy in himself: Artist type: I am an artist; Contact Name: Doug McArthur; Pronouns: He/Him; Email: doug@dougmcarthur.net; Contact Phone: needs Doug, not on file; Mailing Address: needs Doug, only 'Winnipeg, MB' on file; Country: Canada; Performer Name: Doug McArthur; Website: https://dougmcarthur.net; Policy agreement: Agree (standard code-of-conduct). Equity/identity self-disclosure checkboxes intentionally left blank — not filled in on Doug's behalf.`

const LISTENING_ROOM = `Eastern Manitoba listening room in the 117-year-old St. John's Heritage Church, ~100km from Winnipeg. No online application — booking runs through their Facebook page.

Submission status: NOT sent. No form to fill — needs a direct message. Drafted outreach message ready for Doug to send via Facebook Messenger:

"Hi hi! I'm Doug McArthur, a Winnipeg singer-songwriter — solo vocals and guitar, no band. Be cool to come play The Listening Room sometime. Lemme know if there's a date that'd work!"`

const WEST_COAST = `⚠️ FLAGGED — ENTRY FEE. Open worldwide, judged by industry pros including a Grammy-nominated producer. Top 3 overall winners get a Featured Showcase slot.

Submission status: NOT started, by design. Per the standing rule, anything with an entry fee gets flagged and stops here — no form opened, nothing filled in, no payment attempted. Entry requires an MP3/AAC file, a lyric sheet, and the fee at submission, if Doug decides to enter himself.`

const ISC = `*** PAID — entry fee required ($25/song) — requires Doug's approval before submitting *** Major global songwriting competition with $150,000+ in prizes. 'Magic' is an exceptionally strong entry candidate. Flag for Doug to decide on fee investment.`

const BANK_ROBBER = `Sync licensing agency (Hoboken NJ / NYC) — roster spans indie-rock, pop, electro, folk; founded by Lyle Hysen. Sync/TV/film requests go to attn: Patrick Massaro per their official submission page. They explicitly will not open attachments — streaming links only.

Known issue (flagged 2026-06-21): links in this Gmail draft are rewritten into Google's redirect format, baked into the stored draft body itself. Would carry through if sent as-is.`

const THINKSYNC = `UK-based sync agency for film, TV, commercials, games. Requires subject line 'Film/TV Music Submission' and only considers commercially released artists. Researched live in chat on 2026-06-28, logged to D1 retroactively on 2026-06-29. IMPORTANT: a separate ThinkSync Music row already exists in this table (same contact inbox, pitching 'Lost Weekends'). Two independent pitches went to the same inbox the same week without either side knowing about the other. Doug should pick one to actually send, not both.`

const CRUCIAL = `Chicago-based boutique sync agency, active since 2003. Direct relationships with music supervisors; non-exclusive 3-year agreements; 50/50 split. General contact email info@crucialmusic.com decoded from Cloudflare email protection on their contact page using standard XOR decryption.`

const CANMORE = `Annual folk festival in Canmore, AB. Genre fit is strong: folk, alt-country, roots, acoustic singer-songwriter. NOTE: submissions not open as of July 2026 — check back in September 2026. Application not filled — pending Doug's review when open.`

const SOFAR = `Sofar's stripped-down, quiet-room, no-banter format is about as close a match as exists for Doug's solo vocals + acoustic guitar setup. No fee, application open now via web form. NOT SUBMITTED — drafted the field values below for Doug's review since this run can't responsibly drive a live browser unattended overnight. Drafted values: Artist name 'Doug McArthur'; requested city 'Winnipeg, MB'; contact email doug@dougmcarthur.net; website https://dougmcarthur.net; live performance video left blank for Doug to pick — Sofar requires an unedited single-take clip with live (not studio) audio, e.g. something off youtube.com/@DougMcArthurMusic. Doug should pick the video and submit himself when ready.`

const MARMOSET = `Boutique curated sync/licensing house (Portland, OR) — known for Nike, Super Bowl, and indie film placements; monthly submission window, creative@ handles licensing inquiries outside standard terms.

Known issue (flagged 2026-06-21): a genuine encoding defect in this specific draft — a stray control character where an "=" should be. Recommend Doug manually retype the links in this draft before sending rather than relying on the saved draft as-is.`

describe('splitSentences', () => {
  it('does not break on month abbreviations', () => {
    const parts = splitSentences('Applications open Sept. 1 for the summer run. Doug should plan ahead.')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe('Applications open Sept. 1 for the summer run.')
  })

  it('keeps a quoted body together', () => {
    const parts = splitSentences('He said "one. two. three" and left.')
    expect(parts).toHaveLength(1)
  })
})

describe('findDate', () => {
  it('reads ISO dates', () => {
    expect(findDate('deadline 2026-11-20 sharp')).toBe('2026-11-20')
  })

  it('recovers written dates', () => {
    expect(findDate('Final deadline: July 15, 2026 (early-bird passed)')).toBe('2026-07-15')
    expect(findDate('Submission window: September 1 – December 31, 2026')).toBe('2026-12-31')
    expect(findDate('applications open Sept 1, 2026')).toBe('2026-09-01')
  })

  it('returns null when there is no date', () => {
    expect(findDate('None — rolling artist roster intake')).toBeNull()
  })
})

describe('parseDeadline', () => {
  it('marks a clean ISO column value as exact', () => {
    const d = parseDeadline('2026-11-20')
    expect(d.exact).toBe(true)
    expect(d.date).toBe('2026-11-20')
  })

  it('recovers a date from prose but flags it inexact', () => {
    const d = parseDeadline('Submission window: September 1 – December 31, 2026 (annual; email-based, not a web form)')
    expect(d.exact).toBe(false)
    expect(d.date).toBe('2026-12-31')
  })

  it('handles prose with no date at all', () => {
    const d = parseDeadline('None — rolling artist roster intake')
    expect(d.date).toBeNull()
    expect(d.daysUntil).toBeNull()
  })

  it('keeps the qualifier that the date does not say', () => {
    const d = parseDeadline('None — rolling artist roster intake')
    expect(d.note).toBe('None — rolling artist roster intake')
  })

  it('does not invent a note when the column held nothing but a date', () => {
    expect(parseDeadline('2026-11-20').note).toBeNull()
    expect(parseDeadline('July 16, 2026').note).toBeNull()
  })

  it('separates when a window opens from when it closes', () => {
    const d = parseDeadline('Submission window: September 1 – December 31, 2026')
    expect(d.opensAt).toBe('2026-09-01')
    expect(d.date).toBe('2026-12-31')
  })

  // The whole point of migration 0003: after the backfill the same facts come
  // out of columns instead of prose, and nothing downstream can tell.
  it('reads the same values from prose and from real columns', () => {
    const fromProse = parseDeadline('Submission window: September 1 – December 31, 2026')
    const fromColumns = parseDeadline('2026-12-31', {
      note: 'Submission window: September 1 – December 31, 2026',
      opensAt: '2026-09-01',
    })
    expect(fromColumns.date).toBe(fromProse.date)
    expect(fromColumns.opensAt).toBe(fromProse.opensAt)
    expect(fromColumns.note).toBe(fromProse.note)
    expect(fromColumns.daysUntil).toBe(fromProse.daysUntil)
    // …except that the backfilled row no longer has to be recovered.
    expect(fromColumns.exact).toBe(true)
    expect(fromProse.exact).toBe(false)
  })

  it('lets a column override what the prose would have guessed', () => {
    const d = parseDeadline('rolling', { note: 'Confirmed rolling by email', opensAt: null })
    expect(d.note).toBe('Confirmed rolling by email')
  })

  it('stays empty when there is nothing anywhere', () => {
    const d = parseDeadline(null)
    expect(d).toEqual({
      raw: null, date: null, exact: false, daysUntil: null,
      note: null, opensAt: null, opensInDays: null,
    })
  })
})

describe('splitDeadline', () => {
  it('passes a clean ISO date straight through', () => {
    expect(splitDeadline('2026-07-31')).toEqual({ date: '2026-07-31', opensAt: null, note: null })
  })

  it('borrows the year from the closing half of a range', () => {
    // "September 1" carries no year of its own — the reason this cannot be two
    // calls to findDate().
    expect(splitDeadline('Submission window: September 1 – December 31, 2026')).toMatchObject({
      opensAt: '2026-09-01',
      date: '2026-12-31',
    })
  })

  it('reads a lone date behind an "opens" cue as a start, not a deadline', () => {
    expect(splitDeadline('applications open October 1, 2026')).toMatchObject({
      date: null,
      opensAt: '2026-10-01',
    })
  })

  it('reads a lone date with no cue as the deadline', () => {
    expect(splitDeadline('July 16, 2026')).toMatchObject({ date: '2026-07-16', opensAt: null })
  })

  it('picks the opener out of a value carrying both dates', () => {
    expect(splitDeadline('Deadline 2026-09-15 (portal opens 2026-08-01)')).toMatchObject({
      date: '2026-09-15',
      opensAt: '2026-08-01',
    })
  })

  it('finds no date in a month without a day', () => {
    // "check back September 2026" is a hint, not a date — treating it as the
    // 1st would put a fake countdown on the dashboard.
    expect(splitDeadline('Submissions not open as of July 2026 — check back September 2026')).toEqual({
      date: null,
      opensAt: null,
      note: 'Submissions not open as of July 2026 — check back September 2026',
    })
  })

  it('is empty for an empty column', () => {
    expect(splitDeadline(null)).toEqual({ date: null, opensAt: null, note: null })
    expect(splitDeadline('   ')).toEqual({ date: null, opensAt: null, note: null })
  })
})

// Verbatim production values. These came out of the backfill dry run against
// the live database, which is the only place several of these shapes exist.
describe('splitDeadline — against real gig_opportunities values', () => {
  it('refuses a date the sentence frames as history', () => {
    // The bug that stopped the first backfill: this reads "2026 deadline WAS
    // October 17, 2025" and used to return that date, which would have put a
    // ten-month-overdue emergency at the top of the deck. A wrong date is
    // worse than none — none leaves the row in the open-ended pile, honestly.
    expect(splitDeadline(
      "TBD — typically opens October/November for the following year's residency; 2026 deadline was October 17, 2025",
    )).toMatchObject({ date: null, opensAt: null })
  })

  it('still reads a passed date that is genuinely this cycle', () => {
    // "already passed" here describes the early-bird, not the final deadline,
    // and the past-tense guard must not swallow the date it precedes.
    expect(splitDeadline(
      'Final deadline: July 15, 2026 (early-bird of June 15 already passed) — only 16 days away',
    )).toMatchObject({ date: '2026-07-15' })
  })

  it('keeps a parenthetical about opening from stealing the deadline', () => {
    // A trailing "applications open …" clause describes its own date, not the
    // one it follows. Treating it as a cue swapped these two round.
    expect(splitDeadline('January 15, 2027 (applications open October 1, 2026)'))
      .toMatchObject({ date: '2027-01-15', opensAt: '2026-10-01' })
    expect(splitDeadline('~2027-05-06 (applications open February 2027)'))
      .toMatchObject({ date: '2027-05-06', opensAt: null })
    expect(splitDeadline('~2027-01-31 (applications open fall 2026)'))
      .toMatchObject({ date: '2027-01-31', opensAt: null })
    expect(splitDeadline('2026-07-31 (open now)'))
      .toMatchObject({ date: '2026-07-31', opensAt: null })
  })

  it('splits the two real submission windows', () => {
    expect(splitDeadline(
      'Submission window: September 1 – December 31, 2026 (annual; email-based, not a web form)',
    )).toMatchObject({ opensAt: '2026-09-01', date: '2026-12-31' })
    expect(splitDeadline(
      'Submission window: November 2 – November 30, 2026 (audition held April 10, 2027 in Orillia, ON)',
    )).toMatchObject({ opensAt: '2026-11-02', date: '2026-11-30' })
  })

  it('finds nothing in the genuinely undated ones', () => {
    for (const raw of [
      'None — rolling artist roster intake',
      'Rolling, no deadline (review takes roughly 8-12 weeks)',
      'Applications currently CLOSED — site states they reopen in Fall 2026. Watch wecc.ca/applications.',
      'TBD — email submissions accepted year-round; festival held mid-July annually in Dawson City, YT',
      'December 2026 (applications open; festival held mid-August 2027 in Salmon Arm, BC)',
      'Unknown — 2026 apps now closed; 2027 cycle likely opens winter 2026',
      'Fall 2026 — early bird was active late July 2026 at $25/entry',
      'TBC (applications active Aug 2026)',
    ]) {
      expect(splitDeadline(raw), raw).toMatchObject({ date: null, opensAt: null })
    }
  })
})

describe('parseFee', () => {
  it('reads a required entry fee out of prose', () => {
    const fee = parseFee('$35 (non-members) / $25 (members) — REQUIRED, non-refundable', 1)
    expect(fee.required).toBe(true)
    expect(fee.amount).toBe(35)
  })

  it('picks up a non-USD currency', () => {
    const fee = parseFee('$85 CAD first entry / $75 CAD each additional entry', 1)
    expect(fee.currency).toBe('CAD')
    expect(fee.amount).toBe(85)
  })

  it('does not treat a payout as a cost', () => {
    const fee = parseFee('None to audition (paid performance fee if selected: $800 solo)', 0)
    expect(fee.required).toBe(false)
    expect(fee.amount).toBeNull()
    expect(fee.payout).toContain('$800')
  })

  it('trusts the paid flag when the fee column is empty', () => {
    expect(parseFee('', 1).required).toBe(true)
    expect(parseFee(null, 0).required).toBe(false)
  })
})

describe('parseNote — gig application drafts', () => {
  const parsed = parseNote(HOME_ROUTES)

  it('reads the submission status out of the prose', () => {
    expect(parsed.submissionState).toBe('not_submitted')
    expect(parsed.submissionNote).toContain('NOT submitted')
  })

  it('splits the drafted field values into labelled fields', () => {
    const labels = parsed.draftedFields.map((f) => f.label)
    expect(labels).toContain('Contact Name')
    expect(labels).toContain('Mailing Address')
    expect(parsed.draftedFields.find((f) => f.label === 'Contact Name')?.value).toBe('Doug McArthur')
  })

  it('marks fields that are waiting on Doug', () => {
    const phone = parsed.draftedFields.find((f) => f.label === 'Contact Phone')
    expect(phone?.needsDoug).toBe(true)
    const country = parsed.draftedFields.find((f) => f.label === 'Country')
    expect(country?.needsDoug).toBe(false)
  })

  it('cuts the trailing prose off the last field instead of swallowing it', () => {
    const website = parsed.draftedFields.find((f) => f.label === 'Website')
    expect(website?.value).toBe('https://dougmcarthur.net')
    const last = parsed.draftedFields[parsed.draftedFields.length - 1]
    expect(last.value).not.toContain('Equity/identity')
    expect(parsed.blockers.join(' ')).toContain('Equity/identity')
  })

  it('leaves the narrative in the summary', () => {
    expect(parsed.summary).toContain('Best match this round')
    expect(parsed.summary).not.toContain('Contact Name:')
  })
})

describe('parseNote — drafted outreach message', () => {
  const parsed = parseNote(LISTENING_ROOM)

  it('lifts the quoted message out whole', () => {
    expect(parsed.draftedMessage?.body).toMatch(/^Hi hi!/)
    expect(parsed.draftedMessage?.body).toMatch(/date that'd work!$/)
  })

  it('records the channel it should be sent through', () => {
    expect(parsed.draftedMessage?.channel).toBe('via Facebook Messenger')
    expect(parsed.submissionMethod).toBe('dm')
  })

  it('does not leave the message body in the summary', () => {
    expect(parsed.summary).not.toContain('Hi hi!')
  })
})

describe('parseNote — money and warnings', () => {
  it('extracts an emoji-flagged warning as an alert', () => {
    const parsed = parseNote(WEST_COAST)
    expect(parsed.alerts[0].severity).toBe('danger')
    expect(parsed.alerts[0].text).toContain('ENTRY FEE')
    expect(parsed.submissionState).toBe('not_submitted')
  })

  it('extracts a *** delimited warning that is not a sentence', () => {
    const parsed = parseNote(ISC)
    expect(parsed.alerts[0].text).toBe("PAID — entry fee required ($25/song) — requires Doug's approval before submitting")
    expect(parsed.alerts[0].severity).toBe('danger')
  })

  it('keeps the surrounding prose after lifting the *** block', () => {
    const parsed = parseNote(ISC)
    expect(parsed.summary).toContain('Major global songwriting competition')
  })
})

describe('parseNote — sync target notes', () => {
  it('captures a dated known issue', () => {
    const parsed = parseNote(BANK_ROBBER)
    const issue = parsed.alerts.find((a) => a.flaggedAt === '2026-06-21')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('danger')
  })

  it('captures submission requirements separately from the blurb', () => {
    const parsed = parseNote(BANK_ROBBER)
    expect(parsed.requirements.join(' ')).toContain('will not open attachments')
  })

  it('flags a duplicate-pitch warning and the decision it needs', () => {
    const parsed = parseNote(THINKSYNC)
    expect(parsed.alerts.some((a) => a.text.includes('already exists'))).toBe(true)
    expect(parsed.blockers.join(' ')).toContain('pick one to actually send')
    expect(parsed.provenance.join(' ')).toContain('Researched live in chat')
  })

  it('pulls out deal terms and the contact email', () => {
    const parsed = parseNote(CRUCIAL)
    expect(parsed.dealTerms.join(' ')).toContain('50/50')
    expect(parsed.contactEmails).toContain('info@crucialmusic.com')
    expect(parsed.provenance.join(' ')).toContain('decoded from Cloudflare')
  })

  it('names the tracks a note recommends', () => {
    expect(parseNote(THINKSYNC).tracks).toContain('Lost Weekends')
  })
})

describe('parseNote — timing windows', () => {
  const parsed = parseNote(CANMORE)

  it('collects "check back" guidance into its own bucket', () => {
    expect(parsed.timing.join(' ')).toContain('check back in September 2026')
  })

  it('still records that nobody has filled the application in', () => {
    expect(parsed.submissionState).toBe('not_submitted')
    expect(parsed.blockers.join(' ')).toContain("pending Doug's review")
  })

  it('reads a location off the note', () => {
    expect(parsed.location).toBe('Canmore, AB')
  })
})

describe('parseNote — awkward real-world shapes', () => {
  const sofar = parseNote(SOFAR)

  it('does not mistake the colon in a URL for a label separator', () => {
    const website = sofar.draftedFields.find((f) => f.label === 'website')
    expect(website?.value).toBe('https://dougmcarthur.net')
  })

  it('labels space-separated email and URL fields', () => {
    expect(sofar.draftedFields.find((f) => f.label === 'contact email')?.value)
      .toBe('doug@dougmcarthur.net')
  })

  it('ignores an earlier "drafted the field values below" mention', () => {
    expect(sofar.draftedFields.map((f) => f.label)).toContain('Artist name')
  })

  it('does not repeat the submission note inside the summary', () => {
    expect(sofar.submissionNote).toContain('NOT SUBMITTED')
    expect(sofar.summary).not.toContain('NOT SUBMITTED')
  })

  it('reads a signup-account flow as a portal, not email', () => {
    expect(parseNote('Creating a profile requires setting up a real account (email + password).').submissionMethod)
      .toBe('portal')
  })

  it('leaves an agency blurb in the summary instead of calling it a requirement', () => {
    const marmoset = parseNote(MARMOSET)
    expect(marmoset.requirements).toEqual([])
    expect(marmoset.summary).toContain('Boutique curated sync/licensing house')
  })

  it('treats a "Recommend Doug …" fix-up as a blocker', () => {
    expect(parseNote(MARMOSET).blockers.join(' ')).toContain('Recommend Doug manually retype')
  })
})

describe('parseNote — empty input', () => {
  it('returns a plain empty result', () => {
    const parsed = parseNote(null)
    expect(parsed.isPlain).toBe(true)
    expect(parsed.summary).toBe('')
    expect(parsed.alerts).toEqual([])
  })
})

describe('the queue does not depend on when you run it', () => {
  it('gives the same daysUntil for a fixed date whatever the real clock says', () => {
    // The failure this guards was a deploy: a fixture written when 2026-09-03
    // was "due soon" started reporting overdue the day real time passed it,
    // because parseDeadline read the clock while buildReviewQueue took a
    // `today`. Same inputs must mean the same thing on every run.
    expect(daysUntil('2026-09-03', '2026-08-25')).toBe(9)
    expect(daysUntil('2026-08-20', '2026-08-25')).toBe(-5)
    expect(daysUntil('2026-08-25', '2026-08-25')).toBe(0)
  })

  it('threads that date all the way into the built queue', () => {
    const at = (today: string) =>
      buildReviewQueue({
        gigs: [
          {
            id: 1, name: 'Fixed', type: 'festival', organizer: null, submissionMethod: null,
            audienceSize: null, genreFitScore: null, deadline: '2026-09-03', deadlineNote: null,
            opensAt: null, feeAmount: null, feeCurrency: 'CAD', fee: null, paid: 0,
            fitNotes: null, fitRationale: null, url: null, status: 'discovered',
            googleEventId: null, snoozedUntil: null, snoozedAt: null,
            discoveredAt: '2026-07-01', updatedAt: '2026-08-01',
          },
        ],
        today,
      })[0]

    expect(at('2026-08-25').deadline.daysUntil).toBe(9)
    // A month later the same row is overdue — and says so because it was told
    // the date, not because the process happened to run then.
    expect(at('2026-10-01').deadline.daysUntil).toBe(-28)
  })
})
