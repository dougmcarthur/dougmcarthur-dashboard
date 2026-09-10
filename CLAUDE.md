# Sun Dogs Music Scout

Cloudflare Worker (Hono) + D1 + a React/Vite/Tailwind dashboard, for one
person's gig, sync and promo pipeline. Deployed by GitHub Actions on every push
to `main`.

**The name is a house mark plus a product name**, and the shape is deliberate:
*Scout*, by *Sun Dogs Music*. The bare word attracts an aggressive rights
holder — Scouting America litigates on a dilution theory, including against
businesses in unrelated trades — so the product is never branded on "Scout"
standing alone. Say Scout, write Sun Dogs Music Scout. "Music Scout" is
avoided on purpose: in the trade that phrase means an A&R person who scouts
*talent*, which is the reverse of what this does.

Infrastructure identifiers still carry the old name — the D1 database is
`dougmcarthur-music-hq` and the Worker is `dougmcarthur-dashboard`. Neither is
user-visible and neither can be renamed by editing a string: a D1 rename is a
data migration, and a Worker rename is a new Worker with its domains and
secrets re-attached. They stay until there is a reason worth that.

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

**There is still no HTTP smoke test.** It used to be impossible: Cloudflare
Access sat in front of `dashboard.dougmcarthur.net`, so a request from a runner
got the login redirect and never reached the Worker. Since passkey login
replaced Access the request does reach the Worker — and gets a 401, because
every `/api` route now needs a credential. So the reason changed and the
conclusion did not: a check that can only ever see the front door proves
nothing and adds a way for a good deploy to go red. `wrangler deployments
status` is the last step instead: it asks Cloudflare what is serving traffic
rather than inferring it from an exit code.

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

**The Worker is the security boundary now, and it was not before.** Cloudflare
Access used to authenticate at the edge — it emailed a six-digit one-time PIN,
and its login page also offered *Sign in with Cloudflare*, which signed you
into the Cloudflare **account** and dropped you at `dash.cloudflare.com`
instead of here. `src/index.ts` had no auth in it at all as a result. Login is
a WebAuthn passkey now, verified in the Worker, which changes what a mistake
costs: a route that is not authenticated is public to the internet rather than
public to whoever Access already trusted. So the check is **one middleware over
`/api/*` with a written-down exemption list** (`PUBLIC_API_PREFIXES`) rather
than something each router opts into — a router added tomorrow is covered by
doing nothing. See `docs/passkey-login.md`.

**Email still sends a code, and the code is not a login.** A passkey lives on a
device and a device can be lost; D1 is not somewhere you can reset a login from
and there is no identity provider in front any more, so there has to be a way
back that does not need hardware you no longer have. The emailed code
authorises **adding a passkey** — single use, five guesses, fifteen minutes,
one live at a time — and the session you end up with is the one enrolment
produced. A code that opened a session directly would be the old Access login
wearing the new screen's clothes, which is why `test/uiConsistency.test.ts`
fails if the code reaches a login endpoint or if the button taking it stops
saying *Add a passkey*.

**The recovery address is never typed by the person asking for it.** An email
box on the login screen that decides where an enrolment code goes is an
account-takeover vector: anyone who can load the page mails themselves a code
and enrols a passkey. So `enrolmentRecipient` reads deployment configuration
and nothing else — not a settings row either, which would be a way to redirect
the recovery channel from inside the app, exactly what an attacker holding a
session would reach for.

It had a hardcoded personal address as its fallback, which worked for one
deployment and would have silently mailed a stranger's inbox on any other.
There is no default now: unset means `recoveryAvailable: false` and the screen
says so, because a missing input is never a guess.

**When accounts arrive the shape changes but the rule does not.** The typed
address becomes a *lookup key* — the code still goes to the address already on
file for the matching account, never to what was typed — and the screen says
the same thing whether or not an account matched, since anything else is an
account-existence oracle. With Google as the primary sign-in the address comes
from the grant, so there is nothing to type at signup at all.

**Changing who can sign in costs a passkey touch, and almost nothing else
does.** A session is thirty days — the right length for using the app, the
wrong credential for changing how you get into it. `POST /auth/register/*` and
`DELETE /auth/passkeys/:id` took a session alone until migration 0020, so a
stolen cookie could enrol its own passkey and delete every other, which
survives *sign out everywhere*: that clears sessions, not credentials. The
button you would reach for on being compromised was the one that would not
help.

