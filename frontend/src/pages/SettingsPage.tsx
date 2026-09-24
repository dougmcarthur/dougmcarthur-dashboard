import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ReferenceDoc } from '../api'
import { IntegrationsCard } from '../components/IntegrationsCard'
import { NudgeRoutingCard } from '../components/NudgeRoutingCard'
import { Explainer } from '../components/ui/Explainer'
import { AppearanceSettings } from '../components/AppearanceSettings'
import { DigestSettingsCard } from '../components/DigestSettingsCard'
import { FIELD } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { NotesBackfillCard } from '../components/NotesBackfillCard'
import { PasskeysCard } from '../components/PasskeysCard'
import { AgentTokensCard } from '../components/AgentTokensCard'
import { AdminModeCard } from '../components/AdminModeCard'
import { ProfileCard } from '../components/ProfileCard'
import { useSession } from '../hooks/useSession'
import { Label } from '../components/ui/Surface'


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
          <Label>
            ID <span className="font-normal text-muted">(slug, e.g. bio, press-kit)</span>
          </Label>
          <input
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            placeholder="bio"
            className={FIELD}
            autoFocus
          />
        </div>
        <div>
          <Label>Title</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Artist Bio"
            className={FIELD}
          />
        </div>
      </div>
      <div>
        <Label>Content</Label>
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
          {/* Under Passkeys: both answer who and what can get in. */}
          <AgentTokensCard />
          {/* Owners only — and the route says the same thing again, because a
              card that is merely not rendered is still a URL. */}
          {session?.role === 'owner' && <AdminModeCard />}
        </div>
        <div className="space-y-8 min-w-0">
          <IntegrationsCard />
          {/* Directly under Integrations: the two are one decision read top to
              bottom — what is connected, then what each connection is for. */}
          <NudgeRoutingCard />
          <DigestSettingsCard />
        </div>
      </div>

      <div className="space-y-3 max-w-4xl">
        <h2 className="text-sm font-semibold text-ink">Data</h2>
        <NotesBackfillCard />
      </div>

      <div className="space-y-3 max-w-4xl">
        <Explainer as="h2" title="Reference Docs">
          Bio, press kit, pitch templates — text blocks the automation agent pulls from.
        </Explainer>

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
