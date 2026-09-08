/**
 * Reading what an organiser's reply actually says.
 *
 * Four things to recognise, and the ordering problem is the whole difficulty:
 * **every rejection opens by thanking you for applying.** LieLow's begins
 * "Thank you so much for sending your music our way"; Highlands' plain
 * acknowledgement begins "Thank you so much for submitting an artist
 * application". A first-match-wins rule that checks acknowledgement early
 * files every rejection under it, so this scores all four and takes the
 * strongest, and says `unclear` when two are close.
 *
 * Three things the real mailbox taught this module, none of which were in the
 * plan:
 *
 *  - **Rejections often avoid the word.** "Unfortunately" appears in none of
 *    the three real ones. What they say is "we won't be moving forward",
 *    "was not selected", "not able to make it work".
 *  - **A conditional is not a decision.** Highlands writes "if you don't hear
 *    from us by June, it means we weren't able to make it work this year".
 *    That sentence contains a rejection phrase and is not a rejection; it is an
 *    acknowledgement carrying a date. Sentences in that shape are read as
 *    acknowledgements and the date is surfaced separately.
 *  - **An invitation can be a question.** Festival du Voyageur's is "Wondering
 *    if you are available/interested to do an acoustic set on Feb 21st". A
 *    question mark is not evidence that information is being requested.
 *
 * Classification **proposes; it never transitions.** A wrong auto-transition
 * here tells you that you were rejected when you were not, so everything lands
 * as a suggestion carrying the sentence that triggered it.
 *
 * Pure. Nothing here reads the clock or the network.
 */

import type { GigStatus } from './gigStatus'

export type ReplyClass = 'acknowledged' | 'declined' | 'invited' | 'info_requested' | 'unclear'

export const REPLY_CLASS_LABELS: Record<ReplyClass, string> = {
  acknowledged: 'They received it',
  declined: 'They said no',
  invited: 'They want you',
  info_requested: 'They asked for something',
  unclear: 'Not sure',
}

/** What each reading would move the row to. `unclear` proposes nothing. */
const PROPOSES: Record<ReplyClass, GigStatus | null> = {
  acknowledged: 'acknowledged',
  declined: 'declined',
  invited: 'invited',
  info_requested: 'info_requested',
  unclear: null,
}

interface Pattern {
  kind: Exclude<ReplyClass, 'unclear'>
  re: RegExp
  points: number
}

/**
 * Weighted so a decision outranks the courtesy wrapped around it. An
 * acknowledgement phrase is worth little precisely because it appears in every
 * category — it is what a letter opens with, not what it says.
 */