Both now need a recent assertion. `elevationState` in `shared/auth.ts` is the
fifteen-minute window, `auth_sessions.elevated_at` records the touch, and
`/auth/elevate/*` is the login assertion run again under its own challenge
purpose — so a challenge issued for signing in cannot be replayed to raise a
session's privilege. Signing in is deliberately *not* elevation: the cookie a
sign-in produces is the thing being defended against.

**The emailed code is exempt and has to be.** It exists for the case where
there is no passkey left to touch, so requiring one would make recovery need
the thing you are recovering from losing. `test/uiConsistency.test.ts` fails if
either route drops its check *or* if the code branch of `authoriseEnrolment`
gains one.

The rule stays narrow — an action that changes who can get in, or destroys data
across a boundary — because a prompt you see constantly is one you stop
reading. Bulk writes, Gmail connect and status changes are reversible and
tenant-scoped, and none of them ask. Admin mode is the next thing that will
(`docs/multi-tenant-plan.md`); the client tries first and re-asserts only on
refusal, so a burst of removals costs one touch, and retries exactly once.

**A request resolves to an artist before any route runs.** Fourteen tables
hold rows that belong to one person, and `src/db/scope.ts` is the only way to
reach them: `scoped(table, tenant, ...rest)` builds the `WHERE`, `withTenant`
builds the values, and `TenantId` is a **branded** type with one constructor,
so a user id or a label cannot be passed where a tenant belongs. The
resolution happens once, in the middleware, exactly like authentication — a
router added next month is scoped by doing nothing, or it is a hole. From a
route inward the tenant is an *argument*, never fetched, for the reason
`buildReviewQueue` takes `today` instead of reading the clock: a function that
fetches its own scope can fetch the wrong one silently.

Admin mode (`docs/multi-tenant-plan.md`) resolves to **null**, not a wildcard,
and `TenantId` is not nullable — so an admin-mode request reaching for
`gig_opportunities` fails to compile rather than returning a stranger's rows.

**A missing filter is a test failure, not a leak.**
`test/tenantScope.test.ts` reads the source and fails when one of the fourteen
is named in a query that does not pass through `scoped` or `withTenant`. It
has to be source-level: an unscoped query typechecks, runs, and returns the
right rows for as long as there is one artist — it starts being wrong on the
day nobody is re-reading these queries. Exemptions are a list with a written
reason each, and there is one (event retention, which is a platform rule).

**The two shapes that used to hide a missing scope.** A `.where()` that was
skipped entirely when no filters applied — `conditions.length > 0 ? … : …` in
the gig and sync list routes — is now one branch with the tenant
unconditional. And an `inArray(id, ids)` where the ids came from the browser:
the tenant filter beside it is not redundant, it is the whole check.

**The cron has no request to read a scope from, and gives three answers.**
Housekeeping runs per tenant, because which notification marks are dead is
derived from that artist's own feed; event retention runs once beside it. The
digest and the reply scan run for the **owner's tenant only**, because their
inputs are platform configuration rather than the tenant's — the schedule and
recipient live in `app_settings`, and the mailbox is one `GMAIL_REFRESH_TOKEN`
pointing at one inbox. Looping those over every tenant would mail the owner N
times and scan his mailbox on a stranger's behalf. Per-artist digests and
mailbox grants are real work with schema behind them, and are not pretended to
exist. The notes backfill runs for every tenant under one marker, because the
marker is platform state and writing it after the first would record the job
as done.

**An `ON CONFLICT` target is part of an interface.** Four uniqueness
constraints had to grow a leading `tenant_id` (`gig_correspondents(kind,
value)`, `google_grants(purpose)`, `notification_marks(dedupe_key)`,
`notification_events(dedupe_key)`) and migration 0021 deliberately left them
alone: live code named two of them in an upsert target, and SQLite requires
that target to match a unique constraint exactly, so widening the key would
have *errored* those statements under the old Worker rather than staled them.
Migration 0022 widens them — and it is only safe because the statements no
longer name a constraint at all. `storeGrant` is a delete-then-insert, and the
two mark writers are an update followed by an insert that conflicts to
nothing; both work against the schema on either side of the migration.
`digest_reports` keeps its target, because `entity_id` is a global
autoincrement and two artists cannot collide on one. 0022 also drops 0018's
single-column indexes, whose window closed when the reads started leading with
`tenant_id`.

