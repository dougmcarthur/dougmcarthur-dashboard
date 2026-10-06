# Shared research, matched per artist: what exists and what does not

Written 2026-10-05, from reading the code rather than from the plans, which
were written before several of these pieces landed.

**The model.** Research is broad and shared: agents find what exists, once.
Each artist's account then holds the narrower set of criteria they have stated
or that their library implies, and Scout (1) matches the shared catalog against
those criteria, then (2) orders what matched by weights — the survey's
population baseline, refined by that artist's own stated and inferred
preferences. A finite world of opportunities, many artists, each seeing their
own slice.

**The short answer.** The shared catalog exists. The two arrows around it do
not: research reaches it only as a side effect of filing a row for *you*, and
nothing carries it back out to anyone else. Weighing does not exist at all.
What an artist says about themselves is stored and never read.

Everything below is from the code on `main` as of this date. Where a claim is
about production data I could not see, it says so.

## Stage by stage

| Stage | What exists | What is missing |
|---|---|---|
| 1. Broad research | Three routines; Manitoba Music's deadlines page and feed are read well | The research is not broad (gaps 1–2) |
| 2. Shared catalog | `opportunities` table, key-based dedupe, fill-gaps-never-overwrite, a public landing sample | It cannot hold what matching needs, goes stale, and has one write path (gaps 3–7) |
| 3. Artist criteria | Goals, reach and a note are stored | Location and genre are never asked; goals and reach are never read; no hard preferences (gaps 8–10) |
| 4. Inference from the library | Library facts for hometown, genre, line-up, fee, travel; association profiles carry structured genres | Nothing derives a profile from them (gap 11) |
| 5. Matching | `opportunity_id` links a row to a catalog entry | The link is write-only; no matcher exists (gap 12) |
| 6. Weighing | A cost *denominator* (`shared/gigCost.ts`); the survey instrument and a tested estimator | No score, no weights in use, no decision log (gaps 13–17) |
| 7. Delivery | The bell and the weekly digest, for the owner | Nothing tells an artist about a match (gap 18) |

## The gaps

Ordered by how much of the model each one blocks. **Bold** means the model
does not work without it.

### Research and the catalog

1. **The research is filtered to the owner before it is written down.**
   `gig-festival-scan.md` begins "Call `read_reference_docs`. That is who you
   are researching for", skips provincial funding "only when the reference
   documents say the artist is based in Manitoba", and files only what "a
   plausible fit" for them. So the catalog is *what fit you*, not *what
   exists*. For a shared model the agent should record what exists, tagged, and
   leave "does it fit" to the match. This is the same principle
   `gig-pipeline-plan.md` §8 holds for the scorer — the model orders, it never
   removes — applied one stage earlier.
2. **Only one province's association is read.** The prompt reads the artist's
   own province "if the artist is based outside Manitoba". With a Manitoba
   owner, nine provincial and territorial sources in
   `shared/musicAssociations.ts` are never read for anyone. A shared sweep
   reads all ten every run; the list is finite and short.
3. **There is no way to write to the catalog except by filing a gig for one
   artist.** `POST /api/gigs` runs `linkGig` as a side effect, and
   `AGENT_ROUTES` has no catalog route. Consequences: an entry cannot exist
   unless the owner has a row for it; "already known" means *on the owner's
   list* (`list_existing_gigs`), so a catalog entry the owner passed on is
   never refreshed; and the owner's list shapes what everyone can see.
4. **The catalog has no columns for the facts matching needs.** `opportunities`
   holds category, name, organizer, kind, url, deadline, location (prose),
   country and fee. Missing: **region** (`location` is free text), genre or
   style, **eligibility** (residents only, age, career stage, membership),
   audience size, what it pays, how long the application takes. The agent
   tool `create_gig_opportunity` cannot send any of them, and `category` is a
   regex over free text, so a residency, a venue booking or a competition
   becomes `other` — which is never public and would never match.
5. **Entries do not go stale, and recurring calls never reopen.**
   `lastSeenAt` moves only when an agent re-files a sighting, and agents skip
   anything already on file, so it is first-seen in practice. `fillMissing`
   never overwrites a deadline, so an annual call at the same URL keeps last
   year's closed date for good, and a rolling entry never expires. There is no
   re-check job.
