import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Application, type PreparedField, type ChecklistItem } from '../../api'
import { kindByKey } from '../../../../shared/questionKinds'
import { Button } from '../../components/ui/Button'
import { Input, Textarea, Select } from '../../components/ui/Field'

/**
 * Phase 3 on screen: the questions this application asks, and what the artist
 * database can answer them with.
 *
 * The panel is deliberately a *staging* surface and says so in several places.
 * Nothing on it sends anything — every answer is copied out by hand into
 * somebody else's form, because an application filed by automation is a good
 * way to be blacklisted. The buttons are Copy and Approve, never Submit.
 *
 * The distinction the layout is built around is between an answer the app
 * suggested and one you have read. They look different, they count
 * differently in the summary line, and a panel full of unread suggestions
 * reports itself as unfinished rather than as done.
 */

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="quiet"
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => {
            setDone(true)
            setTimeout(() => setDone(false), 1200)
          },
          () => setDone(false),
        )
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  )
}

const STATE_CHIP: Record<string, { text: string; className: string }> = {
  empty: { text: 'No answer', className: 'border-line text-faint' },
  // The one that matters: proposed by the app, unread by you.
  suggested: { text: 'Suggested', className: 'border-line text-muted' },
  edited: { text: 'Yours', className: 'border-info-line text-info-fg' },
  approved: { text: 'Approved', className: 'border-success-line text-success-fg' },
}

