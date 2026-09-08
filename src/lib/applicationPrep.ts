/**
 * Reading somebody else's application form.
 *
 * The parser (./formParser.ts) is pure and tested; this is the part that has
 * to touch the network, so it is kept thin and its one dependency — `fetch` —
 * is injectable. Everything it can learn short of the fields themselves is
 * still worth recording: a form behind a login is a *fact about the
 * opportunity*, not an error to retry, and one that means "set aside an hour
 * and an account" rather than "the app is broken".
 */

import { parseApplicationForm, type ParsedField } from './formParser'
import type { PrepStatus } from '../../shared/application'

export interface PrepOutcome {
  status: PrepStatus
  /** Shown verbatim. Null only when the read succeeded with fields. */
  note: string | null
  /** The form's own title, where the page had one. */
  title: string | null
  fields: ParsedField[]
  /** The URL actually read, after any redirect the fetch followed. */
  url: string
}

/** Long enough for a slow festival CMS, short enough not to hold a request. */
const TIMEOUT_MS = 12_000

/**
 * A browser-ish UA. Not evasion — several festival hosts serve a stub page to
 * an unrecognised agent, and a stub page parses as "no fields found", which
 * would report a readable form as empty.
 */
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
}

export function isReadableFormUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export async function readApplicationForm(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PrepOutcome> {
  if (!isReadableFormUrl(url)) {
    return { status: 'failed', note: `"${url}" is not a web address the form reader can open.`, title: null, fields: [], url }
  }

  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // Timeouts and DNS failures both land here, and neither says anything
    // about the opportunity — this is the one outcome worth retrying.
    return {
      status: 'failed',
      note: `Could not reach the form: ${err instanceof Error ? err.message : String(err)}`,
      title: null,
      fields: [],
      url,
    }
  }

  if (!res.ok) {
    // 403 and 404 are different stories and the number is the only thing that
    // tells them apart, so it is kept rather than smoothed into "failed".
    return {
      status: 'failed',
      note: `The form URL returned ${res.status} ${res.statusText || ''}`.trim() + '.',
      title: null,
      fields: [],
      url: res.url || url,
    }
  }

  const html = await res.text()
  const parsed = parseApplicationForm(html, res.url || url)

  if (parsed.blockedReason || parsed.fields.length === 0) {
    return {
      status: 'blocked',
      note: parsed.blockedReason ?? 'No form fields were found on the page.',
      title: parsed.title,
      fields: [],
      url: res.url || url,
    }
  }

  return { status: 'ready', note: null, title: parsed.title, fields: parsed.fields, url: res.url || url }
}
