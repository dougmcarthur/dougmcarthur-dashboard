/**
 * Answering the organiser when they ask for something.
 *
 * `info_requested` has been reachable since the reply router landed, and it is
 * the state the plan singled out as the one that stalls if nobody notices. The
 * queue notices it. Nothing answered it — the card said "answering is a reply
 * in your mail, not a button here", which was true and not much help.
 *
 * ## Two passes, because the body is only in hand once
 *
 * `gig_replies` stores a 400-character snippet, not the email. So **asks are
 * recognised at scan time**, when the whole body is there, and stored beside
 * the deciding sentence that `classifyReply` already keeps. Composing the
 * draft then happens on read, against the artist database *as it is now* —
 * an answer that was missing in March and is on file in April should appear
 * without a re-scan.
 *
 * A row stored before this existed has no asks. It is re-read from the snippet
 * instead and marked `approximate`, the same treatment a deadline recovered
 * from prose gets: usable, and never shown as certain.
 *
 * ## It drafts; it never sends
 *
 * The same rule as the application, for the same reason, and this one is
 * sharper: a wrong auto-reply to a festival that just asked you a question is
 * worse than a slow one. Copy, and no Send.
 *
 * Pure. Nothing here reads the clock or the network.
 */

import { pickForLength, type ArtistAsset } from './artistAssets'
import { sentences, stripQuoted } from './replyClassify'

export interface Ask {
  id: string
  /** How the draft names it: "a press photo". */
  label: string
  /**
   * The library question whose answer goes in the reply, or null when there
   * is no text answer — a signed form is a file, not a sentence.
   */
  questionKind: string | null
  /** A file to attach. Listed, never inlined, and never claimed to be attached. */
  attachment: boolean
}

interface AskPattern extends Ask {
  re: RegExp
}

/**
 * What an organiser asks for after you have applied.
 *
 * A closed vocabulary, and that is the point: this matches *nouns the library
 * already has a kind for*, rather than trying to understand a sentence. An
 * ask outside the list is not guessed at — it is reported as unrecognised and
 * the deciding sentence is quoted so you can read it yourself.
 *
 * Ordered most specific first, like `QUESTION_KINDS`: "stage plot" must be
 * seen before the bare "plot", and "press photo" before "photo".
 */
