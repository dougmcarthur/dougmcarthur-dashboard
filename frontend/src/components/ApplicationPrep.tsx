import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ApplicationField, type ApplicationPrep as Prep } from '../api'

const INPUT =
  'w-full text-sm border border-line-strong rounded-md px-2.5 py-1.5 bg-surface focus:outline-none focus:border-brand transition'

const PREP_LABEL: Record<string, string> = {
  none: 'Not prepared',
  queued: 'Queued for prep',
  ready: 'Answers prepared',
  blocked: 'Needs manual work',
  failed: 'Prep failed',
}

const PREP_COLOR: Record<string, string> = {
  none: 'bg-surface-muted text-ink-muted',
  queued: 'bg-submitted-soft text-submitted',
  ready: 'bg-ready-soft text-ready',
  blocked: 'bg-pending-soft text-pending',
  failed: 'bg-danger-soft text-danger',
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-ready',
  medium: 'text-pending',
  low: 'text-ink-subtle',
}

const SHORT_TYPES = new Set(['text', 'email', 'url', 'number', 'date'])

function parseOptions(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === 'string') : []
  } catch {
    return []
  }
}

function FieldCard({
  field,
  onSave,
  onToggleApprove,
  onDelete,
  onSaveToLibrary,
  onUpdateLibrary,
  onDismissConflict,
  isSaving,
  libraryBusy,
  conflict,
}: {
  field: ApplicationField
  onSave: (answer: string) => void
  onToggleApprove: (approved: boolean) => void
  onDelete: () => void
  onSaveToLibrary: () => void
  onUpdateLibrary: () => void
  onDismissConflict: () => void
  isSaving: boolean
  libraryBusy: boolean
  conflict: boolean
}) {
  const stored = field.answer ?? field.draftAnswer ?? ''
  const [value, setValue] = useState(stored)
  const [dirty, setDirty] = useState(false)
  const options = parseOptions(field.options)
  const over = field.maxLength != null && value.length > field.maxLength
  const edited = field.answer != null

  // Keep in sync when a re-run replaces the draft and nothing local is pending.
  if (!dirty && value !== stored) setValue(stored)

  const commit = () => {
    if (!dirty) return
    setDirty(false)
    onSave(value)
  }

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        field.approved
          ? 'border-ready bg-ready-soft'
          : field.needsInput && !field.answer
            ? 'border-pending bg-pending-soft'
            : 'border-line bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {field.label}
            {field.required ? <span className="text-danger ml-0.5">*</span> : null}
          </p>
          <p className="text-xs text-ink-subtle mt-0.5">
            {field.fieldType}
            {field.maxLength ? ` · max ${field.maxLength}` : ''}
            {field.answerSource === 'library' && !edited ? (
              <span className="ml-2 text-library">↺ from your library</span>
            ) : field.confidence && !field.answer ? (
              <span className={`ml-2 ${CONFIDENCE_COLOR[field.confidence]}`}>
                {field.confidence} confidence
              </span>
            ) : null}
            {edited ? <span className="ml-2 text-ink-muted">edited by you</span> : null}
          </p>
          {field.helpText && <p className="text-xs text-ink-muted mt-1">{field.helpText}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(field.approved)}
              onChange={(e) => onToggleApprove(e.target.checked)}
              className="rounded border-line-strong"
            />
            Approved
          </label>
          {field.answerSource === 'manual' && field.fieldKey.startsWith('manual_') && (
            <button
              onClick={onDelete}
              title="Remove this field"
              className="w-6 h-6 flex items-center justify-center rounded text-ink-subtle hover:text-danger hover:bg-danger-soft transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="mt-2">
        {options.length > 0 ? (
          <select
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setDirty(true)
            }}
            onBlur={commit}
            className={INPUT}
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : field.fieldType === 'file' ? (
          <p className="text-xs text-ink-muted italic">
            File upload — attach on the day. Note below what you plan to send.
          </p>
        ) : SHORT_TYPES.has(field.fieldType) ? (
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setDirty(true)
            }}
            onBlur={commit}
            placeholder={field.needsInput ? 'Needs your input…' : ''}
            className={INPUT}
          />
        ) : (
          <textarea
            rows={Math.min(10, Math.max(3, Math.ceil(value.length / 90)))}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setDirty(true)
            }}
            onBlur={commit}
            placeholder={field.needsInput ? 'Needs your input…' : ''}
            className={`${INPUT} resize-y`}
          />
        )}
      </div>

      {/* The stored answer and this one have diverged — one of them should win. */}
      {field.libraryDrift && !dirty && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-library-soft border border-library px-2.5 py-1.5">
          <p className="text-xs text-library">
            This differs from your stored “{field.libraryLabel}” answer.
          </p>
          <button
            disabled={libraryBusy}
            onClick={onUpdateLibrary}
            className="text-xs px-2.5 py-1 rounded-md bg-library text-on-accent hover:brightness-95 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            Update library
          </button>
        </div>
      )}

      {conflict && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-pending-soft border border-pending px-2.5 py-1.5">
          <p className="text-xs text-pending">
            A different answer is already stored for this question.
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              disabled={libraryBusy}
              onClick={onUpdateLibrary}
              className="text-xs px-2.5 py-1 rounded-md bg-pending text-on-accent hover:brightness-95 disabled:opacity-40 transition-colors"
            >
              Replace it
            </button>
            <button
              onClick={onDismissConflict}
              className="text-xs px-2.5 py-1 rounded-md border border-pending text-pending hover:brightness-95 transition-colors"
            >
              Keep this one here
            </button>
          </div>
        </div>
      )}

      {field.harvestable && !field.libraryDrift && !conflict && !dirty && (
        <div className="mt-2 flex items-center justify-end">
          <button
            disabled={libraryBusy}
            onClick={onSaveToLibrary}
            className="text-xs px-2.5 py-1 rounded-md border border-library text-library hover:bg-library-soft disabled:opacity-40 transition-colors"
          >
            Save to library
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-ink-subtle">
          {field.note ? <span className="text-pending">{field.note}</span> : null}
        </p>
        <p className={`text-xs tabular-nums ${over ? 'text-danger font-medium' : 'text-ink-subtle'}`}>
          {isSaving ? 'Saving…' : dirty ? 'Unsaved' : ''}
          {field.maxLength ? ` ${value.length}/${field.maxLength}` : value.length ? ` ${value.length}` : ''}
        </p>
      </div>
    </div>
  )
}

