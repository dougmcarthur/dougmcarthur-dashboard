import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ApplicationField, type ApplicationPrep as Prep } from '../api'

const INPUT =
  'w-full text-sm border border-gray-300 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition'

const PREP_LABEL: Record<string, string> = {
  none: 'Not prepared',
  queued: 'Queued for prep',
  ready: 'Answers prepared',
  blocked: 'Needs manual work',
  failed: 'Prep failed',
}

const PREP_COLOR: Record<string, string> = {
  none: 'bg-gray-100 text-gray-600',
  queued: 'bg-blue-50 text-blue-700',
  ready: 'bg-green-50 text-green-700',
  blocked: 'bg-amber-50 text-amber-800',
  failed: 'bg-red-50 text-red-700',
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-green-600',
  medium: 'text-amber-600',
  low: 'text-gray-400',
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
  isSaving,
}: {
  field: ApplicationField
  onSave: (answer: string) => void
  onToggleApprove: (approved: boolean) => void
  onDelete: () => void
  isSaving: boolean
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
          ? 'border-green-200 bg-green-50/40'
          : field.needsInput && !field.answer
            ? 'border-amber-200 bg-amber-50/30'
            : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {field.label}
            {field.required ? <span className="text-red-500 ml-0.5">*</span> : null}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {field.fieldType}
            {field.maxLength ? ` · max ${field.maxLength}` : ''}
            {field.confidence && !field.answer ? (
              <span className={`ml-2 ${CONFIDENCE_COLOR[field.confidence]}`}>
                {field.confidence} confidence
              </span>
            ) : null}
            {edited ? <span className="ml-2 text-gray-500">edited by you</span> : null}
          </p>
          {field.helpText && <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(field.approved)}
              onChange={(e) => onToggleApprove(e.target.checked)}
              className="rounded border-gray-300"
            />
            Approved
          </label>
          {field.answerSource === 'manual' && field.fieldKey.startsWith('manual_') && (
            <button
              onClick={onDelete}
              title="Remove this field"
              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
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
          <p className="text-xs text-gray-500 italic">
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

      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-gray-400">
          {field.note ? <span className="text-amber-700">{field.note}</span> : null}
        </p>
        <p className={`text-xs tabular-nums ${over ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
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
        className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors whitespace-nowrap"
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
    onSuccess: invalidate,
  })

  async function copyAll() {
    const { text } = await api.applications.exportText(gigId)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return <p className="text-xs text-gray-400">Loading prepared answers…</p>
  }
  if (error || !data) {
    return (
      <p className="text-xs text-red-600">
        Couldn’t load the application — {(error as Error)?.message}
      </p>
    )
  }

  const { stats, fields, prepStatus } = data
  const readyCount = stats.total - stats.needsInput

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              PREP_COLOR[prepStatus] ?? PREP_COLOR.none
            }`}
          >
            {PREP_LABEL[prepStatus] ?? prepStatus}
          </span>
          {stats.total > 0 && (
            <span className="text-xs text-gray-500">
              {stats.approved}/{stats.total} approved · {readyCount} drafted
              {stats.needsInput > 0 ? ` · ${stats.needsInput} need you` : ''}
            </span>
          )}
          {data.formTitle && (
            <span className="text-xs text-gray-400 truncate max-w-xs">{data.formTitle}</span>
          )}
        </div>
        <div className="flex gap-2">
          {data.applicationUrl && (
            <a
              href={data.applicationUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Open form ↗
            </a>
          )}
          {stats.total > 0 && (
            <>
              <button
                onClick={copyAll}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {copied ? 'Copied' : 'Copy all'}
              </button>
              <button
                disabled={approveAll.isPending}
                onClick={() => approveAll.mutate()}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Approve all drafted
              </button>
            </>
          )}
          <button
            disabled={prepare.isPending}
            onClick={() => prepare.mutate()}
            className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            {prepare.isPending
              ? 'Reading the form…'
              : stats.total > 0
                ? 'Re-run prep'
                : 'Prepare answers now'}
          </button>
        </div>
      </div>

      {data.prepError && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          {data.prepError}
          {data.loginRequired && (
            <span className="block mt-1 text-amber-700">
              Add the questions below by hand and the answers will be drafted the same way.
            </span>
          )}
        </div>
      )}

      {prepare.isError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {(prepare.error as Error).message}
        </div>
      )}

      {fields.length === 0 ? (
        <p className="text-xs text-gray-500">
          No fields yet. Run prep to read the form, or add the questions by hand.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field) => (
            <FieldCard
              key={field.id}
              field={field}
              isSaving={savingId === field.id && patchField.isPending}
              onSave={(answer) => {
                setSavingId(field.id)
                patchField.mutate({ id: field.id, body: { answer } })
              }}
              onToggleApprove={(approved) =>
                patchField.mutate({ id: field.id, body: { approved } })
              }
              onDelete={() => deleteField.mutate(field.id)}
            />
          ))}
        </div>
      )}

      <AddFieldForm onAdd={(label) => addField.mutate(label)} isAdding={addField.isPending} />
    </div>
  )
}
