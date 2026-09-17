# Making the screens calmer

A plan, ordered by how much quiet it buys per unit of work. Nothing here is
implemented yet.

## The test

This app has a strong rule already — *say what you could not do* — and it
pushes in exactly one direction: show more. A preview names what it skipped, a
cost names its unknowns, a recovered date shows the prose it came from. That
rule is right and none of what follows weakens it.

The counterweight is not "show less". It is:

> **A thing that is always the same is not information.**
> **An action available on every row does not need to be drawn on every row.**

Both are about *signal*, which is what the "say what you could not do" rule is
about too. A column of em-dashes is not honesty about missing data; it is a
column that has never once carried a fact, taking up the width of one that
might. Hiding it loses nothing, because there was nothing.

So the question for each piece of the screen is not "is this useful?" — nearly
all of it is, sometimes. It is **"what state makes this load-bearing, and is
that state true right now?"** Where the answer is "always", it stays. Where it
is "when the row is in trouble" or "when you are actually editing", it earns
its keep by appearing then.

---

## 1. Gigs: three columns that are structurally always empty

**The biggest single win in the app, and the cheapest.**

The table has eight columns. On the seeded fixture — and, per CLAUDE.md, in
production — three of them are empty on every row and will stay that way:

| Column | Why it is empty |
| --- | --- |
| `ORGANIZER` | "no note carries them in a form anything can read" |
| `FIT` | `genre_fit_score` stays NULL, same reason |
| `PAID` | filled on 2 rows of 12; `FEE` on 4 |

`ORGANIZER` and `FIT` are not missing data waiting to arrive. CLAUDE.md
records the decision that nothing populates them, so they are a permanent
column of `—` occupying a third of the table's width. Meanwhile `NAME` wraps
to two and three lines in the space left over, which is the column somebody
actually reads.

**Proposal.** Drop `ORGANIZER` and `FIT` from the default table. Fold `PAID`
into `FEE` — "USD 1,200 · paid" is one cell, and the row with a travel bursary
and no amount reads better as prose in one column than as prose in one and a
pill in another. Give the reclaimed width to `NAME` and `DEADLINE`.

**Why not a column picker.** Because the answer is not per-person: these
columns are empty because of a schema decision, not a preference, and a
control offering them would be a control that shows you nothing.

**Second:** the `×` on every row is a destructive action drawn 34 times. It
belongs in the expanded row beside Edit, which is where somebody who has
decided to delete a gig already is.

> **Corrected while implementing.** This section originally claimed every row
> carried two status pills, the second being `submission_state` parsed from
> the note. Reading the code, the second pill is an *action button* — `Applied`
> on a shortlisted row, `Will apply` / `Pass` on a discovered one. There is no
> duplication. What is genuinely confusing is that `StatusBadge` renders
> `shortlisted` as the words "Will apply" directly beside a button that says
> "Applied", which is worth a look on its own and is not a density problem.

---

## 2. Review: the evidence, on every card, for every candidate

Each reply card shows the classification pill, the deciding sentence, the
match strength, **and a bullet per signal** — for the genuine organiser reply
and for the pizza receipt alike.

The strength work this release did most of the job: the pizza receipt now says
*Weak — the only evidence is "Winnipeg" in the body*, which is exactly enough
to dismiss it. The bullets underneath repeat that in list form.

**Proposal.** Show the strength line always; put the per-signal bullets behind
the `Explainer` affordance now on the rest of the app. A strong match does not
need showing its work, and a weak one needs one sentence, not three.

**The filter bar** carries nine chips, one of which reads `Contradictions 0`.
A filter that would show nothing is a click that costs a screen redraw to tell
you so. Hide a filter whose count is zero — the existing `countByFilter` gives
this for free, and the Artist page already sets the precedent by making its
tallies filters rather than decoration.

---

## 3. Artist: three rows, six buttons, and a date two years out

Every asset row draws `Edit` and `Archive`. Three assets visible means six
buttons competing with the content before anybody has decided anything.

Every row also carries `Review by 2027-04-05`. On an asset that is fine, a
date two years out is the least useful thing on the row, and it is rendered at
the same weight as the bio it describes.

**Proposal.**
- `Edit` / `Archive` appear on hover **and on focus**, and stay permanently
  visible on touch. The row is already a hit target.
- The review date shows only when it is doing work: `overdue`, `unreviewed`,
  or inside some weeks of lapsing. `assetHealth` already computes exactly this
  and the screen currently ignores the distinction, printing the date whatever
  it says. A row that is fine says nothing, which is the honest rendering of
  "nothing to report".
- The `49 chars` chip matters when you are checking a bio against a form's
  `maxLength`, not when browsing. Move it into the row's expanded state.

---

## 4. Overview: withdrawn

The proposal here was to merge the *7 opportunities have no deadline* callout
with the `Data health: 2 deadlines are not a date` line, on the grounds that
both said "something about your data is imperfect" in two visual weights.

**That was a misreading and the merge would have been wrong.** They are two
different claims:

- `OpenEndedRow` is about the **shape of the backlog** — work that is
  available and that nothing is forcing. Not a fault.
- `DataHealthRow` is about **data that is broken** — a status contradicting
  its note, a deadline that failed to parse, a reminder pointing at a deleted
  gig.

Merging them would file "you have seven things with no urgency" under the same
heading as "two deadlines are not dates", which is the opposite of the
distinction this app keeps making everywhere else. Left alone.

The one real observation: `DataHealthRow` renders as a bare line of text
directly beneath a card, so the column carries two visual treatments. Its own
doc comment says it should be deleted once the underlying issues are fixed —
"a permanently clean health row is furniture" — so the right move is to fix
the data rather than restyle the reporter. Nothing to do here.

---

## 5. What should NOT be touched

Worth writing down, because "calmer" is a direction that does not know when to
stop.

- **The decision card's rationale.** Four lines of prose about a P-2 visa is
  the most information-dense thing on Overview and every word of it changes
  what you would do. This is the app working.
- **Empty states.** "Nothing to cost this on yet — add a location, a country
  and the nights away" tells you what to do. Collapsing it leaves a blank box.
- **Consent screens.** The Gmail scope disclosure is longer than anything
  around it and stays exactly where it is.
- **Warnings, counts and errors.** Not explanations; the app telling you
  something rather than teaching you.
- **Sync.** Already the calm one: name, one line of metadata, a status, an
  action. It is the target the others should look like.

---

## Order

1. Gigs columns — one file, largest effect, no new mechanism.
2. Review filter chips with zero count — a few lines, uses what exists.
3. Artist row actions and review dates — needs a hover/focus pattern that also
   works on touch, so slightly more care.
4. Review evidence behind the info button — reuses `Explainer`.
5. ~~Overview data-health merge~~ — withdrawn; see above.

Everything above is reversible and none of it removes a fact from the
database. Where something is hidden, it is hidden **behind a state that says
when it comes back**, not behind a preference somebody has to find.
