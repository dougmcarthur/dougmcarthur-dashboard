# Sun Dogs Music Scout

Cloudflare Worker (Hono) + D1 + a React/Vite/Tailwind dashboard for one person's
gig, sync and promo pipeline, with invited artists as separate tenants. Served at
`scout.sundogsmusic.ca` and deployed by GitHub Actions on every push to `main`.

This file is the working state of the app: what is true, the rules the code holds,
and why a rule exists where the why is not obvious. Deep dives are in `docs/`.
Most rules are pinned by a test named beside them; read that test's comment before
changing the rule.

**The name is a house mark plus a product name.** *Scout*, by *Sun Dogs Music*:
write "Sun Dogs Music Scout" and never brand on "Scout" alone (Scouting America
enforces on a dilution theory, including against unrelated trades). "Music Scout" is
avoided because in the trade it means an A&R person scouting *talent*. Email
subjects and the From name lead with the product name; respondent-facing survey
text names Sun Dogs Music and no product. The header, the landing page, the sign-in
title and the welcome screens all carry the whole name in one weight.

**Names that look stale are not.** The D1 database is still `dougmcarthur-music-hq`
(a rename is a data migration) and the Worker is `sun-dogs-scout`. The repository,
`package.json` and `README.md` keep `dougmcarthur-dashboard`; nothing deploys by
those. **`name` in `wrangler.toml` and the Worker's name in the Cloudflare dashboard
change together**: `wrangler deploy` finds its Worker by name, so a stale name
quietly creates a second Worker with the D1 binding, email binding and hourly cron
but no domain or secrets, running the scheduled jobs against production beside the
real one. The 2026-09-14 rename did this once.

**Keeping this file current.** When a change alters a rule, edit the sentence that states
it. Do not add how the problem was found, what the rule replaced, or a count measured
once: the commit message and `docs/` hold that. A paragraph earns its place when a
future change would otherwise undo it or miss it, and a dropped idea stays only if
someone would plausibly propose it again (see the last section).

## Principles the code keeps

These recur in every area below. They are stated once here and not repeated.

- **Read both spellings.** To rename a stored value, first ship code that accepts
  the old and new on read and write, then migrate the data in a later change
  (`normaliseGigStatus`, `gigStatusFromStored`, the old Settings tab ids, the
  calendar secrets fallback in `calendarTarget`). It is also what lets the
  out-of-repo research agents keep POSTing old vocabulary.
- **A missing input is never a guess and never a zero.** The recovery address, the
  home base and the Drive picker values have no default; a cost with no `nights`
  names the gap in `unknowns`; a sync target's `submission_policy` of null is never
  worded as permission; a deadline recovered from prose is shown with its prose.
- **The clock and the scope are arguments.** `buildReviewQueue({ today })`, the
  tenant passed to a route, preferences passed into a reconcile: a function that
  fetches its own scope or date can fetch the wrong one silently, and a fixture that
  reads the clock passes today and fails tomorrow.
- **Automation only moves toward caution.** A refusal replaces anything; an
  invitation fills only an empty field; a source that answers but is empty or stale
  says so; a timeout is no verdict about a credential.
- **A state is not a fault.** `unverified`, `unreviewed`, `never` and `declared`
  are states apart from `rejected`, `overdue` and `broken`: not having checked is
  not a negative claim.
- **The app copies; it never sends or submits.** Drafts have Copy and, where they
  fit, a compose-window link; there is no Send. Applications are drafted, never
  filed. Recording that something was sent is not blocked.
- **A control that names a move is a claim about legality.** Buttons derive from
  `nextGigStatuses`, `NUDGE_KINDS[].choices` and the stage language, so a screen
  cannot offer what the route refuses.
- **A bulk write previews first** (`Disclosure`), names what it skipped and why,
  and the Worker re-plans rather than trusting ids from a stale screen.
- **Screens name things and never print identifiers.** `taskLabel` (`shared/taskLabels.ts`) renders an
  agent's `task_id`, table names go through `tableLabel`, the set of agents is not
  closed so anything unknown is humanised. The exception is the integration cards,
  where the variable name is the actionable fact, and only to the owner: an artist
  cannot set a Worker secret, so they read a plain sentence instead.

## Working here

- **Run the Worker with `npm run dev:api`, never bare `wrangler dev`.** `wrangler dev`
  reads `[vars]` and serves the production `DASHBOARD_URL`, so the passkey relying
  party is wrong at `localhost`. `dev:api` overrides it; `test/auth.test.ts` fails if
  the script loses that.
- **`npm run build` deploys** (`build:ui && deploy`) and the owner's machine is
  logged in to Cloudflare, so use `npm run build:ui` to check a build. A remote
  Claude Code session has no Cloudflare credentials: merging is how a migration
  gets applied.
- **Local database:** `npm run db:migrate:local` works from a clean checkout
  (`scripts/bootstrap-local-db.mjs` applies `schema.sql` first when the baseline is
  missing, because migration 0001 alters a table production had from `schema.sql`).
  `npm run db:seed:local -- --apply` writes a fixture of *shapes, not data*: a prose
  deadline, an application silent past `NO_REPLY_DAYS`, `info_requested` outranking a
  deadline, a visa risk, a stopped agent, an uncredited photo, and a second tenant
  that must never appear on the owner's screens. Its dates are computed when it
  runs, because a hardcoded one quietly stops being "due in nine days". It seeds one
  enrolment code (a fresh database has no passkey and no mailer) and refuses
  `--remote`. The database scripts run wrangler through `scripts/lib/wrangler.mjs`,
  not `npx`, because on Windows `npx.cmd` is invisible to `execFileSync`.
- **Local dev is two origins:** Vite on 5173 proxies to wrangler on 8787.
  `relyingParty` in `shared/auth.ts` decides the passkey origin; a configured
  `localhost` value hands the decision back to the request host.

### Testing

- `npm test` (vitest) and `npm run typecheck` (Worker, frontend and agent scripts).
  Pure logic in `shared/` is covered directly; routes run against a `node:sqlite`
  stand-in for D1 built from `schema.sql` and every migration
  (`test/support/sqliteD1.ts`).
- **Fixtures use dates relative to their own `TODAY`, never the real clock.**
  `TZ=Pacific/Auckland npm test` runs a day ahead and is a cheap check; CI runs both.
- **Zone data is a clock too.** tzdata 2026e puts Manitoba on permanent UTC−5 from
  2026-11-01. The CI runner's Node ships it (22.23.4, per Node's changelog) and an older
  local Node does not, so a test that assumes "winter Winnipeg is UTC−6" passes
  here and fails there. Daylight-saving tests use `America/Chicago`, and a zone that
  never changes (`America/Panama`) covers the other case. The Worker is the same:
  "Monday 08:00 Winnipeg" is right only while the Workers runtime has the new data,
  so a digest an hour late points at the runtime's zone data, not the schedule.
- **Some mistakes typecheck and render**, so they need source-level tests that read
  the JSX or the route: `test/uiConsistency.test.ts` (dead hover states, a
  re-declared input class, a Send button), `test/tenantScope.test.ts`,
  `test/gigRows.test.ts` and others named below. Each records what went wrong.
- **Screenshots verify design, not geometry.** Probe computed styles when layout
  matters, and run a rendered contrast scan across every palette, light and dark,
  plus high contrast: token tests cannot catch faint text on a tinted fill.
- **Line endings are LF everywhere.** `.gitattributes` (`* text=auto eol=lf`) overrides
  Windows' `core.autocrlf`, so a checkout reads the same bytes as the CI runner's. Before
  it, a test matching a literal newline in source passed on Linux and failed on Windows
  (`test/challengerPhase2.test.ts` still normalises, harmlessly). A clone made before the
  file existed keeps CRLF until its files are rewritten.

## Database and deploy

**Database changes go through wrangler migrations, applied by CI.** Write a numbered
file in `migrations/` and merge it. `deploy.yml` runs `wrangler d1 migrations apply
--remote` before deploying the Worker. **Never hand-run schema SQL against
production**: a statement outside the ledger is invisible to it, so the next CI run
re-runs the file and aborts the batch on a duplicate column (`SELECT name FROM
d1_migrations` is the check if anything looks off). The CI token needs **D1 · Edit**,
not Read: `d1 migrations list` hits the write-capable `/query` endpoint and a
read-scoped token fails with `code: 7403`, which `wrangler deploy` never reveals.

**Migrations must be additive.** CI migrates *before* it deploys, so for the
half-minute between the two the new schema runs under the Worker already in
production. "Additive" is measured against what is *deployed*, which on a long-lived
branch can be far older than the previous commit. Adding a column or table is always
safe; renaming a stored value is two deploys (read both spellings, then migrate). A
migration that errors rolls back and stops the deploy, leaving old code on old
schema, which is a consistent pair.

