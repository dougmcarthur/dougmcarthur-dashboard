# Overview redesign plan

The Overview page is the first screen of a triage tool, but it is built like a
metrics dashboard — and a mostly empty one. This is the diagnosis, the
principles behind the fix, the proposed structure, and the order to build it.

Every number below was measured against production D1 on 2026-08-23.

A visual mockup of the proposed layout, built from the same real rows, is
published at
<https://claude.ai/code/artifact/2b3355a6-5846-4b59-a1ef-9480540b52a4>.

---

## 1. Diagnosis

Top to bottom, here is what the page currently devotes its space to and what
each part is worth.

| Block | Screen space | Rows it shows today | Actionable? |
| --- | --- | --- | --- |
| Three stat cards (34 / 22 / 9) | ~12% | always 3 | No — inventory totals |
| Follow up | ~8% | **1** | Yes |
| Deadlines in 14 days | 0% | **0** | — never renders |
| Needs review | 0% | **0** | — never renders |
| Recent task runs | ~80% | 15 | No — it is a log |

The page is inverted. **The least actionable content is the largest and most
prominent; the most actionable content is absent entirely.**

Three separate causes, and they need different fixes:

**(a) The two decision sections match zero rows.** `/api/overview` selects
gigs with `status = 'pending_review'`, sync with `draft_ready`, and promo with
`draft`. No production row carries any of those values — see
[`notes-field-audit.md`](notes-field-audit.md) §"Data-integrity findings". The
"Needs review" section is dead code in practice. This is a data bug wearing a
design bug's clothes, and no amount of restyling fixes it.

**(b) A deadline-shaped Overview would be nearly empty even if it worked.**
`deadline` is TEXT and 26 of 34 gigs hold prose in it. Running the Review
screen's `findDate()` over every value:

| | count |
| --- | --- |
| Gigs with any deadline value | 33 |
| …already a clean ISO date | 8 |
| …a date recoverable from prose | 9 |
| …genuinely no date ("rolling", "ongoing", "TBD") | **16** |

And after recovering all 17 real dates: **5 overdue, 1 due within 30 days, 1
within 90, 10 beyond.** So even fully fixed, a "deadlines soon" panel shows
one or two rows. **Deadlines are not where the work is.** Sixteen
opportunities have no deadline at all — they are open right now, permanently,
and nothing in the UI ever surfaces them. They are the ones that quietly rot.

**(c) The task-run log is reference material presented as headline news.**
Fifteen runs × 3–5 lines of agent prose is roughly 80% of the page. It is
genuinely useful for answering "what did the automation do last Tuesday" —
which is a question you ask occasionally, not a thing you need on arrival.

### Where the work actually is

Counting what genuinely awaits a decision, using the note-parsing the Review
screen already does:

| Signal | Count |
| --- | --- |
| Gig notes that say NOT submitted / not filled in | **14** |
| Status/note conflicts (marked done, note says otherwise) | **3** |
| Items with a "waiting on Doug" blocker | **11** |
| Items carrying a ⚠️ / paid-entry flag | **8** |
| Sync targets with a drafted pitch never sent | **4** |
| Gigs open right now with no deadline | **16** |

That is the dashboard. None of it is on the dashboard.

---

## 2. Principles

Research notes, and what each one implies here. Sources at the bottom.

**This is not a metrics dashboard — it is the home of a triage tool.** The core
loop is: automation discovers → Doug decides → Doug acts or is blocked. Linear
models exactly this with Triage: a holding inbox that catches everything
incoming and keeps it out of the backlog until a person decides it belongs
there. Items leave only by an explicit human decision. Our Review screen is
that queue; Overview should be its front door, not a separate report.

**Ask what three questions the page must answer, and what one action follows.**
The standard framing for moving from vanity metrics to actionable ones. Here:

1. What needs a decision from me right now?
2. What is at risk if I do nothing?
3. What did the robots do while I was gone?

…and the one action is *start reviewing*. Anything that serves none of those
three questions does not belong on the page.

**Vanity metrics out.** "34 Gig Opportunities" is inventory, not work. It does
not change on any timescale that matters and it prompts no action. Counts
belong on the page that lists the things — where they already are, in the
list footers.

**Position carries weight.** Users spend ~80% of their time on the left half
and the top of the page. The most decision-dense block goes top-left. Today
that space holds three numbers that never change.

