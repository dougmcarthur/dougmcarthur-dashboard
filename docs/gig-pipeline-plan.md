# The gig pipeline

Approving an opportunity means **"I am going to apply."** It is not a booking,
and nothing about it should behave as though a date has been secured.

That one sentence is the whole reframe, and most of what follows is working out
where the current app quietly assumes otherwise.

## 1. What is wrong today

`gig_opportunities.status` runs `pending_review → approved → submitted`, and on
`approved` the app creates a Google Calendar event titled `🎵 {name}` on the
submission deadline. Opened on a phone, that is indistinguishable from a booked
show. The event is really "your application is due", wearing a gig's clothes.

Worse is the word `approved` itself. It does not say *who* approved, and the
pipeline needs both answers: whether **you** said yes to applying, and whether
**they** said yes to you. One field carrying both is how "approved" and
"rejected" came to mean opposite things depending on who you asked — today
`rejected` means *you* passed, but the obvious reading is that *they* turned you
down. Twenty-two of thirty-four production rows sit in `approved`, so this is
not hypothetical: the database's largest state is its most ambiguous one.

## 2. The five phases, and the states they need

| Phase | What happens | States |
|---|---|---|
| 1 · Research & collect | The app scans for festivals, showcases and venues that fit | `discovered` |
| 2 · Present & review | Digest and dashboard put it in front of you; you decide | `shortlisted`, `passed`, (snooze is orthogonal) |
| 3 · Apply & track | You apply; the app pre-fills what it can | `preparing`, `submitted` |
| 4 · Post-submission | The app watches your mail for their answer | `acknowledged`, `info_requested`, `invited`, `declined` |
| 5 · Pre-show | Agreement, logistics, the actual date | `booked` |

Plus two ways out that are neither yes nor no: `expired` (the window closed
while it sat there) and `withdrawn` (you pulled out after applying).

The names are chosen so that **the subject of the verb is never in doubt**:

- `shortlisted` / `passed` — *your* decision, in phase 2.
- `invited` / `declined` — *their* decision, in phase 4.

`approved` and `rejected` both disappear. They are the words that caused this.

### Migrating the 34 rows

| Now | Becomes | Why |
|---|---|---|
| `approved` (22) | `shortlisted` | You said you would apply. Nothing more was ever claimed. |
| `rejected` (5) | `passed` | You said no. *They* never saw it. |
| `submitted` (2) | `submitted` | Unchanged. |
| `archived` (5) | `archived` | Unchanged. |

Reversible: the migration writes the old value into a `legacy_status` column so
nothing is lost if a name turns out to be wrong.

## 3. What the calendar is allowed to say

Three kinds of entry, and only the last one is a gig:

1. **`Applications open — {name}`** on `opens_at`. Phase 3's "remind me when a
   window opens", and the one you asked for.
2. **`Apply by — {name}`** on `deadline`, 7 days ahead as well. This is what the
   current event was really for; it just needed to say so.
3. **`{name}`** on the performance dates — written **only** at `booked`, never
   before. `performance_start` / `performance_end` arrived in migration 0008
   and became settable in step B; a run of several days is one entry spanning
   them, not one entry per day.

Entries 1 and 2 belong to a calendar you can hide. A month of deadlines mixed
into the calendar you check before saying yes to dinner is its own problem.

## 4. Phase 3 — apply & track

What the app can prepare without pretending to be you:

- **Application-form pre-fill.** Where the form is a public URL, fetch it, read
  the fields, and stage answers drawn from the artist database (§6). Output is a
  copy-paste block per field, not a robot filling in the form — an application
  submitted by automation is a good way to be blacklisted.
- **Draft emails** for submission-by-email opportunities, in your voice, from
  the existing writing style guide.
- **A materials checklist** per opportunity: this one wants a 150-word bio, two
  live videos and a stage plot; here they are, here is what is missing.

`preparing` exists as a state because "I said I'd apply" and "the application is
half-written" are different, and the second one is the one that needs chasing.

## 5. Phase 4 — the follow-up cycle

The existing Gmail reconciler already reads sent mail to match pitches; this
extends it to received mail, matched by organiser domain and thread.

Four things to recognise, in rising order of difficulty:

1. **Acknowledgement** — "thanks for applying". Template-ish, high confidence.
   `submitted → acknowledged`.
2. **Rejection** — "unfortunately". Also fairly templated. `→ declined`.
3. **Invitation** — "we'd love to have you". `→ invited`.
4. **Information request** — the hard one, because it is a real human writing a
   real question. Parse what is being asked and how they want it back (reply, or
   another form), then draft it. `→ info_requested`, which is a state precisely
   because it is the one that stalls if nobody notices.

