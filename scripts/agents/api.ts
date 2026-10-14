/**
 * The Scout API, as the research agents see it.
 *
 * Narrow and typed on purpose. The agents get named operations — list gigs,
 * create a gig — and never a general "make an HTTP request" tool, because a
 * general tool is one prompt injection away from `DELETE /api/gigs/12`. A
 * festival page is untrusted text written by somebody else, and these agents
 * read a lot of festival pages.
 *
 * Everything here authenticates with the bearer token in `SCOUT_API_TOKEN`,
 * which holds an agent token issued from Settings: scoped to one artist,
 * revocable, and limited by the Worker to shared/agentRoutes.ts. See
 * `docs/passkey-login.md` for why the agents need a token at all.
 */

import { SOURCE_LABELS, type MergedShow, type ShowSource } from '../../shared/showMerge'

export interface ApiConfig {
  baseUrl: string
  /**
   * Empty in a Claude Code routine, where the session never holds the token:
   * the cloud environment stores it as an API credential and Anthropic's proxy
   * adds the header after the request leaves. See scripts/agents/cli.ts.
   */
  token: string
  /** When false, writes are logged and not sent. See scripts/agents/run.ts. */
  apply: boolean
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export const DEFAULT_BASE_URL = 'https://scout.sundogsmusic.ca'

/**
 * The Worker's origin, from `SCOUT_API_URL` or the production default.
 *
 * `||`, not `??`. GitHub Actions renders an unset repository variable as an
 * empty string rather than leaving it out, and `??` only falls back on
 * undefined — so the first run from CI went out with a base URL of "" and died
 * on `Failed to parse URL from /api/task-runs`.
 */
export function resolveBaseUrl(value: string | undefined): string {
  return (value || DEFAULT_BASE_URL).replace(/\/$/, '')
}

async function request<T>(cfg: ApiConfig, path: string, init?: RequestInit): Promise<T> {
  // No header at all when there is no token, rather than `Bearer ` with
  // nothing after it: that is a credential the Worker refuses, sitting where
  // the proxy's would go.
  const auth: Record<string, string> = cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}
  const res = await fetch(`${cfg.baseUrl}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...auth,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, `${init?.method ?? 'GET'} /api${path} → ${res.status} ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

/**
 * What the agent is shown about an existing row.
 *
 * Deliberately not the whole record. A gig row averages 1.8 KB, almost all of
 * it `fit_notes` prose the agent wrote itself on a previous run — sending 34
 * of those back is thousands of tokens spent re-reading its own homework. The
 * question these answer is "have I already got this one?", and name, URL and
 * status settle it.
 */
export interface ExistingRow {
  id: number
  name: string
  url: string | null
  status: string | null
  deadline: string | null
}

function compact(row: Record<string, unknown>): ExistingRow {
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    url: (row.url as string) ?? null,
    status: (row.status as string) ?? null,
    deadline: (row.deadline as string) ?? null,
  }
}

/**
 * A gig that has a stage date on it.
 *
 * Only those rows carry the extra three fields, so the list stays the size it
 * was for the research agents: a row nobody has put show dates on is a lead,
 * and what the check-in needs to know about a lead is that it exists. The
 * promo check-in is told to write about a show, and without these it could
 * only guess one from a name and a `booked` status. `status` is still the
 * word that says whether the dates are confirmed — the dates alone are not.
 */
export interface ExistingGig extends ExistingRow {
  performanceStart?: string
  performanceEnd?: string | null
  location?: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function compactGig(row: Record<string, unknown>): ExistingGig {
  const base = compact(row)
  const start = text(row.performanceStart)
  if (!start) return base
  return { ...base, performanceStart: start, performanceEnd: text(row.performanceEnd), location: text(row.location) }
}

export async function listGigs(cfg: ApiConfig): Promise<ExistingGig[]> {
  const rows = await request<Array<Record<string, unknown>>>(cfg, '/gigs')
  return rows.map(compactGig)
}

export async function listSyncTargets(cfg: ApiConfig): Promise<ExistingRow[]> {
  const rows = await request<Array<Record<string, unknown>>>(cfg, '/sync')
  return rows.map(compact)
}

/**
 * An earlier promo draft, as the check-in sees it.
 *
 * Without this the monthly run starts every month not knowing what it wrote the
 * last one: a single announcement still sitting at `draft` gets drafted again.
 * `status` is the only account it gets of what the artist did with a draft
 * (`draft` unread, `approved` liked, `published` posted), so it travels; the
 * body does not, because a title and the opening of the copy settle "have I
 * written about this" and a year of full drafts would not.
 */
export interface ExistingPromoDraft {
  id: number
  month: string
  title: string
  status: string | null
  createdAt: string | null
  opening: string
}

export const PROMO_OPENING_CHARS = 160

/** The first words of a draft, on one line, cut at a word. */
function opening(content: unknown): string {
  const flat = String(content ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= PROMO_OPENING_CHARS) return flat
  const cut = flat.slice(0, PROMO_OPENING_CHARS)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trimEnd()}...`
}

export async function listPromoDrafts(cfg: ApiConfig): Promise<ExistingPromoDraft[]> {
  const rows = await request<Array<Record<string, unknown>>>(cfg, '/promo')
  return rows.map((row) => ({
    id: Number(row.id),
    month: String(row.month ?? ''),
    title: String(row.title ?? ''),
    status: (row.status as string) ?? null,
    createdAt: (row.createdAt as string) ?? null,
    opening: opening(row.content),
  }))
}

/**
 * A show, as the promo check-in sees it.
 *
 * `/api/shows` folds Bandsintown, the Manitoba Music profile and calendar, and
 * the gigs booked in Scout into one row per night. What it keeps that the
 * agent has a use for is where each show is listed (a show on the province's
 * calendar and nowhere the artist keeps is a post waiting to be written) and
 * which listings it is missing from. Everything else the screen uses to draw a
 * row (a React key, a gig id, every source's link) stays behind.
 */
export interface ShowForPromo {
  date: string
  time: string | null
  title: string | null
  venue: string | null
  location: string | null
  withArtists: string[]
  /** A ticket link when one exists, else an event page. */
  link: string | null
  linkIsTickets: boolean
  /** Where it is listed, by name: "Booked in Scout", "Bandsintown", ... */
  listedOn: string[]
  /** Listings the artist keeps that an upcoming show is not on. */
  missingFrom: string[]
}

export interface ShowList {
  /** The date the list was cut at, so "upcoming" has an anchor. */
  today: string
  upcoming: ShowForPromo[]
  /** Shows in the last `RECENT_SHOW_DAYS` days, newest first. */
  recent: ShowForPromo[]
  /**
   * Which sources answered. A source that failed is reported here and does not
   * fail the list, so a short list with a failed source is not the whole story.
   */
  sources: Array<{ source: string; status: string; note: string | null }>
}

/** Far enough back for a thank-you after a show, not a year of Bandsintown history. */
export const RECENT_SHOW_DAYS = 45

function daysBefore(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function forPromo(show: MergedShow): ShowForPromo {
  return {
    date: show.date,
    time: show.time,
    title: show.title,
    venue: show.venue,
    location: show.location,
    withArtists: show.withArtists,
    link: show.ticketUrl ?? show.links[0]?.url ?? null,
    linkIsTickets: show.ticketUrl !== null,
    listedOn: show.sources.map((s) => SOURCE_LABELS[s]),
    missingFrom: show.missingFrom.map((s) => SOURCE_LABELS[s]),
  }
}

/**
 * Cut at the UTC date. The route would default to the same one; it is stated
 * here so the list carries the date it was cut at. The monthly run fires at
 * 12:00 UTC, which is morning in Winnipeg, so UTC and local agree.
 */
export async function listShows(cfg: ApiConfig, now: Date = new Date()): Promise<ShowList> {
  const today = now.toISOString().slice(0, 10)
  const body = await request<{
    upcoming: MergedShow[]
    past: MergedShow[]
    sources: Array<{ source: string; status: string; note: string | null }>
  }>(cfg, `/shows?today=${today}`)
  const since = daysBefore(today, RECENT_SHOW_DAYS)
  return {
    today,
    upcoming: body.upcoming.map(forPromo),
    recent: body.past.filter((s) => s.date >= since).map(forPromo),
    sources: body.sources.map(({ source, status, note }) => ({ source: SOURCE_LABELS[source as ShowSource] ?? source, status, note })),
  }
}

export async function listReferenceDocs(
  cfg: ApiConfig,
): Promise<Array<{ id: string; title: string; content: string }>> {
  return request(cfg, '/reference-docs')
}

/** A write, or a description of the write that would have happened. */
export interface WriteResult {
  created: boolean
  id?: number
  wouldHave?: string
}

async function create(cfg: ApiConfig, path: string, body: unknown, label: string): Promise<WriteResult> {
  if (!cfg.apply) {
    console.log(`  [dry run] would POST /api${path}: ${label}`)
    return { created: false, wouldHave: label }
  }
  const { id } = await request<{ id: number }>(cfg, path, { method: 'POST', body: JSON.stringify(body) })
  console.log(`  created /api${path} #${id}: ${label}`)
  return { created: true, id }
}

export const createGig = (cfg: ApiConfig, body: Record<string, unknown>) =>
  create(cfg, '/gigs', body, String(body.name))

export const createSyncTarget = (cfg: ApiConfig, body: Record<string, unknown>) =>
  create(cfg, '/sync', body, String(body.name))

export const createPromoDraft = (cfg: ApiConfig, body: Record<string, unknown>) =>
  create(cfg, '/promo', body, String(body.title))

/** Stage plots and tech riders in the artist's library that nobody has read yet. */
export async function listDocumentsToRead(
  cfg: ApiConfig,
): Promise<Array<{ assetId: number; label: string; url: string }>> {
  const { documents } = await request<{ documents: Array<{ assetId: number; label: string; url: string }> }>(
    cfg,
    '/document-readings/pending',
  )
  return documents
}

/** A transcription of one document, filed against the library entry it came from. */
export async function fileDocumentReading(
  cfg: ApiConfig,
  body: { assetId: number; url: string; text: string },
): Promise<WriteResult> {
  if (!cfg.apply) {
    console.log(`  [dry run] would file a reading of document #${body.assetId}`)
    return { created: false, wouldHave: `reading of #${body.assetId}` }
  }
  const { id } = await request<{ id: number }>(cfg, '/document-readings', { method: 'POST', body: JSON.stringify(body) })
  console.log(`  filed a reading of document #${id}`)
  return { created: true, id }
}

/**
 * The run's own heartbeat.
 *
 * Posted by the script rather than offered to the agent as a tool, and that is
 * the whole point: a confused or crashed agent that forgot to call it would
 * leave no trace, which is exactly the invisibility that let three schedules
 * die unnoticed for a month. `shared/taskCadence.ts` measures cadence from
 * these rows, so the heartbeat has to be something the agent cannot skip.
 */
export async function logRun(
  cfg: ApiConfig,
  run: { taskId: string; status: string; summary: string; itemsAdded: number },
): Promise<void> {
  if (!cfg.apply) {
    console.log(`  [dry run] would log run: ${run.taskId} ${run.status} (+${run.itemsAdded})`)
    return
  }
  await request(cfg, '/task-runs', {
    method: 'POST',
    body: JSON.stringify({
      task_id: run.taskId,
      status: run.status,
      summary: run.summary.slice(0, 4000),
      items_added: run.itemsAdded,
    }),
  })
}
