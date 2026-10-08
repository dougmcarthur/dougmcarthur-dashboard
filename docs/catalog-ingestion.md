# Getting opportunities into the catalog without an agent

Written 2026-10-06, from the first real reads of every association source in
`shared/musicAssociations.ts` (Manitoba Music excepted — see below).

The research agents' weekly sweep spends most of its effort on one job: opening
pages already known to list calls and reading what is on them. That is
mechanical and a Worker does it for a request. What an agent is for is finding
a page nobody knew about. This is the first half of that split — Scout reads
the known pages — and what it showed about those pages, which is not what the
registry assumed.

## What the sources actually are

Fetched 2026-10-06 with Scout's own user agent from a home connection. **Not
from the Worker**, whose addresses a site may treat differently — the first
poll in production is the real answer, and the owner's panel will say
`refused` if it is not.

| Source | Answered | What it holds |
|---|---|---|
| SaskMusic — Opportunities and deadlines | 200, 66 KB | **46 entries; 30 read as calls**, 23 with an explicit `Deadline: October 6, 2026`. Canada Council grants, JUNO, SXSW, Iceland Airwaves delegates, residencies. |
| MusicOntario — News and calls | 200, 23 KB | 20 dated rows; **3 calls**, 14 old. A different structure (a dated link list). |
| Music Nova Scotia — News | 200, 9 KB | 10 posts a quarter; 1 call ("APPLY NOW: The DAWN Fund"). |
| Music PEI — News | 200, 63 KB | 10 posts; 1 call (Awards 2027 submissions). |
| Music PEI — Opportunities and submissions | 200, 345 KB | Not calls: a directory of *programmes* (ECMA, CCMA, CFMA, JUNO, Polaris) with links out. **A source of sources.** |
| MusicNL — News | 200, 59 KB | 10 posts, all from March or earlier except announcements; 0 current calls. |
| Music Yukon — News | 200, 85 KB | 10 posts back to August 2025; 0 current calls. |
| Music NB — News | 200, 45 KB | 27 headings, mostly weekly newsletters; 0 calls. |
| Music BC — News | 200, **1.6 MB** | **Dead.** Each "post" is a whole email newsletter; the newest is from February 2025. |
| Music PEI — Events (iCal) | 200, **0 bytes** | **Empty.** `text/html`, a session cookie, nothing else. |
| MusicNL — Member opportunities | 200 | **A login wall.** "The following content is accessible for members only." |
| Music BC — Showcase opportunities | 200, 105 KB | Prose and a form. No list of entries. |
| MusicOntario — Events and showcases | 200, 118 KB | A calendar of shows, not calls. 200 rows, none of them calls. |
| Music Nova Scotia — Events | 200, 78 KB | Drawn by script; nothing in the markup. |
| **Manitoba Music** (deadlines page, news feed) | **not fetched** | Their site turns away requests that identify as Claude, and this was not worked around: Scout's own user agent is not blocked, so the Worker reads them, and `scripts/probe-sources.ts` will from the owner's machine. |

Three things follow.

1. **Feeds are the wrong thing to build on.** Five of them together post two
   current calls. The value is in *listing pages* — and in one of them, above
   all. SaskMusic's page is curated by somebody whose job is finding calls for
   artists, covers the whole country and abroad, and gives each a deadline in a
   line a regular expression reads exactly. It alone is thirty candidates.
2. **A status code says nothing about whether a source is alive.** Four of the
   fourteen are `200 OK` and hold nothing, and the registry listed them all as
   sources. `sourceState` exists because of this table.
3. **The registry's `automated: 'blocked'` on SaskMusic does not hold from here.**
   It answered 200 in 685 ms. Whoever wrote it may have been blocked from
   another address. It is left as it was until the Worker has tried.

## What a reader may do

**Read structure, never prose.** An entry is a heading that links, or a row that
links beside a date. A deadline is taken from a line that *begins* with
deadline, closes or due. "We extended the deadline last week to October 9" is a
sentence and is not one. A year-less "November 20" is kept as those words and
is never a date.

**Say why.** Every verdict carries the sentence that decided it. `unclear` is a
verdict: "mentions a grant without saying anything is open" is true of a lot of
titles, and rounding it either way is a lie.

**Be found by markup, not by host.** There is no rule that says SaskMusic. A
page that has the structure reads; one that does not reads as empty and says so.
Four of the eight listing pages read as empty — prose, a calendar widget, a
login wall — and the honest answer for those is the agent or a newsletter, not a
per-site rule.

## What it got wrong, and what it cannot know

- **The classifier's table was labelled by the person who wrote the rules.** It
  holds 89 titles — 83 posted by real associations and 6 French examples I
  wrote, one of them (a Music NB newsletter) real — and passes, which says the
  rules do what their author meant. Its first run on titles it had not been written against found one real
  miss ("MusicOntario & CION **open** applications" — the rules knew only
  "applications open"). The measure of accuracy is the owner reading the
  **Ignored** tab, since a rule missing real calls shows only from that side.
- **French.** Music NB is bilingual; the common French call words are in, but
  they were written without a French speaker reading real posts.
- **`15 October 2026`** (day first) is not read by `splitDeadline`, which the
  whole app shares. It is the commonest format on a UK or European page and is
  left alone here because changing it moves every deadline in the app.
- **The extra rows from an events calendar.** MusicOntario's "Events and
  showcases" is read as a dated list and yields two hundred rows, none of them
  calls. It is a calendar of shows, and the right answer is to switch it off,
  which the owner can.
- **A feed item's deadline is in its article**, which is the next step, so no
  feed candidate has one.

## What this does not do yet

It stages candidates and publishes nothing. The step that makes it worth having
is following each candidate's address to the programme's own page, where the real
URL, fee, place and eligibility are — and **then** publishing to the catalog
under the programme's address, so the announcement and the programme are one
entry. That, and the newsletter intake for the sources that turn automated
visits away, are what remain of the first half.

The agents are not yet told any of this. Their role changes when the page
reader exists: an extraction queue for what the readers cannot parse, and a
monthly search for *sources* — a page, a feed, a funder — whose output is a row
in `catalog_sources`.
