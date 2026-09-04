import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ReferenceDoc } from '../api'
import { AppearanceSettings } from '../components/AppearanceSettings'
import { DigestSettingsCard } from '../components/DigestSettingsCard'
import { FIELD } from '../components/ui/Field'
import { Button } from '../components/ui/Button'


// ── Integration status card ───────────────────────────────────────────────────

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? 'bg-success-bg text-success-fg' : 'bg-warn-bg text-warn-fg'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-success-solid' : 'bg-warn-fg'}`} />
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

  if (isLoading) return <div className="h-24 bg-sunken rounded-lg animate-pulse" />

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Calendar */}
      <div className="bg-surface border border-line rounded-xl shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink">Google Calendar</h3>
          <StatusPill ok={!!data?.calendarConfigured} />
        </div>
        {data?.calendarConfigured ? (
          <p className="text-xs text-muted">Gig approvals create Calendar events automatically.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-muted">Missing secrets:</p>
            <div className="flex flex-wrap gap-1">
              {data?.calendarMissingSecrets.map((s) => (
                <code key={s} className="text-xs bg-sunken text-body px-1.5 py-0.5 rounded">{s}</code>
              ))}
            </div>
            <p className="text-xs text-muted">
              See <code className="bg-sunken px-1 rounded">docs/google-calendar-setup.md</code>
            </p>
          </div>
        )}
      </div>

      {/* Gmail */}
      <div className="bg-surface border border-line rounded-xl shadow-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-ink">Gmail</h3>
          <StatusPill ok={!!data?.gmailConfigured} />
        </div>
        {data?.gmailConfigured ? (
          <p className="text-xs text-muted">Sync page can reconcile pitch statuses from sent mail.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-muted">Missing secrets:</p>
            <div className="flex flex-wrap gap-1">
              {data?.gmailMissingSecrets.map((s) => (
                <code key={s} className="text-xs bg-sunken text-body px-1.5 py-0.5 rounded">{s}</code>
              ))}
            </div>
            <p className="text-xs text-muted">
              See <code className="bg-sunken px-1 rounded">docs/gmail-setup.md</code>
            </p>
          </div>
        )}
      </div>
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
        <AppearanceSettings />
        <div className="space-y-8 min-w-0">
          <IntegrationCards />
          <DigestSettingsCard />
        </div>
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
