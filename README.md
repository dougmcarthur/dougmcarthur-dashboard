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
  lib/                googleCalendar.ts, gmail.ts (OAuth refresh-token helpers)
frontend/             React + Vite app (its own tsconfig.frontend.json)
shared/               Wire types + the review-queue logic, imported by BOTH
migrations/           D1 migrations (applied via wrangler)
scripts/              One-off maintenance scripts (e.g. column backfill)
docs/                 Setup guides + the notes-field audit
schema.sql            Snapshot of the original production schema (pre-migrations)
```

## API

All routes are under `/api`; anything else falls through to static assets.

| Route | Purpose |
| --- | --- |
| `GET /api/overview` | Dashboard rollup: counts, pending-review items, upcoming deadlines, due reminders |
| `GET /api/review` | The decision queue — what needs a decision, ranked, with per-filter counts (`?filter=`, `?limit=`) |
| `/api/gigs` | Gig opportunities (CRUD). Approving with a deadline creates a Calendar event + pre-deadline reminder |
| `/api/sync` | Sync-licensing targets (CRUD) |
| `/api/sync/reconcile` | `GET` preview of sent-pitch matches from Gmail; `POST /apply` to write status/pitch updates |
| `/api/promo` | Monthly promo drafts (CRUD) |
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

`schema.sql` is a historical snapshot of the original production schema; the
current schema is the sum of that plus everything in `migrations/`. Some legacy
gig columns (`fee`, `fit_notes`) are retained during the structured-column
migration — `scripts/backfill-structured-columns.js` populates the new columns.

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