6. **Nothing human stands between a page and every artist's list.** An
   agent-filed row with a public host is published by default; the only check
   is the owner hiding something afterwards. That was acceptable when the
   audience was a landing-page sample. When entries are *delivered* into other
   artists' queues, one poisoned or low-quality page reaches all of them. And
   `public` currently answers two questions at once — "may a stranger see
   this" and "may this go into an artist's list" — which are different gates.
7. **Sync is names only.** The catalog holds organisations; the pitch drafts
   are model work per artist. A new artist can be told who exists but not
   handed a drafted pitch.

### What the artist states

8. **Location and genre are never asked, and goals and reach are never read.**
   `GOALS`, `REACH` and the note are saved to `tenant_settings`; a search of the
   codebase finds one consumer outside the onboarding screens, `nextSteps`,
   which only picks which links to show. The queue, the Overview deck and the
   digest do not read them. "My province" is an answer about a province the
   account has never named.
9. **No hard preferences exist.** Nothing captures minimum pay, willingness to
   pay an entry fee, how far, which countries (a paid US date needs a P-2:
   about $800 and ninety days), paid versus showcase, or career stage. These
   are the criteria that make a list *narrower*, as opposed to merely
   differently ordered.
10. **The cost model's home is Winnipeg, in the source.** `shared/gigCost.ts`
    holds `LOCAL_PLACES`, `DRIVE_PLACES` and a Manitoba regex, and every note
    says "from Winnipeg". For anyone based elsewhere every travel estimate is
    wrong, silently; the visa rule also assumes a Canadian performer going to
    the US. It is small to fix and it is a correctness bug, not a missing
    feature: the estimate looks authoritative. Most near-term testers are in
    Winnipeg, which is the only reason it has not bitten.

### Inference

11. **The library knows more than anything reads.** The artist database has
    question kinds for `hometown`, `genre`, `lineup`, `fee` and `travel`
    (`shared/questionKinds.ts`), association profiles return a structured genre
    list, the stage plot yields the line-up, Bandsintown yields where they
    actually play. All of it is free text or a separate feature; nothing turns
    it into a profile. `readGenre` in `shared/epkProfile.ts` splits genre prose
    for the EPK only. An inferred value has to arrive *as inferred* — with its
    source quoted and overridable — the way `stagePlotClues` offers clues
    rather than filling answers in.

### Matching

12. **The catalog-to-artist link points one way.** `opportunity_id` is written
    by `linkGig` and the nightly backfill and read by nothing but the landing
    page's catalog query. There is no matcher, and nothing creates a row on an
    artist's side from a catalog entry.

### Weighing

13. **Nothing scores, and the queue orders by urgency alone.** The Overview and
    Review orders come from `FLAG_WEIGHT` in `shared/reviewQueue.ts` — a reply
    owed, a deadline, a conflict. `genre_fit_score` is NULL on every production
    row and the agent tool cannot set it; the deck's "Fit" cell is empty. In
    `gig-pipeline-plan.md`, step F is "half built — the cost side is in" and
    step G is unbuilt.
14. **The survey has produced no data and nothing consumes it.** It is built
    and closed. By your account the read-through and the privacy read are done
    and the spam check is the last piece before you press Open — that is
    outside the repository and I have not seen it. Its own record says "Wiring
    the weights into Scout … Nothing scores a gig with it yet." The analysis is
    computed on demand for the owner's panel; there is no stored result for
    anything to read, and no publication step.
15. **Most of what the survey measures has no input on a listing.** Its
    thirteen factors against what the catalog and a gig row carry:

    | Factor | Where its value would come from today |
    |---|---|
    | Pay | `stipend_amount`/`guarantee_amount` exist; agents cannot file them, set by hand |
    | Cost to apply | `fee_amount`, filed by agents |
    | Travel and stay | the cost model — Winnipeg-bound (gap 10) |
    | Time away | `nights`, performance dates; by hand |
    | Audience | `audience_size` — NULL on every row; no writer |
    | Fit to my music | `genre_fit_score` — NULL; no writer |
    | Application effort | none; the *number of form fields* is a measurable proxy once a form has been read |
    | Industry present, reputation, chance of selection, how organisers treat artists, set quality, new audiences | no field anywhere |

    A score built today would be weighted on about four factors and silent on
    nine. `shared/gigCost.ts` already holds the right rule — a missing input is
    named, never counted as zero — so the honest version is a partial score that
    says which factors it could not see.