**Cards and rows do different jobs; use both.** NN/g is explicit that
homogeneous items belong in *"a standard vertical list of items … to support
scannability and also comparisons among items"* — which is why the Review
screen's queue rail is a dense list of 34 comparable rows. But the Overview is
not for comparing; it is for deciding four things and leaving. Each of those
four needs a full sentence of context, and a sentence does not survive a table
row — it truncates exactly where the reasoning lives. So the deck gets cards
and the glanceable strips below it stay rows.

**Progressive disclosure.** Cited at reducing cognitive load substantially,
and it is the entire answer to the task-run log: one line per run, prose
behind a disclosure.

**Five to seven blocks, maximum.** Beyond that the page stops being scannable.
The proposal below has five.

**Encode urgency preattentively.** Colour, position and size are processed
before attention engages. Urgency should be a red dot and a position near the
top, not a sentence containing the word "urgent" — especially since the notes
currently hardcode stale relative time ("deadline is TOMORROW, July 16, 2026",
written in a run five weeks ago).

**Make the queue finite and drainable.** Todoist's Today view works because it
ends. A dashboard showing "14 need review" with no way to get to zero is a
guilt machine. Show the top handful, make each dispatchable in one click, and
show a real zero state when it is done.

---

## 3. Proposed structure

Five blocks. Ordered by decision density, not by entity type.

### A+B. The decision deck — the whole top of the page

No counters and no totals. The first thing on screen is a single decision,
with the rest of the stack visible behind it so the depth is legible without
being a list. Order comes from the *same* `buildReviewQueue()` the Review
screen uses — now served by `GET /api/review` — so the two cannot disagree:

```
┌────────────────────────────────────┐
│ GIG ●                  found Jul 2 │
│ Home Routes / Chemin Chez Nous     │
│ Marked submitted, but the note     │
│ says the intake form was never     │
│ filled in — and it still needs     │
│ your phone number and mailing      │
│ address. Did this actually go out? │
│ [It went out] [Not sent] [Details] │
└────────────────────────────────────┘
```

Three parts, in this order: **title**, **one plain sentence naming the actual
decision**, **buttons underneath**. The sentence is the feature — it is what
lets a decision happen without opening anything, and it is why these are cards
rather than table rows: a row truncates to an ellipsis exactly where the
reasoning lives.

Buttons are named for the outcome — "Approve the spend", "Archive", "Send this
one" — never generic OK/Cancel. Acting on a card, or snoozing it, deals the
next one; the deck drains. Header reads "1 of 14 · skip →".

The sentence is generated per item from the parsed note, keyed on the dominant
flag (conflict / paid / overdue / blocked / duplicate). Writing those templates
is the substance of this block, not the card styling.

Zero state: *"Nothing needs a decision. 16 open opportunities are still
waiting whenever you want them."*

### C. Time-critical strip — "On the clock"

Overdue, due-soon, and windows about to open — the honest contents of which is
currently 5 + 1 + a handful. Small by design, because the data says it is
small. Includes the pending reminders that "Follow up" shows today.

**Built.** `TimingStrip`, fed by `summary.timing` from `GET /api/review`.
Three decisions worth recording:

- **Reminders share the list rather than getting their own panel.** "Your
  deadline is in two days" and "did you ever submit this?" are the same
  question at different stages, and two panels meant two places to look.
- **Bands are computed server-side.** `summariseQueue()` decides what is
  overdue, due soon, or opening; the component only styles it. The block this
  replaces did its own date maths in the browser against a different data
  source, which is how it ended up disagreeing with everything else.
- **Recovered dates say so.** A date parsed out of a sentence renders as
  *"about Sep 3 — recovered from the note"*. The alternative is a countdown
  that looks identical to a real one and is a guess.

A window opening shows within 60 days rather than 14. The research runs are
roughly monthly, so at that horizon a window cannot open without having
appeared here on an earlier visit.

### D. Open anytime — the rot detector

One row, the thing no current screen can say:

> **16 opportunities have no deadline** — open right now, nothing forcing the
> issue. 9 have never been actioned. **Review →**

This is where the actual backlog lives.