const ASK_PATTERNS: AskPattern[] = [
  { id: 'photo', label: 'a press photo', questionKind: null, attachment: true,
    re: /\b(?:press|promo(?:tional)?|publicity|hi-?res|high[- ]res(?:olution)?)\s+(?:photo|image|shot|picture)s?\b|\bphotos?\s+for\s+(?:the\s+)?(?:programme|program|website|press)\b/i },
  { id: 'stage_plot', label: 'a stage plot or input list', questionKind: 'tech_requirements', attachment: true,
    re: /\bstage\s?plot\b|\binput\s+list\b|\btech(?:nical)?\s+rider\b/i },
  { id: 'tech', label: 'your technical requirements', questionKind: 'tech_requirements', attachment: false,
    re: /\btech(?:nical)?\s+(?:requirement|need|spec|detail)s?\b|\bbackline\b|\bsound\s+(?:requirement|need)s?\b/i },
  { id: 'video', label: 'live video', questionKind: 'youtube', attachment: false,
    re: /\b(?:live\s+)?(?:performance\s+)?video\b|\byou ?tube\s+link\b|\bfootage\b/i },
  { id: 'bio', label: 'a bio', questionKind: 'bio', attachment: false,
    re: /\bbio(?:graphy)?\b|\bartist\s+statement\b/i },
  { id: 'one_liner', label: 'a short description', questionKind: 'one_liner', attachment: false,
    re: /\bone[- ]?(?:line|liner|sentence)\b|\bshort\s+(?:description|blurb)\b|\bblurb\b/i },
  { id: 'epk', label: 'your EPK', questionKind: 'epk', attachment: false,
    re: /\bepk\b|\bpress\s?kit\b/i },
  { id: 'links', label: 'your links', questionKind: 'website', attachment: false,
    re: /\b(?:streaming|music|social)\s+links?\b|\blinks?\s+to\s+your\s+(?:music|work)\b|\bspotify\b|\bbandcamp\b/i },
  { id: 'socials', label: 'your social handles', questionKind: 'socials', attachment: false,
    re: /\bsocial\s+(?:media\s+)?(?:handles?|links?)\b|\bhandles?\s+for\b/i },
  { id: 'set_length', label: 'your set length', questionKind: 'set_length', attachment: false,
    re: /\bset\s+(?:length|time|duration)\b|\bhow\s+long\s+(?:is|do)\b|\blength\s+of\s+(?:your\s+)?set\b/i },
  { id: 'lineup', label: 'your line-up', questionKind: 'lineup', attachment: false,
    re: /\bline[- ]?up\b|\bhow\s+many\s+(?:performers?|musicians?|people|of\s+you)\b|\bnumber\s+of\s+performers?\b|\bpersonnel\b/i },
  { id: 'availability', label: 'your availability', questionKind: 'availability', attachment: false,
    re: /\bavailab\w*\b|\bwhich\s+(?:date|day)s?\b|\bwhat\s+dates\b|\bpreferred\s+(?:date|slot)s?\b/i },
  { id: 'fee', label: 'your fee', questionKind: 'fee', attachment: false,
    re: /\byour\s+(?:fee|rate|guarantee)\b|\bhow\s+much\s+do\s+you\s+(?:charge|cost)\b|\bfee\s+(?:expectation|range)\b/i },
  { id: 'travel', label: 'your travel and accommodation needs', questionKind: 'travel', attachment: false,
    re: /\baccommodation\b|\btravel\s+(?:need|arrangement|detail|plan)s?\b|\bwhere\s+(?:are\s+you|will\s+you\s+be)\s+travelling\s+from\b/i },
  { id: 'accessibility', label: 'any accessibility or dietary needs', questionKind: 'accessibility', attachment: false,
    re: /\baccessib\w*\b|\bdietary\b|\ballerg\w*\b/i },
  { id: 'tax_form', label: 'a tax form', questionKind: null, attachment: true,
    re: /\bw-?9\b|\bw-?8\s?ben\b|\btax\s+form\b|\bgst\b|\bhst\b/i },
  { id: 'contract', label: 'the signed agreement', questionKind: null, attachment: true,
    re: /\b(?:sign(?:ed)?|return)\s+(?:the\s+)?(?:contract|agreement|offer)\b|\bcontract\s+(?:attached|back)\b/i },
  { id: 'insurance', label: 'proof of insurance', questionKind: null, attachment: true,
    re: /\binsurance\b|\bcertificate\s+of\s+liability\b|\bliability\s+cover\w*\b/i },
]

export interface RecognisedAsk extends Ask {
  /** The sentence it was read from, verbatim. A reading you cannot check… */
  evidence: string
}

export interface AskReading {
  asks: RecognisedAsk[]
  /**
   * The sentences that look like a request but matched nothing in the list.
   * Reported rather than dropped: an ask this does not know is exactly the
   * one you must not assume was handled.
   */
  unrecognised: string[]
}

