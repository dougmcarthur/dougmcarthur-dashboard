/**
 * Pulls structured facts back out of the free-text note columns —
 * `gig_opportunities.fit_notes` and `sync_targets.notes`.
 *
 * These columns were written as prose by the research task runs, and a lot of
 * genuinely structured information ended up buried in them: entry-fee
 * warnings, drafted application field values, ready-to-send outreach copy,
 * submission requirements, deal terms, "waiting on Doug" blockers, and the
 * dates a submission window opens. Migration 0001 added structured columns
 * for some of this (organizer, submission_method, fee_amount,
 * genre_fit_score, agency_type, contact_role, confirmation_method) but they
 * were never backfilled — every one of them is NULL in production.
 *
 * So the Review screen parses at read time and renders each kind of fact in
 * its own container. This is a stopgap, not the destination:
 * docs/notes-field-audit.md is the inventory of what should become real
 * columns, and this parser is the reference for what a backfill would have
 * to extract.
 *
 * Design rule: every sentence lands somewhere. A sentence is claimed by at
 * most one bucket, and anything unclaimed falls through to `summary`, so
 * nothing in the original note is silently dropped.
 */

export type AlertSeverity = 'danger' | 'warn' | 'info'

export interface NoteAlert {
  severity: AlertSeverity
  text: string
  /** Date carried by a "Known issue (flagged YYYY-MM-DD)" preamble. */
  flaggedAt: string | null
}

export interface DraftedField {
  label: string
  value: string
  /** Value is a placeholder waiting on Doug rather than real content. */
  needsDoug: boolean
}

export interface DraftedMessage {
  /** e.g. "via Facebook Messenger", when the note says how to send it. */
  channel: string | null
  body: string
}

export type SubmissionState = 'not_submitted' | 'submitted' | 'unknown'
export type SubmissionMethod = 'email' | 'form' | 'portal' | 'dm' | null

export interface ParsedNote {
  alerts: NoteAlert[]
  submissionState: SubmissionState
  submissionNote: string | null
  submissionMethod: SubmissionMethod
  requirements: string[]
  contactEmails: string[]
  links: string[]
  draftedFields: DraftedField[]
  draftedMessage: DraftedMessage | null
  blockers: string[]
  timing: string[]
  dealTerms: string[]
  tracks: string[]
  provenance: string[]
  location: string | null
  summary: string
  /** True when the note carried nothing but narrative. */
  isPlain: boolean
}

export interface ParsedFee {
  /** Raw contents of the legacy `fee` text column. */
  raw: string | null
  /** First dollar figure found, when the fee is a cost to Doug. */
  amount: number | null
  currency: string
  /** Money has to change hands to apply. */
  required: boolean
  /** Fee text that describes money paid *to* Doug, not charged to him. */
  payout: string | null
}

export interface ParsedDeadline {
  raw: string | null
  /** ISO date, whether the column held one or we recovered it from prose. */
  date: string | null
  /** The column held a clean ISO date — no recovery needed. */
  exact: boolean
  daysUntil: number | null
  /** The qualifier: "rolling artist roster intake", "TBD", "Submission window". */
  note: string | null
  /** ISO date the window opens, which is not the same as when it closes. */
  opensAt: string | null
  opensInDays: number | null
}

/**
 * The three things a `deadline` column value can be carrying at once.
 * `splitDeadline()` produces it from prose; migration 0003 gives each part a
 * column of its own, and `scripts/backfill-deadlines.ts` moves them across.
 */
export interface DeadlineSplit {
  /** When submissions close. */
  date: string | null
  /** When submissions open, when the value describes a window. */
  opensAt: string | null
  /** Everything the dates do not say, kept verbatim. */
  note: string | null
}

const KNOWN_TRACKS = ['Magic', 'Lost Weekends', 'Hermit Phase', 'Draw the Line']

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

