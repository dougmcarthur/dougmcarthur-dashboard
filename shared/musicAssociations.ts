/**
 * Canada's provincial and territorial music industry associations.
 *
 * Every province but Quebec has one, most artists who apply for things are
 * members of theirs, and the association's site is where a member keeps a
 * public profile, where the province's deadlines are posted and where local
 * news runs. Manitoba Music was the first read (`shared/manitobaMusic.ts`);
 * this is the list the same features extend to, with what each site actually
 * offers — checked by fetching it, not assumed from the one before.
 *
 * Three things this registry decides:
 *
 * - **Which host a pasted address belongs to.** A profile is still read from
 *   the address the artist gives, never found by name, and only from a host on
 *   this list: an association profile is a page a member controls on a site
 *   an association runs, which is why it can be offered as a source at all.
 * - **Which addresses are profiles.** Each site's profile path is written
 *   down, so a news article or the directory index is refused rather than
 *   read as somebody's bio.
 * - **What the research agents read.** `sources` are the pages and feeds the
 *   gig scan checks for deadlines and calls, per province.
 *
 * `profiles: false` is a finding, not a gap: MusicNL and Music Yukon draw
 * their directories in the browser, so there is no page to read, and Music
 * BC's is behind a member login. `automated: 'blocked'` means the site
 * answered a plain request with a bot check when this was written — the
 * reader still tries, and says so in words when it is refused.
 *
 * Music NWT is left out on purpose: when this was written its homepage
 * carried injected links to unrelated golf-course pages, which is what a
 * compromised WordPress site looks like, and a source the agents read should
 * not be one somebody else is writing into. Quebec's ADISQ is an industry
 * body with no artist profiles or open calls to read.
 */

export type AssociationId =
  | 'manitoba' | 'saskmusic' | 'alberta' | 'musicbc' | 'musicontario'
  | 'musicnb' | 'musicns' | 'musicpei' | 'musicnl' | 'musicyukon'

export interface Association {
  id: AssociationId
  name: string
  /** Two-letter province or territory. */
  region: string
  /** The site's hosts, without `www.`. */
  hosts: string[]
  home: string
  /** A profile's path, first capture group the stable part of the address. */
  profilePath: RegExp | null
  /** Why a profile cannot be read, when it cannot. */
  profileNote?: string
  automated?: 'blocked'
  /** Pages and feeds with deadlines, calls and local news, for the research agents. */
  sources: Array<{ label: string; url: string; kind: 'feed' | 'page' | 'calendar' }>
}