**Built.** `OpenEndedRow`, fed by `summary.backlog`. "Never actioned" is
`updated_at` falling on the same day as `discovered_at` — compared by day
rather than by string, because `discovered_at` is a bare date while
`updated_at` is sometimes a full timestamp, and an exact match reports every
row as touched. It follows that anything writing to these rows en masse
destroys the signal, which is why `scripts/backfill-deadlines.ts` deliberately
does not touch `updated_at`.

The plan's "9 have never been actioned" came from a production query before
this shipped; the live figure is whatever the row now says.

### E. Automation activity — collapsed

One line per run, five runs, prose behind a disclosure:

```
gig-festival-scan      +5   success   Aug 12   ▸
sync-pitch-research    +3   success   Aug 6    ▸
```

Expanding a row reveals the summary that currently sits inline. "View all →"
goes to the Log page, which is where the long-form belongs. This alone removes
roughly 70% of current page height.

### F. Data health — small, honest, dismissible

> 3 items have contradictory status · 26 deadlines aren't dates · 1 orphaned
> reminder

Links to the Review "Conflicts" filter and to the audit. It converts findings
that are currently invisible into something with a fix path. Drop this block
once the underlying issues are resolved.

---

## 3b. Snooze needs somewhere to live

Snooze is not a UI affordance, it is a column. Nothing today can express "not
now, ask me in September", which is why 16 no-deadline opportunities sit in
permanent limbo — the only options are act or ignore.

The smallest version is one nullable `snoozed_until` per row on
`gig_opportunities` and `sync_targets`. `buildReviewQueue()` drops anything
whose date is still in the future and lets it back in on its own, so the deck
shrinks honestly rather than by forgetting. A "Snoozed" filter alongside the
existing ones keeps it auditable — a queue that hides things with no way to
look is worse than one that nags.

Offered dates should be data-aware where the item allows it: on SXSW, whose
fee rises September 1, "before the fee rises" beats any generic interval.
Where there is no such date the menu simply does not offer one rather than
showing a dead entry.

Decide early: a snooze probably should **not** survive the item changing
underneath it. If a run updates a snoozed gig — new deadline, a fee appears —
waking it immediately is more useful than honouring a date set against
different facts.

**Built, and that question was answered yes.** Which is why there are two
columns and not one. `snoozed_at` records when the snooze was set, and the
queue wakes anything whose `updated_at` has moved past it — a snooze is a
judgement about a set of facts, and once a run changes the row, the judgement
was about a different item. The woken item says so in the detail panel rather
than reappearing unexplained.

Three consequences worth knowing before changing any of it:

- **Both columns are written by one endpoint.** `POST /api/review/snooze` sets
  `snoozed_until`, `snoozed_at` and `updated_at` from a single timestamp. A
  caller that set the date through an ordinary PATCH would leave `snoozed_at`
  null and create a snooze that breaks on the write that created it — so there
  is no path that can set one without the other. Unsnoozing clears both;
  leaving the stamp behind would make the *next* snooze inherit it and wake
  instantly.
- **Snoozed items stay in the queue.** They are excluded inside
  `matchesFilter()` — one gate ahead of every predicate, including `all` —
  rather than filtered out of `buildReviewQueue()`, so the Snoozed view has
  something to show and nothing is truly hidden. `/api/review` with no filter
  now runs through `all` rather than skipping the filter, which was the one
  path that could have leaked them.
- **They do not count toward the Overview blocks.** Not on the time-critical
  strip, not in the open-ended backlog. Snoozing is precisely how that number
  is meant to come down; counting deferred rows would make the row undrainable.

Offers are built by `shared/snoozeOptions.ts`, which does the data-aware part
above and adds one rule the spec did not: **nothing is offered at or past a
live deadline.** Deferring an item beyond the date it stops being actionable is
archiving it while looking like deferral. On an item due in two days the menu
offers nothing at all and says why — the typed date stays available, because
the person may know something the row does not.

## 3c. The email digest

The dashboard only works if something brings you back to it. A digest is that
thing, and it changes what the app is: today it waits to be visited; this makes
it reach out when there is a reason.

### Two prerequisites, neither of which exists yet

- **No scheduler.** `wrangler.toml` declares no `[triggers]` and the Worker
  exports no `scheduled()` handler. A Cron Trigger is the natural fit — the
  Worker already owns the data.