The `tenant_id` **defaults** from 0021 are still there and stay until the
column goes `NOT NULL`. Dropping them in 0022 would leave the pre-scoping
Worker writing NULLs across the migrate-then-deploy gap, and the default is
only wrong once a second tenant exists.

**The agents' token now belongs to somebody, and the old one still works.**
`API_TOKEN` is a Worker secret with no tenant attached — correct with one
artist, wrong with two, and wrong invisibly: a gig filed to the wrong tenant
just appears on a stranger's Overview. `agent_tokens` (migration 0022) is a
hashed, revocable, per-tenant credential, issued and revoked through
`/api/agent-tokens` behind a passkey touch, because minting a token that can
write to your account is squarely "changes who can get in". An agent cannot
manage tokens: a credential issuing its own successor makes revoking one a
race rather than an ending.

`actorForBearer` still accepts `API_TOKEN` and resolves it to the owner's
tenant — the same "read both spellings" move `normaliseGigStatus` makes,
because withdrawing it in this deploy would 401 every agent until three GitHub
secrets were rotated. It goes when `.github/workflows/agents.yml` holds a row
instead. **There is no Settings UI for these yet**; the screen is step 3's
work and the routes are usable without one.

**Admin mode is a different surface, not a bigger one.** The owner has two
jobs and one account; `auth_sessions.mode` (migration 0023) says which surface
a session is on. In artist mode it resolves to the owner's own tenant; in
admin mode it resolves to **no tenant** — and that is a type rather than a
null. `AppEnv` carries an `actor` and `AdminEnv` carries an `admin`, the two
do not overlap, and `AdminActor` has no tenant field at all, so an oversight
route reaching for `gig_opportunities` has nothing to hand `scoped()` and does
not compile. `src/index.ts` is the only place that sets either.

**Both refusals matter.** An artist-mode session is refused `/api/admin/*`,
and an admin-mode session is refused everything else. Drop the second and
admin mode becomes an artist session with extra pages, with the promise made
to an invited artist resting on the owner not clicking a link. Each refusal
names the mode the request would need (`needsMode`), so the client can offer
the switch instead of an error — and the app renders one surface or the other,
because a page of 403s is the design working and looking broken.

Entering costs a passkey touch, which is the one thing a separate owner
account would have bought that a mode does not: credential separation. Leaving
costs nothing, because giving up privilege is not a privileged act. There is
no impersonation and no "act as this artist", deliberately — a support tool
that quietly breaks the promise is worse than no support tool, and
`test/adminMode.test.ts` fails if the oversight screen so much as carries the
vocabulary, or links to a route that surface cannot reach.

**Oversight reads three tables and writes one thing.** `tenants`, `users` and
the `usage_daily` rollup — the counts are written by the cron running *as the
tenant*, which emits a number, and the owner reads the number. The one write
that crosses the line is removing an artist: a tenant-scoped delete across the
fourteen, previewed first as a **count per table**, which names no column and
returns no row. The owner's own tenant is refused, because deleting it takes
the account holding the surface with it. `test/adminMode.test.ts` fails if the
admin router names one of the fourteen, or uses `asTenantId` more than the
once that removal needs.

**Three of the rollup's seven counters have no writer, and the API says so.**
`domain_rows`, `gig_rows`, `promo_rows` and `agent_runs` are measured;
`api_requests`, `gmail_drafts` and `ai_calls` are not. `MEASURED_FIELDS` names
which, rather than shipping three zeroes a screen would render as "none". A
request counter is a write per request, which is the shape this app keeps
declining to build, so it needs somewhere outside D1 before it can be honest.