export const ASSOCIATIONS: Association[] = [
  {
    id: 'manitoba', name: 'Manitoba Music', region: 'MB',
    hosts: ['manitobamusic.com'], home: 'https://www.manitobamusic.com',
    // Read by its own parser, `shared/manitobaMusic.ts`; `profileUrl` there
    // also takes the short /<name> form.
    profilePath: /^\/profiles\/view,\d+\/([a-z0-9_-]+)/i,
    sources: [
      { label: 'Deadlines', url: 'https://www.manitobamusic.com/deadlines', kind: 'page' },
      { label: 'News', url: 'https://www.manitobamusic.com/news.rss', kind: 'feed' },
    ],
  },
  {
    id: 'saskmusic', name: 'SaskMusic', region: 'SK',
    hosts: ['saskmusic.org'], home: 'https://www.saskmusic.org',
    profilePath: /^\/directory\/search-directory\/view,listing\/(\d+)/i,
    automated: 'blocked',
    sources: [
      { label: 'Opportunities and deadlines', url: 'https://www.saskmusic.org/news/sound-opportunities', kind: 'page' },
    ],
  },
  {
    id: 'alberta', name: 'Alberta Music', region: 'AB',
    hosts: ['albertamusic.org'], home: 'https://www.albertamusic.org',
    profilePath: /^\/directory-profile\/([^/]+)\/?$/i,
    automated: 'blocked',
    sources: [],
  },
  {
    id: 'musicbc', name: 'Music BC', region: 'BC',
    hosts: ['musicbc.org'], home: 'https://musicbc.org',
    profilePath: null,
    profileNote: 'Music BC’s member directory is behind its member login, so there is no public profile to read.',
    sources: [
      { label: 'News', url: 'https://musicbc.org/feed/', kind: 'feed' },
      { label: 'Showcase opportunities', url: 'https://musicbc.org/programs/export-opportunities/', kind: 'page' },
    ],
  },
  {
    id: 'musicontario', name: 'MusicOntario', region: 'ON',
    hosts: ['music-ontario.ca'], home: 'https://music-ontario.ca',
    profilePath: /^\/membership\/directory\/view,profile\/(\d+)/i,
    sources: [
      { label: 'News and calls', url: 'https://music-ontario.ca/news', kind: 'page' },
      { label: 'Events and showcases', url: 'https://music-ontario.ca/events', kind: 'page' },
    ],
  },
  {
    id: 'musicnb', name: 'Music NB', region: 'NB',
    hosts: ['musicnb.org'], home: 'https://www.musicnb.org/en',
    profilePath: /^\/(?:en|fr)\/directory\/([a-z0-9_-]+)\/?$/i,
    sources: [{ label: 'News', url: 'https://www.musicnb.org/en/blog', kind: 'page' }],
  },
  {
    id: 'musicns', name: 'Music Nova Scotia', region: 'NS',
    hosts: ['musicnovascotia.ca'], home: 'https://musicnovascotia.ca',
    profilePath: /^\/artist\/([a-z0-9_-]+)\/?$/i,
    sources: [
      { label: 'News', url: 'https://musicnovascotia.ca/feed/', kind: 'feed' },
      { label: 'Events', url: 'https://musicnovascotia.ca/events/', kind: 'page' },
    ],
  },
  {
    id: 'musicpei', name: 'Music PEI', region: 'PE',
    hosts: ['musicpei.com'], home: 'https://www.musicpei.com',
    profilePath: null,
    profileNote: 'Music PEI lists members on one directory page rather than giving each a profile.',
    sources: [
      { label: 'Opportunities and submissions', url: 'https://www.musicpei.com/resources/opportunities-and-submissions/', kind: 'page' },
      { label: 'News', url: 'https://www.musicpei.com/feed/', kind: 'feed' },
      { label: 'Events', url: 'https://www.musicpei.com/events-calendar/?ical=1', kind: 'calendar' },
    ],
  },
  {
    id: 'musicnl', name: 'MusicNL', region: 'NL',
    hosts: ['musicnl.ca'], home: 'https://musicnl.ca',
    profilePath: null,
    profileNote: 'MusicNL’s directory is drawn in the browser, so there is no profile page for Scout to read.',
    sources: [
      { label: 'Member opportunities', url: 'https://musicnl.ca/member-opportunities/', kind: 'page' },
      { label: 'News', url: 'https://musicnl.ca/feed/', kind: 'feed' },
    ],
  },
  {
    id: 'musicyukon', name: 'Music Yukon', region: 'YT',
    hosts: ['musicyukon.com'], home: 'https://musicyukon.com',
    profilePath: null,
    profileNote: 'Music Yukon’s member list is drawn in the browser, so there is no profile page for Scout to read.',
    sources: [{ label: 'News', url: 'https://musicyukon.com/feed/', kind: 'feed' }],
  },
]

export function associationById(id: string): Association | null {
  return ASSOCIATIONS.find((a) => a.id === id) ?? null
}

/** The association whose site an address is on, by exact host — never a suffix match. */
export function associationFor(url: string): Association | null {
  let host: string
  try {
    host = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.toLowerCase()
  } catch {
    return null
  }
  host = host.replace(/^www\./, '')
  return ASSOCIATIONS.find((a) => a.hosts.includes(host)) ?? null
}

/**
 * A pasted address as a profile on one of these sites, or a sentence saying
 * why not. Manitoba Music has its own, richer check (`profileUrl`), which the
 * caller uses instead; this is for everybody else.
 */
export function associationProfile(
  input: string,
): { association: Association; url: string; key: string } | { error: string } {
  const raw = input.trim()
  if (!raw) return { error: 'Paste the address of your profile.' }
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return { error: 'That is not a web address.' }
  }
  const association = associationFor(u.href)
  if (!association) {
    return { error: 'That is not a provincial music association’s site. Scout reads profiles on those sites only.' }
  }
  if (!association.profilePath) {
    return { error: association.profileNote ?? `${association.name} has no public profiles for Scout to read.` }
  }
  const m = u.pathname.match(association.profilePath)
  if (!m) {
    return {
      error: `That is a ${association.name} page, but not a member profile. Open your profile there and copy the address from the browser.`,
    }
  }
  const host = new URL(association.home).host
  // The path as the site wrote it — some want the trailing slash — without
  // the query or fragment somebody's share button added.
  return { association, url: `https://${host}${u.pathname}`, key: m[1].toLowerCase() }
}
