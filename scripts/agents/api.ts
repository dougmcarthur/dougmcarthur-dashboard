/**
 * The Scout API, as the research agents see it.
 *
 * Narrow and typed on purpose. The agents get named operations — list gigs,
 * create a gig — and never a general "make an HTTP request" tool, because a
 * general tool is one prompt injection away from `DELETE /api/gigs/12`. A
 * festival page is untrusted text written by somebody else, and these agents
 * read a lot of festival pages.
 *
 * Everything here authenticates with the bearer token from `API_TOKEN`. That
 * is the credential the middleware in `src/index.ts` checks; see
 * `docs/passkey-login.md` for why the agents have one at all.
 */

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

export async function listGigs(cfg: ApiConfig): Promise<ExistingRow[]> {
  const rows = await request<Array<Record<string, unknown>>>(cfg, '/gigs')
  return rows.map(compact)
}

export async function listSyncTargets(cfg: ApiConfig): Promise<ExistingRow[]> {
  const rows = await request<Array<Record<string, unknown>>>(cfg, '/sync')
  return rows.map(compact)
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