**The research agents lost their front door and were given a token.** They POST
and PATCH from outside this repo and outside a browser, so they cannot do a
passkey ceremony — WebAuthn has no non-interactive mode. `API_TOKEN` as a
bearer is their credential, checked before the session because it is a string
compare and the session is a D1 read. Unset, there is no bearer path at all, so
an empty deployment cannot be opened by guessing the empty string — but unset
*at deploy time* is how every agent request silently becomes a 401. **Not at
Access-removal time**, which is the easy thing to get backwards: Access
authenticated at the edge and the Worker then trusted whatever arrived, so it
never supplied a credential this middleware would accept. The secret and the
agents' side of it are prerequisites of the deploy. That ordering is the one
dangerous step in the rollout and it is written down in
`docs/passkey-login.md`.

**`DASHBOARD_URL` stopped being cosmetic.** Its hostname is the WebAuthn
relying-party ID, which is baked into every credential at registration and
checked on every assertion — so changing the hostname invalidates every passkey
already enrolled. It is read from the var rather than from the request because
a request header is written by whoever is asking; the request URL is only
consulted when nothing is configured, which in practice means `wrangler dev`.
`relyingParty` in `shared/auth.ts` is where that decision lives, and local
development is deliberately two origins, because Vite serves the browser on
5173 and proxies to wrangler on 8787.

**The read path is three unbounded scans, and they are indexed now.**
`composeFeed` and `buildReviewQueue` both open by reading every gig, every
sync target and every promo draft, newest first. None of those orderings had
an index, so production answered `SCAN gig_opportunities` + `USE TEMP B-TREE
FOR ORDER BY` and reported **68 rows read to return 34**. Migration 0018 adds
the three, plus `task_runs(run_at)` and two on `reminders`. The doubling is
not why it matters: `WHERE tenant_id = ?` against an unindexed table scans
*everybody's* rows to draw one artist's page, so **when `tenant_id` arrives
every one of those indexes becomes a composite with `tenant_id` first** — an
index that does not lead with the filtered column is one the planner declines
to use.

**The bell polls every five minutes, not every minute.** It costs a full
`composeFeed` — about 155 rows on this database — so a tab open for eight
hours was spending ~74,000 D1 row reads a day watching for a badge that
rarely moved. Nothing in the feed is minute-sensitive; deadlines are measured
in days and events arrive on an hourly cron. `refetchOnWindowFocus` is what
makes it feel live, so the interval is the floor for a tab you are already
staring at, not the delay before you learn anything.

**Compressing stored text was measured and rejected; do not re-propose it.**
Every piece of prose in production — gig notes, reference docs, reply
snippets, sync notes, event bodies — totals about **76 KB**, inside a **408 KB**
database, against a **5 GB** free-tier allowance. And per-row gzip, which is
how a column would actually store it, gets only **1.5×** on these strings
(22,985 bytes of gig notes → 15,301): 672-byte values are too short for the
dictionary to pay for itself, and base64-ing the result back into a TEXT
column gives most of that back. The costs that bind here are **rows read** and
**requests**, and compression moves neither.

The CPU half of that argument was overstated and is worth correcting rather
than repeating: this account is on **Workers Paid**, where the limit is 30
seconds per request by default and configurable to five minutes — not the free
plan's 10 ms. Decompressing prose on every queue build would be affordable. It
is still not worth doing, for the size reasons above, which are the ones that
actually carry the decision. Retention is likewise already handled where it
churns — `notification_events` and `notification_marks` both prune at 30 days,
and no other table grows fast enough to have a policy worth writing.

**The research agents run in CI, and their instructions are files.** They were
scheduled Claude sessions on one laptop until August 2026. Now
`.github/workflows/agents.yml` holds the three schedules, `agent-run.yml` is
the reusable mechanics, and `scripts/agents/run.ts` drives a tool-runner loop
with server-side web search. The prompts are `scripts/agents/prompts/*.md` —
in the repository on purpose: a change to how an agent behaves arrives as a
diff somebody can read, and an agent that disappears leaves a hole in
`git log` rather than in a UI nobody opens.

Four things about it that are not obvious:

- **The tool runner does not auto-resume `pause_turn`, and web search is what
  triggers one.** Left alone, a long sweep stops mid-way and returns as if it
  had finished — no error, no warning, a silently truncated answer that would
  look like a quiet week. `run.ts` iterates the runner and pushes the paused
  turn back; a run that still ends paused is recorded `incomplete`, never `ok`.
