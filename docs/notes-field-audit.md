# Notes-field audit

What is currently buried in the free-text note columns, what the Review screen
now pulls out of them, and what should become real columns.

Counts below were taken from production D1 (`dougmcarthur-music-hq`) while
building the Review screen. Re-run the queries at the bottom to refresh them.

---

## The short version

The research task runs write their findings as prose into two columns —
`gig_opportunities.fit_notes` and `sync_targets.notes` — and a lot of what
they write is structured data in disguise: entry-fee warnings, ready-to-paste
application field values, ready-to-send outreach copy, submission
requirements, deal terms, blockers waiting on Doug, and the dates a
submission window opens.

Migration `0001_add_structured_columns.sql` added columns for some of this.
**None of them were ever backfilled — every one is NULL in production:**

| Table | Column added in 0001 | Rows populated |
| --- | --- | --- |
| `gig_opportunities` | `organizer` | 0 / 34 |
| `gig_opportunities` | `submission_method` | 0 / 34 |
| `gig_opportunities` | `audience_size` | 0 / 34 |
| `gig_opportunities` | `genre_fit_score` | 0 / 34 |
| `gig_opportunities` | `fee_amount` | 0 / 34 |
| `gig_opportunities` | `fit_rationale` | 0 / 34 (all 34 still on legacy `fit_notes`) |
| `sync_targets` | `agency_type` | 0 / 22 |
| `sync_targets` | `contact_role` | 0 / 22 |
| `sync_targets` | `confirmation_method` | 0 / 22 |

So the UI columns that read those fields render `—` for every row, while the
same facts sit in the note a few pixels away. `scripts/backfill-structured-columns.js`
exists for exactly this and has evidently not been run against production.

Until it is, `frontend/src/lib/reviewParse.ts` parses at read time and the
Review screen renders each kind of fact in its own container. **That parser is
a stopgap and should be read as a specification for the backfill**, not as the
permanent home for this logic.

---

## What is buried, and where it surfaces now

### `gig_opportunities.fit_notes`

