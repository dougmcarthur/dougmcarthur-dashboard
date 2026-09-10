import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AdminArtist, type RemovalPreview } from '../api'
import { withConfirmation } from '../confirmIdentity'
import { Button } from '../components/ui/Button'
import { Disclosure } from '../components/ui/Disclosure'
import { relativeTime, shortDate } from '../format'

/**
 * The oversight surface: who is on the platform, and what their account costs.
 *
 * What is *not* here is the point. There is no way to open an artist's gigs,
 * no impersonation, no "act as". The server would refuse — this screen's
 * requests go to `/api/admin`, and an admin-mode session is refused everything
 * else — but the screen should not offer what the server would refuse either,
 * because a button that 403s is a promise the product already broke by
 * printing it.
 *
 * The numbers come from the daily rollup, which is written by the cron *as the
 * tenant* and emits a count. The owner reads the count; nothing here reads a
 * row. See src/lib/usage.ts.
 */
export function AdminPage() {
  const artists = useQuery({ queryKey: ['admin', 'artists'], queryFn: api.admin.artists })

  if (artists.isLoading) {
    return <div className="h-40 bg-sunken rounded-xl animate-pulse" />
  }

  if (artists.error) {
    return (
      <p className="text-sm text-danger-fg">
        {artists.error instanceof Error ? artists.error.message : 'Could not read the artist list.'}
      </p>
    )
  }

  const items = artists.data?.items ?? []

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ink tracking-tight">Artists</h1>
        <p className="text-sm text-muted">
          Everyone on the platform, how long they have been here, and how much they are
          storing. Nothing on this screen can open their work.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-muted">Nobody yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((artist) => (
            <ArtistRow key={artist.id} artist={artist} />
          ))}
        </ul>
      )}

      <p className="text-xs text-faint">
        Storage figures are sampled once a day by the overnight job, so a brand-new account
        shows nothing until tomorrow.
      </p>
    </div>
  )
}

function ArtistRow({ artist }: { artist: AdminArtist }) {
  return (
    <li className="rounded-xl border border-line bg-surface shadow-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {/* Null means nobody has said, which is different from blank. The
                row is still identifiable by its dates and its size. */}
            {artist.displayName ?? <span className="text-muted font-normal">Unnamed</span>}
            {artist.owner && (
              <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                You
              </span>
            )}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Here since {shortDate(artist.since)} · {relativeTime(artist.since)}
            {artist.accounts !== 1 && ` · ${artist.accounts} accounts`}
          </p>
        </div>
      </div>

      {artist.usage ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <Figure label="Rows stored" value={artist.usage.domainRows} />
          <Figure label="Gigs" value={artist.usage.gigRows} />
          <Figure label="Promo drafts" value={artist.usage.promoRows} />
          <Figure label="Agent runs that day" value={artist.usage.agentRuns} />
          <div className="text-faint">Sampled {shortDate(artist.usage.day)}</div>
        </dl>
      ) : (
        <p className="text-xs text-muted">Not sampled yet.</p>
      )}

      {/* The owner's own tenant is not removable here: deleting it would take
          the account holding this screen with it. The server refuses it too. */}
      {!artist.owner && <RemoveArtist artist={artist} />}
    </li>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink font-medium tabular-nums">{value.toLocaleString()}</dd>
    </div>
  )
}

/**
 * Removing an artist, behind the preview every bulk write here sits behind.
 *
 * The preview is a count per table — a size, never any content — and it is
 * worth having precisely because this is the one action that cannot be undone.
 * The server asks for the passkey as well, which `withConfirmation` answers.
 */
function RemoveArtist({ artist }: { artist: AdminArtist }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<RemovalPreview | null>(null)

  const load = useMutation({
    mutationFn: () => api.admin.removalPreview(artist.id),
    onSuccess: (data) => {
      setPreview(data)
      setError(null)
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not read the account.'),
  })

  const remove = useMutation({
    mutationFn: () => withConfirmation(() => api.admin.remove(artist.id)),
    onSuccess: () => {
      setOpen(false)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Could not remove this artist.'
      // A cancelled authenticator dialog is not an error worth printing — the
      // person changed their mind, which is the prompt working.
      setError(/NotAllowedError|abort|cancel/i.test(message) ? null : message)
    },
  })

  const name = artist.displayName ?? 'this artist'

  return (
    <div>
      <Disclosure
        teaser={`Remove ${name} and everything of theirs.`}
        hint="Permanent."
        openLabel="Remove…"
        title={`Remove ${name}`}
        subtitle="Everything of theirs is deleted. There is no undo and no archive."
        loading={load.isPending}
        error={error}
        open={open}
        onOpen={() => {
          setOpen(true)
          load.mutate()
        }}
        onClose={() => {
          setOpen(false)
          setError(null)
        }}
      >
        {preview && (
          <>
            <p className="text-sm text-body">
              {preview.total.toLocaleString()} {preview.total === 1 ? 'row' : 'rows'} and{' '}
              {preview.users} {preview.users === 1 ? 'sign-in' : 'sign-ins'} would be deleted.
            </p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
              {preview.rows.map((row) => (
                <li key={row.table} className="flex justify-between gap-2">
                  <span className="text-muted truncate">{tableLabel(row.table)}</span>
                  <span className="text-ink tabular-nums">{row.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="danger"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              {remove.isPending ? 'Removing…' : `Remove ${name} permanently`}
            </Button>
          </>
        )}
      </Disclosure>
    </div>
  )
}

/**
 * A table name, said out loud.
 *
 * Same rule `taskLabel` follows: screens name things and never print
 * identifiers, and `gig_correspondents` on a confirmation screen is a slug.
 * The set is closed here — unlike an agent's task id, these are this
 * repository's own tables — so anything unrecognised is humanised rather than
 * shown raw, which keeps a table added tomorrow from reading as a leak.
 */
const TABLE_LABELS: Record<string, string> = {
  gig_opportunities: 'Gigs',
  sync_targets: 'Sync targets',
  promo_drafts: 'Promo drafts',
  reference_docs: 'Reference documents',
  artist_assets: 'Artist database',
  application_fields: 'Application answers',
  gig_replies: 'Replies',
  gig_correspondents: 'Remembered senders',
  task_runs: 'Agent runs',
  reminders: 'Reminders',
  digest_reports: 'Digest history',
  notification_marks: 'Notification marks',
  notification_events: 'Notifications',
  google_grants: 'Google connections',
}

function tableLabel(name: string): string {
  if (TABLE_LABELS[name]) return TABLE_LABELS[name]
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
