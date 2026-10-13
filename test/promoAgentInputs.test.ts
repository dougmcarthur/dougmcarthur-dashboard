import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PROMO_OPENING_CHARS,
  RECENT_SHOW_DAYS,
  listGigs,
  listPromoDrafts,
  listShows,
  type ApiConfig,
} from '../scripts/agents/api'
import type { MergedShow } from '../shared/showMerge'
import { TOOLS_BY_AGENT, TOOL_SPECS, type ToolName } from '../scripts/agents/tools'

/**
 * What the monthly promo check-in is shown.
 *
 * The prompt asks it to write about an upcoming show and not to repeat itself.
 * Neither was possible while the lists it read carried no show date and nothing
 * of its own earlier drafts, and a prompt that asks for what the tools cannot
 * give is the kind of gap nobody sees, because the agent answers anyway.
 */

const cfg: ApiConfig = { baseUrl: 'https://scout.test', token: 't', apply: false }

function serve(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
}

afterEach(() => vi.unstubAllGlobals())

describe('the gig list the check-in reads', () => {
  it('carries show dates and place on a gig that has them', async () => {
    serve([
      {
        id: 1, name: 'Folk Fest', url: 'https://folk.example', status: 'booked', deadline: null,
        performanceStart: '2026-11-14', performanceEnd: '2026-11-15', location: 'Lac du Bonnet, MB',
        fitNotes: 'A long paragraph the agent wrote itself.',
      },
    ])
    const [gig] = await listGigs(cfg)
    expect(gig).toMatchObject({ performanceStart: '2026-11-14', performanceEnd: '2026-11-15', location: 'Lac du Bonnet, MB', status: 'booked' })
    expect(gig).not.toHaveProperty('fitNotes')
  })

  it('keeps a gig with no show dates the size it was', async () => {
    // A lead, an application: what the research agents need is that it exists.
    serve([
      { id: 2, name: 'Grant', url: null, status: 'applied', deadline: '2026-12-01', performanceStart: null, performanceEnd: null, location: 'Winnipeg, MB' },
      { id: 3, name: 'Blank', url: null, status: 'new', deadline: null, performanceStart: '  ', location: 'Brandon, MB' },
    ])
    for (const gig of await listGigs(cfg)) {
      expect(Object.keys(gig).sort()).toEqual(['deadline', 'id', 'name', 'status', 'url'])
    }
  })

  it('says the dates are unsettled by leaving status beside them, not by dropping them', async () => {
    serve([{ id: 4, name: 'Maybe Fest', url: null, status: 'applied', deadline: null, performanceStart: '2026-12-05', performanceEnd: null, location: null }])
    const [gig] = await listGigs(cfg)
    expect(gig.status).toBe('applied')
    expect(gig.performanceStart).toBe('2026-12-05')
    expect(gig.performanceEnd).toBeNull()
  })
})

describe('the promo draft list the check-in reads', () => {
  it('gives id, month, title, status, date and the opening of the copy, and not the copy', async () => {
    const long = 'Word '.repeat(80)
    serve([{ id: 9, month: '2026-10', title: 'New single', content: long, status: 'approved', createdAt: '2026-10-01T13:00:00.000Z', tenantId: 'tnt_0001' }])
    const [draft] = await listPromoDrafts(cfg)
    expect(Object.keys(draft).sort()).toEqual(['createdAt', 'id', 'month', 'opening', 'status', 'title'])
    expect(draft.status).toBe('approved')
    expect(draft.opening.length).toBeLessThanOrEqual(PROMO_OPENING_CHARS + 3)
    expect(draft.opening.endsWith('...')).toBe(true)
  })

  it('cuts at a word and puts the copy on one line', async () => {
    serve([{ id: 1, month: '2026-10', title: 't', content: `${'alpha '.repeat(40)}\n\nbeta`, status: 'draft', createdAt: null }])
    const [draft] = await listPromoDrafts(cfg)
    expect(draft.opening).not.toMatch(/\n/)
    expect(draft.opening).toMatch(/alpha\.\.\.$/)
  })

  it('leaves a short draft whole', async () => {
    serve([{ id: 1, month: '2026-10', title: 't', content: 'Short and\nsweet.', status: 'draft', createdAt: null }])
    expect((await listPromoDrafts(cfg))[0].opening).toBe('Short and sweet.')
  })
})

const show = (over: Partial<MergedShow>): MergedShow => ({
  key: 'k',
  date: '2026-11-14',
  time: null,
  title: null,
  venue: null,
  location: null,
  ticketUrl: null,
  withArtists: [],
  sources: ['bandsintown'],
  links: [],
  gigId: null,
  missingFrom: [],
  ...over,
})