// Month abbreviations that must not be treated as sentence enders.
const ABBREVIATIONS = /(?:\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|approx|vs|etc|Inc|Ltd|St|Ave|Mr|Ms|Dr|No)|\be\.g|\bi\.e|\s[A-Z])\.$/

const RE = {
  hardAlert: /^(?:⚠️|❗|🚨)/u,
  labelAlert: /^(?:IMPORTANT|WARNING|CAUTION)\b\s*[:!—-]/i,
  softAlert: /^(?:NOTE|ACTION|REMINDER)\b\s*[:!—-]/i,
  knownIssue: /^Known issue(?:\s*\(flagged\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\))?\s*[:—-]/i,
  danger: /paid|fee\b|do not submit|don't submit|already exists|duplicate|defect|corrupt|urgent|deadline is tomorrow|payment authorization/i,

  submissionStatus: /^Submission status\s*[:—-]\s*(.+)$/i,
  notSubmitted: /\b(?:not submitted|not sent|not started|application not filled|nothing to fill out)\b/i,

  blocker: /needs Doug\b|not on file\b|left blank|left unselected|intentionally left|Doug should\b|Recommend\w* Doug\b|pending Doug'?s\b|needs Doug'?s\b|requires Doug'?s\b|best left to Doug\b|his call\b|Doug'?s decision\b|for Doug to (?:pick|choose|review|decide)|best left to Doug/i,

  // Deliberately narrow: broad tokens like "submission window" also appear in
  // ordinary agency blurbs, which would drag the whole description in here.
  requirement: /\b(?:requires?|requiring|request(?:s|ing)?|must (?:go|be|include|submit)|only considers?|will not open|no attach|attachments|streaming links only|subject line|account creation|eligibility|don'?t qualify|no co-writes|links \(not attachments\))\b/i,

  timing: /\b(?:check back|checking this page|re-?check|window (?:isn'?t|is not|hasn'?t) open|(?:submissions?|applications?)[^.]{0,40}\b(?:open|opens|reopen|not open)|typically opens?|opens? (?:in |on )?(?:January|February|March|April|May|June|July|August|September|October|November|December)|calendar reminder|watch (?:for|wecc)|monitor \w|expected to open)\b/i,

  dealTerms: /\b(?:non-exclusive|exclusive|revenue split|50\/50|no upfront|upfront cost|\d{1,3}\s?% (?:to|of|per)|\d+-year agreement|per placement|pays? ~?\d{1,3}\s?%|accepts? ~?\d{1,3}\s?% of submissions)\b/i,

  provenance: /\b(?:confirmed (?:from|via|as|by)|corroborated by|researched live in chat|logged to D1|decoded from|listed as (?:their|the) (?:official|direct)|per (?:their|the) (?:official|published))\b/i,

  draftedValues: /(?:Drafted\s+(?:the\s+)?(?:field\s+)?values|Drafted\s+profile\s+content)([^:]{0,60})?:\s*/i,
  draftedMessage: /Drafted\s+(?:outreach\s+)?(?:message|email|note|copy)([^:]{0,80})?:\s*/i,
  starBlock: /\*{2,}\s*([^*]+?)\s*\*{2,}/g,

  email: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  url: /https?:\/\/[^\s,)]+/g,
  location: /\b([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,2}),\s*(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT|TX|CO|CA|NY|IL|WA|OR|TN|GA)\b/,
}

/** Whole days from today to `dateStr`; negative when it has passed. */
export function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(`${dateStr}T00:00:00`).getTime() - today.getTime()) / 86400_000)
}

/**
 * Finds the first date in a string, whether written as `2026-07-31` or
 * `September 1, 2026` / `Sept 1 2026`. Returns an ISO date, or null.
 */
export function findDate(text: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const written = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
  )
  if (!written) return null

  const monthIndex = MONTHS.findIndex((m) => m.startsWith(written[1].toLowerCase().slice(0, 3)))
  if (monthIndex < 0) return null
  const day = written[2].padStart(2, '0')
  return `${written[3]}-${String(monthIndex + 1).padStart(2, '0')}-${day}`
}

