import { describe, expect, it } from 'vitest'
import { ASSOCIATIONS, associationFor, associationProfile } from '../shared/musicAssociations'
import { parseAssociationProfile } from '../shared/associationProfile'
import { proposalsFrom } from '../shared/manitobaMusic'

describe('which site an address is on', () => {
  it('knows every association by its exact host, with or without www', () => {
    expect(associationFor('https://www.musicnb.org/en/directory/x')?.id).toBe('musicnb')
    expect(associationFor('music-ontario.ca/membership')?.id).toBe('musicontario')
    expect(associationFor('https://saskmusic.org/')?.id).toBe('saskmusic')
  })

  it('never matches on a suffix or a lookalike', () => {
    expect(associationFor('https://musicnb.org.evil.test/en/directory/x')).toBeNull()
    expect(associationFor('https://notmusicnb.org/en/directory/x')).toBeNull()
    expect(associationFor('not a url ::')).toBeNull()
  })

  it('lists no site twice', () => {
    const hosts = ASSOCIATIONS.flatMap((a) => a.hosts)
    expect(new Set(hosts).size).toBe(hosts.length)
  })
})

describe('which addresses are profiles', () => {
  it('accepts each site’s profile path, and drops the query a share button added', () => {
    const cases: Array<[string, string, string]> = [
      ['https://www.musicnb.org/en/directory/big-river?utm_source=x', 'musicnb', 'https://www.musicnb.org/en/directory/big-river'],
      ['musicnovascotia.ca/artist/some-band/', 'musicns', 'https://musicnovascotia.ca/artist/some-band/'],
      ['https://music-ontario.ca/membership/directory/view,profile/1372/some-name', 'musicontario', 'https://music-ontario.ca/membership/directory/view,profile/1372/some-name'],
      ['https://www.saskmusic.org/directory/search-directory/view,listing/2759/', 'saskmusic', 'https://www.saskmusic.org/directory/search-directory/view,listing/2759/'],
      ['https://www.albertamusic.org/directory-profile/abon/', 'alberta', 'https://www.albertamusic.org/directory-profile/abon/'],
    ]
    for (const [input, id, url] of cases) {
      const r = associationProfile(input)
      expect(r, input).toMatchObject({ association: { id }, url })
    }
  })

  it('refuses the directory, the news and the homepage', () => {
    for (const input of [
      'https://www.musicnb.org/en/directory',
      'https://musicnovascotia.ca/news/',
      'https://music-ontario.ca/membership/directory',
      'https://www.saskmusic.org/',
    ]) {
      expect(associationProfile(input), input).toMatchObject({ error: expect.stringMatching(/not a member profile/) })
    }
  })

  it('says why a site with no public profiles cannot be read', () => {
    expect(associationProfile('https://musicbc.org/anything')).toMatchObject({ error: expect.stringMatching(/member login/) })
    expect(associationProfile('https://musicnl.ca/directory/')).toMatchObject({ error: expect.stringMatching(/browser/) })
  })

  it('refuses a site that is not an association', () => {
    expect(associationProfile('https://dougmcarthur.net')).toMatchObject({ error: expect.stringMatching(/not a provincial/) })
  })
})

// Shaped like the real sites' markup, with invented members: the association's
// own social links sit in the header and footer, exactly as they do live.
const CHROME_LINKS = `
  <a href="https://www.facebook.com/TheAssociation">f</a>
  <a href="https://www.instagram.com/theassociation/">i</a>
  <a href="https://www.youtube.com/user/TheAssociation">y</a>`

const HOME = `<html><head><title>Home | The Association</title>
  <meta property="og:image" content="https://assoc.example/logo-share.png"></head>
  <body><header>${CHROME_LINKS}<p>Supporting the province's music industry since 1990 and beyond.</p></header>
  <main><p>Welcome to the association homepage, where members find news and programs.</p></main>
  <footer>${CHROME_LINKS}</footer></body></html>`

const DRUPAL = `<html><head><title>The Test Ramblers | The Association</title>
  <meta property="og:image" content="https://assoc.example/logo-share.png"></head>
  <body><header>${CHROME_LINKS}</header>
  <main>
    <a class="icon facebook" href="https://www.facebook.com/sharer/sharer.php?u=https://www.musicnb.org/en/directory/test">share</a>
    <a href="https://twitter.com/intent/tweet?text=x">tweet</a>
    <article>
      <div class="member__field-genre"><a href="/en/directory?genre=2"> Country </a><a href="/en/directory?genre=14">Folk</a></div>
      <div class="bio"><p>From the deep woods, this five-piece country and rock ensemble brings an energetic mix of original songs.</p></div>
    </article>
    <aside><h2>Connect</h2>
      <a role="button" data-content="band@example.com">Email</a>
      <a href="https://www.instagram.com/testramblers/">Instagram</a>
      <a href="https://open.spotify.com/artist/abc?utm_source=x">Spotify</a>
      <a href="https://testramblers.bandcamp.com/">Bandcamp</a>
      <a href="https://www.youtube.com/watch?v=qbGJ1EPXUY8">Live at the hall</a>
      <a href="https://maps.google.com/?q=Somewhere">Map</a>
      <a href="/en/directory">Back to the directory</a>
    </aside>
  </main>
  <footer>${CHROME_LINKS}</footer></body></html>`

