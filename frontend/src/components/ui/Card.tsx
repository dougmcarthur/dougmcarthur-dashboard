import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Accent stripe colours map to the app's semantic states. */
type Accent = 'none' | 'pending' | 'scheduled' | 'ready' | 'danger' | 'library'

const ACCENTS: Record<Accent, string> = {
  none: 'border-line',
  pending: 'border-line border-l-pending border-l-2',
  scheduled: 'border-line border-l-scheduled border-l-2',
  ready: 'border-line border-l-ready border-l-2',
  danger: 'border-line border-l-danger border-l-2',
  library: 'border-line border-l-library border-l-2',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  accent?: Accent
  interactive?: boolean
}

export function Card({ accent = 'none', interactive, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border rounded-card',
        ACCENTS[accent],
        interactive && 'cursor-pointer transition-colors hover:bg-surface-muted',
        className,
      )}
      {...props}
    />
  )
}

export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string
  count?: number
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-wider flex items-center gap-2">
        {title}
        {count !== undefined && (
          <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted tabular-nums">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <Card className="px-4 py-10 text-center">
      <p className="text-sm text-ink-muted">{title}</p>
      {hint && <p className="text-xs text-ink-subtle mt-1 max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </Card>
  )
}
