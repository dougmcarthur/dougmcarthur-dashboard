# Phase 3 — apply & track

Step D of the build order in [gig-pipeline-plan.md](./gig-pipeline-plan.md).
`preparing` had been a status since migration 0008 with nothing behind it, so
"I said I'd apply" and "the application is half-written" were the same row
wearing different words. This is what makes the second one real.

## What it is

Three things, all of them derived rather than stored:

- **The form's questions, with an answer staged against each.** The parser in
  `src/lib/formParser.ts` reads the application form; `classifyQuestion` says
  which canonical question each field is; the artist database says what you
  answer it with. Output is a copy-paste block per field.
- **A materials checklist.** Every file the form wants, matched against what is
  on file — with the photo credit and the review date that decide whether what
  is on file is usable.
- **A draft email**, for the opportunities that take applications by mail.

## The rule everything else follows from

**It drafts; it never submits.** Nothing in this phase POSTs to an organiser's
form — an application filed by automation is a good way to be blacklisted, and
the one thing worse than a blank box is a robot filling it in wrong under your
name. The buttons are *Copy* and *This one is right*; there is no *Send*, and
`test/uiConsistency.test.ts` fails if one appears.

## A suggestion is not an answer

`answer_state` is a separate column from `answer` for the same reason
`unreviewed` is a separate state from `overdue` in the artist database: "the app
proposed this" and "you read it and said yes" are different claims.

| State | Means |
|---|---|
| `empty` | Nothing staged. |
| `suggested` | The app picked it from the artist database. **Nobody has read it.** |
| `edited` | You typed it. The link to the source asset is dropped. |
| `approved` | You read the suggestion and it is right for this application. |

The readiness line therefore reports two numbers — *answered* and *read* — and
`sendable` requires the second. An application of twelve unread suggestions
looks complete under any single count, and it is the exact failure this phase
would otherwise introduce: pre-fill that nobody checks is worse than a blank
form, because a blank form is honest about being blank.

Re-reading a form never overwrites an answer you edited or approved. Only
`empty` and `suggested` rows are re-staged, since the artist database may have
gained a better answer since. Fields that vanish from the form are dropped only
when nothing is staged against them.

## An over-long answer is worse than an empty one

A form with a 150-character limit truncates on paste, silently, mid-word. So an
answer past `maxLength` is the one field problem rated `danger` with nothing
else wrong: an empty box at least looks unfinished, where a truncated bio looks
like something you wrote.

`pickForLength` already prefers the longest variant that fits, so this mostly
catches hand-edits — which is precisely when it matters.

## A login wall is a fact, not an error

`prep_status` distinguishes three ways of not having the form, and they want
three different responses:

- `blocked` — Submittable, Sonicbids, a Typeform drawn by JavaScript. The form
  was found, and it is behind an account or drawn by script. Nothing is broken.
  This one is filled in by hand, and the materials checklist still applies.
  Retrying is pointless.
- `failed` — a timeout, a DNS failure, a 403. Worth trying again, and the HTTP
  status is kept rather than smoothed away, because 403 and 404 are different
  stories.
- `not_found` — the page was reached and has no application on it. That is what
  a window that has not opened looks like, so it is the one to come back to.
  This used to be stored as `blocked`, which told the artist nothing would
  happen about a form that was simply not up yet. Rows stored that way still
  read correctly (`prepStateOf` maps `blocked` with the no-form note forward),
  and the next read of the form replaces them.

The reason is shown verbatim. `LOGIN_GATED_HOSTS` in the parser is what makes
most of the first kind answerable without a request at all.

## Going back to a form that was not there the first time

A research agent files a festival when it finds it, often before the window
opens. Canmore's row said "submissions not open as of July 2026 — check back in
September", the form went up in the autumn, and nothing went back: the only
thing that ever read a form was the button.

`shared/formRevisit.ts` says when to look again, and `src/lib/formRevisit.ts`
does it on the daily housekeeping tick, per tenant, ahead of the reminder
reconcile:

- **Only gigs you said yes to** — In progress. An agent files far more than
  anyone decides on, and staging answers against all of it would fill the
  database with drafts for things nobody chose.
- **The trigger is `opens_at`.** Not looked at before it, then every day for
  fourteen days, then weekly. **With no date it is weekly, not never** — agents
  file `opens_at` only when a page states a day, and "check back in September"
  is a month, so most gigs have nothing to trigger on.
- Stops at the deadline. Leaves alone a form already read, and a `blocked` one,
  since looking again at a login wall changes nothing. A `failed` read is tried
  again the next day whatever the window is doing.
- It reaches the form the way you would: from the address already on the gig,
  one Apply link away (`readApplicationForm`). It cannot web-search for a form
  the page does not link to, and says so rather than guessing.
- **It never moves a status and never touches `updated_at`.** You said yes; you
  did not start. A gig changing stage because a form went live overnight is
  Scout deciding something that is yours, and `updated_at` moving would wake
  every snooze in the table. Only the button — `requested` in
  `prepareApplication` — may start an application.
- **A few a night, one at a time, oldest look first.** These are small
  festival websites.

It says what it found, because "went back" is only a promise you can rely on if
you can see it happen. The bell gets one line when a form is found and read
(linking to that gig's panel — `#gigs/<id>` opens the row), one when a form is
found but has to be filled in by hand, and — only for a window with a date — one
when a week has passed and there is still nothing. Silence is right for the
rest: no news from an undated window is the expected answer.

**Why the Worker and not a research routine.** A routine could search the web
for a form the listing does not link to. It would cost plan allowance, need an
agent token that can write an address into a gig (the token reaches seven
routes, none of which does), and leave nothing behind when a run crashes. The
cron is free, cannot be skipped, and does the common case. The agents' part is
to file `opensAt` when a page states a day and to point `url` at the page the
Apply link is on; their prompt says so.

**Not covered:** a form that opens somewhere the listing does not link to, and a
`ready` read that was really a newsletter box from before the reader learned
the difference. Press the button on those.

## Answers written for another event

`shared/questionKinds.ts` marks each kind `verbatim` or `adapt`. A `verbatim`
answer — your Spotify link, your set length — is the same on every application.
An `adapt` one — *why this event*, *what sets you apart* — names the festival it
was written for, and pasting it into the next application is how a folk festival
gets told why you love a sync agency's roster. Those are flagged while they are
still suggestions and stop being flagged the moment you rewrite them.

The submission email takes the same line: it assembles the paragraphs that are
facts and leaves `[why this one]` in the body verbatim, listed as a gap. A draft
that reads as finished is the one that gets sent unfinished.

## Where `preparing` gets written

Reading the form on a `shortlisted` gig moves it to `preparing` **when you press
the button**, because staging answers *is* starting the application, and that is
the entire meaning of the state. Only from `shortlisted`, and only when the read
produced fields — a form nobody could open has not been started, and a submitted
application does not go backwards because you re-read the form to check what you
sent. The nightly revisit (below) stages answers too, and does not move the
status: you did not start it.

## Opening a Google Form pre-filled

Copy per field is still the way in everywhere, and on a Google Form there is
also a link that opens it with every answer you have read already typed in
(`shared/formPrefill.ts`). Suggestions stay out, choices must be ones the form
offers, over-long answers stay out, and whatever is left out is named with a
reason. It opens the form and stops; the form's own button is still yours to
press. The answers travel in the address, and the panel says so.

## What this left open, and where it went

- **Sourcing the artist database.** Built: `shared/artistSource.ts` fills
  `artist_assets` from the reference docs in D1, behind a preview. Drive and
  the website are still unread, and press photos are entered by hand — so an
  answer that is on neither is still reported as "Nothing on file answers this
  yet".
- **Phase 4's inbound classification** (step E). Built — see
  [reply-matching-plan.md](./reply-matching-plan.md). It proposes a reading of
  the organiser's reply; moving the row off `submitted` is still yours.