function FieldCard({
  field,
  onPatch,
  busy,
}: {
  field: PreparedField
  onPatch: (body: { answer?: string | null; answerState?: string; useAssetId?: number | null }) => void
  busy: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? field.answer ?? ''
  const chip = STATE_CHIP[field.state] ?? STATE_CHIP.empty
  const question = field.questionKind ? kindByKey(field.questionKind) : undefined
  const dirty = draft !== null && draft !== (field.answer ?? '')

  return (
    <div className="border border-line rounded-lg p-3 bg-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {field.label}
            {field.required && <span className="text-danger-fg ml-1">*</span>}
          </p>
          {field.helpText && <p className="text-xs text-faint mt-0.5">{field.helpText}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {question && <span className="text-xs text-faint">{question.label}</span>}
          <span className={`text-xs px-2 py-0.5 rounded-md border bg-surface ${chip.className}`}>
            {chip.text}
          </span>
        </div>
      </div>

      {field.fieldType === 'file' ? (
        <p className="text-xs text-muted mt-2">
          A file upload. Nothing can be pasted — see the materials list below.
        </p>
      ) : (
        <>
          <Textarea
            className="mt-2 text-sm"
            rows={Math.min(8, Math.max(2, Math.ceil(value.length / 90)))}
            value={value}
            placeholder={
              field.questionKind
                ? 'Nothing on file answers this yet.'
                : 'This question matches nothing the artist database knows — write it here.'
            }
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span
              className={`text-xs ${
                field.maxLength && value.length > field.maxLength ? 'text-danger-fg' : 'text-faint'
              }`}
            >
              {value.length}
              {field.maxLength ? ` / ${field.maxLength}` : ''} characters
            </span>
            {dirty && (
              <Button variant="primary" disabled={busy} onClick={() => onPatch({ answer: draft })}>
                Save
              </Button>
            )}
            {!dirty && field.state === 'suggested' && value && (
              <Button
                variant="good"
                disabled={busy}
                onClick={() => onPatch({ answerState: 'approved' })}
              >
                This one is right
              </Button>
            )}
            {value && <Copy text={value} />}
            {field.alternatives.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                Use instead
                <Select
                  filter
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && onPatch({ useAssetId: Number(e.target.value) })}
                >
                  <option value="">—</option>
                  {field.alternatives.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} ({a.charCount})
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
        </>
      )}

      {field.problems
        .filter((p) => p.id !== 'upload')
        .map((p) => (
          <p
            key={p.id}
            className={`text-xs mt-1.5 ${p.severity === 'danger' ? 'text-danger-fg' : 'text-warn-fg'}`}
          >
            {p.message}
          </p>
        ))}

      {field.source && (
        <p className="text-xs text-faint mt-1.5">
          From “{field.source.label}” in the artist database.
        </p>
      )}
    </div>
  )
}

function Checklist({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
        Materials to attach
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="text-sm flex items-start gap-2">
            <span className={item.problem ? 'text-danger-fg' : 'text-success-fg'}>
              {item.problem ? '✕' : '✓'}
            </span>
            <span className="min-w-0">
              <span className="text-ink">{item.label}</span>
              {item.required && <span className="text-danger-fg ml-1">*</span>}
              {item.problem ? (
                <span className="text-xs text-danger-fg block">{item.problem}</span>
              ) : (
                <span className="text-xs text-faint block">
                  {item.candidates.length} on file — {item.candidates[0].label}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ApplicationPanel({ gigId }: { gigId: number }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['application', gigId],
    queryFn: () => api.application.get(gigId),
  })

  const setPacket = (packet: Application) => {
    qc.setQueryData(['application', gigId], packet)
    // The read can move a shortlisted gig to `preparing`, and it writes the
    // form URL back onto the row — both of which the table above is showing.
    qc.invalidateQueries({ queryKey: ['gigs'] })
  }

  const prepare = useMutation({
    mutationFn: () => api.application.prepare(gigId, url.trim() ? { url: url.trim() } : {}),
    onSuccess: setPacket,
  })

  const patchField = useMutation({
    mutationFn: ({ fieldId, body }: { fieldId: number; body: Record<string, unknown> }) =>
      api.application.patchField(gigId, fieldId, body),
    onSuccess: setPacket,
  })

  if (isLoading) return <p className="text-sm text-faint">Loading the application…</p>
  if (error) return <p className="text-sm text-danger-fg">{(error as Error).message}</p>
  if (!data) return null

  const { readiness, fields, checklist, warnings, email } = data
  const busy = prepare.isPending || patchField.isPending
  const known = data.gig.applicationUrl ?? data.gig.url

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Application</p>
        {fields.length > 0 && (
          <p className="text-xs text-muted">
            {readiness.checked} of {readiness.answered} answers read
            {readiness.required > 0 &&
              ` · ${readiness.requiredAnswered}/${readiness.required} required answered`}
            {readiness.uploads > 0 && ` · ${readiness.uploads} to attach`}
          </p>
        )}
        {readiness.sendable && (
          <span className="text-xs px-2 py-0.5 rounded-md border border-success-line text-success-fg bg-surface">
            Ready to copy out
          </span>
        )}
      </div>

      {/*
        The form address is a separate field from the listing URL because the
        research agents fill `url` with whatever page announced the thing,
        which is usually not the form.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-md"
          placeholder={known ? `Form address (currently ${known})` : 'Address of the application form'}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button variant="primary" disabled={busy || (!known && !url.trim())} onClick={() => prepare.mutate()}>
          {fields.length > 0 ? 'Re-read the form' : 'Read the form'}
        </Button>
        {prepare.isError && (
          <span className="text-xs text-danger-fg">{(prepare.error as Error).message}</span>
        )}
      </div>

      {data.prepStatus !== 'ready' && data.prepNote && (
        <p className="text-sm text-warn-fg border border-warn-line rounded-md px-3 py-2 bg-surface">
          {data.prepNote}
          {data.prepStatus === 'blocked' && (
            <span className="block text-xs text-muted mt-1">
              Nothing is broken — this one is filled in by hand. The materials list below still
              applies.
            </span>
          )}
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="text-xs text-warn-fg space-y-0.5">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((f) => (
            <FieldCard
              key={f.id}
              field={f}
              busy={busy}
              onPatch={(body) => patchField.mutate({ fieldId: f.id, body })}
            />
          ))}
        </div>
      )}

      <Checklist items={checklist} />

      {email && (
        <div className="border border-line rounded-lg p-3 bg-surface">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">
              Draft email — submitted by mail
            </p>
            <Copy text={`${email.subject}\n\n${email.body}`} label="Copy draft" />
          </div>
          <p className="text-sm font-medium text-ink mt-2">{email.subject}</p>
          <pre className="text-sm text-body whitespace-pre-wrap font-sans mt-1.5">{email.body}</pre>
          {/*
            Listed, not hidden. The gaps are in the body verbatim so an
            unedited paste is visibly unfinished — a draft that reads as
            finished is the one that gets sent that way.
          */}
          <ul className="text-xs text-warn-fg mt-2 space-y-0.5">
            {email.gaps.map((g) => (
              <li key={g.marker}>
                <span className="font-medium">{g.marker}</span> — {g.prompt}
              </li>
            ))}
          </ul>
          {email.missing.length > 0 && (
            <p className="text-xs text-faint mt-1.5">
              Nothing on file for: {email.missing.join(', ')}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
