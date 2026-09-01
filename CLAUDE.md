# Music HQ

Cloudflare Worker (Hono) + D1 + a React/Vite/Tailwind dashboard, for one
person's gig, sync and promo pipeline. Deployed by GitHub Actions on every push
to `main`.

## Database changes go through wrangler migrations

Write a numbered file in `migrations/` and apply it with:

```
npm run db:migrate:remote      # wrangler d1 migrations apply --remote
```

**Never hand-run schema SQL against production**, through the Cloudflare API or
anything else. D1 keeps a `d1_migrations` ledger, and a statement applied
outside it is invisible to that ledger — the next `db:migrate:remote` then
re-runs the file and aborts the whole batch on a duplicate column. 0006, 0007
and 0008 were each applied by hand and had to be back-filled into the ledger
afterwards; check `SELECT name FROM d1_migrations` if anything looks off.

`wrangler` cannot authenticate from a Claude Code session unless
`CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID`) are set in the
environment. The GitHub Action has them as secrets; a remote session does not
inherit them. If `db:migrate:remote` reports it needs a token, say so and stop
rather than reaching for the API as a workaround.

### Ordering, and why it is not always the same

The deploy workflow does **not** run migrations, so schema and code land
separately and the order is a judgement each time:

- **Additive** change (new column, new table) → migrate first, then deploy. New
  columns are invisible to old code, so nothing breaks in between.
- **Renaming stored values** → deploy first, then migrate. New code can read the
  old values; old code cannot read the new ones. This is what migration 0008
  required.

Better than either: make renames additive by teaching the code to read both
spellings, so the order stops mattering. See `shared/gigStatus.ts`.

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

**Status columns are not a closed set.** `shared/types.ts` types them as
`string` deliberately — production rows carry values outside every union the UI
offers. Narrowing them is a claim the data does not support.

**Deadlines are often prose.** 26 of 34 gig rows hold things like "None —
rolling artist roster intake" in `deadline`. Anything wanting a real date must
go through `splitDeadline`, which returns null rather than guessing.

## Testing

`npm test` (vitest) — pure logic in `shared/` is well covered; routes are only
tested for registration and validation, because there is no D1 in the test
environment. `npm run typecheck` covers both the Worker and the frontend.

Screenshots verify design, not geometry. A chart whose bars all had width 0
passed visual review twice — probe computed styles when layout correctness
matters.
