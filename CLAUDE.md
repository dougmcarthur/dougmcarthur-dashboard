# Music HQ

Cloudflare Worker (Hono) + D1 + a React/Vite/Tailwind dashboard, for one
person's gig, sync and promo pipeline. Deployed by GitHub Actions on every push
to `main`.

## Database changes go through wrangler migrations, applied by CI

Write a numbered file in `migrations/` and merge it. The deploy workflow runs
`wrangler d1 migrations apply --remote` before deploying the Worker — nothing to
run by hand, and the `d1_migrations` ledger stays honest on its own.

**Never hand-run schema SQL against production**, through the Cloudflare API or
anything else. A statement applied outside the ledger is invisible to it, so
the next CI run re-runs the file and aborts the batch on a duplicate column.
0006, 0007 and 0008 were each applied by hand before CI did this, and had to be
back-filled into the ledger afterwards; `SELECT name FROM d1_migrations` is the
check if anything looks off.

`wrangler` cannot authenticate from a Claude Code session — the credentials
live in GitHub Actions secrets and a remote session does not inherit them. That
is now fine rather than an obstacle: merging is how a migration gets applied.

The CI token needs **D1 · Edit**, not Read. `wrangler d1 migrations list` hits
the write-capable `/query` endpoint, so a read-scoped token fails with
`code: 7403` — and because `wrangler deploy` never touches D1, that gap stays
invisible until a migration step tries to use it.

### Migrations must be additive

CI migrates *before* it deploys, so for the half-minute between those two steps
the new schema runs under the currently-live Worker. Every migration has to be
readable by the code already in production.

Adding a column or a table is always safe that way. **Renaming a stored value
is not**, and is done as two deploys instead:

1. Teach the code to read both spellings, and ship that.
2. Migrate the data in a later change.

`normaliseGigStatus` in `shared/gigStatus.ts` is what step 1 looks like — it
maps `approved` to `shortlisted` on read and on write, which is also what lets
the out-of-repo research agents keep POSTing the old vocabulary indefinitely.

A migration that errors is rolled back by wrangler with the previous one left
applied, and the failed step stops the deploy — so a bad migration leaves old
code against old schema, which is at least a consistent pair.

## The deploy, and how to read a red run

`.github/workflows/deploy.yml` on every push to `main`: typecheck, tests, tests
again a day ahead, build, list migrations, apply them, deploy, report what went
live. Six of the first 37 runs failed, and they fall into four kinds — worth
knowing apart, because only one of them is still live and it is the one that
looks most alarming.

**A red run does not mean nothing shipped.** `wrangler deploy` is three API
calls — upload the assets, upload the Worker, set the triggers — and the Worker
is live after the second. Twice the third has failed on

```
No targets deployed for dougmcarthur-dashboard
✘ [ERROR] Some triggers failed to deploy:
    - Received a malformed response from the API
```

which is the Cloudflare API returning something wrangler cannot parse, usually
an HTML error or block page instead of JSON. It says nothing about this
repository, a re-run fixed it both times, and by the time it fires the deploy
has *mostly succeeded*: what did not happen is the cron schedule being
re-sent. The deploy step now retries three times, since the whole command is
idempotent — re-uploading the same bundle and re-sending the same cron list
converges. `Deployed … triggers` in the log is the line that says the third
call landed; `No targets deployed` on its own is normal here, because
`workers_dev = false` and the custom domain is attached in the dashboard rather
than declared as a route.

**"Show pending migrations" failing means the token, not the code.** `wrangler
d1 migrations list` hits the write-capable `/query` endpoint, so a read-scoped
token fails `code: 7403` — see above. It is a pure read, so it retries too;
`migrations apply` deliberately does not, because "try it again" is the wrong
instinct about a write that may have half-landed.

**A test that passed locally and fails in CI is probably the clock.** The
runners are UTC and this is written in Winnipeg, so a fixture with a hardcoded
date can go stale in the hours between. That cost run 28. CI now runs the suite
twice, the second time under `TZ=Pacific/Auckland`, so the check CLAUDE.md
prescribes is no longer one anybody has to remember.

**There is no HTTP smoke test, on purpose.** Cloudflare Access sits in front of
`dashboard.dougmcarthur.net`, so a request from a runner gets the login
redirect and never reaches the Worker. A check that can only ever see the front
door proves nothing and adds a way for a good deploy to go red. `wrangler
deployments status` is the last step instead: it asks Cloudflare what is
serving traffic rather than inferring it from an exit code.

`wrangler` is at 4.129.1 and `@cloudflare/workers-types` at 5. They move
together — 4.129 peers on `^5`, so bumping one alone fails to resolve. The
types major turned out to cost nothing here: nothing this Worker names changed,
which is worth knowing mainly so the next bump is not put off on the assumption
that it will hurt. Neither was a fix for the flake above, which is server-side.

