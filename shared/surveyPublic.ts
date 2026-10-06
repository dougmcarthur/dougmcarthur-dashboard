/**
 * From the owner's analysis to something a stranger may read.
 *
 * `summarise` (shared/surveyAnalysis.ts) is written for the owner: it carries
 * the open answers, the channels, the identity breakdowns and the raw counts. A
 * public page may carry none of that, so this is a projection rather than a
 * filter: it builds a new object out of an allow-list, which means a field
 * added to the summary next year is not published until somebody decides it
 * should be. `test/surveyPublic.test.ts` fails if a response id, a channel tag,
 * a free-text answer or any of the sensitive questions appears in it.
 *
 * Four rules, each of which is a way a survey page misleads without anybody
 * lying:
 *
 * - **Nothing under ten.** A group of fewer than ten artists is never shown, and
 *   neither is the question's remainder when it would reveal one. The notice
 *   every respondent read promises exactly this.
 * - **Intervals come from the artists, not the screens.** The same person
 *   answers several ranking screens, so treating each screen as independent
 *   makes the result look surer than it is. Each artist is scored once per
 *   factor and the spread is taken between artists.
 * - **A claim is only made when the data can bear it.** "Clearly above average"
 *   needs the whole interval above zero; "these two are tied" is said when the
 *   intervals overlap. The sentences at the top of the page are written from
 *   those bands, so the headline cannot be firmer than the chart under it.
 * - **Identity is not published.** Age, gender, community and income are asked
 *   optionally and described only to the owner. In a first wave from one
 *   provincial network, a breakdown of a few of them is a short step from a
 *   name, so the public page describes who answered by where, how long, how and
 *   how seriously they work in music, and nothing finer.
 *
 * Pure, and nothing here reads the clock: `now` is an argument.
 */

import { analyseChoices, applyExclusions, completes, MIN_GROUP, TARGET_COMPLETES, type Exclusions, type Respondent } from './surveyAnalysis'
import { isSkipped } from './surveyAnswers'
import { FACTORS, questionOf, tx, type ChoiceQuestion } from './surveyInstrument'

export const PUBLIC_VERSION = 1

/**
 * Fewer completed responses than this and nothing is published. Three times the
 * smallest group that may be shown: below it a page of percentages describes
 * nearly everybody who answered, and the only honest headline is "not yet".
 */
export const PUBLISH_FLOOR = 3 * MIN_GROUP

// ── Shapes ────────────────────────────────────────────────────────────────────

/** How a factor sits against the middle of the thirteen, once the doubt is counted. */
export type Band = 'above' | 'about' | 'below'

export interface PublicFactor {
  id: string
  /** What the chart calls it. `text` is the line as respondents were asked it. */
  label: string
  text: string
  /** Named most important minus named least, averaged over artists: −1 to 1. */
  score: number
  lo: number
  hi: number
  rank: number
  band: Band
  /** Artists who were shown it at least once. */
  artists: number
}

export interface PublicBar {
  id: string
  label: string
  /** Share of the artists who answered. Null when the group is too small to show. */
  share: number | null
  kind?: 'other' | 'none' | 'small'
}

export interface PublicQuestion {
  id: string
  title: string
  /** The question as it was asked. */
  question: string
  /** Artists who answered it. */
  base: number
  multi: boolean
  bars: PublicBar[]
  /** Options chosen by fewer than ten artists and so not shown, for a question that cannot combine them. */
  hidden: number
}

export type ValueGroup = 'audience' | 'industry' | 'effort'

export interface PublicValue {
  key: string
  group: ValueGroup
  label: string
  /** The comparison as a phrase a sentence can carry. */
  phrase: string
  /** Dollars of pay. Negative is a cost. */
  value: number
  lo: number
  hi: number
  /** The interval does not include zero. */
  clear: boolean
}

export interface PublicRatio {
  key: 'fee' | 'travel'
  label: string
  value: number
  lo: number
  hi: number
  /**
   * Against a dollar of pay: heavier, lighter, about the same, or too uncertain
   * to say. "About the same" is a claim, so it needs a narrow range around one;
   * a range from nothing to three dollars supports no claim at all.
   */
  verdict: 'more' | 'less' | 'same' | 'unclear'
}

/** A range this wide, in dollars of pay per dollar of cost, is too wide to call anything "about the same". */
export const RATIO_NARROW = 1

