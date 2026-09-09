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

`npm run db:migrate:local` works from a clean checkout. It did not until
recently: migration 0001 opens with `ALTER TABLE gig_opportunities`, because
production was created from `schema.sql` by hand before anything went through
the ledger, so the remote database has carried that baseline all along and an
empty local one died on `no such table` at the first file.
`scripts/bootstrap-local-db.mjs` applies `schema.sql` first, and only when the
baseline is missing — a check rather than rewriting that file's statements to
be idempotent, since it is the verbatim record of what production looked like
before 0001. No `0000` migration was introduced, so the remote ledger has
nothing new to reconcile.

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

**A reply is matched by name, not by domain.** Of eight real organiser replies
in this mailbox exactly one came from the festival's own domain; the rest came
from Wufoo, Jotform, a portal, a parent organisation and two personal gmail
addresses. `shared/replyMatch.ts` scores the event's *name* in the subject or
body — full name with punctuation squashed, most distinctive word, and
abbreviations including of part of the name (FOTR, FDV, "Road to BOW") — with
the domain as a corroborator worth less than the name. Names are tokenised two
ways on purpose: without splitting camel case, so "LieLow" stays one
distinctive token rather than `lie` + `low`; and with splitting it, so
"BreakOut West" yields BOW. Getting that backwards loses LieLow entirely, which
is how it was found.

**Matching reads the whole body; classification reads only the top post.** The
quoted form receipt underneath a reply is often the only place the event is
named — LieLow's rejection has the festival nowhere in its subject — and it is
never the organiser's answer. Two questions, two texts.

**Confirm once, then remember.** Accepting a match writes the sender address
and the thread into `gig_correspondents`, and bindings are decisive rather than
ranked against guesses. That is what makes an unrelated sender domain a
one-time cost. When two gigs match equally well the reply is stored with no gig
attached: naming one would invent the answer the matcher just said it lacked.

