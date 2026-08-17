import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ReferenceDoc } from '../api'

const INPUT_CLASS =
  'w-full text-sm border border-line-strong rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand transition'

// ── Integration status card ───────────────────────────────────────────────────

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? 'bg-ready-soft text-ready' : 'bg-pending-soft text-pending'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-ready' : 'bg-pending'}`} />
      {ok ? 'Connected' : 'Not configured'}
    </span>
  )
}

function IntegrationCards() {
  const { data, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    staleTime: 60_000,
  })

  if (isLoading) return <div className="h-24 bg-surface-muted rounded-lg animate-pulse" />

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Calendar */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink">Google Calendar</h3>
          <StatusPill ok={!!data?.calendarConfigured} />
        </div>
        {data?.calendarConfigured ? (
          <p className="text-xs text-ink-muted">Gig approvals create Calendar events automatically.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-ink-muted">Missing secrets:</p>
            <div className="flex flex-wrap gap-1">
              {data?.calendarMissingSecrets.map((s) => (
                <code key={s} className="text-xs bg-surface-muted text-ink-muted px-1.5 py-0.5 rounded font-mono">{s}</code>
              ))}
            </div>
            <p className="text-xs text-ink-subtle">
              See <code className="bg-surface-muted px-1 rounded">docs/google-calendar-setup.md</code>
            </p>
          </div>
        )}
      </div>

      {/* Gmail */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink">Gmail</h3>
          <StatusPill ok={!!data?.gmailConfigured} />
        </div>
        {data?.gmailConfigured ? (
          <p className="text-xs text-ink-muted">Sync page can reconcile pitch statuses from sent mail.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-ink-muted">Missing secrets:</p>
            <div className="flex flex-wrap gap-1">
              {data?.gmailMissingSecrets.map((s) => (
                <code key={s} className="text-xs bg-surface-muted text-ink-muted px-1.5 py-0.5 rounded font-mono">{s}</code>
              ))}
            </div>
            <p className="text-xs text-ink-subtle">
              See <code className="bg-surface-muted px-1 rounded">docs/gmail-setup.md</code>
            </p>
          </div>
        )}
      </div>

      {/* Reminder emails */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink">Reminder emails</h3>
          <StatusPill ok={!!data?.emailConfigured} />
        </div>
        {data?.emailConfigured ? (
          <p className="text-xs text-ink-muted">
            Submission-window and deadline reminders are emailed by the daily cron.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-ink-muted">
              Reminders stay pending in the dashboard. Missing secrets:
            </p>
            <div className="flex flex-wrap gap-1">
              {data?.emailMissingSecrets?.map((s) => (
                <code key={s} className="text-xs bg-surface-muted text-ink-muted px-1.5 py-0.5 rounded font-mono">{s}</code>
              ))}
            </div>
            <p className="text-xs text-ink-subtle">
              Needs the <code className="bg-surface-muted px-1 rounded">gmail.send</code> scope — see{' '}
              <code className="bg-surface-muted px-1 rounded">docs/gmail-setup.md</code>
            </p>
          </div>
        )}
      </div>

      {/* Answer drafting */}
      <div className="bg-surface border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink">Application answers</h3>
          <StatusPill ok={!!data?.answerDraftingConfigured} />
        </div>
        <p className="text-xs text-ink-muted">
          {data?.answerDraftingConfigured
            ? 'Application forms are read and answered from your reference docs before the window opens.'
            : 'Without ANTHROPIC_API_KEY, forms are still read but only name, email, links, genre and bio get filled in.'}
        </p>
      </div>
    </div>
  )
}

// kept for reference by the old import chain — replaced by IntegrationCards above
function CalendarStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    staleTime: 60_000,
  })

  return (
    <div className="bg-surface border border-line rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink">Google Calendar</h2>
        {!isLoading && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              data?.calendarConfigured
                ? 'bg-ready-soft text-ready'
                : 'bg-pending-soft text-pending'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                data?.calendarConfigured ? 'bg-ready' : 'bg-pending'
              }`}
            />
            {data?.calendarConfigured ? 'Connected' : 'Not configured'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="h-4 bg-surface-muted rounded animate-pulse w-48" />
      ) : data?.calendarConfigured ? (
        <p className="text-sm text-ink-muted">
          Approving gigs with deadlines will create Calendar events automatically.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            Set these Worker secrets to enable Calendar sync:
          </p>
          <div className="flex flex-wrap gap-2">
            {data?.calendarMissingSecrets.map((s) => (
              <code
                key={s}
                className="text-xs bg-surface-muted text-ink-muted px-2 py-1 rounded font-mono"
              >
                {s}
              </code>
            ))}
          </div>
          <p className="text-xs text-ink-subtle">
            See <code className="bg-surface-muted px-1 rounded">docs/google-calendar-setup.md</code> for
            the step-by-step setup.
          </p>
        </div>
      )}
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
      <div className="flex items-center justify-between px-4 py-3 bg-surface-muted border-b border-line">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-sm font-medium bg-surface border border-line-strong rounded px-2 py-1 focus:outline-none focus:ring-2 focus:border-brand flex-1 mr-3"
            autoFocus
          />
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{doc.title}</p>
            <p className="text-xs text-ink-subtle font-mono">{doc.id}</p>
          </div>
        )}
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs px-3 py-1.5 rounded-md bg-ink text-on-accent hover:opacity-90 disabled:opacity-40 transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${doc.title}"?`)) onDelete(doc.id)
                }}
                disabled={isDeleting}
                className="w-7 h-7 flex items-center justify-center rounded text-ink-subtle hover:text-danger hover:bg-danger-soft disabled:opacity-40 transition-colors"
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
          className="w-full px-4 py-3 text-sm font-mono text-ink-muted leading-relaxed resize-y focus:outline-none"
        />
      ) : (
        <div className="px-4 py-3">
          <p className="text-sm text-ink-muted leading-relaxed whitespace-pre-wrap line-clamp-4">
            {doc.content}
          </p>
          {doc.content.split('\n').length > 4 && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-ink-subtle hover:text-ink-muted mt-1"
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
        className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <span className="w-6 h-6 rounded-full border-2 border-dashed border-line-strong flex items-center justify-center text-ink-subtle text-base leading-none">
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
          <label className="block text-xs font-medium text-ink-muted mb-1">
            ID <span className="font-normal text-ink-subtle">(slug, e.g. bio, press-kit)</span>
          </label>
          <input
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder="bio"
            className={INPUT_CLASS}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Artist Bio"
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-muted mb-1">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Paste or type the content here…"
          className={`${INPUT_CLASS} font-mono resize-y`}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => createMutation.mutate()}
          disabled={!id || !title || createMutation.isPending}
          className="text-xs px-3 py-1.5 rounded-md bg-ink text-on-accent hover:opacity-90 disabled:opacity-40 transition-colors"
        >
          Create
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const qc = useQueryClient()

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
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-xl font-semibold text-ink">Settings</h1>

      <IntegrationCards />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Reference Docs</h2>
          <p className="text-xs text-ink-subtle">
            Bio, press kit, pitch templates — text blocks the automation agent pulls from
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[120, 80, 100].map((w, i) => (
              <div key={i} className="border border-line rounded-lg p-4 space-y-2">
                <div className="h-4 bg-surface-muted rounded" style={{ width: w }} />
                <div className="h-3 bg-surface-muted rounded w-full" />
                <div className="h-3 bg-surface-muted rounded w-3/4" />
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
              <p className="text-sm text-ink-subtle">
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