export interface SayDo {
  id: string
  label: string
  /** Where it ranks among the comparable factors when artists are asked what matters. */
  say: number
  /** Where it ranks among the same factors as the reason they last passed. Ties are broken by `say`. */
  doing: number
  /** Where it ranks among all thirteen when artists are asked what matters. */
  rank: number
  /** Share who named it as the reason they last passed. */
  share: number
}

export interface SayDoResult {
  rows: SayDo[]
  /** Comparable reasons that fewer than ten artists gave, and so are not in the comparison. */
  hidden: number
}

export interface PublicResults {
  version: typeof PUBLIC_VERSION
  instrument: string
  publishedAt: string
  /** First and last day responses came in, as YYYY-MM-DD. */
  collected: { from: string; to: string }
  /** Completed responses the results rest on. */
  n: number
  target: number
  /** Fewer than the target: a first look, and the page says so. */
  early: boolean
  /** How many completed responses were left out, and why. */
  leftOut: { count: number; failedCheck: boolean; speeders: boolean }
  /** Sentences, written from the bands below and stored with them so what was reviewed is what is shown. */
  findings: string[]
  ranking: PublicFactor[] | null
  /** Share of paired comparisons answered Neither. */
  neither: number | null
  choices: { values: PublicValue[]; ratios: PublicRatio[] } | null
  sayDo: SayDoResult | null
  stop: PublicQuestion | null
  apply: PublicQuestion | null
  find: PublicQuestion | null
  sample: PublicQuestion[]
}

// ── Words ─────────────────────────────────────────────────────────────────────

/** Short enough for a chart row, and neutral about who is speaking. */
export const FACTOR_LABELS: Record<string, string> = {
  f01: 'Pay if selected',
  f02: 'Cost to apply',
  f03: 'Time to apply',
  f04: 'Cost of getting there',
  f05: 'Time away from home',
  f06: 'Audience size',
  f07: 'People who could hire again',
  f08: 'Fit with the music',
  f09: 'Chance of being selected',
  f10: 'How respected the event is',
  f11: 'How organisers treat artists',
  f12: 'Reaching new audiences',
  f13: 'A proper set',
}

export const VALUE_GROUPS: Record<ValueGroup, { title: string; baseline: string }> = {
  audience: { title: 'The audience', baseline: 'compared with about 100 people' },
  industry: { title: 'People who could hire again', baseline: 'compared with few or none' },
  effort: { title: 'Time to apply', baseline: 'compared with 15 minutes' },
}

/** The keys `analyseChoices` gives its estimates. */
const VALUE_META: Record<string, { group: ValueGroup; label: string; phrase: string }> = {
  'audience 500 vs 100': { group: 'audience', label: 'About 500', phrase: 'an audience of about 500 rather than about 100' },
  'audience 2,000 vs 100': { group: 'audience', label: 'About 2,000', phrase: 'an audience of about 2,000 rather than about 100' },
  'audience 10,000 vs 100': { group: 'audience', label: 'About 10,000', phrase: 'an audience of about 10,000 rather than about 100' },
  // No commas inside a phrase: it is a sentence's subject, and a comma in the middle of one leaves the verb dangling.
  'some industry vs few': { group: 'industry', label: 'Some', phrase: 'having some people there who could hire them again rather than few' },
  'many industry vs few': { group: 'industry', label: 'Many', phrase: 'having many people there who could hire them again rather than few' },
  'application 1 hour vs 15 minutes': { group: 'effort', label: 'About 1 hour', phrase: 'an application that takes an hour rather than 15 minutes' },
  'application 3 hours vs 15 minutes': { group: 'effort', label: 'About 3 hours', phrase: 'an application that takes 3 hours rather than 15 minutes' },
}

/** How the ranking's factors line up with the reasons asked about in B4. The rest have no counterpart and are left out of the comparison. */
export const SAY_DO: Array<[factor: string, reason: string]> = [
  ['f01', 'B4.pay'],
  ['f02', 'B4.fee'],
  ['f03', 'B4.effort'],
  ['f04', 'B4.travel'],
  ['f05', 'B4.time'],
  ['f06', 'B4.audience'],
  ['f07', 'B4.industry'],
  ['f08', 'B4.fit'],
  ['f09', 'B4.odds'],
  ['f10', 'B4.repute'],
  ['f11', 'B4.treat'],
]