| Buried fact | Real example from production | Rows | Review container | Proposed column |
| --- | --- | --- | --- | --- |
| **Submission state** — whether anything was actually sent, independent of `status` | `Submission status: NOT submitted.` · `Submission status: NOT started, by design.` · `Application not filled — pending Doug's review.` | 14 | "How to submit" badge + queue flag | `submission_state TEXT` (`not_started`/`drafted`/`sent`) |
| **Drafted application field values** — a complete form payload, semicolon-delimited | `Drafted field values for Doug to copy in himself: Artist type: I am an artist; Contact Name: Doug McArthur; Pronouns: He/Him; Email: doug@dougmcarthur.net; …` | 5 | "Drafted application values" — label/value table, per-field and copy-all | `application_draft TEXT` holding JSON |
| **Drafted outreach message** — verbatim copy to send | `Drafted outreach message ready for Doug to send via Facebook Messenger: "Hi hi! I'm Doug McArthur, a Winnipeg singer-songwriter…"` | 1 | "Drafted message" — monospace block + copy button | `outreach_draft TEXT`, `outreach_channel TEXT` (mirrors `sync_targets.pitch_draft`) |
| **Blockers waiting on Doug** | `Contact Phone: needs Doug, not on file` · `live performance video left blank for Doug to pick` · `Equity/identity self-disclosure checkboxes intentionally left blank` · `requires setting up a real HomeDitty account (email + password), … best left to Doug` | 11 | "Blocked on you" panel + queue filter | `blocked_on TEXT` |
| **Paid-entry warnings** | `⚠️ FLAGGED — ENTRY FEE.` · `*** PAID — entry fee required ($25/song) — requires Doug's approval before submitting ***` · `⚠️ PAID APPLICATION — do not submit without Doug's review.` | 8 | "Flags & known issues" panel, red | already `paid`; add `requires_approval INTEGER` |
| **Fee amount and currency** — prose in the legacy `fee` column | `$35 (non-members) / $25 (members) — REQUIRED, non-refundable` · `$85 CAD first entry / $75 CAD each additional entry` · `$395 USD/year membership + application review fee` | 11 | "Cost to enter" panel (parsed amount + raw text) | backfill `fee_amount` / `fee_currency` |
| **Payout vs. cost** — same column, opposite meaning | `None to audition (paid performance fee if selected: $800 solo)` | 2 | "Cost to enter" → "Pays out" line | `payout_amount REAL` |
| **Window-opens dates** — distinct from the deadline | `NOTE: submissions not open as of July 2026 — check back in September 2026.` · `ACTION: Calendar reminder for Sept 1 to send EPK.` · `applications open October 1, 2026` | ~12 | "Timing" panel | `opens_at TEXT` (would let a reminder be scheduled) |
| **Submission channel + address** | `submit by emailing music@winnipegfolkfestival.ca` · `Send EPK to michelle@missionfolk.ca` · `Apply via Airtable: https://airtable.com/…` · `Contact: devinlat@gmail.com` | ~15 | "How to submit" — method chip, mailto links, link list | backfill `submission_method`; add `submission_contact TEXT`, `submission_url TEXT` |
| **Eligibility / requirements** | `acts with more than 3 full-length albums don't qualify` · `Submit up to 2 original songs as a solo voice + one instrument recording — no co-writes allowed` · `requires an MP3/AAC file, a lyric sheet, and the fee at submission` | ~14 | "How to submit" → Requirements | `requirements TEXT` |
| **Recommended tracks to enter** | `Recommend entering Magic and Lost Weekends as primary tracks` · `Song to submit: Magic or Lost Weekends` | ~10 | Track chips under "Why it fits" | `pitch_tracks TEXT` |
| **Location** | `Canmore, AB` · `Kerrville, TX` · `~100km / ~1.25hrs from Winnipeg` | ~25 | Subtitle line on the detail header | `city TEXT`, `region TEXT` |
| **Organizer** | `presented by Manitoba Music and 9 other provincial music industry associations` · `run in partnership with KIAC and Parks Canada` | ~20 | (not parsed — too ambiguous to do safely) | backfill `organizer` |
| **Stale relative urgency** baked into the text | `⚠️ URGENT — deadline is TOMORROW, July 16, 2026.` · `only 16 days away` | 2 | Recomputed live from the parsed deadline | none — derive, never store |

### `sync_targets.notes`

