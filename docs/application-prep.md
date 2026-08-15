# Submission windows & application prep

How a festival or showcase goes from "worth applying to" to "answers ready and
waiting" — and what the system does on its own along the way.

## The flow

1. **Approve.** If the gig has a **submissions open** date in the future, the
   approval lands on status `awaiting_window` instead of `approved`. The gig is
   filed for submission later rather than sitting in the active queue.
   If the window is already open (or unknown), it behaves exactly as before.

2. **Reminders are scheduled** at approval time (`src/lib/submissionWindow.ts`):

   | Reminder | When |
   | --- | --- |
   | `window_soon` | 7 days before the window opens |
   | `window_opens` | the day the window opens |
   | `pre_deadline` | 7 days before the deadline (or on the day, if closer) |

   Dates already in the past are dropped. Marking a gig submitted, rejected, or
   archived dismisses whatever is still pending.

3. **Answers are prepared ahead of the reminder.** Up to 21 days before the
   window opens, the daily cron fetches the application form, splits it into its
   real fields, and drafts an answer for each one. Nothing is submitted — the
   drafts sit in the dashboard for review.

4. **The reminder email lands** with the prep status in the body ("12 fields
   drafted, 10 ready to review, 2 still need you") and a link straight to the
   gig: `https://dashboard.dougmcarthur.net/#gigs/<id>`.

5. **Review and edit** each field in the gig's expanded row. Edited answers
   always win over the drafted ones and are never overwritten by a re-run.
   Approve fields individually or with **Approve all drafted**; **Copy all**
   puts every question and answer on the clipboard for pasting into a portal.

6. **When the window opens**, the cron flips `awaiting_window` → `approved`, and
   the gig shows up in the normal deadline views.

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

1. Open windows that have arrived.
2. Prepare up to 3 upcoming applications (retrying failures after 3 days).
3. Send every due reminder email once, recording `sent_at` so it never repeats.

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
| `POST /api/tasks/run` | Run the cron work on demand |

## Configuration

| Secret | Effect if missing |
| --- | --- |
| `ANTHROPIC_API_KEY` | Drafting falls back to profile matching |
| `GMAIL_SEND_REFRESH_TOKEN` (or a `GMAIL_REFRESH_TOKEN` with send scope) | Reminders stay pending instead of emailing |
| `NOTIFY_EMAIL` | Same — there's nowhere to send |

`GET /api/health` reports all three.