- **The heartbeat is posted by the script, in a `finally`, not offered to the
  agent as a tool.** An agent that crashed or forgot would leave no row, which
  is exactly the invisibility that let three schedules die unnoticed. This is
  what arms `shared/taskCadence.ts`, so it has to be something the agent
  cannot skip. Verified: a run that dies on a bad API key still files a
  `failed` row carrying the error.
- **The agents get named, typed tools and never a general HTTP tool.** They
  read a lot of festival pages, and a festival page is untrusted text written
  by somebody else. `create_gig_opportunity` is one prompt injection away from
  being safe; `http_request` would be one away from `DELETE /api/gigs/12`.
- **JSON Schema, not the Zod helper.** `betaZodTool` is built against Zod 4 and
  this repo is on Zod 3, which every route validator uses. Upgrading Zod to get
  nicer tool definitions would put the Worker's request validation in the blast
  radius of a script.

Dry run is the default, as in `scripts/backfill-deadlines.ts`: nothing is
written without `--apply`. A scheduled run always applies; a hand-triggered one
applies only when asked.

**Screens name things; they never print identifiers.** The bell shipped saying
*"gig-festival-scan has not run in 28 days"* — that string is the `task_id` an
agent POSTs, a handle rather than a name, and it had reached three surfaces
before anybody read one out loud: the notification title, the run-event title
and the History page. A slug reads as a leak in a product and as a bug in a
screenshot.

`taskLabel` in `shared/taskLabels.ts` is the only way to render one, and the
shape of it matters: **the set is not closed.** The agents live outside this
repo and send whatever id they like, so a lookup table alone would render the
next new agent as a slug again. Known ids get a written name; anything else is
humanised — the same treatment `shared/types.ts` gives status columns, and for
the same reason. Sentence case, because these appear mid-sentence.

Stored titles are not retrospectively fixed. `notification_events` keeps the
title verbatim from when the run happened, so rows written before this change
keep the old wording until they prune at thirty days. Rewriting stored prose
at read time is the debt `reviewParse.ts` already is, and it would be a worse
trade here than waiting a month.

`test/uiConsistency.test.ts` guards all of it: no `{row.taskId}` in JSX, no
notification title built from a raw id, no WebAuthn vocabulary in an error a
signed-out person reads, and no `.md` path from this repository rendered in a
`<code>` element.

**The one place developer-speak stays is the integration cards**, which name
the missing variables — `GOOGLE_REFRESH_TOKEN` and friends — because on a
configuration screen the variable name *is* the actionable fact and "some
settings are missing" helps nobody. What went was the repository file path
beside it: whoever reads that card may not hold the source.

**A stopped agent is a condition, and nothing was watching for it.** The three
research agents — `gig-festival-scan`, `sync-pitch-research`,
`monthly-promo-checkin` — ran on a cadence from June, stopped within a week of
each other in early August, and nobody noticed for a month. Every part needed
to notice already existed: `task_runs` logs every run, the bell has a feed,
housekeeping runs daily. None was looking. A missing gig is invisible in a way
a wrong one is not — there is no row to be wrong.

`shared/taskCadence.ts` fixes that, and it is a **condition** rather than an
event because staleness is derivable from current state and self-heals the
moment a run posts; an event row would outlive the situation it describes.
Three things about how it decides:

- **The cadence is measured, not configured.** Nothing declares that
  `gig-festival-scan` is weekly — the schedule lives outside this repo, and a
  settings row saying "weekly" is a second place for the truth to drift from.
  The median gap between its own runs is the only claim available, and it
  re-measures itself when a schedule changes. Median, not mean, so one holiday
  cannot double the threshold and blind the check for a month.
- **It is rated `critical`, unlike a failed run.** `runTier` rates a failure
  `attention` because the next tick retries it. Nothing retries a schedule that
  has stopped, which puts it squarely in what `critical` is reserved for —
  plumbing broken now, costing you silently.
- **It under-reports on purpose.** A floor of three days stops a task that ran
  twice in a morning alarming by lunchtime; a ceiling of 45 days stops the
  monthly agent — three runs, two gaps — from setting a threshold near eighty.
  At the time of writing the monthly one is 35 days quiet and this does not
  flag it. That is the safe direction: an alarm you learn to dismiss is worse
  than none, and the ceiling still raises it inside six weeks.

**A task that has never run cannot be missed**, because absence leaves no row.
The check is a floor, not a guarantee.

