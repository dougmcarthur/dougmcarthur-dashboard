import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type Tone = 'neutral' | 'pending' | 'scheduled' | 'ready' | 'submitted' | 'danger' | 'library' | 'brand'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  pending: 'bg-pending-soft text-pending',
  scheduled: 'bg-scheduled-soft text-scheduled',
  ready: 'bg-ready-soft text-ready',
  submitted: 'bg-submitted-soft text-submitted',
  danger: 'bg-danger-soft text-danger',
  library: 'bg-library-soft text-library',
  brand: 'bg-brand-soft text-brand-strong',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/**
 * The single source of truth for what each state looks like. Every status in the
 * app resolves through here, so a colour means the same thing everywhere.
 */
export const STATUS_TONE: Record<string, Tone> = {
  // Gigs
  pending_review: 'pending',
  approved: 'ready',
  awaiting_window: 'scheduled',
  submitted: 'submitted',
  rejected: 'danger',
  archived: 'neutral',
  // Sync
  draft_ready: 'library',
  pitched: 'submitted',
  confirmed: 'ready',
  declined: 'danger',
  // Promo + runs
  draft: 'pending',
  published: 'ready',
  ok: 'ready',
  error: 'danger',
  // Prep
  ready: 'ready',
  queued: 'submitted',
  blocked: 'pending',
  failed: 'danger',
  none: 'neutral',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>
}
