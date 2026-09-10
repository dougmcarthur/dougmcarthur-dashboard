# Accounts, oversight and invites

This is the plan for turning a one-person app into a platform with a small
number of invited artists on it, and an owner who can see that they are there
without being able to read what they are doing.

It was written before any of it was built, because the order matters: the
oversight screens and the invite UI are the *visible* part and the smallest
part, and neither can exist before the thing they are about — an account that
owns rows — exists underneath them.

**Steps 1 to 4 are done** (migrations 0021–0023; invites needed none, because
their table arrived with 0021). What is left is the `NOT NULL` pass at the end,
and two things gated on mail — see the invites section. Each step's section
below carries a note on what it actually did and where the plan turned out to
be wrong, which is worth more than a plan that reads as though it was right.

## Why not a library

The question asked was whether something already handles this. Three were
looked at properly.

**Better Auth** is the only real candidate. It is open source, TypeScript
first, runs on Workers and D1 through `better-auth-cloudflare` with a Drizzle
or Kysely adapter, and ships passkeys, social sign-in and an admin plugin that
does create / list / set-role / ban / impersonate / delete. On paper that is
most of the ask.

It fails on the specific thing being asked for. Its multi-account model is the
**organization** plugin, and organization APIs are membership-based, enforced
at both the API and the database layer — there is no platform-level view
across organizations you are not a member of. An owner who can see every
artist would have to be joined to every artist's organization, which is the
exact opposite of "no access to personal data": membership is what grants
access to the data. The workaround is to query around the library's own API,
at which point the library is not doing the job.

The model is also wrong in shape. An organization is a company with several
people in it. What this app has is a set of **independent artists who share
nothing**, which is a tenant, not a team.

**Clerk** ($25/mo Pro, $0.02/MAU past the free tier) and **WorkOS** (AuthKit
free to 1M MAU, but SSO connections from $125/mo) are both hosted identity
products aimed at B2B SaaS with enterprise SSO. They would take over the login
that is already built, working and verified, and they still would not scope a
single row of `gig_opportunities`.

**So: extend what exists.** The decisive fact is what fraction of the work any
of them removes. Login is done — WebAuthn passkeys verified in the Worker, one
middleware over `/api/*`, an emailed enrolment code for the lost-device case.
What is left is tenant scoping across fourteen tables, per-artist usage
counting, an oversight surface and platform invites. No library on the list
does any of those four, and two of them would charge for replacing the one
part that is finished.

Adopting one later stays possible, because the boundary is already one
middleware in `src/index.ts` rather than something spread through the routers.

## One account, two modes, and a passkey touch between them

Two roles — `owner` and `artist` — on **one account**, which is in one of two
**modes** at a time. The owner flips to admin mode from the settings menu; the
option renders only for an owner, and the `/admin` routes check the role
themselves, because a hidden button is still a URL.

This went through two worse drafts and the reasons both were dropped are the
argument for this one.

**One account with both jobs at once** was the first, and it rested "no access
to personal data" on a rule about how admin routes are written, enforced by a
source-level test. A rule to remember rather than a shape that holds.

**A separate owner account holding no tenant** was the second. It made the
guarantee structural, but it bought that with a second passkey used once a
month — the credential that is missing when it is finally needed — and a second
recovery address that only ever gets exercised in an emergency, which is the
worst time to find out it was configured wrong.

Modes keep the structural guarantee and pay neither cost, because **the tenant
is resolved from the session, and the mode is session state**:

- In artist mode the session resolves to the owner's own tenant.
- In admin mode it resolves to **null** — not a wildcard, not a sentinel
  meaning "all". Null, and the `tenant_id` every domain read takes is not
  nullable.

So an admin-mode request that reached for `gig_opportunities` does not return a
stranger's rows; it fails to compile. Same property the separate account had,
without the second credential.

### Flipping modes costs a passkey assertion

The one thing a second account bought that a mode does not is credential
separation: a stolen artist session cookie is one POST away from the oversight
surface, where a stolen artist *account* was not.

So entering admin mode requires a fresh WebAuthn assertion, and the elevation
lapses after fifteen minutes. A cookie alone cannot elevate, because elevating
needs the authenticator in your hand — and the window means a session spends
almost all of its life unable to do any of this.