**The scoped tables keep a nullable `tenant_id` with defaults.** Only
`users.tenant_id` is `NOT NULL` (migration 0024). With the defaults in place a write
cannot produce a NULL, and SQLite has no `ALTER COLUMN`, so the constraint is a
table rebuild whose column list can only come from the *local* schema while
production predates the ledger and was partly hand-applied: a production-only column
would be dropped by a statement that succeeds. Still unchecked: production's schema
against what the migrations produce. `GET /api/admin/health` counts rows with no
owner so that precondition is something to look at.

**`ON CONFLICT` target is part of an interface.** SQLite requires it to match a
unique constraint exactly, so widening a key under live code that names it would
*error* those statements. `google_grants`, `notification_marks` and
`notification_events` therefore avoid naming a constraint (`storeGrant` deletes then inserts, or
update-then-insert that conflicts to nothing) and work against the schema on either
side of a migration. `digest_reports` keeps its target because `entity_id` is a
global autoincrement.

### Reading a red run

`deploy.yml` on every push to `main`: typecheck, tests, tests a day ahead, build,
list and apply migrations, deploy, report what went live. `check.yml` runs the first
four (typecheck, tests, tests a day ahead, the frontend build) on a pull request, with
no secrets and no way to touch D1, so a red run lands on the change and not on `main`.

- **A red run does not mean nothing shipped.** `wrangler deploy` is three API calls
  (assets, Worker, triggers) and the Worker is live after the second. A failure of
  the third (`Received a malformed response from the API`, usually an HTML error page)
  says nothing about this repository and a re-run converges; the step retries three
  times because the whole command is idempotent. `Deployed … triggers` is the line
  that says the third call landed. `No targets deployed` alone is normal, because
  `workers_dev = false` and the custom domain is attached in the dashboard.
- **"Show pending migrations" failing means the token**, not the code (see D1 · Edit).
  It is a pure read, so it retries; `migrations apply` deliberately does not, because
  "try it again" is the wrong instinct about a write that may have half-landed.
- **A test that passed locally and fails in CI is probably a clock**, a UTC runner or
  newer zone data (see Testing).
- **There is no HTTP smoke test, on purpose.** A request from a runner reaches the
  Worker and gets a 401, because every `/api` route needs a credential, so a check
  that only sees the front door proves nothing and adds a way for a good deploy to go
  red. The last step is `wrangler deployments status`, which asks Cloudflare what is
  serving; it retries because it once caught the API mid-switchover (`code: 10013`).
- **`wrangler` and `@cloudflare/workers-types` move together** (wrangler peers on a
  types major, so bumping one alone fails to resolve).
- **CI depends on one behaviour nothing else would catch:** `d1 migrations apply`
  answers its own confirmation prompt when stdin is not a terminal (`🤖 Using fallback
  value in non-interactive context: yes`; there is no `--yes`). Check that line still
  appears after a wrangler bump.

## Sign-in, sessions and credentials

**The Worker is the security boundary.** Login is a WebAuthn passkey verified in the
Worker, so a route that is not authenticated is public to the internet. The check is
**one middleware over `/api/*` with a written-down exemption list**
(`PUBLIC_API_PREFIXES`) rather than something each router opts into: a router added
tomorrow is covered by doing nothing. See `docs/passkey-login.md`.

- **`DASHBOARD_URL`'s hostname is the WebAuthn relying-party ID**, baked into every
  credential at registration, so changing the hostname invalidates every passkey. It
  is read from the var and not the request (a header is written by whoever is asking);
  the request URL is consulted only when nothing is configured or the value is
  `localhost`.
- **Email sends a code, and the code is not a login.** It authorises *adding a
  passkey* (single use, five guesses, fifteen minutes, one live per account) and the
  session you end with is the one enrolment produced. A code that opened a session
  would be the old edge login wearing a new screen. `test/uiConsistency.test.ts`
  fails if the code reaches a login endpoint or the button stops saying *Add a
  passkey*. The code stays out of the subject, preheader and first paragraph of the
  text body (what a locked phone shows), and the body says whoever enters it can add
  a passkey (`src/lib/authMail.ts`).
- **The recovery address is never typed by the person asking.** The sign-in screen
  asks for the account's email as a *lookup key*: `recoveryAccount` matches it against
  `AUTH_EMAIL` (owner) or `users.email` (fixed by the invitation) and the code goes to
  the address *on file*. The answer is the same sentence whether or not anything
  matched, the cooldown is silent, and the work runs after the response so timing
  matches, because anything else is an account-existence oracle. `enrolmentRecipient`
  reads deployment configuration only, not a settings row (which an attacker with a
  session could redirect), and has no default: unset means `recoveryAvailable: false`.
- **Changing who can sign in costs a passkey touch.** A session is thirty days, the
  wrong credential for adding a passkey or deleting one (a stolen cookie could enrol
  its own and delete the rest, which survives *sign out everywhere*).
  `POST /auth/register/*` and `DELETE /auth/passkeys/:id` need a recent assertion (migration 0020):
  `elevationState` in `shared/auth.ts` is the fifteen-minute window,
  `auth_sessions.elevated_at` records it, `/auth/elevate/*` runs the login assertion
  under its own challenge purpose so a sign-in challenge cannot be replayed to raise
  privilege. Signing in is deliberately not elevation. The emailed code is exempt,
  because recovery cannot require the thing being recovered (`authoriseEnrolment`; tests fail if either
  route drops its check or the code branch gains one). The rule stays narrow, because
  a prompt you see constantly is one you stop reading: bulk writes, Gmail connect and
  status changes ask for nothing. The client tries first, re-asserts only on refusal,
  and retries once.
- **A passkey user handle is per account.** An authenticator *replaces* a credential
  sharing a handle, so two people on one device would replace each other. The owner
  keeps the original string; everybody else is keyed by account id.
- **Invitations are credentials that create an account.** Stored hashed, shown once,
  thirty days, single use, withdrawable until redeemed. The address is typed by the
  owner and fixed at issue (the signup half of the recovery rule). The token lives in
  the URL fragment (`#join/<token>`), never a path, so it is never sent to the server,
  logged or put in a `Referer`; `test/invites.test.ts` fails if it moves. Redemption
  spends the invitation last, after the passkey verifies, so a cancelled prompt leaves
  the link working. The owner hears through a bell *event* naming the person, never a
  tenant id or an address. Unused invitations prune 90 days after they lapse
  (`UNUSED_INVITE_RETENTION_DAYS`). `invite_requests` (a name, address and reason from
  somebody with no account) creates nothing and emails nobody; **Invite** only
  pre-fills the real form. A honeypot, a per-sender limit on a salted hash and a daily
  ceiling keep a flood cheap; answered requests prune at 90 days, the rest at a year.
- **Research agents hold an issued token, not a session.** WebAuthn has no
  non-interactive mode, so a bearer is their credential, checked before the session
  because an agent never sends a cookie (`actorForBearer`). `agent_tokens` is hashed, revocable and
  per-tenant, issued and revoked at `/api/agent-tokens` behind a passkey touch (owner
  only; an agent cannot manage tokens, since a credential issuing its successor makes
  revoking one a race). The token is shown once and held only in the card's state.
  The old shared `API_TOKEN` is retired: a leftover secret is inert
  (`test/routes.test.ts`) and `test/agentRoutes.test.ts` fails if `src/` reads it.
  Settings → Owner → Agent tokens issues and revokes.

## Tenancy and admin mode

**A request resolves to an artist before any route runs.** Seventeen tables hold rows
that belong to one person and `src/db/scope.ts` is the only way to reach them:
`scoped(table, tenant, ...rest)` builds the `WHERE`, `withTenant` builds values, and
`TenantId` is a **branded** type with one constructor, so a user id cannot be passed
where a tenant belongs. Resolution happens once, in the middleware, like
authentication. From a route inward the tenant is an *argument*, never fetched.

- **A missing filter is a test failure, not a leak.** `test/tenantScope.test.ts`
  reads the source and fails when one of the seventeen is named in a query that does
  not pass through `scoped` or `withTenant`: an unscoped query typechecks and returns
  the right rows for as long as there is one artist. One exemption (event retention,
  a platform rule), with its reason written down. Two shapes used to hide a gap: a
  `.where()` skipped when no filters applied, and an `inArray(id, ids)` with ids from
  the browser, where the tenant filter beside it is the whole check.
- **The cron has no request to read a scope from.** Housekeeping runs per tenant;
  event retention runs once. The **digest is every account's own**: its switch and
  schedule live in `tenant_settings`, off until turned on, and an artist's goes to the
  address they sign in with (the `tenant` mail audience reaches only an address on an
  account in that tenant; the owner's keeps its configurable recipient,
  `src/lib/digestSettings.ts`). **The reply scan runs for the owner's tenant only**:
  the mailbox is one `GMAIL_REFRESH_TOKEN` pointing at one inbox, and looping it would
  scan the owner's mail on a stranger's behalf. The notes backfill runs for every
  tenant under one platform marker.
