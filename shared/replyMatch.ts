/**
 * Deciding which application an incoming email is about.
 *
 * The plan for this phase said "matched by organiser domain and thread". Run
 * against the real mailbox, that rule matches roughly one reply in ten. Here
 * is what actually arrives, sender beside festival:
 *
 *   Highlands Music Festival   noreply@highlandsmusicfestival.ca   ← the only
 *                                                                   domain match
 *   Manitoba Showcase          do-not-reply@iwanttoshowcase.ca     portal
 *   Folk On The Rocks          no-reply@wufoo.com                  form vendor
 *   JIMWEEK                    noreply@jotform.com                 form vendor
 *   LieLow Music Fest          lielowmusicfest@gmail.com           gmail
 *   Festival du Voyageur       jdesaulniers@heho.ca                unrelated domain
 *   Road to BreakOut West      andrea@manitobamusic.com            parent org
 *   Regional Showcase          devinlat@gmail.com                  a person
 *
 * So the domain is a corroborator, never the test. What survives all eight is
 * the **event's name in the subject or the body** — including as an
 * abbreviation, because organisers write to you the way they talk: FOTR, FDV,
 * "Road to BOW".
 *
 * Two further ideas do the heavy lifting:
 *
 *   - **The confirmation is the anchor.** A web form emails you a receipt, and
 *     the human reply arrives as `Re:` on that thread weeks later. LieLow's
 *     rejection has the festival's name nowhere in its subject — the subject is
 *     "Re: Form Submission - New Form" — but the Squarespace receipt it quotes
 *     names it. Match the receipt and the whole thread follows.
 *   - **Confirm once, then remember.** A match you accept binds the address and
 *     the thread to that gig, so `jdesaulniers@heho.ca` costs one judgement and
 *     never has to be worked out again.
 *
 * Pure, like everything in shared/. Nothing here reads the clock or the network.
 */

import { normaliseGigStatus } from './gigStatus'

// ── Normalising a name ────────────────────────────────────────────────────────

/**
 * Words that carry no identity. Every second event here is a "music festival",
 * so matching on those words matches everything.
 */
const NAME_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'for', 'at', 'in', 'on', 'to',
  'du', 'de', 'la', 'le', 'les', 'des',
  'festival', 'fest', 'music', 'musical', 'arts', 'art',
  'showcase', 'conference', 'series', 'concert', 'concerts',
  'society', 'association', 'annual', 'presents', 'international',
  'canadian', 'canada', 'artist', 'artists', 'submission', 'submissions',
  'application', 'applications',
])

/**
 * Two tokenisations, because the two questions want different ones.
 *
 * `words` keeps a name as written, so "LieLow" stays one distinctive token —
 * splitting it would leave "lie" and "low", which identify nothing.
 * `camelWords` splits it, because that is where the O in "Road to BreakOut
 * West" → BOW comes from. Getting this backwards loses LieLow entirely, which
 * is how it was found.
 */
export function words(name: string): string[] {
  return name.split(/[^A-Za-z0-9]+/).filter(Boolean)
}

export function camelWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

/** The words that identify this event rather than describe its category. */
export function significantWords(name: string): string[] {
  return words(name)
    .map((w) => w.toLowerCase())
    .filter((w) => !NAME_STOPWORDS.has(w) && !/^\d{4}$/.test(w) && w.length > 1)
}

/**
 * The abbreviations an organiser would use.
 *
 * Built from **every** word, not just the significant ones: FOTR is Folk On
 * The Rocks and FDV is Festival du Voyageur, so dropping "on", "the" and "du"
 * would lose both. Contiguous runs of the significant words are generated too,
 * because "Road to BreakOut West Showcase" is written to you as "Road to BOW"
 * — the abbreviation covers part of the name, not the whole of it.
 *
 * Nothing under three letters: a two-letter initialism matches half the
 * language, which is also why these are matched case-sensitively and as whole
 * words rather than anywhere in the text.
 */