**That mechanism is already built**, ahead of the rest of this plan, because it
turned out to be a live gap rather than a future one: `POST /auth/register/*`
and `DELETE /auth/passkeys/:id` accepted a session alone, so a stolen cookie
could enrol its own passkey and delete every other — which survives "sign out
everywhere", since that clears sessions and not credentials. Both now need a
recent assertion, `auth_sessions.elevated_at` records it, and `elevationState`
in `shared/auth.ts` decides against a `now` it is handed.

Admin mode is the second consumer of the same mechanism, not a new one. The
general rule it establishes: **an action that changes who can get in, or that
destroys data across a boundary, asks for the key again** — and nothing else
does, because a prompt you see constantly is one you stop reading.

### What step 3 actually did, and where the guarantee ended up living

**Done.** `auth_sessions.mode` (migration 0023) is the whole of the mode;
`POST /api/auth/mode` moves a session between surfaces; `/api/admin/*` is the
oversight surface; `src/lib/usage.ts` writes the daily rollup on the
housekeeping tick; and the React app renders one surface or the other rather
than nesting them.

**The guarantee is a type, and that was not the original plan.** The plan said
admin mode resolves to null and a domain read would "fail to compile", which
implied a nullable tenant somewhere. A nullable tenant only refuses at the call
sites somebody remembered to null-check. What shipped instead is two context
types that do not overlap: a tenant-scoped router is `AppEnv` and can only
reach an `actor`, the oversight router is `AdminEnv` and can only reach an
`admin` — and `AdminActor` has **no tenant field at all**, so `scoped()` has
nothing to be handed. `src/index.ts` is the one place that sets either, being
the one place that decides which surface a request is on.

**Both refusals matter, not just the obvious one.** An artist-mode session is
refused `/api/admin/*`, and an admin-mode session is refused everything else.
Without the second, admin mode would be an artist session with extra pages and
the promise would rest on the owner not clicking a link. Each refusal names the
mode the request would need, so the client can offer the switch rather than an
error — and the app renders the admin screen alone, because a page of 403s is
the design working and looking broken.

**Two source-level guards, in `test/adminMode.test.ts`.** The oversight router
must name none of the fourteen, and may use `asTenantId` exactly once — for the
removal, which is the one operation that crosses the line. The oversight screen
must link to no artist route and must not carry the vocabulary of
impersonation, because offering the words is how the feature gets built by
accident.

**The removal previews.** A count per table, which names no column and returns
no row: the size of the thing, not any of its content. Every other bulk write
in this app previews first, and it matters most on the one that cannot be
undone. The owner's own tenant is refused — deleting it would take the account
holding the surface with it.

**Three of the rollup's seven counters have no writer.** `domain_rows`,
`gig_rows`, `promo_rows` and `agent_runs` are measured; `api_requests`,
`gmail_drafts` and `ai_calls` are not, and the API says which is which rather
than shipping three zeroes a screen would render as "none". A request counter
in particular is the thing this plan already declined to build — it is a write
per request — so it needs somewhere outside D1 to live before it can be honest.

**One thing was added that the plan did not ask for**, because the screen made
it obvious: `tenants.display_name` had no writer, so the oversight surface's
identifying column was blank forever. `PATCH /api/profile` lets an artist name
their own account. Deliberately not an owner-side rename — an owner who could
rename an artist would be editing a row in an account they are otherwise not
allowed to read, for no reason better than convenience.

### What oversight reads, and the one thing it writes

`users`, `invites` and a `usage_daily` rollup, and nothing else. Counts the
owner needs — how many gigs, how many drafts — are written into that rollup by
the cron, by code running *as the tenant* that emits a number. The owner reads
the number.

**One operation crosses the line, and it is a write.** An artist who leaves
must be able to have their data deleted: a tenant-scoped `DELETE` across the
fourteen tables, naming no columns and returning no rows. "Never reads a domain
table" survives that intact — never *touches* one was not the promise, and
could not be.

There is no impersonation and no "act as this artist" mode. Better Auth's admin
plugin offers one and it is deliberately not being copied: the promise made to
an invited artist is that their gig notes are theirs, and a support tool that
quietly breaks that promise is worse than no support tool. Admin mode is not a
bigger artist mode — it is a different surface, reachable at `/admin`, in the
same deployment. Its own Worker and domain would double the deploy and the
secrets in order to isolate what the tenant boundary already isolates.

