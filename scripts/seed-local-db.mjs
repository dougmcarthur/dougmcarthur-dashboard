/**
 * Fill the local D1 database with a fixture that has production's *shape*.
 *
 * Why this exists: Overview, Review and Gigs are screens about density and
 * triage — what is due, what is stalling, what is silent, what outranks what.
 * From a clean checkout the local database is empty, so all three render empty
 * states and a UI change cannot be judged against anything. Screenshots of an
 * empty screen verify nothing; the repo already learned that a chart whose bars
 * were all width 0 passed visual review twice.
 *
 * What it is not: production's data. Nothing here is a real festival, a real
 * contact or a real fee. It reproduces the *states* the real rows produce — a
 * prose deadline, an application gone silent, a visa risk, a stopped agent —
 * because those are what the screens are built to surface.
 *
 * **Dates are computed from the day it runs**, not written down. That is the
 * opposite of the rule for test fixtures, which pin a `TODAY` so a suite means
 * the same thing on every run, and it is the same reasoning: a seeded row with
 * a hardcoded date silently stops being "due in nine days" and the screen stops
 * showing the state it was seeded to show. Re-run this and the states come back.
 *
 * **Local only, structurally.** Every wrangler call here passes `--local` and
 * there is no code path that builds a remote one. `--remote` is rejected rather
 * than ignored, because a flag that is silently dropped is one somebody trusts.
 *
 * Dry run is the default, as everywhere in `scripts/`: without `--apply` it
 * prints what it would write and touches nothing.
 *
 *   node scripts/seed-local-db.mjs            # show the plan
 *   node scripts/seed-local-db.mjs --apply    # write it
 *
 * Re-runnable: `--apply` clears the tables it owns first, so the fixture is
 * replaced rather than duplicated. It never touches the auth tables beyond the
 * one enrolment code described below, and never touches `d1_migrations`.
 */

import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { wrangler } from './lib/wrangler.mjs'

const APPLY = process.argv.includes('--apply')

if (process.argv.includes('--remote')) {
  console.error(
    'This seeds the local database only. It refuses --remote rather than ignoring it:\n' +
      'a fixture written to production would be indistinguishable from real rows.',
  )
  process.exit(1)
}

/** One source for the database name — wrangler.toml already declares it. */
function databaseName() {
  const toml = readFileSync('wrangler.toml', 'utf8')
  const match = toml.match(/^\s*database_name\s*=\s*["']([^"']+)["']/m)
  if (!match) throw new Error('No database_name in wrangler.toml.')
  return match[1]
}

// ---------------------------------------------------------------------------
// Dates, all relative to the run.

