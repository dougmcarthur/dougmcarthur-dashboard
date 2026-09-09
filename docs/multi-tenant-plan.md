# Accounts, oversight and invites

This is the plan for turning a one-person app into a platform with a small
number of invited artists on it, and an owner who can see that they are there
without being able to read what they are doing.

Nothing here is built yet. It is written first because the order matters: the
oversight screens and the invite UI are the *visible* part and the smallest
part, and neither can exist before the thing they are about — an account that
owns rows — exists underneath them.

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

The indexes from migration 0018 all become composites with `tenant_id`
first, in step 1 — an index that does not lead with the filtered column is one
the planner declines to use, so leaving them alone would turn every scoped read
into the full scan the index was added to prevent.

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

### Mail to an invited artist needs the allowlist gone first

A prerequisite that is easy to miss because nothing about it is visible while
there is one user. The `send_email` binding sends through an explicit
`allowed_destination_addresses` list in `wrangler.toml` — two entries, both the
owner's. That is a genuine security property today rather than a limitation:
the Worker cannot mail anywhere else even if the code is wrong, which no
key-based sender can promise.

It stops working the moment somebody else needs mail. An invited artist's
address is not on the list, and adding each one by hand is a deploy per signup.
Sending to a *verified destination address* is free on any plan; sending to an
arbitrary recipient needs **Workers Paid and an onboarded sending domain**.

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

1. `users`, `tenants`, `invites`, `usage_daily`; `tenant_id` added nullable and
   backfilled; 0018's indexes rebuilt as composites.
2. Session resolves a tenant; domain reads and writes take it as an argument;
   agent tokens become per-tenant.
3. Admin mode, reusing the elevation already built, then the `/admin` routes
   and screen.
4. Invite issue / redeem, with the redemption event.
5. `tenant_id` to `NOT NULL` on the fourteen domain tables — and on `users`
   too, since every account owns a tenant now, including the owner's.

Steps 1 and 2 are the whole risk. Steps 3 and 4 are the part that was asked
for, and they are small — which is the thing worth knowing before starting,
because the visible work is not where the time goes.
