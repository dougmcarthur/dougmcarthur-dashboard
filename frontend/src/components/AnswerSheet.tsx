import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Application, type PreparedField } from '../api'
import { kindByKey } from '../../../shared/questionKinds'
import { copiedNote, copyableText, firstCopyable, overBy, stepTo } from '../../../shared/answerSheet'
import { windowOf, writeClipboard } from '../clipboard'
import { CopyButton } from './CopyButton'
import { Button } from './ui/Button'

/**
 * An application's questions in the order the form asks them, each with its
 * answer and one way to copy it.
 *
 * Drawn in the pop-out window, and it is the application panel's list turned
 * into something to paste from: no editing here (that is the panel's job, and a
 * second place to edit an answer is a second place for it to be wrong), only
 * copying, and approving an answer you have just read. Nothing on it can reach
 * the form, and nothing on it says Send.
 *
 * Enter copies the highlighted answer and moves on to the next one with
 * something in it, so a form of twelve questions is twelve presses with the
 * form's own tab between them. The arrow keys move without copying.
 */

const STATE_WORDS: Record<string, string> = {
  empty: 'No answer yet',
  suggested: 'Suggested, not read yet',
  edited: 'Yours',
  approved: 'Approved',
}

/** Past this a long answer is folded, with a way to read all of it. */
const FOLD_AT = 260