const NOW = new Date()
const day = (offset) => {
  const d = new Date(NOW)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
const stamp = (offset) => {
  const d = new Date(NOW)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

// ---------------------------------------------------------------------------
// SQL helpers.

const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined ? 'NULL' : String(v))

function insert(table, rows) {
  if (!rows.length) return []
  const cols = Object.keys(rows[0])
  return rows.map(
    (r) =>
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols
        .map((c) => (typeof r[c] === 'number' ? n(r[c]) : q(r[c])))
        .join(', ')});`,
  )
}

const OWNER = 'tnt_0001'
const OTHER = 'tnt_0002'

// ---------------------------------------------------------------------------
// The fixture. Each row is here because it produces a state some screen is
// built to show; the comment says which.

const tenants = [
  { id: OWNER, display_name: 'Doug McArthur', created_at: stamp(-400) },
  // A second tenant so the oversight screen and usage rollup have more than one
  // row, and so a scoping mistake shows up as somebody else's data appearing.
  { id: OTHER, display_name: 'Test Artist', created_at: stamp(-30) },
]

const users = [
  { id: 'usr_owner', role: 'owner', tenant_id: OWNER, display_name: 'Doug McArthur', email: 'owner@example.test', created_at: stamp(-400) },
  { id: 'usr_other', role: 'artist', tenant_id: OTHER, display_name: 'Test Artist', email: 'artist@example.test', created_at: stamp(-30) },
]

const gigs = [
  // Prose deadline — splitDeadline returns null and the screen must show words.
  { name: 'Prairie Roots Collective — Artist Roster', type: 'venue', deadline: 'None — rolling artist roster intake', deadline_note: null, status: 'shortlisted', location: 'Brandon, MB', country: 'CA', travel_band: null, fit_notes: 'Rolling intake, so no date to miss. Pending Doug’s review of the set list before applying.' },
  // Prose deadline that names a month with no day.
  { name: 'Riverbend Songwriter Weekend', type: 'festival', deadline: 'TBC — usually opens in March', deadline_note: 'Site says "applications open in the spring"', status: 'discovered', location: 'Selkirk, MB', country: 'CA', travel_band: null, fit_notes: null },
  // Due soon: inside DUE_SOON_DAYS (14).
  { name: 'Northern Lights Folk Festival — Emerging Artist', type: 'festival', deadline: day(9), status: 'shortlisted', location: 'Thunder Bay, ON', country: 'CA', travel_band: 'regional', nights: 2, fit_notes: 'Strong fit for the trio material.' },
  // Due very soon, and unreviewed — the row that should lead the deck.
  { name: 'Assiniboine House Concert Series', type: 'house_concert', deadline: day(3), status: 'discovered', location: 'Winnipeg, MB', country: 'CA', travel_band: 'local', nights: 0, fit_notes: 'Home town — no travel, no lodging.' },
  // Deadline already past, still open in the pipeline: should read as expired.
  { name: 'Lakeshore Arts Grant — Spring Intake', type: 'grant', deadline: day(-12), status: 'shortlisted', location: 'Kenora, ON', country: 'CA', travel_band: 'drive', fit_notes: 'Missed the date. Worth noting the cycle for next year.' },
  // Opens in future, inside OPENING_DAYS (60) — the "on the clock" opening case.
  { name: 'Whiteshell Summer Series — 2027 Applications', type: 'festival', deadline: null, opens_at: day(21), status: 'discovered', location: 'Falcon Lake, MB', country: 'CA', travel_band: 'local', fit_notes: null },
  // info_requested — awaitsYourReply; reply_due outranks every deadline.
  { name: 'Red River Folk Alliance Showcase', type: 'showcase', deadline: day(40), status: 'info_requested', location: 'Winnipeg, MB', country: 'CA', travel_band: 'local', nights: 0, fit_notes: 'They asked for a stage plot and a recent live video. The organiser said his deadline for the programme is the end of the month.', submitted_at: stamp(-30) },
  // invited — awaitsYourReply, and there is deliberately no route to declined.
  { name: 'Golden Plains Festival — Mainstage Invitation', type: 'festival', deadline: null, status: 'invited', location: 'Regina, SK', country: 'CA', travel_band: 'drive', nights: 2, fit_notes: 'They want an answer on the fee before announcing.', submitted_at: stamp(-70), performance_start: day(120), performance_end: day(121) },
  // submitted, silent past NO_REPLY_DAYS (45) — exact, because submitted_at is set.
  { name: 'Cedar Valley Music Festival', type: 'festival', deadline: day(-60), status: 'submitted', location: 'Duncan, BC', country: 'CA', travel_band: 'flight', nights: 3, submitted_at: stamp(-52), fit_notes: 'Applied through their Wufoo form. No acknowledgement.' },
  // submitted, silent past NO_REPLY_STALE_DAYS (90).
  { name: 'Harbourfront Roots Weekend', type: 'festival', deadline: day(-120), status: 'submitted', location: 'Halifax, NS', country: 'CA', travel_band: 'flight', nights: 3, submitted_at: stamp(-97), fit_notes: null },
  // submitted with NO submitted_at — the pre-0010 row. Falls back to updated_at
  // with exact:false, so every surface must say "about".
  { name: 'Bluestem Barn Sessions', type: 'venue', deadline: null, status: 'submitted', location: 'Morden, MB', country: 'CA', travel_band: 'drive', submitted_at: null, updated_at_offset: -61, fit_notes: 'Sent before the app tracked send dates.' },
  // Visa risk: paid US performance, deadline near, show inside the 90-day lead.
  { name: 'Great Lakes Americana Fest (US)', type: 'festival', deadline: day(20), status: 'shortlisted', location: 'Duluth, MN', country: 'US', travel_band: 'flight', nights: 3, paid: 1, performance_kind: 'paid', performance_start: day(85), performance_end: day(86), fee: 'USD 1,200 guarantee', fee_amount: 1200, fee_currency: 'USD', fit_notes: 'Paid US date — P-2 lead time starts at the deadline, not the show.' },
  // International, nights unset — cost inferred as a range and marked guessed.
  { name: 'Celtic Connections — Showcase Application', type: 'showcase', deadline: day(35), status: 'shortlisted', location: 'Glasgow, Scotland', country: 'GB', travel_band: null, nights: null, paid: 1, fee: 'Travel bursary available (amount unclear)', fit_notes: 'Fee unclear from the page — worth confirming before committing.' },
  // booked, with a real calendar span.
  { name: 'Winterlude Folk Night', type: 'venue', deadline: null, status: 'booked', location: 'Winnipeg, MB', country: 'CA', travel_band: 'local', nights: 0, performance_start: day(45), performance_end: day(45), fee_amount: 400, fee_currency: 'CAD', fit_notes: 'Confirmed. Load in at 5.' },
  // Snoozed — should be out of the queue until it comes back.
  { name: 'Coastal Songwriters Retreat', type: 'residency', deadline: day(75), status: 'shortlisted', location: 'Tofino, BC', country: 'CA', travel_band: 'flight', nights: 5, snoozed_until: day(14), snoozed_at: stamp(-2), fit_notes: null },
  // Legacy status — normaliseGigStatus must map 'approved' to shortlisted.
  { name: 'Heartland Barn Dance', type: 'venue', deadline: day(28), status: 'approved', legacy_status: 'approved', location: 'Steinbach, MB', country: 'CA', travel_band: 'drive', fit_notes: null },
  // prep_status blocked — a login wall is a fact, not an error to retry.
  { name: 'Sundance Arts Council Grant', type: 'grant', deadline: day(18), status: 'preparing', location: 'Winnipeg, MB', country: 'CA', travel_band: 'local', application_url: 'https://example.test/submittable', prep_status: 'blocked', prep_checked_at: stamp(-4), prep_note: 'Submittable — needs an account, fill this one in by hand.' },
  // prep_status failed with an HTTP status — worth another go.
  { name: 'Foothills Folk Gathering', type: 'festival', deadline: day(50), status: 'preparing', location: 'Canmore, AB', country: 'CA', travel_band: 'flight', nights: 2, application_url: 'https://example.test/403', prep_status: 'failed', prep_checked_at: stamp(-1), prep_note: 'Returned 403.' },
  // Stored columns present — withStoredColumns must prefer these over the note.
  { name: 'Silver Creek Roots Revival', type: 'festival', deadline: day(60), status: 'shortlisted', location: 'Nelson, BC', country: 'CA', travel_band: 'flight', nights: 2, submission_method: 'Online form', submission_state: 'ready', blocked_on: '[]', fee: 'CAD 300 + travel', fee_amount: 300, fee_currency: 'CAD', fit_notes: 'Submission method: online form. Fee: CAD 300 plus travel.' },
  // blocked_on holding real items — the flag should name them.
  { name: 'Aurora Borealis Music Camp', type: 'residency', deadline: day(31), status: 'preparing', location: 'Yellowknife, NT', country: 'CA', travel_band: 'flight', nights: 4, submission_state: 'blocked', blocked_on: '["press photo","stage plot"]', fit_notes: 'Waiting on a current press photo and a stage plot.' },
  // passed and archived, so the filters have something to exclude.
  { name: 'Metropolis EDM Weekender', type: 'festival', deadline: day(44), status: 'passed', location: 'Toronto, ON', country: 'CA', travel_band: 'flight', fit_notes: 'Wrong genre entirely.' },
  { name: 'Old Mill Coffeehouse (closed 2025)', type: 'venue', deadline: null, status: 'archived', location: 'Winnipeg, MB', country: 'CA', travel_band: 'local', fit_notes: null },
]

const gigRows = gigs.map((g, i) => ({
  name: g.name,
  type: g.type,
  deadline: g.deadline ?? null,
  deadline_note: g.deadline_note ?? null,
  opens_at: g.opens_at ?? null,
  fee: g.fee ?? null,
  paid: g.paid ?? 0,
  fit_notes: g.fit_notes ?? null,
  fit_rationale: g.fit_rationale ?? null,
  url: `https://example.test/gig/${i + 1}`,
  application_url: g.application_url ?? null,
  status: g.status,
  legacy_status: g.legacy_status ?? null,
  discovered_at: stamp(-90 + i),
  updated_at: stamp(g.updated_at_offset ?? -(i % 20)),
  submitted_at: g.submitted_at ?? null,
  snoozed_until: g.snoozed_until ?? null,
  snoozed_at: g.snoozed_at ?? null,
  performance_start: g.performance_start ?? null,
  performance_end: g.performance_end ?? null,
  performance_kind: g.performance_kind ?? null,
  prep_status: g.prep_status ?? null,
  prep_checked_at: g.prep_checked_at ?? null,
  prep_note: g.prep_note ?? null,
  location: g.location ?? null,
  country: g.country ?? null,
  travel_band: g.travel_band ?? null,
  nights: g.nights ?? null,
  fee_amount: g.fee_amount ?? null,
  fee_currency: g.fee_currency ?? 'USD',
  submission_method: g.submission_method ?? null,
  submission_state: g.submission_state ?? null,
  blocked_on: g.blocked_on ?? null,
  tenant_id: OWNER,
}))

