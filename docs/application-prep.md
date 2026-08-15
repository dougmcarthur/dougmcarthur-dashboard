# Submission windows & application prep

How a festival or showcase goes from "worth applying to" to "answers ready and
waiting" — and what the system does on its own along the way.

## The flow

**The form doesn't exist until the window opens.** Festivals publish the
application when submissions open — read the page in advance and you get "check
back in March", not the questions. So prep waits for the window, and the
notification waits for prep.

1. **Approve.** If the gig has a **submissions open** date in the future, the
   approval lands on status `awaiting_window` instead of `approved`: filed for
   submission later, out of the active queue, and nothing is fetched yet. If the
   window is already open (or no opening date is tracked), prep is queued
   immediately.

2. **A deadline nudge is scheduled** at approval time — 7 days before the
   deadline, or on the day if that's closer. That's the only reminder booked up
   front; the window email is raised later, by prep. Marking a gig submitted,
   rejected, or archived dismisses whatever is still pending.

3. **On the day the window opens**, one cron run does the whole chain:
   the gig flips `awaiting_window` → `approved`, its form is fetched and split
   into fields, each field gets a drafted answer, and — only once that has
   finished — the notification is raised and sent.

4. **The email lands with answers behind it**: *"Ready to review (2 need you) —
   Sawdust City Music Festival"*, saying how many fields were prepared, how many
   need you, and linking straight to the gig at
   `https://dashboard.dougmcarthur.net/#gigs/<id>`. If the form couldn't be read,
   you still get told the window opened, with the reason and what to do instead.
   One email per gig — `answers_notified_at` is the guard.

5. **Review and edit** each field in the gig's expanded row. Edited answers
   always win over the drafted ones and are never overwritten by a re-run.
   Approve fields individually or with **Approve all drafted**; **Copy all**
   puts every question and answer on the clipboard for pasting into a portal.
   Approving an answer files it in the answer library, so the next application
   that asks the same question starts from reviewed text — see below.

**Retries.** A transient fetch failure (timeout, 5xx, DNS) is retried the next
day, up to 3 attempts; only then does it count as finished and trigger the
email. A form that is read but unusable — login-gated, JavaScript-rendered, no
fields — is terminal immediately, since retrying changes nothing.

**Overriding.** The gig's panel keeps a **Try reading the form now** button for
when you know the form went up early. That's a manual read; the cron still
re-reads on the day the window opens, because a form fetched early is usually a
different page.

## Reading the form

`src/lib/formParser.ts` handles two shapes:

- **Server-rendered HTML** — `<input>`, `<textarea>`, `<select>`; labels resolved
  via `label[for]`, `aria-label`, or placeholder; radio/checkbox groups collapsed
  into one question with choices; `required`, `maxlength`, and help text kept.
  Hidden, CSRF, and submit inputs are skipped.
- **Google Forms** — parsed out of the `FB_PUBLIC_LOAD_DATA_` payload, so each
  question keeps its real `entry.NNN` key.

Three cases are reported rather than guessed at, and show up in the dashboard as
"needs manual work":

- **Login-gated** — a password field, sign-in copy, or a known portal host
  (Submittable, Sonicbids, SubmitHub, gigmit, Eventotron, FestivalNet…). Nothing
  is fetched behind an account.
- **JavaScript-rendered** — Typeform, Airtable, Tally, Fillout: the fields aren't
  in the page source.
- **No fields found** — applications not open yet, PDF forms, email-only submissions.

In all three cases you can add the questions by hand ("Add a field") and they're
treated like any other field from then on.

## The answer library

Every form asks the same two dozen questions in different words. The library
(`#library` in the dashboard) stores answers by **canonical question kind**, so
an answer approved on one application is reused on the next.

**How answers get in there:**

- **Seeding** — "Seed from reference docs" creates entries for the facts already
  in the artist brief and EPK: name, email, hometown, genre, links, press quote,
  and both a full and a short bio.
- **Approving** — approving a field files that answer under its question kind
  automatically. An existing entry is *never* overwritten silently; a difference
  comes back as a conflict on the field, with "Replace it" / "Keep this one here".
- **By hand** — add an entry on the library page, choosing the question it answers.

**How they come back out.** At prep time, before anything is drafted:

1. Each parsed field is classified (`src/lib/questionKinds.ts`) — "Name of the
   act", "Artist or band name", and "Band name" all resolve to `artist_name`.
2. The library is checked for that kind, picking the **fullest variant that fits**
   the field's character limit. Bios are stored per length, so a 250-character
   box gets the short version and an unlimited textarea gets the full one.
3. Fields answered from the library are marked "↺ from your library" and skipped
   by the drafting step entirely — that text has already been through review.
4. Everything else is drafted as usual, with the library included in the prompt so
   new answers match the established voice.

**Event-specific answers are adapted, never pasted.** Kinds marked
`reuse: 'adapt'` — "why this event", "what sets you apart" — name the festival
they were written for. Those are handed to the drafting step as source material
to retarget rather than reused verbatim; without an API key they're offered with
a "retarget the specifics before submitting" flag and counted as needing input.
Genuinely per-application answers ("how did you hear about us", availability) are
never stored at all.

**Drift.** If you edit an answer that came from the library, the field shows that
it differs from the stored version with an "Update library" action. Editing a
library entry changes future applications; answers already prepared keep their
text, and the entry lists which applications it's currently filling.

## Drafting the answers

`src/lib/answerEngine.ts` sends Claude (`claude-opus-5`) the reference docs — the
artist brief, EPK bio, and writing style guide — plus the gig context and the
field list, and asks for one answer per field with a confidence rating. The
prompt's rules:

- Facts come only from the reference docs; no invented venues, numbers, or press.
- Anything the docs can't answer (uploads, fees, specific dates) comes back empty
  and flagged **needs your input**, with a note saying what's needed.
- Answers respect the field: short boxes get a phrase, paragraph boxes get prose,
  select fields get one of the listed options verbatim, character limits are kept.

Without `ANTHROPIC_API_KEY` the same pipeline runs with deterministic profile
matching instead — name, email, links, genre, location, and the bio get filled in,
everything else is flagged for you. If the Claude call fails, prep falls back to
that rather than losing the parsed form.

## The daily cron

`wrangler.toml` runs `src/scheduled.ts` at 13:00 UTC (~08:00 Winnipeg):

1. Open the windows that have arrived, and queue their forms.
2. Read up to 5 forms and prepare answers — gigs you haven't been told about yet
   go first, then by deadline. Failed fetches are retried the next day, 3 times.
3. Raise the answers-ready email for anything that finished this run.
4. Send every due reminder once, recording `sent_at` so it never repeats.

The order is what makes the "open → prepare → notify" chain complete inside a
single run: a window that opens today is read, answered, and emailed today.

Each phase writes a `task_runs` row, visible on the Log page. `POST /api/tasks/run`
runs the same work on demand.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/gigs/:id/application` | Prepared fields + prep status + window state |
| `POST /api/gigs/:id/application/prepare` | Fetch, parse, and draft now |
| `GET /api/gigs/:id/application/export` | All questions and answers as text |
| `POST /api/gigs/:id/application/fields` | Add a question by hand |
| `PATCH /api/application-fields/:id` | Edit an answer / approve a field |
| `DELETE /api/application-fields/:id` | Remove a manually added field |
| `POST /api/application-fields/approve-all` | Approve everything that's drafted |
| `GET /api/answer-library` | Stored answers, plus the question kinds the classifier knows |
| `POST /api/answer-library` | Add an answer by hand |
| `PATCH /api/answer-library/:id` | Edit a stored answer |
| `DELETE /api/answer-library/:id` | Remove one (prepared fields keep their text) |
| `POST /api/answer-library/seed` | Bootstrap from the reference docs |
| `POST /api/answer-library/from-field` | File a prepared answer in the library (`overwrite` to replace) |
| `POST /api/tasks/run` | Run the cron work on demand |

## Configuration

| Secret | Effect if missing |
| --- | --- |
| `ANTHROPIC_API_KEY` | Drafting falls back to profile matching |
| `GMAIL_SEND_REFRESH_TOKEN` (or a `GMAIL_REFRESH_TOKEN` with send scope) | Reminders stay pending instead of emailing |
| `NOTIFY_EMAIL` | Same — there's nowhere to send |

`GET /api/health` reports all three.