- **The deployment's mailbox, calendar and sending address are the owner's.**
  Anything that reads `GMAIL_REFRESH_TOKEN`, `GOOGLE_REFRESH_TOKEN` or
  `GOOGLE_CALENDAR_ID` on a tenant's behalf asks `isOwnerTenant` first
  (`src/lib/actor.ts`): the reply scan and sent-mail reconcile
  (`refuseUnlessMailboxOwner`), the calendar secrets path (`calendarWay`), the bell's
  Gmail and email rows. An artist's own mailbox is a grant they would make and is not
  built. Publishing to the shared catalog is the owner's agents only
  (`agentMayPublish`). `test/ownerOnly.test.ts` fails on a route that reads the
  mailbox without asking.

**Admin mode is a different surface, not a bigger one.** `auth_sessions.mode`
(migration 0023, `docs/multi-tenant-plan.md`) says which surface a session is on. In artist mode it resolves to the
owner's own tenant; in admin mode to **no tenant**, as a type: `AppEnv` carries an
`actor`, `AdminEnv` carries an `admin`, and `AdminActor` has no tenant field, so an
oversight route reaching for `gig_opportunities` has nothing to hand `scoped()` and
does not compile. `src/index.ts` is the only place that sets either.

- **Both refusals matter.** Artist mode is refused `/api/admin/*`; admin mode is
  refused everything else. Drop the second and admin mode becomes an artist session
  with extra pages, with the promise to invited artists resting on the owner not
  clicking a link. Each refusal names the mode needed (`needsMode`), and the app
  renders one surface or the other.
- **Entering costs a passkey touch; leaving costs nothing.** There is no
  impersonation and no "act as", deliberately: `test/adminMode.test.ts` fails if the
  oversight screen carries the vocabulary or links to a route that surface cannot
  reach.
- **Oversight reads three tables and writes one thing.** `tenants`, `users` and the
  `usage_daily` rollup (counts written by the cron running *as the tenant*). The one
  write that crosses the line is removing an artist: a tenant-scoped delete across
  the seventeen, previewed as a **count per table**; the owner's own tenant is
  refused. The test fails if the admin router names one of the seventeen or uses
  `asTenantId` more than that once. `MEASURED_FIELDS` names the four counters with a
  writer (`domain_rows`, `gig_rows`, `promo_rows`, `agent_runs`); a request counter
  is a write per request, which this app declines to build.
- **Every successful admin write leaves a sentence in `admin_changes`**, never the
  request body, so no address or key is in it (`shared/adminLog.ts`, pruned at a year).
- **The admin surface is a sidebar of pages, and every list on it is paged.**
  `#admin/<page>`; `frontend/src/pages/admin/sections.ts` is the only list of pages and
  names (the sidebar, tab title and router read it). One `h1` per page, an `h2` per
  part, and the error boundary is keyed by page.
  - Lists page through `shared/pagination.ts` in sizes 10, 25, 50 (a limit the browser
    can set is a way to ask for everything) with one stored preference. Small lists
    are sliced in the browser (`PagedList`); listings and findings page in the Worker
    with `limit`, `offset` and a `total` counted over the same filter.
  - The sidebar's counts come from `GET /admin/badges` (two counts and the source
    rows, never a candidate: `/catalog/sources` aggregates them all). The query
    client's mutation cache invalidates `['admin', 'badges']` after any write.
  - A switch is for something that takes effect at once; opening the public survey has
    preconditions, so it stays a button. A source that is off sorts last and is drawn
    quietly with its frequency disabled; a hidden listing stays where it is, because a
    switch that moved its row would hide what you just did.
  - A source's frequency is `cadence_hours` set from five choices in
    `shared/sourceControls.ts`; it counts from the last read and keeps a failing
    source's back-off, and the page says when the choices ask for more reads a day
    than the cron's three an hour can make.
  - Settings shares the shell (`SidebarShell`). Below 1024px both are a grouped list
    you tap through, as the iOS Settings app is; `useNarrow` decides in script because
    it changes what is drawn. A bare `#settings` is therefore the list on a phone, so
    links that mean a page name it (`#settings/google`, `#settings/reminders`,
    `#settings/admin`), and the old tab ids (`connections`, `account`) still resolve
    because sent emails point at them.

## Mail

- **`sendMail` in `src/lib/mailer.ts` is the boundary.** Every send names an
  **audience** and `shared/recipients.ts` refuses an address that audience has no
  record of: the digest reaches only the owner's addresses (narrower than "on file":
  an artist's address is on an account and still not somewhere the owner's digest may
  go), a setup code only an address already on an account, an invitation only the
  address a live invitation was issued to. It is one function with one caller, and
  `test/recipients.test.ts` fails if anything else touches `env.EMAIL`. The binding
  still enforces the *sender* (`allowed_sender_addresses`). `PATCH /api/digest/settings`
  and `POST /api/digest/send` are owner-only for the same reason.
- **Every email goes through `src/lib/emailTemplate.ts`**, whose footer type makes the
  author pick `transactional` (states there is no unsubscribe) or `notification`
  (links to where it is switched off). Both identify the sender by name, mailing
  address (`MAIL_POSTAL_ADDRESS`) and web address. The setup code and digest are not
  marketing, but the first message that is needs an unsubscribe that works signed out.
  The palette is the app's light tokens, since a dark email is re-coloured
  unpredictably. `test/emailTemplate.test.ts` runs every rule against every email and
  fails on a subject typed at a call site.
- **A draft can open a compose window, and that is still not sending.**
  `shared/mailto.ts` builds a `mailto:` or Gmail-compose URL; `DraftActions` mounts
  Copy beside them. A `mailto:` URL past the platform ceiling neither truncates nor
  errors (on Windows the click does nothing), so length is measured *after* encoding
  and a draft that will not fit gets no button that would lie. Budgets are under the
  lowest credible figure (`mailto` 1,800, Gmail 4,000). **Copy is never withheld**
  (`test/uiConsistency.test.ts` fails if it sits behind that test). Encoding is not
  `encodeURIComponent` alone: it leaves `!'()*` and writes newlines as `%0A` not
  `%0D%0A`. `sync-pitch-research` is told to write 150 words, for the editorial reason
  (a cold pitch competes with a hundred others), not the technical one; the tool
  result feeds the word count back as guidance, never a refusal.

## Google and other connections

**Google is one connection, stored as several grants.** "Connect Google account" is
one consent for Calendar, Tasks, Gmail drafts and Drive (`BUNDLE_PURPOSES`,
`GET /api/google/connect`, finished by `completeBundle`). Google shows them as
separate checkboxes, so each is checked and stored as its own `google_grants` row
sharing one refresh token, keyed by **purpose** so revoking drafting cannot blind
another service. An unticked service is skipped, never stored broken; one that fails
to set up does not sink the rest; a service already on a *different* account stays
there. `prompt=consent` and `access_type=offline` are set explicitly, because Google
returns a refresh token only on a fresh consent. Reconnecting the same account reuses
the calendar, list and folder it made. Disconnecting an account revokes its token at
Google. The refresh token is **AES-GCM encrypted** with `TOKEN_ENCRYPTION_KEY`: the
only value in D1 that is a credential somewhere else.

- **Both purposes return to `/api/gmail/callback`** and `state` carries which grant is
  being completed (`src/lib/googleOAuth.ts`); the path keeps the name of the feature
  that registered it because a second redirect URI would be something to configure in
  the Google console. The callback redirects to `#settings/google?…` and
  `connectNotice` (`shared/integrations.ts`) turns every outcome, including a partial
  one, into a sentence, drawn by that page. Calendar and Tasks also have their own connect routes
  (`/api/calendar`, `/api/tasks`).
- **Each scope is the narrowest that works, and where Google enforces the limit the
  test pins it.** `calendar.app.created` lets Scout make and edit a secondary calendar
  called **Sun Dogs Music Scout** and reach nothing else; `drive.file` reaches only the
  folder Scout made and files the artist picked (`test/calendarGrant.test.ts` fails if
  a broad Calendar or Drive scope appears in `src/`). Where Google offers nothing
  narrow, the limit is enforced here and stated plainly: **`gmail.compose` also
  permits sending**, so the guarantee is that there is no send call in
  `src/lib/googleGrant.ts` and `test/uiConsistency.test.ts` fails if a Send button
  appears; **`tasks` has no narrow scope** (it reaches every list; there is no `tasks.app.created`), so
  `src/lib/googleTasks.ts` names one list and never enumerates, and the Integrations
  row says so (`test/integrations.test.ts`); **`calendar.events.owned`** (the artist's
  own calendar) is an opt-in behind `PRIMARY_CALENDAR_OPT_IN`, because declaring that
  scope on the OAuth client puts it in front of Google's review for every user, so `calendar.primary` stays out of the bundle.