// One gig on the other tenant. If it ever appears on the owner's screens, the
// scoping is broken and the fixture is how you find out.
gigRows.push({
  ...gigRows[0],
  name: 'OTHER TENANT — should never appear on the owner’s screens',
  status: 'shortlisted',
  deadline: day(5),
  fit_notes: 'If you can see this row as the owner, tenant scoping is broken.',
  tenant_id: OTHER,
})

const SHORT_PITCH =
  'I write plainspoken folk songs about prairie towns and the people who stay in them. ' +
  'The new record was cut live off the floor in a church hall outside Winnipeg, and it keeps ' +
  'the room sound — creaking pews, a little reverb, no click. I think the title track would sit ' +
  'well under a quiet scene: it is slow, mostly acoustic guitar and one voice, and it does not ' +
  'crowd dialogue. Happy to send stems or an instrumental pass if that helps.'

const LONG_PITCH = `${SHORT_PITCH} ` +
  'For background, the album came out of two winters of writing after a long stretch of touring ' +
  'house concerts across Manitoba and Saskatchewan, which is where most of these songs were first ' +
  'played. Several of them were road-tested in living rooms before they were ever recorded, and I ' +
  'think that shows in the arrangements — they are built to work without a band behind them. The ' +
  'record has had support from community radio across the prairies and a feature on a national ' +
  'folk programme. I have cleared all the publishing myself and own both masters and composition, ' +
  'so licensing is a single conversation rather than a committee. If the timing is wrong for this ' +
  'project I am glad to stay in touch for future ones, and I can send a short instrumental reel.'