const MONTH_NAME = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'

/** Words that, just before a date, mean it is when things START, not when they end. */
const OPENS_CUE = /\b(?:opens?|opening|re-?opens?|check back(?: in)?|not open(?: until)?|available from|starts?|submissions? (?:open|begin)|applications? open|window opens?)\b[^.]{0,30}$/i

const RANGE = new RegExp(
  `\\b${MONTH_NAME}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?` +
    `\\s*(?:–|—|--?|to|through|thru|until|till)\\s*` +
    `(?:${MONTH_NAME}\\.?\\s+)?\\d{1,2}(?:st|nd|rd|th)?,?\\s*\\d{4}\\b`,
  'i',
)

const ANY_DATE = new RegExp(
  `\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b${MONTH_NAME}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`,
  'gi',
)

interface FoundDate {
  iso: string
  start: number
  end: number
}

/** Every date in `text`, in the order they appear, with where they sit. */
function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = []
  for (const m of text.matchAll(ANY_DATE)) {
    const iso = findDate(m[0])
    if (iso) out.push({ iso, start: m.index, end: m.index + m[0].length })
  }
  return out
}

/**
 * Pulls a range apart. "September 1 – December 31, 2026" has no year on its
 * opening half, so the year is borrowed from the closing half — which is why
 * this cannot just be two calls to findDate().
 */
function splitRange(range: string): { opensAt: string | null; date: string | null } {
  const closes = findDates(range).at(-1) ?? null
  if (!closes) return { opensAt: null, date: null }

  const head = range.slice(0, range.search(/\s*(?:–|—|--?|to|through|thru|until|till)\s*/i))
  const opensAt = findDate(head) ?? findDate(`${head}, ${closes.iso.slice(0, 4)}`)
  return { opensAt, date: closes.iso }
}

/**
 * Separates a `deadline` value into a closing date, an opening date, and the
 * prose that is neither.
 *
 * The note is kept verbatim rather than reconstructed from the leftovers,
 * because subtracting a date out of a sentence produces fragments
 * ("Submission window: – , 2026") that are worse than the original. It is
 * dropped only when removing the dates leaves nothing but punctuation, i.e.
 * the value really was just a date.
 */
export function splitDeadline(raw: string | null): DeadlineSplit {
  const text = raw?.trim() ?? ''
  if (!text) return { date: null, opensAt: null, note: null }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { date: text, opensAt: null, note: null }

  const found = findDates(text)
  const range = text.match(RANGE)

  let date: string | null = null
  let opensAt: string | null = null

  if (range) {
    ;({ opensAt, date } = splitRange(range[0]))
  } else if (found.length === 1) {
    // One date and an "opens" cue in front of it describes a window that has
    // not started, not a deadline that has.
    if (OPENS_CUE.test(text.slice(0, found[0].start))) opensAt = found[0].iso
    else date = found[0].iso
  } else if (found.length > 1) {
    const opener = found.find((d) => OPENS_CUE.test(text.slice(0, d.start)))
    opensAt = opener?.iso ?? null
    date = (opener ? found.filter((d) => d !== opener) : found).at(-1)?.iso ?? null
  }

  const leftover = text.replace(ANY_DATE, ' ')
  const note = /[a-z]/i.test(leftover) ? text : null

  return { date, opensAt, note }
}

/**
 * The `deadline` column is a TEXT field and roughly half of production rows
 * hold prose instead of a date ("None — rolling artist roster intake",
 * "Submission window: September 1 – December 31, 2026"). Recover a date when
 * one is in there, and flag the row as inexact so the UI can say so rather
 * than pretend the countdown is trustworthy.
 *
 * Migration 0003 gives the qualifier and the window-open date real columns.
 * Pass them and they win; leave them out and the same values are recovered
 * from the prose. The output is identical either way, which is the point —
 * the backfill changes where these facts are stored, not what the UI shows.
 */
