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

No counters and no totals. The first thing on screen is a decision you can
make. Four cards drawn from the *same* `buildReviewQueue()` scoring the Review
screen uses, so the two screens can never disagree:

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
one" — never generic OK/Cancel. Acting on a card removes it and the next takes
its place; the deck drains. Header reads "4 of 14 · show the rest →".

The sentence is generated per item from the parsed note, keyed on the dominant
flag (conflict / paid / overdue / blocked / duplicate). Writing those templates
is the substance of this block, not the card styling.

Zero state: *"Nothing needs a decision. 16 open opportunities are still
waiting whenever you want them."*

### C. Time-critical strip

Overdue, due-soon, and windows about to open — the honest contents of which is
currently 5 + 1 + a handful. Small by design, because the data says it is
small. Includes the pending reminders that "Follow up" shows today.

### D. Open anytime — the rot detector

One row, the thing no current screen can say:

> **16 opportunities have no deadline** — open right now, nothing forcing the
> issue. 9 have never been actioned. **Review →**

This is where the actual backlog lives.

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

## 4. Build order

Phase 0 is not optional — without it the redesign renders empty boxes.

| Phase | Work | Why first |
| --- | --- | --- |
| **0** | Make `/api/overview` return what actually needs a decision. Either migrate the status vocabularies to match `GigStatus`/`SyncStatus`, or move the queue logic server-side so Overview and Review share one definition. | Everything below shows nothing until this lands |
| **1** | The decision deck. Delete the stat cards outright. Includes writing the per-flag rationale sentences — that copy is the feature, not the card styling. | The whole point of the page |
| **2** | Block E: collapse the task-run log. | Biggest space win, lowest risk |
| **3** | Blocks C + D, plus the `deadline` / `deadline_note` / `opens_at` split and a date backfill (17 of 33 recoverable — see §1b) | Makes the time-critical strip real rather than decorative |
| **4** | Block F, and fix the orphaned reminder: `DELETE /api/gigs/:id` removes the gig and its Calendar event but leaves its reminders behind — reminder 3 points at gig 21, which no longer exists. | Housekeeping |

### Shared-logic note

`buildReviewQueue()` and `reviewParse.ts` currently live in `frontend/src/lib/`
and run client-side. If Phase 0 moves the "needs a decision" definition to the
Worker, that logic should move with it (`src/lib/`) and be imported by both,
so Overview and Review cannot drift apart. That is also the natural moment to
retire the parser in favour of real columns, per the audit.

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