function AddFieldForm({ onAdd, isAdding }: { onAdd: (label: string) => void; isAdding: boolean }) {
  const [label, setLabel] = useState('')
  return (
    <div className="flex gap-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Add a question the form asks…"
        className={INPUT}
      />
      <button
        disabled={!label.trim() || isAdding}
        onClick={() => {
          onAdd(label.trim())
          setLabel('')
        }}
        className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted disabled:opacity-40 transition-colors whitespace-nowrap"
      >
        Add field
      </button>
    </div>
  )
}

export function ApplicationPrep({ gigId }: { gigId: number }) {
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [conflictId, setConflictId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery<Prep>({
    queryKey: ['application', gigId],
    queryFn: () => api.applications.get(gigId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['application', gigId] })
    qc.invalidateQueries({ queryKey: ['gigs'] })
    qc.invalidateQueries({ queryKey: ['overview'] })
  }

  const prepare = useMutation({
    mutationFn: () => api.applications.prepare(gigId),
    onSuccess: invalidate,
  })

  const patchField = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number
      body: { answer?: string | null; approved?: boolean }
    }) => api.applications.patchField(id, body),
    onSettled: () => {
      setSavingId(null)
      invalidate()
    },
  })

  const addField = useMutation({
    mutationFn: (label: string) => api.applications.addField(gigId, { label }),
    onSuccess: invalidate,
  })

  const deleteField = useMutation({
    mutationFn: (id: number) => api.applications.deleteField(id),
    onSuccess: invalidate,
  })

  const approveAll = useMutation({
    mutationFn: () => api.applications.approveAll(gigId),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['library'] })
    },
  })

  // A stored answer is never replaced silently — a clash comes back here for a
  // decision: keep the library's version, or promote this one.
  const toLibrary = useMutation({
    mutationFn: ({ fieldId, overwrite }: { fieldId: number; overwrite?: boolean }) =>
      api.applications.saveToLibrary(fieldId, overwrite),
    onSuccess: (_data, variables) => {
      setConflictId((id) => (id === variables.fieldId ? null : id))
      invalidate()
      qc.invalidateQueries({ queryKey: ['library'] })
    },
    onError: (_err, variables) => setConflictId(variables.fieldId),
  })

  async function copyAll() {
    const { text } = await api.applications.exportText(gigId)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return <p className="text-xs text-ink-subtle">Loading prepared answers…</p>
  }
  if (error || !data) {
    return (
      <p className="text-xs text-danger">
        Couldn’t load the application — {(error as Error)?.message}
      </p>
    )
  }

  const { stats, fields, prepStatus } = data
  const readyCount = stats.total - stats.needsInput
  const waitingForWindow = data.windowState === 'upcoming'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              waitingForWindow && prepStatus === 'none'
                ? 'bg-scheduled-soft text-scheduled'
                : (PREP_COLOR[prepStatus] ?? PREP_COLOR.none)
            }`}
          >
            {waitingForWindow && prepStatus === 'none'
              ? 'Waiting for the window'
              : (PREP_LABEL[prepStatus] ?? prepStatus)}
          </span>
          {stats.total > 0 && (
            <span className="text-xs text-ink-muted">
              {stats.approved}/{stats.total} approved · {readyCount} drafted
              {stats.fromLibrary > 0 ? ` · ${stats.fromLibrary} reused` : ''}
              {stats.needsInput > 0 ? ` · ${stats.needsInput} need you` : ''}
            </span>
          )}
          {data.formTitle && (
            <span className="text-xs text-ink-subtle truncate max-w-xs">{data.formTitle}</span>
          )}
        </div>
        <div className="flex gap-2">
          {data.applicationUrl && (
            <a
              href={data.applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted transition-colors"
            >
              Open form ↗
            </a>
          )}
          {stats.total > 0 && (
            <>
              <button
                onClick={copyAll}
                className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted transition-colors"
              >
                {copied ? 'Copied' : 'Copy all'}
              </button>
              <button
                disabled={approveAll.isPending}
                onClick={() => approveAll.mutate()}
                className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-ink-muted hover:bg-surface-muted disabled:opacity-40 transition-colors"
              >
                Approve all drafted
              </button>
            </>
          )}
          <button
            disabled={prepare.isPending}
            onClick={() => prepare.mutate()}
            className={`text-xs px-3 py-1.5 rounded-md disabled:opacity-40 transition-colors ${
              waitingForWindow
                ? 'border border-line-strong text-ink-muted hover:bg-surface-muted'
                : 'bg-ink text-on-accent hover:opacity-90'
            }`}
          >
            {prepare.isPending
              ? 'Reading the form…'
              : waitingForWindow
                ? 'Try reading the form now'
                : stats.total > 0
                  ? 'Re-run prep'
                  : 'Prepare answers now'}
          </button>
        </div>
      </div>

      {waitingForWindow && (
        <div className="rounded-md bg-scheduled-soft border border-scheduled px-3 py-2 text-xs text-scheduled">
          Submissions open {data.submissionOpensAt ?? 'later'}. The form usually isn’t published
          until then, so your answers are prepared that morning — you’ll get an email once they’re
          ready to review. If you know the form is already live, read it now.
        </div>
      )}

      {data.prepError && (
        <div className="rounded-md bg-pending-soft border border-pending px-3 py-2 text-xs text-pending">
          {data.prepError}
          {data.loginRequired && (
            <span className="block mt-1 text-pending">
              Add the questions below by hand and the answers will be drafted the same way.
            </span>
          )}
        </div>
      )}

      {prepare.isSuccess && prepare.data.status === 'ready' && (
        <p className="text-xs text-ink-muted">
          {prepare.data.fieldCount} field{prepare.data.fieldCount === 1 ? '' : 's'} read
          {prepare.data.libraryHits > 0
            ? ` · ${prepare.data.libraryHits} answered from your library`
            : ''}
          {prepare.data.usedLlm ? ' · the rest drafted from your reference docs' : ''}
        </p>
      )}

      {prepare.isError && (
        <div className="rounded-md bg-danger-soft border border-danger px-3 py-2 text-xs text-danger">
          {(prepare.error as Error).message}
        </div>
      )}

      {fields.length === 0 ? (
        <p className="text-xs text-ink-muted">
          No fields yet. Run prep to read the form, or add the questions by hand.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field) => (
            <FieldCard
              key={field.id}
              field={field}
              isSaving={savingId === field.id && patchField.isPending}
              libraryBusy={toLibrary.isPending}
              onSave={(answer) => {
                setSavingId(field.id)
                patchField.mutate({ id: field.id, body: { answer } })
              }}
              onToggleApprove={(approved) =>
                patchField.mutate({ id: field.id, body: { approved } })
              }
              onDelete={() => deleteField.mutate(field.id)}
              onSaveToLibrary={() => toLibrary.mutate({ fieldId: field.id })}
              onUpdateLibrary={() => toLibrary.mutate({ fieldId: field.id, overwrite: true })}
              onDismissConflict={() => setConflictId(null)}
              conflict={conflictId === field.id}
            />
          ))}
        </div>
      )}

      <AddFieldForm onAdd={(label) => addField.mutate(label)} isAdding={addField.isPending} />
    </div>
  )
}