| Buried fact | Real example from production | Rows | Review container | Proposed column |
| --- | --- | --- | --- | --- |
| **Known issues with the stored draft** | `Known issue (flagged 2026-06-21): links in this Gmail draft are rewritten into Google's redirect format, baked into the stored draft body itself.` · `a genuine encoding defect … a stray control character where an "=" should be … Recommend Doug manually retype the links` | 3 | "Flags & known issues", red, with the flagged date as a badge | `draft_issue TEXT`, `draft_issue_at TEXT` |
| **Duplicate-row warning** | `IMPORTANT: a separate ThinkSync Music row already exists in this table (same contact inbox, pitching 'Lost Weekends')… Doug should pick one to actually send, not both.` | 1 | "Flags & known issues" + "Blocked on you" | a real uniqueness constraint on `contact_email`, or a `duplicate_of INTEGER` |
| **Submission requirements** | `They explicitly will not open attachments — streaming links only.` · `Requires subject line 'Film/TV Music Submission'` · `requests name, social handle, bio, and up to 3 tracks with 'Artist Submission' in the subject line` · `actual submission must go through their portal` | ~12 | "How to submit" → Requirements | `requirements TEXT`, backfill `submission_method` |
| **Deal terms** | `non-exclusive 3-year agreements; 50/50 split` · `70% to artist` · `Artists keep 75% per placement` · `no upfront cost, revenue split only on successful placement` · `accepts ~10% of submissions` | ~10 | "Deal terms" panel | `split_pct REAL`, `exclusivity TEXT`, `term TEXT` |
| **Contact provenance** | `Contact confirmed from site footer.` · `confirmed via Trillwood Media's '25 Sync Agencies You Can Submit To Today' guide` · `decoded from Cloudflare email protection on their contact page using standard XOR decryption` | 22 | "Source & provenance" panel | `contact_source TEXT`, `contact_verified_at TEXT` |
| **Research provenance** | `Researched live in chat on 2026-06-28, logged to D1 retroactively on 2026-06-29 during reconciliation with the dashboard system.` | 6 | "Source & provenance" panel | `researched_at TEXT` (`discovered_at` currently records the write, not the research) |
| **Agency profile** — HQ, founding, roster, placements | `LA-based label + sync/music supervision agency placing music in trailers, TV, film, games` · `founded by Lyle Hysen` · `placements include Yellowjackets, Sex Education, The Bear` | 22 | "Background" narrative panel | backfill `agency_type`; add `hq TEXT` |
| **Which track is being pitched** | `Strong fit for 'Magic' — their content creator and lifestyle brand focus maps directly onto the digital fatigue theme` · `good fit for 'Lost Weekends'` | ~12 | Track chips under "Background" | `pitch_track TEXT` |
| **Contact role**, stated in the name rather than the column | `Bank Robber Music — attn: Patrick Massaro` · `licenses@positionmusic.com handles synch quote requests specifically, submissions@ is the general pitch inbox` | ~4 | Contact chips in "How to submit" | backfill `contact_role` |

---

## Data-integrity findings

These are separate from the parsing work and want a decision, not a parser.

**1. The status vocabularies have drifted from the code.** No row anywhere
carries the status the app treats as "needs review":

| Table | Statuses in production | What the frontend union declares |
| --- | --- | --- |
| `gig_opportunities` | `approved` 22, `rejected` 6, `submitted` 6 | `pending_review` \| `approved` \| `rejected` \| `submitted` \| `archived` |
| `sync_targets` | `pitched` 18, `approved` 2, `rejected` 1, `sent` 1 | `draft_ready` \| `pitched` \| `confirmed` \| `declined` \| `archived` |
| `promo_drafts` | `approved` 9 | `draft` \| `approved` \| `published` |

Consequences: `sync_targets` carries three values (`approved`, `rejected`,
`sent`) that are not in `SyncStatus` at all, so `StatusBadge` falls through to
its grey default and the status filter dropdown can never select them. And
because `/api/overview` selects `pending_review` / `draft_ready` / `draft`,
**the Overview page's "Needs review" section matches zero rows and is
permanently empty** — which is the reason the Review screen builds its queue
from parsed signals instead of from `status`.

**2. Three gigs say two contradictory things at once.** Gigs 1, 2 and 10 have
`status = 'submitted'` while their notes say `Submission status: NOT
submitted` and go on to list the values someone still has to type in. Nothing
was submitted; the status is wrong. The Review screen surfaces this as a
top-priority `conflict` flag rather than trusting either side. Same shape,
different table: sync 18 is `status = 'sent'` while its note says submission
has to go through a portal that no one has used.

**3. 26 of 34 gig deadlines are not dates.** `deadline` is TEXT and holds
things like `None — rolling artist roster intake`, `Submission window:
September 1 – December 31, 2026`, `TBD — submit now via contact form`. Every
date-dependent feature silently degrades: the Overview "Deadlines in 14 days"
query is a string comparison that these rows can never satisfy, `daysUntil()`
returns `NaN` on them, and `PATCH /api/gigs` passes the raw string to Google
Calendar. Suggested fix: keep `deadline` as a real ISO date, add
`deadline_note TEXT` for the qualifier, and add `opens_at TEXT`.