const syncTargets = [
  { name: 'Northline Pictures — Music Supervision', contact_email: 'music@example.test', contact_role: 'Music Supervisor', agency_type: 'film', status: 'draft_ready', pitch_draft: SHORT_PITCH, notes: 'Indie features, mostly quiet character work.' },
  // Long enough that mailto must be withheld and named while Gmail stays.
  { name: 'Greenroom Sync Agency', contact_email: 'hello@example.test', contact_role: 'A&R', agency_type: 'agency', status: 'draft_ready', pitch_draft: LONG_PITCH, notes: 'Pitch runs long — mailto should be hidden here, Gmail and Copy offered.' },
  // No address — the "skipped: no address" branch of the drafting preview.
  { name: 'Prairie Public Broadcasting', contact_email: null, contact_role: 'Producer', agency_type: 'broadcast', status: 'draft_ready', pitch_draft: SHORT_PITCH, notes: 'No contact address on file yet.' },
  // No pitch — the "skipped: no pitch" branch.
  { name: 'Harbour Lights Media', contact_email: 'sync@example.test', contact_role: 'Music Supervisor', agency_type: 'film', status: 'researching', pitch_draft: null, notes: 'Still reading their catalogue.' },
  // Already pitched — the "skipped: already pitched" branch.
  { name: 'Foxglove Trailers', contact_email: 'team@example.test', contact_role: 'Creative Director', agency_type: 'trailer', status: 'pitched', pitch_draft: SHORT_PITCH, pitch_sent: stamp(-20), notes: 'Pitched last month, no reply yet.' },
  { name: 'Standing Stone Games', contact_email: 'audio@example.test', contact_role: 'Audio Lead', agency_type: 'games', status: 'draft_ready', pitch_draft: SHORT_PITCH, notes: null, snoozed_until: day(10), snoozed_at: stamp(-1) },
]

