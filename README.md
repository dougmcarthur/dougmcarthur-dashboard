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
  `ASSETS` binding.
- **Integrations** — Google Calendar (gig deadlines synced on approval), Gmail
  (`readonly` to reconcile sent pitches; `send` for reminder emails), and the
  Anthropic API (drafts application answers from the reference docs). All
  degrade gracefully when their secrets aren't set — see `GET /api/health` to
  check what's configured.
- **Cron** — a daily Worker cron (13:00 UTC) opens submission windows that have
  arrived, prepares upcoming applications, and sends due reminders. See
  `docs/application-prep.md`.

## Submission windows & application prep

Approving a festival whose submission window hasn't opened yet files it as
`awaiting_window` rather than dropping it into the active queue. That schedules
the reminder emails (heads-up, opening day, pre-deadline) and queues the
application form to be read ahead of time: the form is fetched, split into its
real fields, and each one gets a drafted answer sourced from the reference docs,
ready to review and edit in the dashboard.

Answers you approve are filed in an **answer library** keyed by canonical question
kind, so the next form asking "Name of the act" or "Tell us about your act" is
filled from text that's already been through review — the more applications you
do, the less each one takes. Event-specific answers ("why this festival") are
retargeted rather than pasted. Full write-up, including what happens
with login-gated and JavaScript-rendered forms:
[`docs/application-prep.md`](docs/application-prep.md).

## Project layout

```
src/
  index.ts            Worker entry — mounts all API routes, falls through to ASSETS
  types.ts            Env bindings (DB, ASSETS, Google/Gmail secrets)
  db/                 Drizzle client + schema
  scheduled.ts        Daily cron work (open windows, prep applications, send reminders)
  routes/             One Hono router per resource (gigs, sync, promo, applications, …)
  lib/                googleCalendar.ts, gmail.ts (OAuth helpers),
                      submissionWindow.ts (window/reminder logic), formParser.ts
                      (form → fields), answerEngine.ts (fields → drafted answers),
                      applicationPrep.ts (orchestration), notifications.ts (emails)
frontend/             React + Vite app (its own tsconfig.frontend.json)
migrations/           D1 migrations (applied via wrangler)
scripts/              One-off maintenance scripts (e.g. column backfill)
docs/                 Google Calendar & Gmail setup guides
schema.sql            Snapshot of the original production schema (pre-migrations)
```

## API

All routes are under `/api`; anything else falls through to static assets.

| Route | Purpose |
| --- | --- |
| `GET /api/overview` | Dashboard rollup: counts, pending-review items, upcoming deadlines, due reminders, gigs awaiting their window, prepared answers |
| `/api/gigs` | Gig opportunities (CRUD). Approving creates a Calendar event, schedules reminders, and queues application prep — landing on `awaiting_window` if the window hasn't opened |
| `/api/gigs/:id/application` | Prepared application fields; `POST /prepare` to (re-)read the form, `GET /export` for a copy-paste bundle, `POST /fields` to add a question by hand |
| `/api/application-fields/:id` | Edit or approve one prepared answer; `POST /approve-all` for a whole gig |
| `/api/answer-library` | Reusable approved answers (CRUD). `POST /seed` bootstraps from the reference docs; `POST /from-field` files a prepared answer |
| `POST /api/tasks/run` | Run the daily cron work on demand |
| `/api/sync` | Sync-licensing targets (CRUD) |
| `/api/sync/reconcile` | `GET` preview of sent-pitch matches from Gmail; `POST /apply` to write status/pitch updates |
| `/api/promo` | Monthly promo drafts (CRUD) |
| `/api/reference-docs` | Reference documents (CRUD) |
| `/api/reminders` | List/patch reminders; `POST /dismiss` to clear an entity's pending reminders |
| `/api/task-runs` | Log + list automated task runs |
| `/api/health` | Which Google/Gmail secrets are configured |

> Route order matters: `/api/sync/reconcile` is registered **before**
> `/api/sync`, and the application router **before** `/api/gigs`, so the `/:id`
> handlers don't swallow their sub-routes. Keep it that way when adding more.

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
`GOOGLE_CALENDAR_ID`, and `GMAIL_REFRESH_TOKEN`, plus — for reminder emails and
application prep — `GMAIL_SEND_REFRESH_TOKEN` (or a `GMAIL_REFRESH_TOKEN`
granted the `gmail.send` scope), `NOTIFY_EMAIL`, and `ANTHROPIC_API_KEY`.
See `docs/gmail-setup.md` and `docs/application-prep.md`.

### Before you deploy

- `compatibility_date` in `wrangler.toml` was originally a best-effort guess
  (set to the Worker's `created_on`). Confirm it against the live Worker
  settings if you haven't already.
- Run `wrangler whoami` and `wrangler deploy --dry-run` to confirm the config
  matches the live Worker before publishing.