- **Gmail is explained before Google asks, and "no" means Google never asks.**
  `GoogleConsentModal` opens first, with **Connect without Gmail** as the primary
  button (`/api/google/connect?gmail=skip`, target `google.nogmail`). It is exact in both directions: as
  alarming as the permission is and no more. Every route to the Gmail permission goes
  through it (`test/googleAccounts.test.ts`). The inbox scan (`gmail.readonly`) is not
  in this flow: it is the owner's server-held secret.
- **"Is the calendar connected" has one answer.** `calendarWay` (`test/calendarWay.test.ts`, run against the production schema) makes the choice
  `calendarTarget` acts on, from stored rows alone, and the bell asks it too. A grant
  that exists but is refused writes nowhere rather than falling back to the owner's
  secrets calendar. `calendarTarget` still prefers a grant and falls back to the old
  secrets path (read both spellings). Gmail's and Email's bell rows are still the
  deployment's secrets and binding, right for the owner and wrong the day an invited
  artist's own grant is what a screen reads.
- **Credential health.** Cards ask whether a credential *works*, not whether a secret
  is set (`shared/credentialHealth.ts`, `src/lib/credentialCheck.ts`). The probe
  *spends* the credential (exchanging the refresh token), a refusal (400, 401, 403) is a
  verdict and a timeout or 500 is none (only `rejected` reaches the bell), `unverified`
  is a state not a fault, and sending is unprobeable (a check that mails you on every
  open is worse) so that card reads `declared`. It runs on the daily housekeeping tick
  and on `POST /api/health/check`, neither needing a passkey touch, and is not in
  `AGENT_ROUTES`.
- **The Drive picker's API key and project number are admin-mode settings**
  (`drive.pickerApiKey`, `drive.pickerAppId` in `app_settings`,
  `src/lib/pickerSettings.ts`), with no environment fallback: a public value typed once
  is not a commit and a deploy, and two places for one value is how the one you
  changed is not the one read. The panel offers the project number its Google client
  ID names and warns on a mismatch (a picker under another project hands Scout files
  it cannot read). `test/pickerSettings.test.ts` fails if the old variable names
  (`GOOGLE_PICKER_API_KEY`, `GOOGLE_CLOUD_PROJECT_NUMBER`)
  return. Picking a *folder* grants the folder, not its contents; picked files are
  copied, never moved; organising previews first; sharing is one permission on the folder that every
  file inherits; nothing is deleted.
- **Bandsintown is read with the artist's own key** (`artist_connectors`, AES-GCM
  encrypted), which never reaches a page. Saving probes first and a refused key is not
  stored (a timeout still saves). Shows are read on request, not copied. Bandsintown
  echoes the caller's `app_id` into every link, so `shared/bandsintown.ts` strips it
  (`test/bandsintown.test.ts`). `today` comes from the browser. A platform doing this
  for many artists wants their partner programme first. `docs/artist-profile-plan.md`.
- **Association profiles are read from the address the artist gives, never found by
  name** (a search by name files a stranger's bio the day there are two of you).
  `shared/manitobaMusic.ts` has its own parser; every other site goes through
  `shared/associationProfile.ts`, which reads **by subtraction** (it drops every link,
  paragraph and share image the homepage shares, so the association's own Instagram is
  not filed as the artist's). One connector row per association (`association:<id>`).
  Connecting shows the name and photo ("Is this you?") before saving; the import is
  preview-then-write, everything lands unreviewed, contact details are never copied.
  `shared/musicAssociations.ts` lists the ten worth reading (`test/musicAssociations.test.ts`
  fails if the registry names a source the gig agent's prompt does not). `scanProfiles`
  re-reads connected profiles on the daily tick and only talks: the first read is a
  baseline, an item is announced once ever (`seen_sources`), nothing is written.
- **The travel band is measured once and cached, and a home nobody set is no
  distance.** `enrichTravel` (`src/lib/travelEnrich.ts`, hourly, ten gigs at a time,
  one request per 1.1s) geocodes the gig's place with OpenStreetMap's Nominatim and
  routes the drive from the artist's home base with OSRM (`src/lib/geo.ts`).
  **Cached, not fetched on read** (both services allow about one request a second from
  the whole app and require results stored; `geo_place` and `geo_home` record what an
  answer was for). **The home base is the artist's own** (`travel.home` in
  `tenant_settings`, Settings → Profile) and has no default. A measured distance
  outranks the place-name guess and yields to a band a person set, and it is checked:
  a road shorter than the straight line is the router snapping an endpoint and counts
  as no route. Only "Town, Region" is looked up. The card says what leaves the app, and
  screens credit OpenStreetMap beside a measured figure.

## Research agents and the catalog

**The research agents run as Claude Code routines, and their instructions are
files.** Cloud sessions on the artist's Claude plan, not per-token API credit (a sweep
compounds: server-side web search re-reads the growing context before each search, and
the first API-driven runs spent $20 and filed nothing). `.github/workflows/agents.yml`
is a hand-triggered, paid fallback. The prompts are `scripts/agents/prompts/*.md`,
in the repository on purpose so a change in behaviour arrives as a diff; a routine's
saved prompt only names an agent and points at `scripts/agents/routine.md`. See
`docs/agent-routines.md`.

- **A routine has a shell, so the Worker decides what an agent may do.** The token is
  added by Anthropic's proxy to *any* request for the host, so hiding it does not stop
  `curl -X DELETE`. `shared/agentRoutes.ts` limits an issued token to eleven routes
  (six reads, four creates, the run log), for every agent including the CI fallback, which holds an issued token as `SCOUT_API_TOKEN`
  (`.github/workflows/agent-run.yml`).
  **Which routes is half of it; what they carry is the other half.** `agentWrite`
  (`src/lib/agentWrites.ts`) sits in front of `POST /api/gigs`, `/sync`, `/promo` and
  `/task-runs` and, for an issued token only, requires exactly the tool's fields
  (`.strict()`, `status` limited to `discovered`), bounds each text field, refuses past
  a trailing day's ceiling (`AGENT_DAILY_LIMITS`) and answers 409 with the row it
  repeats. A task run's `run_at` is never taken from an agent.
  `test/agentWrites.test.ts` checks the schemas against `TOOL_SPECS`.
- **Agents get named, typed tools and never a general HTTP tool**
  (`scripts/agents/tools.ts`; `run.ts` hands them to the model, `cli.ts` exposes the
  same names as subcommands for routines). JSON Schema, not `betaZodTool`: it is built
  for Zod 4 and every route validator here is Zod 3. Dry run is the default, with
  `--apply` to write (`run.ts`, `cli.ts`, `scripts/issue-agent-token.ts`,
  `scripts/backfill-deadlines.ts`).
- **A routine has no calendar connector and must not get one**: the Google Calendar
  connector has create and delete tools it would use unasked, and connectors bypass
  the route list. "My calendar" means `list_shows` (`GET /api/shows`: Bandsintown, the Manitoba
  Music profile and calendar, and *booked* gigs, one row per night); only booked gigs
  are announced, since announcing a show that then falls through is worse than none.
  `list_existing_promo_drafts` gives each draft's status, the only account the agent has
  of what the artist did: `draft` unread, `approved` liked, `published` posted.
- **The heartbeat is the agent's job.** A routine that crashes or forgets `log_run`
  leaves no row. What catches it is `shared/taskCadence.ts`: a schedule that goes
  quiet raises a **condition** (derived, self-healing) rated `critical`, because
  nothing retries a stopped schedule. **The cadence is measured, not configured** (the
  median gap between a task's own runs, so one holiday cannot blind the check) and it
  **under-reports on purpose** (a three-day floor, a 45-day ceiling). A task that has
  never run cannot be missed. `parseRunAt` reads a zoneless stamp as UTC.
- `SCOUT_API_URL` falls back on empty as well as unset (`resolveBaseUrl` uses `||`):
  GitHub renders a missing variable as `""`. In `run.ts` the tool runner does not
  auto-resume `pause_turn`, so it iterates and records a run that still ends paused as
  `incomplete`, and it streams because a turn of searches outlasts the SDK's timeout.
- **A document-reader routine** reads PDFs a Worker cannot (a stage plot drawn as
  shapes), lists documents labelled stage plot, rider or input list
  (`shared/documentReadings.ts`) and files a transcription; the write is checked
  against the asset's current file address. Photos, videos and spec pages are not read.

**Listing facts live once, in a shared catalog.** `opportunities` holds what is true of
a call for everybody and has no tenant and no column for anything an artist decided;
gig and sync rows link by `opportunity_id`. `src/lib/catalog.ts` writes it by
read-by-key then insert (no `ON CONFLICT`); a later sighting fills gaps and never
overwrites, so one poisoned page cannot rewrite what every artist sees; linking is
best-effort so a catalog failure never costs a filed gig, and `relinkMissing` retries
on the daily tick by the backfill's rule (untouched rows only). Sync targets are
catalogued only when they are organisations. An entry is public by default only when a
research agent filed it, it has a listing URL on a public host (never a Doc, Drive
file or mail thread) and it is a festival, showcase, funding call or sync
organisation; the owner's **Landing page listings** page shows and hides anything.

**Scout reads the pages that list calls; agents are for finding new ones.**
`src/lib/sourcePoll.ts` reads `catalog_sources` (seeded from
`shared/musicAssociations.ts`, which stays the truth for the ones it names) on the
hourly cron, three a tick, with the same honest user agent as every fetch. Two readers,
**found by markup and never by host**: `shared/feedParse.ts` (RSS, Atom, iCal) and
`shared/listingParse.ts`. Neither reads prose: a deadline comes only from a line saying
*deadline* beside a date, and a year-less date stays words (`splitDeadline`).
`shared/callClassifier.ts` gives each item a verdict and **the sentence that decided
it** (`unclear` is a real answer); its test table (`test/callClassifier.test.ts`, mostly real titles) is a regression guard, and accuracy is
read from the owner's **Ignored** tab. `docs/catalog-ingestion.md` has what the first
real reads showed; read it before changing a rule.

- **A candidate is not an opportunity**: nothing here reaches the catalog, because the
  announcing page is usually not the programme's own page and publishing it would key
  the catalog on the wrong address. **A source that answers is not a source that
  works** (`sourceState` reads what came *back*: `stale`, `empty`); a refusal is a
  verdict on our access, a timeout is none; first sight is a baseline; a broken source
  is read less (retries at 2×, 4×, up to a week); an unchanged one costs a 304 or a
  compared hash; the body is capped at 3 MB and a stranger's markup only ever becomes
  strings, never followed, run or passed to a model.
- **A programme that comes round again is the same programme, and Pass means this
  intake** (`shared/intakes.ts`, run per artist on the 3am tick before the reminder
  reconcile). A passed or missed intake is offered again as a new row when the entry
  holds a later date and the old row is left as it was (deleting the row is how
  somebody says never). A New row nobody decided on is advanced in place, which moves
  `updated_at` and so wakes a snooze. Nothing In progress or Applied is touched.
  `reopened_at` restarts the three-day holding period. **Only the platform's own
  research moves a deadline, only forward, and only one that has gone**
  (`advanceIntake` in `catalogueEntry`): a page naming a later date may name another
  stream, and a poisoned page must not push a live deadline out of sight.
  `refreshProgrammes` reads a public entry's page once its deadline passes (three a
  tick, a week apart, stopping after eighteen months); `readNextDeadline` requires a
  year, so recall is low and it is a partial feeder. One bell event a night; suggestions
  off means no new rows but existing rows still move; ten re-offers a night at most.
- **A new account is shown what is open to nearly anyone before it has said
  anything** (`StartHere`, `shared/startLanes.ts`, `GET /api/matching/start`): grants
  open across Canada, festivals and showcases in their province, and sync companies
  whose own sites say they take submissions and ask for no exclusivity. Gig lanes are
  cut from `matchCatalog`. **A missing input is never a guess**: a grant is "national"
  only where its place says so, and a province lane with no province asks for one. A
  sync company is shown only on its own words, with the sentences; silence about
  exclusivity is listed apart, and companies that ask for exclusivity or refuse cold
  pitches are counted and never listed (`readExclusivity`, `shared/syncExclusivity.ts`,
  follows `syncTerms.ts`: caution beats reassurance, and a sentence about what a
  *customer* gets is not about the artist). Every add is re-checked server-side
  (`POST /start/add` and `/start/sync`; a refusing company is a 409). It retires once
  they say not now, switch suggestions off, or have twelve rows (`START_UNTIL_ROWS`). `checkTarget` mirrors
  findings onto the catalog entry **only for the owner's tenant** (another artist could
  point an organisation's name at a page of their choosing).
- **Suggestions are ordered, never removed** (`shared/artistFocus.ts`, `focusFor`).
  What was asked for outranks how far it is, and a deadline outranks both; only
  undecided items are ordered; something beyond their chosen reach is noted and sorts
  later, never hidden, since a ranker that hides what it scores low never learns it was
  wrong. "My province" is the province in the home base, never a guess.

**A sync target says whether it takes pitches, and the app reads the answer instead of
trusting that somebody did.** Each target carries `submission_policy` (`open`, `closed`
or null), `policy_evidence` (the sentence), `policy_url`, `policy_checked_at` and
`policy_overridden_at` (the artist's "pitch anyway", its own column so a re-check can
never undo it). `shared/syncTerms.ts`, `src/lib/syncTerms.ts`.

- **Null is two things, and neither is a green light** (never checked; read and found
  silent), and a site nobody could read is a third. Nothing writes the policy except
  automation moving toward caution and the artist's override (the columns are not in
  the PATCH schema). An agent's `open` has to carry the sentence (`startingTerms`
  refuses it otherwise) and a refusal on the site beats an agent that said open.
