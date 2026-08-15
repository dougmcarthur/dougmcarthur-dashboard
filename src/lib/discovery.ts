// Finds new gig and sync opportunities on a schedule, server-side.
//
// Two Claude calls per sweep, deliberately:
//   1. Research — web search runs on Anthropic's infrastructure, so the Worker
//      makes one HTTPS call rather than crawling anything itself.
//   2. Extract — the research prose is turned into typed rows with structured
//      outputs. (Structured outputs and the citations that come back from web
//      search can't be combined in one call, hence the split — and it keeps the
//      extraction step a pure function of text, which is testable.)
//
// Everything then passes a dedupe and quality gate before it reaches the review
// queue: a discovery sweep that floods `pending_review` with near-misses makes
// the queue meaningless.

import Anthropic from '@anthropic-ai/sdk'
import type { ArtistProfile } from './answerEngine'

export type DiscoveryKind = 'gigs' | 'sync'

const RESEARCH_MODEL = 'claude-opus-5'
const EXTRACT_MODEL = 'claude-sonnet-5'

/** Never add more than this many rows from one sweep. */
export const MAX_NEW_PER_RUN = 8
/** Below this fit score a find isn't worth your review time. */
export const MIN_FIT_SCORE = 3

export interface GigCandidate {
  name: string
  type: string
  organizer?: string | null
  url: string
  applicationUrl?: string | null
  submissionOpensAt?: string | null
  deadline?: string | null
  feeAmount?: number | null
  paid?: boolean
  loginRequired?: boolean
  fitScore: number
  fitRationale: string
  sourceNote?: string | null
}

export interface SyncCandidate {
  name: string
  agencyType?: string | null
  contactEmail?: string | null
  contactRole?: string | null
  url: string
  fitScore: number
  fitRationale: string
  sourceNote?: string | null
}

export type Candidate = GigCandidate | SyncCandidate

export interface ExistingRow {
  name: string
  url?: string | null
}

// ── Dedupe ────────────────────────────────────────────────────────────────────

/** "SXSW Music Festival 2027" and "sxsw music festival" are the same thing. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, '') // year suffixes
    .replace(/\b(the|a|an|music|festival|fest|showcase|competition|series)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

/** Compares by registrable-ish host, so a deep link matches its home page. */
export function normaliseHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

export function isDuplicate(candidate: { name: string; url?: string | null }, existing: ExistingRow[]): boolean {
  const name = normaliseName(candidate.name)
  const host = normaliseHost(candidate.url)

  return existing.some((row) => {
    if (name && normaliseName(row.name) === name) return true
    const rowHost = normaliseHost(row.url)
    return !!host && !!rowHost && host === rowHost
  })
}

export interface GateResult<T> {
  accepted: T[]
  rejected: Array<{ name: string; reason: string }>
}

/**
 * The quality gate. Order matters for the reasons reported back: a duplicate is
 * more useful to know about than a low score on something you already track.
 */
