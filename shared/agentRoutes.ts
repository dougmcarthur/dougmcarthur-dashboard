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
 * Applied to every agent. There used to be an exception — the shared
 * `API_TOKEN`, unlimited, held by the GitHub Actions runner and by the route
 * tests — and it was retired, so the runner holds an issued token too and the
 * route tests come in as a signed-in session instead.
 *
 * Exact paths, never prefixes: `/api/gigs` must not admit `/api/gigs/12`, and
 * `POST /api/sync` must not admit `POST /api/sync/reconcile`.
 */
export const AGENT_ROUTES = [
  { method: 'GET', path: '/api/reference-docs' },
  { method: 'GET', path: '/api/gigs' },
  { method: 'GET', path: '/api/sync' },
  // The promo check-in reads its own earlier drafts so it does not write the
  // same announcement twice. Drafts are the artist's own prose, the same kind
  // of thing `/api/reference-docs` already hands over.
  { method: 'GET', path: '/api/promo' },
  // Every show the artist has, from every place it is listed. The promo
  // check-in writes about shows that were never filed as a gig in Scout, and
  // this is where those live. It is a read of listings the artist already
  // publishes; the Bandsintown key is used inside the Worker and never returned.
  { method: 'GET', path: '/api/shows' },
  // The shared catalog: what is already in it, and a new entry. Research is
  // collected once for every artist, so it files here and not into anybody's
  // list. The route is the owner's agents only.
  { method: 'GET', path: '/api/catalog/known' },
  { method: 'POST', path: '/api/catalog' },
  { method: 'POST', path: '/api/gigs' },
  { method: 'POST', path: '/api/sync' },
  { method: 'POST', path: '/api/promo' },
  { method: 'POST', path: '/api/task-runs' },
  // The document reader: what is waiting, and a transcription of one file.
  // The write is checked against the artist's own library by the route.
  { method: 'GET', path: '/api/document-readings/pending' },
  { method: 'POST', path: '/api/document-readings' },
] as const

export function agentMayCall(method: string, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const verb = method.toUpperCase()
  return AGENT_ROUTES.some((route) => route.method === verb && route.path === path)
}