Classification proposes; it never transitions a row on its own. A wrong
auto-transition here means the app tells you that you were rejected when you
were not. Everything lands in the notification pane as a suggestion with the
quoted sentence that triggered it.

## 6. The artist database

One place holding everything a booking manager or artistic director could ask
for, so no application starts from a blank page.

Sources, in order of trust: the three reference docs already in D1 (the 18k-word
artist brief, the EPK bio, the writing style guide), then Google Drive, then the
latest posts from the website and social channels.

Contents: bios at three lengths, press photos with credits and usage rights,
stage plot and input list, tech rider, streaming and video links, MP3s of
recordings, performance history, contact and business details, grant and
association memberships.

Two things it must do that a folder of files cannot:

- **Expire.** A press photo from 2019 and a bio that predates the last record
  are worse than nothing. Every asset carries a review date.
- **Assemble.** An EPK is a *view* over this, generated per opportunity —
  folk festival and a sync agency want different cuts of the same material.

Both of those are built (`shared/artistAssets.ts`, migration 0009, the Artist
page). Each asset also carries the `question_kind` it answers, which is the
join to `shared/questionKinds.ts` and therefore to step D: `GET
/api/artist/answer?label=…` takes a form field's label and returns the asset
that answers it at that length.

What is **not** built is the sourcing. Assets are entered by hand or POSTed by
the research agents; nothing yet reads the three reference docs in D1, Google
Drive, or the website. That is the next cut of this step, and it wants an
extraction pass rather than more schema.

## 7. Weighing opportunities

You asked how to weigh factors that are hard to quantify. The research answer
is in three parts, and the first is the one that matters most.

### Cost is a denominator, not a criterion

The instinct is to score cost alongside audience and brand and add them up.
That is wrong, and it is wrong in a way that shows up immediately: it lets a
huge audience "outvote" a $3,000 trip, which is not how a budget works.

Money is the one thing here that is genuinely measurable. Everything else —
audience, networking, brand — is a judgement. So:

```
value      = weighted sum of the judgement criteria, 0–100
netCost    = fees + travel + lodging + visa + per-diem − (stipend + guarantee)
efficiency = value / max(netCost, 100)
```

The `max(…, 100)` floor stops a free local show dividing by zero into infinity.
**Both numbers are always shown.** A single blended score is how you end up
applying to something that scored 78 without noticing it costs $4,000.

### Swing weighting, for the parts you cannot measure

"How important is audience size, 1 to 10?" is unanswerable, which is why every
scoring spreadsheet ends up with everything weighted 7. The technique that works
([Government Analysis Function][gaf], [1000minds][km]) asks a different
question, grounded in the range actually in front of you:

> Here is the smallest audience in your list (200) and the largest (40,000).
> Here is the weakest brand (an unknown local bar) and the strongest (Winnipeg
> Folk Festival). If you could fix only one of those two swings from worst to
> best, which do you take?

Whichever you pick gets 100 points; you then rate the others against it. Five
questions, answered once and revisited yearly, and the weights come out
normalised to sum to 1.

The reason this works where a 1–10 scale does not: it forces the *range* into
the judgement. A criterion where every opportunity scores about the same gets a
low weight automatically, because its swing is small — which is correct, and
which no amount of introspection about "importance" would have produced.

Criteria, each normalised 0–100:

| Criterion | Note |
|---|---|
| Audience reach | Log-scaled. 500 → 5,000 is a bigger jump than 50,000 → 55,000. |
| Brand strength | An ordinal ladder, not a guess at a number. |
| Networking | Delegate/industry programme present? Showcase conferences score high here and low on audience — which is the point. |
| Genre fit | The existing `genre_fit_score`. |
| Career leverage | Unlocks a market, a radio region, a grant eligibility. |

### Costing the trip

Estimates, always as a **range**, never a point. `$1,400–2,300` is honest;
`$1,847` is a lie with a decimal place.

- **Travel** — banded by distance from Winnipeg: drive (<800 km), regional
  flight, transcontinental, international.
- **Lodging** — nights × a per-city band.
- **Visa** — the one that surprises people, and the one worth encoding as a
  rule rather than a number. A Canadian musician doing a **paid US performance**
  needs a P-2: about **$510 USD** to USCIS plus roughly **$120 CAD** in CFM
  admin, and **90 days of lead time** ([CFM][cfm], [Recording Arts Canada][rac]).
  A **showcase or conference** may qualify as a B-1 business visitor instead —
  effectively free ([CFM][cfm]).

  So the same festival can cost $0 or $700 in paperwork depending on whether you
  are showcasing or being paid, and the 90-day lead time is a *hard constraint*,
  not a cost: an application whose deadline sits inside 90 days of the
  performance date should be flagged as a visa risk regardless of its score.