const syncRows = syncTargets.map((s, i) => ({
  name: s.name,
  contact_email: s.contact_email ?? null,
  contact_role: s.contact_role ?? null,
  agency_type: s.agency_type ?? null,
  notes: s.notes ?? null,
  pitch_draft: s.pitch_draft ?? null,
  pitch_sent: s.pitch_sent ?? null,
  status: s.status,
  discovered_at: stamp(-60 + i * 3),
  updated_at: stamp(-(i % 14)),
  snoozed_until: s.snoozed_until ?? null,
  snoozed_at: s.snoozed_at ?? null,
  tenant_id: OWNER,
}))

const monthKey = (offset) => {
  const d = new Date(NOW)
  d.setUTCMonth(d.getUTCMonth() + offset)
  return d.toISOString().slice(0, 7)
}

const promoRows = [
  { month: monthKey(0), title: 'New single announcement', content: 'Draft copy for the single announcement. Doug will want to add the credits before this goes out.', status: 'draft', created_at: stamp(-6), tenant_id: OWNER },
  { month: monthKey(-1), title: 'House concert season wrap', content: 'Thanks to everyone who hosted a show this winter.', status: 'published', created_at: stamp(-38), tenant_id: OWNER },
  { month: monthKey(1), title: 'Festival season preview', content: 'Placeholder — needs the confirmed dates first.', status: 'draft', created_at: stamp(-1), tenant_id: OWNER },
]