- **The Gmail token cannot send.** It holds `gmail.readonly`, deliberately;
  `docs/gmail-setup.md` states the app never sends. Sending means either
  re-consenting for `gmail.send`, which widens what a leaked token can do, or
  a separate transactional sender whose credentials only send. The second
  keeps read and write access apart and is the safer default.

**Resolved, and by neither of those.** Cloudflare Email Service exposes a
`send_email` binding to Workers, so the app that already owns the data can send
the mail with no API key and no third-party account. Three things make it the
right answer rather than merely a third option:

- **The allowlist is the security boundary.** `allowed_destination_addresses`
  in `wrangler.toml` names every address the Worker may write to. A leaked API
  key sends anywhere its owner can; this binding cannot, whatever the code says.
- **Gmail stays read-only.** The scope question above simply does not arise,
  because nothing about the Gmail integration is touched.
- **It is free for this shape of use.** Sending to a *verified destination
  address* on the account costs nothing on any plan and does not touch the
  monthly quota. Sending to an arbitrary recipient needs Workers Paid — which
  is why the recipient is a setting rather than a constant, and why the default
  is the address that is unambiguously free.

The scheduler is a Cron Trigger, `0 13 * * 1` — Monday 13:00 UTC, roughly 08:00
in Winnipeg. Cron is UTC year-round, so it drifts an hour against local time in
winter; for a Monday-morning email that is not worth a timezone library.

### What goes in it

A diff, not a report. Four groups, in this order, each dropped when empty:

1. **New since last time** — what the discovery runs added, with the same
   one-sentence rationale the cards use.
2. **Now actionable** — snoozes come due, windows opened, deadlines crossed
   into range. This is the group that earns the email.
3. **Changed under you** — items already reviewed whose facts moved: a fee
   appeared, a deadline shifted, a note picked up a conflict.
4. **Going stale** — the no-deadline pile, capped at two or three, oldest
   first, so the rot surfaces slowly instead of as a wall.

Every line links straight into `#review` at that item. The digest's job is to
end in the app, not to substitute for it.

### Rules that keep it welcome

Send nothing when there is nothing — an empty digest teaches you to ignore the
full ones. Never repeat an item that has not changed, which needs a per-item
mark for what was last reported, not just a `last_digest_at` timestamp. Keep
the cadence to one weekly send, with an immediate send reserved for a
genuinely dated event (a deadline inside a week on something unsubmitted).
Both switchable from Settings without a deploy.

**Built.** `digest_reports` holds one row per item with a *fingerprint* of the
facts as reported — status, deadline, window, fee, snooze, flag set. A run
mentions an item only when that fingerprint differs from the stored one, so a
research run rewording a note does not resurface anything. `updated_at` is
deliberately not in the fingerprint for exactly that reason.

Three rules were wrong when first written and only failed against a live
database, which is worth recording because none of them were type errors:

- **"Going stale" cannot obey the never-repeat rule.** Those items never
  change — that is the whole complaint — so a strict rule mentions each one
  once and then hides the pile forever, which is the failure the group exists
  to prevent. It repeats on a **28-day cooldown** instead: named, quiet for a
  month, eligible again. Weekly repetition is how an email stops being read;
  monthly is a nag.
- **"Now actionable" must mean it *became* actionable.** The first version
  promoted anything currently due, so a gig nine days from its deadline that
  merely gained a fee jumped the queue. It now compares against the flags in
  the stored fingerprint. If everything lands in the group that earns the
  email, the group stops earning it.
- **A lapsed snooze cannot be detected from the stored mark.** Snoozed items
  are never reported, so no mark ever records that one *was* snoozed — the
  original check was unreachable and every wake arrived as "changed under you".
  It reads the row instead: `snoozed_until` set but no longer in force is a
  snooze that ended, and the mark then carries that date so the same wake is
  not announced twice.

The marks are written **after** a successful send, never before. Marking first
would mean a failed send silently swallows a week of changes, because the next
run considers them already reported. `GET /api/digest/preview` renders exactly
what would go out and writes no marks at all, so previewing is free of side
effects — otherwise looking at the email twice would make the real one go
quiet.

## 4. Build order

Phase 0 is not optional — without it the redesign renders empty boxes.

