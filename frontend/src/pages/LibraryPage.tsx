import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type LibraryEntry, type LibraryResponse, type QuestionKindOption } from '../api'

const INPUT =
  'w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition'

const CATEGORY_LABEL: Record<string, string> = {
  identity: 'Identity',
  links: 'Links',
  story: 'Story',
  pitch: 'Pitch',
  logistics: 'Logistics',
}

const CATEGORY_ORDER = ['identity', 'links', 'story', 'pitch', 'logistics']

const CATEGORY_COLOR: Record<string, string> = {
  identity: 'bg-sky-50 text-sky-700',
  links: 'bg-violet-50 text-violet-700',
  story: 'bg-amber-50 text-amber-800',
  pitch: 'bg-rose-50 text-rose-700',
  logistics: 'bg-teal-50 text-teal-700',
}

function EntryCard({
  entry,
  onSave,
  onDelete,
  isSaving,
}: {
  entry: LibraryEntry
  onSave: (content: string) => void
  onDelete: () => void
  isSaving: boolean
}) {
  const [value, setValue] = useState(entry.content)
  const [editing, setEditing] = useState(false)
  const dirty = value !== entry.content

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {entry.label}
            {entry.maxLength ? (
              <span className="ml-2 text-xs font-normal text-gray-400">
                short version · up to {entry.maxLength} chars
              </span>
            ) : null}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {entry.usedBy.length > 0
              ? `On ${entry.usedBy.length} application${entry.usedBy.length === 1 ? '' : 's'}: ${entry.usedBy
                  .map((g) => g.gigName ?? `#${g.gigId}`)
                  .join(', ')}`
              : 'Not used yet'}
            {entry.usageCount > 0 ? ` · reused ${entry.usageCount}×` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 tabular-nums">{value.length}</span>
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            onClick={() => {
              if (confirm(`Remove the stored “${entry.label}” answer?`)) onDelete()
            }}
            title="Delete"
            className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            rows={Math.min(12, Math.max(3, Math.ceil(value.length / 90)))}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${INPUT} resize-y`}
          />
          <div className="flex gap-2">
            <button
              disabled={!dirty || isSaving}
              onClick={() => onSave(value)}
              className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            {dirty && (
              <button
                onClick={() => setValue(entry.content)}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Revert
              </button>
            )}
            {entry.usedBy.length > 0 && (
              <p className="text-xs text-gray-400 self-center">
                Editing changes future applications; answers already prepared keep their text.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">
          {entry.content}
        </p>
      )}

      {entry.notes && <p className="text-xs text-gray-400 mt-2">{entry.notes}</p>}
    </div>
  )
}

function AddEntryForm({
  kinds,
  onAdd,
  isAdding,
}: {
  kinds: QuestionKindOption[]
  onAdd: (body: { questionKey: string; content: string; maxLength: number | null }) => void
  isAdding: boolean
}) {
  const [questionKey, setQuestionKey] = useState('')
  const [content, setContent] = useState('')
  const [maxLength, setMaxLength] = useState('')
  const kind = kinds.find((k) => k.key === questionKey)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Add an answer</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Question</label>
          <select value={questionKey} onChange={(e) => setQuestionKey(e.target.value)} className={INPUT}>
            <option value="">Choose a question…</option>
            {CATEGORY_ORDER.map((cat) => (
              <optgroup key={cat} label={CATEGORY_LABEL[cat] ?? cat}>
                {kinds
                  .filter((k) => k.category === cat)
                  .map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        {kind?.lengthSensitive && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Written for a limit of
            </label>
            <input
              type="number"
              min="1"
              value={maxLength}
              onChange={(e) => setMaxLength(e.target.value)}
              placeholder="e.g. 250 — leave blank for the full-length version"
              className={INPUT}
            />
          </div>
        )}
      </div>
      <textarea
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="The answer to reuse…"
        className={`${INPUT} resize-y`}
      />
      <button
        disabled={!questionKey || !content.trim() || isAdding}
        onClick={() => {
          onAdd({
            questionKey,
            content: content.trim(),
            maxLength: maxLength ? parseInt(maxLength) : null,
          })
          setContent('')
          setMaxLength('')
        }}
        className="text-sm px-4 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
      >
        {isAdding ? 'Adding…' : 'Add to library'}
      </button>
    </div>
  )
}

export function LibraryPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery<LibraryResponse>({
    queryKey: ['library'],
    queryFn: api.library.list,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['library'] })

  const patch = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      api.library.patch(id, { content }),
    onSettled: () => {
      setSavingId(null)
      invalidate()
    },
  })

  const create = useMutation({
    mutationFn: api.library.create,
    onSuccess: () => {
      invalidate()
      setShowAdd(false)
    },
  })

  const remove = useMutation({
    mutationFn: api.library.delete,
    onSuccess: invalidate,
  })

  const seed = useMutation({
    mutationFn: api.library.seed,
    onSuccess: invalidate,
  })

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        Failed to load the answer library — {(error as Error).message}
      </div>
    )
  }

  const entries = data?.entries ?? []
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    entries: entries.filter((e) => e.category === cat),
  })).filter((g) => g.entries.length > 0)

  const totalUses = entries.reduce((sum, e) => sum + e.usageCount, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Answer Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Answers you’ve approved, reused automatically the next time a form asks the same
            question.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={seed.isPending}
            onClick={() => seed.mutate()}
            className="text-sm px-3.5 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {seed.isPending ? 'Seeding…' : 'Seed from reference docs'}
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className={`text-sm px-3.5 py-1.5 rounded-md font-medium transition-colors ${
              showAdd ? 'bg-gray-200 text-gray-700' : 'bg-gray-900 text-white hover:bg-gray-700'
            }`}
          >
            {showAdd ? 'Cancel' : '+ New answer'}
          </button>
        </div>
      </div>

      {seed.isSuccess && (
        <p className="text-xs text-gray-500">
          {seed.data.created > 0
            ? `Added ${seed.data.created} answer${seed.data.created === 1 ? '' : 's'} from your reference docs.`
            : 'Nothing new to add — the reference docs are already covered.'}
        </p>
      )}
      {seed.isError && (
        <p className="text-xs text-red-600">{(seed.error as Error).message}</p>
      )}

      {showAdd && data && (
        <AddEntryForm
          kinds={data.kinds}
          isAdding={create.isPending}
          onAdd={(body) => create.mutate(body)}
        />
      )}
      {create.isError && (
        <p className="text-xs text-red-600">{(create.error as Error).message}</p>
      )}

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-8 text-center">
          <p className="text-sm text-gray-500">Nothing stored yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Seed from your reference docs to start, or approve an answer on an application — every
            answer you approve is filed here automatically.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">
            {entries.length} answer{entries.length === 1 ? '' : 's'} · reused {totalUses} time
            {totalUses === 1 ? '' : 's'}
          </p>
          {byCategory.map((group) => (
            <div key={group.category}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 ${
                    CATEGORY_COLOR[group.category] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {CATEGORY_LABEL[group.category] ?? group.category}
                </span>
              </h2>
              <div className="space-y-2">
                {group.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    isSaving={savingId === entry.id && patch.isPending}
                    onSave={(content) => {
                      setSavingId(entry.id)
                      patch.mutate({ id: entry.id, content })
                    }}
                    onDelete={() => remove.mutate(entry.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