> **Resolved and applied.** Migration 0003 adds both columns;
> `scripts/backfill-deadlines.ts` moves the values across, dry-run by default.
> Run against production 2026-08-26: 26 prose values in, **0 left**. 8 dates
> recovered (16 real dates total), 3 submission windows separated into
> `opens_at`, 25 original values preserved verbatim in `deadline_note`, 18 rows
> confirmed as genuinely undated. All 4 rows that came out overdue are
> `archived`, so none reach the queue.
>
> The dry run found two parser bugs that only these real values expose, both
> now fixed and covered by tests using the production strings verbatim:
> a past-tense date (`2026 deadline **was** October 17, 2025`) was being read as
> a live deadline, which would have opened the deck on a ten-month-overdue
> emergency that never existed; and a trailing `(applications open …)` clause
> was being treated as describing the date it followed rather than the one it
> introduces.
>
> **Two rows were then set by hand**, because the parser is deliberately
> conservative about dates a regex cannot read without guessing:
>
> - **#8 Edmonton Folk** — *"submission window typically opens October 1 and
>   runs through end of November 2026"*. Set `opens_at = 2026-10-01`,
>   `deadline = 2026-11-30`. Both are readings rather than guesses: the year
>   comes from "November 2026", and "end of November" is the 30th. Left as NULL
>   this row was invisible — permanently in the open-ended pile despite having
>   a real window.
> - **#25 Mission Folk** — the note says *"September 1, 2026 (submissions
>   open…)"*, so that date opens the window rather than closing it. Moved from
>   `deadline` to `opens_at`. This is the row the removed trailing-cue rule
>   would have caught; one hand-fix was cheaper than a regex that broke four
>   other rows.
>
> **#26 Salmon Arm was deliberately left NULL.** *"December 2026 (applications
> open…)"* names a month and no day, and picking the 1st would put an invented
> date in a column the UI renders as fact. It stays in the open-ended pile,
> which is where a row with no usable date belongs.
> `PATCH /api/gigs` now recovers a date before creating a Calendar event or a
> reminder and skips both when there is no date to be had — previously the raw
> prose went to Google verbatim and to `new Date()`, which scheduled reminders
> for `Invalid Date`.

**4. `type` is doing two jobs on some rows.** Most rows hold a clean value
(`festival`, `showcase`, `residency`), but several hold a sentence —
`House concert touring network (gig opportunity)`, `Paid live performance
curator pipeline, all genres, Canada-wide (gig opportunity)`. Those miss
`TYPE_COLORS` in `GigsPage` and render as grey chips, and they overflow the
Review queue's subtitle.

**5. No gig has ever synced to Calendar.** `google_event_id` is NULL on all 34
rows even though 22 are `approved`, several with real deadlines. Either the
Calendar secrets aren't set in production (check `GET /api/health`) or every
approval happened before that code landed. Worth confirming — the reminder
rows exist (8 pending), so the approval path itself has run.

**6. Two ThinkSync Music rows target the same inbox.** Flagged inside the note
of one of them. `sync_targets` has no uniqueness constraint on
`contact_email`, so nothing stops a research run from re-adding a target that
already exists.

---

---

## The backfill, and the step the plan got wrong

**Done, with one correction.** Migration 0016 adds `submission_state` and
`blocked_on`; `shared/noteColumns.ts` extracts them along with
`submission_method`, `fee_amount`, `fee_currency` (from 0001) and `location`
(from 0013); `POST /api/backfill/notes` applies the same extraction to the
rows that predate it, previewed by the `GET`.

### Step 5 cannot happen as written

> *5. Once backfilled, the Review screen reads columns and the parser is
> deleted.*

It cannot. The research agents that write these notes live **outside this
repo** and will keep writing prose. A backfill alone leaves every *future* row
with a filled note and empty columns — the same bug the audit is about, in the
opposite direction and harder to notice, because the table would look mostly
populated.