function Row({
  field,
  active,
  busy,
  onSelect,
  onCopied,
  onApprove,
}: {
  field: PreparedField
  active: boolean
  busy: boolean
  onSelect: () => void
  onCopied: () => void
  onApprove: () => void
}) {
  const [open, setOpen] = useState(false)
  const text = copyableText(field)
  const over = overBy(field)
  const kind = field.questionKind ? kindByKey(field.questionKind) : undefined
  const meta = [kind?.label, STATE_WORDS[field.state] ?? STATE_WORDS.empty].filter(Boolean).join(', ')
  const long = (text?.length ?? 0) > FOLD_AT

  return (
    <li
      data-sheet-row
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={`rounded-lg border px-3 py-2.5 ${active ? 'border-info-line bg-sunken' : 'border-line bg-surface'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-semibold leading-snug text-ink">
          {field.label}
          {field.required && (
            <span className="ml-1 text-danger-fg" title="Required">
              *
            </span>
          )}
        </p>
        {text !== null && <CopyButton text={text} label={`Copy ${field.label}`} onCopied={onCopied} />}
      </div>
      <p className="mt-0.5 text-xs text-muted">{meta}</p>

      {field.fieldType === 'file' ? (
        <p className="mt-1.5 text-xs text-muted">A file to attach. It is on the list at the bottom.</p>
      ) : text === null ? (
        <p className="mt-1.5 text-xs text-muted">
          {field.questionKind
            ? 'Nothing on file answers this yet.'
            : 'Nothing on file matches this question. Write it on the application page.'}
        </p>
      ) : (
        <>
          <p
            className={`mt-1.5 whitespace-pre-line break-words text-sm text-body ${long && !open ? 'line-clamp-4' : ''}`}
          >
            {text}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1 text-xs font-semibold text-info-fg"
            >
              {open ? 'Show less' : 'Show all of it'}
            </button>
          )}
          <p className={`mt-1.5 text-xs tabular-nums ${over > 0 ? 'text-danger-fg' : 'text-muted'}`}>
            {text.length}
            {field.maxLength ? ` of ${field.maxLength}` : ''} characters
            {over > 0 ? `, ${over} too many` : ''}
          </p>
        </>
      )}

      {field.problems
        .filter((p) => p.id !== 'upload' && p.id !== 'over_length')
        .map((p) => (
          <p key={p.id} className={`mt-1 text-xs ${p.severity === 'danger' ? 'text-danger-fg' : 'text-warn-fg'}`}>
            {p.message}
          </p>
        ))}

      {field.state === 'suggested' && text !== null && (
        <Button className="mt-2" variant="good" size="sm" disabled={busy} onClick={onApprove}>
          This one is right
        </Button>
      )}
    </li>
  )
}

export function AnswerSheet({ packet, gigId }: { packet: Application; gigId: number }) {
  const qc = useQueryClient()
  const { fields, checklist, readiness, warnings } = packet
  const root = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState(() => firstCopyable(fields))
  const [status, setStatus] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // A re-read can leave fewer rows than the highlight was on.
  const at = Math.min(picked, Math.max(0, fields.length - 1))

  const approve = useMutation({
    mutationFn: (fieldId: number) => api.application.patchField(gigId, fieldId, { answerState: 'approved' }),
    onSuccess: (next) => qc.setQueryData(['application', gigId], next),
  })

  const say = (text: string) => {
    clearTimeout(timer.current)
    setStatus(text)
    timer.current = setTimeout(() => setStatus(''), 5000)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // Keeps the highlighted row in view as the keys move it, by scrolling the
  // list and nothing else. `scrollIntoView` scrolls every ancestor that can
  // move, and in a window with its own document that includes the page.
  useEffect(() => {
    const list = root.current
    const row = list?.querySelectorAll('[data-sheet-row]')[at]
    if (!list || !row) return
    const bounds = list.getBoundingClientRect()
    const box = row.getBoundingClientRect()
    if (box.top < bounds.top) list.scrollTop -= bounds.top - box.top + 12
    else if (box.bottom > bounds.bottom) list.scrollTop += box.bottom - bounds.bottom + 12
  }, [at])

  // The keys live on the window's own document, not the app's: a keypress in
  // the pop-out is never delivered to the page that opened it.
  useEffect(() => {
    const doc = root.current?.ownerDocument
    if (!doc) return
    const win = windowOf(root.current)

    const copyAndNext = async () => {
      const field = fields[at]
      const text = field && copyableText(field)
      if (!field || text === null) return
      const next = stepTo(fields, at, 1)
      const ok = await writeClipboard(text, win)
      if (!ok) return say(`Could not copy ${field.label}. Select the text and copy it by hand.`)
      say(copiedNote(field.label, field, next === at))
      setPicked(next)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as Element | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPicked(stepTo(fields, at, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPicked(stepTo(fields, at, -1))
      } else if (e.key === 'Enter') {
        // A button handles its own Enter, and copying twice helps nobody.
        if (target?.closest('button, a')) return
        e.preventDefault()
        void copyAndNext()
      }
    }
    doc.addEventListener('keydown', onKey)
    return () => doc.removeEventListener('keydown', onKey)
  }, [fields, at])

  // After a click on a Copy button, the keys work again: focus on the button
  // would hand them the next Enter.
  const backToList = () => root.current?.focus()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1 border-b border-line bg-sunken/50 px-3 py-2">
        <p className="text-xs text-body">
          {readiness.checked} of {readiness.answered} answers read
          {readiness.required > 0 && `, ${readiness.requiredAnswered} of ${readiness.required} required answered`}
          {readiness.uploads > 0 && `, ${readiness.uploads} to attach`}
        </p>
        <p className="text-xs text-muted">
          Enter copies the highlighted answer and moves to the next. The arrow keys move without copying.
        </p>
        {warnings.map((w) => (
          <p key={w} className="text-xs text-warn-fg">
            {w}
          </p>
        ))}
      </div>

      <div ref={root} tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto p-3 focus:outline-none">
        <ul className="space-y-2">
          {fields.map((f, i) => (
            <Row
              key={f.id}
              field={f}
              active={i === at}
              busy={approve.isPending}
              onSelect={() => setPicked(i)}
              onCopied={() => {
                setPicked(i)
                say(copiedNote(f.label, f, false))
                backToList()
              }}
              onApprove={() => approve.mutate(f.id)}
            />
          ))}
        </ul>

        {checklist.length > 0 && (
          <section className="mt-4" aria-labelledby="sheet-files">
            <h3 id="sheet-files" className="text-sm font-semibold text-ink">
              Files this form asks you to attach
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {checklist.map((item) => (
                <li key={item.label} className="text-sm text-body">
                  <span className="font-medium text-ink">{item.label}</span>
                  {item.required && <span className="ml-1 text-danger-fg">*</span>}
                  <span className={`block text-xs ${item.problem ? 'text-danger-fg' : 'text-muted'}`}>
                    {item.problem ?? `${item.candidates.length} on file, starting with ${item.candidates[0].label}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-surface px-3 py-2">
        <p role="status" aria-live="polite" className="min-h-4 text-xs text-body">
          {status}
        </p>
      </div>
    </div>
  )
}