For context on why any of this matters: **72% of artists who toured in 2024 made
zero profit**, and 58% have turned down opportunities on cost alone
([NotNoise][nn], [Medium][med]). The point of the number is not to find winners.
It is to stop you finding out afterwards.

## 8. Learning what you actually say yes to

You have **34 decisions**: 22 shortlisted, 5 passed, 5 archived, 2 submitted.

That is not enough to fit a model, and the honest thing is to say so rather than
ship something that looks clever. The usual rule of thumb is ten-ish events per
predictor, counting the *rarer* class — so with ten rejections, roughly one
predictor is supportable. Five criteria fitted freely on this data would learn
noise and state it confidently.

So the design is **shrinkage, not fitting**:

- Start from the swing weights as a prior.
- Fit a logistic regression on the five criteria plus `log(netCost)`, with a
  weakly informative prior centred on those weights ([Gelman et al. on priors
  for logistic coefficients][sm]).
- Let the data's influence grow as `n / (n + k)` with `k ≈ 40`. At n=34 the
  data gets about 46% of the say; at n=10, 20%; at n=200, 83%.

**The output worth having is not the score.** It is the disagreement: *"you
shortlist high-travel-cost opportunities more often than your stated weights
predict."* That tells you something about yourself. A number from 0 to 100 does
not.

### Two loops, not one

- **Short loop** — what you choose to apply to. Grows fast, but it only measures
  your taste, which is what the priors already encode.
- **Long loop** — what you get *invited* to, and what turned out to be worth
  doing. Grows slowly and is the real target.

Record both from the start. Weight the long loop higher as it accumulates.

### The trap: the model must never filter

If low scores get hidden, you never see the ones it was wrong about, no labels
are generated for them, and its beliefs calcify into fact. This is the standard
failure of any ranker trained on its own output.

So, without exception:

- The model **orders** the queue. It never removes anything from it.
- Every review batch includes **one or two low-scored opportunities**, marked as
  such. Boring, cheap, and the only thing that keeps the model honest.
- The score at decision time is **stored**, so calibration can be measured
  later: did the things scored 80 actually get shortlisted more than the 40s?
  A model nobody can check is a model nobody should trust.

## 9. Build order

| | Work | Why here |
|---|---|---|
| A | Status vocabulary, migration, calendar reframe | **Done.** The app was actively misleading until this landed |
| B | Performance dates; `booked` writes a real calendar event | **Done.** Completes the calendar story |
| C | Artist database + EPK assembly | **Done** apart from sourcing. Everything in phases 3–5 draws on it |
| D | Phase 3: form pre-fill, draft emails, materials checklist | **Done.** Migration 0011, `shared/application.ts`, and the panel on the gig row. See [application-prep-plan.md](./application-prep-plan.md) |
| E | Phase 4: Gmail follow-up classification | **Done.** Migration 0012, `shared/replyMatch.ts` + `shared/replyClassify.ts`. See [reply-matching-plan.md](./reply-matching-plan.md) |
| F | Cost model + swing-weight elicitation + scoring | **Half built.** The cost side is in — migration 0013, `shared/gigCost.ts`. The scoring side waits on the elicitation |
| G | Preference learning and calibration | Needs F, and needs decisions logged *with* their scores |
| H | Phase 5: agreement templates | Last, because it is the rarest event |

A is the only part that is a correction rather than a feature, which is why it
goes first and alone.

### What is left, and what each is waiting on

Four steps of the eight, plus two things that belong to no step because they
are debts rather than features.

**E — Phase 4, the follow-up cycle. Built.** The four states an organiser's
reply justifies are now reachable. One correction to §5 worth carrying
forward: it said replies would be matched "by organiser domain and thread",
and against the real mailbox that rule holds for one reply in eight. Matching
is on the event's *name* — including abbreviations, and including the name in
a quoted form receipt — with the domain as a corroborator, and a confirmed
match binds the sender for good. See
[reply-matching-plan.md](./reply-matching-plan.md).

What is left of the phase: `info_requested` is recognised but the answer is not
drafted, and the scan runs when you press the button rather than on the cron.

**F — cost and scoring. Half built.** The cost side needed nothing from
anybody and is in: migration 0013, `shared/gigCost.ts`, a panel on the gig
row, and the P-2 rule as a queue flag. It produces a **denominator and
nothing else** — no `value`, no `efficiency`, no blended number anywhere, and
`test/uiConsistency.test.ts` fails if one appears on screen. That restraint is
the whole reason it could ship early: a cost is a fact, and a score would have
been five weights invented on somebody's behalf.

Three judgements it settled along the way:

