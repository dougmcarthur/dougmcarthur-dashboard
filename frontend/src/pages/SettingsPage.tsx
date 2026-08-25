import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ReferenceDoc } from '../api'
import { DigestSettingsCard } from '../components/DigestSettingsCard'

const INPUT_CLASS =
  'w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition'

// ── Integration status card ───────────────────────────────────────────────────

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-yellow-500'}`} />
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

  if (isLoading) return <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Calendar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Google Calendar</h3>
          <StatusPill ok={!!data?.calendarConfigured} />
        </div>
        {data?.calendarConfigured ? (
          <p className="text-xs text-gray-500">Gig approvals create Calendar events automatically.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">Missing secrets:</p>
            <div className="flex flex-wrap gap-1">
              {data?.calendarMissingSecrets.map((s) => (
                <code key={s} className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">{s}</code>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              See <code className="bg-gray-100 px-1 rounded">docs/google-calendar-setup.md</code>
            </p>
          </div>
        )}
      </div>

      {/* Gmail */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900">Gmail</h3>
          <StatusPill ok={!!data?.gmailConfigured} />
        </div>
        {data?.gmailConfigured ? (
          <p className="text-xs text-gray-500">Sync page can reconcile pitch statuses from sent mail.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">Missing secrets:</p>
            <div className="flex flex-wrap gap-1">
              {data?.gmailMissingSecrets.map((s) => (
                <code key={s} className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">{s}</code>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              See <code className="bg-gray-100 px-1 rounded">docs/gmail-setup.md</code>
            </p>
          </div>
        )}
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
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Google Calendar</h2>
        {!isLoading && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              data?.calendarConfigured
                ? 'bg-green-50 text-green-700'
                : 'bg-yellow-50 text-yellow-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                data?.calendarConfigured ? 'bg-green-500' : 'bg-yellow-500'
              }`}
            />
            {data?.calendarConfigured ? 'Connected' : 'Not configured'}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="h-4 bg-gray-100 rounded animate-pulse w-48" />
      ) : data?.calendarConfigured ? (
        <p className="text-sm text-gray-500">
          Approving gigs with deadlines will create Calendar events automatically.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            Set these Worker secrets to enable Calendar sync:
          </p>
          <div className="flex flex-wrap gap-2">
            {data?.calendarMissingSecrets.map((s) => (
              <code
                key={s}
                className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono"
              >
                {s}
              </code>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            See <code className="bg-gray-100 px-1 rounded">docs/google-calendar-setup.md</code> for
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
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-sm font-medium bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-900 flex-1 mr-3"
            autoFocus
          />
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
            <p className="text-xs text-gray-400 font-mono">{doc.id}</p>
          </div>
        )}
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${doc.title}"?`)) onDelete(doc.id)
                }}
                disabled={isDeleting}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
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
          className="w-full px-4 py-3 text-sm font-mono text-gray-700 leading-relaxed resize-y focus:outline-none"
        />
      ) : (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-4">
            {doc.content}
          </p>
          {doc.content.split('\n').length > 4 && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-400 hover:text-gray-600 mt-1"
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
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <span className="w-6 h-6 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-base leading-none">
          +
        </span>
        Add reference doc
      </button>
    )
  }

  return (
    <div className="border border-gray-300 border-dashed rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            ID <span className="font-normal text-gray-400">(slug, e.g. bio, press-kit)</span>
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
          <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Artist Bio"
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Content</label>
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
          className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Create
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
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
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      <IntegrationCards />

      <DigestSettingsCard />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Reference Docs</h2>
          <p className="text-xs text-gray-400">
            Bio, press kit, pitch templates — text blocks the automation agent pulls from
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[120, 80, 100].map((w, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-2">
                <div className="h-4 bg-gray-100 rounded" style={{ width: w }} />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
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
              <p className="text-sm text-gray-400">
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
