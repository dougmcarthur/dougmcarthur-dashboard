# First run: from sign-up to a first week of Scout

Written 2026-10-05, after watching a new account go through the welcome
questions and land on an empty Artist library.

## What is wrong, in order of how much it costs

1. **The last screen listed two tasks and linked one.** Connect Google and
   Build your artist profile were plain boxes; only the first got a button, set
   apart underneath. *Fixed — Phase 0.*
2. **The first thing a new artist is sent to is an empty room.** "Build your
   artist profile" links to `#artist`, which opens the Library tab and says
   *Nothing here yet.* Everything that could fill it — the Manitoba Music read,
   the document panel, the Drive folder — is a collapsed row further down, and
   none of it is offered by name.
3. **Nothing says Scout does the finding.** The welcome screen says Scout
   "gathers" opportunities and the checklist's first suggestion is *Add a gig
   or grant you already know about* (`nextSteps`). A new artist reads that as
   a data-entry tool, and an Overview with nothing in it confirms it.
4. **The questions never ask where you are or what you play.** `GOALS`/`REACH`
   are stored; location and genre are not asked anywhere. "My province" is an
   answer to a question about a province nobody has named. Without those two,
   nothing can be matched to anyone.
5. **A new account has no opportunities, and nothing says when it will.**
   Research is the owner's three routines, filing into the owner's tenant. A
   second artist's account receives nothing from them — no row, no
   notification — and the app says nothing about it. The shared catalog
   (`opportunities`, migration 0033) is the only thing that crosses accounts,
   and the landing page already reads it.
6. **The weekly digest does not go to artists, and the Settings card pretends
   it does.** `runDigest` runs for the owner's tenant only, `digest` routes
   `PATCH`/`send` are owner-only, and the mailer refuses an artist's address
   for that audience. `DigestSettingsCard` has no owner check, so an invited
   artist sees a working-looking switch whose request returns 403.
   `CLAUDE.md` says per-artist digests "are not pretended to exist"; the card
   pretends. *A one-line fix in Phase 0b; the real feature is Phase 4.*
7. **The bell is never introduced.** It is empty for a new account and nothing
   says what will appear there.

## Rules this plan holds itself to

These are the repo's own, and each one rules something out.

- **Never promise what will not happen.** The welcome screens may say research
  runs Mondays only if it does, and only for what actually reaches this artist.
  The schedule shown is declared in code, checked against the doc that
  describes it, and shown beside the *measured* last result — so a stopped
  routine reads as "behind", not as "Monday 7am".
- **Say what could not be matched.** The starter list is a preview with a
  skipped list and a reason each, like the Gmail drafts and the library
  imports. "We found 9 for you" without "and 14 we couldn't place" is a worse
  answer than not finding them.
- **A missing input is never a guess.** A catalog entry with no region is not a
  match for your province; it is reported as "couldn't tell where this is".
  No genre tagged is "open to any genre" only when the listing says so.
- **Everything imported lands never reviewed.** The website read follows the
  Manitoba Music rule: preview, then write; contact details are never copied.
- **Derived, not stored.** Which steps are done, which gaps remain and what the
  first week looks like are all read off the account. The only new stored
  facts are what the artist *told* us: where they are and what they play.
- **No model spend for new accounts.** Everything below is deterministic code
  in the Worker. See *Decisions*.

## The flow

One full-screen sequence in the existing shell (`flow/QuestionFlow.tsx`: Enter,
letters, ↑/↓, Esc), still saving each answer as the screen is left. Esc still
keeps what was said, but **Finish later now leaves a resume card on the
Overview**, not a hidden checklist.

| # | Screen | What it does |
|---|---|---|
| 1 | **Welcome** | Says the one thing the app is: *Scout finds opportunities and drafts your applications; you decide.* Names the four things coming — your profile, your first matches, when research runs, how you'll hear. "You will not be typing gigs in." |
| 2 | Name | as now |
| 3 | **Where you're based** | Country; Canadian province/territory or US state; city optional. The province also chooses which association to ask about on screen 7. |
| 4 | **What you play** | Up to three from a closed list, plus free text that is kept but never used to match (and says so). |
| 5–7 | Goals · reach · anything else | as now. "My province" now means something. |
| 8 | **Feed Scout** | The sources screen, below. This is where the profile gets built, now rather than later. |
| 9 | **Your first matches** | A previewed list of open opportunities from the shared catalog that fit, with why and what is unknown. One button adds them to the Overview. |
| 10 | **When things happen** | The first-week timeline, built from the real schedule. |
| 11 | **How you'll hear** | The bell, with your own real first events in it, and the digest example. |
| 12 | Done | Names what is left as **links** (Phase 0), and lands on the Overview with matches in the deck — never on the empty Library. |

