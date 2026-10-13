import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Weekday } from '../api'
import { relativeTime, shortDate } from '../format'
import { Explainer } from './ui/Explainer'
import { Banner, Card } from './ui/Surface'

const DAYS: Array<{ id: Weekday; label: string }> = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
]

/** Every hour, so "07:00" is reachable without a stepper. */
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/**
 * The digest's switch, its schedule, and a preview of exactly what would go
 * out right now.
 *
 * Every account has one, and it is off until its owner turns it on. An artist's
 * goes to the address they sign in with and is not editable here; the owner's
 * keeps its recipient. The time zone is the account's own: it is taken from this
 * device the first time the digest is switched on, because "Monday at 8" means
 * nothing without the zone it is in.
 *
 * The preview is the point. A weekly email is otherwise a thing you can only
 * evaluate weekly, and one you cannot check without either waiting or sending
 * yourself a real message. Previewing has no side effects — it does not write
 * the reporting marks — so looking at it twice cannot make the real send go
 * quiet.
 */
export function DigestSettingsCard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const preview = useQuery({ queryKey: ['digest', 'preview'], queryFn: api.digest.preview })

  const patch = useMutation({
    mutationFn: (body: Parameters<typeof api.digest.patch>[0]) => api.digest.patch(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['digest'] }),
  })

  const send = useMutation({
    mutationFn: () => api.digest.send(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['digest'] }),
  })

  const d = preview.data
  const settings = d?.settings
  // The device's own zone, which is what somebody means by "my morning".
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone || null
  const ownerView = settings?.recipientEditable ?? false

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <Explainer as="h2" title="Weekly digest">
          Only when something moved. Nothing is sent when there is nothing to say.
        </Explainer>
        <button
          onClick={() => {
            if (!settings) return
            // The first time it goes on, the zone is this device's rather than the
            // platform's, which is whoever set the deployment up.
            const takeZone = !settings.enabled && d && !d.schedule.zoneChosen && device
            patch.mutate({ enabled: !settings.enabled, ...(takeZone ? { timezone: device } : {}) })
          }}
          disabled={!settings || patch.isPending}
          className={`shrink-0 text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-40 ${
            settings?.enabled
              ? 'bg-success-solid text-accent-fg hover:brightness-110'
              : 'bg-surface border border-line-strong text-body hover:bg-sunken'
          }`}
        >
          {settings?.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {d && !d.mailerConfigured && (
        <Banner tone="warn" size="sm">
          {ownerView ? (
            <>
              No email binding on this deploy — add <code>[[send_email]]</code> to wrangler.toml.
              Everything below still previews.
            </>
          ) : (
            <>Email sending is not set up on this site yet. Everything below still previews.</>
          )}
        </Banner>
      )}

      {d?.schedule && (
        <div className="pt-2 border-t border-line space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs text-muted w-10 shrink-0">Day</span>
            <div role="radiogroup" aria-label="Send day" className="inline-flex flex-wrap gap-1">
              {DAYS.map((day) => {
                const active = d.schedule.day === day.id
                return (
                  <button
                    key={day.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ day: day.id })}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors disabled:opacity-40 ${
                      active
                        ? 'bg-accent border-transparent text-accent-fg'
                        : 'bg-surface border-line text-body hover:bg-sunken hover:text-ink'
                    }`}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor="digest-hour" className="text-xs text-muted w-10 shrink-0">
              Time
            </label>
            <select
              id="digest-hour"
              value={d.schedule.hour}
              disabled={patch.isPending}
              onChange={(e) => patch.mutate({ hour: Number(e.target.value) })}
              className="text-xs rounded-md border border-line bg-surface text-ink px-2 py-1 disabled:opacity-40"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            {/* The zone is what makes the hour mean anything, so it is stated
                rather than assumed. It is not editable here: there is one
                reader, in one place, and a zone picker would be a list of 400
                strings guarding against a move. */}
            <span className="text-xs text-muted">{d.schedule.timezone.replace('_', ' ')}</span>
            {device && device !== d.schedule.timezone && (
              <button
                type="button"
                disabled={patch.isPending}
                onClick={() => patch.mutate({ timezone: device })}
                className="text-xs px-2 py-1 rounded-md border border-line text-body hover:bg-sunken hover:text-ink transition-colors disabled:opacity-40"
              >
                Use {device.replace('_', ' ')}
              </button>
            )}
          </div>

          <p className="text-xs text-muted">
            {d.schedule.describes}
            {d.schedule.nextRun && settings?.enabled && (
              <> · next {shortDate(d.schedule.nextRun)}</>
            )}
            {d.schedule.lastSentAt && <> · last sent {relativeTime(d.schedule.lastSentAt)}</>}
          </p>
        </div>
      )}

      {settings && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">To</dt>
          <dd className="text-body">
            {settings.recipient || <span className="text-muted">No email address on your account</span>}
            {!ownerView && settings.recipient && (
              <span className="text-muted"> (the address you sign in with)</span>
            )}
          </dd>
          <dt className="text-muted">From</dt>
          <dd className="text-body">{settings.sender}</dd>
        </dl>
      )}

      {d && (
        <div className="pt-2 border-t border-line">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-body">
              {d.empty ? (
                <span className="text-muted">Nothing to report right now.</span>
              ) : (
                <>
                  Would say: <span className="font-medium text-ink">{d.subject}</span>
                  <span className="text-muted">
                    {' '}
                    · {d.groups.map((g) => `${g.lines.length} ${g.heading.toLowerCase()}`).join(', ')}
                  </span>
                </>
              )}
            </p>
            <div className="flex gap-1.5 shrink-0">
              {!d.empty && (
                <button
                  onClick={() => setOpen((o) => !o)}
                  className="text-xs px-2.5 py-1 rounded-md border border-line text-body hover:bg-sunken transition-colors"
                >
                  {open ? 'Hide' : 'Preview'}
                </button>
              )}
              <button
                onClick={() => send.mutate()}
                disabled={d.empty || !d.mailerConfigured || send.isPending}
                className="text-xs px-2.5 py-1 rounded-md bg-accent text-accent-fg disabled:opacity-30 transition-colors"
              >
                {send.isPending ? 'Sending…' : 'Send now'}
              </button>
            </div>
          </div>

          {open && (
            <div className="mt-3 space-y-3">
              {d.groups.map((g) => (
                <div key={g.id}>
                  <p className="text-xs font-medium text-muted mb-1">{g.heading}</p>
                  <ul className="space-y-1.5">
                    {g.lines.map((l) => (
                      <li key={l.key} className="text-xs">
                        <span className="font-medium text-ink">{l.title}</span>
                        <span className="block text-muted leading-relaxed">{l.rationale}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {send.isSuccess && (
            <p className="mt-2 text-xs text-success-fg">
              {send.data.sent ? `Sent to ${send.data.to}.` : `Not sent — ${send.data.reason}.`}
            </p>
          )}
          {send.isError && (
            <p className="mt-2 text-xs text-danger-fg">Send failed — {(send.error as Error).message}</p>
          )}
        </div>
      )}
    </Card>
  )
}