const assets = [
  // Healthy, reviewed recently.
  { kind: 'bio', label: 'Short bio (100 words)', value: 'Doug McArthur is a folk songwriter from Winnipeg.', question_kind: 'bio_short', variant: '100 words', char_count: 49, review_by: day(200), source: 'manual' },
  { kind: 'bio', label: 'Long bio (300 words)', value: 'A longer biography used for programmes and press kits.', question_kind: 'bio_long', variant: '300 words', char_count: 54, review_by: day(150), source: 'manual' },
  // Overdue — review_by in the past.
  { kind: 'fact', label: 'Monthly listeners', value: '4,200', question_kind: 'stat', review_by: day(-30), source: 'manual' },
  { kind: 'fact', label: 'Mailing list size', value: '1,100', question_kind: 'stat', review_by: day(-75), source: 'manual' },
  // Inside REVIEW_WARNING_DAYS (45) — due soon rather than overdue.
  { kind: 'fact', label: 'Instagram followers', value: '2,800', question_kind: 'stat', review_by: day(20), source: 'manual' },
  // Broken: a press photo with no credit is unusable the day it is added.
  { kind: 'photo', label: 'Press photo — barn, winter', value: 'https://example.test/photo-1.jpg', question_kind: 'photo', credit: null, usage_rights: 'Web and print', review_by: day(400), source: 'manual' },
  { kind: 'photo', label: 'Press photo — live, 2026', value: 'https://example.test/photo-2.jpg', question_kind: 'photo', credit: 'Photo by A. Photographer', usage_rights: 'Web only', review_by: day(-10), source: 'manual' },
  // Unreviewed: sourced from a document, so review_by is null by design.
  ...['Spotify artist page', 'Bandcamp', 'YouTube channel', 'Website'].map((label, i) => ({
    kind: 'link', label, value: `https://example.test/${label.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    question_kind: 'link', review_by: null, source: 'reference_docs', sort_order: i,
  })),
  ...['Stage plot', 'Technical rider', 'Set list — 45 minutes'].map((label, i) => ({
    kind: 'document', label, value: `https://example.test/doc-${i + 1}.pdf`,
    question_kind: 'document', review_by: null, source: 'reference_docs', sort_order: i,
  })),
  { kind: 'audio', label: 'Live off the floor — title track', value: 'https://example.test/audio.mp3', question_kind: 'audio', review_by: null, source: 'reference_docs' },
  { kind: 'video', label: 'Live session video', value: 'https://example.test/video', question_kind: 'video', review_by: null, source: 'reference_docs' },
]

const assetRows = assets.map((a, i) => ({
  kind: a.kind,
  label: a.label,
  value: a.value ?? null,
  question_kind: a.question_kind ?? null,
  variant: a.variant ?? null,
  char_count: a.char_count ?? null,
  credit: a.credit ?? null,
  usage_rights: a.usage_rights ?? null,
  review_by: a.review_by ?? null,
  source: a.source ?? null,
  notes: a.notes ?? null,
  sort_order: a.sort_order ?? i,
  archived: 0,
  created_at: stamp(-120 + i),
  updated_at: stamp(-(i % 30)),
  tenant_id: OWNER,
}))

const referenceDocs = [
  {
    id: 'doc_bio',
    title: 'Artist one-sheet',
    content: [
      '## Short bio (100 words)',
      '',
      'Doug McArthur is a folk songwriter from Winnipeg, Manitoba.',
      '',
      '## Where can people hear you?',
      '',
      'Spotify: https://example.test/spotify',
      'Bandcamp: https://example.test/bandcamp',
      '',
      '## Voice in One Sentence',
      '',
      'Plainspoken, unhurried, and a little dry.',
    ].join('\n'),
    updated_at: stamp(-45),
    tenant_id: OWNER,
  },
  {
    id: 'doc_style',
    title: 'Writing style guide',
    content: '## How should we describe the live show?\n\nTwo voices, one guitar, no setlist.',
    updated_at: stamp(-200),
    tenant_id: OWNER,
  },
]

// Three schedules, chosen so the cadence check has one of each answer.
const taskRuns = []
// Healthy weekly: last run 3 days ago against a 7-day median.
for (const [i, off] of [-3, -10, -17, -24, -31].entries()) {
  taskRuns.push({ task_id: 'gig-festival-scan', run_at: stamp(off), status: 'ok', summary: `Swept the usual listings. Filed ${i === 0 ? 2 : 1} new opportunities.`, items_added: i === 0 ? 2 : 1, tenant_id: OWNER })
}
// Stopped: weekly cadence, last run 40 days ago — past max(7 * 2.5, 3), so critical.
for (const off of [-40, -47, -54, -61]) {
  taskRuns.push({ task_id: 'sync-pitch-research', run_at: stamp(off), status: 'ok', summary: 'Researched three supervisors.', items_added: 1, tenant_id: OWNER })
}
// Monthly, 35 days quiet: under the 45-day ceiling, so deliberately NOT flagged.
for (const off of [-35, -65, -95]) {
  taskRuns.push({ task_id: 'monthly-promo-checkin', run_at: stamp(off), status: 'ok', summary: 'Drafted the monthly promo note.', items_added: 1, tenant_id: OWNER })
}
// A failure: runTier rates this 'attention', not 'critical', because the next
// tick retries it.
taskRuns.push({ task_id: 'gig-festival-scan', run_at: stamp(-1), status: 'failed', summary: 'Timed out fetching a listing page after 30s.', items_added: 0, tenant_id: OWNER })