Ten screens is too many to read and fine to *skim* when each is one decision
or one sentence. Screens 10 and 11 are skippable by Esc and are always
reachable again from Help and from the Overview's first-week card.

### Screen 8: feeding Scout

One screen, four optional sources, each with **Check it** before anything is
written:

1. **Your website.** Paste the address. Preview shows the name, the first
   lines of what it reads as a bio, the links found (streaming, video, social,
   booking page) and photos. New reader — see Phase 1.
2. **Your music association profile.** The label names *your* association —
   "Manitoba Music profile" for MB, "SaskMusic" for SK — from
   `ASSOCIATIONS[].region`, and says plainly where the site has no public
   profiles (Music BC behind a login, MusicNL and Music Yukon drawn in the
   browser). Preview is the existing *Is this you?* (`POST …/associations/check`);
   saving is the existing `PUT`; importing is the existing library preview.
3. **A Google Drive folder with your EPK.** Needs Google connected, and Google's
   consent leaves the app, so it comes **last** and returns to
   `#overview?onboarding=sources`. Honest limit, stated on the screen: Scout
   reaches only the folder it makes and files you pick (`drive.file`), and
   today it reads text documents, not photos, video or manufacturer pages.
4. **Anything else** — a Linktree, Bandcamp or press page — goes through the
   same website reader, because that is what they are.

Below the four: a line that says what is *not* needed — "You can skip all of
these. Everything can be added later from the Artist page."

Then a **Reading** step shows each source's result as it lands — tick, count,
"added 14 to your library, none reviewed yet" — and what each could not file.
That is the moment the artist sees the library fill without having typed in it.

## Phases

Each is its own merge. Migrations are additive, in the order `CLAUDE.md`
already requires: the old Worker must read the new schema.

### Phase 0 — the dead end (done) and the dead switch

- **0a, done.** The last screen lists every remaining task as its own link
  (`OnboardingFlow.tsx`, `buttonClass` in `ui/Button.tsx`). Tests:
  `test/onboarding.test.ts`, "links every task it lists on the last screen",
  and "a required step the questions do not ask has somewhere to go".
- **0b.** Hide `DigestSettingsCard` for non-owners (`useSession().role`), the
  way `AdminModeCard` already is. Until Phase 4 an artist has no digest and the
  screen should not offer one. A source-level test in
  `test/uiConsistency.test.ts` pins it, as that file does for the other
  owner-only cards.

### Phase 1 — sources first (no migration)

- `shared/onboarding.ts`: add `profile` facts (country, region, city, genres)
  and a `GENRES` list, stored as one `tenant_settings` row
  (`onboarding.profile`), the way goals are. `parseProfile` drops unknown ids
  like `parseGoals`. Steps become: name, where, what you play, goals, **sources**
  (done when any source is connected or the library has entries), Google.
  The existing `profile` step now opens the flow at screen 8, not `#artist`.
- `OnboardingFlow`: screens 3, 4, 8 and the reading step; welcome copy; and a
  `?onboarding=sources` return path so the Google round trip lands back on it.
  Autostart changes from "never answered goals" to "required steps unfinished",
  once per tab, and the checklist offers *Continue setup* at the screen it
  stopped on.
- **Website reader** — `shared/artistSite.ts` (pure parsing, fixtures) and a
  route beside `routes/manitobaMusic.ts`. Reads the address given plus a small
  fixed set of paths on the same host (`/about`, `/bio`, `/press`, `/epk`,
  `/music`). Pulls `og:`/`<title>`/meta description, JSON-LD
  `MusicGroup`/`Person`, links to known streaming and social hosts, and
  `<img>` candidates. **Deterministic — no model.** It is untrusted input
  fetched from an address a stranger typed, so: http(s) only, public hostnames
  only (no IP literals, no `localhost`/`.internal`), same-host redirects,
  a size and time cap, a per-tenant rate limit, and nothing from a page ever
  becomes an instruction. Contact details (emails, phones) are never copied —
  the rule the Manitoba import already keeps. Everything lands never reviewed,
  proposals dropped when their source or value is already on file.
- Empty states stop saying "Nothing here yet": the Artist library's, and the
  Overview's for an account with no sources, name the sources screen.
- `nextSteps` stops suggesting *Add a gig you already know about* first. It is
  still offered, last, as "Already applied somewhere?".

Tests: reader fixtures from real pages (a Bandcamp page, a Squarespace site, a
bare one-pager, a page that blocks bots); `test/artistSite.test.ts` fails if the
reader accepts a private host or copies an `@`; onboarding tests for the new
step order and the return path; `uiConsistency` for the new screens.

### Phase 2 — the first matches (migration 0036)