/** Sentences that are asking for something, rather than telling you something. */
const REQUEST_SHAPE =
  /\b(?:could|can|would|please|need|send|share|provide|forward|confirm|attach|complete|fill|sign|return|let\s+us\s+know|what\s+is|what'?s|do\s+you\s+have)\b/i

/**
 * What the organiser asked for.
 *
 * Runs over the whole body at scan time — unlike classification, which reads
 * only the top post. An ask can sit under a greeting, in a list, or three
 * paragraphs down, and none of those is the quoted receipt underneath.
 */
export function recogniseAsks(body: string): AskReading {
  const text = stripQuoted(body)
  const asks: RecognisedAsk[] = []
  const unrecognised: string[] = []
  const seen = new Set<string>()

  for (const sentence of sentences(text)) {
    if (!REQUEST_SHAPE.test(sentence)) continue

    let matched = false
    for (const pattern of ASK_PATTERNS) {
      if (!pattern.re.test(sentence)) continue
      matched = true
      if (seen.has(pattern.id)) continue
      seen.add(pattern.id)
      asks.push({
        id: pattern.id,
        label: pattern.label,
        questionKind: pattern.questionKind,
        attachment: pattern.attachment,
        evidence: sentence.trim(),
      })
    }
    if (!matched) unrecognised.push(sentence.trim())
  }

  return { asks, unrecognised }
}

export interface DraftGap {
  /** Appears verbatim in the body, so an unedited paste looks unfinished. */
  marker: string
  prompt: string
}

export interface ReplyDraft {
  subject: string
  body: string
  /** What it read the organiser as asking for. */
  asks: RecognisedAsk[]
  /** Asks answered from the library, by label. */
  answered: string[]
  /** Asks with nothing on file. Named in the body, never quietly dropped. */
  missing: string[]
  /** Files to attach yourself. Listed, never claimed to be attached. */
  attachments: string[]
  /** Sentences that asked for something outside the vocabulary. */
  unrecognised: string[]
  gaps: DraftGap[]
  /**
   * The asks were re-read from the stored snippet rather than the email, so
   * something further down may be missed. Shown wherever the draft is.
   */
  approximate: boolean
}

const NOTHING_RECOGNISED: DraftGap = {
  marker: '[what they asked for]',
  prompt:
    'Nothing in this reply matched something the library can answer. Read it and write the answer yourself — the sentence it was read from is quoted below.',
}

function answerFor(assets: ArtistAsset[], questionKind: string, length: number | null): string | null {
  const picked = pickForLength(
    assets.filter((a) => !a.archived && a.questionKind === questionKind),
    length,
  )
  return picked?.value?.trim() || null
}

/**
 * A reply to an organiser's question, and an honest account of what is not
 * in it.
 *
 * Every answer comes off the artist database. Nothing is invented: an ask
 * with nothing on file becomes a marked gap in the body rather than a
 * plausible sentence, because a plausible sentence is the one that gets sent.
 */
export function composeReplyDraft(input: {
  gig: { name: string; organizer?: string | null } | null
  reply: { subject: string | null; fromName?: string | null; evidence?: string | null }
  reading: AskReading
  assets: ArtistAsset[]
  approximate?: boolean
}): ReplyDraft {
  const { gig, reply, reading } = input
  const live = input.assets.filter((a) => !a.archived && a.value)

  const answered: string[] = []
  const missing: string[] = []
  const attachments: string[] = []
  const gaps: DraftGap[] = []
  const lines: string[] = []

  for (const ask of reading.asks) {
    if (ask.attachment) {
      attachments.push(ask.label)
      // An attachment is never "answered" by text, so it is not counted as
      // one. It is a thing you have to go and find.
      continue
    }
    const found = ask.questionKind ? answerFor(live, ask.questionKind, null) : null
    if (found) {
      answered.push(ask.label)
      lines.push(`${upperFirst(ask.label)}:\n${found}`)
    } else {
      missing.push(ask.label)
      const marker = `[${ask.id}]`
      lines.push(`${upperFirst(ask.label)}: ${marker}`)
      gaps.push({
        marker,
        prompt: `They asked for ${ask.label} and nothing on file answers it. Write it here, and consider adding it to the artist database so the next one is filled in.`,
      })
    }
  }

  if (reading.asks.length === 0) {
    lines.push(NOTHING_RECOGNISED.marker)
    gaps.push(NOTHING_RECOGNISED)
  }

  const who = reply.fromName?.trim() || gig?.organizer?.trim()
  const greeting = who ? `Hi ${who},` : 'Hi,'
  const about = gig ? ` about ${gig.name}` : ''

  const body = [
    greeting,
    `Thanks for getting back to me${about}. Here is what you asked for.`,
    ...lines,
    attachments.length
      ? `Attached: ${attachments.join(', ')}.\n[attach them before sending — nothing is attached to a draft]`
      : null,
    'Let me know if you need anything else.',
    '[sign off]',
  ]
    .filter((p): p is string => Boolean(p))
    .join('\n\n')

  if (attachments.length) {
    gaps.push({
      marker: '[attach them before sending — nothing is attached to a draft]',
      prompt: `${attachments.length === 1 ? 'One file' : `${attachments.length} files`} to attach: ${attachments.join(', ')}. This app has no copy of any of them.`,
    })
  }
  gaps.push({ marker: '[sign off]', prompt: 'Your sign-off, in your own words.' })

  return {
    // "Re: Re: Re:" is what a thread looks like after three rounds. One is
    // enough, and a reply with no subject at all gets one that says what it
    // is rather than an empty line.
    subject: reply.subject?.trim()
      ? reply.subject.replace(/^\s*(?:re:\s*)*/i, 'Re: ')
      : `Re: ${gig?.name ?? 'your message'}`,
    body,
    asks: reading.asks,
    answered,
    missing,
    attachments,
    unrecognised: reading.unrecognised,
    gaps,
    approximate: input.approximate ?? false,
  }
}

function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
