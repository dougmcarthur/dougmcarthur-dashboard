import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import {
  DESTINATION_LABELS,
  MAX_OPENING_LEAD_DAYS,
  NUDGE_KINDS,
  type Destination,
  type NudgePreferences,
} from '../../../shared/nudgeRouting'
import { Select } from './ui/Field'

/**
 * What Scout puts where.
 *
 * The screen deliberately does not offer every destination for every kind: a
 * confirmed show cannot become a task and a reply you owe cannot become a
 * calendar entry. Those constraints live in `shared/nudgeRouting.ts` and are
 * read from there rather than restated, because the PATCH route validates
 * against the same list — a select offering a combination the route refuses is
 * a button that returns 400, which is the same class of bug as a status a
 * screen invented.
 *
 * Each row explains itself in one line. "Confirmed shows: Calendar" means
 * nothing on its own; the reason a show is a calendar entry and a deadline is
 * a task is the substance of this screen, not decoration on it.
 */

/**
 * The destinations something is routed to that are not connected — said once,
 * for the whole card.
 *
 * It was a line per row first, and on a fresh install that is the same
 * sentence four times, which reads as four problems rather than one. It is
 * one fact about the account, so it belongs above the rows, and a warning
 * repeated is a warning nobody finishes reading.
 */
function unreachable(
  prefs: NudgePreferences,
  connected: { tasks: boolean; calendar: boolean },
): string[] {
  const wanted = { tasks: false, calendar: false }
  for (const spec of NUDGE_KINDS) {
    const chosen = prefs[spec.id]
    if (chosen === 'tasks' || chosen === 'both') wanted.tasks = true
    if (chosen === 'calendar' || chosen === 'both') wanted.calendar = true
  }
  return [
    wanted.tasks && !connected.tasks ? 'Google Tasks' : '',
    wanted.calendar && !connected.calendar ? 'a calendar' : '',
  ].filter(Boolean)
}

export function NudgeRoutingCard() {
  const qc = useQueryClient()
  const prefs = useQuery({ queryKey: ['nudges'], queryFn: api.nudges.get })
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 })

  const patch = useMutation({
    mutationFn: (body: Partial<NudgePreferences>) => api.nudges.patch(body),
    onSuccess: (next) => qc.setQueryData(['nudges'], next),
  })

  if (prefs.isLoading) return <div className="h-64 bg-sunken rounded-xl animate-pulse" />
  const p = prefs.data
  if (!p) return null

  const connected = {
    tasks: Boolean(health.data?.tasksGrant?.connected && health.data.tasksGrant.canDraft),
    calendar: Boolean(
      (health.data?.calendarGrant?.connected && health.data.calendarGrant.canDraft) ||
        (health.data?.primaryCalendarGrant?.connected && health.data.primaryCalendarGrant.canDraft) ||
        health.data?.calendarConfigured,
    ),
  }

  const missing = unreachable(p, connected)

  return (
    <div className="rounded-xl border border-line bg-surface shadow-card p-4 space-y-3">
      <div className="border-b border-line pb-3">
        <h2 className="text-sm font-semibold text-ink">Where reminders go</h2>
        <p className="mt-0.5 text-xs text-muted">
          A calendar entry means you have to be somewhere. A task means there is work to do. Scout
          keeps those apart so a form you have not filled in never looks like a festival you are
          playing.
        </p>
      </div>

      {missing.length ? (
        <p className="rounded-md border border-warn-line bg-warn-bg/60 px-3 py-2 text-xs text-warn-fg">
          {missing.join(' and ')} {missing.length > 1 ? 'are' : 'is'} not connected, so anything sent
          there is written nowhere. Connect{' '}
          {missing.length > 1 ? 'them' : 'it'} above, or send those reminders somewhere else.
        </p>
      ) : null}

      <div className="divide-y divide-line">
        {NUDGE_KINDS.map((spec) => {
          const chosen = p[spec.id]
          return (
            <div key={spec.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-ink">{spec.label}</h3>
                <p className="text-xs text-muted">{spec.describes}</p>
              </div>
              <Select
                filter
                aria-label={`${spec.label} — where it goes`}
                value={chosen}
                disabled={patch.isPending}
                onChange={(e) =>
                  patch.mutate({ [spec.id]: e.target.value as Destination } as Partial<NudgePreferences>)
                }
                className="shrink-0"
              >
                {/* Only the choices this kind actually offers. The route
                    validates against the same list, so anything else here
                    would be a select that returns 400. */}
                {spec.choices.map((d) => (
                  <option key={d} value={d}>
                    {DESTINATION_LABELS[d]}
                  </option>
                ))}
              </Select>
            </div>
          )
        })}
      </div>

      {/*
        Stacked rather than laid out in a row. Side by side, the explanation
        was squeezed into a nine-line ribbon at phone width while the label
        sat alone above it — three columns' worth of content in one column's
        space. The reason is the substance here, so it gets the full width.
      */}
      <div className="space-y-1.5 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="opening-lead" className="text-xs text-muted">
            Start the application
          </label>
          <Select
            filter
            id="opening-lead"
            value={p.openingLeadDays}
            disabled={patch.isPending}
            onChange={(e) => patch.mutate({ openingLeadDays: Number(e.target.value) })}
          >
            {Array.from({ length: MAX_OPENING_LEAD_DAYS + 1 }, (_, d) => (
              <option key={d} value={d}>
                {d === 0 ? 'the day it opens' : d === 1 ? '1 day after it opens' : `${d} days after it opens`}
              </option>
            ))}
          </Select>
        </div>
        {/*
          The reason, because the default looks arbitrary without it. A form
          that was not accepting applications yesterday usually has no fields
          to read until it is, so a reminder on the morning it opens sends you
          to an application panel with nothing staged in it.
        */}
        <p className="text-xs text-faint">
          A day's grace, so the form has been read and your answers are staged by the time you open
          it. Set it to the day itself if you would rather look first.
        </p>
      </div>

      {patch.isError ? (
        <p className="text-xs text-danger-fg">
          That could not be saved — {(patch.error as Error).message}
        </p>
      ) : null}
    </div>
  )
}