/**
 * Replies, which is the screen this fixture most needs to be able to show.
 *
 * The Review queue's fault was that a match resting on one common word looked
 * exactly like a match resting on a confirmed thread, so these are seeded as
 * the three readings a person has to tell apart: a weak one that should be
 * dismissible at a glance, a strong one, and two that match equally well.
 * `match_signals` is the shape the route stores — the candidates, with the
 * evidence that produced them.
 */
const signals = (rows) => JSON.stringify(rows)

const replies = [
  {
    gmail_message_id: 'msg-weak-1',
    gmail_thread_id: 'thr-weak-1',
    gig_id: gigRows.findIndex((g) => g.name.includes('Assiniboine')) + 1,
    from_address: 'noreply@localpizza.example',
    from_name: 'Pizza Place',
    subject: 'Your order is confirmed',
    snippet: 'Thanks for ordering from our Winnipeg location. Your order is on its way and should arrive in 30 minutes.',
    received_at: stamp(-2),
    in_spam: 0,
    classification: 'unclear',
    class_confidence: 'low',
    evidence: null,
    proposed_status: null,
    match_score: 26,
    match_signals: signals([
      { gigId: 4, gigName: 'Assiniboine House Concert Series', score: 26, confidence: 'low', bound: false,
        signals: [{ id: 'name', points: 26, detail: '"Winnipeg" in the body.' }] },
    ]),
    match_ambiguous: 0,
    resolution: null,
    created_at: stamp(-2),
    tenant_id: OWNER,
  },
  {
    gmail_message_id: 'msg-strong-1',
    gmail_thread_id: 'thr-strong-1',
    gig_id: 3,
    from_address: 'programming@northernlights.example',
    from_name: 'Northern Lights Folk Festival',
    subject: 'Re: Northern Lights Folk Festival — Emerging Artist',
    snippet: 'Thanks for your application. We would love to have you on the Saturday afternoon stage — can you send a stage plot?',
    received_at: stamp(-1),
    in_spam: 0,
    classification: 'invitation',
    class_confidence: 'high',
    evidence: 'We would love to have you on the Saturday afternoon stage',
    proposed_status: 'invited',
    match_score: 80,
    match_signals: signals([
      { gigId: 3, gigName: 'Northern Lights Folk Festival — Emerging Artist', score: 80, confidence: 'high', bound: false,
        signals: [
          { id: 'name', points: 50, detail: '"Northern Lights Folk Festival — Emerging Artist" appears in the subject.' },
          { id: 'domain', points: 30, detail: 'Sent from northernlights.example, the same domain as the listing.' },
        ] },
    ]),
    match_ambiguous: 0,
    resolution: null,
    created_at: stamp(-1),
    tenant_id: OWNER,
  },
  {
    gmail_message_id: 'msg-ambiguous-1',
    gmail_thread_id: 'thr-ambiguous-1',
    gig_id: null,
    from_address: 'submissions@wufoo.example',
    from_name: 'Form Receipt',
    subject: 'Your submission has been received',
    snippet: 'This confirms we received your performer submission. Someone will be in touch after the programming committee meets.',
    received_at: stamp(-4),
    in_spam: 0,
    classification: 'acknowledgement',
    class_confidence: 'medium',
    evidence: 'This confirms we received your performer submission',
    proposed_status: null,
    match_score: 34,
    match_signals: signals([
      { gigId: 12, gigName: 'West End Cultural Centre — Performer Applications', score: 34, confidence: 'low', bound: false,
        signals: [{ id: 'name', points: 34, detail: '"performer" in the subject.' }] },
      { gigId: 6, gigName: 'Winnipeg Folk Festival 2027 — Performer Submissions', score: 34, confidence: 'low', bound: false,
        signals: [{ id: 'name', points: 34, detail: '"performer" in the subject.' }] },
    ]),
    match_ambiguous: 1,
    resolution: null,
    created_at: stamp(-4),
    tenant_id: OWNER,
  },
]

