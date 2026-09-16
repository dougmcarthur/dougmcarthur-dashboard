import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ReferenceDoc, type CredentialHealth, type CredentialState } from '../api'
import { STATE_LABELS, STATE_NOTES, needsAttention } from '../../../shared/credentialHealth'
import { AppearanceSettings } from '../components/AppearanceSettings'
import { DigestSettingsCard } from '../components/DigestSettingsCard'
import { FIELD } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { NotesBackfillCard } from '../components/NotesBackfillCard'
import { PasskeysCard } from '../components/PasskeysCard'
import { AdminModeCard } from '../components/AdminModeCard'
import { ProfileCard } from '../components/ProfileCard'
import { useSession } from '../hooks/useSession'


// ── Integration status card ───────────────────────────────────────────────────

/**
 * A connection's state, not just whether somebody set a secret.
 *
 * The pill used to read "Connected" whenever the environment variables were
 * present, which a refresh token Google stopped accepting weeks ago satisfies
 * perfectly. The states come from `shared/credentialHealth.ts` so this screen
 * and the bell cannot disagree about what one means.
 */
function StatusPill({ state }: { state: CredentialState }) {
  const tone =
    state === 'working'
      ? 'bg-success-bg text-success-fg'
      : needsAttention(state)
        ? 'bg-warn-bg text-warn-fg'
        : 'bg-sunken text-muted'
  const dot =
    state === 'working' ? 'bg-success-solid' : needsAttention(state) ? 'bg-warn-fg' : 'bg-muted'

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${dot}`} />
      {STATE_LABELS[state]}
    </span>
  )
}

/**
 * "Checked 2 hours ago", or nothing at all.
 *
 * Relative rather than a timestamp because the useful question is whether the
 * answer is current, and nobody reads an ISO string to find that out.
 */
function checkedAgo(at: string | null, now: number): string | null {
  if (!at) return null
  const ms = now - Date.parse(at)
  if (Number.isNaN(ms)) return null
  const mins = Math.round(ms / 60_000)
  if (mins < 2) return 'Checked just now'
  if (mins < 60) return `Checked ${mins} minutes ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `Checked ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return `Checked ${days} ${days === 1 ? 'day' : 'days'} ago`
}

function IntegrationCard({
  title,
  health,
  missingSecrets,
  working,
  now,
}: {
  title: string
  health: CredentialHealth | undefined
  missingSecrets: string[] | undefined
  /** What this connection does for you when it is working. */
  working: string
  now: number
}) {
  const state = health?.state ?? 'unverified'
  const ago = checkedAgo(health?.checkedAt ?? null, now)

  return (
    <div className="bg-surface border border-line rounded-xl shadow-card p-4">
      {/*
        Stacked rather than title-left / pill-right. These cards sit in a
        narrow column, and "No longer accepted" beside a two-word title
        overflowed its row and collided with the heading — found by looking at
        it, which is the only way that class of fault is ever found. A column
        cannot overlap at any width.
      */}
      <div className="flex flex-col items-start gap-1.5 mb-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <StatusPill state={state} />
      </div>

      {state === 'unconfigured' ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">Missing secrets:</p>
          <div className="flex flex-wrap gap-1">
            {missingSecrets?.map((sec) => (
              <code key={sec} className="text-xs bg-sunken text-body px-1.5 py-0.5 rounded">{sec}</code>
            ))}
          </div>
          <p className="text-xs text-muted">Set these on the server, then reload.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">{state === 'working' ? working : STATE_NOTES[state]}</p>
          {/* Google's own words. A reading you cannot check is one you should not trust. */}
          {health?.detail && state !== 'working' ? (
            <p className="text-xs text-muted break-words">{health.detail}</p>
          ) : null}
          {ago ? (
            <p className="text-xs text-faint">
              {ago}
              {health?.stale ? ' — the daily check may not be running.' : ''}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function IntegrationCards() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    staleTime: 60_000,
  })

  const check = useMutation({
    mutationFn: api.checkCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health'] })
      // A credential that just came back rejected is a condition the bell
      // raises, so the feed is no longer accurate either.
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  if (isLoading) return <div className="h-24 bg-sunken rounded-lg animate-pulse" />

  const byId = new Map((data?.credentials ?? []).map((c) => [c.id, c]))
  // Rendered once per render rather than per card, so three cards cannot
  // disagree about what "now" is by a few milliseconds.
  const now = Date.now()

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <IntegrationCard
          title="Google Calendar"
          health={byId.get('calendar')}
          missingSecrets={data?.calendarMissingSecrets}
          working="Gig approvals create Calendar events automatically."
          now={now}
        />
        <IntegrationCard
          title="Gmail"
          health={byId.get('gmail')}
          missingSecrets={data?.gmailMissingSecrets}
          working="The mailbox is scanned for organiser replies, and the Sync page can reconcile pitches."
          now={now}
        />
        <IntegrationCard
          title="Email sending"
          health={byId.get('email')}
          missingSecrets={[]}
          working="The weekly digest and setup codes can be delivered."
          now={now}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="neutral" className="whitespace-nowrap" onClick={() => check.mutate()} disabled={check.isPending}>
          {check.isPending ? 'Checking…' : 'Check connections'}
        </Button>
        <p className="min-w-0 flex-1 text-xs text-faint">
          Asks Google whether each credential is still accepted. Runs once a day on its own.
        </p>
      </div>
      {check.isError ? (
        <p className="text-xs text-danger-fg">The check could not be run. That is about this request, not the credentials.</p>
      ) : null}
    </div>
  )
}

// ── Reference doc editor ─────────────────────────────────────────────────────

function DocEditor({
  doc,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  doc: ReferenceDoc
  onSave: (id: string, body: { title: string; content: string }) => void
  onDelete: (id: string) => void
  isSaving: boolean
  isDeleting: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const [content, setContent] = useState(doc.content)

  function handleSave() {
    onSave(doc.id, { title, content })
    setEditing(false)
  }

  function handleCancel() {
    setTitle(doc.title)
    setContent(doc.content)
    setEditing(false)
  }

  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-sunken border-b border-line">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-sm font-medium bg-surface border border-line-strong rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent flex-1 mr-3"
            autoFocus
          />
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{doc.title}</p>
            <p className="text-xs text-muted">{doc.id}</p>
          </div>
        )}
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <Button variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                
              >
                Save
              </Button>
              <Button variant="neutral"
                onClick={handleCancel}
                
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="neutral"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${doc.title}"?`)) onDelete(doc.id)
                }}
                disabled={isDeleting}
                className="w-7 h-7 flex items-center justify-center rounded text-faint hover:text-danger-fg hover:bg-danger-bg disabled:opacity-40 transition-colors"
                title="Delete"
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="w-full px-4 py-3 text-sm text-body leading-relaxed resize-y focus:outline-none"
        />
      ) : (
        <div className="px-4 py-3">
          <p className="text-sm text-body leading-relaxed whitespace-pre-wrap line-clamp-4">
            {doc.content}
          </p>
          {doc.content.split('\n').length > 4 && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-muted hover:text-body mt-1"
            >
              Show all →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── New doc form ─────────────────────────────────────────────────────────────

function NewDocForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const qc = useQueryClient()

  const createMutation = useMutation({
    mutationFn: () => api.referenceDocs.create({ id, title, content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referenceDocs'] })
      setId('')
      setTitle('')
      setContent('')
      setOpen(false)
      onCreated()
    },
  })

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors"
      >
        <span className="w-6 h-6 rounded-full border-2 border-dashed border-line-strong flex items-center justify-center text-muted text-base leading-none">
          +
        </span>
        Add reference doc
      </button>
    )
  }

  return (
    <div className="border border-line-strong border-dashed rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            ID <span className="font-normal text-muted">(slug, e.g. bio, press-kit)</span>
          </label>
          <input
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder="bio"
            className={FIELD}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Artist Bio"
            className={FIELD}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted mb-1">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Paste or type the content here…"
          className={`${FIELD} resize-y`}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary"
          onClick={() => createMutation.mutate()}
          disabled={!id || !title || createMutation.isPending}
        >
          Create
        </Button>
        <Button variant="neutral"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const qc = useQueryClient()
  const session = useSession()

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['referenceDocs'],
    queryFn: api.referenceDocs.list,
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { title: string; content: string } }) =>
      api.referenceDocs.patch(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referenceDocs'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.referenceDocs.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['referenceDocs'] }),
  })

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-ink tracking-tight">Settings</h1>

      {/* Two columns once there is room for two. Settings is a page of
          independent panels rather than a document, so a single reading column
          pinned to the left just banks empty pixels on a wide display. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className="space-y-8 min-w-0">
          <ProfileCard />
          <AppearanceSettings />
          <PasskeysCard />
          {/* Owners only — and the route says the same thing again, because a
              card that is merely not rendered is still a URL. */}
          {session?.role === 'owner' && <AdminModeCard />}
        </div>
        <div className="space-y-8 min-w-0">
          <IntegrationCards />
          <DigestSettingsCard />
        </div>
      </div>

      <div className="space-y-3 max-w-4xl">
        <h2 className="text-sm font-semibold text-ink">Data</h2>
        <NotesBackfillCard />
      </div>

      <div className="space-y-3 max-w-4xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Reference Docs</h2>
          <p className="text-xs text-muted">
            Bio, press kit, pitch templates — text blocks the automation agent pulls from
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[120, 80, 100].map((w, i) => (
              <div key={i} className="border border-line rounded-lg p-4 space-y-2">
                <div className="h-4 bg-sunken rounded" style={{ width: w }} />
                <div className="h-3 bg-sunken rounded w-full" />
                <div className="h-3 bg-sunken rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <DocEditor
                key={doc.id}
                doc={doc}
                onSave={(id, body) => patchMutation.mutate({ id, body })}
                onDelete={(id) => deleteMutation.mutate(id)}
                isSaving={patchMutation.isPending}
                isDeleting={deleteMutation.isPending}
              />
            ))}
            {docs.length === 0 && !isLoading && (
              <p className="text-sm text-muted">
                No reference docs yet. Add one below — the automation agent uses these as source
                material when drafting pitches.
              </p>
            )}
            <NewDocForm onCreated={() => {}} />
          </div>
        )}
      </div>
    </div>
  )
}
