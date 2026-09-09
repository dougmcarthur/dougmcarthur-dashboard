# dougmcarthur-dashboard

A private ops dashboard for Doug McArthur's music promotion — finding gig
opportunities, deciding which to apply to, preparing the applications, and
tracking the sync-licensing pitches, promo drafts and automated task runs
alongside them. Runs entirely on Cloudflare: a Hono API on Workers,
a D1 (SQLite) database, and a React frontend served as static assets from the
same Worker. The live site sits behind Cloudflare Access.

## Where things stand

The gig pipeline is planned as five phases in
[`docs/gig-pipeline-plan.md`](docs/gig-pipeline-plan.md), which is the roadmap
this repo works through and the place to look before starting anything.

| | | |
| --- | --- | --- |
| 1 · Research & collect | Research agents POST rows; the Review queue ranks them | **built** |
| 2 · Present & review | Overview deck, Review screen, snooze, weekly digest, notifications | **built** |
| 3 · Apply & track | Form pre-fill, materials checklist, draft email | **built** |
| 4 · Post-submission | Reading the organiser's reply out of Gmail | **built** |
| 5 · Pre-show | Agreements and logistics | **not built** |

Phase F, the weighing model, is **half built**. The cost half is in — what a
trip costs, banded and always as a range, plus the P-2 lead time as a queue
flag (see [What a trip costs](#what-a-trip-costs) below). The scoring half is
blocked on the elicitation rather than on code: the five swing-weight questions
in §7 of the plan have to be answered once by the person whose taste is being
encoded, and until they are there is deliberately **no score anywhere** — a
cost and no value is a usable half, an invented value is not.

One debt sits outside the phases: `shared/reviewParse.ts` re-derives structured
facts out of prose on every read because migration 0001's columns were never
**backfilled**; it is a stopgap that should be deleted rather than extended.
(The artist database's **sourcing** gap is closed — see
[Filling it](#filling-it-from-the-reference-documents) — though Drive, the
website and the press photos are still unread.)

## Stack

- **API** — [Hono](https://hono.dev) on Cloudflare Workers, with
  [Drizzle ORM](https://orm.drizzle.team) over D1 and [Zod](https://zod.dev)
  request validation. Entry point: `src/index.ts`.
- **Database** — Cloudflare D1 `dougmcarthur-music-hq`
  (`database_id 515d234f-92c3-4519-abc3-3d453a1b5058`). Schema in
  `src/db/schema.ts`; migrations in `migrations/`.
- **Frontend** — React 19 + Vite, TanStack Query & Table, Tailwind. Hash-based
  routing (`frontend/src/`). Built to `dist/` and served via the Worker's
  `ASSETS` binding. Screens: Overview, **Review**, Gigs, **Artist**, Sync,
  Promo, Settings, History.
- **Integrations** — Google Calendar (three kinds of entry, reconciled against
  a gig's state — see [The gig pipeline](#the-gig-pipeline)), Gmail
  (`readonly`, reconciling sent pitches against sync targets and reading
  organisers' replies to applications), and Cloudflare
  Email Service for the weekly digest. All degrade gracefully when their
  secrets aren't set — see `GET /api/health` to check what's configured.

## Project layout

```
src/
  index.ts            Worker entry — mounts all API routes, falls through to ASSETS
  types.ts            Env bindings (DB, ASSETS, EMAIL, Google/Gmail secrets)
  db/                 Drizzle client + schema
  routes/             One Hono router per resource (gigs, artist, application, …)
  lib/                Everything that touches the outside: googleCalendar.ts,
                      gmail.ts, mailer.ts, gigCalendar.ts, formParser.ts,
                      applicationPrep.ts, digestMail.ts, settings.ts
frontend/             React + Vite app (its own tsconfig.frontend.json)
shared/               Pure logic imported by BOTH: wire types, the review queue,
                      digest content, the gig-status vocabulary, the artist
                      database, application staging
migrations/           D1 migrations (applied by CI before every deploy)
scripts/              Maintenance + the local-database bootstrap
docs/                 Setup guides, the notes-field audit, and the plans
schema.sql            Snapshot of the original production schema (pre-migrations)
```

## API

All routes are under `/api`; anything else falls through to static assets.

| Route | Purpose |
| --- | --- |
| `GET /api/overview` | Totals, the recent task-run log, and due reminders |
| `GET /api/review` | The decision queue — what needs a decision, ranked, with per-filter counts and the Overview's `summary` (`?filter=`, `?limit=`) |
| `/api/gigs` | Gig opportunities (CRUD). Status changes are validated against the pipeline and reconcile the calendar |
| `/api/gigs/:id/application` | The application packet: `GET` it, `POST /prepare` to read the form, `PATCH /fields/:id` to stage an answer |
| `/api/artist` | The artist database (CRUD), plus `GET /epk`, `GET /answer?label=…` and `POST /:id/reviewed` |
| `/api/sync` | Sync-licensing targets (CRUD) |
| `/api/sync/reconcile` | `GET` preview of sent-pitch matches from Gmail; `POST /apply` to write status/pitch updates |
| `/api/promo` | Monthly promo drafts (CRUD) |
| `POST /api/review/snooze` | Defer a gig or sync target to a date, or `until: null` to bring it back |
| `/api/digest` | The weekly digest: `GET /preview`, `POST /send`, `PATCH /settings` |
| `/api/reference-docs` | Reference documents (CRUD) |
| `/api/reminders` | List/patch reminders; `POST /dismiss` to clear an entity's pending reminders |
| `/api/task-runs` | Log + list automated task runs |
| `/api/replies` | Replies found in the mail; `POST /scan`, `POST /:id/accept`, `POST /:id/dismiss` |
| `/api/notifications` | The bell feed; `POST /read`, `POST /dismiss` |
| `/api/health` | Which Google/Gmail secrets are configured |

> Route order matters. `/api/sync/reconcile` is registered **before**
> `/api/sync`, so the sync router's `/:id` handler doesn't swallow it, and
> `/api/gigs/:id/application` before `/api/gigs` for the same reason. A router
> mounted on the longer path has to be offered the request first — keep it that
> way when adding sub-routes.

## The gig pipeline

Saying yes to an opportunity means **"I am going to apply."** It is not a
booking, and nothing in the app is allowed to behave as though a date has been
secured — it used to put a 🎵 on your calendar on the submission deadline,
which on a phone is indistinguishable from a booked show. That sentence is the
whole reframe, and the vocabulary in `shared/gigStatus.ts` exists to keep it
true.

Statuses are named so **the subject of the verb is never in doubt**:

| Phase | States | Whose decision |
| --- | --- | --- |
| 1 · Research & collect | `discovered` | the app's |
| 2 · Present & review | `shortlisted`, `passed` | **yours** |
| 3 · Apply & track | `preparing`, `submitted` | yours |
| 4 · Post-submission | `acknowledged`, `info_requested`, `invited`, `declined` | **theirs** |
| 5 · Pre-show | `booked` | yours, once signed |

Plus `expired` (the window closed while it sat there), `withdrawn` (you pulled
out after applying) and `archived`.

`approved` and `rejected` are gone. They caused a real misreading: `rejected`
meant *you* passed, while every reader assumed a festival had turned you down.
`normaliseGigStatus` maps the old spellings forward on read *and* on write, so
the research agents outside this repo can keep POSTing them indefinitely.

**The pipeline is a shape, not a free-for-all.** `nextGigStatuses` says which
moves a status offers and `PATCH /api/gigs/:id` refuses anything else — the
agents PATCH that route too. The entry worth knowing: **there is no route from
`invited` to `declined`.** Declining is their verb; turning down an invitation
is `withdrawn`. One mis-click should not record that you were rejected from a
festival that wanted you.

A screen never offers a move the pipeline refuses: both decision surfaces
derive their buttons from `nextGigStatuses`, and `test/uiConsistency.test.ts`
fails if either starts naming statuses inline again.

### What the calendar is allowed to say

Three kinds of entry, and only the last is a gig:

1. **`Applications open — {name}`** on `opens_at`
2. **`Apply by — {name}`** on the deadline, and again 7 days ahead
3. **`{name}`** on the performance dates — written **only** at `booked`

Entries are reconciled against the row's resulting state rather than fired by
transitions, because a transition handler missed rows that arrived already
shortlisted and happily updated events on rows you had passed on. Reconciling
is idempotent, so a retried request cannot double up, and each entry fails
independently — a Calendar outage costs one entry, never the status change.

Performance dates are **typed, not parsed**: unlike `deadline` they come off an
agreement, so a value that is not a date is a mistake rather than something to
recover a date from. A bad pair makes `showSpan` return null, which the
reconcile reads as "remove the entry" rather than writing a wrong one.

## Applying — phase 3

Once a gig is `shortlisted`, its row on the Gigs screen carries an application
panel: the questions the form actually asks, with an answer staged against each
from the artist database, a checklist of what has to be attached, and — for
opportunities submitted by mail — a draft email.

**It drafts; it never submits.** An application filed by automation is a good
way to be blacklisted, so the output is text you copy into somebody else's
form by hand. The buttons are *Copy* and *This one is right*; there is no
*Send*, and `test/uiConsistency.test.ts` fails if one appears.

**A suggestion is not an answer.** `answer_state` is a column apart from
`answer`, because "the app proposed this" and "you read it and said yes" are
different claims. The readiness line reports *answered* and *read* separately,
and an application of unread suggestions reports itself as unfinished — which
is the failure pre-fill introduces if nothing distinguishes them. Re-reading a
form re-stages only the fields nobody has touched.

Two smaller rules. An answer past the field's `maxLength` is the one problem
rated `danger` with nothing else wrong, because a 150-character field truncates
on paste, silently, mid-word — an empty box is at least honest about being
empty. And a login wall is `blocked`, not `failed`: Submittable is a fact about
the opportunity meaning "set aside an hour and an account", where a timeout
means try again.

Reading a form on a `shortlisted` gig moves it to `preparing`, because staging
answers *is* starting the application. See
[`docs/application-prep-plan.md`](docs/application-prep-plan.md).

## Reading the reply — phase 4

`POST /api/replies/scan` searches the mailbox for answers to the applications
that are out, reads what each one says, and proposes. Nothing it finds moves a
row on its own.

**Replies almost never come from the festival's domain.** Of eight real ones in
this mailbox, one did; the rest came from Wufoo, Jotform, a portal, a parent
organisation and two personal gmail addresses. So matching is on the event's
**name** in the subject or body — including abbreviations, because organisers
write FOTR, FDV and "Road to BOW" — with the domain as a corroborator. The
quoted form receipt underneath a reply is often the only place the event is
named, which is why matching reads the whole body and classification reads only
the top post.

**Confirm once, then remember.** Accepting a match binds the sender address and
the thread to that gig, so an unrelated domain costs one judgement rather than
a permanent problem.

**Every rejection opens by thanking you for applying**, so all four readings
are scored and the strongest wins, with `unclear` when two are close. The
sentence that decided it is stored verbatim and quoted on screen — a reading
you cannot check is a reading you should not trust. Two things the real mail
taught: rejections mostly avoid the word "unfortunately", and a conditional
("if you don't hear from us by June…") is an acknowledgement carrying a date,
not a rejection.

**How far back it looks** is derived, not fixed: to just before the oldest
application still waiting, plus a fortnight, clamped to 30–1095 days. Spam and
trash are searched — a rejection auto-filed as spam is the exact silence this
phase exists to break — and the row says when a message was found there.

See [`docs/reply-matching-plan.md`](docs/reply-matching-plan.md).

## What a trip costs

`shared/gigCost.ts`, migration 0013, and the panel under a gig row. Assembled
on read, never stored — a number cached in March cannot tell you the nights
changed in April.

**Cost is a denominator, not a criterion.** The module estimates money and
stops. It returns no `value`, no `efficiency`, no blended score, and
`test/uiConsistency.test.ts` fails if one reaches the screen. Adding cost to
audience and brand and summing them lets a big crowd outvote a $3,000 trip,
which is not how a budget works; and a single number is how you apply to
something that scored 78 without noticing what it costs.

Three rules it holds throughout:

| Rule | Why |
| --- | --- |
| Every figure is a **range** | `$1,400–2,300` is honest; `$1,847` is a lie with a decimal place |
| A missing input is **never a zero** | No `nights` leaves lodging and per diem out of the sum and names the gap. Zero nights is a real answer some rows have; null is not |
| A guessed band says it guessed | `travel_band` and `lodging_tier` are set by hand; when null they are inferred from the prose location and labelled — the same treatment a deadline recovered from prose gets |

The inputs are on the gig's edit panel: where, country, how you get there,
nights away, room, whether it is a showcase or a paid booking, and anything
they pay you. All optional; a half-filled section gives a partial estimate with
its gaps on screen.

### The P-2, which is a constraint rather than a cost

A Canadian musician doing a **paid** US performance needs a P-2 — roughly
USD 510 to USCIS plus CAD 120 in CFM administration, and **ninety days of lead
time**. A showcase or conference may enter as a B-1 business visitor, which
costs nothing. The same festival is $0 or about $800 on that one fact, which is
why `performance_kind` is a column rather than an assumption, and why leaving
it unstated keeps the ninety days instead of quietly resolving to the free
answer.

The lead time is counted **from the deadline, not from today**: you cannot file
for a performer before somebody has agreed you are performing, and nobody
agrees before applications close. A show 150 days out whose deadline is 100
days out has fifty days, and `visa_risk` says so. The flag outranks every
deadline — a deadline can still be met — and is the third explicit exception in
`awaitingDecision`, so it surfaces even on a row the queue would otherwise call
settled.

### Answering them, and when the mail is read

`info_requested` is the state the plan singled out as the one that stalls if
nobody notices. Two things close that loop.

**The ask is recognised while the body is in hand.** `gig_replies` stores a
400-character snippet, not the email, so `recogniseAsks` runs at scan time and
records what was asked for beside the deciding sentence — an ask can sit four
paragraphs down. Composing the reply happens later, against the artist
database *as it is then*, so an answer that was missing when the mail arrived
and is on file now appears without a re-scan. Rows stored before migration
0015 are re-read from the snippet and marked approximate.

The vocabulary is closed: it matches nouns the library already has a kind for
— a press photo, a stage plot, set length, line-up, availability, a tax form.
A request sentence matching none of them is reported as unrecognised rather
than guessed at, and quoted so you can read it yourself.

`composeReplyDraft` fills what is on file, marks what is not, lists files to
attach and never claims one is attached. It always leaves a gap, because a
draft that reads as finished is the one that gets sent unfinished. **Copy, and
no Send** — sharper here than on an application, because a wrong auto-reply to
a festival that just asked you a question is worse than a slow one.

**The mailbox is swept on the cron**, at 07:00, 12:00 and 18:00 local. Pinned
hours rather than a settings row, the same reasoning housekeeping uses: no
state, no drift, and a missed tick costs a few hours of noticing. The property
that makes an unattended scan safe — a reply you have resolved is never
re-proposed — was already there and simply unused, so a reply sat unseen
exactly as long as you went without opening the page. The scan still writes no
status.

## The artist database

`#artist` holds everything a booking manager could ask for — bios at several
lengths, press photos with their credits, live video, the stage plot, the short
facts a form wants — so no application starts from a blank page. Two things it
does that a folder of files cannot:

- **It expires.** Every asset carries a `review_by`, seeded from its kind when
  none is given: six months for a follower count, a year for a bio or live
  video, two years for a press photo. That is the order they actually rot in.
  `unreviewed` is a state apart from `overdue`, because "this lapsed" and
  "nobody ever claimed this was checked" are different conversations.
  Separately from any date an asset can simply be *broken* — a press photo with
  no photographer credit is unusable the day it is added.
- **It assembles.** The EPK is a **view**, cut per audience — a sync agency
  gets no stage plot and no set length, because nobody licensing a recording
  needs to know how many vocal mics you take — and it reports what is stale or
  missing *inside itself*. A file exported in March cannot tell you its photo
  credit went missing in April.

Each asset also carries the `question_kind` it answers, which is the join to
the form parser and therefore to phase 3.

What is **not** built is sourcing: assets are entered by hand or POSTed by the
research agents. Nothing yet reads the reference docs in D1, Drive or the
website.

### Filling it from the reference documents

`artist_assets` was empty in production from migration 0009 onward, which is
what every *"Nothing on file answers this yet"* in an application panel was
reporting. The facts were never missing — they sit in `reference_docs`, three
markdown documents this app already stores and never read.

`shared/artistSource.ts` reads them on three rules, and the notable thing is
how few there are:

| Rule | Example |
| --- | --- |
| A `##` heading is a question; its body is the answer | `## Genre` becomes the `genre` answer — via `classifyQuestion`, the same function that maps a form field's label |
| A parenthetical in the heading is the variant | `## Approved Short Bio (150 words — Manitoba Music)` is the bio at one length, which is what `pickForLength` chooses between |
| A labelled URL on its own line is a link | `Spotify: https://…` in a platform list |

The third rule deliberately skips a labelled URL **inside a list item**: the
discography lists a Spotify URL under each album, and mining those would file
six records under the one "Spotify link" question.

**No prose is parsed.** The follower counts are the fastest-staling facts here
and a form asks for them as numbers, so the temptation is real — and taking
them means a regex per phrasing, which is `shared/reviewParse.ts` all over
again. A section that cannot be filed is listed in `skipped` and shown on the
page, the same way phase 3 lists the questions it could not answer.

**Everything sourced lands `unreviewed`.** A hand-added asset gets a review
date seeded from its kind, because adding one yourself is a claim that it is
right; a document saying so is not that claim. `GET /api/artist/source`
previews, `POST /api/artist/source` writes, and re-running adds only what is
new — a row is identified by the document and heading it came from, so an
entry you have since edited is never overwritten.

## Notifications

A bell in the header, and **two mechanisms behind one API**.

*Conditions* — a dead Calendar token, an item gone overdue, a reminder pointing
at a deleted row — are derived on every read and never stored; only a per-key
mark records what you have seen. They self-heal: reconnect Calendar and the
notification is gone next read, with nothing needing to remember to delete it.
*Events* — a run finishing, a digest sending — cannot be recovered from current
state, so those get rows and a 30-day prune.

Dismissal therefore means two different things on purpose: a dismissed
condition returns tomorrow because it may still be true; a dismissed event is
gone for good because it already happened.

The badge counts unread, never unresolved — a badge that cannot reach zero
teaches you to stop looking at it — and opening the pane marks nothing read.
See [`docs/notifications-plan.md`](docs/notifications-plan.md).

## The Overview deck

`#overview` opens on one decision at a time, dealt from
`GET /api/review?filter=needs` with the rest of the stack drawn behind it. The
sentence on each card and the labels on its buttons come from
`shared/decisionCopy.ts`, attached to every queue item — so the deck, the
Review screen and anything built later (a digest, a notification) describe the
same item the same way instead of each inventing phrasing.

Buttons carry an *intent* (`confirm_sent`, `approve`, `pass`, `archive`, …),
not a status. Intents resolve to a status per entity type through
`GIG_STATUS_BY_INTENT` in `shared/decisionCopy.ts`, beside the copy that
decides which actions a card may offer — because "pass" means `passed` on a gig
and `declined` on a sync target, and because a table in the browser is one
nothing can check against the pipeline. `decisionFor` drops any action the
row's status does not offer, including one whose target is the status the row
already has: *"Keep for next cycle"* on an already-shortlisted gig wrote
nothing and dealt the identical card straight back.

### On the clock

Below the deck, everything carrying a date: passed deadlines, deadlines inside
two weeks, windows opening inside sixty days, and pending reminders — one list,
`TimingStrip`. The bands come from `summary.timing` on the same `/api/review`
response that fills the deck, so the strip cannot call something urgent that
the deck does not rank.

A date recovered from prose renders as *"about Sep 3 — recovered from the
note"* rather than as a plain countdown. Until the backfill has run everywhere,
some of these dates are inferences, and a countdown that hides that is worse
than no countdown.

### Open anytime

One row, `OpenEndedRow`: how many live opportunities have no date of any kind.
They are open right now, permanently, nothing will ever make them urgent, and
no other screen can say they exist. This is where the backlog actually is — see
§1 of the redesign plan for the counts that led here.

### Snoozing

A row can say "not now, ask me in September". `POST /api/review/snooze` is the
only thing that writes `snoozed_until`, because it also writes `snoozed_at` and
the two are only meaningful together: the queue wakes a snoozed item early if
`updated_at` has moved past `snoozed_at`, so a snooze set without the stamp
would break on the write that created it.

That early wake is deliberate. A snooze is a judgement about a set of facts, so
once a research run gives the row a deadline or a fee, the judgement was about a
different item and it comes back with an explanation rather than sitting until
its date.

Snoozed items are excluded inside `matchesFilter()` — one gate ahead of every
predicate, `all` included — rather than dropped from the queue, so the
**Snoozed** filter can list them and every one has a "Bring it back now" beside
it. A queue that hides things with no way to look is worse than one that nags.

Offered dates come from `shared/snoozeOptions.ts`: the item's own dates where
it has them ("when it opens", "a week before the deadline"), generic intervals
otherwise, and never a date at or past a live deadline — deferring something
past the point of acting on it is archiving it in disguise.

### Data health

A quiet last line counting what is wrong with the *data* rather than what needs
deciding — contradictory statuses, deadlines still stored as prose, reminders
pointing at rows that no longer exist. Each links into the filtered queue.

Orphaned reminders are counted at every status, not just `pending`. Filtering
to pending undercounts: production held two and the row reported one, because
the dismissed orphan was excluded and so stayed invisible indefinitely. A
dismissed reminder aimed at a deleted row still is not sound data — this block
is about whether the data holds together, not about what is nagging you today.
It renders nothing once the counts are zero, and the block should be deleted
when they stay that way; a permanently clean health row is furniture.

### Automation activity

The Overview shows five runs, one line each, with the summary behind a
disclosure — `ActivityList`. The summaries are three to five lines of agent
prose apiece; inline they were the bulk of the page. Full history stays on the
History screen (`#runs`), which filters by task and status server-side —
narrowing one page of a paginated log would hide every failure on the others.

## The Review screen

`#review` is the triage queue: one prioritised list of everything waiting on a
decision, with the full context for the selected item beside it. It reads
`GET /api/review`, which is where the queue is actually built.

Two things about it are worth knowing before changing it:

- **It does not build its queue from `status`.** No production row carries
  `pending_review` / `draft_ready` / `draft`, so a status-driven queue would
  be empty. What actually records "waiting on Doug" is prose in the note
  columns, so `shared/reviewQueue.ts` combines the parsed note with the
  workflow status — and surfaces the cases where the two contradict each other
  as the highest-priority flag. That logic runs in the Worker, so every screen
  asking "what needs a decision" gets one answer.
- **`shared/reviewParse.ts` is a stopgap.** It pulls entry-fee warnings,
  drafted application values, outreach copy, requirements, deal terms,
  blockers and window dates back out of `gig_opportunities.fit_notes` and
  `sync_targets.notes` at read time, because the structured columns added in
  migration 0001 were never backfilled (all NULL in production). Read
  [`docs/notes-field-audit.md`](docs/notes-field-audit.md) for the inventory,
  the proposed columns, and the data-integrity issues found along the way; the
  parser should be deleted once the backfill lands.

### `shared/` and why it exists

`shared/` holds the wire types, the review queue, the digest content, the gig
status vocabulary, the artist database and application staging, and is included
by both `tsconfig.json` and `tsconfig.frontend.json`. The Worker imports it for
real — `GET /api/review` builds the queue — while the frontend imports mostly
its *types*, so none of the note parser ships to the browser (it is
`import type` throughout; the client bundle is ~11 kB smaller for it). The
vocabulary modules are the deliberate exception: a screen offering a gig
transition has to ask `nextGigStatuses` which ones exist rather than keeping
its own list. `shared/gigCost.ts` is the second: the cost panel is assembled
in the browser from the row it already has, and a duplicate set of travel
bands living in `frontend/` is exactly the drift this directory exists to
prevent.

Keep it that way. Anything added to `shared/` must run in a Worker: no DOM,
no React, no Node built-ins. And if a screen needs to know what requires a
decision, it asks `/api/review` — it does not re-derive the answer locally.
That duplication is exactly what this directory exists to prevent.

## The weekly digest

A Cron Trigger builds a digest and emails it. It is a **diff, not a report**:
four groups — new since
last time, now actionable, changed under you, going stale — each dropped when
empty, and nothing sent at all when every group is.

`shared/digest.ts` decides what is worth saying and is pure — no I/O, no
formatting — so it is testable without a database or a mailbox.
`src/lib/digestMail.ts` decides how it looks. Changing the wording of a heading
should not risk changing who gets reported.

**Never repeating an unchanged item** is enforced by `digest_reports`, one row
per item holding a fingerprint of the facts as reported. `updated_at` is
deliberately excluded, so a research run rewording a note resurfaces nothing.
The one deliberate exception is "going stale": those items never change, so a
strict rule would mention each once and hide the pile forever. They repeat on a
28-day cooldown instead.

Marks are written **after** a successful send. Marking first would let a failed
send swallow a week of changes.

### When it goes out

The cron ticks **hourly** (`0 * * * *`) and `isDigestDue` decides whether the
hour that just started is the one, because the day, hour and time zone live in
`app_settings` where the Settings screen can change them without a deploy.

That indirection fixes something a cron expression cannot: cron is UTC
year-round, so a fixed hour drifted against Winnipeg every time the clocks
changed. The zone is applied when the comparison is made instead. The rule is
"on the configured day, at or after the configured hour, once per day" rather
than an exact match, so a deploy landing on the hour or a trigger running late
does not cost a whole week silently — and the once-per-day guard is what stops
`>=` sending every hour until midnight, and what keeps the clocks going back
from producing two sends.

### Sending

`env.EMAIL.send()`, via Cloudflare Email Service's `send_email` binding — no
API key, no third-party account, and the Gmail token stays `readonly` because
nothing here touches it.

`allowed_destination_addresses` in `wrangler.toml` is the real security
boundary: the Worker can send to those addresses and nowhere else, whatever
this code does.

| | |
| --- | --- |
| **Free** | Sending to a **verified destination address** on the account — free on every plan, does not touch the monthly quota |
| **Paid** | Any other recipient — requires Workers Paid |

`dougmcarthur0@gmail.com` is the free path and is the default. Whether
`doug@dougmcarthur.net` also qualifies depends on it being added and verified
under Email Routing → Destination Addresses; both are allowlisted so switching
is a setting change, not a deploy.

Setup, once:

1. Enable Email Routing on the domain and verify the recipient under
   **Destination Addresses**.
2. Onboard the domain for sending (SPF + DKIM) so the `from` address is
   authorised.
3. Turn the digest on in **Settings**. It ships **off** — a deploy never starts
   emailing by itself.

> Sends made through the binding show as **dropped** in the Email Routing
> summary even when they were delivered. That is expected; outbound success
> lives under Email sending metrics.

### Checking it without waiting a week

`GET /api/digest/preview` renders exactly what a send would produce and writes
no marks, so previewing has no side effects. The Settings screen shows the
subject line, the group counts and every line, with **Send now** beside it.

| Route | Purpose |
| --- | --- |
| `GET /api/digest/preview` | What would be sent, plus why it would or would not send |
| `POST /api/digest/send` | Send now. Refuses when there is nothing to report |
| `PATCH /api/digest/settings` | On/off, recipient, sender, day, hour, time zone |

## Local development

```bash
npm install

# Terminal 1 — API on http://localhost:8787 (Wrangler + local D1)
npm run dev:api

# Terminal 2 — UI on http://localhost:5173 (Vite; proxies /api → :8787)
npm run dev:ui
```

Copy `.dev.vars.example` to `.dev.vars` and fill in the Google/Gmail secrets
for local integration testing (see `docs/google-calendar-setup.md` and
`docs/gmail-setup.md`). `.dev.vars` is gitignored.

First-time local DB setup — this works from a clean checkout:

```bash
npm run db:migrate:local
```

It applies `schema.sql` first when the local database is empty, because
migration 0001 opens with `ALTER TABLE gig_opportunities`: production was
created from `schema.sql` by hand before anything went through the ledger, so
remote has carried that baseline all along and only a fresh local database ever
noticed. `scripts/bootstrap-local-db.mjs` does the check; it is a no-op once
the baseline is there, and nothing about it reaches the remote database or its
ledger.

## Database & migrations

Schema is defined in Drizzle (`src/db/schema.ts`). To change it:

```bash
npm run db:generate          # generate a migration from schema changes
npm run db:migrate:local     # apply to the local D1 instance
npm run db:migrate:remote    # apply to production D1 (rarely needed — see below)
```

**Merging is what applies a migration.** CI runs
`wrangler d1 migrations apply --remote` before every deploy, so the
`d1_migrations` ledger stays honest without anyone remembering to keep it that
way. Migrations 0006–0008 were applied by hand before that and had to be
back-filled into the ledger afterwards; **never hand-run schema SQL against
production**, because a statement applied outside the ledger is invisible to
it and the next CI run re-runs the file and aborts on a duplicate column.

**Migrations must be additive.** CI migrates *before* it deploys, so for the
half-minute between those two steps the new schema runs under the
currently-live Worker. Adding a column or a table is always safe that way;
renaming a stored value is not, and is done as two deploys instead — teach the
code to read both spellings, ship that, migrate the data later.
`normaliseGigStatus` is what step one looks like.

Migration 0004 adds `snoozed_until` and `snoozed_at` to `gig_opportunities`
and `sync_targets`. No backfill — every existing row is simply not snoozed.

Migration 0005 adds `digest_reports` and `app_settings`. No backfill either:
an empty `digest_reports` means the first digest reports everything as new,
which is correct for a first run.

`schema.sql` is a historical snapshot of the original production schema; the
current schema is the sum of that plus everything in `migrations/`. Some legacy
gig columns (`fee`, `fit_notes`) are retained during the structured-column
migration — `scripts/backfill-structured-columns.js` populates the new columns.

### The deadline backfill

Migration 0003 splits the gig deadline into `deadline` (ISO date),
`deadline_note` (the qualifier) and `opens_at` (when a window opens), because
26 of 34 production rows hold prose in a column everything else treats as a
date. Run it after applying the migration:

```bash
npx tsx scripts/backfill-deadlines.ts --remote            # dry run, prints every change
npx tsx scripts/backfill-deadlines.ts --remote --apply
```

Dry run is the default; nothing is written without `--apply`. `tsx` comes in
with the existing devDependencies, so `npm ci` is enough to run it. The extraction is
`splitDeadline()` from `shared/reviewParse.ts` — the same function the Worker
already uses to read these rows, so a disagreement between the backfill and the
UI is a bug in one function rather than a difference of opinion between two.
Reversible: the original value is kept verbatim in `deadline_note` whenever it
held anything beyond a date.

## Deploying

Pushing to `main` deploys automatically. `.github/workflows/deploy.yml` runs
typecheck, the tests, the tests again a day ahead, the frontend build, then
lists and applies pending D1 migrations, deploys, and reports which version
went live. The Actions tab shows every deploy tied to its commit; the workflow
can also be run manually from there.

**Reading a red run.** `wrangler deploy` is three API calls — assets, Worker,
triggers — and the Worker is live after the second, so a failure on the third
means "deployed, cron schedule possibly not re-sent" rather than "nothing
shipped". That third call has twice returned `Received a malformed response
from the API`, which is Cloudflare handing wrangler an HTML error page instead
of JSON. The step retries three times; the whole command is idempotent.

Two other steps earn their shape. `d1 migrations list` retries, being a pure
read — a flake there once took `main` down for a reason unrelated to the code.
`d1 migrations apply` deliberately does **not**, because "try it again" is the
wrong instinct about a write that may have half-landed.

There is no HTTP smoke test on purpose: Access sits in front of the domain, so
a runner only ever reaches the login redirect. `wrangler deployments status` is
the last step instead — it asks Cloudflare what is serving traffic rather than
inferring it from an exit code.

It needs two repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with **Workers Scripts → Edit**, **D1 → Edit** and **Account Settings → Read**, scoped to the account owning this Worker |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |

**D1 · Edit, not Read.** `wrangler d1 migrations list` hits the write-capable
`/query` endpoint, so a read-scoped token fails with `code: 7403` — and because
`wrangler deploy` never touches D1, that gap stays invisible until a migration
step tries to use it.

The job targets the `production` GitHub environment, so required reviewers or
a wait timer can be added under Settings → Environments without editing the
workflow.

To deploy by hand instead:

```bash
npm run build                # build:ui, then predeploy (typecheck + test), then deploy
```

Use `npm run build`, not `npm run deploy` — `deploy` alone publishes the Worker
with whatever is already in `dist/`, so the frontend would not be rebuilt.

Set production secrets once with `wrangler secret put`:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
`GOOGLE_CALENDAR_ID`, and `GMAIL_REFRESH_TOKEN`.

### Before you deploy

- `compatibility_date` in `wrangler.toml` was originally a best-effort guess
  (set to the Worker's `created_on`). Confirm it against the live Worker
  settings if you haven't already.
- Run `wrangler whoami` and `wrangler deploy --dry-run` to confirm the config
  matches the live Worker before publishing.
