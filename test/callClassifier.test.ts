import { describe, it, expect } from 'vitest'
import { classifyCall, type CallVerdict } from '../shared/callClassifier'

/**
 * The verdicts, against titles that were actually posted.
 *
 * Every title below is real: SaskMusic's forty-six listed opportunities
 * (captured 2026-10-06) and recent posts from the Music PEI, Music Nova Scotia,
 * MusicNL, Music Yukon and Music BC feeds. The *expected verdict* beside each
 * is a judgement, made by reading it as an artist would, and the point of the
 * table is that a rule change which breaks a real title says so by name.
 *
 * `unclear` is a real answer, not a failure: "this mentions a grant and says
 * nothing is open" is exactly what it is for.
 */

type Row = [title: string, verdict: CallVerdict, opts?: { hasDeadline?: boolean; callsPage?: boolean; category?: string | null; kind?: string | null }]

const SASK = { callsPage: true }
const DATED = { callsPage: true, hasDeadline: true }

const ROWS: Row[] = [
  // --- SaskMusic, with a deadline line --------------------------------------
  ['Artist Opportunity - OUTER LIMITS SHOW SERIES', 'opportunity', { ...DATED, kind: 'performance' }],
  ['Grant Opportunity: Circulation and Touring Grant - Canada Council of the Arts', 'opportunity', { ...DATED, category: 'funding' }],
  ['CALL FOR DELEGATES: ICELAND AIRWAVES 2026', 'opportunity', DATED],
  ['APPLICATIONS NOW OPEN : Leighton Artist Studios and Independent Residencies', 'opportunity', DATED],
  ['Festival Opportunity: Armstrong MetalFest 2027', 'opportunity', { ...DATED, category: 'festival' }],
  ['Dawson City Music Festival Winter Residencies 2027', 'opportunity', { ...DATED, category: 'festival' }],
  ['Performance Opportunity: Tallinn Music Week 2027', 'opportunity', { ...DATED, kind: 'performance' }],
  ['Program Opportunity: Women in Music Canada Mentorship Program', 'opportunity', { ...DATED, kind: 'program' }],
  ['Award Opportunity - The 2027 Canadian Selah Music Awards (CSMA)', 'opportunity', { ...DATED, category: 'funding', kind: 'award' }],
  ['Showcase Opportunity : FOCUS Wales 2027', 'opportunity', { ...DATED, category: 'showcase' }],
  ['Festival Opportunity - FIMU - Festival International de Musique Universitaire 2027', 'opportunity', { ...DATED, category: 'festival' }],
  ['Award Opportunity: 2027 JUNO Awards', 'opportunity', { ...DATED, category: 'funding' }],
  ['Showcase Opportunity : Canada House at The Great Escape 2027', 'opportunity', { ...DATED, category: 'showcase' }],
  ['Song Contest: Great American Song contest 2026', 'opportunity', DATED],
  ['CBC Music Class Challenge 2026 : Fall edition', 'opportunity', DATED],
  ['Showcase Opportunity: SXSW 2027', 'opportunity', { ...DATED, category: 'showcase' }],
  ['Program Opportunity: WIMC Leadership Accelerator 2027', 'opportunity', DATED],
  ['Festival Opportunity - Canmore Folk Music Festival 2027', 'opportunity', { ...DATED, category: 'festival' }],
  ['Performance opportunity - Canada Pride 2027', 'opportunity', DATED],
  ['SHOWCASE OPPORTUNITY: NXNE Music Festival 2027 in Toronto!', 'opportunity', { ...DATED, category: 'showcase' }],
  ['Prize Opportunity - The 16th Glenn Gould Prize', 'opportunity', { ...DATED, category: 'funding' }],
  ['SHOWCASE OPPORTUNITY: The Great Escape 2027', 'opportunity', { ...DATED, category: 'showcase' }],

  // --- SaskMusic, no deadline line ------------------------------------------
  ['Industry Opportunity - Seeking Concert Photographers: Exclaim!', 'unclear', { ...SASK, kind: 'industry' }],
  ['Podcast Opportunity - Arts Everywhere podcast hosted by the Saskatchewan Arts Alliance', 'unclear', { ...SASK, kind: 'media' }],
  ['Get Your Music Discovered with Access Now TV', 'unclear', { ...SASK, kind: 'radio' }],
  ['Education Opportunity: MusiCounts Music Industry Careers Learning Hub for High School Students', 'unclear', { ...SASK, kind: 'education' }],
  ['Distribution Opportunity: BeatsUnion Music Platform', 'unclear', { ...SASK, kind: 'distribution' }],
  ["CIMA x NAC: 50 Free Memberships for Canada's Next Wave of Artists & Music Entrepreneurs", 'unclear', SASK],
  ['Grant Opportunity: Oshki Wupoowane - The Blanket Fund', 'opportunity', { ...SASK, category: 'funding' }],
  ['Songwriting opportunity : Pro Songwriters Camp', 'opportunity', { ...SASK, kind: 'songwriting' }],
  ['CAMP Sask Arts Paid Mentorship Opportunity', 'opportunity', { ...SASK, kind: 'program' }],
  ['Performance Opportunities - CMI Live', 'opportunity', { ...SASK, kind: 'performance' }],
  ['Showcase Opportunity: 2027 Sâkêwêwak Storytellers Festival', 'opportunity', { ...SASK, category: 'showcase' }],
  ['CBC Music Submissions', 'unclear', SASK],
  ['Networking Opportunity - Young Music Professionals: a network for music business workers aged 35 & under', 'unclear', { ...SASK, kind: 'industry' }],
  ['Submit to PLUTO TV', 'unclear', { ...SASK, kind: 'radio' }],
  ['Performance Opportunity: Side Door Ticketed Live-Streamed Shows', 'opportunity', { ...SASK, kind: 'performance' }],
  ['Education and Mentorship Opportunity - Live Nation Women Fund for Women Entrepreneurs in the Music Industry', 'opportunity', { ...SASK, kind: 'program' }],
  ['NoonChorus Ticketed Live Stream Concerts', 'unclear', SASK],
  ['Music Submission Opportunity : SiriusXM Canada', 'unclear', { ...SASK, kind: 'radio' }],
  ['CIMA’s Road Gold Certification - Award Submission', 'unclear', SASK],
  ['Submit to Regina\'s CJTR 91.3 FM', 'unclear', { ...SASK, kind: 'radio' }],
  ["Submit to Saskatoon's CFCR 90.5 FM", 'unclear', { ...SASK, kind: 'radio' }],
  ['Stingray Country - Now Accepting Music Video Submissions', 'unclear', { ...SASK, kind: 'radio' }],
  ['Submit for SaskMusic Features', 'unclear', SASK],

  // --- Music Nova Scotia ----------------------------------------------------
  ['Weekly Newsletter – October 1', 'not_opportunity'],
  ['NOVA SCOTIA MUSIC WEEK: Full Lineup & Schedule', 'not_opportunity'],
  ['Program Updates to The Well, MNS Member Mental Health Support Program', 'not_opportunity'],
  ['APPLY NOW: The DAWN Fund', 'opportunity', { category: 'funding' }],
  ['NOVA SCOTIA MUSIC WEEK: Conference Schedule Live, Pre-Registration Open', 'not_opportunity'],
  ['NOVA SCOTIA MUSIC WEEK: Second Round of Showcasing Artists', 'not_opportunity'],

  // --- MusicNL --------------------------------------------------------------
  ['Three Music Industry Trailblazers to Be Honoured at MusicNL Week 2026', 'not_opportunity'],
  ['GET READY! MUSICNL WEEK 2026 ANNOUNCES OFFICIAL LINEUP', 'not_opportunity'],
  ['SWIMMING AWARDED SIXTH-ANNUAL MUSICNL MUSICIAN-IN-RESIDENCE', 'not_opportunity'],
  ['Artist Development Program – Spring 2026 Intake Opening Soon!', 'opportunity'],
  ['Free Membership for New Canadians', 'not_opportunity'],
  ['Call for Jurors – MusicNL Awards & Grants Jury', 'not_opportunity'],
  ['Deadline EXTENSION – Awards & Stages Submissions', 'opportunity', { category: 'funding' }],
  ['Now accepting nominations – MusicNL Honorary Awards', 'unclear', { category: 'funding' }],
  ['Deadline Approaching – Awards & Stages Submissions', 'opportunity'],
  ['Touring & Professional Development Deadline', 'opportunity'],

  // --- Music PEI ------------------------------------------------------------
  ['Music PEI Announces New Board of Directors for 2026/2027', 'not_opportunity'],
  ['Music PEI Awards 2027 – Submissions Now Open!!', 'opportunity', { category: 'funding' }],
  ['BOARD VOTING IS NOW OPEN & 2026 AGM NOTICE', 'not_opportunity'],
  ['Music PEI is Hiring! Multiple Employment Opportunities (September 2026 Start)', 'not_opportunity'],
  ['Music PEI Board of Directors – Nominations 2026', 'not_opportunity'],
  ['We’re Hiring! (Canada Summer Jobs)', 'not_opportunity'],
  ['Music PEI Announces Winners for 2026 Music PEI Awards', 'not_opportunity'],
  ['We’re Hiring: Programs Manager (Full-Time, Permanent)', 'not_opportunity'],
  ['Music PEI Week 2026 Tickets Are On Sale!', 'not_opportunity'],

  // --- Music Yukon ----------------------------------------------------------
  ['Yukon Territory at Breakout West!', 'not_opportunity'],
  ['YUKON MUSIC ON THE FRINGE 2026!', 'not_opportunity'],
  ['Perform at the 2026 Edmonton International Fringe Theatre Festival…and MORE!', 'unclear', { category: 'festival' }],
  ['Cadence Yukon – Formation Intensive | Training Intensive', 'not_opportunity'],
  ['Music Yukon AGM 2025/2026', 'not_opportunity'],
  ['Arts in the Park 30th Anniversary: A Mini Retrospective – CALL FOR ART WORK', 'not_opportunity'],
  ['SPYA Offers Exclusive Studio Rental Discount for Music Yukon Members', 'not_opportunity'],
  ['CALL FOR ARTISTS – ICELAND AIRWAVES 2025', 'opportunity'],

  // --- MusicOntario: a news list with its dates, with calls worded every way ----
  ['Reeperbahn 2026: Check out the Ontario lineup', 'unclear', { callsPage: true }],
  ['MusicOntario & CION open applications for private showcases at Folk Canada 2026!', 'opportunity', { callsPage: true, category: 'showcase' }],
  ['Call for Showcase Submissions: MusicOntario @ M for Montreal', 'opportunity', { category: 'showcase' }],
  ['Come Together 2026: Artist submissions open until July 16!', 'opportunity'],
  ['Ontario @ Reeperbahn 2026 - Applications now open until May 8, 2026!', 'opportunity'],
  ['MusicOntario presents the March Webinar Series 2026', 'not_opportunity'],

  // --- French, as a bilingual association writes it ------------------------
  ['Appel de candidatures – Prix MNB 2027', 'opportunity'],
  ['Inscriptions ouvertes : vitrines MNB Week', 'opportunity'],
  ['Date limite approche pour le Fonds de la musique', 'opportunity'],
  ['Assemblée générale annuelle 2026', 'not_opportunity'],
  ['Nous embauchons : coordonnateur de programmes', 'not_opportunity'],
  ['Music•Musique NB - Music Wire 🧸 Fil de nouvelles (9 sept 2026)', 'not_opportunity'],

  // --- Music BC: a whole newsletter per item --------------------------------
  ['E-News 02/20/25: Apply Now for Jumpstart Grants | 2025 JUNO Nominees & Events | WCMA Submissions', 'not_opportunity'],
]

