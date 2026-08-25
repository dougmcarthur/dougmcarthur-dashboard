# dougmcarthur-dashboard

A private ops dashboard for Doug McArthur's music promotion — tracking gig
opportunities, sync-licensing pitches, promo drafts, and the automated task
runs that discover them. Runs entirely on Cloudflare: a Hono API on Workers,
a D1 (SQLite) database, and a React frontend served as static assets from the
same Worker. The live site sits behind Cloudflare Access.

## Stack

- **API** — [Hono](https://hono.dev) on Cloudflare Workers, with
  [Drizzle ORM](https://orm.drizzle.team) over D1 and [Zod](https://zod.dev)
  request validation. Entry point: `src/index.ts`.
- **Database** — Cloudflare D1 `dougmcarthur-music-hq`
  (`database_id 515d234f-92c3-4519-abc3-3d453a1b5058`). Schema in
  `src/db/schema.ts`; migrations in `migrations/`.
- **Frontend** — React 19 + Vite, TanStack Query & Table, Tailwind. Hash-based
  routing (`frontend/src/`). Built to `dist/` and served via the Worker's
  `ASSETS` binding. Screens: Overview, **Review**, Gigs, Sync, Promo, Log,
  Settings.
- **Integrations** — Google Calendar (gig deadlines synced on approval) and
  Gmail (`readonly`, used to reconcile sent pitches against sync targets).
  Both degrade gracefully when their secrets aren't set — see
  `GET /api/health` to check what's configured.

## Project layout

```
src/
  index.ts            Worker entry — mounts all API routes, falls through to ASSETS
  types.ts            Env bindings (DB, ASSETS, Google/Gmail secrets)
  db/                 Drizzle client + schema
  routes/             One Hono router per resource (gigs, sync, promo, …)
  lib/                googleCalendar.ts, gmail.ts (OAuth), mailer.ts, settings.ts
frontend/             React + Vite app (its own tsconfig.frontend.json)
shared/               Wire types, review-queue logic + digest content, imported by BOTH
migrations/           D1 migrations (applied via wrangler)
scripts/              One-off maintenance scripts (e.g. column backfill)
docs/                 Setup guides + the notes-field audit
schema.sql            Snapshot of the original production schema (pre-migrations)
```

## API

All routes are under `/api`; anything else falls through to static assets.

| Route | Purpose |
| --- | --- |
| `GET /api/overview` | Totals, the recent task-run log, and due reminders |
| `GET /api/review` | The decision queue — what needs a decision, ranked, with per-filter counts and the Overview's `summary` (`?filter=`, `?limit=`) |
| `/api/gigs` | Gig opportunities (CRUD). Approving with a deadline creates a Calendar event + pre-deadline reminder |
| `/api/sync` | Sync-licensing targets (CRUD) |
| `/api/sync/reconcile` | `GET` preview of sent-pitch matches from Gmail; `POST /apply` to write status/pitch updates |
| `/api/promo` | Monthly promo drafts (CRUD) |
| `POST /api/review/snooze` | Defer a gig or sync target to a date, or `until: null` to bring it back |
| `/api/digest` | The weekly digest: `GET /preview`, `POST /send`, `PATCH /settings` |
| `/api/reference-docs` | Reference documents (CRUD) |
| `/api/reminders` | List/patch reminders; `POST /dismiss` to clear an entity's pending reminders |
| `/api/task-runs` | Log + list automated task runs |
| `/api/health` | Which Google/Gmail secrets are configured |

> Route order matters: `/api/sync/reconcile` is registered **before**
> `/api/sync` in `src/index.ts`, so the sync router's `/:id` handler doesn't
> swallow it. Keep it that way when adding sub-routes.

## The Overview deck

`#overview` opens on one decision at a time, dealt from
`GET /api/review?filter=needs` with the rest of the stack drawn behind it. The
sentence on each card and the labels on its buttons come from
`shared/decisionCopy.ts`, attached to every queue item — so the deck, the
Review screen and anything built later (a digest, a notification) describe the
same item the same way instead of each inventing phrasing.

Buttons carry an *intent* (`confirm_sent`, `approve`, `pass`, `archive`, …),
not a status. `DecisionDeck` maps intent to the right status per entity type,
because "pass" means `rejected` on a gig and `declined` on a sync target. Add
a new intent in one place and every kind has to say what it means.

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
It renders nothing once the counts are zero, and the block should be deleted
when they stay that way; a permanently clean health row is furniture.

### Automation activity

The Overview shows five runs, one line each, with the summary behind a
disclosure — `ActivityList`. The summaries are three to five lines of agent
prose apiece; inline they were the bulk of the page. Full history stays on the
Log page.

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

`shared/` holds the wire types and the queue logic, and is included by both
`tsconfig.json` and `tsconfig.frontend.json`. The Worker imports it for real —
`GET /api/review` builds the queue — while the frontend imports only its
*types*, so none of the parser ships to the browser (it is `import type`
throughout; the client bundle is ~11 kB smaller for it).

Keep it that way. Anything added to `shared/` must run in a Worker: no DOM,
no React, no Node built-ins. And if a screen needs to know what requires a
decision, it asks `/api/review` — it does not re-derive the answer locally.
That duplication is exactly what this directory exists to prevent.

## The weekly digest

A Cron Trigger (`0 13 * * 1` — Monday 08:00 Winnipeg, near enough) builds a
digest and emails it. It is a **diff, not a report**: four groups — new since
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
| `PATCH /api/digest/settings` | On/off, recipient, sender |

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

First-time local DB setup:

```bash
npm run db:migrate:local
```

## Database & migrations

Schema is defined in Drizzle (`src/db/schema.ts`). To change it:

```bash
npm run db:generate          # generate a migration from schema changes
npm run db:migrate:local     # apply to the local D1 instance
npm run db:migrate:remote    # apply to production D1
```

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

Pushing to `main` deploys automatically — `.github/workflows/deploy.yml` runs
typecheck, tests and the frontend build, then `wrangler deploy`. The Actions
tab shows every deploy tied to its commit; the workflow can also be run
manually from there.

It needs two repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token with **Account → Workers Scripts → Edit** and **Account → Account Settings → Read**, scoped to the account owning this Worker |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |

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