/** Third-person labels for how artists find opportunities. The instrument's own words are in the first person. */
const FIND_LABELS: Record<string, string> = {
  'B3.peers': 'Other artists or friends',
  'B3.assoc': 'Music association newsletters and websites',
  'B3.social': 'Social media',
  'B3.search': 'Search or listing websites',
  'B3.invited': 'Invitations sent directly',
  'B3.helper': 'A manager, agent or other helper',
  'B3.app': 'An app or service that finds them',
  'B3.other': 'Something else',
  'B3.nolook': 'They do not actively look',
}

const ORDINAL_SUFFIX = ['th', 'st', 'nd', 'rd']
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** A small count in words, because "7 other reasons were left out" is a sentence that starts with a digit. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n)
}

export function ordinal(n: number): string {
  const v = n % 100
  return `${n}${ORDINAL_SUFFIX[(v - 20) % 10] ?? ORDINAL_SUFFIX[v] ?? ORDINAL_SUFFIX[0]}`
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const percent = (share: number) => `${Math.round(share * 100)}%`
const dollars = (v: number) => `$${(Math.round(Math.abs(v) / 10) * 10).toLocaleString('en-CA')}`

// ── The ranking, scored by artist ─────────────────────────────────────────────

/**
 * The two-sided critical value for a mean of `df + 1` artists, close enough to
 * the t distribution that nobody would see the difference on this page (it is
 * within 0.4% from 9 degrees of freedom up) without carrying a table.
 */
export function critical(df: number): number {
  return df < 1 ? Infinity : 1.96 + 2.4 / df
}

/**
 * Each artist's best-minus-worst for each factor they were shown, over the
 * screens they answered. A factor an artist was never shown says nothing about
 * them, so they are not in its average.
 */
function factorScores(rs: Respondent[]): number[][] {
  const index = new Map(FACTORS.map((f, i) => [f.id, i]))
  const scores = FACTORS.map(() => [] as number[])
  for (const r of rs) {
    const shown = FACTORS.map(() => 0)
    const net = FACTORS.map(() => 0)
    for (const task of r.plan.rank ?? []) {
      const a = r.answers[task.id]
      if (!a || !('best' in a)) continue
      for (const id of task.items) {
        const i = index.get(id)
        if (i !== undefined) shown[i]++
      }
      const b = index.get(a.best)
      const w = index.get(a.worst)
      if (b !== undefined) net[b]++
      if (w !== undefined) net[w]--
    }
    shown.forEach((count, i) => {
      if (count > 0) scores[i].push(net[i] / count)
    })
  }
  return scores
}

function ranking(rs: Respondent[]): PublicFactor[] | null {
  const scores = factorScores(rs)
  if (scores.every((s) => s.length === 0)) return null

  const rows = FACTORS.map((f, i) => {
    const xs = scores[i]
    const m = xs.length
    const mean = m ? xs.reduce((s, v) => s + v, 0) / m : 0
    const sd = m > 1 ? Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (m - 1)) : 0
    const half = m > 1 ? critical(m - 1) * (sd / Math.sqrt(m)) : 2
    const lo = Math.max(-1, mean - half)
    const hi = Math.min(1, mean + half)
    const band: Band = lo > 0 ? 'above' : hi < 0 ? 'below' : 'about'
    return { id: f.id, label: FACTOR_LABELS[f.id] ?? tx(f.text), text: tx(f.text), score: mean, lo, hi, band, artists: m }
  })
  rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return rows.map((r, i) => ({ ...r, rank: i + 1 }))
}

// ── Who answered, and what they did ───────────────────────────────────────────

/**
 * How the artists who answered a choice question answered it, with every group
 * under ten left out. A single-choice question combines what is left into one
 * row; a multiple-choice one cannot, because one artist may sit in several of
 * the small groups and the sum would count them twice.
 */
