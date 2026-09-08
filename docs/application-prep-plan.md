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

`prep_status` distinguishes them, and the two want opposite responses:

- `blocked` — Submittable, Sonicbids, a Typeform drawn by JavaScript, or a page
  with no form on it at all. Nothing is broken. This one is filled in by hand,
  and the materials checklist still applies. Retrying is pointless.
- `failed` — a timeout, a DNS failure, a 403. Worth trying again, and the HTTP
  status is kept rather than smoothed away, because 403 and 404 are different
  stories.

The reason is shown verbatim. `LOGIN_GATED_HOSTS` in the parser is what makes
most of these answerable without a request at all.

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

Reading the form on a `shortlisted` gig moves it to `preparing`, because staging
answers *is* starting the application, and that is the entire meaning of the
state. Only from `shortlisted`, and only when the read produced fields — a form
nobody could open has not been started, and a submitted application does not go
backwards because you re-read the form to check what you sent.

## Not built

- **Sourcing the artist database.** Still by hand or by the research agents;
  nothing reads the three reference docs in D1, Drive, or the website. Phase 3
  makes the gap obvious rather than closing it — every "Nothing on file answers
  this yet" is that gap, named.
- **Phase 4's inbound classification** (step E), which is what would move a row
  off `submitted` on its own.
