import type { MiddlewareHandler } from 'hono'

/**
 * One line in and one line out per request, with the path and never the query.
 *
 * This was Hono's `logger()`, which prints `url.slice(url.indexOf('/', 8))` —
 * everything after the host, query string included. On the Google OAuth
 * callback that string is `?state=…&code=4/0A…`, so every connect wrote a live
 * authorization code into `wrangler tail` and Workers Logs. The code is single
 * use and spent within seconds, which kept the damage small, but a credential
 * has no business in a log line: it is the rule that put the invitation token
 * in the URL fragment, applied to the one URL this app does not get to shape,
 * because Google chooses where the code goes.
 *
 * Stripped everywhere rather than on the callback alone. A query string is
 * where the next credential will arrive by accident, and a list of routes whose
 * query is safe to print is a list somebody has to remember to extend.
 * `test/requestLog.test.ts` fails if `hono/logger` comes back.
 *
 * The format is the one `logger()` had, minus the ANSI colour on the status.
 */
export function logLine(
  direction: '<--' | '-->',
  method: string,
  path: string,
  outcome?: { status: number; ms: number },
): string {
  const head = `${direction} ${method} ${path}`
  if (!outcome) return head
  const elapsed = outcome.ms < 1000 ? `${outcome.ms}ms` : `${Math.round(outcome.ms / 1000)}s`
  return `${head} ${outcome.status} ${elapsed}`
}

export function requestLog(print: (line: string) => void = console.log): MiddlewareHandler {
  return async (c, next) => {
    // `c.req.path` is the pathname alone; `c.req.url` is what leaked.
    const { method, path } = c.req
    print(logLine('<--', method, path))
    const start = Date.now()
    await next()
    print(logLine('-->', method, path, { status: c.res.status, ms: Date.now() - start }))
  }
}
