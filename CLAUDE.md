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
outside it is invisible to that ledger — the next apply then re-runs the file
and aborts the whole batch on a duplicate column. 0006, 0007 and 0008 were each
applied by hand and had to be back-filled into the ledger afterwards;
`SELECT name FROM d1_migrations` is the check if anything looks off.

### Blocked: CI cannot apply migrations yet

Applying migrations from the deploy workflow is the intended setup and the
steps are written (see the `ci-migrations` branch), but the CI token cannot use
them:

```
The given account is not valid or is not authorized to access this service
[code: 7403]
```

`CLOUDFLARE_API_TOKEN` in GitHub Actions secrets has Workers permissions but
not **D1**. `wrangler deploy` never queries D1, so this stayed invisible until
a migration step tried to. The fix is one edit to the token at
dash.cloudflare.com → My Profile → API Tokens → add **D1 · Edit** for the
account. Once that is done the two steps can be re-landed as-is.

`wrangler` also cannot authenticate from a Claude Code session at all, since
that token is not in the session environment. So until CI can do it, a
migration has to be applied by a human running `npm run db:migrate:remote`
locally — say so and stop rather than reaching for the Cloudflare API as a
workaround.

### Migrations must be additive

Once CI applies them it will migrate *before* it deploys, so for the
half-minute between those steps the new schema runs under the currently-live
Worker. Every migration has to be readable by the code already in production.

Adding a column or a table is always safe that way. **Renaming a stored value
is not**, and is done as two deploys instead:

1. Teach the code to read both spellings, and ship that.
2. Migrate the data in a later change.

`normaliseGigStatus` in `shared/gigStatus.ts` is what step 1 looks like — it
maps `approved` to `shortlisted` on read and on write, which is also what lets
the out-of-repo research agents keep POSTing the old vocabulary indefinitely.

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