**Every rejection opens by thanking you for applying.** So `classifyReply`
scores all four readings and takes the strongest, returning `unclear` when two
are close — a first-match rule that checked acknowledgement early would file
every rejection under it. Two more things the real mail taught: rejections
mostly avoid "unfortunately" ("we won't be moving forward", "was not
selected"), and a conditional — "if you don't hear from us by June, it means we
weren't able to make it work" — is an acknowledgement carrying a date, not a
rejection. The deciding sentence is stored verbatim; a reading you cannot check
is a reading you should not trust.

**An ask is recognised while the body is in hand; the answer is drafted on
read.** `gig_replies` keeps a 400-character snippet, not the email, so
`recogniseAsks` runs at scan time and stores what was asked for — the same
move `classifyReply` already makes with the deciding sentence. Composing the
reply happens later, against the artist database *as it is then*, so an answer
missing in March and on file in April appears without a re-scan. A row stored
before migration 0015 is re-read from the snippet and marked `approximate`,
the treatment a deadline recovered from prose gets.

The ask vocabulary is closed on purpose: it matches nouns the library already
has a kind for, and a request sentence matching none of them is reported in
`unrecognised` rather than guessed at. `composeReplyDraft` fills what is on
file, marks what is not, lists files to attach and never claims one is
attached — and always leaves a gap, because a draft that reads as finished is
the one that gets sent unfinished. Copy, no Send;
`test/uiConsistency.test.ts` fails if a Send button appears, and that guard
matches a short element label rather than any prose so the caption telling you
to send it yourself does not trip it.

**The mailbox is swept on the cron, three times a day.** `REPLY_SCAN_HOURS`
is 7, 12 and 18 local, pinned like housekeeping's 3am rather than tracked in a
settings row: no state, no drift, and a missed tick costs a few hours of
noticing. The property that makes this safe was already there — a reply you
have resolved is never re-proposed — it was just unused, so a reply sat unseen
exactly as long as you went without opening the page. The scan still writes no
status.

**The reply router never writes a status.** Accepting binds the correspondent
and records the judgement, and stops; moving the row is `PATCH /api/gigs/:id`,
which owns what a transition means. Two calls is the correct number — they can
be wrong independently, and a wrong auto-transition tells you that you were
rejected when you were not. See `docs/reply-matching-plan.md`.

**The artist database fills itself from the documents that already describe
him.** `artist_assets` was empty in production from migration 0009 until
`shared/artistSource.ts`, which is why every application panel said "Nothing
on file answers this yet" — the facts were never missing, they sat in
`reference_docs` and nothing read them. Three rules do the extraction and none
of them reads a sentence: a `##` heading is a question (`classifyQuestion`
maps it, the same function that maps a form field's label), a parenthetical in
that heading is the `variant`, and a labelled URL on a line of its own is a
link. Deliberately **not** a labelled URL inside a list item — a Spotify link
under an album is about that album, and mining those would file six records
under one question. A section it cannot file is named in `skipped`, never
guessed at: prose parsing is what `reviewParse.ts` is, and that is the debt
this repo is trying to delete rather than repeat.

Everything sourced lands with **`review_by` null**, which reads as
`unreviewed`. A hand-added asset gets a date seeded from its kind because
adding one yourself is a claim it is right; a document saying so is not the
same claim. `GET /api/artist/source` previews and `POST` writes, and
`test/uiConsistency.test.ts` fails if the panel loses the preview step. The
known false positive is pinned rather than patched: the writing style guide's
"Voice in One Sentence" reads as a one-liner, which `classifyQuestion` is
right to think and a human is right to archive.

**A cost is a denominator, never a criterion.** `shared/gigCost.ts` estimates
what a trip costs and stops there. It returns no `value`, no `efficiency` and
no blended score, because the swing weights that would produce one have not
been elicited and inventing them is worse than not having them — and because a
single number is how you apply to something that scored 78 without noticing it
costs $4,000. Two rules the module holds throughout: every figure is a
**range**, since `$1,847` is a lie with a decimal place; and **a missing input
is never a zero** — no `nights` leaves lodging out of the sum and names it in
`unknowns` rather than becoming a day trip. A band nobody set is inferred from
the prose location and labelled as guessed, the same treatment a deadline
recovered from prose gets. See `docs/gig-pipeline-plan.md` §7.

**The visa lead time counts from the deadline, not from today.** A Canadian
musician doing a paid US performance needs a P-2: about $800 and ninety days.
You cannot file for a performer before somebody has agreed you are performing,
and nobody agrees before applications close — so a show 150 days out whose
deadline is 100 days out has *fifty* days, not 150. `visaLead` measures it that
way and `visa_risk` is the flag, weighted above every deadline: a deadline can
still be met, and paperwork that takes ninety days cannot be hurried. An
unstated `performance_kind` keeps the ninety days rather than resolving to the
free answer, and says it is asking rather than asserting — the cheap
resolution is how you find out with sixty days left.

**The note parser moved to write time; it did not go away.** Migration 0001's
columns were never filled, so `shared/reviewParse.ts` re-derived them on every
read — the oldest debt in the repo. `shared/noteColumns.ts` now extracts the
six worth storing (`submission_state` and `blocked_on` from migration 0016,
`submission_method`/`fee_amount`/`fee_currency` from 0001, `location` from
0013) and the gig and sync routes run it **on insert and on a rewritten
note**, with `POST /api/backfill/notes` applying the same extraction to older
rows behind a preview.

The plan's last step — "once backfilled, the parser is deleted" — is not
reachable, and this is the thing to know before trying again: the research
agents write prose from outside this repo, so a backfill alone leaves every
*future* row with a filled note and empty columns. Extraction has to keep
happening; only its timing changed.

Two rules hold it together. **A column that already holds something is never
overwritten** (`changesFor`), so a value you set by hand survives an extractor
re-run and the backfill is idempotent — and `updated_at` is left alone, because
filling a column from a note that already said so is not a change to the row
and would wake every snooze in the table. **Cached rendering is not a schema**:
`requirements`, `dealTerms`, `provenance` and the drafted values are rendered
and never queried, so storing JSON copies would be a parser cache with a
staleness bug the read-time version cannot have. They stay derived, and
`organizer`, `audience_size`, `genre_fit_score` and `agency_type` stay NULL,
because no note carries them in a form anything can read.

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
