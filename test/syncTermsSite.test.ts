import { describe, it, expect } from 'vitest'
import { asTenantId } from '../src/db/scope'
import {
  POLICY_PATHS,
  checkPendingTerms,
  checkTarget,
  htmlToText,
  isFetchable,
  relevantLinks,
  scanSite,
  siteOrigins,
} from '../src/lib/syncTerms'
import { UNREACHABLE } from '../shared/syncTerms'
import { agentMayCall } from '../shared/agentRoutes'
import { sqliteD1 } from './support/sqliteD1'

/**
 * Reading a target's own site, against a model of the one that started this.
 *
 * `https://imaginaryfriends.com/` redirects to a rebuilt site that says nothing
 * about submissions. `http://imaginaryfriends.com/about.html`, the old site, is
 * still up, nothing links to it, and it says "NO unsolicited material please."
 * The fixtures below keep that shape with invented names: the lesson is that a
 * read which only follows the home page's links would have filed the target as
 * fine.
 */

const NOW = '2026-10-07T09:00:00.000Z'
const TODAY = '2026-10-07'
const OWNER = asTenantId('tnt_0001')
const OTHER = asTenantId('tnt_0002')

const OLD_ABOUT = `<html><head><style>.style5 {font-size: 24px}</style></head><body><table><tr><td>
<p class="style6">ABOUT</p>
<p>It all began with Friends and their numerous collaborations &amp; side projects. We license to film, television, commercial and non-broadcast projects.</p>
<p>NO unsolicited material           please.</p>
<p>AVAILABLE:</p><ul><li>MASTER QUALITY SONGS</li><li>CUSTOM COMPOSITIONS</li></ul>
<p>Contact:<br>Beth Wernick</p></td></tr></table></body></html>`

const OLD_HOME = `<html><body><a href="main.asp"><img src="enter.gif"></a></body></html>`

// A script that happens to hold the phrase must not be read as the page saying it.
const NEW_HOME = `<html><head><script>var copy = "no unsolicited material"</script></head><body>
<nav><a href="/about-us">About</a> <a href="/contact-me">Contact</a> <a href="https://soundcloud.example/friends">Listen</a></nav>
<p>We license music to film and television.</p></body></html>`

type Entry = string | { status?: number; body?: string; redirectTo?: string; type?: string }

function fakeFetch(site: Record<string, Entry>, log: string[] = []): typeof fetch {
  const respond = (status: number, body: string, url: string, type = 'text/html; charset=utf-8') => {
    const res = new Response(body, { status, headers: { 'content-type': type } })
    // A constructed Response has no address; a fetched one reports where it landed.
    Object.defineProperty(res, 'url', { value: url })
    return res
  }
  return (async (input: unknown) => {
    log.push(String(input))
    let current = String(input)
    for (let hops = 0; hops < 4; hops++) {
      const entry = site[current] ?? site[current.replace(/\/$/, '')]
      if (!entry) return respond(404, '', current)
      const e = typeof entry === 'string' ? { body: entry } : entry
      if (e.redirectTo) {
        current = e.redirectTo
        continue
      }
      return respond(e.status ?? 200, e.body ?? '', current, e.type)
    }
    return respond(508, '', current)
  }) as typeof fetch
}

// The root redirects on every spelling; the old static files are still served on
// all of them. Both facts are from the real site, and the second is what a read
// that only follows redirects and links cannot see.
const REBUILT: Record<string, Entry> = {
  'https://friends.example/': { redirectTo: 'https://www.friends-music.example/' },
  'http://friends.example/': { redirectTo: 'https://www.friends-music.example/' },
  'https://www.friends-music.example/': NEW_HOME,
  'https://www.friends-music.example/about-us': '<p>About us. We license music.</p>',
  'https://www.friends-music.example/contact-me': '<p>Say hello.</p>',
  'https://friends.example/index.html': OLD_HOME,
  'https://friends.example/about.html': OLD_ABOUT,
  'http://friends.example/about.html': OLD_ABOUT,
}

describe('where a read starts', () => {
  it('takes a website and a contact address, each on both schemes', () => {
    expect(siteOrigins({ website: 'https://www.friends-music.example/about', contactEmail: 'Beth@Friends.example' })).toEqual([
      'https://www.friends-music.example',
      'http://www.friends-music.example',
      'https://friends.example',
      'http://friends.example',
    ])
  })

  it('does not count one host twice', () => {
    expect(siteOrigins({ website: 'friends.example', contactEmail: 'beth@friends.example' })).toEqual([
      'https://friends.example',
      'http://friends.example',
    ])
  })

  it('has nothing to read for a webmail address and no website', () => {
    for (const email of ['doug@gmail.com', 'beth@hotmail.com', 'x@shaw.ca', 'x@yahoo.ca', null, 'not an address']) {
      expect(siteOrigins({ contactEmail: email }), String(email)).toEqual([])
    }
  })

  it('never asks for an address that is not somebody\'s public website', () => {
    for (const bad of ['http://localhost/', 'https://10.0.0.5/', 'https://[::1]/', 'http://intranet/', 'https://router.local/', 'https://x.example:8443/', 'ftp://x.example/']) {
      expect(isFetchable(bad), bad).toBe(false)
    }
    expect(isFetchable('https://friends.example/about.html')).toBe(true)
    expect(siteOrigins({ website: 'http://169.254.169.254/' })).toEqual([])
  })
})