describe('a verdict on every title that was really posted', () => {
  it.each(ROWS)('%s → %s', (title, verdict, opts) => {
    const got = classifyCall({ title, hasDeadline: opts?.hasDeadline, callsPage: opts?.callsPage })
    expect(got.verdict).toBe(verdict)
    if (opts && 'category' in opts) expect(got.category).toBe(opts.category)
    if (opts && 'kind' in opts) expect(got.kind).toBe(opts.kind)
  })

  it('has covered the whole corpus it was written against', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(75)
  })
})

describe('what a verdict always carries', () => {
  it('says why, in a sentence', () => {
    for (const [title, , opts] of ROWS) {
      const got = classifyCall({ title, hasDeadline: opts?.hasDeadline, callsPage: opts?.callsPage })
      expect(got.reason, title).toMatch(/^[A-Z].*[.]$/)
    }
  })

  it('never calls a call an item that is a job, a board or a newsletter', () => {
    for (const title of ['We are hiring a Programs Manager', 'Annual General Meeting notice', 'E-News: Apply Now for grants', 'Board nominations are open']) {
      expect(classifyCall({ title, hasDeadline: true, callsPage: true }).verdict, title).toBe('not_opportunity')
    }
  })
})

describe('what is written around a title', () => {
  it('a deadline line on a listing is a signal of its own', () => {
    expect(classifyCall({ title: 'Winter Residency 2027' }).verdict).toBe('unclear')
    expect(classifyCall({ title: 'Winter Residency 2027', hasDeadline: true }).verdict).toBe('opportunity')
  })

  it('a deadline line does not rescue a job post', () => {
    expect(classifyCall({ title: 'Now hiring: Booking Coordinator', hasDeadline: true }).verdict).toBe('not_opportunity')
  })

  it('a page of calls keeps an entry with no clear signal; a feed does not', () => {
    expect(classifyCall({ title: 'Something with an unhelpful name', callsPage: true }).verdict).toBe('unclear')
    expect(classifyCall({ title: 'Something with an unhelpful name' }).verdict).toBe('not_opportunity')
  })

  it('reads the category the post was filed under as well as its title', () => {
    expect(classifyCall({ title: 'Now open', categories: ['Showcase'] }).category).toBeNull()
    expect(classifyCall({ title: 'Applications now open', categories: ['Showcase'] }).category).toBe('showcase')
  })

  it('does not reject a festival for welcoming submissions', () => {
    expect(classifyCall({ title: 'Folk Fest welcomes submissions from emerging artists' }).verdict).not.toBe('not_opportunity')
  })
})