The role set stays at two. A permissions matrix with two rows is a worse way to
write `if (role === "owner")`, and it invites a third role to be invented
before anybody needs one.

## What gets a `tenant_id`

Fourteen tables carry per-artist rows:

`gig_opportunities`, `sync_targets`, `promo_drafts`, `artist_assets`,
`reference_docs`, `application_fields`, `gig_replies`, `gig_correspondents`,
`reminders`, `notification_events`, `notification_marks`, `digest_reports`,
`task_runs`, `google_grants`.

Five do not: `app_settings` is platform state, and the four auth tables
(`passkey_credentials`, `auth_challenges`, `auth_sessions`,
`auth_enrolment_codes`) key off a user, which is a level above a tenant.

`application_fields` is worth a note — it hangs off a gig, so its tenant is
derivable by join. It gets the column anyway. A scoping rule that is "filter
on `tenant_id`, except these two which you reach through their parent" is a
rule with an exception, and the exception is where the leak will be.

### The migration is additive, in the order this repo already requires

CI migrates before it deploys, so for half a minute the new schema runs under
the old Worker. That forbids doing this in one step.

1. **Add the column, nullable, plus the tenant tables.** Old code ignores a
   column it does not name. Nothing scopes yet.
2. **Backfill every existing row to the owner's tenant**, in the same
   migration — there is exactly one artist today, so this is one `UPDATE` per
   table with no ambiguity about who owns what. Doing it later, once a second
   tenant exists, is doing it wrong.
3. **Ship the scoping**: every query filters on `tenant_id`, taken from the
   session. This is the deploy where a mistake is visible, which is why it is
   its own step with nothing else in it.
4. **Make the column `NOT NULL`** in a later migration, once the code that
   fills it has been live long enough to trust.

The indexes from migration 0018 all gain a composite twin leading with
`tenant_id`, in step 1 — an index that does not lead with the filtered column
is one the planner declines to use, so leaving them alone would turn every
scoped read into the full scan the index was added to prevent.

**Twin, not replacement**, which is a correction to how this was first
written. A swap in step 1 would leave the still-unscoped queries — which filter
on nothing — with no usable index for however many deploys separate step 1
from the scoping step, putting the pre-0018 full scan back for an unknown
window in order to save six index entries per row on tables holding tens of
rows. Migration 0021 adds the composites and keeps the singles; the scoping
step drops the singles in the same change that makes the composites the ones
actually used. Verified on the local
database after 0021: the unscoped read still answers `SCAN … USING INDEX
idx_gig_discovered`, and the scoped one answers `SEARCH … USING INDEX
idx_gig_tenant_discovered (tenant_id=?)`.

### The default is what makes step 1 safe

The `tenant_id` columns migration 0021 adds are nullable, as staged above, and
they also carry a **default: the one tenant this database has ever had**. That
is what makes the column additive rather than merely tolerated. A write from
the old Worker — which names no such column — lands in the right place instead
of as a NULL nobody scoped, so every route not yet taught to pass a tenant
keeps filing correctly, and SQLite backfills the existing rows as it adds the
column rather than needing a separate `UPDATE` that could half-apply.

That default is also the thing to remove, and the scoping step removes it. Past
the point where scoping ships, a write that did not say who it belongs to is a
bug, and a default is precisely what would stop it looking like one — the "a
gig lands in the wrong tenant and nothing breaks visibly" failure this plan
already warns about, wearing a different hat.

The four auth tables get the same treatment for `user_id`, defaulting to the
bootstrap owner — except `auth_challenges`, which is one round trip long and
belongs to a ceremony rather than to a person.

### Four uniqueness constraints move with the code that names them

Four of the fourteen are unique on a value that is not distinctive between
artists: `gig_correspondents` on `(kind, value)`, and two artists can
correspond with the same festival address; `google_grants` on `purpose`, and
both can hold a `gmail.compose` grant; `notification_marks` on `dedupe_key`,
and both can raise the identical condition; `notification_events` on the same
kind of key. Each has to grow a leading `tenant_id`, and two of them need the
table rebuilt to do it, since SQLite cannot alter a primary key in place.