export function initialisms(name: string): string[] {
  // A name made entirely of the words every event shares identifies nothing,
  // and "The Music Festival" → TMF would match strangers' mail forever. Such a
  // gig is findable by its domain and by a confirmed binding, and by nothing
  // else — which is the honest position rather than a shortage.
  if (significantWords(name).length === 0) return []

  const out = new Set<string>()
  const take = (list: string[]) => {
    const letters = list.map((w) => w[0].toUpperCase()).join('')
    if (letters.length >= 3 && letters.length <= 6) out.add(letters)
  }

  const all = camelWords(name).filter((w) => !/^\d+$/.test(w))
  if (all.length) take(all)

  const sig = camelWords(name).filter(
    (w) => !/^\d{4}$/.test(w) && !NAME_STOPWORDS.has(w.toLowerCase()),
  )
  for (let i = 0; i < sig.length; i++) {
    for (let j = i + 3; j <= Math.min(sig.length, i + 6); j++) take(sig.slice(i, j))
  }
  return [...out]
}

/** Letters and digits only, lower case — for comparing names across punctuation. */
export function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Matching a name against a message ─────────────────────────────────────────

export type NameMatchKind = 'full' | 'distinctive' | 'initialism'

export interface NameMatch {
  kind: NameMatchKind
  /** What was found, verbatim, so a person can see why this matched. */
  matched: string
  /** `subject` outranks `body` — a name in the subject line is deliberate. */
  where: 'subject' | 'body'
}

/**
 * The longest word is the most distinctive one.
 *
 * Not a frequency table, which would need a corpus this app does not have.
 * Length is a decent proxy — "voyageur" and "highlands" beat "road" and "west"
 * — and it is stable, which matters more than being clever here.
 */
function distinctiveWord(name: string): string | null {
  const sig = significantWords(name).filter((w) => w.length >= 5)
  if (sig.length === 0) return null
  return sig.reduce((best, w) => (w.length > best.length ? w : best))
}

export function matchName(
  gigName: string,
  message: { subject: string; body: string },
): NameMatch | null {
  const fields: Array<['subject' | 'body', string]> = [
    ['subject', message.subject ?? ''],
    ['body', message.body ?? ''],
  ]

  // The whole name, compared with punctuation and spacing removed. That is
  // what lets "Folk On The Rocks" match a body writing it out in full, where a
  // pattern built from the significant words alone ("folk", "rocks") would
  // have to guess at the two stopwords sitting between them.
  const squashedName = squash(gigName)
  const distinctive = distinctiveWord(gigName)
  const abbrevs = initialisms(gigName)

  // Ordered by how much each kind tells you, and each kind checked in the
  // subject before the body: a name in the subject line is deliberate.
  for (const [where, text] of fields) {
    if (text && squashedName.length >= 6 && squash(text).includes(squashedName)) {
      return { kind: 'full', matched: gigName, where }
    }
  }
  for (const [where, text] of fields) {
    if (!text || !distinctive) continue
    const m = text.match(new RegExp(`\\b${escapeRe(distinctive)}\\b`, 'i'))
    if (m) return { kind: 'distinctive', matched: m[0], where }
  }
  for (const [where, text] of fields) {
    if (!text) continue
    for (const abbrev of abbrevs) {
      const m = text.match(new RegExp(`\\b${escapeRe(abbrev)}\\b`))
      if (m) return { kind: 'initialism', matched: m[0], where }
    }
  }
  return null
}

// ── Domains ───────────────────────────────────────────────────────────────────

/**
 * Senders that say nothing about *which* event this is.
 *
 * A message from Wufoo is a form receipt; which form it was is in the body.
 * Listing them stops a portal domain being read as a domain match and lets the
 * matcher say "this is a portal receipt" instead, which is a different and
 * more useful statement.
 */
const RELAY_DOMAINS = [
  'wufoo.com', 'jotform.com', 'squarespace.info', 'squarespace.com', 'powr.io',
  'submittable.com', 'sonicbids.com', 'submithub.com', 'gigmit.com',
  'typeform.com', 'airtable.com', 'tally.so', 'fillout.com', 'formstack.com',
  'google.com', 'jotformeu.com', 'iwanttoshowcase.ca', 'eventotron.com',
]

