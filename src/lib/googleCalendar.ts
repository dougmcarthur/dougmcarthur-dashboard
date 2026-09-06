// Google Calendar API helper for Cloudflare Workers.
// Uses a stored refresh token (Workers secret) to get short-lived access tokens,
// then calls the Calendar REST API directly — no SDK needed in a Worker.
//
// Required secrets (set via `wrangler secret put`):
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REFRESH_TOKEN   ← obtained once via OAuth consent, then stored permanently
//   GOOGLE_CALENDAR_ID     ← e.g. "primary" or a specific calendar ID

export interface CalendarEnv {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REFRESH_TOKEN: string
  GOOGLE_CALENDAR_ID: string
}

async function getAccessToken(env: CalendarEnv): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google token refresh failed: ${body}`)
  }
  const json = await res.json<{ access_token: string }>()
  return json.access_token
}

export interface CalendarEventInput {
  summary: string
  description?: string
  date: string // ISO date string YYYY-MM-DD
  /**
   * Exclusive end for a multi-day entry, as Google wants it: a festival on the
   * 10th to the 12th passes 2027-07-13. Omit for a single day.
   *
   * Single-day entries deliberately keep sending `end.date === start.date`,
   * which is what has been in production since the first calendar event and is
   * what Google renders as one day. That is not what the docs describe, so it
   * is left exactly as it is rather than "corrected" from here, where there is
   * no way to try it against the real API.
   */
  endDateExclusive?: string
  reminderMinutes?: number // default: 1 day before = 1440
}

export interface CalendarEvent {
  id: string
  htmlLink: string
}

export async function createCalendarEvent(
  env: CalendarEnv,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const token = await getAccessToken(env)
  const calId = encodeURIComponent(env.GOOGLE_CALENDAR_ID)

  const body = {
    summary: input.summary,
    description: input.description ?? '',
    start: { date: input.date },
    end: { date: input.endDateExclusive ?? input.date },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: input.reminderMinutes ?? 1440 },
        { method: 'email', minutes: input.reminderMinutes ?? 1440 },
      ],
    },
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Calendar event create failed: ${err}`)
  }

  return res.json<CalendarEvent>()
}

export async function updateCalendarEvent(
  env: CalendarEnv,
  eventId: string,
  input: Partial<CalendarEventInput>,
): Promise<void> {
  const token = await getAccessToken(env)
  const calId = encodeURIComponent(env.GOOGLE_CALENDAR_ID)

  const body: Record<string, unknown> = {}
  if (input.summary) body.summary = input.summary
  if (input.description !== undefined) body.description = input.description
  if (input.date) {
    body.start = { date: input.date }
    // Always sent alongside the start, so shortening a run from three nights to
    // one moves the end back instead of leaving the old span in place.
    body.end = { date: input.endDateExclusive ?? input.date }
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Calendar event update failed: ${err}`)
  }
}

export async function deleteCalendarEvent(
  env: CalendarEnv,
  eventId: string,
): Promise<void> {
  const token = await getAccessToken(env)
  const calId = encodeURIComponent(env.GOOGLE_CALENDAR_ID)

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  // 404 = already deleted, 204 = success — both are fine
  if (!res.ok && res.status !== 404) {
    const err = await res.text()
    throw new Error(`Calendar event delete failed: ${err}`)
  }
}

// Returns true if all required Google secrets are present.
// Lets the gig route degrade gracefully when secrets aren't configured yet.
export function calendarConfigured(env: Partial<CalendarEnv>): env is CalendarEnv {
  return !!(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REFRESH_TOKEN &&
    env.GOOGLE_CALENDAR_ID
  )
}
