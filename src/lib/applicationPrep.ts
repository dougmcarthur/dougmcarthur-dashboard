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

import {
  chooseFormLink,
  findApplicationLinks,
  parseApplicationForm,
  type BlockedKind,
  type ParsedField,
} from './formParser'
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
  /** Why a blocked read was blocked, so the caller need not read the note. */
  blockedKind?: BlockedKind
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

/**
 * Read the form at `url`. When that page turns out not to be the form but
 * links to one — the festival's artist-info page with an Apply button, which
 * is the address most listings carry — follow that link, once.
 */
export async function readApplicationForm(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PrepOutcome> {
  return readPage(url, fetchImpl, true)
}

async function readPage(url: string, fetchImpl: typeof fetch, mayFollow: boolean): Promise<PrepOutcome> {
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
  const landed = res.url || url
  const parsed = parseApplicationForm(html, landed)

  if (parsed.blockedReason || parsed.fields.length === 0) {
    const blocked: PrepOutcome = {
      status: 'blocked',
      note: parsed.blockedReason ?? 'No form fields were found on the page.',
      title: parsed.title,
      fields: [],
      url: landed,
      blockedKind: parsed.blockedKind ?? 'no-fields',
    }
    return mayFollow && blocked.blockedKind === 'no-fields'
      ? ((await followApplyLink(html, landed, blocked, fetchImpl)) ?? blocked)
      : blocked
  }

  return { status: 'ready', note: null, title: parsed.title, fields: parsed.fields, url: landed }
}

/**
 * A page with no form on it, so look for the link to one. Returns null when
 * there is nothing worth following, and the original outcome stays.
 *
 * One hop, and only when one link clearly stands out. Two buttons that both
 * say Apply is a question for the artist, and picking one stages answers
 * against what may be the volunteer form — so that case says so instead.
 */
async function followApplyLink(
  html: string,
  pageUrl: string,
  blocked: PrepOutcome,
  fetchImpl: typeof fetch,
): Promise<PrepOutcome | null> {
  const { link, candidates } = chooseFormLink(findApplicationLinks(html, pageUrl))

  if (!link) {
    if (candidates.length === 0) return null
    const names = candidates
      .slice(0, 3)
      .map((c) => `“${c.text || 'untitled link'}” (${new URL(c.url).hostname})`)
      .join(', ')
    return {
      ...blocked,
      note: `${blocked.note} It links to more than one possible form — ${names} — so add the address of the artist one by hand.`,
    }
  }

  const next = await readPage(link.url, fetchImpl, false)

  // A form is the answer, and so is a form behind a login or drawn by
  // JavaScript: those are facts about this opportunity, and more useful to
  // record than "no fields on the announcement". The address it landed on is
  // what gets saved against the gig.
  if (next.status === 'ready' || next.blockedKind === 'login' || next.blockedKind === 'javascript') return next

  return {
    ...blocked,
    note: `${blocked.note} Its “${link.text || 'apply'}” link went to ${link.url}, which could not be read as a form: ${next.note}`,
  }
}
