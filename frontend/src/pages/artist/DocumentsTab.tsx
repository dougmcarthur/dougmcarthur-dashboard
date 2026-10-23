import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ReferenceDoc } from '../../api'
import { Button } from '../../components/ui/Button'
import { FIELD, Input, Textarea } from '../../components/ui/Field'
import { Label } from '../../components/ui/Surface'
import { slugFor } from '../../../../shared/slug'
import { useConfirm } from '../../components/ui/ConfirmModal'

/**
 * The documents that describe the artist: bio, one-sheet, style guide.
 *
 * They lived on Settings, which was the wrong page twice over. They are about
 * the artist rather than about the app, and the Library tab beside this one is
 * where "Read the documents" lifts their facts into the artist database — so
 * the source and the thing made from it now sit a tab apart instead of two
 * pages apart. The research agents read them too, as source material for
 * pitches.
 */
export function DocumentsTab() {
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

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[120, 80, 100].map((w, i) => (
          <div key={i} className="border border-line rounded-lg p-4 space-y-2">
            <div className="h-4 bg-sunken rounded" style={{ width: w }} />
            <div className="h-3 bg-sunken rounded w-full" />
            <div className="h-3 bg-sunken rounded w-3/4" />
          </div>
        ))}
      </div>
    )
  }

  return (
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
      {docs.length === 0 && (
        <p className="text-sm text-muted">
          No documents yet. A bio or a one-sheet here is what the library reads its facts from, and
          what the research agents draw on when they draft a pitch.
        </p>
      )}
      <NewDocForm existing={docs.map((d) => d.id)} />
    </div>
  )
}

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
  const { confirm, ConfirmDialog } = useConfirm()
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
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-sm font-medium flex-1 mr-3"
            autoFocus
          />
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{doc.title}</p>
          </div>
        )}
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                Save
              </Button>
              <Button variant="neutral" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="neutral" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete "${doc.title}"?`,
                    description: 'This reference document will be permanently deleted.',
                    destructive: true,
                  })
                  if (ok) onDelete(doc.id)
                }}
                disabled={isDeleting}
                className="text-muted hover:text-danger-fg"
                title="Delete"
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="border-0 rounded-none border-t border-line px-4 py-3 leading-relaxed"
        />
      ) : (
        <div className="px-4 py-3">
          <p className="text-sm text-body leading-relaxed whitespace-pre-wrap line-clamp-4">
            {doc.content}
          </p>
          {doc.content.split('\n').length > 4 && (
            <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-body mt-1">
              Show all →
            </button>
          )}
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}

function NewDocForm({ existing }: { existing: string[] }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const qc = useQueryClient()

  const createMutation = useMutation({
    mutationFn: () => api.referenceDocs.create({ id: slugFor(title, existing), title, content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referenceDocs'] })
      setTitle('')
      setContent('')
      setOpen(false)
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
        Add a document
      </button>
    )
  }

  return (
    <div className="border border-line-strong border-dashed rounded-lg p-4 space-y-3">
      <div>
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Artist bio"
          autoFocus
        />
      </div>
      <div>
        <Label>Content</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Paste or type the content here…"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => createMutation.mutate()} disabled={!title.trim() || createMutation.isPending}>
          Create
        </Button>
        <Button variant="neutral" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
