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