16. **Decisions are not logged with what they were made against.** There is no
    decisions table. A gig's `status`, `outcome` and `flag` hold where it ended
    up, not when, not why, and not what the screen showed. §8 of the pipeline
    plan asks for the score *at decision time* to be stored so calibration is
    possible later; no stored decision means no calibration, and it cannot be
    recovered afterwards. This is the one gap where waiting costs data that
    cannot be regenerated, which is why it should start early even though
    nothing uses it yet.
17. **There is no individual's own weighting.** The survey is a population
    instrument. Nothing in the app lets an artist state *their* trade-offs, and
    the swing-weight questions in §7 were written for one person. The cheapest
    route is to offer an artist the survey's own ranking and comparison
    screens, signed in, with the result stored as theirs — one instrument
    instead of two, and the dollar-value method is already tested.

### Delivery

18. **An artist is never told.** The digest and the reply scan run for the
    owner only (`CLAUDE.md`, cron section), and the Settings digest card renders
    for every account although its switch returns 403 for artists. New matches
    would reach nobody. See Phase 4 of `onboarding-plan.md`.

## One design rule to settle before building

`gig-pipeline-plan.md` §8 says the model **orders the queue and never removes
anything from it**, because a ranker that hides what it scores low never
learns it was wrong. The model described above also says *narrower*. Both are
right if there are two kinds of criterion, kept apart:

- **Facts remove.** A call that has closed, is for residents of another
  province, or is on another continent for an artist who said "Canada only" is
  not a lower-ranked match; it is not a match. These are checks against stated
  hard limits and each exclusion is reported with its reason, like every other
  skipped list in this app.
- **Weights order.** Genre fit, pay, travel cost, audience, effort and the rest
  never remove anything. Weak matches sink and stay reachable, and a couple of
  low-scored ones are marked and shown on purpose (§8) so the ranker is
  checked against what the artist actually chooses.

## What I would build, in this order

1. **Start logging decisions.** One additive table, written from the PATCH
   route: tenant, the catalog entry (when linked), the action, the time, and a
   snapshot of what the screen showed — closing date, fee, cost range, flags,
   and the score once there is one. It costs almost nothing, nothing reads it
   yet, and every week without it is data that cannot be reconstructed
   (gap 16).
2. **Make the catalog first-class (gaps 1–5).** Migration for region, genres,
   eligibility, audience, pay and effort; a catalog-only agent route and tool
   so research no longer files into a tenant; research that reads all ten
   associations and tags rather than judges; refresh and recurrence handling.
   This is also where the cost question lives (below).
3. **Ask the missing questions and read the answers (gaps 8–9, 11).** Where,
   genre, then the hard limits; the library and association profile offered as
   *inferred* values, quoted and overridable. Fix gap 10 in the same step,
   since "where" is what it needs.
4. **The matcher and delivery (gaps 12, 18).** Facts remove with reasons;
   closing date orders; per-artist digest and bell event. This is Phases 2 and
   4 of `onboarding-plan.md`, and it works with no scoring at all.
5. **Scoring (gaps 13–15, 17).** Survey baseline when there is a survey,
   refined by the artist's own comparisons, with the shrinkage in §8, showing
   per-factor contributions and naming the factors it could not see. Needs
   responses, so it needs the survey open — which is yours to press once the
   spam check is set up — and then enough answers to say anything. Until then
   there is no baseline, and the honest version of step 4 is a list ordered by
   closing date.

Steps 1 and 3 are small and have no dependencies. Step 2 is the large one and
is what everything else leans on.

## What this does not change

- Applications are drafted and never sent.
- The catalog stays free of anything an artist decided or said.
- Nothing is inferred silently: an inferred value shows its source and can be
  overridden, and an absent input is reported rather than guessed.

## Questions that are yours

- **Research volume.** A broad sweep that reads ten associations and tags every
  entry is a bigger run than today's, on the Claude plan the routines already
  use. It may fit; I cannot measure it from here, and the forecasts in this
  project have been wrong before. I would build the catalog route and the
  prompt, run it once by hand, and read the actual cost before putting it on a
  schedule.
- **Who may publish.** With entries going into other people's lists, should a
  new agent-filed entry be deliverable at once, or only after you have looked
  at it (or after some days unhidden)? The first is how it works now. It is the
  difference between a catalog that is fast and one that is safe from a
  poisoned page, and it is your call.