The one behaviour CI genuinely depends on, and which nothing in the repo would
catch if it changed, is that `d1 migrations apply` answers its own confirmation
prompt when stdin is not a terminal — `🤖 Using fallback value in
non-interactive context: yes`. There is no `--yes` flag to fall back on. Check
that line still appears in the run log after a wrangler bump.

## Conventions worth knowing before changing things

**Statuses say who decided.** `shortlisted`/`passed` are the artist's
decisions; `invited`/`declined` are the organiser's. The old `approved` and
`rejected` failed this and caused a real misreading — `rejected` meant *you*
passed. `normaliseGigStatus` maps legacy spellings forward on read and write,
because the research agents that POST rows live outside this repo. See
`docs/gig-pipeline-plan.md`.

**Notifications are two mechanisms behind one API.** *Conditions* are derived
on every read and self-heal when they stop being true; *events* are rows,
because a run finishing is not recoverable from current state. Dismissing a
condition lasts a day; dismissing an event is permanent. See
`docs/notifications-plan.md` and `shared/notifications.ts`.

**The pipeline is a shape, not a free-for-all.** `nextGigStatuses` in
`shared/gigStatus.ts` says which moves a status offers, and the PATCH route
refuses anything else — the research agents PATCH that route too. The entry
worth knowing: **there is no route from `invited` to `declined`.** Declining is
their verb; turning down an invitation is `withdrawn`. One mis-click should not
be able to record that you were rejected from a festival that wanted you.

**A screen never offers a move the pipeline refuses.** The PATCH route
validates against `nextGigStatuses`, so a button naming a status is a claim
about legality, and two decision surfaces made that claim wrong: the Review
action bar offered a fixed *Will apply / Applied / Pass / Archive* whatever the
row's status was — on a `submitted` gig all four returned 400, and an `invited`
one had no way to record a booking — while the Overview deck resolved its
intents through a table in the browser that nothing could check. Both now
derive from `nextGigStatuses`, and `decisionFor` drops any action the row's
status does not offer. A same-status target counts as refused too: *"Keep for
next cycle"* on an already-shortlisted gig wrote nothing and dealt the
identical card straight back. `test/uiConsistency.test.ts` fails if either
surface starts naming statuses again.

**Two statuses mean the ball is back with you.** `info_requested` and `invited`
sit in the follow-up phase, so `hasBeenSubmitted` was filing them under
"waiting on the organiser" and the queue treated the whole phase as settled —
which meant `info_requested`, the state that exists *because* it stalls if
nobody notices, was the one state guaranteed to go unnoticed. `awaitsYourReply`
in `shared/gigStatus.ts` splits them out; they carry a `reply_due` flag that
outranks every deadline. The Review screen has a **Waiting on them** filter for
the other side of that line, because clicking "Applied" used to make a gig
vanish from every filter but Everything.

**Silence is a signal, and the only one that is an absence.** An unanswered
application produces no note, no status change and no deadline, so nothing
could raise it until `submitted_at` existed to measure from (migration 0010).
`submissionSilence` in `shared/reviewQueue.ts` returns the days and an `exact`
flag; past `NO_REPLY_DAYS` it becomes a `no_reply` flag, which is the second
explicit exception in `awaitingDecision` — `isSettled` is right that a sent
application is settled, and silence is the case where waiting for the queue to
raise it on its own means waiting forever.

`submitted_at` was **not backfilled**, on purpose. `updated_at` is the only
candidate and it is the wrong answer: any later edit moves it forward, so a row
sent in January and touched in February reports one month of silence instead of
two. Rows that reached the phase before 0010 fall back to `updated_at` with
`exact: false`, and every surface that shows the number says "about" — the same
treatment a deadline gets when its date was recovered from prose. The fallback
can only *under*-report, which is the safe direction for a nudge, but only
while nothing displays it as certain.

**Performance dates are typed, not parsed.** `performance_start` /
`performance_end` are the only dates that mean a stage, and unlike `deadline`
they never hold prose — they come off an agreement, so a value that is not a
date is a mistake rather than something to recover a date from.
`shared/performance.ts` validates them and builds the calendar span; a bad pair
makes `showSpan` return null, which the reconcile reads as "remove the entry"
rather than writing a wrong one. Google's all-day `end.date` is exclusive, which
is why the field is called `endDateExclusive` at every layer.

**Status columns are not a closed set.** `shared/types.ts` types them as
`string` deliberately — production rows carry values outside every union the UI
offers. Narrowing them is a claim the data does not support.