- **Migration 0036**, additive and nullable: `opportunities.region` (two-letter
  code, `CA`/`US` for national, null unknown), `opportunities.genres` (JSON of
  closed ids, null = no claim), `gig_opportunities.origin` (`'catalog'` or
  null). A backfill derives `region` from `location` prose with a closed
  province vocabulary (`shared/gigCost.ts` already recognises Manitoba) and
  leaves anything it cannot read null.
- `shared/catalogMatch.ts`, pure, no clock: `matchCatalog({ entries, profile,
  goals, reach, have, today })` returns **matches** (each with `reasons` and
  `unknowns`) and **skipped** (each with a reason: closed, wrong country, no
  region on file, already yours, category not in your goals). Goals map to
  categories (gigs → festival + showcase; grants → funding; sync → sync).
  Reach maps to country and region. Ordered like `publicSample` — categories in
  turn, then soonest to close — and **no blended score**, for the reason
  `gigCost.ts` gives.
- `GET /api/onboarding/starter` previews; `POST` re-plans server-side (a stale
  screen must not add what changed) and writes `gig_opportunities` rows in the
  **New** stage via `withTenant`, linked by `opportunity_id`, `origin='catalog'`,
  skipping any the tenant already has. Cap on the first set (about twelve).
  Sync organisations are listed on the preview but not written: they are
  `sync_targets` and mean nothing without a pitch, which only the owner's
  routine drafts. Said on the screen, not hidden.
- **Ongoing, same matcher:** on the daily tick, per tenant that has a profile,
  entries first seen since that tenant's `matching.lastAt` — a handful a day at
  most, one bell **event** each run ("3 new matches for you", because a run
  finishing is not recoverable from state). A switch on Settings turns
  suggestions off.
- **Agents:** `gig-festival-scan.md` and the create tool gain optional `region`
  and `genres` so new catalog rows carry them. Existing rows stay null; the
  screen says "open to any genre" only where a listing said so.
- **First, measure.** Before building the screen, count open public catalog
  entries by category and place on production. Admin mode's *Public listings*
  lists every entry newest first but does not count them; adding a count by
  category and country to that panel is the first small change of this phase,
  since I cannot reach production from a session. The number decides whether
  the screen is a good first impression or an embarrassment — see *What the
  catalog is*.

Tests: `test/catalogMatch.test.ts` with planted entries and a fixed `TODAY`
(closed, wrong region, null region, already-owned, each goal), run under
`TZ=Pacific/Auckland`; `test/tenantScope.test.ts` already fails if the write
skips `withTenant`; a route test that the preview and the write agree.

### Phase 3 — when things happen, and where you'll hear

- `shared/researchSchedule.ts`: the declared schedule — which routine, which
  weekday and hour, which zone, **and what it produces for this artist**.
  `gig-festival-scan` (Mondays 07:00 Winnipeg) feeds festivals, showcases and
  funding; `sync-pitch-research` (Wednesdays) feeds sync organisations.
  `monthly-promo-checkin` and `document-reader` write only into the owner's
  account and are **not shown** — promising an artist a monthly promo plan they
  will not receive is the exact screen that loses trust on day three.
  `test/researchSchedule.test.ts` parses the table in
  `docs/agent-routines.md` and fails if the two disagree; a routine edited in
  claude.ai without touching the repo is the one drift it cannot catch, which
  is why the measured half exists.
- `shared/firstWeek.ts`, pure: given `now`, the zone and the schedule, returns
  the timeline in the artist's own time — *Today: your sources are read.
  Tonight, 3:00: profile re-read. Monday 7:00 Winnipeg (your Monday 6:00):
  research runs. Tuesday morning: matches from it reach you.* Each line says
  what lands and where. The "matches reach you" time is the next housekeeping
  tick after the run, not the run itself.
- **Measured beside declared.** `GET /api/onboarding/research` returns the
  declared next runs and `max(first_seen_at)` from the catalog — a tenant-free
  fact — so the screen can say "last new opportunity: Thursday" and, past the
  `taskCadence` multiple, "research is behind; the next run is still Monday".
- **The tray, with real contents.** Extract the bell panel's row rendering from
  `NotificationBell` so the onboarding renders the *same* rows. Showing it
  already holds this account's own first events — "Read your Manitoba Music
  profile: 14 items", "12 matches added" — because Phases 1–2 record them. Below
  them, clearly captioned *Examples of what appears here later*: a deadline
  closing, a reply to read, a connection that dropped. Three plain lines on
  what to check it for: **things that need you** (replies, deadlines),
  **things that arrived** (research results), **things that broke**.
- The Overview's `OnboardingCard` becomes a **first-week card** until the
  required steps are done and three days have passed: the timeline, what is
  left, and the profile gaps from Phase 5. New accounts' empty Overview, Review
  and Gigs pages say "Scout is looking — next run Monday 7:00" instead of
  "All clear".

### Phase 4 — a digest artists actually receive

