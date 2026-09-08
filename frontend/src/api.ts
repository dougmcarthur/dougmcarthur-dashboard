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

export type {
  ArtistAsset,
  AssetKind,
  AssetHealth,
  Epk,
  EpkAudience,
} from '../../shared/artistAssets'

import type { ArtistAsset, AssetHealth, Epk, EpkAudience } from '../../shared/artistAssets'

/** An asset with the freshness the server worked out, which the UI never recomputes. */
export type ArtistAssetWithHealth = ArtistAsset & { health: AssetHealth }

export interface ArtistAssetPage {
  items: ArtistAssetWithHealth[]
  total: number
  /** Counted over everything, not the filtered view. */
  needsReview: number
  unreviewed: number
}

export interface ArtistAssetInput {
  kind: string
  label: string
  value?: string | null
  questionKind?: string | null
  variant?: string | null
  credit?: string | null
  usageRights?: string | null
  reviewBy?: string | null
  source?: string | null
  notes?: string | null
  sortOrder?: number
  archived?: boolean
}

/** Phase 3 — see shared/application.ts. The Worker assembles this per read. */
export type {
  AnswerState,
  ApplicationField,
  PreparedField,
  ChecklistItem,
  Readiness,
  FieldProblem,
  PrepStatus,
} from '../../shared/application'
export type { EmailDraft, DraftGap } from '../../shared/applicationEmail'

import type { ApplicationPacket } from '../../shared/application'
import type { EmailDraft } from '../../shared/applicationEmail'

export interface Application extends ApplicationPacket {
  gig: {
    id: number
    name: string
    status: string
    submissionMethod: string | null
    url: string | null
    applicationUrl: string | null
    deadline: string | null
  }
  /** Only for opportunities submitted by email — null everywhere else. */
  email: EmailDraft | null
}

/** What a re-read of the form found, alongside the packet it produced. */
export interface ApplicationRead extends Application {
  read: { status: string; note: string | null; fields: number }
}

/** Phase 4 — see shared/replyClassify.ts and shared/replyMatch.ts. */
export type { ReplyClass, Classification } from '../../shared/replyClassify'
export { REPLY_CLASS_LABELS } from '../../shared/replyClassify'
export type { MatchSignal, MatchConfidence } from '../../shared/replyMatch'

import type { MatchSignal, MatchConfidence } from '../../shared/replyMatch'

export interface ReplyCandidateSummary {
  gigId: number
  gigName: string
  score: number
  confidence: MatchConfidence
  signals: MatchSignal[]
}

export interface GigReply {
  id: number
  gmailMessageId: string
  gmailThreadId: string
  gigId: number | null
  fromAddress: string
  fromName: string | null
  subject: string | null
  snippet: string | null
  receivedAt: string
  inSpam: boolean
  classification: string
  classLabel: string
  classConfidence: string | null
  /** The organiser's own sentence. Never a paraphrase. */
  evidence: string | null
  proposedStatus: string | null
  matchScore: number
  matchSignals: ReplyCandidateSummary[]
  matchAmbiguous: boolean
  resolution: string | null
  gig: { id: number; name: string | null; status: string | null } | null
}

export interface ReplyFeed {
  items: GigReply[]
  unresolved: number
}