**The artist database expires on purpose.** Every row in `artist_assets`
carries a `review_by`, seeded from its kind when one is not given —  six months
for a follower count, two years for a press photo. `assetHealth` in
`shared/artistAssets.ts` reads that against a `today` it is handed, never the
clock. `unreviewed` is a separate state from `overdue` on purpose: "this
lapsed" and "nobody ever claimed this was checked" are different conversations.
Separately from any date, an asset can be *broken* — a press photo with no
photographer credit is unusable the day it is added.

**An EPK is a view, not a document.** `assembleEpk` cuts the same library
differently per audience and reports what is stale or missing inside it. A file
exported in March cannot tell you its photo credit went missing in April, which
is the whole reason this is assembled on read.

**The app drafts an application; it never submits one.** Phase 3 reads the
form, stages an answer per field from the artist database and lists what has to
be attached — and then stops, because an application filed by automation is a
good way to be blacklisted. The output is text to copy. `ApplicationPanel` has
Copy and *This one is right*, no Send, and `test/uiConsistency.test.ts` fails if
a button appears claiming otherwise. See `docs/application-prep-plan.md`.

**A suggestion is not an answer.** `answer_state` is a column apart from
`answer` for the same reason `unreviewed` is a state apart from `overdue`: "the
app proposed this" and "you read it and said yes" are different claims, and an
application of twelve unread suggestions is the failure pre-fill introduces if
nothing distinguishes them. The readiness line reports *answered* and *read*
separately, and `sendable` needs the second. Re-reading a form re-stages only
`empty` and `suggested` fields — your writing is never overwritten by a fetch.

**An over-long answer is worse than an empty box.** A 150-character field
truncates on paste, silently, mid-word, so an answer past `maxLength` is the one
field problem rated `danger` with nothing else wrong. An empty box is at least
honest about being empty.

**A login wall is a fact about the opportunity, not an error.** `prep_status`
splits `blocked` (Submittable, a JavaScript-rendered Typeform, a page with no
form on it — retrying is pointless, this one is filled in by hand) from `failed`
(a timeout, a 403 — worth another go, and the HTTP status is kept because 403
and 404 are different stories).

**Deadlines are often prose.** 26 of 34 gig rows hold things like "None —
rolling artist roster intake" in `deadline`. Anything wanting a real date must
go through `splitDeadline`, which returns null rather than guessing. Where a
date *is* recovered from prose, show the prose too — a recovered date must not
look as certain as one the column actually held.

**The queue never reads the clock.** `buildReviewQueue({ today })` threads that
date all the way through, including into `parseDeadline` and `daysUntil`. Do
not reach for `new Date()` in queue, digest or flag logic; take the date as an
argument.

This was half-true for a long time and cost a deploy: `today` reached the
snooze maths while `daysUntil` read the real clock, so a fixture asserting a
row was "due soon" passed until real time crossed its deadline, then failed in
CI on an unrelated change. Same inputs must mean the same thing on every run.

**One predicate decides what needs a decision.** `awaitingDecision` in
`shared/reviewQueue.ts` is used by the Review filter *and* the weekly digest.
They answered separately once, and the email counted rows under a bucket whose
link the page then refused to show. The digest still reports more than the
queue — the idle piles carry no flags and are the shape of the backlog — but
anything it counts under a *flag* bucket has to be something the filter will
show.

**Note prose names the artist.** The research agents wrote "pending Doug's
review", so `depersonalise` rewrites the name into the second person on the way
to the screen; the stored text is untouched. Two rules it must keep: pronouns
are only rewritten inside sentences that named him, or "his deadline" in a
sentence about an organiser becomes yours; and drafted field *values* are
exempt, because "Contact Name: Doug McArthur" is the answer that goes on the
form, not the app talking.

**Buttons and inputs come from `components/ui/`.** `Button` takes a variant
named for meaning (`primary`, `neutral`, `quiet`, `good`, `danger`, `info`),
`Field` exports `FIELD` and `FILTER`. Fourteen hand-rolled button strings and
five copies of the input string preceded them, and eight of those buttons set
`hover:bg-X` while already painted `bg-X` — a hover that rendered as none.
`test/uiConsistency.test.ts` fails if either comes back.

## Testing

`npm test` (vitest) — pure logic in `shared/` is well covered; routes are only
tested for registration and validation, because there is no D1 in the test
environment. `npm run typecheck` covers both the Worker and the frontend.

Screenshots verify design, not geometry. A chart whose bars all had width 0
passed visual review twice — probe computed styles when layout correctness
matters.

Fixtures use dates relative to their own `TODAY`, never to the real clock. A
suite that passes today and fails tomorrow is worse than one that fails now,
because it fails in CI on somebody else's change. `TZ=Pacific/Auckland npm test`
is a cheap check: it runs a day ahead.

Some mistakes typecheck and render, so they need source-level tests rather than
behavioural ones — see `test/uiConsistency.test.ts`, which reads the JSX and
fails on a dead hover state or a re-declared input class.