This is the large piece, and it is a prerequisite for showing the example
honestly. The screen must not preview an email that will not arrive.

- Per-tenant digest settings in `tenant_settings` (`digest.enabled`, day, hour,
  zone). **Off until the artist switches it on** on the *How you'll hear*
  screen, which is the ask — the repo's rule that a deploy never starts mailing
  by itself, applied to accounts. The zone defaults to the browser's.
- **The recipient is never typed.** It is the signed-in account's address
  (`users.email`, fixed by the invitation). A new mailer audience `tenant`
  accepts only addresses of users in the named tenant, and
  `test/recipients.test.ts` grows the case that an artist's address is refused
  for `owner` and the owner's for `tenant` of another account. This is the same
  trade `CLAUDE.md` already names: the boundary is code, and a bug there widens
  it.
- `readDigestSettings` takes a tenant; `isDigestDue` is already pure. The cron
  loops tenants for the digest, one `recordDigest` each — `digest_reports` is
  already per tenant. The owner's platform settings stay the owner's.
- The footer's *manage* link goes to the artist's own settings; its sentence is
  already true ("only when there is something to report").
- **The example on screen 11 is the real renderer on the real queue.** After
  the starter set is added the account has New rows, so
  `GET /api/digest/preview` returns a genuine digest — "this is what yours would
  say right now". If they skipped the starter set the queue is empty and the
  screen says so and shows a clearly labelled sample instead; it never shows a
  sample as if it were theirs.

### Phase 5 — keep feeding it

- `shared/profileGaps.ts`, derived from `assembleEpk`/`assetHealth`: what
  applications will come up blank for — no bio, no press photo with a credit, no
  live video, no links — each with the action that fills it. Shown on the
  first-week card and, after day three, as one `attention` **condition** in the
  bell ("Your bio is missing; 6 of your matches ask for one"). A condition
  because it heals the moment it is filled.
- The Artist page opens on the same sources panel when the library is empty.

## What the catalog is, and what that does to Phase 2

Said plainly because it decides whether Phase 2 is good:

- **It is shaped like one artist.** The routines run against the owner's
  profile — `gig-festival-scan` begins by reading *their* reference documents,
  reads Manitoba Music first, and files into the owner's tenant. The catalog is
  whatever that found. A Manitoba folk artist will see a full list; an Alberta
  hip-hop act will see a thin one, mostly national funding and showcases.
- **It has no genre.** Existing rows are null. Until agents tag it, "fits what
  you play" cannot be a filter and the screen says so rather than pretending.
- **It cannot see eligibility** — resident-only, age-limited, emerging-only.
  The listing link is the answer; the screen says to check it.
- **So the way out of "thin" is the broad, tagged sweep** the shared model
  calls for: all ten associations' `sources` read every run, entries recorded
  with region, genre and eligibility instead of judged against one artist.
  That is step 2 of the build order in [matching-gaps.md](./matching-gaps.md),
  and Phase 2 here should not be built on the catalog as it stands except as a
  first look at what a match list would contain.

## Decisions I need from you

1. **Settled (2026-10-05): research is shared and matched per artist.** Broad
   research fills one catalog; each account's stated and inferred criteria
   narrow it; weights order what is left. That makes Phase 2 depend on work the
   code does not do yet — see [matching-gaps.md](./matching-gaps.md), gaps 1–5
   in particular: today the research is filtered to your profile before it is
   written down, so the catalog is what fit you, not what exists.
2. **Digest default.** Off in storage, with one clear switch on the screen that
   asks, is what I would do. If you want it on by default for new accounts,
   that is a CASL question worth a minute's thought, not a toggle.
3. **Whether to show the empty-account Overview as "Scout is looking" before
   Phase 2 lands.** It is honest only if matches really arrive; I would hold it
   for Phase 3.

## Not in this plan

- Per-artist research routines or any model call for a new account. Research
  is shared by decision; what is per artist is the match and the weighing.
- The scoring itself, and the catalog rebuild that matching stands on: both are
  in [matching-gaps.md](./matching-gaps.md), with the order to build them in.
- Reading photos, video or manufacturer pages (the document reader's existing
  limit stands).
- A mailbox grant per artist (reply matching stays the owner's).
- Anything that submits an application. The app drafts; it never sends.

## Order and size

| Phase | Size | Ships alone | Needs |
|---|---|---|---|
| 0a | small | yes — **done** | — |
| 0b | trivial | yes | — |
| 1 | medium | yes | — |
| 2 | medium–large | yes | measuring the catalog first |
| 3 | medium | after 1 and 2 | — |
| 4 | large | yes; screen 11 waits on it | a mailer audience and its tests |
| 5 | small | after 1 | — |

1 is the one that changes how a new account feels, and none of it depends on
what the catalog holds. 2 is the one that depends on facts I do not have yet.