The first draft of 0021 did all of that in step 1. It was wrong, and the reason
generalises past this migration: **a uniqueness constraint is part of an
interface, not just a storage detail.** Live code names two of these in an
upsert target — `onConflictDoUpdate({ target: notificationMarks.dedupeKey })`
and `target: googleGrants.purpose` — and SQLite requires an `ON CONFLICT`
target to match a unique constraint exactly. Widening the key does not make
those statements return something stale; it makes them *error*, under the old
Worker, for the whole gap and for as long as a rollback leaves it running.

The obvious prop is to keep the narrow unique index alongside the wider key.
That works, and it is also what makes the change pointless: the narrow index is
exactly what forbids a second tenant. So the constraint and the upsert that
names it move together, in the scoping deploy. Step 1 adds only the column they
will be widened onto.

That is a different judgement from the one made about 0018's indexes two
sections up, and the difference is the point: an ordering index is invisible to
every statement, so a twin costs nothing and buys a safe window. A uniqueness
constraint is visible to the statements that name it, so a twin buys nothing
and hides the change it was supposed to stage.

### Where scoping actually lives

Not in each route. The same argument as the auth middleware: a router added
next month is scoped by doing nothing, or it is a hole.

The session already resolves to a user in one place. It resolves to a
`tenant_id` in that same place, and the domain read helpers take it as an
argument rather than reading it from a context — the way `buildReviewQueue`
takes `today` instead of reading the clock, and for the identical reason: a
function that fetches its own scope is a function that can fetch the wrong one
silently.

The bearer path needs the same treatment. `API_TOKEN` is currently a platform
credential with no tenant attached, which is fine while there is one tenant and
wrong the moment there are two — the research agents POST gigs and those gigs
belong to somebody. Agent tokens become per-tenant rows rather than one
environment variable. That is a change to `.github/workflows/agents.yml` and
`scripts/agents/api.ts` as well, and it is the step most likely to be
forgotten, because nothing breaks visibly when a gig lands in the wrong
tenant — it just appears on a stranger's Overview.

### What step 2 actually did, and the four things it taught

**Done.** `src/db/scope.ts` holds the mechanism, `src/lib/actor.ts` resolves a
request to an actor, and `src/context.ts` is the one place a route reads a
scope off a request. `TenantId` is branded with a single constructor, so the
"admin mode resolves to null and does not compile" guarantee above is a type
rather than a convention.

**A missing filter is a source-level test.** `test/tenantScope.test.ts` reads
the tree and fails when one of the fourteen is queried without `scoped` or
`withTenant`. It has to be source-level rather than behavioural, because with
one artist an unscoped query returns exactly the right rows and every
behavioural test passes — it starts being wrong on the day nobody is looking.
Exemptions are a list with a written reason each; there is one.

**Two shapes hid the missing scope, and both are gone.** A `.where()` that
was skipped entirely when no filters applied — the
`conditions.length > 0 ? … : …` in both list routes — is now one branch with
the tenant unconditional. And an
`inArray(id, ids)` where the ids came from the browser: the tenant filter
beside it is not belt-and-braces, it is the only check there is.

**A uniqueness constraint is part of an interface.** Four of them had to grow a
leading `tenant_id`, and the reason 0021 could not do it is that live code
named two in an upsert target: SQLite requires `ON CONFLICT` to match a unique
constraint exactly, so widening the key *errors* the old statements rather than
staling them. Migration 0022 widens them only because the statements no longer
name a constraint — `storeGrant` is a delete-then-insert, and the two mark
writers are an update followed by a conflict-to-nothing insert. Both work
against the schema on either side of the gap.

**The cron has no request to read a scope from**, which forced a decision the
plan had not made. Housekeeping is per tenant, because which marks are dead is
derived from that artist's feed; event retention runs once. The digest and the
reply scan run for the **owner's tenant only**, because their inputs are
platform configuration and not the tenant's — the schedule and recipient are
in `app_settings`, the mailbox is one `GMAIL_REFRESH_TOKEN`. Looping those
over every tenant would mail the owner N times and scan his mailbox on
somebody else's behalf.

That is a real gap rather than a decision: **an invited artist gets no digest
and no reply scan.** Both need per-artist configuration — a digest schedule and
recipient that are not platform state, and a mailbox grant per tenant like
`google_grants` already is for drafting. It belongs before invites (step 4)
ship, and it is not in this step.