function question(rs: Respondent[], id: string, title: string, order: 'asked' | 'share', labels: Record<string, string> = {}): PublicQuestion | null {
  const q = questionOf(id) as ChoiceQuestion | undefined
  if (!q) return null

  const counts = new Map<string, number>()
  let base = 0
  for (const r of rs) {
    const a = r.answers[id]
    if (!a || isSkipped(a) || !('value' in a)) continue
    base++
    for (const v of Array.isArray(a.value) ? a.value : [a.value]) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  if (base < MIN_GROUP) return null

  const multi = q.kind === 'multi'
  const bars: PublicBar[] = []
  let hidden = 0
  let smallTotal = 0
  for (const o of q.options) {
    const n = counts.get(o.id) ?? 0
    if (n === 0) continue
    if (n < MIN_GROUP) {
      hidden++
      smallTotal += n
      continue
    }
    const kind = o.exclusive || o.id.endsWith('.none') ? 'none' : o.id.endsWith('.other') ? 'other' : undefined
    bars.push({ id: o.id, label: labels[o.id] ?? tx(o.text), share: n / base, ...(kind ? { kind } : {}) })
  }

  const rank = (b: PublicBar) => (b.kind ? 1 : 0)
  if (order === 'share') bars.sort((a, b) => rank(a) - rank(b) || (b.share ?? 0) - (a.share ?? 0))

  if (!multi && hidden > 0) {
    bars.push({ id: `${id}.small`, label: 'Smaller groups, combined', share: smallTotal >= MIN_GROUP ? smallTotal / base : null, kind: 'small' })
    hidden = 0
  }
  return { id, title, question: tx(q.prompt), base, multi, bars, hidden }
}

// ── Saying and doing ──────────────────────────────────────────────────────────

/** Fewer comparable reasons than this and there is nothing to compare. */
export const SAY_DO_MIN = 3

/**
 * What artists said matters, against the reason they last passed.
 *
 * Only the reasons that at least ten artists gave are compared. B4 offers
 * fourteen, so in a first wave most of them are under ten and may not be shown;
 * ranking those as if they were zero would draw a line to the bottom for a
 * number nobody is allowed to see. The lists are the same length, ranked
 * among themselves, and the page says how many reasons were left out.
 */
function sayDo(rows: PublicFactor[] | null, stop: PublicQuestion | null): SayDoResult | null {
  if (!rows || !stop) return null
  const byFactor = new Map(rows.map((r) => [r.id, r]))
  const shares = new Map(stop.bars.map((b) => [b.id, b.share]))

  const matched = SAY_DO.flatMap(([factor, reason]) => {
    const row = byFactor.get(factor)
    const share = shares.get(reason)
    return row && share !== undefined && share !== null ? [{ id: factor, label: row.label, rank: row.rank, share }] : []
  })
  if (matched.length < SAY_DO_MIN) return null

  const say = new Map([...matched].sort((a, b) => a.rank - b.rank).map((m, i) => [m.id, i + 1]))
  // Two reasons given by the same number of artists are ranked by what was said, so the lines do not cross for no reason.
  const byDo = [...matched].sort((a, b) => b.share - a.share || say.get(a.id)! - say.get(b.id)!)
  return {
    rows: byDo.map((m, i) => ({ id: m.id, label: m.label, say: say.get(m.id)!, doing: i + 1, rank: m.rank, share: m.share })),
    hidden: SAY_DO.length - matched.length,
  }
}

// ── The sentences ─────────────────────────────────────────────────────────────

/**
 * A step of at least this many places, between what is said and what is done,
 * is worth a sentence: a third of the list, and never fewer than two. Four of
 * eleven is a step; four of five is the whole chart, and two of five is a
 * rearrangement worth naming.
 */
export const notableMove = (listLength: number) => Math.max(2, Math.ceil(listLength / 3))

/**
 * The sentences, one function each. The "In short" list uses all of them and each
 * section of the page uses its own as its headline, so a headline is never
 * firmer than the finding beside it: they are the same words.
 */

type Body = Omit<PublicResults, 'findings'>

/** What leads, said as firmly as the intervals allow and no firmer. */
export function leadersSentence(rows: PublicFactor[] | null): string | null {
  if (!rows || rows.length === 0) return null
  const top = rows[0]
  const leaders = rows.filter((x) => x.hi >= top.lo)
  if (leaders.length === 1) return `Artists put ${lowerFirst(top.label)} ahead of everything else.`
  if (leaders.length <= 3) return `Artists put ${list(leaders.map((x) => lowerFirst(x.label)))} at the top, and the answers cannot separate them.`
  return 'No single thing stands clear of the pack yet. The leaders are too close to call.'
}

/** What trails, only when it is clearly below and few enough to name. */
export function trailersSentence(rows: PublicFactor[] | null): string | null {
  if (!rows || rows.length === 0) return null
  const bottom = rows[rows.length - 1]
  const trailers = rows.filter((x) => x.lo <= bottom.hi)
  return bottom.band === 'below' && trailers.length <= 3 ? `${upperFirst(list(trailers.map((x) => lowerFirst(x.label))))} mattered least.` : null
}

/** The factor whose place moved most between what was said and what was done, when it moved far enough to mention. */
export function biggestMover(sd: SayDoResult | null): (SayDo & { move: number }) | null {
  const gaps = sd?.rows.map((g) => ({ ...g, move: g.say - g.doing })) ?? []
  const mover = [...gaps].sort((a, b) => Math.abs(b.move) - Math.abs(a.move) || a.say - b.say)[0]
  return mover && Math.abs(mover.move) >= notableMove(gaps.length) ? mover : null
}

export function moverSentence(sd: SayDoResult | null): string | null {
  const mover = biggestMover(sd)
  if (!mover || !sd) return null
  const n = sd.rows.length
  return `${mover.label} ranks ${ordinal(mover.say)} of ${n} when artists are asked what matters, but ${ordinal(mover.doing)} of ${n} among the reasons they actually passed on an opportunity.`
}

/**
 * When saying and doing agree, that is a finding too, and the section needs a
 * headline either way. Only claimed when nothing is more than one place out and
 * there are enough items for "lines up" to mean something.
 */
export function alignedSentence(sd: SayDoResult | null): string | null {
  if (!sd || sd.rows.length < 4) return null
  return sd.rows.every((g) => Math.abs(g.say - g.doing) <= 1)
    ? `What artists say matters lines up with what actually stopped them, among the ${numberWord(sd.rows.length)} reasons that enough artists gave.`
    : null
}

/** The two reasons for passing that are about timing and not about the opportunity: the dates, and hearing too late. */
const TIMING: Array<[id: string, why: string]> = [
  ['B4.dates', 'the dates did not work'],
  ['B4.late', 'they missed the deadline or heard about it too late'],
]

/**
 * How many artists passed for a reason that has nothing to do with whether the
 * opportunity was good. Each reason is counted only if it is big enough to show
 * by itself, so the sum never reveals a group that was hidden.
 */
export function timingSentence(stop: PublicQuestion | null): string | null {
  const seen = TIMING.flatMap(([id, why]) => {
    const bar = stop?.bars.find((b) => b.id === id)
    return bar && bar.share !== null ? [{ share: bar.share, why }] : []
  })
  if (seen.length === 0) return null
  const total = percent(seen.reduce((s, x) => s + x.share, 0))
  return seen.length === 2
    ? `${total} of artists passed on their last opportunity because of timing, not the opportunity itself: the dates did not work, or they heard about it too late.`
    : `${total} of artists passed on their last opportunity because ${seen[0].why}, which is about timing and not about the opportunity itself.`
}

/** The biggest dollar value the range can support. */
export function biggestValue(choices: Body['choices']): PublicValue | null {
  const clear = choices?.values.filter((v) => v.clear) ?? []
  return [...clear].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0] ?? null
}