- **The Worker reads the site itself**: on filing, when the address changes, on the
  button, nightly for anything unread (six a night per tenant, `checkPendingTerms`),
  and *Read their sites* on the Sync page (`CheckAllTerms`, a target at a time from the
  browser, picked by `targetsToRead`). It never touches `updated_at`. It follows the
  links worth following **and** asks for conventional pages (`POLICY_PATHS`) once per
  host, because a redirected home page can hide an old `/about.html` that holds the
  refusal. Only plain public websites are fetched (`isFetchable`). It does not search
  the web, covers sync targets only, and the card says how many pages were read rather
  than that the target is fine.
- **A refusal needs somebody refusing and something refused.** Every rule in `CLOSED`
  needs a thing a pitch is made of (`THING`), skips a clause where the company is the
  one sending (`THEY_SEND`), and treats an instruction about the route (`A_CHANNEL`) as
  such; "by invitation only" needs a submission in the sentence; page text breaks
  lines only at block tags. Precision is measured on real sites, and a sentence that
  taught something is a test. `retractFalseRefusal` withdraws a refusal on file that
  the current rules would not make (nothing else could, since automation only moves
  toward caution); `RETIRED_CLOSED` and `refusalRetracted` are deleted once every row
  has been read again.
- **The gate is on every way out.** A refusal removes Copy, the mail links and Mark
  Pitched from the Sync row and the Review pane, offers Archive, ranks the row near the
  top (`no_unsolicited`, 98) and puts it on the weekly email; the bulk Gmail drafts
  leave out refusals and unread targets. Recording a send is not blocked.
  `test/syncTermsUi.test.ts` fails if a surface that renders a pitch beside Copy or a
  mail link stops asking `mayPitch`. **Agents must say**: `create_sync_target` requires
  `submissionPolicy` (`unknown` is honest, silence is not).
- Gmail bulk drafts preview first, re-plan server-side, list **skipped** with a reason
  each (no address, no pitch, already pitched), and **write no status**: a draft in
  your drafts folder is not a pitch that went out.

## The gig pipeline

**Statuses say who decided.** `shortlisted`/`passed` are the artist's decisions,
`invited`/`declined` the organiser's; turning an offer down yourself is `withdrawn`.
`normaliseGigStatus` maps legacy spellings (`approved`, `rejected`) forward on read
and write because the research agents live outside this repo. `nextGigStatuses`
(`shared/gigStatus.ts`) says which moves a status offers and the PATCH route refuses
anything else, whoever calls it (`invited → declined` is allowed, because an offer is
not a booking; the button says **Offer fell through**). See `docs/gig-pipeline-plan.md`.

**Screens show four stages over fourteen stored statuses.** **New** (apply or pass),
**In progress** (you said yes; only confirming it went out moves it), **Applied**
(waiting; only a settled answer ends it) and **Closed** with an outcome (Accepted, Not
selected, Passed, Missed, Withdrawn). `shared/gigStage.ts` is that view (`GET /api/gigs?stage=`) and every
screen reads it. `preparing` is In progress with a draft; `acknowledged` is a receipt
offered as **Answered**; `info_requested` and `invited` are **flags** on Applied;
**Accepted means the terms are settled** (a signed contract, or written confirmation
for a grant, via `settledByAward`), so an invitation stays Applied and nothing reaches
the calendar until Accepted. `archived` shows as Closed with no outcome.

- **Storage holds `status` plus `outcome` and `flag`** (migrations 0030, 0031). The
  code still reasons in the fourteen and translates at one boundary:
  `src/db/gigRows.ts` (`readGig`/`readGigs` on every select, `gigStatusColumns` on
  every write). `test/gigRows.test.ts` fails when a file selects gig rows without the
  translation, `test/gigStage.test.ts` when a screen imports `GIG_STATUSES`,
  `GIG_STATUS_META` or `gigStatusMeta`. `gigStatusFromStored` still accepts the
  fourteen (read both spellings) and `test/gigStatusMigration.test.ts` runs 0031 against
  the production schema. Status columns are typed `string` on purpose: production
  rows carry values outside every union the UI offers.