describe('reading a page', () => {
  it('keeps the words and drops the markup, scripts and styles', () => {
    const text = htmlToText(OLD_ABOUT)
    expect(text).toContain('NO unsolicited material please.')
    expect(text).toContain('collaborations & side projects')
    expect(text).not.toContain('font-size')
    expect(htmlToText(NEW_HOME)).not.toContain('no unsolicited')
  })

  it('follows submission links first, then the rest, and only on the same site', () => {
    const html = `<a href="/about">About us</a> <a href="/submit-music">Send music</a>
      <a href="https://spotify.example/x">About on Spotify</a> <a href="mailto:a@b.example">Contact</a>
      <a href="#top">Contact</a> <a href="/faq.html">FAQ</a> <a href="/shop">Shop</a>`
    const links = relevantLinks(html, 'https://friends.example/')
    expect(links.submission).toEqual(['https://friends.example/submit-music'])
    expect(links.other).toEqual(['https://friends.example/about', 'https://friends.example/faq.html'])
  })
})

describe('scanning a site for its rules', () => {
  it('finds a refusal on an old page that nothing links to and the rebuilt site never mentions', async () => {
    const scan = await scanSite({ contactEmail: 'beth@friends.example' }, fakeFetch(REBUILT))
    expect(scan.closed).toMatchObject({
      policy: 'closed',
      quote: 'NO unsolicited material please.',
      url: 'https://friends.example/about.html',
    })
    expect(scan.pagesRead).toBeGreaterThanOrEqual(4)
  })

  it('asks the other scheme when the first does not answer', async () => {
    const calls: string[] = []
    const httpOnly = {
      'http://friends.example/': { redirectTo: 'https://www.friends-music.example/' },
      'https://www.friends-music.example/': NEW_HOME,
      'http://friends.example/about.html': OLD_ABOUT,
    }
    const scan = await scanSite({ contactEmail: 'beth@friends.example' }, fakeFetch(httpOnly, calls))
    expect(scan.closed?.url).toBe('http://friends.example/about.html')
  })

  it('guesses once per host, not once per spelling of it', async () => {
    const calls: string[] = []
    await scanSite({ contactEmail: 'beth@friends.example' }, fakeFetch(REBUILT, calls))
    expect(calls.filter((url) => url.endsWith('/about.html'))).toEqual(['https://friends.example/about.html'])
  })

  it('is the convention that finds it: the home page links to nothing that says no', async () => {
    // The control. Without the conventional paths the old page is unreachable,
    // which is the gap this test exists to keep closed.
    const calls: string[] = []
    await scanSite({ contactEmail: 'beth@friends.example' }, fakeFetch(REBUILT, calls))
    expect(POLICY_PATHS).toContain('/about.html')
    expect(calls).toContain('https://friends.example/about.html')
  })

  it('does not wander off the site, and does not ask for more than a person would open', async () => {
    const calls: string[] = []
    await scanSite({ contactEmail: 'beth@friends.example' }, fakeFetch(REBUILT, calls))
    expect(calls.some((url) => url.includes('soundcloud'))).toBe(false)
    expect(calls.length).toBeLessThanOrEqual(20)
  })

  it('says what it read, and not "fine", when no page states a policy', async () => {
    const site = {
      'https://calm.example/': '<a href="/about">About</a><p>We place music in film.</p>',
      'https://calm.example/about': '<p>A small library in Vancouver.</p>',
    }
    const scan = await scanSite({ contactEmail: 'x@calm.example' }, fakeFetch(site))
    expect(scan.closed).toBeNull()
    expect(scan.open).toBeNull()
    expect(scan.note).toMatch(/^Read 2 pages on calm\.example\./)
    expect(scan.note).toMatch(/None says whether/)
  })

  it('keeps the refusal when another page invites submissions', async () => {
    const site = {
      'https://mixed.example/': '<a href="/submit">Submit</a><a href="/about">About</a>',
      'https://mixed.example/submit': '<p>Submit your music through the form below.</p>',
      'https://mixed.example/about': '<p>No unsolicited material please.</p>',
    }
    const scan = await scanSite({ contactEmail: 'x@mixed.example' }, fakeFetch(site))
    expect(scan.open?.policy).toBe('open')
    expect(scan.closed?.url).toBe('https://mixed.example/about')
  })

  it('reports an invitation with the page it was on', async () => {
    const site = { 'https://open.example/submit': '<p>We welcome unsolicited submissions from independent artists.</p>' }
    const scan = await scanSite({ website: 'https://open.example' }, fakeFetch({ 'https://open.example/': '<a href="/submit">Submit</a>', ...site }))
    expect(scan.open).toMatchObject({ quote: 'We welcome unsolicited submissions from independent artists.', url: 'https://open.example/submit' })
  })

  it('reports a site that could not be opened as exactly that, never as silence', async () => {
    const down = (async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const scan = await scanSite({ contactEmail: 'x@down.example' }, down)
    expect(scan).toMatchObject({ pagesRead: 0, hadSite: true, closed: null, open: null })
    expect(scan.note.startsWith(UNREACHABLE)).toBe(true)
  })

  it('has nothing to read, and says so, when there is no site', async () => {
    const calls: string[] = []
    const scan = await scanSite({ contactEmail: 'doug@gmail.com' }, fakeFetch({}, calls))
    expect(scan.hadSite).toBe(false)
    expect(scan.note).toMatch(/^There was no website to read: none is on file, and the contact address is a webmail one./)
    expect(calls).toEqual([])
  })

  it('does not blame a webmail address when there is no address at all', async () => {
    const scan = await scanSite({ contactEmail: null }, fakeFetch({}))
    expect(scan.note).toMatch(/there is no contact address to take one from/)
    expect(scan.note).not.toMatch(/webmail/)
  })

  it('skips a page that is not a web page', async () => {
    const site = { 'https://pdf.example/': { body: 'No unsolicited material.', type: 'application/pdf' } }
    const scan = await scanSite({ website: 'https://pdf.example' }, fakeFetch(site))
    expect(scan.closed).toBeNull()
    expect(scan.pagesRead).toBe(0)
  })
})

/* --------------------------------------------------------------------- */

function database() {
  const { d1, db } = sqliteD1()
  const env = { DB: d1 } as never
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)
  const add = (o: {
    tenant?: string
    name?: string
    email?: string | null
    status?: string
    notes?: string | null
    checkedAt?: string | null
    policy?: string | null
    overriddenAt?: string | null
  }) =>
    Number(
      db
        .prepare(
          `INSERT INTO sync_targets (tenant_id, name, contact_email, status, notes, policy_checked_at, submission_policy, policy_overridden_at, discovered_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
        )
        .run(
          o.tenant ?? OWNER,
          o.name ?? 'Friends Music Partners',
          o.email === undefined ? 'beth@friends.example' : o.email,
          o.status ?? 'draft_ready',
          o.notes ?? null,
          o.checkedAt ?? null,
          o.policy ?? null,
          o.overriddenAt ?? null,
        ).lastInsertRowid,
    )
  const row = (id: number) => db.prepare(`SELECT * FROM sync_targets WHERE id = ?`).get(id) as Record<string, string | null>
  const events = () => db.prepare(`SELECT * FROM notification_events`).all() as Array<Record<string, string | null>>
  return { env, db, add, row, events }
}

describe('checking a stored target', () => {
  it('writes the refusal, its sentence and its page, and rings the bell once', async () => {
    const t = database()
    const id = t.add({})
    const result = await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: fakeFetch(REBUILT), announce: true })

    expect(result?.newlyClosed).toBe(true)
    expect(t.row(id)).toMatchObject({
      submission_policy: 'closed',
      policy_evidence: 'NO unsolicited material please.',
      policy_url: 'https://friends.example/about.html',
      policy_checked_at: NOW,
    })
    const events = t.events()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'automation', tier: 'attention', title: 'Friends Music Partners takes no unsolicited pitches', href: '#sync' })

    // A second read finds the same thing and says nothing new.
    const again = await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: fakeFetch(REBUILT), announce: true })
    expect(again?.newlyClosed).toBe(false)
    expect(t.events()).toHaveLength(1)
  })

  it('does not touch updated_at, which would wake every snooze in the table', async () => {
    const t = database()
    const id = t.add({})
    await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: fakeFetch(REBUILT) })
    expect(t.row(id).updated_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('stays quiet when the button is what asked', async () => {
    const t = database()
    const id = t.add({})
    await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: fakeFetch(REBUILT) })
    expect(t.events()).toEqual([])
  })

  it('reads a refusal out of the notes when the site cannot be read', async () => {
    const t = database()
    const id = t.add({ email: 'doug@gmail.com', notes: 'LA library. They do not accept unsolicited submissions.' })
    await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: fakeFetch({}) })
    expect(t.row(id)).toMatchObject({
      submission_policy: 'closed',
      policy_evidence: 'They do not accept unsolicited submissions.',
    })
  })

  it('records an unreachable site as that, to be tried again, and a quiet one as silence', async () => {
    const t = database()
    const down = t.add({ email: 'x@down.example' })
    await checkTarget(t.env, OWNER, down, {
      now: NOW,
      fetchImpl: (async () => {
        throw new Error('nope')
      }) as unknown as typeof fetch,
    })
    expect(t.row(down).submission_policy).toBeNull()
    expect(t.row(down).policy_evidence).toMatch(new RegExp(`^${UNREACHABLE} `))

    const quiet = t.add({ email: 'x@calm.example' })
    await checkTarget(t.env, OWNER, quiet, { now: NOW, fetchImpl: fakeFetch({ 'https://calm.example/': '<p>We place music.</p>' }) })
    expect(t.row(quiet).submission_policy).toBeNull()
    expect(t.row(quiet).policy_evidence).toMatch(/^Read 1 page on calm\.example\./)
  })

  it('never undoes the artist\'s decision to pitch anyway', async () => {
    const t = database()
    const id = t.add({ policy: 'closed', checkedAt: '2026-09-01T00:00:00.000Z', overriddenAt: '2026-09-05T00:00:00.000Z' })
    const result = await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: fakeFetch(REBUILT), announce: true })
    expect(t.row(id).policy_overridden_at).toBe('2026-09-05T00:00:00.000Z')
    // Already refusing, so nothing is newly closed and nobody is told again.
    expect(result?.newlyClosed).toBe(false)
    expect(t.events()).toEqual([])
  })

  it('will not read another artist\'s target', async () => {
    const t = database()
    const id = t.add({ tenant: 'tnt_0002' })
    expect(await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: fakeFetch(REBUILT) })).toBeNull()
    expect(t.row(id).policy_checked_at).toBeNull()
  })
})

describe('the nightly pass', () => {
  it('reads what nobody has read, a few at a time, oldest first', async () => {
    const t = database()
    const ids = [1, 2, 3, 4, 5].map((n) => t.add({ name: `Target ${n}`, email: `x@t${n}.example` }))
    const calls: string[] = []
    const run = await checkPendingTerms(t.env, OWNER, TODAY, { limit: 3, now: NOW, fetchImpl: fakeFetch({}, calls) })

    expect(run).toEqual({ due: 5, checked: 3, closed: 0 })
    expect(ids.slice(0, 3).every((id) => t.row(id).policy_checked_at === NOW)).toBe(true)
    expect(ids.slice(3).every((id) => t.row(id).policy_checked_at === null)).toBe(true)
  })

  it('leaves out what was written off, what is fresh, and another artist\'s', async () => {
    const t = database()
    t.add({ status: 'archived' })
    t.add({ status: 'declined' })
    t.add({ checkedAt: '2026-10-01T00:00:00.000Z' })
    t.add({ tenant: 'tnt_0002' })
    const run = await checkPendingTerms(t.env, OWNER, TODAY, { now: NOW, fetchImpl: fakeFetch({}) })
    expect(run.due).toBe(0)
  })

  it('finds the refusal, counts it, and tells the bell', async () => {
    const t = database()
    t.add({})
    const run = await checkPendingTerms(t.env, OWNER, TODAY, { now: NOW, fetchImpl: fakeFetch(REBUILT) })
    expect(run).toEqual({ due: 1, checked: 1, closed: 1 })
    expect(t.events()).toHaveLength(1)
  })

  it('does not let one site falling over cost the rest their look', async () => {
    const t = database()
    const first = t.add({ email: 'x@first.example' })
    const second = t.add({ email: 'x@second.example' })
    let n = 0
    const flaky = (async () => {
      if (n++ === 0) throw new Error('boom')
      return new Response('<p>Fine.</p>', { headers: { 'content-type': 'text/html' } })
    }) as unknown as typeof fetch
    const run = await checkPendingTerms(t.env, OWNER, TODAY, { now: NOW, fetchImpl: flaky })
    expect(run.checked).toBe(2)
    expect(t.row(first).policy_checked_at).toBe(NOW)
    expect(t.row(second).policy_checked_at).toBe(NOW)
  })
})

describe('who may ask for a check', () => {
  it('is a person at the screen, not an issued agent token', () => {
    expect(agentMayCall('POST', '/api/sync/12/check-terms')).toBe(false)
    expect(agentMayCall('PATCH', '/api/sync/12')).toBe(false)
  })
})
