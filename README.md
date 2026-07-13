# dougmcarthur-dashboard

This folder is a **reconstructed snapshot** of the live `dougmcarthur-dashboard`
Cloudflare Worker, pulled directly from the Cloudflare API on 2026-06-29.
It exists because the Worker was published straight to Cloudflare with no
git repo behind it — this is the first version control this project has had.

## What's accurate
- `src/index.js` — exact logic of the deployed API (bundler artifacts
  stripped, behavior unchanged).
- `schema.sql` — exact current schema of D1 database `dougmcarthur-music-hq`
  (database_id `515d234f-92c3-4519-abc3-3d453a1b5058`).
- `wrangler.toml` D1 binding (name, id) — confirmed against the live account.

## What's a best-effort guess
- `compatibility_date` in `wrangler.toml` — set to the Worker's `created_on`
  date since the real value isn't exposed by the API used to pull this.
  Verify in the Cloudflare dashboard before deploying changes.
- Whether `[assets]` binding name/directory exactly matches production —
  inferred from `env.ASSETS.fetch(request)` in the source; the actual asset
  manifest wasn't retrievable.

## What's missing
- The real frontend. It's served as static assets via the Worker's `ASSETS`
  binding, and the live site sits behind Cloudflare Access, so the source
  couldn't be pulled or reverse-engineered. `public/index.html` is a stub.
  This isn't a blocker — see below.

## Next steps
Read `../Dashboard Rebuild - Architecture and Spec.md` for the full rebuild
plan (Hono + Drizzle + Zod API, React/Vite + TanStack frontend, structured
data model, Google Calendar sync). This repo is Phase 1's starting point,
not the target state — the plan is to migrate off this hand-rolled API
rather than extend it.

## Before you touch production
Run `wrangler whoami` and `wrangler deploy --dry-run` first to confirm this
config actually matches the live Worker before deploying anything for real.