- **Two statuses mean the ball is back with you.** `awaitsYourReply` splits
  `info_requested` and `invited` out of "waiting on the organiser" and they carry a
  `reply_due` flag that outranks every deadline; **Waiting on them** is the filter for
  the other side.
- **Silence is a signal, and the only one that is an absence.** `submissionSilence`
  measures from `submitted_at` (migration 0010), becomes a `no_reply` flag past
  `NO_REPLY_DAYS` and is the second explicit exception in `awaitingDecision`.
  `submitted_at` was **not backfilled**: `updated_at` moves on every edit and would
  over-report. Older rows fall back with `exact: false` and every surface says
  "about"; the fallback can only under-report.
- **Every choice is logged with what the screen showed** (`decision_log`, migration
  0038, the seventeenth scoped table; nothing reads it yet). The snapshot
  (`shared/decisionLog.ts`) is built **field by field from the row as it was before the
  move**, with the queue's own flags and derived days and cost: no spread, so notes,
  drafts and addresses are absent by construction. `via` records the door, because a
  step is not a choice (`isChoice`); the write is append-only and best-effort
  (`test/decisionLog.test.ts` fails on an update or delete, and on a new status writer
  that neither logs nor has a written reason). Not logged: filing a gig, the nightly
  revisit, edits that leave the status alone. `score` is reserved and null.
- **Performance dates are typed, not parsed.** `performance_start`/`performance_end`
  never hold prose (`shared/performance.ts`); a bad pair makes `showSpan` return null,
  which the reconcile reads as "remove the entry". Google's all-day `end.date` is
  exclusive, hence `endDateExclusive` at every layer.
- **Deadlines are often prose** ("None, rolling artist roster intake"). Anything
  wanting a date goes through `splitDeadline`, which returns null rather than guess,
  and a recovered date is shown with its prose.
- **The visa lead time counts from the deadline, not from today** (`visaLead`,
  `visa_risk`, weighted above every deadline): a P-2 takes about ninety days and
  cannot be filed before somebody agrees you are performing, which is after
  applications close. An unstated `performance_kind` keeps the ninety days.
- **Cost is a denominator, never a criterion** (`shared/gigCost.ts`): no `value`,
  `efficiency` or blended score, because the weights have not been elicited. Every
  figure is a **range**, `local` is its own band (`NIGHTS_BY_BAND`: 0–0 nights; a Manitoba address bands
  as a drive at worst), a missing input is named in `unknowns`, and `outlook` is
  decided from the range, never a midpoint: *Income*, *Investment* or *Could pay its
  way*. The words are chosen: a showcase that does not break even is spending on being
  heard, so `test/gigCost.test.ts` fails if a word of loss returns. No pay recorded is
  not zero pay. `docs/gig-pipeline-plan.md` §7.
- **The note parser moved to write time; it did not go away.** The agents write prose
  from outside this repo, so extraction has to keep happening. `shared/noteColumns.ts`
  stores six facts (`submission_state`, `blocked_on`, `submission_method`,
  `fee_amount`/`fee_currency`, `location`) on insert and on a rewritten note;
  `withStoredColumns` merges them over a parsed note so a corrected column reaches the
  screen, and a null column falls back to the parse. A column that holds something is
  never overwritten (one exception: `fee_currency`, which defaults to `USD`) and
  `updated_at` is left alone, or every snooze would wake. `POST /api/backfill/notes`
  and a one-shot on the cron (`runNotesBackfillOnce`, marker `once.notesBackfill` written after success)
  cover older rows. Rendered shapes (`requirements`, `dealTerms`, drafted values) stay
  derived: a stored copy is a parser cache with a staleness bug. `organizer`,
  `audience_size`, `genre_fit_score` and `agency_type` stay NULL on purpose, because no
  note carries them in a form anything can read; the Gigs table hides a column no row
  has filled (`frontend/src/pages/GigsPage.tsx`).
- **Note prose names the artist, and the name comes from the account**
  (`tenants.display_name` as `ArtistNames`). `depersonalise` rewrites it to the second
  person on the way to the screen and never in drafted field values; pronouns change
  only inside sentences that named the artist. `test/noPersonInCode.test.ts` fails on a
  first or last name in source.
- **One predicate decides what needs a decision.** `awaitingDecision`
  (`shared/reviewQueue.ts`) is used by the Review filter and the weekly digest, so the
  email cannot count rows the page refuses to show. The Overview deck deals from its
  own filter (`deckItems`: a reply owed, then what is new, then what is urgent) and its
  "all clear" line still tests `needs`. A drafted message is lifted out of a note and
  shown as its own block (`splitDraftedMessage`, Copy only, never depersonalised).
- **Scout is for Canadian artists, and says so where it is first read**: costs in CAD,
  the P-2 rule assumes a Canadian act going to the US. An opportunity abroad is never
  left out; it comes with what it takes to get there (`test/canadianCopy.test.ts`).

**Reminders: a calendar entry means you show up; a task means there is work to do.**
Confirmed shows go to the calendar; deadlines, windows opening and replies owed go to
**Google Tasks**. `shared/nudgeRouting.ts` holds the rules (no clock, no database);
`src/lib/gigNudges.ts` reconciles wanted against present. Preferences are per tenant
(`tenant_settings`) and **passed into** the reconcile. Destinations differ per kind and
are typed (`NUDGE_KINDS[].choices`). The opening task is due a day *after* the window
opens, because the daily tick reads the form at 3am. Four nudges follow from an edit and
one does not: `NO_REPLY_DAYS` passes with nothing written to the row, so
`reconcileAllGigs` runs on the daily tick, idempotently. A task you ticked off is left ticked (a
completed task still exists, which is how `readTaskOn` tells done from deleted). See `docs/nudge-routing.md`.

## Forms, replies and the artist library

**The app drafts an application; it never submits one** (`ApplicationPanel`: Copy and
*This one is right*, no Send; `docs/application-prep-plan.md`). Reading a form is
tolerant and states what it could not do:

- **A suggestion is not an answer.** `answer_state` is a column apart from `answer`; the
  readiness line reports *answered* and *read* separately and `sendable` needs the
  second. Re-reading re-stages only `empty` and `suggested` fields. **An over-long answer
  is worse than an empty box** (paste truncates silently mid-word), so it is the one
  field problem rated `danger` alone.
- **A login wall is a fact about the opportunity, not an error.** `prep_status` is
  `blocked` (found, behind an account or JavaScript: fill it in by hand), `failed`
  (timeout or 403: worth another go) or `not_found` (a window that has not opened).
- **The address on a listing is usually the page that announces the form.**
  `readApplicationForm` follows **one** Apply link (`chooseFormLink`: a known form host
  outranks wording, vendors and volunteers are marked down, two alike buttons are
  reported rather than picked). A newsletter box is not an application. FestivalPro has
  its own reader (`parseFestivalProForm`), found by markup; follow-ups its script hides are marked not required (a required question nobody sees would
  stop the application ever reading ready); fixtures are real captures in `test/fixtures/`.
- **Scout goes back for the form, and the research agents do not** (`revisitForms`,
  daily, per tenant, In progress gigs only; triggered by `opens_at`, daily for fourteen
  days then weekly; no date means weekly, not never). It **never moves a status and
  never touches `updated_at`** (`requested` on `prepareApplication`: only the button
  starts an application; `test/formRevisitRun.test.ts` runs it against the production schema),
  and it says what it found with a bell event; silence from an
  undated window is the expected answer. A cron is free and cannot be skipped; a routine
  would cost allowance and leave nothing behind when it crashed.
- **A Google Form can open pre-filled with only what you have read**
  (`shared/formPrefill.ts`): a `suggested` answer or a choice the form does not offer
  stays out and is named; budget 6,000 encoded characters; Google Forms only.
- **The answers can sit in a window above the form** (`PopOutProvider` in `Layout`,
  `AnswerSheet`; `docs/submission-helper-plan.md`). Every clipboard write goes through
  `writeClipboard(text, win)` (`frontend/src/clipboard.ts`) with the window of the button pressed, because a click in
  the window focuses it and not the page holding the code (`test/popOut.test.ts`). The
  window lasts as long as the page that opened it, which is why the provider sits in
  `Layout`, and it has its own document, so absolutely positioned text needs a
  positioned ancestor and the title is set on its own document.

**Replies.** `docs/reply-matching-plan.md`.

- **A reply is matched by name, not by domain** (`shared/replyMatch.ts`): organisers
  reply from form services, portals and personal addresses. The event's name scores in
  the subject or body, with the domain a weaker corroborator. Names are tokenised two
  ways: without splitting camel case ("LieLow" stays one token) and with it ("BreakOut
  West" yields BOW). **Matching reads the whole body; classification reads only the top
  post**, because the quoted receipt below a reply often holds the only mention of the
  event and is never the organiser's answer.
- **Confirm once, then remember** (`gig_correspondents`); two equal matches store the
  reply with no gig. **The scan never reads this app's own mail** (`shared/ownMail.ts`
  names the senders as exact addresses, tied to `wrangler.toml` by
  `test/ownMail.test.ts`; they are left out of the Gmail query, since the fetch is
  capped at 60). It runs three times a day (`REPLY_SCAN_HOURS` 7, 12, 18 local) and
  **never writes a status**: accepting binds the correspondent, and moving the row is
  `PATCH /api/gigs/:id`, so two things that can be wrong independently are two actions.