export function parseDeadline(
  raw: string | null,
  columns: { note?: string | null; opensAt?: string | null } = {},
): ParsedDeadline {
  const text = raw?.trim() ?? ''
  const split = splitDeadline(text)

  const note = columns.note ?? split.note
  const opensAt = columns.opensAt ?? split.opensAt

  if (!text && !note && !opensAt) {
    return { raw: raw ?? null, date: null, exact: false, daysUntil: null, note: null, opensAt: null, opensInDays: null }
  }

  return {
    raw: text || null,
    date: split.date,
    exact: /^\d{4}-\d{2}-\d{2}$/.test(text),
    daysUntil: split.date ? daysUntil(split.date) : null,
    note,
    opensAt,
    opensInDays: opensAt ? daysUntil(opensAt) : null,
  }
}

/**
 * The `fee` column is likewise free text, and `fee_amount` is NULL for every
 * production row. Distinguish "costs Doug money to apply" from "pays Doug if
 * selected" — both show up in the same column.
 */
export function parseFee(raw: string | null, paid: number | boolean | null): ParsedFee {
  const text = raw?.trim() ?? ''
  const flaggedPaid = paid === 1 || paid === true

  if (!text) {
    return { raw: raw ?? null, amount: null, currency: 'USD', required: flaggedPaid, payout: null }
  }

  const isNone = /^(?:none|n\/a|no fee|no(?:ne)? known|\$0(?:\.00)?)\b/i.test(text)
  const payoutMatch = text.match(/(?:paid|pays?|remuneration|performance fee)[^.]*/i)
  const money = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/)
  const currency = /\bCAD\b/i.test(text) ? 'CAD' : /\bGBP\b|£/.test(text) ? 'GBP' : 'USD'

  // "None to audition (paid performance fee if selected: $800 solo)" — the
  // dollar figure is money coming in, not an entry cost.
  if (isNone) {
    return {
      raw: text,
      amount: null,
      currency,
      required: false,
      payout: payoutMatch ? payoutMatch[0].trim() : null,
    }
  }

  return {
    raw: text,
    amount: money ? Number(money[1].replace(/,/g, '')) : null,
    currency,
    required: true,
    payout: null,
  }
}

/** Splits prose into sentences without breaking on "Sept." or "e.g.". */
export function splitSentences(text: string): string[] {
  const chunks = text.split(/(?<=[.!?])\s+/)
  const out: string[] = []

  for (const chunk of chunks) {
    const previous = out[out.length - 1]
    const unbalancedQuote = previous ? (previous.match(/"/g)?.length ?? 0) % 2 === 1 : false

    if (previous && (ABBREVIATIONS.test(previous) || unbalancedQuote)) {
      out[out.length - 1] = `${previous} ${chunk}`
    } else {
      out.push(chunk)
    }
  }

  return out.map((s) => s.trim()).filter(Boolean)
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values))
}

/**
 * Splits a "Drafted values: A: 1; B: 2; …" run into labelled fields.
 *
 * The list is always the tail of a paragraph and frequently ends with a
 * trailing sentence of ordinary prose ("Doug should pick the video and submit
 * himself when ready."), so the final segment is cut at its last
 * sentence boundary and the remainder handed back as prose.
 */
