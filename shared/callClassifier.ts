/**
 * Does this item announce a call an artist could apply to?
 *
 * Decided from a title and a few words around it, by rules that were written
 * against real ones — SaskMusic's forty-six listed opportunities and the recent
 * posts of five other associations' feeds. The shapes they showed:
 *
 *  - **The prefixes are consistent where somebody curates.** "Showcase
 *    Opportunity: SXSW 2027", "Award Opportunity - …", "Festival Opportunity:
 *    …". The word before "opportunity" says what kind it is, and it is the
 *    most reliable signal there is.
 *  - **Feeds are mostly not calls.** Hiring posts, board elections, AGM
 *    notices, weekly newsletters, winners announced, lineups released. Naming
 *    those is as much of the work as naming a call.
 *  - **Radio and TV are promotion.** "Submit to CJTR 91.3 FM", "Now accepting
 *    music video submissions". `gig-festival-scan.md` already says to report
 *    these and not file them as gigs; they are `unclear` here, with the kind
 *    saying why.
 *
 * Three verdicts, because two would be a lie. `opportunity` is a call the
 * words name. `not_opportunity` is something the words say it is not, or
 * nothing in them suggests it is. `unclear` is the honest middle — an item that
 * mentions grants or showcases without saying anything is open — and it is kept
 * and shown rather than rounded in either direction. Every verdict carries the
 * sentence that decided it, so a wrong one can be argued with and a rule can be
 * fixed where it went wrong.
 *
 * **It never reads prose for a date or a fee.** A title is classified; what a
 * call asks and when it closes is for the page, which is the next step.
 *
 * Pure: no clock, no network.
 */

import { gigCategory, type CatalogCategory } from './opportunityCatalog'

export type CallVerdict = 'opportunity' | 'unclear' | 'not_opportunity'

export interface CallClass {
  verdict: CallVerdict
  /** The catalog's category when the words say one, otherwise null. */
  category: CatalogCategory | null
  /** The noun that said what it is: showcase, residency, competition, radio… */
  kind: string | null
  /** A sentence. Shown to the owner, so it names the rule in words. */
  reason: string
}

export interface CallInput {
  title: string
  /** The first lines of the item. Used only where the title carries no signal. */
  summary?: string
  categories?: readonly string[]
  /** The listing gave this entry a deadline line. */
  hasDeadline?: boolean
  /** The page it came from is a list of calls ("Opportunities and deadlines"). */
  callsPage?: boolean
}

/* ----------------------------------------------------------------------- */
/* What it is not                                                          */
/* ----------------------------------------------------------------------- */