const PATTERNS: Pattern[] = [
  // ── Declined. Phrased around not going forward far more often than around
  //    the word "unfortunately", which appears in none of the real three.
  { kind: 'declined', points: 10, re: /\b(?:will|we)\s?(?:'ll)?\s*not\s+be\s+(?:moving|going)\s+forward\b/i },
  { kind: 'declined', points: 10, re: /\bwon'?t\s+be\s+(?:moving|going)\s+forward\b/i },
  { kind: 'declined', points: 10, re: /\b(?:was|were)\s+not\s+selected\b/i },
  { kind: 'declined', points: 10, re: /\bnot\s+(?:been\s+)?selected\s+(?:for|to)\b/i },
  { kind: 'declined', points: 9, re: /\bunable\s+to\s+(?:offer|include|accept|programme|program)\b/i },
  { kind: 'declined', points: 9, re: /\bnot\s+able\s+to\s+(?:make\s+it\s+work|offer|include|accommodate|fit)\b/i },
  { kind: 'declined', points: 9, re: /\bwe\s+regret\b|\bregret\s+to\s+inform\b/i },
  { kind: 'declined', points: 8, re: /\b(?:were|was)\s+not\s+successful\b/i },
  { kind: 'declined', points: 8, re: /\bdecided\s+not\s+to\s+(?:include|proceed|move)\b/i },
  { kind: 'declined', points: 7, re: /\bunfortunately\b/i },
  { kind: 'declined', points: 6, re: /\bnot\s+able\s+to\s+bring\s+every\b/i },
  { kind: 'declined', points: 6, re: /\bkeep\s+you\s+in\s+mind\s+for\s+(?:next|future)\b/i },

  // ── Invited. Often a question, which is why info_requested must not simply
  //    key off a question mark.
  { kind: 'invited', points: 12, re: /\b(?:we'?d|we\s+would)\s+love\s+to\s+have\s+you\b/i },
  { kind: 'invited', points: 12, re: /\bpleased\s+to\s+(?:invite|offer)\b/i },
  { kind: 'invited', points: 12, re: /\bwe(?:'d| would)?\s+like\s+to\s+offer\s+you\b/i },
  { kind: 'invited', points: 11, re: /\byou(?:'ve| have)\s+been\s+(?:selected|chosen|accepted)\b/i },
  { kind: 'invited', points: 11, re: /\b(?:happy|delighted)\s+to\s+include\s+you\b/i },
  { kind: 'invited', points: 10, re: /\b(?:are\s+you|wondering\s+if\s+you(?:'re| are)?)\s+(?:available|interested)\b/i },
  { kind: 'invited', points: 10, re: /\bwe'?d\s+like\s+to\s+book\s+you\b/i },
  { kind: 'invited', points: 8, re: /\bcongratulations\b/i },
  { kind: 'invited', points: 8, re: /\boffer(?:ing)?\s+you\s+a\s+(?:slot|spot|set|showcase)\b/i },

  // ── Information requested. Asking for a thing, not merely asking.
  { kind: 'info_requested', points: 10, re: /\b(?:could|can|would)\s+you\s+(?:please\s+)?(?:send|share|provide|confirm|forward)\b/i },
  { kind: 'info_requested', points: 10, re: /\b(?:we|I)\s+(?:will\s+)?need\s+(?:you\s+to|your|a|the)\b/i },
  { kind: 'info_requested', points: 9, re: /\bplease\s+(?:send|complete|fill|sign|return|provide)\b/i },
  { kind: 'info_requested', points: 9, re: /\b(?:a\s+)?(?:few|couple\s+of)\s+questions\b/i },
  { kind: 'info_requested', points: 8, re: /\bwe'?re\s+missing\b|\bdidn'?t\s+receive\s+your\b/i },
  { kind: 'info_requested', points: 8, re: /\bbefore\s+we\s+can\s+(?:proceed|consider|finalise|finalize)\b/i },

  // ── Acknowledged. Deliberately cheap: this is how every letter opens.
  { kind: 'acknowledged', points: 4, re: /\bthank(?:s| you)(?:\s+so\s+much)?\s+for\s+(?:applying|submitting|your\s+(?:application|submission)|sending)\b/i },
  { kind: 'acknowledged', points: 4, re: /\bwe\s+have\s+received\s+your\b|\bwe'?ve\s+received\s+your\b/i },
  { kind: 'acknowledged', points: 4, re: /\b(?:application|submission|form\s+submission)\s+(?:received|confirmed)\b/i },
  { kind: 'acknowledged', points: 4, re: /\bonly\s+those\s+selected\s+will\s+be\s+contacted\b/i },
  { kind: 'acknowledged', points: 3, re: /\bcourtesy\s+update\b|\bwe'?re\s+(?:still\s+)?(?:reviewing|working\s+through)\b/i },
]

/**
 * "If you don't hear from us by June, it means we weren't able to make it
 * work." A rejection phrase inside one of these is a description of what
 * silence will mean, not news that it has happened.
 */
const CONDITIONAL_SILENCE =
  /\bif\s+you\s+(?:don'?t|do\s+not|haven'?t|have\s+not)\s+(?:hear|heard)\b|\bshould\s+you\s+not\s+hear\b|\bunless\s+you\s+hear\b/i

/** A date named beside that conditional — the day silence becomes a no. */
const SILENCE_DEADLINE =
  /\bby\s+((?:early|mid|late)\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\b(\s+\d{1,2})?(,?\s*\d{4})?/i

// ── Quoted material ───────────────────────────────────────────────────────────

const QUOTE_MARKERS = [
  /^\s*>/,
  /^\s*On\s.+\bwrote:\s*$/i,
  /^\s*-{2,}\s*Original Message\s*-{2,}/i,
  /^\s*_{5,}\s*$/,
  /^\s*From:\s.+/i,
  /^\s*Sent\s+(?:from|via)\s+form\s+submission/i,
]

/**
 * The message minus everything it is quoting.
 *
 * Classification reads only the top post: LieLow's rejection quotes the entire
 * original Squarespace form beneath it, and "Message: Hi! I'm a singer
 * songwriter…" is the artist's own words, not the organiser's.
 *
 * Matching still reads the whole body, on purpose — the quoted receipt is
 * often the only place the festival is named. Two questions, two texts.
 */
export function stripQuoted(body: string): string {
  const out: string[] = []
  for (const line of (body ?? '').split(/\r?\n/)) {
    if (QUOTE_MARKERS.some((re) => re.test(line))) break
    out.push(line)
  }
  return out.join('\n').trim()
}

/** Sentences, roughly. Newlines end one as surely as a full stop does. */
export function sentences(text: string): string[] {
  return text
    .split(/\r?\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0)
}

// ── The reading ───────────────────────────────────────────────────────────────

export interface ClassificationHit {
  kind: Exclude<ReplyClass, 'unclear'>
  points: number
  /** Quoted verbatim to the person. Never paraphrased. */
  sentence: string
  matched: string
}

export interface Classification {
  kind: ReplyClass
  /** `low` when the runner-up was close, or when nothing scored much. */
  confidence: 'high' | 'low'
  /** The sentence that decided it. */
  evidence: string | null
  hits: ClassificationHit[]
  /** What this reading would move the row to. Null for `unclear`. */
  proposes: GigStatus | null
  /** Things worth reading that did not decide it. */
  notes: string[]
  scores: Record<Exclude<ReplyClass, 'unclear'>, number>
}

/** Two readings closer than this is a message to read yourself. */
const DECISIVE_MARGIN = 4

export function classifyReply(body: string): Classification {
  const top = stripQuoted(body)
  const hits: ClassificationHit[] = []
  const notes: string[] = []
  const scores = { acknowledged: 0, declined: 0, invited: 0, info_requested: 0 }

  for (const sentence of sentences(top)) {
    const conditional = CONDITIONAL_SILENCE.test(sentence)

    if (conditional) {
      const when = sentence.match(SILENCE_DEADLINE)
      notes.push(
        when
          ? `Silence is the answer here: "${sentence}" — so treat ${when[0].replace(/^by\s+/i, '')} as the date it becomes a no.`
          : `Silence is the answer here: "${sentence}"`,
      )
      // The sentence still counts, but as the acknowledgement it is.
      scores.acknowledged += 4
      hits.push({ kind: 'acknowledged', points: 4, sentence, matched: 'conditional silence' })
      continue
    }

    for (const p of PATTERNS) {
      const m = sentence.match(p.re)
      if (!m) continue
      scores[p.kind] += p.points
      hits.push({ kind: p.kind, points: p.points, sentence, matched: m[0] })
    }
  }

  const ranked = (Object.keys(scores) as Array<keyof typeof scores>)
    .map((k) => ({ kind: k, score: scores[k] }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const runnerUp = ranked[1]

  if (best.score === 0) {
    return { kind: 'unclear', confidence: 'low', evidence: null, hits, proposes: null, notes, scores }
  }

  const clear = best.score - runnerUp.score >= DECISIVE_MARGIN
  const kind: ReplyClass = clear ? best.kind : 'unclear'

  // The highest-scoring sentence of the winning kind, because that is the one
  // a person needs to read to agree or disagree.
  const evidence =
    hits
      .filter((h) => h.kind === (clear ? best.kind : ranked[0].kind))
      .sort((a, b) => b.points - a.points)[0]?.sentence ?? null

  if (!clear) {
    notes.push(
      `Reads as both ${REPLY_CLASS_LABELS[best.kind].toLowerCase()} and ` +
        `${REPLY_CLASS_LABELS[runnerUp.kind].toLowerCase()} — worth reading yourself.`,
    )
  }

  return {
    kind,
    confidence: clear && best.score >= 8 ? 'high' : 'low',
    evidence,
    hits,
    proposes: PROPOSES[kind],
    notes,
    scores,
  }
}