### Agent tokens: the table exists and the secret still works

`agent_tokens` is per-tenant, hashed, revocable, and issued through
`/api/agent-tokens` behind a passkey touch — minting a credential that can
write to your account is squarely the "changes who can get in" rule. An agent
is refused those routes: a credential that can issue its own successor makes
revoking one a race rather than an ending.

`API_TOKEN` is **not** withdrawn. `actorForBearer` still accepts it and
resolves it to the owner's tenant, which is the same "read both spellings" move
`normaliseGigStatus` makes for the agents' status vocabulary. Withdrawing it in
the deploy that introduced the table would have 401'd every agent until three
GitHub secrets were rotated — a coordination with no upside while there is one
tenant. It goes when `.github/workflows/agents.yml` and `scripts/agents/api.ts`
hold a row instead, and that is the step most likely to be forgotten for
exactly the reason above: nothing breaks visibly when a gig lands in the wrong
tenant.

There is no Settings screen for these yet. The routes work without one, and the
screen is step 3's.

## Usage: a daily rollup, not a meter

What the owner needs to see is "is this artist costing me anything unusual",
answered once a day. What a per-request meter gives is that same answer, plus
a write on every request.

The bell poll is the precedent: it was reduced to five minutes because a full
`composeFeed` every minute spent ~74,000 D1 row reads a day watching a badge
that rarely moved. Metering every request has the same shape — a write per
request to answer a question nobody asks per request.

So `usage_daily` is one row per tenant per day, written by the existing 3am
housekeeping tick: rows in each domain table, API requests (from a counter,
not a log), agent runs, Gmail drafts created, Workers AI calls. Cheap, bounded,
and it prunes at 90 days like `notification_events` prunes at 30.

Tenure — the other thing asked for — is `users.created_at` and needs no
mechanism at all.

## Invites

A row in `invites`: a token, the address it was issued to, who issued it, when
it expires, and when it was redeemed. The URL is
`/join/<token>` and the token is random, long, and stored **hashed** —
an invite is a credential that grants an account, and a leaked backup should
not be a set of working invitations.

Rules, each with a reason:

- **Thirty days**, as asked. Expiry is checked against a `now` handed in, not
  read, like everything else here.
- **Single use.** Redemption writes `redeemed_at` and a second attempt on the
  same token fails whether or not it has expired.
- **Revocable before redemption**, because an invite sent to the wrong address
  needs an answer better than waiting a month.
- **The invited address is fixed at issue time.** This is the point where the
  earlier confusion about the emailed code gets settled properly: at *signup*
  there is nothing on file, so the address has to come from somewhere trusted,
  and an invite is exactly that — the owner typed it. The person redeeming does
  not choose it. At *recovery*, later, the address is the one already on file
  and is never user-chosen. Two different questions that look alike.
- **Redemption creates the tenant and enrols the first passkey in one flow.**
  An account that exists but has no credential is a thing to reason about, and
  there is no reason to have one.

### What step 4 actually did

**Done, and it needed no migration** — `invites` has been sitting in the schema
since 0021, which is what step 1 being done properly buys. `shared/invites.ts`
holds the rules against a `now` it is handed, `src/lib/invites.ts` is the
storage and the one flow that creates an account, `/api/admin/invites` issues,
lists and withdraws, and `/api/auth/join/*` redeems.

**The URL is `#join/<token>`, in the fragment.** The plan wrote `/join/<token>`
and a path is the wrong place: a fragment is never sent to the server, never
lands in an access log and never appears in a `Referer` header, which is
exactly what a credential in a URL needs. The client reads it and POSTs it in a
body — all three join requests take it that way, and
`test/invites.test.ts` fails if one starts putting it in a path.

**The link is shown once and handed over, not emailed.** Same bargain as an
agent token, for the same reason: the column holds a hash, so nothing can print
it again, and losing it costs a withdrawal and a reissue. Emailing it is
blocked on the domain onboarding below, and the screen says so rather than
offering a button that would throw.

**Redemption is spent last.** The invitation is marked used only after the
credential verifies — so a cancelled prompt or a failed ceremony leaves the
link working, which is what somebody whose browser gave up needs and costs
nothing, because it is still single use once it lands. The tenant, the account
and the first passkey are written in that one flow.