/** Free mail — the sender domain is the person's, never the organisation's. */
const CONSUMER_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.ca', 'hotmail.com',
  'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'shaw.ca',
  'telus.net', 'sympatico.ca',
]

export function domainOf(address: string): string {
  const at = address.lastIndexOf('@')
  if (at === -1) return ''
  return address.slice(at + 1).trim().toLowerCase().replace(/[>\s]+$/, '')
}

function inList(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`))
}

export const isRelayDomain = (d: string) => inList(d, RELAY_DOMAINS)
export const isConsumerDomain = (d: string) => inList(d, CONSUMER_DOMAINS)

/** The registrable-ish part, so `mail.foo.co.uk` and `foo.co.uk` agree. */
export function domainRoot(domain: string): string {
  const parts = domain.split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  // Two-part public suffixes that would otherwise collapse to "co.uk".
  const tail2 = parts.slice(-2).join('.')
  const SECOND_LEVEL = ['co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.nz', 'mb.ca', 'on.ca', 'bc.ca', 'qc.ca']
  return SECOND_LEVEL.includes(tail2) ? parts.slice(-3).join('.') : parts.slice(-2).join('.')
}

export function urlDomain(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ── Scoring one message against the pipeline ──────────────────────────────────

export interface ReplyMessage {
  messageId: string
  threadId: string
  /** Bare address, lower case. */
  from: string
  /** Display name from the From header, where there was one. */
  fromName?: string | null
  subject: string
  body: string
  /** ISO datetime. */
  receivedAt: string
}

export interface MatchableGig {
  id: number
  name: string
  organizer: string | null
  status: string
  url: string | null
  applicationUrl?: string | null
  submittedAt?: string | null
}

/** An address or thread a confirmed match has tied to a gig. */
export interface Binding {
  gigId: number
  kind: 'address' | 'thread'
  value: string
}

export type SignalId = 'thread' | 'address' | 'name' | 'domain' | 'organizer' | 'relay'

export interface MatchSignal {
  id: SignalId
  points: number
  /** Shown to a person deciding whether to accept the match. */
  detail: string
}

export interface ReplyCandidate {
  gigId: number
  gigName: string
  score: number
  signals: MatchSignal[]
  /** A learned binding hit. Not a guess, and not ranked against guesses. */
  bound: boolean
}

/**
 * Points per signal.
 *
 * The two bindings are decisive by construction. Everything else is evidence,
 * and the name is worth more than the domain because the mailbox says the
 * domain is usually somebody else's — see the header of this file.
 */
const POINTS = {
  thread: 100,
  address: 90,
  name: { full: { subject: 50, body: 40 }, distinctive: { subject: 34, body: 26 }, initialism: { subject: 24, body: 18 } },
  domain: 30,
  organizer: 12,
  relay: 12,
} as const

/** Below this, a candidate is a coincidence rather than a lead. */
export const MATCH_THRESHOLD = 26

/** Two candidates closer than this, with no binding, is a question not an answer. */
export const AMBIGUITY_MARGIN = 12

/**
 * Statuses worth matching mail against.
 *
 * `shortlisted` and `preparing` are in deliberately: a form receipt arriving
 * for a gig still marked "will apply" is exactly the case where the app can
 * tell you something you forgot to record. `discovered` is out because nothing
 * has been sent, and the closed states are out because mail about them is
 * noise.
 */
const MATCHABLE = new Set(['shortlisted', 'preparing', 'submitted', 'acknowledged', 'info_requested', 'invited', 'booked'])

export function isMatchableGig(gig: { status: string }): boolean {
  // Through the vocabulary, never against the raw column: the research agents
  // still POST `approved`, and a second copy of that mapping here is how the
  // two would drift.
  return MATCHABLE.has(normaliseGigStatus(gig.status))
}

function scoreGig(message: ReplyMessage, gig: MatchableGig, bindings: Binding[]): ReplyCandidate | null {
  const signals: MatchSignal[] = []
  const mine = bindings.filter((b) => b.gigId === gig.id)

  if (mine.some((b) => b.kind === 'thread' && b.value === message.threadId)) {
    signals.push({ id: 'thread', points: POINTS.thread, detail: 'Same thread as a reply you already matched.' })
  }
  if (mine.some((b) => b.kind === 'address' && b.value === message.from)) {
    signals.push({ id: 'address', points: POINTS.address, detail: `${message.from} is already known to write about this one.` })
  }

  const bound = signals.length > 0

  // A message that predates the application cannot be a reply to it. Only
  // enforced where the date was recorded — `submitted_at` is null on every row
  // that reached the phase before migration 0010, and guessing from
  // `updated_at` would throw away real matches.
  if (gig.submittedAt && message.receivedAt < gig.submittedAt) return null

  const name = matchName(gig.name, message)
  if (name) {
    signals.push({
      id: 'name',
      points: POINTS.name[name.kind][name.where],
      detail:
        name.kind === 'full'
          ? `"${gig.name}" appears in the ${name.where}.`
          : name.kind === 'initialism'
            ? `"${name.matched}" in the ${name.where} reads as an abbreviation of "${gig.name}".`
            : `"${name.matched}" in the ${name.where}.`,
    })
  }

  const senderDomain = domainOf(message.from)
  const senderRoot = domainRoot(senderDomain)
  const gigRoots = [urlDomain(gig.url), urlDomain(gig.applicationUrl)]
    .filter(Boolean)
    .map(domainRoot)

  if (senderRoot && !isRelayDomain(senderDomain) && !isConsumerDomain(senderDomain) && gigRoots.includes(senderRoot)) {
    signals.push({ id: 'domain', points: POINTS.domain, detail: `Sent from ${senderRoot}, the same domain as the listing.` })
  } else if (isRelayDomain(senderDomain) && gigRoots.some((r) => domainRoot(r) === senderRoot)) {
    // A form vendor that is also where the application lives. Weak on its own
    // — every application on that portal shares it — but it corroborates.
    signals.push({ id: 'relay', points: POINTS.relay, detail: `A receipt from ${senderRoot}, where this application was filed.` })
  }

  if (gig.organizer) {
    const org = squash(gig.organizer)
    const hay = `${message.fromName ?? ''} ${message.subject} ${message.body}`
    if (org.length >= 5 && squash(hay).includes(org)) {
      signals.push({ id: 'organizer', points: POINTS.organizer, detail: `Names the organiser, ${gig.organizer}.` })
    }
  }

  const score = signals.reduce((n, s) => n + s.points, 0)
  if (score === 0) return null
  return { gigId: gig.id, gigName: gig.name, score, signals, bound }
}

export interface ReplyMatchResult {
  /** Best first. Only candidates worth showing. */
  candidates: ReplyCandidate[]
  /** The top two are too close to call and neither is bound. */
  ambiguous: boolean
}

/**
 * Which application this message is about, as a ranked answer with its
 * reasons.
 *
 * Never picks for you when it cannot tell. `ambiguous` is the honest outcome
 * for two festivals whose names share their only distinctive word, and the
 * caller shows both rather than committing to one.
 */
export function matchReply(
  message: ReplyMessage,
  gigs: MatchableGig[],
  bindings: Binding[] = [],
): ReplyMatchResult {
  const scored = gigs
    .filter(isMatchableGig)
    .map((g) => scoreGig(message, g, bindings))
    .filter((c): c is ReplyCandidate => c !== null && (c.bound || c.score >= MATCH_THRESHOLD))
    .sort((a, b) => b.score - a.score || a.gigName.localeCompare(b.gigName))

  const ambiguous =
    scored.length > 1 && !scored[0].bound && scored[0].score - scored[1].score < AMBIGUITY_MARGIN

  return { candidates: scored, ambiguous }
}

export type MatchConfidence = 'certain' | 'likely' | 'possible'

export function matchConfidence(candidate: ReplyCandidate): MatchConfidence {
  if (candidate.bound) return 'certain'
  return candidate.score >= 60 ? 'likely' : 'possible'
}
