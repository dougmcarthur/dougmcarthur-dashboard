#!/usr/bin/env -S npx tsx
/**
 * See what the source poller would read, from this machine, before it runs
 * anywhere that matters.
 *
 *   npx tsx scripts/probe-sources.ts                          # every seeded source
 *   npx tsx scripts/probe-sources.ts --only saskmusic,musicpei
 *   npx tsx scripts/probe-sources.ts --except manitoba
 *   npx tsx scripts/probe-sources.ts --all                    # include what it ignores
 *
 * It fetches each source the way the Worker does — the same user agent, the
 * same size cap, the same two readers and the same verdicts — and prints what
 * came back: whether the address answered, whether what answered was a feed or
 * a page with entries in it, and which items it would call opportunities.
 *
 * **It reads and prints; it writes nothing.** There is no database in it and no
 * `--apply`, which is why it can be run freely. A request goes out to each
 * source once, so run it on a few at a time rather than in a loop.
 *
 * The honest use is the one the first real reads were: finding the sources that
 * answer 200 and hold nothing. Music BC's feed was nineteen months stale,
 * Music PEI's calendar answered with an empty body, and MusicNL's "member
 * opportunities" page is a login wall — and a status code calls all three fine.
 */

import { readCapped, SCOUT_USER_AGENT } from '../src/lib/sourcePoll'
import { feedFormat, parseFeed } from '../shared/feedParse'
import { parseListing } from '../shared/listingParse'
import { draftFromFeedItem, draftFromListingItem, isCallsPage, seedSources, sourceState, type CandidateDraft } from '../shared/catalogSources'

const args = process.argv.slice(2)
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? (args.indexOf(`--${name}`) >= 0 ? args[args.indexOf(`--${name}`) + 1] : undefined)
const only = flag('only')?.split(',').map((s) => s.trim())
const except = flag('except')?.split(',').map((s) => s.trim()) ?? []
const showAll = args.includes('--all')

const ACCEPT: Record<string, string> = {
  feed: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  calendar: 'text/calendar, */*;q=0.5',
  page: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5',
}

const today = new Date().toISOString().slice(0, 10)
const seeds = seedSources().filter((s) => (!only || only.includes(s.association)) && !except.includes(s.association))

console.log(`${seeds.length} sources · user agent ${SCOUT_USER_AGENT}\n`)

for (const seed of seeds) {
  const started = Date.now()
  let line = `${seed.label} [${seed.kind}]`
  let drafts: CandidateDraft[] = []
  let newest: string | null = null
  let status: number | null = null
  let error: string | null = null

  try {
    const res = await fetch(seed.url, {
      headers: { 'User-Agent': SCOUT_USER_AGENT, Accept: ACCEPT[seed.kind] },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    status = res.status
    if (!res.ok) {
      error = `The site answered ${res.status}.`
    } else {
      const { text, truncated } = await readCapped(res)
      line += ` · ${res.status} · ${(text.length / 1024).toFixed(0)} KB${truncated ? ' (cut at the cap)' : ''}`
      const callsPage = isCallsPage(seed.label)
      if (seed.kind === 'page') {
        drafts = parseListing(text, seed.url).map((i) => draftFromListingItem(i, { today, callsPage }))
      } else {
        const items = parseFeed(text)
        if (items === null) error = text.trim() ? `Not a feed (${feedFormat(text) ?? 'no feed markup'}).` : 'The address answered with nothing.'
        else {
          drafts = items.map((i) => draftFromFeedItem(i, { today, callsPage }))
          newest = items.map((i) => i.publishedAt ?? i.eventAt).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null
        }
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const nowIso = new Date().toISOString()
  const verdict = sourceState(
    {
      enabled: true,
      kind: seed.kind,
      cadenceHours: 24,
      lastFetchedAt: nowIso,
      lastOkAt: error && status !== 200 ? null : nowIso,
      lastStatus: status,
      lastError: error,
      lastItemCount: error && drafts.length === 0 && status === 200 ? 0 : drafts.length,
      newestItemAt: newest,
    },
    new Date(),
  )

  const calls = drafts.filter((d) => d.verdict === 'opportunity' && d.status === 'new')
  const unclear = drafts.filter((d) => d.verdict === 'unclear' && d.status === 'new')
  console.log(line)
  console.log(`  ${verdict.state.toUpperCase()} — ${error ?? verdict.note}  (${Date.now() - started} ms)`)
  if (drafts.length) {
    console.log(`  ${drafts.length} items · ${calls.length} calls · ${unclear.length} unclear · ${drafts.filter((d) => d.status === 'ignored').length} ignored · ${drafts.filter((d) => d.status === 'stale' || d.status === 'closed').length} old or closed`)
  }
  for (const d of showAll ? drafts : calls) {
    const when = d.deadline ? ` closes ${d.deadline}` : d.deadlineNote ? ` “${d.deadlineNote}”` : ''
    console.log(`    ${d.status.padEnd(7)} ${d.verdict.padEnd(15)} ${d.title.slice(0, 80)}${when}`)
    if (showAll) console.log(`            ${d.reason}`)
  }
  console.log()
}
