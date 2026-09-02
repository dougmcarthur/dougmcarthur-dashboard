import { useState, type ReactNode } from 'react'
import type { NoteAlert, DraftedField } from '../../../shared/reviewParse'
import type { ReviewFlag, ReviewKind } from '../../../shared/reviewQueue'
import type { AlertSeverity } from '../../../shared/reviewParse'

/**
 * A section of the detail pane.
 *
 * Deliberately *not* a box. The pane used to be ten bordered, separately
 * tinted panels stacked on one another — boxes inside a box inside a card —
 * which made every section shout equally and none of them read as related.
 * One surface, and hierarchy carried by type and a hairline rule instead.
 */
export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="pt-5">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-1.5 mb-3">
        <h3 className="text-[0.68rem] font-bold uppercase tracking-[0.11em] text-faint">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 font-semibold text-muted">{count}</span>
          )}
        </h3>
        {action}
      </header>
      {children}
    </section>
  )
}

/**
 * The two or three numbers a decision actually turns on, at the top where they
 * belong. A deadline is the single most load-bearing fact about an opportunity
 * and it used to sit two thirds of the way down, inside a box, inside a panel.
 */
export function FactRow({
  facts,
}: {
  facts: Array<{
    label: string
    value: ReactNode
    tone?: 'plain' | 'urgent' | 'cost'
    /** What the column actually held, when the value above is a reading of it. */
    note?: string | null
  }>
}) {
  if (facts.length === 0) return null
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2.5">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0 max-w-full">
          <dt className="text-[0.68rem] font-bold uppercase tracking-[0.11em] text-faint">
            {f.label}
          </dt>
          <dd
            className={`mt-0.5 text-sm font-semibold tabular-nums ${
              f.tone === 'urgent'
                ? 'text-danger-fg'
                : f.tone === 'cost'
                  ? 'text-warn-fg'
                  : 'text-ink'
            }`}
          >
            {f.value}
          </dd>
          {/* A date recovered from prose must not look as certain as one the
              column actually held — the prose goes underneath it. */}
          {f.note && (
            <p className="mt-0.5 max-w-[32ch] text-xs font-normal leading-snug text-muted">
              {f.note}
            </p>
          )}
        </div>
      ))}
    </dl>
  )
}

/**
 * Things standing between you and a decision.
 *
 * One list with a rule down its side, rather than two separately tinted panels
 * ("Flags & known issues" above "Blocked on you") saying much the same thing in
 * different colours.
 */
export function NeedsYou({ items }: { items: Array<{ text: string; severity?: AlertSeverity }> }) {
  if (items.length === 0) return null
  return (
    <ul className="space-y-2 border-l-2 border-danger-line pl-3.5">
      {items.map((it, i) => (
        <li
          key={i}
          className={`text-sm leading-relaxed ${
            it.severity === 'danger' ? 'text-ink' : 'text-body'
          }`}
        >
          {it.text}
        </li>
      ))}
    </ul>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          setCopied(false)
        }
      }}
      className="text-xs px-2 py-0.5 rounded border border-line-strong text-muted hover:bg-surface hover:text-ink transition-colors"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

/**
 * Only a genuine problem gets the clay.
 *
 * `warn` used to have an amber of its own; collapsing the palette to two hues
 * sent it to clay, which put four identical alarm-coloured chips in a row and
 * flattened the hierarchy the severities exist to express. A warning is now a
 * neutral chip with full-strength ink — present, legible, and visibly not an
 * error.
 */
const SEVERITY_STYLES = {
  danger: 'bg-danger-bg text-danger-fg border-danger-line',
  warn: 'bg-raised text-ink border-line-strong',
  info: 'bg-sunken text-muted border-line',
} as const

export function FlagChip({ flag }: { flag: ReviewFlag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[flag.severity]}`}
    >
      {flag.label}
    </span>
  )
}

const KIND_STYLES: Record<ReviewKind, string> = {
  gig: 'bg-cat-sky-bg text-cat-sky-fg',
  sync: 'bg-cat-violet-bg text-cat-violet-fg',
  promo: 'bg-cat-teal-bg text-cat-teal-fg',
}

export function KindTag({ kind }: { kind: ReviewKind }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLES[kind]}`}>
      {kind}
    </span>
  )
}

export function FieldTable({ fields }: { fields: DraftedField[] }) {
  return (
    <dl className="divide-y divide-line rounded-md border border-line bg-surface">
      {fields.map((field, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2">
          <dt className="w-40 shrink-0 text-xs font-medium text-muted pt-0.5">
            {field.label || <span className="text-faint">—</span>}
          </dt>
          <dd
            className={`min-w-0 flex-1 text-sm break-words ${
              field.needsDoug ? 'text-warn-fg font-medium' : 'text-ink'
            }`}
          >
            {field.value}
          </dd>
          <div className="shrink-0 pt-0.5">
            <CopyButton text={field.value} />
          </div>
        </div>
      ))}
    </dl>
  )
}

export function BulletList({ items, tone = 'gray' }: { items: string[]; tone?: 'gray' | 'amber' }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          className={`flex gap-2 text-sm leading-relaxed ${tone === 'amber' ? 'text-warn-fg' : 'text-body'}`}
        >
          <span className={tone === 'amber' ? 'text-warn-fg' : 'text-faint'}>•</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Collapsible original note, so the parse never hides the source text. */
/**
 * The note exactly as stored, folded away.
 *
 * Everything above it is the app's reading of this text — parsed, classified,
 * and rewritten into the second person — so the original has to stay reachable
 * for when the reading looks wrong. A disclosure row rather than a box, to
 * match the rest of the pane.
 */
export function RawNote({ note }: { note: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pt-5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between border-b border-line pb-1.5 text-[0.68rem] font-bold uppercase tracking-[0.11em] text-faint hover:text-muted transition-colors"
      >
        <span>{open ? 'Hide' : 'Show'} original note</span>
        <span className="tabular-nums font-semibold normal-case tracking-normal">
          {note.length} chars
        </span>
      </button>
      {open && (
        <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted font-sans">
          {note}
        </pre>
      )}
    </div>
  )
}
