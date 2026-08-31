// Entity shapes live in shared/ because the Worker builds the review queue
// from them too — see shared/types.ts. Re-exported here so UI code can keep
// importing everything it needs from one module.
export type {
  GigStatus,
  SyncStatus,
  GigOpportunity,
  SyncTarget,
  PromoDraft,
} from '../../shared/types'

import type { GigOpportunity, SyncTarget, PromoDraft } from '../../shared/types'
import type { ReviewFilter, ReviewItem, QueueSummary } from '../../shared/reviewQueue'

export type {
  ReviewFilter,
  ReviewItem,
  QueueSummary,
  TimingRow,
  TimingBand,
  Backlog,
  DataHealth,
} from '../../shared/reviewQueue'

export interface ReviewQueue {
  items: ReviewItem[]
  total: number
  counts: Record<ReviewFilter, number>
  /** Blocks C and D of the Overview — see summariseQueue(). */
  summary: QueueSummary
}

export interface ReconcileResult {
  id: number
  name: string
  contactEmail: string | null
  currentStatus: string
  statusChange: { from: string; to: string } | null
  sentEmail: { date: string; subject: string; body: string }
  pitchDraft: string | null
  pitchSent: string | null
  isNew: boolean
}

export interface ReconcilePreview {
  results: ReconcileResult[]
  unmatched: Array<{ id: number; name: string; contactEmail: string | null; currentStatus: string }>
}

export interface TaskRun {
  id: number
  taskId: string
  runAt: string
  status: string
  summary: string | null
  itemsAdded: number
}

export interface DueReminder {
  id: number
  reminderType: string
  scheduledFor: string
  entityId: number
  entityType: string
  gigName: string | null
  gigDeadline: string | null
  gigStatus: string | null
}

export interface Overview {
  stats: { totalGigs: number; totalSync: number; totalPromo: number }
  recentRuns: TaskRun[]
  dueReminders: DueReminder[]
}

export interface ReferenceDoc {
  id: string
  title: string
  content: string
  updatedAt: string
}

export type NotificationTier = 'critical' | 'attention' | 'info'

export interface AppNotification {
  key: string
  tier: NotificationTier
  title: string
  body: string
  href: string
  action?: string
  read: boolean
  firstSeen: string
}

export interface NotificationFeed {
  items: AppNotification[]
  unread: number
  unreadCritical: number
}

export interface HealthStatus {
  calendarConfigured: boolean
  calendarMissingSecrets: string[]
  gmailConfigured: boolean
  gmailMissingSecrets: string[]
  emailConfigured: boolean
}

export interface DigestSettings {
  enabled: boolean
  recipient: string
  sender: string
}

export interface DigestLine {
  key: string
  kind: string
  id: number
  title: string
  rationale: string
  href: string
}

export interface DigestPreview {
  empty: boolean
  subject: string
  groups: Array<{ id: string; heading: string; lines: DigestLine[] }>
  html: string
  text: string
  settings: DigestSettings
  mailerConfigured: boolean
  wouldSend: boolean
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error: string }).error)
  }
  return res.json()
}

export const api = {
  overview: () => apiFetch<Overview>('/overview'),
  review: (params?: { filter?: ReviewFilter; limit?: number }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
        ).toString()
      : ''
    return apiFetch<ReviewQueue>(`/review${qs}`)
  },
  /** Defer an item to a date, or pass `until: null` to bring it back now. */
  snooze: (body: { kind: 'gig' | 'sync'; id: number; until: string | null }) =>
    apiFetch<{ kind: string; id: number; snoozedUntil: string | null }>('/review/snooze', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  gigs: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return apiFetch<GigOpportunity[]>(`/gigs${qs}`)
    },
    patch: (id: number, body: Partial<GigOpportunity>) =>
      apiFetch<GigOpportunity>(`/gigs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => apiFetch<{ ok: boolean }>(`/gigs/${id}`, { method: 'DELETE' }),
    // Snooze fields are excluded, not defaulted: nothing can be created
    // already deferred, and a create form should not have to say so.
    create: (body: Omit<GigOpportunity, 'id' | 'discoveredAt' | 'updatedAt' | 'snoozedUntil' | 'snoozedAt'>) =>
      apiFetch<{ id: number }>('/gigs', { method: 'POST', body: JSON.stringify(body) }),
  },
  sync: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return apiFetch<SyncTarget[]>(`/sync${qs}`)
    },
    create: (body: Omit<SyncTarget, 'id' | 'discoveredAt' | 'updatedAt' | 'reconciledAt' | 'pitchSent' | 'snoozedUntil' | 'snoozedAt'>) =>
      apiFetch<{ id: number }>('/sync', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: Partial<SyncTarget>) =>
      apiFetch<SyncTarget>(`/sync/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => apiFetch<{ ok: boolean }>(`/sync/${id}`, { method: 'DELETE' }),
    reconcile: {
      preview: () => apiFetch<ReconcilePreview>('/sync/reconcile'),
      apply: (updates: Array<{ id: number; newStatus?: string; pitchSent?: string; learnFromSent?: boolean }>) =>
        apiFetch<{ applied: number[] }>('/sync/reconcile/apply', { method: 'POST', body: JSON.stringify({ updates }) }),
    },
  },
  promo: {
    list: () => apiFetch<PromoDraft[]>('/promo'),
    patch: (id: number, body: Partial<PromoDraft>) =>
      apiFetch<PromoDraft>(`/promo/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => apiFetch<{ ok: boolean }>(`/promo/${id}`, { method: 'DELETE' }),
  },
  taskRuns: {
    list: (params?: { limit?: number; offset?: number }) => {
      const qs = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : ''
      return apiFetch<TaskRun[]>(`/task-runs${qs}`)
    },
  },
  reminders: {
    dismiss: (id: number) =>
      apiFetch<{ id: number }>(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) }),
  },
  referenceDocs: {
    list: () => apiFetch<ReferenceDoc[]>('/reference-docs'),
    create: (body: { id: string; title: string; content: string }) =>
      apiFetch<ReferenceDoc>('/reference-docs', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: { title?: string; content?: string }) =>
      apiFetch<ReferenceDoc>(`/reference-docs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/reference-docs/${id}`, { method: 'DELETE' }),
  },
  health: () => apiFetch<HealthStatus>('/health'),
  notifications: {
    list: () => apiFetch<NotificationFeed>('/notifications'),
    read: (body: { keys?: string[]; all?: boolean }) =>
      apiFetch<{ readAt: string }>('/notifications/read', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    dismiss: (key: string) =>
      apiFetch<{ dismissed: string }>('/notifications/dismiss', {
        method: 'POST',
        body: JSON.stringify({ key }),
      }),
  },
  digest: {
    preview: () => apiFetch<DigestPreview>('/digest/preview'),
    send: () =>
      apiFetch<{ sent: boolean; reason?: string; to?: string; subject?: string }>('/digest/send', {
        method: 'POST',
      }),
    patch: (body: Partial<DigestSettings>) =>
      apiFetch<DigestSettings>('/digest/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  },
}