**A passkey handle is per account now.** It was one fixed string, which was
right for one user and becomes a bug with two: an authenticator replaces a
credential sharing a handle, so two people enrolling on one device would
replace each other. The owner keeps the original string — their authenticators
already hold credentials under it and switching would leave a duplicate
keychain entry for nothing — and everybody else is keyed by their account id.

**The redemption notification is an event in the owner's feed**, titled with
the artist's name, exactly as planned. Recorded after the session is issued, so
a failure to notify cannot cost somebody their signup.

**Outstanding, and both wait on the same thing:** Scout cannot mail an
invitation, and an invited artist has no recovery path — the emailed setup code
goes to the configured address and enrols the *owner's* account, which is safe
(only the owner can read that inbox) but is not recovery for anybody else. Both
need the section below.

### Mail to an invited artist needs the allowlist gone first

A prerequisite that is easy to miss because nothing about it is visible while
there is one user. The `send_email` binding sends through an explicit
`allowed_destination_addresses` list in `wrangler.toml` — two entries, both the
owner's. That is a genuine security property today rather than a limitation:
the Worker cannot mail anywhere else even if the code is wrong, which no
key-based sender can promise.

It stops working the moment somebody else needs mail. An invited artist's
address is not on the list, and adding each one by hand is a deploy per signup.

**The gate is a domain, not a plan.** Sending to a verified destination is free
on every plan and never touches the quota; sending to an arbitrary recipient
needs the sending domain onboarded to Email Service, after which any recipient
works immediately. This account is already on Workers Paid, so there is nothing
to buy — the whole prerequisite is onboarding `sundogsmusic.ca`, which is also
what would move the sender off `dougmcarthur.net`.

So that onboarding is a prerequisite of step 4, not of anything before it —
and the day it lands, the binding stops being the boundary. Whatever replaces
it has to refuse to mail an address that is not on an invite or an account,
because "send a code to this address" pointed at an arbitrary inbox is the
account-takeover vector the recovery rule exists to prevent.

### The notification is the bell that already exists

Redemption writes a `notification_events` row, which the owner's feed shows
like any other. Not email, and not a new channel.

It is an **event**, not a condition, by the rule this app already runs on:
conditions are derived from current state and self-heal, events are rows
because they are not recoverable from state. "Someone joined on Tuesday" is
not visible in Wednesday's state — a user row says they exist, not that they
just arrived — so it is a row, and it prunes at thirty days with the rest.

The title says the artist's name. Not their email, not their tenant id: same
rule that took `gig-festival-scan` off the screen.

## Order of work

1. `users`, `tenants`, `invites`, `usage_daily`; `tenant_id` added nullable,
   defaulted and thereby backfilled; `user_id` on the credential tables;
   composite twins for 0018's indexes. **Done — migration 0021.** No code
   reads any of it yet.
2. Session resolves a tenant; domain reads and writes take it as an argument;
   agent tokens become per-tenant. **Done — migration 0022 plus the scoping
   deploy.** It widened the four uniqueness constraints alongside the upserts
   that name them and dropped the single-column index twins; the column
   defaults stay until step 5, because dropping them here would leave the
   pre-scoping Worker writing NULLs across the migrate-then-deploy gap.
   Outstanding from this step: per-artist digest and mailbox configuration,
   and retiring `API_TOKEN` once the agents hold rows.
3. Admin mode, reusing the elevation already built, then the `/admin` routes
   and screen. **Done — migration 0023 plus the oversight deploy.** The
   guarantee turned out to be a type rather than a rule; see below. Outstanding
   from this step: three of `usage_daily`'s seven counters have no writer, and
   the invite list on the screen waits on step 4.
4. Invite issue / redeem, with the redemption event. **Done — no migration
   needed, since `invites` arrived with 0021.** Outstanding: mailing the
   invitation, and per-artist recovery, both gated on onboarding
   `sundogsmusic.ca` to Email Service.
5. `tenant_id` to `NOT NULL` on the fourteen domain tables — and on `users`
   too, since every account owns a tenant now, including the owner's.

Steps 1 and 2 are the whole risk. Steps 3 and 4 are the part that was asked
for, and they are small — which is the thing worth knowing before starting,
because the visible work is not where the time goes.