The parser earns its own test. Two production rows hold `2026-07-17 19:24:50` —
a space instead of a `T`, no zone — which `Date.parse` may read as *local*
time. Under `TZ=Pacific/Auckland` that is twelve hours out, enough to move a
day count. `parseRunAt` reads a zoneless stamp as UTC, because that is the
runner that wrote it.

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

**Gmail drafting is a grant the person makes, not a secret somebody pasted.**
Every Google token before this one was obtained at a terminal and stored with
`wrangler secret put`. That cannot work for a feature where the *user* decides
whether to connect: consent happens in their browser and what comes back has
to be written at runtime. Secrets cannot be written at runtime, so migration
0019 adds `google_grants` — keyed by **purpose**, so revoking drafting cannot
also blind the read-only reply matcher.

**The scope is wider than this repo's habit, knowingly.** Gmail's narrowest
scope that creates a draft is `gmail.compose`, and it also permits *sending*;
there is no drafts-only option. So the guarantee that nothing goes out on its
own stops being enforced by Google and starts being enforced here — by there
being no send call in `src/lib/googleGrant.ts` and by
`test/uiConsistency.test.ts` failing if a Send button appears. The connect
screen says exactly that, in those words, because a permission that protects
less than the reader assumes is the kind of thing to write down rather than
imply.

The refresh token is **AES-GCM encrypted** with `TOKEN_ENCRYPTION_KEY`. It is
the only value in D1 that is a credential somewhere else; everything else in
there is prose.

Three properties the route keeps:

- **It previews first**, like the other two bulk writes, and the interesting
  half of the preview is the **skipped** list. "Drafted four of seven" without
  saying which three is a worse answer than not drafting, and the three
  reasons — no address, no pitch, already pitched — each want something
  different done about them.
- **It re-plans server-side** rather than trusting the ids the screen sends. A
  preview can be minutes old, and a target pitched in the meantime must not be
  drafted because a stale screen still listed it.
- **It writes no status.** A draft in your drafts folder is not a pitch that
  went out, so nothing moves to `pitched` here. Same separation the reply
  router keeps, for the same reason: two things that can be wrong
  independently should be two actions.

`prompt=consent` and `access_type=offline` are set explicitly rather than left
to default, because Google returns a refresh token only on a fresh consent —
without them the grant appears to work and stops an hour later.

**A draft can open a compose window, and that is still not sending.**
`shared/mailto.ts` builds a `mailto:` or Gmail-compose URL from a subject and
body; `DraftActions` mounts Copy beside them wherever a draft is rendered —
the reply draft and the sync pitch, which are the same shape and were the
second copy, so the shell was extracted rather than written twice. A pre-filled
compose window is not a send: the person's own Send button is still the last
step, which is the line this app has always stopped at.

The reason it is a module rather than a template is **length, and how it
fails**. A `mailto:` URL past the platform ceiling does not truncate and does
not error — on Windows the click does nothing at all. That is the same defect
as the 150-character field that truncates mid-word on paste, so the length is
measured *after* encoding and a draft that will not fit is not given a button
that would lie about working; the screen names the handler and says why
instead. Budgets are deliberately under the lowest credible figure —
`mailto` 1,800, Gmail 4,000 — because being conservative costs a Copy button
and being optimistic costs a click that does nothing. **Copy is never withheld**;
it is the fallback that always works, and `test/uiConsistency.test.ts` fails if
it ever sits behind the same length test.

Encoding is not `encodeURIComponent` alone: it leaves `!'()*` alone, which some
clients read as delimiters and truncate on, and it writes a newline as `%0A`
where the RFC wants `%0D%0A`.

**The two handlers are judged separately**, which is the whole reason both are
offered: measured on real pitch prose, `mailto` runs out at about **190 words**
and Gmail carries roughly 450. A 200-word pitch therefore gets Copy and Gmail,
with mailto hidden and named. Encoding costs about 1.45×, mostly newlines
tripling.

