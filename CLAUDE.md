# Music HQ

Cloudflare Worker (Hono) + D1 + a React/Vite/Tailwind dashboard, for one
person's gig, sync and promo pipeline. Deployed by GitHub Actions on every push
to `main`.

## Database changes go through wrangler migrations, applied by CI

Write a numbered file in `migrations/` and merge it. The deploy workflow
applies pending migrations before deploying the Worker — nothing to run by
hand, and the `d1_migrations` ledger stays honest on its own.

**Never hand-run schema SQL against production**, through the Cloudflare API or
anything else. A statement applied outside the ledger is invisible to it, so
the next CI run re-runs the file and aborts the batch on a duplicate column.
0006, 0007 and 0008 were each applied by hand before CI did this and had to be
back-filled into the ledger afterwards; `SELECT name FROM d1_migrations` is the
check if anything looks off.

`wrangler` cannot authenticate from a Claude Code session anyway —
`CLOUDFLARE_API_TOKEN` lives in GitHub Actions secrets and a remote session
does not inherit it. That is now fine rather than an obstacle: merging is how a
migration gets applied.

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