const WORDPRESS = `<html><head><title>The Association: Jane Testmusician</title>
  <meta property="og:image" content="https://assoc.example/uploads/jane.jpg"></head>
  <body><header>${CHROME_LINKS}<h2>Sign In</h2></header>
  <section class="page-section">
    <p><strong>nova scotia</strong></p>
    <h2 class="wp-block-heading"><strong>Jane Testmusician</strong></h2>
    <a href="mailto:jane@example.com">contact jane</a>
    <p>Booking and everything else: jane@example.com or 902-555-0100, any time at all.</p>
    <p>Jane writes quiet songs about the ocean and has toured the Maritimes every summer since 2019.</p>
    <iframe src="https://www.youtube.com/embed/X0_3HaLBgKM"></iframe>
  </section>
  <footer>${CHROME_LINKS}</footer></body></html>`

const CAKEPHP = `<html><head><title>Directory | The Association</title></head>
  <body><nav>${CHROME_LINKS}</nav>
  <main><section class="directory-profile"><div class="primary"><h2>Dré Testname</h2>
    <p><a class="tag" href="/membership/directory?category=artist">Artist</a></p></div>
    <div class="sidebar"><div class="web-links"><p><span>&nbsp;</span></p></div>
    <a class="google-map-link" href="https://maps.google.com/?q=Windsor">map</a></div></section></main>
  <footer>${CHROME_LINKS}</footer></body></html>`

const read = (page: string, url: string) => parseAssociationProfile(page, HOME, { url, associationName: 'The Association' })

describe('reading a profile by subtraction', () => {
  it('keeps the member’s links and drops the association’s own, the share buttons and the map', () => {
    const p = read(DRUPAL, 'https://www.musicnb.org/en/directory/test')!
    expect(p.name).toBe('The Test Ramblers')
    expect(p.links.map((l) => l.label)).toEqual(['Instagram', 'Spotify', 'Bandcamp'])
    expect(p.links.every((l) => !/TheAssociation|theassociation/.test(l.url))).toBe(true)
  })

  it('files a YouTube watch link as a video, not a link', () => {
    expect(read(DRUPAL, 'https://www.musicnb.org/en/directory/test')!.videos).toEqual([{ title: '', youtubeId: 'qbGJ1EPXUY8' }])
  })

  it('reads genres from links to the directory filtered by genre', () => {
    expect(read(DRUPAL, 'https://www.musicnb.org/en/directory/test')!.genres).toEqual(['Country', 'Folk'])
  })

  it('takes a bio, never a paragraph carrying contact details, and never an email from an attribute', () => {
    const drupal = read(DRUPAL, 'https://www.musicnb.org/en/directory/test')!
    expect(drupal.bio).toMatch(/^From the deep woods/)
    const wp = read(WORDPRESS, 'https://musicnovascotia.ca/artist/jane/')!
    expect(wp.bio).toBe('Jane writes quiet songs about the ocean and has toured the Maritimes every summer since 2019.')
    for (const p of [drupal, wp]) expect(JSON.stringify(p)).not.toMatch(/@example\.com|555-0100/)
  })

  it('finds the name whichever way round the title is, and never takes a heading from the site’s own header', () => {
    expect(read(WORDPRESS, 'https://musicnovascotia.ca/artist/jane/')!.name).toBe('Jane Testmusician')
    expect(read(CAKEPHP, 'https://music-ontario.ca/membership/directory/view,profile/1/x')!.name).toBe('Dré Testname')
  })

  it('takes the page’s photo only when it is not the association’s own share image', () => {
    expect(read(WORDPRESS, 'https://musicnovascotia.ca/artist/jane/')!.photo).toBe('https://assoc.example/uploads/jane.jpg')
    expect(read(DRUPAL, 'https://www.musicnb.org/en/directory/test')!.photo).toBeNull()
  })

  it('reads an embedded video', () => {
    expect(read(WORDPRESS, 'https://musicnovascotia.ca/artist/jane/')!.videos.map((v) => v.youtubeId)).toEqual(['X0_3HaLBgKM'])
  })

  it('reports a thin profile as thin, not as a bio', () => {
    const p = read(CAKEPHP, 'https://music-ontario.ca/membership/directory/view,profile/1/x')!
    expect(p.bio).toBeNull()
    expect(p.links).toEqual([])
  })
})

it('files proposals under the association’s own name and source prefix', () => {
  const p = read(DRUPAL, 'https://www.musicnb.org/en/directory/test')!
  const { proposals, skipped } = proposalsFrom(p, 'test', { name: 'Music NB', sourcePrefix: 'association-musicnb' })
  expect(proposals.every((x) => x.source.startsWith('association-musicnb:test#'))).toBe(true)
  expect(proposals.find((x) => x.kind === 'bio')?.variant).toBe('Music NB')
  expect(skipped[0].reason).toMatch(/left on Music NB/)
})

it('gives the gig agent every association source the registry names', async () => {
  const { readFileSync } = await import('node:fs')
  const prompt = readFileSync('scripts/agents/prompts/gig-festival-scan.md', 'utf8')
  for (const a of ASSOCIATIONS) {
    for (const s of a.sources) expect(prompt, `${a.name}: ${s.url}`).toContain(s.url)
  }
})