export function valueSentence(choices: Body['choices']): string | null {
  const v = biggestValue(choices)
  if (!v) return null
  return v.value > 0
    ? `${upperFirst(v.phrase)} is worth about ${dollars(v.value)} of pay to the artists who answered.`
    : `${upperFirst(v.phrase)} costs the artists who answered about ${dollars(v.value)} of pay.`
}

/**
 * Said only when the range supports it. An entry fee is a small number against a
 * swing in pay, so this one is often too uncertain to call, and a sentence that
 * guessed would be the page's most confident wrong number.
 */
export function feeSentence(choices: Body['choices']): string | null {
  const fee = choices?.ratios.find((x) => x.key === 'fee')
  if (!fee || fee.verdict === 'unclear') return null
  const amount = `$${fee.value.toFixed(2)}`
  return fee.verdict === 'more'
    ? `A dollar of entry fee weighs as much as ${amount} of pay, so fees cost artists more than their face value.`
    : fee.verdict === 'less'
      ? `A dollar of entry fee weighs less than a dollar of pay (${amount}).`
      : 'Artists weigh a dollar of entry fee about the same as a dollar of pay.'
}

export const neitherSentence = (neither: number | null): string | null =>
  neither === null ? null : `Shown two made-up opportunities, artists turned down both ${percent(neither)} of the time.`

/** The most common answer that is an answer: not "other", not "none", not the combined remainder. */
export function leadingBar(q: PublicQuestion | null): PublicBar | null {
  return q?.bars.find((b) => !b.kind && b.share !== null) ?? null
}

export function reasonSentence(stop: PublicQuestion | null): string | null {
  const bar = leadingBar(stop)
  return bar && bar.share !== null
    ? `When asked about the last opportunity they passed on, ${percent(bar.share)} of artists said “${bar.label}”, the most common reason.`
    : null
}