/** What a scan asked for, and how far back it reached. */
export interface ReplyScanResult {
  queries: string[]
  windowDays: number
  oldestSubmission: string | null
  gigCount: number
  found: number
  stored: number
  skipped: number
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

// Re-exported rather than restated: the Worker returns exactly these, and a
// second declaration of the same shape is a place for the two to drift.
export type {
  Tier as NotificationTier,
  NotificationKind,
  Notification as AppNotification,
} from '../../shared/notifications'
export { KIND_LABELS } from '../../shared/notifications'

import type { Notification as AppNotification } from '../../shared/notifications'

export interface NotificationFeed {
  items: AppNotification[]
  unread: number
  unreadCritical: number
  /** Including anything past the pane's cap, which lives in History. */
  total: number
}

export interface TaskRunPage {
  runs: TaskRun[]
  /** Matching the filter, across every page. */
  total: number
  /** Values that actually occur in the log, so no control offers a dead click. */
  facets: { tasks: string[]; statuses: string[] }
}

export interface HealthStatus {
  calendarConfigured: boolean
  calendarMissingSecrets: string[]
  gmailConfigured: boolean
  gmailMissingSecrets: string[]
  emailConfigured: boolean
}

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export interface DigestSettings {
  enabled: boolean
  recipient: string
  sender: string
}

export interface DigestSchedule {
  day: Weekday
  hour: number
  timezone: string
  /** "Mondays at 08:00" */
  describes: string
  nextRun: string | null
  lastSentAt: string | null
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
  schedule: DigestSchedule
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
    list: (params?: { limit?: number; offset?: number; task?: string; status?: string }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '')
      const qs = entries.length > 0
        ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
        : ''
      return apiFetch<TaskRunPage>(`/task-runs${qs}`)
    },
  },
  reminders: {
    dismiss: (id: number) =>
      apiFetch<{ id: number }>(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) }),
  },
  /** The artist database — see shared/artistAssets.ts. */
  artist: {
    list: (params?: { kind?: string }) => {
      const qs = params?.kind ? `?kind=${encodeURIComponent(params.kind)}` : ''
      return apiFetch<ArtistAssetPage>(`/artist${qs}`)
    },
    epk: (audience: EpkAudience) => apiFetch<Epk>(`/artist/epk?audience=${audience}`),
    create: (body: ArtistAssetInput) =>
      apiFetch<{ id: number }>('/artist', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: Partial<ArtistAssetInput>) =>
      apiFetch<ArtistAsset>(`/artist/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    /** Still good: pushes the review date out by the kind's own interval. */
    reviewed: (id: number) => apiFetch<ArtistAsset>(`/artist/${id}/reviewed`, { method: 'POST' }),
    delete: (id: number) => apiFetch<{ ok: boolean }>(`/artist/${id}`, { method: 'DELETE' }),
  },
  /**
   * The application packet — the form's questions with an answer staged
   * against each. Nothing here submits anything; see shared/application.ts.
   */
  application: {
    get: (gigId: number) => apiFetch<Application>(`/gigs/${gigId}/application`),
    /** Read (or re-read) the form. `url` is remembered on the gig row. */
    prepare: (gigId: number, body: { url?: string } = {}) =>
      apiFetch<ApplicationRead>(`/gigs/${gigId}/application/prepare`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    patchField: (
      gigId: number,
      fieldId: number,
      body: { answer?: string | null; answerState?: string; useAssetId?: number | null },
    ) =>
      apiFetch<Application>(`/gigs/${gigId}/application/fields/${fieldId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },
  /**
   * Replies found in the mailbox. Note what is missing: nothing here changes a
   * gig's status. Accepting a reply records the judgement and remembers the
   * sender; moving the row is `gigs.patch`, which is the one place that owns
   * what a transition means.
   */
  replies: {
    list: (params?: { resolved?: boolean }) =>
      apiFetch<ReplyFeed>(`/replies${params?.resolved ? '?resolved=true' : ''}`),
    scan: () => apiFetch<ReplyScanResult>('/replies/scan', { method: 'POST' }),
    accept: (id: number, body: { gigId?: number; remember?: boolean } = {}) =>
      apiFetch<{ id: number; gigId: number; gigName: string; currentStatus: string; proposedStatus: string | null; remembered: boolean }>(
        `/replies/${id}/accept`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    dismiss: (id: number) =>
      apiFetch<{ id: number; resolution: string }>(`/replies/${id}/dismiss`, { method: 'POST' }),
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
    patch: (
      body: Partial<DigestSettings> & { day?: Weekday; hour?: number; timezone?: string },
    ) =>
      apiFetch<DigestSettings>('/digest/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  },
}
