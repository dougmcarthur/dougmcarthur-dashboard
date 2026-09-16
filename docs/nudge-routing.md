# Where a reminder goes

Scout can put a date in two places in a Google account, and until this release
it only had one. Everything went on a calendar: the day a submission window
opened, the day it closed, and the performance itself. That was wrong for two
of the three, and wrong in a way that got worse the more the app was used.

## The problem

A calendar entry is a claim that **you have to be somewhere**. Nothing happens
at 9am on an application deadline except that a form stops accepting
submissions — there is no room, no load-in and no drive. Putting that in a
diary beside a festival you are actually playing makes the two look alike,
which is the same confusion the `approved`/`shortlisted` rename exists to end
and the same one the original `🎵 {name}` entry caused: on a phone, a
submission deadline and a booked gig were indistinguishable.

It also has a shape problem. Some of what Scout knows is not a date at all. An
organiser has asked you something and you have not answered; an application
has been silent for seven weeks. Those want chasing, and a calendar has no way
to say "at some point, soon" — an all-day entry claiming a time is a lie about
a time.

## The split

By what the entry is a claim about:

| | goes to | because |
| --- | --- | --- |
| Confirmed shows | Calendar | You have to be there. It is the one thing a calendar is unambiguously for. |
| Application deadlines | Tasks | Work with a due date, which is what a task is. |
| Submission windows opening | Tasks | Same. |
| Replies you owe | Tasks | No date it happens on — only a date it is late by. |

`shared/nudgeRouting.ts` holds it, reads no clock and no database, and is where
the tests are. `src/lib/gigNudges.ts` reconciles the plan against what exists.

**The available destinations differ per kind, and that is typed rather than
left to a settings screen.** A show cannot become a task — ticking off a
festival you played is not a thing anybody wants — and a reply cannot become a
calendar entry. `NUDGE_KINDS[].choices` is the list, the PATCH route validates
against it, and the select reads it, so a screen cannot offer a combination the
writer refuses.

## A day's grace on a window opening

The task for "applications are open" is due `opens_at + 1`, not `opens_at`.

A form that was not accepting applications yesterday usually has no fields to
read until it is. So on the morning a window opens, the prep agent has not
scraped it yet and `ApplicationPanel` has nothing staged — a task due that
morning sends you to an empty panel, which is worse than no task. A day later
the overnight run has been and there is something to work from.

It is a preference (`openingLeadDays`, 0–14) rather than a constant because the
agents' cadence lives outside this repo: a deployment running them hourly wants
zero.

## The daily reconcile

Four of the five nudges follow from a column somebody changes, so reconciling
on `PATCH /api/gigs/:id` catches them. **The reply nudge does not.** An
application crosses `NO_REPLY_DAYS` because time passed, and nothing writes to
the row on the day it does — waiting for an edit to notice silence is waiting
for the thing silence is the absence of.

So `reconcileAllGigs` runs on the daily housekeeping tick, per tenant. It also
catches the two other ways the plan goes stale with no edit: connecting Tasks
for the first time, and changing where a kind of reminder goes.

It is idempotent — wanted-against-present, like the reconcile it grew out of —
so running it every night is cheap.

## Google Tasks, and the scope that has no narrow version

Google offers `tasks.readonly`, which cannot write, and `tasks`, which is read
and write over **every list in the account**. There is no `tasks.app.created`.

So this is the `gmail.compose` trade rather than the `calendar.app.created`
one. The limit stops being enforced by Google and starts being enforced by
`src/lib/googleTasks.ts`: Scout makes one list, stores its id on the grant, and
every call takes that id as an argument. Nothing enumerates lists and nothing
reads a task Scout did not write. The Integrations row says so in as many
words, and `test/integrations.test.ts` fails if that disclosure disappears.

**A task you ticked off is left ticked.** A completed task still exists in
Google, so `readTaskOn` can tell "done" from "deleted" — re-dating a chore
somebody just finished is the most annoying bug this could have had.

## Writing to your own calendar

Off by default, and off entirely unless the deployment sets
`PRIMARY_CALENDAR_OPT_IN=true`.

The narrowest scope that can reach a primary calendar is
`calendar.events.owned`: read **and** write over every event on every calendar
the artist owns. There is no "add an entry to primary" permission. That is the
exact inverse of the Scout-calendar grant, where `calendar.app.created` lets
Google enforce the limit structurally.

Worth being plain about the trade, because it is not a good one and the default
is right:

- Under the split above, the calendar now carries **only confirmed shows** — a
  handful of all-day entries a year.
- A secondary calendar is not a separate app. It appears in the same grid, the
  same mobile app and the same notifications, and counts toward free/busy while
  it is ticked. The real gap is that it can be un-ticked, and that some tools
  that read "primary" only will not see it.
- Declaring the scope on the OAuth client puts it in front of Google's
  verification review for **every** user of the deployment, including everybody
  who never opts in. That is why it is gated on a deployment variable rather
  than merely defaulted off: a deployment that has not done that work should
  not show a Connect button that ends at a Google error page.

Three things keep it from being a quiet widening:

1. **Its own grant purpose** (`calendar.primary`), so the narrow grant is
   untouched and either can be revoked without the other.
2. **Its own consent screen**, naming the scope. Choosing it is an explicit act.
3. **Nothing in its `cannot` list**, because there is no guarantee to make.
   Inventing a reassuring line would be exactly what the Gmail row warns
   against — a permission that protects less than the reader assumes.

`calendarTarget` prefers it where it exists, because choosing it is deliberate
and the artist meant it. Disconnecting leaves the entries where they are:
removing them would mean reaching into a calendar the artist has just said
Scout may no longer touch.

## What this does not do

There is no "mirror" mode — one entry written to both the Scout calendar and
the artist's own. A mirror is two rows that can disagree, and the id columns
would have to hold both. It is a destination, not a copy.
