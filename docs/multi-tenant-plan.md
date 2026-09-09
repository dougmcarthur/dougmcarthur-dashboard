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

## The owner is a separate account, not a second hat

Two roles — `owner` and `artist` — and the owner is its **own account**,
holding no tenant.

The first draft of this gave one account both jobs: an artist tenant like
anybody else, plus access to the oversight routes. Separating them is a little
more setup and a much stronger guarantee, for the reason in the next section.
It also splits what a compromised session is worth: the artist login does not
reach oversight, and the oversight login reaches no gigs.

Dogfooding is not lost — the artist account still exists and is still the one
the app gets used from daily. What changes is that the two are logged into
separately.

There is no impersonation, and no "act as this artist" mode. Better Auth's
admin plugin offers one and it is deliberately not being copied: the promise
made to an invited artist is that their gig notes are theirs, and a support
tool that quietly breaks that promise is worse than no support tool.

The role set stays at two. A permissions matrix with two rows is a worse way to
write `if (role === "owner")`, and it invites a third role to be invented
before anybody needs one.

## "No access to personal data" is a type, not a policy

This is the whole reason the accounts are separate.

Every domain read takes a `tenant_id` as a required argument — the way
`buildReviewQueue` takes `today` rather than reading the clock, and for the
same reason: a function that fetches its own scope is a function that can fetch
the wrong one silently. The session resolves to a tenant in one place.

**The owner account resolves to none.** Not a wildcard, not zero, not a
sentinel meaning "all" — null, and the argument is not nullable. So an owner
route that tried to read `gig_opportunities` would not return a stranger's
rows; it would fail to compile. The guarantee stops being something to audit
and becomes something that cannot be expressed.

What oversight actually reads is `users`, `invites` and a `usage_daily`
rollup, and nothing else. Counts the owner needs — how many gigs, how many
drafts — are written into that rollup by the cron, by code running *as the
tenant* that emits a number. The owner reads the number.

**One operation crosses the line, and it is a write.** An artist who leaves
must be able to take their data with them, which means deleting it: a
tenant-scoped `DELETE` across the fourteen tables, naming no columns and
returning no rows. "Never reads a domain table" survives that intact — never
*touches* one was not the promise, and could not be.

**Admin recovery is its own configured address.** The rarely-used passkey is
the one that will be missing when it is needed, so `enrolmentRecipient` grows
from one deployment value to one per account kind. It must not fall back to
the artist account's address: that would make the artist login a path to the
oversight login, which is the thing this separation exists to prevent.

The oversight surface lives under `/admin` — separate routes and screens, one
deployment. Its own Worker and domain would double the deploy, the secrets and
the migration path in order to isolate something the tenant boundary already
isolates.

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
3. The owner account and its `/admin` routes and screen, plus its own
   recovery address.
4. Invite issue / redeem, with the redemption event.
5. `tenant_id` to `NOT NULL` on the fourteen domain tables. On `users` it
   stays nullable, because that null is what the owner account is.

Steps 1 and 2 are the whole risk. Steps 3 and 4 are the part that was asked
for, and they are small — which is the thing worth knowing before starting,
because the visible work is not where the time goes.