const NEGATIVE: Array<{ test: RegExp; reason: string }> = [
  {
    test: /\b(?:we(?:'|’)?re hiring|is hiring|are hiring|now hiring|job (?:opportunit\w+|posting|opening)s?|employment opportunit\w+|career opportunit\w+|position (?:available|open)|seeking an? [a-z' -]{0,40}(?:manager|coordinator|director|assistant|intern|officer|specialist|administrator))\b/i,
    reason: 'A job post, not a call for artists.',
  },
  {
    test: /\b(?:offres? d['’]emploi|nous embauchons|poste à pourvoir)\b/i,
    reason: 'A job post, not a call for artists.',
  },
  {
    test: /\b(?:board (?:of directors|election|voting|nominations?|members?)|annual general meeting|agm|bylaws?|nominating committee|assemblée générale|conseil d['’]administration)\b/i,
    reason: 'Association governance — a board, an election or an AGM.',
  },
  {
    test: /\b(?:newsletter|e-?news|e-?bulletin|weekly (?:update|roundup)|monthly (?:update|roundup)|round-?up|digest|infolettre|fil de nouvelles|music wire)\b/i,
    reason: 'A newsletter or roundup, not one call.',
  },
  {
    test: /\bcall for (?:jurors?|jury|volunteers?|vendors?|sponsors?|exhibitors?|speakers?|mentors?|board)\b|\b(?:jurors?|volunteers?)\b/i,
    reason: 'Asks for jurors, volunteers or vendors, not for artists.',
  },
  {
    test: /\b(?:art ?work|visual art|painters?|sculpt\w*|photograph(?:y|ers?) wanted)\b/i,
    reason: 'A call for visual art, not music.',
  },
  {
    test: /\b(?:announces?|announced|announcing)\s+(?:the\s+)?(?:\d{4}\s+)?(?:winners?|finalists?|recipients?|nominees|lineup|line-up|new\b|board)|\bwinners?\b|\bcongratulations\b|\bhonou?red\b|\bawarded\b|\bfull line-?up\b|\bline-?up (?:&|and) schedule\b|\bschedule (?:is )?live\b|\btickets? (?:are )?on sale\b|\bin memoriam\b|\brecap\b|\bremembering\b|\bupdates? to\b/i,
    reason: 'News about something that has happened, not a call.',
  },
  {
    test: /\b(?:survey|membership (?:drive|renewal)|renew your)\b/i,
    reason: 'A survey or a membership notice.',
  },
]

/* ----------------------------------------------------------------------- */
/* Promotion: radio, TV, playlists                                         */
/* ----------------------------------------------------------------------- */

const PROMOTION = /\b(?:radio|playlists?|tv|fm|siriusxm|sirius xm|pluto|video submissions?)\b|\bget your music discovered\b/i

/* ----------------------------------------------------------------------- */
/* "<kind> Opportunity"                                                    */
/* ----------------------------------------------------------------------- */

interface KindRule {
  verdict: Exclude<CallVerdict, 'not_opportunity'>
  category: CatalogCategory | 'infer' | null
  kind: string
}

/**
 * What the word before "opportunity" says. The ones for artists are
 * `opportunity`; the ones for somebody else — an industry professional, a
 * student, a podcast host — are `unclear`, because they are real postings the
 * artist may still want and not calls this product files.
 */
const OPPORTUNITY_KINDS: Record<string, KindRule> = {
  artist: { verdict: 'opportunity', category: 'infer', kind: 'performance' },
  performance: { verdict: 'opportunity', category: 'infer', kind: 'performance' },
  live: { verdict: 'opportunity', category: 'infer', kind: 'performance' },
  festival: { verdict: 'opportunity', category: 'festival', kind: 'festival' },
  showcase: { verdict: 'opportunity', category: 'showcase', kind: 'showcase' },
  conference: { verdict: 'opportunity', category: 'showcase', kind: 'conference' },
  grant: { verdict: 'opportunity', category: 'funding', kind: 'grant' },
  funding: { verdict: 'opportunity', category: 'funding', kind: 'grant' },
  award: { verdict: 'opportunity', category: 'funding', kind: 'award' },
  prize: { verdict: 'opportunity', category: 'funding', kind: 'award' },
  scholarship: { verdict: 'opportunity', category: 'funding', kind: 'grant' },
  bursary: { verdict: 'opportunity', category: 'funding', kind: 'grant' },
  sync: { verdict: 'opportunity', category: 'sync', kind: 'sync' },
  licensing: { verdict: 'opportunity', category: 'sync', kind: 'sync' },
  residency: { verdict: 'opportunity', category: 'infer', kind: 'residency' },
  program: { verdict: 'opportunity', category: 'infer', kind: 'program' },
  programme: { verdict: 'opportunity', category: 'infer', kind: 'program' },
  mentorship: { verdict: 'opportunity', category: 'infer', kind: 'program' },
  songwriting: { verdict: 'opportunity', category: 'infer', kind: 'songwriting' },
  contest: { verdict: 'opportunity', category: 'infer', kind: 'competition' },
  competition: { verdict: 'opportunity', category: 'infer', kind: 'competition' },
  industry: { verdict: 'unclear', category: null, kind: 'industry' },
  networking: { verdict: 'unclear', category: null, kind: 'industry' },
  education: { verdict: 'unclear', category: null, kind: 'education' },
  podcast: { verdict: 'unclear', category: null, kind: 'media' },
  media: { verdict: 'unclear', category: null, kind: 'media' },
  distribution: { verdict: 'unclear', category: null, kind: 'distribution' },
  radio: { verdict: 'unclear', category: null, kind: 'radio' },
}

/** "Showcase Opportunity:", "Award Opportunity -", "CAMP … Mentorship Opportunity". */
const OPPORTUNITY_NOUN = /\b([A-Za-z]+)\s+opportunit(?:y|ies)\b/i

/* ----------------------------------------------------------------------- */
/* What it says outright                                                   */
/* ----------------------------------------------------------------------- */

const CALL_WORDS: Array<{ test: RegExp; reason: string; kind?: string }> = [
  {
    test: /\bcalls? for (?:[\w'’-]+ ){0,3}(?:artists?|submissions?|applications?|applicants?|proposals?|entries|performers?|delegates?|participants?|musicians?|bands?|acts?|talent|songs?|music)\b/i,
    reason: 'Is a call for submissions.',
  },
  {
    test: /\bapply (?:now|by|today|for|to)\b|\bapplications? (?:are |is )?(?:now |currently )?(?:open|opening|accepted|being accepted)\b|\b(?:now|currently) accepting (?:applications?|submissions?|entries)\b|\bsubmissions? (?:are |is )?(?:now |currently )?open\b|\bintake (?:is |are )?(?:now |currently )?(?:open|opening)\b|\bopen call\b|\bapplications? (?:close|due)\b/i,
    reason: 'Says applications or submissions are open.',
  },
  {
    test: /\b(?:opens?|opened|opening|launch(?:es|ed)?) (?:the |its |new )?(?:\d{4} )?(?:applications?|submissions?|call)\b/i,
    reason: 'Says it has opened applications or a call.',
  },
  {
    test: /\bappels? (?:de|à|aux) (?:candidatures?|soumissions?|propositions?|artistes?|projets?|dossiers?)\b|\b(?:inscriptions?|candidatures?|soumissions?|demandes?) (?:sont |est )?(?:maintenant )?ouvertes?\b/i,
    reason: 'Is a call for submissions, in French.',
  },
  {
    test: /\bdeadlines?\b|\bdate limite\b|\b(?:applications?|submissions?) (?:extended|extension)\b/i,
    reason: 'Names a deadline.',
  },
  {
    test: /\bsubmit (?:your|a|an)\b|\bapply\b/i,
    reason: 'Asks artists to apply or submit.',
  },
]

/** Words that make an item worth keeping without making it a call. */
const SOFT = /\b(?:grants?|funding|awards?|prizes?|showcase|festival|residenc(?:y|ies)|intake|submissions?|applications?|opportunit(?:y|ies)|programs?|programmes?|contest|competition|challenge|perform at|tour(?:ing)?)\b/i

/* ----------------------------------------------------------------------- */

function categoryFor(text: string): CatalogCategory | null {
  const c = gigCategory(text)
  return c === 'other' ? null : c
}

export function classifyCall(input: CallInput): CallClass {
  // Cut first. A title is a line; one that is longer than a paragraph is not
  // one, and nothing below needs more of it than this.
  const title = input.title.slice(0, 2000).replace(/\s+/g, ' ').trim().slice(0, 300)
  const context = `${title} ${(input.categories ?? []).join(' ')}`

  for (const rule of NEGATIVE) {
    if (rule.test.test(title)) return { verdict: 'not_opportunity', category: null, kind: null, reason: rule.reason }
  }

  if (PROMOTION.test(title)) {
    return {
      verdict: 'unclear',
      category: null,
      kind: 'radio',
      reason: 'Radio, TV or playlist submissions are promotion, not gigs.',
    }
  }

  const noun = OPPORTUNITY_NOUN.exec(title)
  const kindRule = noun ? OPPORTUNITY_KINDS[noun[1].toLowerCase()] : undefined
  if (kindRule) {
    const category = kindRule.category === 'infer' ? categoryFor(title) : kindRule.category
    return {
      verdict: kindRule.verdict,
      category,
      kind: kindRule.kind,
      reason:
        kindRule.verdict === 'opportunity'
          ? `Labelled a ${noun![1].toLowerCase()} opportunity.`
          : `A ${kindRule.kind} posting, not a call for artists.`,
    }
  }

  for (const rule of CALL_WORDS) {
    if (rule.test.test(title)) {
      return { verdict: 'opportunity', category: categoryFor(context), kind: rule.kind ?? null, reason: rule.reason }
    }
  }

  // Nothing in the title. A deadline line on a listing is a signal of its own:
  // an entry that carries one is something with a closing date.
  if (input.hasDeadline) {
    return { verdict: 'opportunity', category: categoryFor(context), kind: null, reason: 'The listing gives it a deadline.' }
  }

  if (SOFT.test(title)) {
    return {
      verdict: 'unclear',
      category: categoryFor(context),
      kind: null,
      reason: 'Mentions a grant, showcase or program without saying anything is open.',
    }
  }

  // On a page that is a list of calls, an entry with no clear signal is still
  // something somebody chose to list there.
  if (input.callsPage) {
    return {
      verdict: 'unclear',
      category: categoryFor(context),
      kind: null,
      reason: 'Listed on a page of opportunities, but its title does not say what it asks.',
    }
  }

  return { verdict: 'not_opportunity', category: null, kind: null, reason: 'Names no call, deadline or opportunity.' }
}