- `classifyReply` scores all four readings and takes the strongest, returning `unclear`
  when two are close; the deciding sentence is stored verbatim. `recogniseAsks` runs at
  scan time (the body is gone afterwards) and the answer is drafted on read against the
  library as it then is; the ask vocabulary is closed, `composeReplyDraft` always
  leaves a gap, and the draft is Copy-only.

**The artist database expires on purpose.** Each `artist_assets` row carries a
`review_by` seeded from its kind (six months for a follower count, two years for a
press photo); `assetHealth` reads it against a `today` it is handed. `unreviewed` is a
state apart from `overdue`, and a photo with no credit is *broken* from the day it is
added. `shared/artistSource.ts` fills the library from the reference documents with three
rules that read no sentence: a `##` heading is a question (`classifyQuestion`), a
parenthetical is the `variant`, a labelled URL on its own line is a link (not inside a
list item). A section it cannot file is named in `skipped`. Everything sourced lands with
`review_by` null; `GET /api/artist/source` previews and `POST` writes. `GET
/api/artist?freshness=` refuses a value it does not know.

- **An EPK is a view, not a document** (`assembleEpk`), assembled on read so it can say
  what went stale. A share link (`#epk/<token>`, token in the fragment, POSTed to
  `/api/public/epk`) publishes only what the artist has claimed
  (`shared/publicEpk.ts`: reviewed assets, no uncredited photo, facts and documents
  only from an allow-list); `epk_shares` is a credential like `agent_tokens` (`test/epkShare.test.ts` pins where the token
  travels and that `withheld` is stripped). The page
  never renders a library value raw (`shared/epkProfile.ts` splits along the documents'
  seams; a link labelled *private* is withheld).
- **Answers at hand** (`GET /api/artist/answers`, `shared/answersAtHand.ts`) is the
  library cut for the moment a form is open. It says what is wrong before the paste,
  names the questions the artist's applications ask that nothing answers (never by
  matching paperwork by label), and never edits.
- **The Library opens as a profile**; Profile, Grid and Table are layouts of one
  `detail`, so a view never grows its own edit path. Values go through `plain()`.
- **A stage plot is derived, not drawn** (`StagePlotFlow`, `shared/stagePlot.ts`): the
  survey asks what a musician knows offhand and derives the input list, stereo pairs,
  phantom power, stands, monitor mixes, power drops (every plot asks for at least one)
  and layout; `shared/stagePlotClues.ts` offers suggestions from the documents, never
  silently. The stage is drawn as cards (`frontend/src/pages/artist/StageCards.tsx`) with line art
  in `currentColor`; connections use their own `conn-*` tokens and paper is always
  monochrome. The answers are one `tenant_settings` row.
- **A new account gets a checklist, and every tick is read off the account**
  (`shared/onboarding.ts`); only the goals (`onboarding.goals` in `tenant_settings`) and "hidden" are stored. The name and goals are
  asked full screen (`OnboardingFlow`), hosted by the page, not the card, because
  answering can complete the checklist and unmount the card.

## Notifications, History and the feedback form

**Notifications are two mechanisms behind one API.** *Conditions* are derived on every
read and self-heal; *events* are rows, because a run finishing is not recoverable from
current state. Dismissing a condition lasts a day, an event is permanent
(`shared/notifications.ts`, `docs/notifications-plan.md`). The bell polls every five
minutes (a full `composeFeed` is the cost); `refetchOnWindowFocus` is what makes it feel
live.

- **History is the bell with the cap taken off** (`#runs/<type>`): a run is listed
  from `task_runs`, kept forever, never from its echo in `notification_events`
  (pruned at thirty days), joined by `runEventKey` in `shared/runEvents.ts`. A
  dismissed event is still listed. `test/historyRoute.test.ts` runs the queries against
  the production schema.
- **A report is laid out, never interpreted** (`shared/runSummary.ts`); nothing is
  stored, so a better reader improves every old run. Event bodies are cut to 140
  characters in `buildNotifications`; the bell shows what a run filed (`runGist`) rather than the
  report. Stored titles are not retrospectively fixed.
- **The notifications can be pinned beside the page from 1280px**; `pinned` and `open`
  are separate flags in `localStorage` and only the bell polls
  (`test/historyUi.test.ts`). `docs/side-panel-plan.md`.