- **A missing input is never a zero.** No `nights` leaves lodging and per diem
  out of the sum and puts a sentence in `unknowns`; it does not become a day
  trip. Zero nights is a real answer some rows have, and an estimate that
  cannot tell the two apart reports a cheap gig.
- **A guessed band is labelled as guessed.** `travel_band` and `lodging_tier`
  are set by hand; when they are null the band is inferred from the prose
  location and every surface says so — the same rule a deadline recovered from
  prose follows.
- **The visa lead time counts from the deadline, not from today.** You cannot
  file a performer's petition before somebody has agreed you are performing,
  and nobody agrees before applications close. So a show 150 days out with a
  deadline 100 days out has fifty days for a ninety-day permit, and the flag
  says so. It is `visa_risk`, weighted above every deadline and below only a
  self-contradicting row, and it is the third explicit exception in
  `awaitingDecision` — the only one about a date ahead rather than a row's
  history.

**What is still waiting on you.** The swing-weight elicitation in §7: five
questions, answered once against the real range of what is in the list, and
the weights come out normalised. Until those exist there is a cost and no
value, which is a usable half — "this one is $2,400" is worth knowing on its
own — but it is not the model.

**G — preference learning.** Needs F, and needs decisions logged *with* the
score they were made against. 34 decisions is not enough to fit anything, which
§8 says at length; the useful output is disagreement with the stated weights,
not a number.

**H — Phase 5, agreement templates.** Last, and rightly: `booked` is the rarest
transition in the pipeline and the one with the least to automate.

**Sourcing the artist database. Built.** Step C built the table, the expiry
and the EPK, and then nothing filled it — `artist_assets` was empty in
production for five migrations, which is what every "Nothing on file answers
this yet" in an application panel was reporting. The facts were never missing:
they sit in `reference_docs`, which this app already stores and never read.

`shared/artistSource.ts` extracts on three rules, none of which reads a
sentence — a `##` heading is a question, a parenthetical in it is the variant,
a labelled URL on its own line is a link. The restraint is the design: a
fourth rule that pulled "Spotify 14 monthly listeners" out of a paragraph
would be a regex per phrasing, which is `reviewParse.ts` again. Sections it
cannot file are named rather than dropped, the same way phase 3 lists the
questions it cannot answer.

Everything sourced lands `unreviewed`. What is left of this: Drive and the
website are still unread, and the press photos — the assets with the most
expensive failure mode, since a photo with no credit is broken the day it is
added — are not in any document and have to be entered by hand.

**The notes backfill.** `shared/reviewParse.ts` is a stopgap that re-derives
structured facts out of prose on every read, because migration 0001's columns
were never backfilled. It is the oldest debt in the repo and the one with a
written plan already — see [notes-field-audit.md](./notes-field-audit.md). The
parser should be deleted, not extended.

### Salvaged from the abandoned prototype

`claude/gig-reviews-submission-9e9fvr` built a version of steps C and D against
a schema that no longer exists. Two of its modules were pure and are now on
`main` ahead of the step that will call them — `src/lib/formParser.ts` and
`src/lib/questionKinds.ts` — because a reviewed, tested parser is worth more
than the branch it was stranded on. Both were taken up by step D: `formParser.ts` reads the form,
`questionKinds.ts` says which canonical question each field is, and
`shared/application.ts` joins them to the artist database.

Its `submissionWindow.ts` was **not** taken. `windowState` answers the same
question `opensInDays` in `shared/reviewQueue.ts` already answers, and a second
predicate for one question is the mistake that put the digest and the Review
filter out of step. Its prep-run helpers read `prepStatus`, `prepAttempts` and
`prepUpdatedAt`, columns this schema did not have. Migration 0011 added
`prep_status`, `prep_checked_at` and `prep_note` instead — no attempt counter,
because the outcome that matters is *why* a read stopped rather than how many
times it was tried, and a login wall is not something to retry at all.

Everything else there — the answer engine, the discovery run, the Tailwind
rebuild — predates the status vocabulary and reads better as a reference than
as a patch.

[gaf]: https://analysisfunction.civilservice.gov.uk/policy-store/an-introductory-guide-to-mcda/
[km]: https://www.1000minds.com/decision-making/what-is-mcdm-mcda
[cfm]: https://cfmusicians.afm.org/services/u-s-work-permits
[rac]: https://recordingarts.com/us-work-permits-for-canadian-artists-a-guide-to-the-p-2-visa/
[nn]: https://notnoise.co/blog/indie-tour-budget
[med]: https://medium.com/@amahajavon/82-of-independent-musicians-cant-afford-to-tour-here-s-what-to-do-instead-b79466dbe0c4
[sm]: https://statmodeling.stat.columbia.edu/2019/11/28/the-default-prior-for-logistic-regression-coefficients-in-scikit-learn/