export function routeSentence(find: PublicQuestion | null): string | null {
  const bar = leadingBar(find)
  return bar && bar.share !== null ? `${percent(bar.share)} of artists find opportunities through ${lowerFirst(bar.label)}, the most common route.` : null
}

/**
 * The "In short" list. It leaves out two findings on purpose: how often artists
 * turned down both options, and what the biggest trade-off is worth. Both are
 * already a card at the top of the page and the second is a section's headline,
 * so saying them a third time, one scroll later, is just repeating.
 */
export function buildFindings(r: Body): string[] {
  return [
    leadersSentence(r.ranking),
    trailersSentence(r.ranking),
    moverSentence(r.sayDo) ?? alignedSentence(r.sayDo),
    feeSentence(r.choices),
    timingSentence(r.stop),
    reasonSentence(r.stop),
    routeSentence(r.find),
  ]
    .filter((s): s is string => s !== null)
    .slice(0, 8)
}

// ── Putting it together ───────────────────────────────────────────────────────

const day = (iso: string) => iso.slice(0, 10)

/** Why nothing can be published yet. Empty means it can. */
export function publishBlockers(all: Respondent[], exclusions: Exclusions = {}): string[] {
  const used = applyExclusions(completes(all), exclusions)
  const blockers: string[] = []
  if (used.length < PUBLISH_FLOOR) {
    blockers.push(
      `Only ${used.length} completed ${used.length === 1 ? 'response is' : 'responses are'} in. At least ${PUBLISH_FLOOR} are needed before anything is published: below that a page of percentages describes nearly everybody who answered.`,
    )
  }
  return blockers
}

/**
 * The public snapshot for the artists who completed the survey. `now` is when
 * it is being built, and is the only thing in it that is not a function of the
 * responses, so two builds an hour apart over the same data are the same except
 * for that.
 */
export function buildPublicResults(all: Respondent[], opts: { now: string; exclusions?: Exclusions }): PublicResults {
  const exclusions = opts.exclusions ?? {}
  const done = completes(all)
  const used = applyExclusions(done, exclusions)

  const rows = ranking(used)
  const choices = analyseChoices(used)
  const stop = question(used, 'B4', 'Why they passed', 'share')
  const first = used.map((r) => day(r.createdAt)).sort()[0] ?? day(opts.now)
  const last = used.map((r) => day(r.completedAt ?? r.createdAt)).sort().slice(-1)[0] ?? day(opts.now)

  const without: Omit<PublicResults, 'findings'> = {
    version: PUBLIC_VERSION,
    instrument: used[0]?.instrument ?? '',
    publishedAt: opts.now,
    collected: { from: first, to: last },
    n: used.length,
    target: TARGET_COMPLETES,
    early: used.length < TARGET_COMPLETES,
    leftOut: { count: done.length - used.length, failedCheck: !!exclusions.failedCheck, speeders: !!exclusions.speeders },
    ranking: rows,
    neither: choices ? choices.neither : null,
    choices:
      choices && choices.reliable
        ? {
            values: choices.values.flatMap((v): PublicValue[] => {
              const meta = VALUE_META[v.key]
              return meta ? [{ key: v.key, group: meta.group, label: meta.label, phrase: meta.phrase, value: v.value, lo: v.lo, hi: v.hi, clear: v.lo > 0 || v.hi < 0 }] : []
            }),
            ratios: choices.costRatios.flatMap((c): PublicRatio[] =>
              c.key === 'fee' || c.key === 'travel'
                ? [
                    {
                      key: c.key,
                      label: c.key === 'fee' ? 'Entry fee' : 'Travel and lodging',
                      value: c.value,
                      lo: c.lo,
                      hi: c.hi,
                      verdict: c.lo > 1 ? 'more' : c.hi < 1 ? 'less' : c.hi - c.lo <= RATIO_NARROW ? 'same' : 'unclear',
                    },
                  ]
                : [],
            ),
          }
        : null,
    sayDo: sayDo(rows, stop),
    stop,
    apply: question(used, 'B5', 'Why they applied', 'share'),
    find: question(used, 'B3', 'How they find opportunities', 'share', FIND_LABELS),
    sample: [
      question(used, 'A1', 'Where they live', 'share'),
      question(used, 'A2', 'How long they have been performing', 'asked'),
      question(used, 'A3', 'How they perform', 'share'),
      question(used, 'A5', 'How music fits into their work', 'asked'),
    ].filter((q): q is PublicQuestion => q !== null),
  }
  return { ...without, findings: buildFindings(without) }
}
