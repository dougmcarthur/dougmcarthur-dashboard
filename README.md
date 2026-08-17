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

## The Review screen

`#review` is the triage queue: one prioritised list of everything waiting on a
decision, with the full context for the selected item beside it. It adds no
API routes — it reads `/api/gigs`, `/api/sync` and `/api/promo` and does the
work client-side.

Two things about it are worth knowing before changing it:

- **It does not build its queue from `status`.** No production row carries
  `pending_review` / `draft_ready` / `draft`, so a status-driven queue would
  be empty. What actually records "waiting on Doug" is prose in the note
  columns, so `frontend/src/lib/reviewQueue.ts` combines the parsed note with
  the workflow status — and surfaces the cases where the two contradict each
  other as the highest-priority flag.
- **`frontend/src/lib/reviewParse.ts` is a stopgap.** It pulls entry-fee
  warnings, drafted application values, outreach copy, requirements, deal
  terms, blockers and window dates back out of `gig_opportunities.fit_notes`
  and `sync_targets.notes` at read time, because the structured columns added
  in migration 0001 were never backfilled (all NULL in production). Read
  [`docs/notes-field-audit.md`](docs/notes-field-audit.md) for the inventory,
  the proposed columns, and the data-integrity issues found along the way; the
  parser should be deleted once the backfill lands.

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

```bash
npm run build:ui             # build the frontend into dist/
npm run deploy               # wrangler deploy (publishes Worker + assets)
```

Set production secrets once with `wrangler secret put`:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
`GOOGLE_CALENDAR_ID`, and `GMAIL_REFRESH_TOKEN`.

### Before you deploy

- `compatibility_date` in `wrangler.toml` was originally a best-effort guess
  (set to the Worker's `created_on`). Confirm it against the live Worker
  settings if you haven't already.
- Run `wrangler whoami` and `wrangler deploy --dry-run` to confirm the config
  matches the live Worker before publishing.