export function gateCandidates<T extends { name: string; url: string; fitScore: number }>(
  candidates: T[],
  existing: ExistingRow[],
  { maxNew = MAX_NEW_PER_RUN, minFit = MIN_FIT_SCORE } = {},
): GateResult<T> {
  const accepted: T[] = []
  const rejected: Array<{ name: string; reason: string }> = []
  const seenThisRun: ExistingRow[] = []

  const ranked = [...candidates].sort((a, b) => b.fitScore - a.fitScore)

  for (const candidate of ranked) {
    if (!candidate.name?.trim() || !candidate.url?.trim()) {
      rejected.push({ name: candidate.name || '(unnamed)', reason: 'missing a name or link' })
      continue
    }
    if (isDuplicate(candidate, existing) || isDuplicate(candidate, seenThisRun)) {
      rejected.push({ name: candidate.name, reason: 'already tracked' })
      continue
    }
    if ((candidate.fitScore ?? 0) < minFit) {
      rejected.push({ name: candidate.name, reason: `fit ${candidate.fitScore}/5` })
      continue
    }
    if (accepted.length >= maxNew) {
      rejected.push({ name: candidate.name, reason: 'over the per-run cap' })
      continue
    }
    accepted.push(candidate)
    seenThisRun.push({ name: candidate.name, url: candidate.url })
  }

  return { accepted, rejected }
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const GIG_BRIEF = `Find live-performance opportunities this artist could realistically apply to: festivals, showcases, songwriter competitions, artist residencies, conference showcases, and listening-room or concert-series bookings.

Prioritise: Canadian and northern-US opportunities within reach of Winnipeg, folk/singer-songwriter/alt-pop programming, and anything with an open or upcoming submission window. Include a few larger reach opportunities if the fit is genuinely good.

Skip: pay-to-play showcases with no audience, anything whose submission window has already closed, and opportunities aimed at genres well outside this artist's.`

const SYNC_BRIEF = `Find music licensing and sync opportunities: music supervisors accepting submissions, sync agencies and libraries open to new writers, briefs and calls for songs, and production-music companies whose catalogue fits this artist.

Prioritise: those explicitly open to unsolicited or new-writer submissions, with a stated contact route, and whose roster or catalogue matches this artist's sound.

Skip: exclusive-only libraries with no submission route, obvious content mills, and anything requiring an upfront fee.`

function researchPrompt(kind: DiscoveryKind, profile: ArtistProfile, existing: ExistingRow[]): string {
  const brief = kind === 'gigs' ? GIG_BRIEF : SYNC_BRIEF
  const tracked = existing
    .slice(0, 120)
    .map((r) => `- ${r.name}`)
    .join('\n')

  return `${brief}

Search the web for current, live opportunities. Today's date matters: only report things that are open now or open in the future, and give the dates you actually find rather than guessing.

Already tracked — don't report these again:
${tracked || '(nothing tracked yet)'}

For each opportunity you find, note: the name, what it is, who runs it, the URL, the direct application link if there is one, when submissions open and close, any entry fee, and whether applying needs an account login. Say plainly where each date came from, and flag any you couldn't confirm.

Then give each one a fit score out of 5 against the artist profile below, with one sentence of reasoning. Be honest — a 2 that you explain is more useful than an inflated 4.

Artist profile:

${profile.text.slice(0, 20_000)}`
}

const GIG_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          organizer: { type: 'string' },
          url: { type: 'string' },
          applicationUrl: { type: 'string' },
          submissionOpensAt: { type: 'string' },
          deadline: { type: 'string' },
          feeAmount: { type: 'number' },
          paid: { type: 'boolean' },
          loginRequired: { type: 'boolean' },
          fitScore: { type: 'integer' },
          fitRationale: { type: 'string' },
          sourceNote: { type: 'string' },
        },
        required: ['name', 'type', 'url', 'fitScore', 'fitRationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
} as const

const SYNC_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          agencyType: { type: 'string' },
          contactEmail: { type: 'string' },
          contactRole: { type: 'string' },
          url: { type: 'string' },
          fitScore: { type: 'integer' },
          fitRationale: { type: 'string' },
          sourceNote: { type: 'string' },
        },
        required: ['name', 'url', 'fitScore', 'fitRationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
} as const

const EXTRACT_PROMPT = `Turn the research notes below into structured rows.

Rules:
- One row per opportunity. Don't invent anything that isn't in the notes.
- Dates must be YYYY-MM-DD. If the notes give only a month or a vague phrase ("early spring"), leave the date out and say so in sourceNote.
- Leave a field out entirely rather than guessing at it.
- fitScore and fitRationale come from the notes; don't re-score.
- sourceNote: where the information came from and anything unconfirmed.

Research notes:

`

// ── The sweep ─────────────────────────────────────────────────────────────────

export interface DiscoveryRun {
  kind: DiscoveryKind
  candidates: Candidate[]
  searchCount: number
  researchText: string
}

/** Step 1: research with web search. Returns prose plus a search count for cost tracking. */
export async function research(
  apiKey: string,
  kind: DiscoveryKind,
  profile: ArtistProfile,
  existing: ExistingRow[],
): Promise<{ text: string; searchCount: number }> {
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 16_000,
    output_config: { effort: 'medium' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 12 }],
    messages: [{ role: 'user', content: researchPrompt(kind, profile, existing) }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined the discovery research request')
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  return {
    text,
    searchCount: response.usage.server_tool_use?.web_search_requests ?? 0,
  }
}

/** Step 2: structured extraction. No tools, so structured outputs apply cleanly. */
export async function extractCandidates(
  apiKey: string,
  kind: DiscoveryKind,
  researchText: string,
): Promise<Candidate[]> {
  if (!researchText.trim()) return []

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 8_000,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: (kind === 'gigs' ? GIG_SCHEMA : SYNC_SCHEMA) as unknown as Record<string, unknown>,
      },
    },
    messages: [{ role: 'user', content: EXTRACT_PROMPT + researchText.slice(0, 60_000) }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  try {
    const parsed = JSON.parse(text) as { candidates: Candidate[] }
    return Array.isArray(parsed.candidates) ? parsed.candidates : []
  } catch {
    return []
  }
}

export async function discover(
  apiKey: string,
  kind: DiscoveryKind,
  profile: ArtistProfile,
  existing: ExistingRow[],
): Promise<DiscoveryRun> {
  const { text, searchCount } = await research(apiKey, kind, profile, existing)
  const candidates = await extractCandidates(apiKey, kind, text)
  return { kind, candidates, searchCount, researchText: text }
}