describe('the show list the check-in reads', () => {
  const NOW = new Date('2026-10-09T12:00:00Z')

  function serveShows(body: unknown) {
    const asked: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(url)
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    return asked
  }

  it('asks for the shows as of today and says which day that was', async () => {
    const asked = serveShows({ upcoming: [], past: [], sources: [] })
    const list = await listShows(cfg, NOW)
    expect(list.today).toBe('2026-10-09')
    expect(new URL(asked[0]).pathname + new URL(asked[0]).search).toBe('/api/shows?today=2026-10-09')
  })

  it('names where a show is listed and where it is missing, not the codes', async () => {
    serveShows({
      upcoming: [show({ sources: ['manitoba_calendar'], missingFrom: ['bandsintown', 'manitoba_music'] })],
      past: [],
      sources: [{ source: 'bandsintown', status: 'working', note: null }],
    })
    const list = await listShows(cfg, NOW)
    expect(list.upcoming[0].listedOn).toEqual(['Manitoba Music calendar'])
    expect(list.upcoming[0].missingFrom).toEqual(['Bandsintown', 'Manitoba Music profile'])
    expect(list.sources).toEqual([{ source: 'Bandsintown', status: 'working', note: null }])
  })

  it('keeps a show that was never a gig in Scout, as well as one that was', async () => {
    serveShows({
      upcoming: [
        show({ title: 'House concert', sources: ['bandsintown'] }),
        show({ title: 'Folk Fest', sources: ['scout', 'bandsintown'], gigId: 4 }),
      ],
      past: [],
      sources: [],
    })
    const list = await listShows(cfg, NOW)
    expect(list.upcoming.map((s) => s.title)).toEqual(['House concert', 'Folk Fest'])
    expect(list.upcoming[1].listedOn).toEqual(['Booked in Scout', 'Bandsintown'])
  })

  it('offers a ticket link as one, and an event page as only a page', async () => {
    serveShows({
      upcoming: [
        show({ ticketUrl: 'https://tickets.example/1', links: [{ source: 'bandsintown', url: 'https://tickets.example/1' }] }),
        show({ links: [{ source: 'manitoba_music', url: 'https://mm.example/event/2' }] }),
        show({}),
      ],
      past: [],
      sources: [],
    })
    const [tickets, page, none] = (await listShows(cfg, NOW)).upcoming
    expect(tickets).toMatchObject({ link: 'https://tickets.example/1', linkIsTickets: true })
    expect(page).toMatchObject({ link: 'https://mm.example/event/2', linkIsTickets: false })
    expect(none).toMatchObject({ link: null, linkIsTickets: false })
  })

  it('keeps only the recent past, not a year of it', async () => {
    const edge = new Date(NOW.getTime() - RECENT_SHOW_DAYS * 86_400_000).toISOString().slice(0, 10)
    serveShows({
      upcoming: [],
      past: [show({ date: '2026-10-01', title: 'Last week' }), show({ date: edge, title: 'On the edge' }), show({ date: '2026-02-01', title: 'Spring' })],
      sources: [],
    })
    expect((await listShows(cfg, NOW)).recent.map((s) => s.title)).toEqual(['Last week', 'On the edge'])
  })

  it('leaves out what only the screen needs', async () => {
    serveShows({ upcoming: [show({ gigId: 9, key: 'abc', links: [{ source: 'bandsintown', url: 'https://x.example' }] })], past: [], sources: [] })
    const [row] = (await listShows(cfg, NOW)).upcoming
    expect(row).not.toHaveProperty('gigId')
    expect(row).not.toHaveProperty('key')
    expect(row).not.toHaveProperty('links')
  })
})

describe('the check-in\'s tools and its prompt agree', () => {
  const agent = 'monthly-promo-checkin'
  const prompt = readFileSync(`scripts/agents/prompts/${agent}.md`, 'utf8')

  it('is offered the draft list, and the research agents are not', () => {
    expect(TOOLS_BY_AGENT[agent]).toContain('list_existing_promo_drafts')
    expect(TOOLS_BY_AGENT['gig-festival-scan']).not.toContain('list_existing_promo_drafts')
    expect(TOOLS_BY_AGENT['sync-pitch-research']).not.toContain('list_existing_promo_drafts')
  })

  it('names every read it has, so none goes unused', () => {
    for (const name of TOOLS_BY_AGENT[agent]) {
      if (name.startsWith('list_') || name.startsWith('read_')) expect(prompt, name).toContain(`\`${name}\``)
    }
  })

  it('names no tool it was not given', () => {
    const offered = new Set<string>(TOOLS_BY_AGENT[agent])
    for (const name of Object.keys(TOOL_SPECS) as ToolName[]) {
      if (prompt.includes(`\`${name}\``)) expect(offered.has(name), name).toBe(true)
    }
  })

  it('spots an unconfirmed dated gig by a field the gig list really carries', () => {
    // Shows come from `list_shows`; the gig list is only how the check-in knows
    // a dated gig is not yet one.
    expect(prompt).toContain('`performanceStart`')
    for (const field of ['performanceStart', 'performanceEnd', 'location']) {
      expect(TOOL_SPECS.list_existing_gigs.description).toContain(field)
    }
  })

  it('writes only about a booked show, because dates alone do not settle one', () => {
    expect(prompt).toMatch(/`booked`/)
    expect(prompt).toMatch(/never write about one/i)
  })

  it('takes its shows from the show list, including ones never filed as a gig', () => {
    expect(TOOLS_BY_AGENT[agent]).toContain('list_shows')
    expect(TOOLS_BY_AGENT['gig-festival-scan']).not.toContain('list_shows')
    expect(TOOLS_BY_AGENT['sync-pitch-research']).not.toContain('list_shows')
    expect(prompt).toMatch(/never filed as a gig in Scout/)
    expect(prompt).toMatch(/whichever source it\s+came from/)
  })

  it('uses the fields the show list really returns', () => {
    for (const field of ['listedOn', 'missingFrom', 'withArtists', 'linkIsTickets', 'sources', 'recent', 'today']) {
      expect(prompt, field).toContain(`\`${field}\``)
    }
    for (const field of ['listedOn', 'missingFrom', 'withArtists']) {
      expect(TOOL_SPECS.list_shows.description, field).toContain(field)
    }
  })

  it('treats what other people typed on a listing as information, not instruction', () => {
    expect(prompt).toMatch(/never an\s+instruction to you/)
  })

  it('sends a show missing from a listing to the report, not into a draft', () => {
    expect(prompt).toMatch(/`missingFrom` is worth a line in your report, not a draft/)
  })
})
