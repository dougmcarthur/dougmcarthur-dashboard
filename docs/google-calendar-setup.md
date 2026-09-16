# Connecting a calendar

**Open Settings and press *Connect with Google*.** That is the whole of it —
there is no key to obtain, nothing to paste, and no `wrangler secret put`.

Scout asks for one scope, `calendar.app.created`: *"make secondary Google
calendars, and see, create, change, and delete events."* On consent it creates
a calendar called **Sun Dogs Music Scout** in the artist's own account and
writes there. Under that scope it is the only calendar Scout can reach — it
cannot read the rest of the calendar, and cannot alter an event it did not
create, whatever the code does. That guarantee is Google's rather than this
repository's, which is the opposite of the trade the Gmail drafting grant had
to make.

Disconnecting forgets the grant and leaves the calendar alone. Deleting it
would take every event with it, and "disconnect" is not the same request as
"remove what you already told me".

## What lands in it

Three entries per gig, and only the last is a gig — see `src/lib/gigCalendar.ts`:

| entry | when | reminder |
| --- | --- | --- |
| Applications open — *name* | `opens_at`, while the row is still being decided | on the day |
| Apply by — *name* | the deadline, when it is a real date | a week ahead |
| *name* | the performance span, once it is booked | a day ahead |

A deadline that is prose rather than a date gets no entry, because
`splitDeadline` returns null rather than guessing. A half-filled or backwards
performance pair removes the entry rather than writing a nonsense one.

## The older path, which still works

Before the button, Calendar needed four Worker secrets — `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` and `GOOGLE_CALENDAR_ID` — with
the refresh token obtained by hand at a terminal. **They were never set in
production**, which is why every booked gig quietly created no event from the
day the feature shipped until the connect button existed.

That path is still read, so a deployment configured the old way keeps working.
A grant wins when one exists: `calendarTarget` in `src/lib/gigCalendar.ts`
prefers it and falls back to the secrets, the same "read both spellings" move
`normaliseGigStatus` makes for statuses.

Worth knowing if you ever set the secrets anyway: `GOOGLE_REFRESH_TOKEN` is a
different token from `GMAIL_REFRESH_TOKEN`, even though they share a client.

## What the deployment still needs

Connecting is offered only when the Worker has `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY` — the app's own OAuth client
and the key its refresh tokens are encrypted with. Those are already set,
because Gmail drafting uses the same three, and the card says so plainly when
they are missing rather than offering a button that cannot work.

**The redirect URI does not change.** Both purposes come back to
`/api/gmail/callback`, which is what is registered in the Google console, and
`state` carries which grant is being made (`src/lib/googleOAuth.ts`). Adding a
purpose therefore costs nothing anybody has to go and configure — which is the
point of the whole exercise.
