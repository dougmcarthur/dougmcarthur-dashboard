# Discovery & the daily digest

Finding opportunities used to depend on scheduled Claude tasks running on a
laptop. It now runs on the Worker cron, so the dashboard works whether or not
any machine of yours is switched on, and reports back in one email.

## How a sweep works

`src/lib/discovery.ts` makes **two** Claude calls per sweep:

1. **Research** — `claude-opus-5` with the server-side `web_search` tool. The
   search runs on Anthropic's infrastructure, so the Worker makes one HTTPS call
   rather than crawling anything itself. The prompt carries the artist profile
   from the reference docs, a brief per kind (live opportunities vs sync), and
   the list of everything already tracked so it doesn't re-report it.
2. **Extract** — `claude-sonnet-5` with structured outputs turns those research
   notes into typed rows. Dates must be `YYYY-MM-DD`; anything vague ("early
   spring") is left out with a note rather than guessed at.

The split is deliberate: structured outputs can't be combined with the citations
that come back from web search, and keeping extraction as a pure function of
text makes it testable.

## The quality gate

A sweep that fills `pending_review` with near-misses makes the queue useless, so
nothing reaches it without passing `gateCandidates`:

| Check | Rule |
| --- | --- |
| Complete | must have a name and a link |
| Not a duplicate | name normalised (year and filler words stripped) or same host as something tracked — also applied within the run |
| Worth your time | fit score ≥ 3 of 5 |
| Bounded | at most 8 new rows per sweep, best-scoring first |

Rejections are counted and logged with their reason, so a sweep that finds
nothing new says so rather than looking broken.

Accepted gigs land as `pending_review` with `discovered_by = 'discovery'`, their
fit score in `genre_fit_score`, the reasoning in `fit_rationale`, and provenance
in `source_note`. Sync finds land as `draft_ready` sync targets. From there they
follow the normal flow — approve one and its answers get prepared when the
window opens.

## Cadence

Discovery runs **weekly**, gated on the last successful `discovery.gigs` /
`discovery.sync` task run rather than a second cron trigger (one daily cron is
easier to reason about, and the Workers free plan allows only five per account).
`POST /api/tasks/discover?kind=gigs|sync` forces a sweep immediately.

## The digest

One email per run, or none. `buildDigest` returns `null` when nothing happened —
a "no news" email teaches you to ignore the ones that matter.

Sections, in the order they appear:

1. **Ready to review** — applications whose window opened and whose answers are
   prepared: how many fields, how many drafted, how many need you.
2. **New opportunities** — what the sweep found, with fit score and review link.
3. **Needs doing by hand** — forms that couldn't be read, with the reason.
4. **Deadlines** — what's due and how soon, if it's still unsubmitted.

Reminders covered by a digest are marked `sent` with the subject and body
stored, so nothing is sent twice. If Gmail isn't configured the items stay
pending and go out on the next run rather than being lost.

## Cost

Web search bills about **$10 per 1,000 searches**, and a sweep uses up to 12.
Two sweeps a week (gigs + sync) is roughly 100 searches a month — around **$1**,
plus tokens for the research and extraction calls. The research call is the
expensive half; `EXTRACT_MODEL` is deliberately Sonnet.

## Worker plan

⚠️ Cron triggers on the **Workers Free** plan get **10 ms of CPU** and 50
subrequests. Form parsing alone will exceed that. **Workers Paid** ($5/month)
gives 30 s of CPU for sub-hourly crons — 15 min at hourly or longer — and 10,000
subrequests. Waiting on `fetch()` doesn't count toward CPU, so the Claude calls
themselves are nearly free in CPU terms; it's the HTML parsing that needs the
headroom. Check **Workers & Pages → your Worker → Metrics → Errors** for
`exceededCpu` if runs go missing.

## Configuration

| Secret | Effect if missing |
| --- | --- |
| `ANTHROPIC_API_KEY` | Discovery is skipped with a note in the run summary (answer drafting also falls back to profile matching) |
| `GMAIL_SEND_REFRESH_TOKEN` / `NOTIFY_EMAIL` | The digest isn't sent; items stay pending and appear in the dashboard |

## Tuning what it looks for

The briefs are `GIG_BRIEF` and `SYNC_BRIEF` in `src/lib/discovery.ts` — plain
prose, edit them directly. They currently prioritise Canadian and northern-US
opportunities within reach of Winnipeg, folk/singer-songwriter/alt-pop
programming, and open or upcoming windows; and they skip closed windows,
pay-to-play with no audience, and obvious genre mismatches.

`MIN_FIT_SCORE` and `MAX_NEW_PER_RUN` are the two dials for how much reaches
your queue.
