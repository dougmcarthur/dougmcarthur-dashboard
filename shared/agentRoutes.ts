/**
 * What an issued agent token may do: read what research needs to avoid a
 * duplicate, file new rows, and log its own run. Nothing else.
 *
 * The CI runner never needed this written down, because its model only ever
 * held named tools and the script made every request. A Claude Code routine is
 * different in the one way that matters: it has a shell, and the cloud
 * environment's API credential is attached by Anthropic's proxy to *any*
 * request for this host. A festival page that talked the session into
 * `curl -X DELETE /api/gigs/12` would arrive authenticated. Keeping the token
 * out of the session stops it leaking; only the Worker can stop it being used
 * for something else. See docs/agent-routines.md.
 *
 * Applied to tokens issued into `agent_tokens`, not to the legacy `API_TOKEN`.
 * That secret is held by the GitHub Actions runner, which has no shell, and by
 * the route tests, which use it to reach every router — and it is due to be
 * removed before a second artist exists (src/lib/actor.ts). Anything handed to
 * a session that reads untrusted pages gets an issued token.
 *
 * Exact paths, never prefixes: `/api/gigs` must not admit `/api/gigs/12`, and
 * `POST /api/sync` must not admit `POST /api/sync/reconcile`.
 */
export const AGENT_ROUTES = [
  { method: 'GET', path: '/api/reference-docs' },
  { method: 'GET', path: '/api/gigs' },
  { method: 'GET', path: '/api/sync' },
  { method: 'POST', path: '/api/gigs' },
  { method: 'POST', path: '/api/sync' },
  { method: 'POST', path: '/api/promo' },
  { method: 'POST', path: '/api/task-runs' },
] as const

export function agentMayCall(method: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const verb = method.toUpperCase()
  return AGENT_ROUTES.some((route) => route.method === verb && route.path === path)
}