So extraction does not go away. What changes is **when**: `POST /api/gigs`,
`PATCH /api/gigs/:id` and `POST /api/sync` now derive the columns on the way
in, once, instead of every screen deriving them on the way out, forever. The
parser stays; it stops being something a screen depends on. That is the
achievable version of "deleted" and it is worth saying out loud, because the
version in the plan reads as reachable and is not.

### What did not become a column, and why

**Cached rendering is not a schema.** `requirements`, `dealTerms`,
`provenance`, the drafted field values and the drafted message are rendered
and nothing else. A JSON copy of them in a column would be a cache of the
parser wearing a schema's clothes — with a staleness failure the read-time
version cannot have, since a parser fix would silently stop reaching stored
rows. They stay derived. The test is whether you would ever *query* the
column; for these the answer is no.

**Four of 0001's nine columns cannot be backfilled at all.** `organizer` this
document already calls too ambiguous to do safely, and `audience_size`,
`genre_fit_score` and `agency_type` appear in no note in a form anything can
read. Filling those means entering them, not extracting them, and a backfill
that pretended otherwise would be inventing data. They stay NULL, honestly.

**`dm` is dropped.** The parser recognises it — one gig is booked through a
Facebook page — and `submission_method` has three values that the wire type
and the pickers agree on. A fourth would be a value the type says cannot
exist. The note still says it and the Review screen still reads it from there.

### The rule that makes it safe to re-run

`changesFor` writes only into a column that is empty. A value already there
stays, whatever the note now says — the same rule the application panel
follows about your writing, for the same reason: a value set by hand is a
decision, and an extractor re-run is not allowed to quietly undo one. It also
means the backfill is idempotent, which is what lets it sit behind a button
rather than behind a ceremony. `updated_at` is deliberately not touched:
filling a column from a note that already said so is not a change to the
row's facts, and moving it would wake every snooze in the table.

## Suggested order of work

1. Fix the status vocabularies (decide the canonical set, migrate the rows,
   update `SyncStatus`/`GigStatus`) — this unblocks the Overview page.
2. Resolve the three status/note conflicts by hand; they are real
   "did we actually send this?" questions, not data-cleaning.
3. ~~Split `deadline` into `deadline` (ISO) + `deadline_note` + `opens_at`.~~
   Done — migration 0003 and `scripts/backfill-deadlines.ts`.
4. ~~Add the columns in the tables above and backfill them, using
   `shared/reviewParse.ts` as the extraction spec.~~
   Done for the six that are worth storing — migration 0016,
   `shared/noteColumns.ts`, `POST /api/backfill/notes`. See above for what was
   left derived and why.
5. ~~Once backfilled, the Review screen reads columns and the parser is
   deleted.~~ **Not reachable as written** — see above. Extraction moved to
   write time instead. What is genuinely left: point the Review screen at the
   columns where a column now exists, so the parse stops running per render.

## Queries used

```sql
-- unpopulated structured columns
SELECT count(*) rows,
       sum(organizer IS NULL)          organizer_null,
       sum(submission_method IS NULL)  subm_null,
       sum(genre_fit_score IS NULL)    fit_null,
       sum(fee_amount IS NULL)         feeamt_null,
       sum(fit_rationale IS NULL)      rationale_null,
       sum(deadline IS NOT NULL
           AND deadline NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]') deadline_prose
FROM gig_opportunities;

-- status drift
SELECT 'gig' t, status, count(*) FROM gig_opportunities GROUP BY status
UNION ALL SELECT 'sync', status, count(*) FROM sync_targets GROUP BY status
UNION ALL SELECT 'promo', status, count(*) FROM promo_drafts GROUP BY status;

-- status/note conflicts
SELECT status, count(*), group_concat(id) FROM gig_opportunities
WHERE lower(fit_notes) LIKE '%not submitted%'
   OR lower(fit_notes) LIKE '%not sent%'
   OR lower(fit_notes) LIKE '%application not filled%'
GROUP BY status;
```
