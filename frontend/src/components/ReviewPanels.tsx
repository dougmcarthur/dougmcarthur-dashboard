import { useState, type ReactNode } from 'react'
import type { NoteAlert, DraftedField } from '../../../shared/reviewParse'
import type { ReviewFlag, ReviewKind } from '../../../shared/reviewQueue'

export type PanelTone = 'neutral' | 'danger' | 'warn' | 'info' | 'accent'

const PANEL_TONES: Record<PanelTone, { box: string; head: string }> = {
  neutral: { box: 'bg-surface border-line', head: 'text-muted' },
  danger: { box: 'bg-danger-bg border-danger-line', head: 'text-danger-fg' },
  warn: { box: 'bg-warn-bg border-warn-line', head: 'text-warn-fg' },
  info: { box: 'bg-info-bg/60 border-info-line', head: 'text-info-fg' },
  accent: { box: 'bg-cat-violet-bg/50 border-cat-violet-line', head: 'text-cat-violet-fg' },
}

/** One titled container. Every parsed fact type gets its own. */
export function Panel({
  title,
  tone = 'neutral',
  count,
  action,
  children,
}: {
  title: string
  tone?: PanelTone
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  const styles = PANEL_TONES[tone]
  return (
    <section className={`rounded-lg border ${styles.box}`}>
      <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${styles.head}`}>
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-2 font-normal opacity-60">{count}</span>
          )}
        </h3>
        {action}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
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

const SEVERITY_STYLES = {
  danger: 'bg-danger-bg text-danger-fg border-danger-line',
  warn: 'bg-warn-bg text-warn-fg border-warn-line',
  info: 'bg-sunken text-body border-line',
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

export function AlertList({ alerts }: { alerts: NoteAlert[] }) {
  return (
    <ul className="space-y-2">
      {alerts.map((alert, i) => (
        <li
          key={i}
          className={`rounded-md border px-3 py-2 text-sm leading-relaxed ${
            alert.severity === 'danger'
              ? 'bg-surface border-danger-line text-danger-fg'
              : alert.severity === 'warn'
              ? 'bg-surface border-warn-line text-warn-fg'
              : 'bg-surface border-line text-body'
          }`}
        >
          {alert.flaggedAt && (
            <span className="mr-2 rounded bg-sunken px-1.5 py-0.5 text-[10px] font-mono text-muted">
              {alert.flaggedAt}
            </span>
          )}
          {alert.text}
        </li>
      ))}
    </ul>
  )
}

/** The drafted application values, as a copyable label/value table. */
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
export function RawNote({ note }: { note: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted hover:text-body transition-colors"
      >
        <span>{open ? 'Hide' : 'Show'} original note text</span>
        <span className="font-mono">{note.length} chars</span>
      </button>
      {open && (
        <pre className="whitespace-pre-wrap break-words border-t border-line px-4 py-3 text-xs leading-relaxed text-body font-sans">
          {note}
        </pre>
      )}
    </div>
  )
}
