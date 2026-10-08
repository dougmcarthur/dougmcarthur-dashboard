/**
 * Whether a sync target takes pitches from somebody it does not know.
 *
 * A pitch to a company that says "no unsolicited material" is the one outreach
 * mistake that cannot be taken back: at best it is ignored, at worst the
 * sender is remembered as somebody who does not read. The research agent filed
 * a target whose own About page said exactly that, with a note calling its
 * submission route "confirmed and simple", and nothing in the app could say
 * otherwise. An email address being listed is a way to reach them. It is not
 * permission.
 *
 * So each target carries a **policy** with the sentence that says so:
 *
 *   closed   their own words refuse cold pitches (no unsolicited material,
 *            referral only, not accepting submissions)
 *   open     their own words invite them
 *   null     nobody has found a statement either way
 *
 * Null is not "fine". `checkedAt` splits it into **unchecked** (nobody has
 * looked) and **silent** (somebody read their site and it says nothing), and
 * neither is offered as a green light. A check that cannot answer you is how
 * you conclude everything is fine.
 *
 * Pure: no clock, no network, no database. The reader below is handed text, the
 * state is handed a row. `src/lib/syncTerms.ts` is the half that fetches.
 */

export type SubmissionPolicy = 'open' | 'closed'

export interface PolicyReading {
  policy: SubmissionPolicy
  /** The sentence that says so, as it was worded. */
  quote: string
}

/* --------------------------------------------------------------------- */
/* Reading a policy out of text                                           */
/* --------------------------------------------------------------------- */

/**
 * Sentences that are about *finding out* rather than stating anything. The
 * agent's own notes are full of them ("could not confirm they take unsolicited
 * pitches"), and a reader that took the keyword and ignored the doubt would
 * close every target the agent was unsure about.
 */
const UNCERTAIN =
  /\b(?:whether|could\s?n[o']?t|could not|unable to|not able to|unconfirmed|unverified|unclear|unsure|not sure|unknown|not confirm\w*|no (?:public |clear |stated |explicit )?(?:statement|information|mention|policy|word)|(?:does|did|do)(?:\s?n[o']?t| not) (?:say|state|mention|specify)|check (?:if|whether)|find out|if (?:they|it|the company|the label|she|he)\b|ask (?:if|whether|them))/i