// ---------------------------------------------------------------------------
// The enrolment code. Without this the fixture is a database nobody can log in
// to look at: a fresh local database has no passkey, and the emailed-code path
// needs a mailer that local development does not have. `code_hash` is a plain
// SHA-256 of the code (src/lib/auth.ts), so a known code can be seeded and
// printed. Local only, and it expires like any other.
const SETUP_CODE = '424242'
const codeRow = {
  id: randomUUID(),
  code_hash: createHash('sha256').update(SETUP_CODE).digest('hex'),
  attempts: 0,
  expires_at: new Date(NOW.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  used_at: null,
  created_at: NOW.toISOString(),
  user_id: 'usr_owner',
}

// ---------------------------------------------------------------------------

const OWNED_TABLES = [
  'gig_replies',
  'task_runs', 'artist_assets', 'reference_docs', 'promo_drafts',
  'sync_targets', 'gig_opportunities', 'auth_enrolment_codes', 'users', 'tenants',
]

const statements = [
  ...OWNED_TABLES.map((t) => `DELETE FROM ${t};`),
  ...insert('tenants', tenants),
  ...insert('users', users),
  ...insert('gig_opportunities', gigRows),
  ...insert('sync_targets', syncRows),
  ...insert('promo_drafts', promoRows),
  ...insert('artist_assets', assetRows),
  ...insert('reference_docs', referenceDocs),
  ...insert('task_runs', taskRuns),
  ...insert('gig_replies', replies),
  ...insert('auth_enrolment_codes', [codeRow]),
  // The gig rows above are written in the fourteen-status vocabulary, which is
  // readable and is how rows looked before the rename — but production was
  // converted by migration 0031, and the seed runs after the migrations, so
  // without this the fixture would exercise a read path production no longer
  // takes. The migration's own file, so the two conversions cannot drift.
  readFileSync('migrations/0031_gig_status_to_stage.sql', 'utf8'),
]

const counts = {
  tenants: tenants.length,
  users: users.length,
  gig_opportunities: gigRows.length,
  sync_targets: syncRows.length,
  promo_drafts: promoRows.length,
  artist_assets: assetRows.length,
  reference_docs: referenceDocs.length,
  task_runs: taskRuns.length,
  gig_replies: replies.length,
}

console.log('Local fixture — shapes, not data. Dates are relative to today.\n')
for (const [table, count] of Object.entries(counts)) {
  console.log(`  ${String(count).padStart(3)}  ${table}`)
}
console.log(`\n  ${statements.length} statements, ${OWNED_TABLES.length} tables cleared first.`)

if (!APPLY) {
  console.log('\nDry run. Nothing written. Re-run with --apply.')
  process.exit(0)
}

const db = databaseName()
const file = join(mkdtempSync(join(tmpdir(), 'scout-seed-')), 'seed.sql')
writeFileSync(file, statements.join('\n'))

wrangler(['d1', 'execute', db, '--local', `--file=${file}`], {
  stdio: ['inherit', 'inherit', 'inherit'],
})

console.log(`\nSeeded ${db} (local).`)
console.log(`\nTo sign in: start the app, choose "Add a passkey", enter owner@example.test, and use setup code ${SETUP_CODE}.`)
console.log('That code is seeded straight into the local database because there is no')
console.log('mailer in local development. It enrols a passkey, exactly as the real one does.')