So `sync-pitch-research` is told to write **150 words**, and the reason given
to it is the editorial one rather than the technical one: a cold pitch to a
music supervisor is competing with a hundred others and the short one gets
read. "Our URL encoder has a limit" is a bad reason to shorten a pitch and
"supervisors do not read four paragraphs" is a good one, and they happen to
land in the same place. The tool result feeds the word count back when a draft
runs long, so the agent can correct on the *next* target in the same run rather
than only on the next run. It is guidance, never a refusal — a hard reject at
the API would let a URL encoding limit veto editorial judgement, and lose the
draft on the way.

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
costs $4,000.

`local` is a band because its absence was not cosmetic. A show at Birds Hill
Park — where the Winnipeg Folk Festival is held, half an hour out — priced as
a **regional flight** at $450–850, and one in Winnipeg itself as a $120–400
drive, because the four bands started at "drive" and the inference had no
answer for home. Both errors run the same way: they make home-town gigs look
expensive, for an artist whose stated goal is expanding *beyond* Winnipeg. A
Manitoba address now bands as a drive at worst whether or not the town is on
any list — the province is 1,200 km end to end and the far corner is still not
a flight — and `NIGHTS_BY_BAND` gives `local` 0–0, because nobody books a
hotel in the city they live in.

Nights are the one input inferred as a *range*: `NIGHTS_BY_BAND` gives a drive
0–1 and an international 3–5, so a row nobody has edited still costs its
lodging instead of reporting a gap — which was all 34 of them. That is not the
silent default the module refuses; a guessed span widens the total rather than
moving it, and it is marked inferred like every other guess. A stated `nights`
still wins and is still exact. Two rules the module holds throughout: every figure is a
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

**The column wins over the prose, and the fallback stays.** `withStoredColumns`
merges the stored values over a parsed note in `gigItem` and `syncItem`, so a
`submission_state` you correct by hand actually reaches the screen — until it
existed, the queue re-derived from the note on every render and a corrected row
changed the database and nothing you could see, with the conflict flag still
firing at a question already answered. A null column still falls back to the
parse, because null means "the note makes no claim" on most rows and "nothing
has extracted this yet" on any row that reached D1 without a route; both want
the same answer. Unreadable `blocked_on` JSON falls back too rather than
reporting an empty list — "nothing is blocked" is a claim, and a column nobody
can parse is not entitled to make it. The four facts with columns are
overridden; everything else stays derived.

The plan's last step — "once backfilled, the parser is deleted" — is not
reachable, and this is the thing to know before trying again: the research
agents write prose from outside this repo, so a backfill alone leaves every
*future* row with a filled note and empty columns. Extraction has to keep
happening; only its timing changed.

The backfill runs two ways. `POST /api/backfill/notes` is the button on
Settings, and `runNotesBackfillOnce` is a **one-shot on the cron**, guarded by
`once.notesBackfill` in `app_settings` — the extraction is code rather than
SQL, so it cannot ride in a migration, and the Worker is the only thing that
can reach both the parser and the rows. Not pinned to an hour like the reply
scan: it happens once, so waiting for 7am would be a delay with nothing on the
other side of it. The marker is written *after* success, like
`digest.lastSentAt`, so a failure retries on the next tick — and running twice
is harmless anyway, which is the actual safety.

Two rules hold it together. **A column that already holds something is never
overwritten** — with exactly one exception, `fee_currency`, because it
defaults to `'USD'` at insert and so is never empty, while two rows say `CAD`
in their own fee text. A currency the text *names* outranks a column default;
a currency it does not name leaves the default alone. Nothing else gets that
treatment, and the narrowness is the safety — (`changesFor`), so a value you set by hand survives an extractor
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

**A bulk write previews first, and the shell that does it is shared.**
`Disclosure` in `components/ui/` is the closed-row → open → preview → apply
shape, extracted when the second copy appeared rather than the fourteenth.
Both users write across every row of a table, and a bulk write you cannot look
at first is one you find out about afterwards, so the shell makes the preview
the path of least resistance for the next one. `test/uiConsistency.test.ts`
fails if a third panel hand-rolls it, or if one calls its write endpoint
before its preview.

**A count you cannot reach is a number, not a signal.** The Artist page's
"overdue" and "never reviewed" tallies are filters, because one sourcing run
puts twenty-two assets in the second bucket and finding them meant scrolling
the library for a grey badge. `GET /api/artist?freshness=` refuses a value it
does not know rather than quietly showing everything — a filter that ignores
you is how you conclude the library is fine.

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