| Phase | Work | Why first |
| --- | --- | --- |
| **0** | ~~Make the API return what actually needs a decision.~~ **Done.** The queue moved to `shared/` and is served by `GET /api/review`; the Review screen consumes it and derives nothing locally. Status vocabularies were deliberately left alone — the queue reads notes, not statuses, so migrating them is no longer on the critical path. | Everything below shows nothing until this lands |
| **1** | ~~The decision deck.~~ **Done.** Stat cards deleted; the deck deals one card at a time from `GET /api/review?filter=needs`. Rationale sentences live in `shared/decisionCopy.ts` and ride on every queue item, so the digest can reuse them. The old "Needs review" section went too — the deck supersedes it, and it was rendering an empty container because it counted promo drafts it never listed. | The whole point of the page |
| **2** | ~~Block E: collapse the task-run log.~~ **Done.** One line per run, capped at five, prose behind a per-row disclosure, full history on the Log page. Measured against identical data: the block goes 684px → 214px, a 69% cut. | Biggest space win, lowest risk |
| **3** | ~~Blocks C + D, plus the `deadline` / `deadline_note` / `opens_at` split and a date backfill.~~ **Done.** Migration 0003 adds the two columns; `splitDeadline()` does the extraction and `scripts/backfill-deadlines.ts` applies it, dry-run by default. Blocks C and D are served from `GET /api/review` as `summary`, so the strip and the deck rank urgency identically. The dead `upcomingDeadlines` and `pendingReview` queries were deleted from `/api/overview`. | Makes the time-critical strip real rather than decorative |
| **4** | ~~`snoozed_until` on both tables, the queue filter, a "Snoozed" view, and the deck's snooze action.~~ **Done.** Migration 0004 adds `snoozed_until` **and** `snoozed_at`; the wake-on-change question in §3b was answered yes and implemented against that pair. `POST /api/review/snooze` is the only writer. Offers come from `shared/snoozeOptions.ts`. | Half the backlog is real work at the wrong moment |
| **5** | ~~The email digest (§3c).~~ **Done.** Cron Trigger + `scheduled()`, `shared/digest.ts` for content, per-item marks with a fingerprint. The sender question resolved better than either option below: Cloudflare Email Service's `send_email` binding. | Depends on 4 — "now actionable" is mostly snoozes coming due |
| **6** | ~~Block F, and fix the orphaned reminder.~~ **Done.** Both delete handlers now remove reminders first — `sync` had the same bug, unrecorded. `DataHealthRow` counts contradictions, prose deadlines and orphans, links into the filtered queue, and renders nothing once clean. | Housekeeping |

### Shared-logic note

Done as part of Phase 0. `buildReviewQueue()` and `reviewParse.ts` now live in
`shared/`, included by both tsconfigs. The Worker imports them for real; the
frontend imports only their types, so the parser no longer ships to the
browser. Phase 1 gets its cards by calling `/api/review?limit=4` — it must not
re-derive anything locally. Retiring the parser in favour of real columns, per
the audit, is now a change in one place.

### What "done" looks like

- The page answers all three questions above without scrolling.
- Every number on it is clickable and leads somewhere specific.
- No block renders an empty container when it has nothing to say — it either
  states the zero case in words or is not rendered.
- The task-run log occupies under 15% of page height.

---

## Sources

- [Cards: UI-Component Definition — NN/G](https://www.nngroup.com/articles/cards-component/) — cards vs. lists for homogeneous items
- [Dashboards: Making Charts and Graphs Easier to Understand — NN/G](https://www.nngroup.com/articles/dashboards-preattentive/) — preattentive attributes
- [3 Strategies for Managing Visual Complexity — NN/G](https://www.nngroup.com/videos/managing-visual-complexity/) — predictable placement, hierarchy, progressive disclosure
- [Triage — Linear Docs](https://linear.app/docs/triage) — holding-inbox pattern for incoming items awaiting a human decision
- [Plan your day with the Today view — Todoist](https://www.todoist.com/help/articles/plan-your-day-with-the-today-view-UVUXaiSs) — finite, priority-ordered, drainable queues
- [Dashboard Design Best Practices for Product Teams — Figr](https://figr.design/blog/dashboard-design-best-practices) — the three-questions/one-action framing, actionable vs. vanity metrics
- [12 Dashboard Design Principles For Better UX — UX Pilot](https://uxpilot.ai/blogs/dashboard-design-principles) — attention distribution, element-count limits