- **Feedback is a form, not telemetry** (`feedback`, migration 0032). It attaches the
  page, the trail, failed requests from the last half hour in this tab, the build and the
  browser, kept in memory by `frontend/src/diagnostics.ts`, listed before the button
  through `describeContext` (which the owner's inbox uses too). It never carries what was
  on the page; `test/feedback.test.ts` pins the rules.
- **Read-path indexes lead with `tenant_id`** (migration 0018 and after): an index that
  does not lead with the filtered column is one the planner declines to use, and `WHERE
  tenant_id = ?` on an unindexed table scans everybody's rows to draw one artist's page.
  Rows read and requests are the costs that bind here.

## Frontend conventions

Read `.claude/skills/ui-rules` before changing anything under `frontend/src`; it is the
checklist for what `test/uiConsistency.test.ts` enforces.

- **Explanatory text is always tucked behind an info icon.** What a screen is for, how
  something works or what a setting means is not shown by default. It goes in an
  `Explainer`, or where there is no title to sit under, an `InfoToggle` or `useNote`
  (the button and the note in different places). The owner asked for this when the
  admin-mode pill carried a whole sentence. What stays visible is what a person needs in
  order to act: labels, counts, statuses, errors, and the line beside a button saying
  what pressing it will do. `showHints` hides every icon, so a note never holds the only
  copy of a warning. A one-line hint under a page title on a first visit, dismissed once
  to collapse behind the icon for that account, is decided but not built (see the last
  section); until it is, nothing explanatory shows by default.
- **Buttons and inputs come from `components/ui/`.** `Button` takes a variant named for
  meaning (`primary`, `neutral`, `quiet`, `good`, `danger`, `info`); `Field` exports
  `FIELD` and `FILTER`; `SectionHeader`, `SidebarShell`, `Pager`/`PagedList`, `Toggle`
  and `Disclosure` are shared. `test/uiConsistency.test.ts` fails on a hover state that
  repeats the fill, a re-declared input class, or a third hand-rolled `Disclosure`. A
  filter control has no visible label, so it carries an `aria-label`; the same file fails
  on one that does not.
- **A control that names a status is a claim about legality.** The Review bar and the
  Overview deck derive from `nextGigStatuses` through `decisionFor`; a same-status target
  counts as refused (it wrote nothing and dealt the same card back).
- **Text a person has to read is never `text-faint`** (3.6 to 1); `test/historyUi.test.ts`
  fails on it. Colours are tokens (`tailwind.config.js`, and `--c-*` channels so `/NN`
  alpha works); a token that does not exist renders as nothing.
- **Colour themes are data, and the stylesheet is generated from them.** Eight ship:
  Sun Dogs (default, `shared/themeSunDogs.ts`), Pebble, Opal and Harvest (aesthetic,
  derived from Figma palettes by `scripts/themes/derive.mjs` into
  `shared/themeData.ts`) and four accessible ones (High contrast, Colour-blind safe,
  Greyscale, Low glare), each stating its own standard in `STANDARD` in
  `test/themes.test.ts`. `frontend/src/themes.css` is written by `npm run themes:css`
  and a test fails if it is edited by hand. The default and accessible themes are held to
  strict contrast and colour-blind gates; an aesthetic theme is held by a ratchet
  (`shared/themeBaselines.ts`, which may only go up) plus ink and body text at 4.5:1. The
  meaning colours (green go, ochre waiting, clay broken) keep their hues in aesthetic
  themes. A `palette` of `null` means nothing chosen and follows the device
  (`prefers-contrast: more` selects High contrast); print is always the default's light
  palette. The palette follows the account (`tenant_settings` `appearance.palette`, `GET`
  and `PUT /api/appearance`, refused to agent tokens, absent in admin mode); everything
  else in Appearance stays per device. `docs/themes-plan.md`.
- **Every page but the Overview is a lazy chunk, and a tab left open across a deploy
  reloads once.** `App.tsx` imports only `OverviewPage` statically (the first script
  would otherwise hold every page), and `vite.config.ts` gives React and TanStack
  chunks of their own so a deploy that touched only the app leaves them cached. Each
  deploy replaces the whole `dist`, so a stale tab's request for a page it knew by hash
  gets a 404, and `React.lazy` remembers a rejection (so "Try again" cannot help).
  `reloadForStaleChunk` (`frontend/src/chunkReload.ts`) reloads once, not offline and not
  twice within 30 seconds, so a chunk that is truly gone shows the error instead of
  looping. `test/chunkReload.test.ts` pins the split and the rule.
- **Gigs is a table from 768px and a list of cards below it.** A row exists to show its
  stage, and a table twice the width of a phone puts the stage and the buttons off the
  edge. `usePhone` (`max-width: 767.98px`) decides in script so only one layout mounts
  (both mounted would hold every open panel twice). The two share `DeadlineCell`,
  `FeeCell`, `GigActions` and the open panel, so a recovered date keeps its prose and
  the next step comes from `inlineGigMoves` in either. On a phone the stage is on every
  card, controls are 44px, the next step is always visible (`.row-actions` hides it
  until hover, and a phone has none) and a Sort control stands in for the column
  headers. `test/gigsPhone.test.ts`.
- **A `Label` ties itself to the control after it** (the next sibling, or the first
  control inside it), so a form label names its input without an `htmlFor` at each call
  site; pass `htmlFor` when the control is elsewhere. It is a DOM effect, so
  `test/labelLink.test.ts` pins that it stays, not that it works: check `label.control`
  in the running app after touching it.
- **No em dash in anything a screen says** (a string, a template or JSX text under
  `frontend/src`; a dash standing alone for an empty value is allowed):
  `test/visibleDashes.test.ts`. The Worker still builds a few sentences with one
  (notification titles, some emails), outside that test's scope.
- **Surfaces that read as a document are static HTML**: `/privacy/` and
  `/terms-of-service/` are Vite entries (`vite.config.ts`) of plain HTML with no Worker route, so they read
  with JavaScript off and have an address a regulator or Google's OAuth review can fetch.
  `/survey-results` is a Worker route that redirects to `#survey-results`.

## Public pages and legal

**The logged-out page shows a small sample of the catalog** (`LandingPage`, eight open
calls from `/api/public/opportunities`, which reads only the catalog). The fee column is
the fee as the listing stated it and nothing more: the page never says "entry fee" and
never "Free" for a fee nobody stated, and the column is absent while no sample row states
one (a column of dashes reads as "free"). Publishing is conservative (see the catalog).

**The privacy policy's numbers are the code's.** `/privacy/` names Sun Dogs Music
Manitoba, a sole proprietorship Doug McArthur registered on 2024-12-30 (registry number
10219396, three years from filing, so **renew it before December 2027**); he is the
privacy officer. The law is PIPEDA (Manitoba's own Act has no proclamation found; Bill
C-36, tabled 2026-06-15, would replace PIPEDA and is not law, so reread the page when it
passes). The owner decided: 18 or older; the AI paragraph states today's practice
(operator's routines on Claude, public pages and the operator's own account) and promises
notice and consent before it changes; fonts are self-hosted (`frontend/src/fonts.ts`) and
emails link none; English only, which is a real gap in Quebec (Charter of the French
language s. 55 wants a French version handed over first for a contract of adhesion).
`test/privacyPolicy.test.ts` ties the page to the session, challenge, setup-code,
elevation, notification, invitation and usage lengths, to the absence of any outside
host, analytics or web font, and to account removal reaching the invitation row; change a
number in code and the test fails until the page says it, and change the page and its date
together. Gaps it says out loud: no self-service export or deletion (a request by email,
answered in 30 days, removal is `removeTenant`), and if the document reader is ever
pointed at a file in an artist's Drive, "never passed to an AI service" stops being true
and Google's Limited Use rules need explicit consent.

**The terms of service sit beside it** (`/terms-of-service/`,
`docs/terms-of-service-research.md`). Agreement is one action in words beside the button
(setting up a passkey creates the account and is agreeing); a checkbox would be firmer
evidence and costs a click on a deliberately one-action screen, so it is the owner's
decision, not a default. The terms promise only what the policy promises, and every claim
about the service is pinned to the code that makes it true (`test/termsOfService.test.ts`:
free, never sends, an agent token can only read and add, a press kit link can be switched
off, an invitation lapses after `INVITE_TTL_DAYS`). Artists cannot issue agent tokens, so
the terms say tokens are issued only by us. The figures are the owner's (a $100 cap,
30-day notice, Manitoba law, a narrow indemnity): change the number and the sentence
together, with the page's date.

**An account records which terms it agreed to, and nothing reads it yet.**
`users.terms_version` and `terms_accepted_at` (migration 0041) are written by
`redeemInvite` after the passkey verifies; `TERMS_VERSION` in `shared/terms.ts` is the
date the page says it was last updated (`test/termsAcceptance.test.ts` fails if they
disagree). Null means no record and is never backfilled; the version is the Worker's,
never the browser's. It is for a re-acceptance prompt that is not built, so until then the
terms rely on 30 days' notice and continued use. Moving `TERMS_VERSION` is for a change to
the terms themselves, not a typo. Exactly two files may name either column.

**The artist survey is public, anonymous, and ships closed.** It measures how artists
decide whether an opportunity is worth their time so the scoring weights are measured
and not invented; questionnaire and method are in `docs/artist-survey-questionnaire.md`.

- **Nothing identifies a respondent**: no IP, user agent, email or hash of one, and the
  rate limits are global (an hourly and a total cap) plus Turnstile and a honeypot
  (`test/surveyRoutes.test.ts`). The response id is the only credential for its response
  and never appears in a path, only in a body.
- **The server builds the plan and the browser invents nothing.** `buildPlan`
  (`shared/surveyDesign.ts`) decides the ranking screens, their order and the choice
  design from one seed, and the plan is *stored* with the answers; `checkAnswer` rejects
  anything it never offered. The thirteen ranking blocks are a difference set mod 13
  (`{0,1,3,9}`), so every factor appears four times and every pair together once.
- **Nobody's list is shortened because of who they are**: hiding factors by respondent
  characteristics assumes the answer the survey measures (principle 12 in the document).
- **Open or closed is an admin-mode setting** (`app_settings`,
  `src/lib/surveySettings.ts`), not `wrangler.toml`, so closing never waits on a build;
  it opens only with the switch on **and** a contact address stored (`writeSurveySettings` refuses to
  turn it on without one and to strip it from an open survey), and there is no
  environment variable for any of it (`test/surveyUi.test.ts`). The Turnstile secret is a
  Worker secret (`TURNSTILE_SECRET_KEY`); the panel warns, and does not block, when the
  spam check is incomplete.
- **Results are a stored snapshot the owner reviewed** (`survey.published` in `app_settings`), not a view computed per visit,
  because a per-visit page reports a small group the moment the tenth person arrives.
  `shared/surveyPublic.ts` builds it from an allow-list; `POST` carries only the digest of
  what was reviewed and the Worker answers 409 if responses arrived since. It needs
  `PUBLISH_FLOOR` (30) completes and a group under ten is never shown
  (`test/surveyPublic.test.ts` fails if a response id, channel tag, free text or any of
  age, gender, community and income reaches it). Intervals come from the spread between
  artists, not screens; a dollar of entry fee is called "about a dollar" only when the range is narrow around one
  (`RATIO_NARROW`); a dollar value is a ratio to the pay effect, so when pay cannot
  be told from zero nothing is converted; "say against do" compares only reasons at
  least ten artists gave. A spreadsheet cell beginning `=`, `+`, `-` or `@` is quoted in
  the export.
- The analysis is checked by planting preferences and recovering them
  (`test/surveyAnalysis.test.ts`, mutation-checked). The page's look is held by tests: no
  em dash, no small caption above a heading, no coloured left-edge bar, only the app's
  tokens (`test/surveyUi.test.ts`, `test/surveyResultsHero.test.ts`).

## Decided, and not to be reopened without new evidence

- **No compression of stored text.** Every piece of prose in production is tens of
  kilobytes in a database far under the free tier, per-row gzip gets about 1.5× on
  strings this short, and neither rows read nor requests move. Retention is handled
  where it churns (`notification_events` and `notification_marks` prune at 30 days).
- **No request counter in D1**: a write per request is the shape this app declines to
  build, so `api_requests`, `gmail_drafts` and `ai_calls` have no writer and the API
  says so.
- **No HTTP smoke test** (see Reading a red run) and **no deleting the note parser**:
  backfill alone leaves every future row with a filled note and empty columns.
- **No hiding survey factors** by who the respondent is, and **no model-matching per
  artist** without notice and consent (the privacy policy promises it; the plan is
  `docs/matching-gaps.md`).
- **Decided, not built yet:** on a phone the main navigation becomes a bottom tab bar
  (Overview, Review, Gigs, Artist, Sync, the rest under More; today it is a menu, and
  top versus left navigation on a desktop is still open), and the first-visit hint
  described under Frontend conventions. Both were decided on 2026-10-31.