function parseDraftedFields(block: string): { fields: DraftedField[]; trailing: string | null } {
  const segments = block.split(';')
  let trailing: string | null = null

  const last = segments[segments.length - 1]
  const boundaries = [...last.matchAll(/\.\s+(?=[A-Z])/g)]
  if (boundaries.length > 0) {
    const cut = boundaries[boundaries.length - 1]
    const tail = last.slice(cut.index! + cut[0].length).trim()
    // Only treat it as prose if it reads like a sentence, not another field.
    if (/^[A-Z][^:=]*$/.test(tail) && tail.split(/\s+/).length >= 3) {
      segments[segments.length - 1] = last.slice(0, cut.index! + 1)
      trailing = tail
    }
  }

  const fields: DraftedField[] = []
  for (const segment of segments) {
    const text = segment.trim().replace(/\.$/, '')
    if (!text) continue

    // "Contact Name: Doug McArthur" / "bio = the approved 150-word bio".
    // The (?!\/\/) stops the colon in "https://…" being read as a separator.
    let match = text.match(/^([A-Za-z][A-Za-z0-9 /&+'-]{1,44}?)\s*[:=](?!\/\/)\s*(.+)$/s)
    // "Artist name 'Doug McArthur'" — quoted value, no separator
    if (!match) match = text.match(/^([A-Za-z][A-Za-z0-9 /&+'-]{1,44}?)\s+['"“]([^'"”]+)['"”]$/s)
    // "contact email doug@…" / "website https://…" — separator is just a space
    if (!match) {
      match = text.match(
        /^([A-Za-z][A-Za-z0-9 /&+'-]{1,30}?)\s+((?:https?:\/\/|mailto:)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)$/s,
      )
    }

    if (!match) {
      fields.push({ label: '', value: text, needsDoug: RE.blocker.test(text) })
      continue
    }

    const value = match[2].trim()
    fields.push({
      label: match[1].trim(),
      value,
      needsDoug: RE.blocker.test(value),
    })
  }

  return { fields, trailing }
}

/** Extracts a `"…"` block following a "Drafted outreach message:" lead-in. */
function extractDraftedMessage(text: string): { message: DraftedMessage | null; rest: string } {
  const lead = text.match(RE.draftedMessage)
  if (!lead || lead.index === undefined) return { message: null, rest: text }

  const after = text.slice(lead.index + lead[0].length)
  const quoted = after.match(/^\s*["“]([\s\S]+?)["”]\s*$/) ?? after.match(/^\s*["“]([\s\S]+?)["”]/)
  if (!quoted) return { message: null, rest: text }

  const channelMatch = lead[1]?.match(/\b(?:via|through|on)\s+[^,]+/i)

  return {
    message: {
      channel: channelMatch ? channelMatch[0].trim() : null,
      body: quoted[1].trim(),
    },
    rest: (text.slice(0, lead.index) + after.slice(quoted[0].length)).trim(),
  }
}

/** Main entry point — parse one note body into its constituent parts. */
export function parseNote(note: string | null | undefined): ParsedNote {
  const empty: ParsedNote = {
    alerts: [], submissionState: 'unknown', submissionNote: null, submissionMethod: null,
    requirements: [], contactEmails: [], links: [], draftedFields: [], draftedMessage: null,
    blockers: [], timing: [], dealTerms: [], tracks: [], provenance: [],
    location: null, summary: '', isPlain: true,
  }
  if (!note?.trim()) return empty

  const alerts: NoteAlert[] = []
  const requirements: string[] = []
  const blockers: string[] = []
  const timing: string[] = []
  const dealTerms: string[] = []
  const provenance: string[] = []
  const summaryParts: string[] = []

  let working = note.trim()

  // 1. `*** LOUD WARNING ***` blocks aren't sentences — lift them out first.
  working = working.replace(RE.starBlock, (_full, inner: string) => {
    alerts.push({ severity: 'danger', text: inner.trim(), flaggedAt: null })
    return ' '
  })

  // 2. A drafted outreach message is a verbatim quoted body — lift it out
  //    before sentence splitting would shred it.
  const { message: draftedMessage, rest: afterMessage } = extractDraftedMessage(working)
  working = afterMessage

  // 3. The drafted-values run is semicolon-delimited, also not sentences.
  let draftedFields: DraftedField[] = []
  const valuesLead = working.match(RE.draftedValues)
  if (valuesLead && valuesLead.index !== undefined) {
    const blockStart = valuesLead.index + valuesLead[0].length
    const paragraphEnd = working.indexOf('\n\n', blockStart)
    const block = working.slice(blockStart, paragraphEnd === -1 ? undefined : paragraphEnd)

    const parsed = parseDraftedFields(block)
    draftedFields = parsed.fields
    working =
      working.slice(0, valuesLead.index) +
      (parsed.trailing ? ` ${parsed.trailing} ` : ' ') +
      (paragraphEnd === -1 ? '' : working.slice(paragraphEnd))
  }

  // 4. Classify what's left, sentence by sentence.
  let submissionState: SubmissionState = 'unknown'
  let submissionNote: string | null = null

  for (const sentence of splitSentences(working)) {
    const knownIssue = sentence.match(RE.knownIssue)
    if (knownIssue) {
      alerts.push({ severity: 'danger', text: sentence, flaggedAt: knownIssue[1] ?? null })
      continue
    }
    if (RE.hardAlert.test(sentence) || RE.labelAlert.test(sentence)) {
      alerts.push({
        severity: RE.danger.test(sentence) ? 'danger' : 'warn',
        text: sentence,
        flaggedAt: null,
      })
      continue
    }

    const statusLine = sentence.match(RE.submissionStatus)
    if (statusLine) {
      submissionNote = statusLine[1].trim()
      submissionState = RE.notSubmitted.test(statusLine[1]) ? 'not_submitted' : 'submitted'
      continue
    }

    if (RE.blocker.test(sentence)) {
      blockers.push(sentence)
      if (submissionState === 'unknown' && RE.notSubmitted.test(sentence)) {
        submissionState = 'not_submitted'
        submissionNote = sentence
      }
      continue
    }
    if (RE.requirement.test(sentence)) {
      requirements.push(sentence)
      continue
    }
    if (RE.timing.test(sentence)) {
      timing.push(sentence)
      continue
    }
    if (RE.dealTerms.test(sentence)) {
      dealTerms.push(sentence)
      continue
    }
    if (RE.provenance.test(sentence)) {
      provenance.push(sentence)
      continue
    }
    if (RE.softAlert.test(sentence)) {
      alerts.push({ severity: 'info', text: sentence, flaggedAt: null })
      continue
    }

    // A bare "NOT SUBMITTED — …" line with no "Submission status:" prefix.
    // It becomes the submission note rather than being repeated in the summary.
    if (submissionState === 'unknown' && RE.notSubmitted.test(sentence)) {
      submissionState = 'not_submitted'
      submissionNote = sentence
      continue
    }
    summaryParts.push(sentence)
  }

  // 5. Facts that can appear anywhere in the note, claimed sentence or not.
  const contactEmails = uniq(note.match(RE.email) ?? [])
  // Notes run URLs straight into sentence punctuation ("…dougmcarthur.net;").
  const links = uniq((note.match(RE.url) ?? []).map((u) => u.replace(/[.,;:!?)\]]+$/, '')))
  const tracks = KNOWN_TRACKS.filter((t) => new RegExp(`\\b${t}\\b`).test(note))
  const location = note.match(RE.location)?.[0] ?? null

  const submissionMethod: SubmissionMethod =
    /facebook messenger|direct message|\bDM\b|no online application|no form to fill/i.test(note)
      ? 'dm'
      : /airtable|google form|intake form|web form|application form|contact form/i.test(note)
      ? 'form'
      : /portal|\baccount\b/i.test(note)
      ? 'portal'
      : /email(?:ing)?|inbox|EPK to|subject line/i.test(note)
      ? 'email'
      : null

  const summary = summaryParts.join(' ').replace(/\s{2,}/g, ' ').trim()

  return {
    alerts,
    submissionState,
    submissionNote,
    submissionMethod,
    requirements,
    contactEmails,
    links,
    draftedFields,
    draftedMessage,
    blockers,
    timing,
    dealTerms,
    tracks,
    provenance,
    location,
    summary,
    isPlain:
      alerts.length === 0 && requirements.length === 0 && blockers.length === 0 &&
      timing.length === 0 && dealTerms.length === 0 && draftedFields.length === 0 &&
      draftedMessage === null && submissionState === 'unknown',
  }
}