/** Refusals. Any one of these in a sentence, outside a doubt, closes the target. */
const CLOSED: RegExp[] = [
  // "no unsolicited material please", "no unsolicited submissions"
  /\bno unsolicited\b/,
  // "does not accept unsolicited ...", "we don't take unsolicited", "cannot consider unsolicited"
  /(?:\bnot\b|\bnever\b|n't\b|\bcannot\b|\bunable to\b)[^.;]{0,50}\bunsolicited\b/,
  // "unsolicited submissions will not be reviewed", "... are deleted unread"
  /\bunsolicited\b[^.;]{0,70}(?:\bnot\b|\bnever\b|n't\b|\bignored\b|\bdiscarded\b|\bdeleted\b|\bdisregarded\b|\bdestroyed\b|\bthrown away\b|\bunopened\b|\bunread\b|\bunheard\b)/,
  // "by referral only", "on invitation only", "through an introduction only"
  /\b(?:by|via|through|on)\s+(?:a\s+|an\s+|the\s+)?(?:referral|referrals|invitation|invite|introduction|recommendation)\b[^.;]{0,15}\bonly\b/,
  // "referral only", "represented artists only"
  /\b(?:referral|referrals|invitation|invitations|invite|representation)\s+only\b/,
  /\brepresented\s+(?:artists?|writers?|acts?|clients?)\s+only\b/,
  // "we only accept submissions from agents, attorneys or managers"
  /\bonly\s+(?:accept|accepts|accepting|consider|considers|considering|review|reviews|reviewing|listen\s+to|work\s+with|works\s+with|working\s+with|take|takes|taking)\b[^.;]{0,70}\b(?:referral|referrals|referred|invited|invitation|represented|recommended|agent|agents|attorney|attorneys|lawyer|lawyers|manager|managers)\b/,
  /\b(?:through|via|from)\s+(?:an?\s+)?(?:agent|attorney|lawyer|manager|publisher)s?\s+only\b/,
  // "not currently accepting submissions", "no longer taking new artists"
  /(?:\bnot\b|\bno longer\b|\bnever\b)\s+(?:currently\s+|presently\s+|at this time\s+)?(?:accept|accepting|taking|considering|reviewing|receiving|open to|looking at|listening to)\s+(?:any\s+|new\s+|further\s+|more\s+|outside\s+|external\s+|unsolicited\s+)?(?:submissions?|artists?|demos?|music|material|pitches|songs|tracks|catalogs?|catalogues?|writers?|clients|talent|requests|inquiries|enquiries)\b/,
  // "submissions are closed", "our roster is full" is not matched on purpose
  /\b(?:submissions?|submission window|roster|catalog(?:ue)?)\s+(?:is|are)\s+(?:currently\s+|now\s+|temporarily\s+)?closed\b/,
  /\bclosed\s+to\s+(?:new\s+|outside\s+)?(?:submissions?|artists?|material|music)\b/,
  // "please do not send music", "do not email us attachments"
  /\b(?:please\s+)?(?:do not|don't|never)\s+(?:send|email|e-?mail|mail|submit|pitch|forward)\b[^.;]{0,60}\b(?:music|demos?|songs?|tracks?|material|submissions?|links?|files?|mp3s?|attachments?|pitch(?:es)?|cds?)\b/,
  /\bnot\s+(?:currently\s+)?(?:looking|seeking|searching)\s+for\s+(?:any\s+)?(?:new\s+)?(?:artists?|material|music|songs|submissions?|talent)\b/,
  /\bno\s+(?:new\s+)?(?:demos?|submissions?|pitches)\s+(?:please|accepted|at this time|are being accepted|will be (?:accepted|considered))\b/,
]

/** Invitations. Only trusted from a page, and only when nothing in the sentence negates it. */
const OPEN: RegExp[] = [
  /\b(?:we|they|i)\s+(?:do\s+)?(?:gladly\s+|happily\s+|always\s+|also\s+|currently\s+)?(?:accept|accepts|welcome|welcomes|take|takes|review|reviews|consider|considers|listen\s+to|listens\s+to)\b[^.;]{0,50}\b(?:unsolicited|submissions?|demos?|pitches|new music|new material)\b/,
  /\b(?:currently\s+)?(?:accepting|taking|open\s+to|welcoming|reviewing|considering)\s+(?:new\s+|unsolicited\s+|outside\s+|artist\s+|music\s+)?(?:submissions?|demos?|pitches|material)\b/,
  /\bunsolicited\s+(?:submissions?|material|demos?|music|pitches)\s+(?:are|is)\s+(?:welcome|accepted|encouraged|okay|ok)\b/,
  /\bsubmit\s+your\s+(?:music|songs?|tracks?|demos?|catalog(?:ue)?)\b/,
  /\bsend\s+us\s+your\s+(?:music|songs?|tracks?|demos?|material)\b/,
]

/** Any of these in a sentence means an invitation is conditional, so it is not read as one. */
const NEGATES = /(?:\bnot\b|\bno\b|\bnever\b|n't\b|\bcannot\b|\bunless\b|\bonly\b)/

/** How long a quote may run. A policy sentence is short; a page's whole paragraph is not evidence. */
export const QUOTE_MAX = 300

/** Sentences, one per entry, with the whitespace a page's markup leaves behind collapsed. */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z"“'‘(\d])/))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 6)
}

function trimQuote(sentence: string): string {
  if (sentence.length <= QUOTE_MAX) return sentence
  return sentence.slice(0, QUOTE_MAX).replace(/\s+\S*$/, '') + '…'
}

/**
 * The first refusal or invitation in `text`, a refusal first.
 *
 * Refusals are looked for across the whole text before any invitation is
 * considered, so a page that says "submit your music" on a button and
 * "no unsolicited material" in a paragraph reads as closed. The error this
 * can make is the safe one: a sentence that merely sounds like a refusal
 * closes a target the artist can still pitch by saying so.
 *
 * `only: 'closed'` is for text the app wrote or the agent wrote about a
 * target. An agent's note saying "accepts unsolicited submissions" is a claim
 * with no page behind it, and the whole point of this module is that a claim
 * is not a policy.
 */
export function readSubmissionPolicy(
  text: string | null | undefined,
  options: { only?: 'closed' } = {},
): PolicyReading | null {
  if (!text) return null
  const sentences = sentencesOf(text).filter((s) => !s.endsWith('?') && !UNCERTAIN.test(s))
  const folded = sentences.map((s) => ({ s, f: s.toLowerCase().replace(/[’‘]/g, "'") }))

  for (const { s, f } of folded) {
    if (CLOSED.some((re) => re.test(f))) return { policy: 'closed', quote: trimQuote(s) }
  }
  if (options.only === 'closed') return null

  for (const { s, f } of folded) {
    if (!NEGATES.test(f) && OPEN.some((re) => re.test(f))) return { policy: 'open', quote: trimQuote(s) }
  }
  return null
}

/* --------------------------------------------------------------------- */
/* What a row says                                                        */
/* --------------------------------------------------------------------- */

/** The five columns the policy lives in, as a row carries them. */
export interface TermsColumns {
  submissionPolicy: string | null
  policyEvidence: string | null
  policyUrl: string | null
  policyCheckedAt: string | null
  policyOverriddenAt: string | null
}

export type TermsFacts = Partial<{ [K in keyof TermsColumns]: TermsColumns[K] | undefined }>

export type TermsState = 'closed' | 'overridden' | 'open' | 'silent' | 'unreadable' | 'unchecked'

/** What the evidence says when there was nowhere to look, and what the state listens for. */
export const NO_SITE = 'There was no website to read'
/** What the evidence says when no page opened, and what `termsDue` listens for. */
export const UNREACHABLE = 'Could not open'

export interface TermsView {
  state: TermsState
  /** Two or three words, for a chip. */
  label: string
  /** One sentence saying where this stands. */
  summary: string
  /** What the page said, when it said anything. */
  quote: string | null
  url: string | null
  checkedAt: string | null
}

const isPolicy = (v: unknown): v is SubmissionPolicy => v === 'open' || v === 'closed'

export function termsState(row: TermsFacts): TermsState {
  const policy = isPolicy(row.submissionPolicy) ? row.submissionPolicy : null
  if (policy === 'closed') return row.policyOverriddenAt ? 'overridden' : 'closed'
  if (policy === 'open') return 'open'
  if (!row.policyCheckedAt) return 'unchecked'
  // Looked, and could not read: not the same fact as "read it, says nothing",
  // and a card that treated them alike would say a site was read that never was.
  const said = row.policyEvidence ?? ''
  return said.startsWith(NO_SITE) || said.startsWith(UNREACHABLE) ? 'unreadable' : 'silent'
}

/**
 * The words every screen uses for a row's terms. One place, so the Sync page,
 * the Review pane and the Overview card cannot describe the same target three
 * ways, and so a change of mind about the wording is one edit.
 */
export function termsOf(row: TermsFacts): TermsView {
  const state = termsState(row)
  const quote = row.policyEvidence?.trim() || null
  const base = { state, url: row.policyUrl ?? null, checkedAt: row.policyCheckedAt ?? null }

  switch (state) {
    case 'closed':
      return {
        ...base,
        label: 'No unsolicited pitches',
        summary:
          'Their own site says they do not take pitches from people they do not know. ' +
          'Sending one anyway risks being ignored, or being remembered as somebody who did not read it.',
        quote,
      }
    case 'overridden':
      return {
        ...base,
        label: 'Pitching anyway',
        summary: 'Their own site says they take no unsolicited pitches, and you chose to go ahead regardless.',
        quote,
      }
    case 'open':
      return {
        ...base,
        label: 'Takes submissions',
        summary: 'Their own site invites submissions.',
        quote,
      }
    case 'silent':
      return {
        ...base,
        label: 'No policy found',
        summary:
          'Nothing on their site says whether they take pitches from people they do not know. ' +
          'That is not permission, so read it yourself before you send.',
        quote,
      }
    case 'unreadable': {
      const noSite = (quote ?? '').startsWith(NO_SITE)
      return {
        ...base,
        label: noSite ? 'No website to check' : 'Site did not open',
        summary: noSite
          ? 'There is no website on file to read, so nobody knows whether they take pitches from people they do not know. ' +
            'Add their website, or read their site yourself before you send.'
          : 'Their site could not be opened, so nobody knows whether they take pitches from people they do not know. ' +
            'Scout will try again in a few days, and you can check it now.',
        quote,
      }
    }
    case 'unchecked':
      return {
        ...base,
        label: 'Terms not checked',
        summary:
          'Nobody has checked whether they take pitches from people they do not know. Check before you send.',
        quote: null,
      }
  }
}

/**
 * Whether a pitch may go to this target.
 *
 * Only a stated refusal blocks, and only until the artist overrides it. Silence
 * and an unchecked row warn but do not block, because a missing statement is a
 * fact about the website and not about the company.
 */
export function pitchGate(row: TermsFacts): { blocked: boolean; state: TermsState; reason: string | null } {
  const state = termsState(row)
  return {
    blocked: state === 'closed',
    state,
    reason: state === 'closed' ? termsOf(row).summary : null,
  }
}

/**
 * The reason a bulk action leaves a target out, or null when it may go.
 *
 * Stricter than a single pitch: drafting seven at once is where one unchecked
 * target costs the most, and the nightly check clears the backlog within days.
 */
export function bulkSkipReason(row: TermsFacts): 'says no unsolicited pitches' | 'terms not checked yet' | null {
  const state = termsState(row)
  if (state === 'closed') return 'says no unsolicited pitches'
  // A site nobody could read tells the artist as little as one nobody looked at.
  if (state === 'unchecked' || state === 'unreadable') return 'terms not checked yet'
  return null
}

/** A sentence for the default decision card, naming where the terms stand. */
export function termsSentence(row: TermsFacts): string {
  switch (termsState(row)) {
    case 'open':
      return 'Their site says they take submissions.'
    case 'overridden':
      return 'Their site says they take no unsolicited pitches, and you decided to pitch anyway.'
    case 'silent':
      return 'Their site says nothing about pitches, which is not permission.'
    case 'unreadable':
      return 'Nobody could read their site, so nobody knows whether they take pitches from people they do not know.'
    case 'unchecked':
      return 'Nobody has checked that they take pitches from people they do not know.'
    case 'closed':
      return 'Their site says they take no unsolicited pitches.'
  }
}

/* --------------------------------------------------------------------- */
/* Writing it down                                                        */
/* --------------------------------------------------------------------- */

export interface TermsFinding {
  policy: SubmissionPolicy | null
  quote: string | null
  url: string | null
  /** What was done, for the row to show when nothing was found. */
  note: string
}

/**
 * Fold a finding into what a row already holds.
 *
 * Automation moves toward caution and never away from it: a refusal replaces
 * anything, an invitation fills only an empty policy, and silence changes
 * nothing it was not asked to. The artist's override sits in its own column
 * and is never touched here, so a re-check cannot quietly re-block a target
 * they decided to pitch.
 */
export function foldFinding(current: TermsColumns, finding: TermsFinding, now: string): TermsColumns {
  const have = isPolicy(current.submissionPolicy) ? current.submissionPolicy : null
  const next: TermsColumns = { ...current, policyCheckedAt: now }

  if (finding.policy === 'closed') {
    // Keep the evidence already on file when it is a refusal too: swapping one
    // sentence for another says the same thing and churns the row.
    if (have !== 'closed' || !current.policyEvidence) {
      next.submissionPolicy = 'closed'
      next.policyEvidence = finding.quote
      next.policyUrl = finding.url
    }
    return next
  }

  if (finding.policy === 'open' && have === null) {
    next.submissionPolicy = 'open'
    next.policyEvidence = finding.quote
    next.policyUrl = finding.url
    return next
  }

  // Nothing found, or an invitation that does not outrank what is there. The
  // note only replaces evidence on a row with no verdict: an `open` row keeps
  // its quote, and a `closed` one keeps its refusal.
  if (have === null) {
    next.policyEvidence = finding.note
    next.policyUrl = finding.url ?? current.policyUrl
  }
  return next
}

export const EMPTY_TERMS: TermsColumns = {
  submissionPolicy: null,
  policyEvidence: null,
  policyUrl: null,
  policyCheckedAt: null,
  policyOverriddenAt: null,
}

/**
 * A website address as it should be stored, or null when it is not one.
 *
 * "imaginaryfriends.com" is what a person types and what an email signature
 * holds, so a missing scheme is added rather than refused. Anything that is not
 * a plain http or https address is refused, because the check will fetch it.
 */
export function normaliseWebsite(raw: string | null | undefined): string | null {
  const text = raw?.trim()
  if (!text) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!url.hostname.includes('.')) return null
    return url.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

export type AgentPolicy = 'open' | 'closed' | 'unknown'

/**
 * The columns a new row starts with, from what the writer said about the
 * target's rules and from its own notes.
 *
 * `open` has to come with the sentence that says so. Without it there is
 * nothing for the artist to read, and an agent that is sure and an agent that
 * is guessing look identical on the screen; the error names what is missing
 * so the session can go and get it or say `unknown`.
 *
 * The notes are read for a refusal only. A target the agent described as
 * "does not accept unsolicited submissions" is closed whatever the field says.
 */
export function startingTerms(
  input: { submissionPolicy?: string | null; policyQuote?: string | null; policyUrl?: string | null },
  notes: string | null | undefined,
  now: string,
): { ok: true; columns: TermsColumns } | { ok: false; error: string } {
  const said = input.submissionPolicy ?? null
  const quote = input.policyQuote?.trim() || null
  let columns: TermsColumns = { ...EMPTY_TERMS }

  if (said === 'open') {
    if (!quote) {
      return {
        ok: false,
        error:
          'submissionPolicy "open" needs policyQuote: the sentence on their own site that invites submissions. ' +
          'If you could not find one, send "unknown", which is an honest answer.',
      }
    }
    columns = { ...columns, submissionPolicy: 'open', policyEvidence: quote, policyUrl: input.policyUrl ?? null, policyCheckedAt: now }
  } else if (said === 'closed') {
    columns = {
      ...columns,
      submissionPolicy: 'closed',
      policyEvidence: quote ?? 'The research agent reported that they take no unsolicited pitches.',
      policyUrl: input.policyUrl ?? null,
      policyCheckedAt: now,
    }
  } else if (said === 'unknown') {
    columns = {
      ...columns,
      policyEvidence: 'The research agent found no statement either way.',
      policyUrl: input.policyUrl ?? null,
      policyCheckedAt: now,
    }
  }

  const fromNotes = readSubmissionPolicy(notes, { only: 'closed' })
  if (fromNotes) {
    columns = foldFinding(columns, { policy: 'closed', quote: fromNotes.quote, url: null, note: '' }, now)
  }
  return { ok: true, columns }
}

/* --------------------------------------------------------------------- */
/* Which rows the nightly check looks at                                  */
/* --------------------------------------------------------------------- */

/** How long a read stays good for a target nobody has pitched yet. Sites are rebuilt. */
export const RECHECK_DAYS = 60

/**
 * How soon to try again when the site could not be opened. A failed look is a
 * fact about the network, not about the company, so it is retried in days and
 * never recorded as "read it, says nothing".
 */
export const RETRY_DAYS = 3

const WRITE_OFF = new Set(['archived', 'declined'])

/**
 * Whether the nightly pass should read this target's site, and why.
 *
 * Never-checked rows come first. After that only a target still waiting to be
 * pitched is read again: one already pitched is checked once, for the sake of
 * telling the artist not to chase a company that takes no cold pitches, and
 * then left alone.
 */
export function termsDue(
  row: TermsFacts & { status: string | null },
  today: string,
): 'never' | 'retry' | 'stale' | null {
  if (row.status && WRITE_OFF.has(row.status)) return null
  if (!row.policyCheckedAt) return 'never'
  if ((row.status ?? 'draft_ready') !== 'draft_ready') return null

  const checked = Date.parse(`${row.policyCheckedAt.slice(0, 10)}T00:00:00Z`)
  const days = Math.floor((Date.parse(`${today}T00:00:00Z`) - checked) / 86_400_000)

  const unreachable = !row.submissionPolicy && (row.policyEvidence ?? '').startsWith(UNREACHABLE)
  if (unreachable) return days >= RETRY_DAYS ? 'retry' : null
  return days >= RECHECK_DAYS ? 'stale' : null
}

/* --------------------------------------------------------------------- */
/* Reading every site on file in one go                                   */
/* --------------------------------------------------------------------- */

const DUE_ORDER = { never: 0, retry: 1, stale: 2 } as const

/**
 * The targets a "read them all" pass covers: exactly the ones the nightly pass
 * would pick, never-read first. One rule, so pressing the button only does
 * tonight's work and the next few nights' sooner, and the two cannot disagree
 * about what is waiting.
 */
export function targetsToRead<T extends TermsFacts & { status: string | null }>(
  rows: readonly T[],
  today: string,
): T[] {
  return rows
    .map((row) => ({ row, due: termsDue(row, today) }))
    .filter((entry): entry is { row: T; due: 'never' | 'retry' | 'stale' } => entry.due !== null)
    .sort((a, b) => DUE_ORDER[a.due] - DUE_ORDER[b.due])
    .map((entry) => entry.row)
}

export type CheckRun = {
  /** How many sites the pass set out to read. */
  total: number
  /** The rows the Worker handed back, one per site it read. */
  read: ReadonlyArray<TermsFacts & { name: string }>
  /** Requests that failed outright. Those targets are still unread, so tonight's pass takes them first. */
  failed: number
  stopped?: boolean
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/**
 * What a pass found, as sentences. The refusals are named, since that is the
 * answer the pass exists for, and a site that said nothing is never worded as
 * though it had said yes.
 */
export function checkRunLines(run: CheckRun): string[] {
  const refused: string[] = []
  let open = 0
  let silent = 0
  let unreadable = 0
  let unread = run.failed
  for (const row of run.read) {
    switch (termsState(row)) {
      case 'closed':
      case 'overridden':
        refused.push(row.name)
        break
      case 'open':
        open += 1
        break
      case 'silent':
        silent += 1
        break
      case 'unreadable':
        unreadable += 1
        break
      case 'unchecked':
        // A check always stamps the row, so this is a reply that is not one.
        unread += 1
        break
    }
  }

  const read = run.read.length - (unread - run.failed)
  const lines: string[] = []
  if (run.stopped) lines.push(`Stopped after ${read} of ${run.total}.`)
  else if (read === 0) lines.push('No sites were read.')
  else lines.push(`Read ${read} ${plural(read, 'site', 'sites')}.`)

  if (refused.length > 0) {
    lines.push(
      `${refused.length} ${plural(refused.length, 'says', 'say')} they take no unsolicited pitches: ${refused.join(', ')}.`,
    )
  } else if (read > 0) {
    lines.push('None of the pages read refuse unsolicited pitches.')
  }
  if (open > 0) lines.push(`${open} ${plural(open, 'says', 'say')} they take submissions.`)
  if (silent > 0) {
    lines.push(
      `${silent} ${plural(silent, 'has', 'have')} nothing about submissions on the pages read. ` +
        'That is not permission, so look yourself before you pitch.',
    )
  }
  if (unreadable > 0) lines.push(`${unreadable} could not be opened, or had no website on file.`)
  if (unread > 0) {
    lines.push(`${unread} could not be checked just now. The nightly check will try ${plural(unread, 'it', 'them')} again.`)
  }
  // A pass that gave up leaves targets it never asked about, which would
  // otherwise be missing from every line above.
  const untried = run.total - run.read.length - run.failed
  if (untried > 0 && !run.stopped) {
    lines.push(`${untried} ${plural(untried, 'was', 'were')} not tried. The nightly check will take ${plural(untried, 'it', 'them')}.`)
  }
  return lines
}
