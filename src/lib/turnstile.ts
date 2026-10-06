/**
 * Cloudflare Turnstile, server side: whether the token a page produced is real.
 *
 * Deliberately sends **only the secret and the token**. Turnstile accepts the
 * visitor's IP address as an optional extra to sharpen its verdict, and this does
 * not pass it: the survey's notice says the Worker never receives or keeps an
 * address, and reading one to forward it would make that untrue. Cloudflare sees
 * the visitor's address anyway, while the widget runs, and the notice says so.
 *
 * Fails closed on a refusal and open on an outage. A token Cloudflare rejects is
 * a bot or a replay, and is refused. Cloudflare being unreachable says nothing
 * about the visitor, and refusing every respondent because a third party had a
 * bad minute would be a poor trade for a survey, so an unreachable check lets
 * the response through — still behind the honeypot and the global rate caps.
 */

const SITE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 4_000

export type TurnstileVerdict = 'passed' | 'failed' | 'unavailable'

export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnstileVerdict> {
  if (!token) return 'failed'
  try {
    const res = await fetchImpl(SITE_VERIFY, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return 'unavailable'
    const body = (await res.json()) as { success?: boolean }
    return body.success === true ? 'passed' : 'failed'
  } catch {
    return 'unavailable'
  }
}
