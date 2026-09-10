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

/** A library entry a reference document proposes. See shared/artistSource.ts. */
export interface AssetProposal {
  kind: string
  label: string
  value: string
  questionKind: string | null
  variant: string | null
  source: string
  notes: string | null
}

/** A document section nothing could be filed from, named rather than dropped. */
export interface SkippedSection {
  heading: string
  reason: string
}

export interface SourcePreview {
  proposals: AssetProposal[]
  skipped: SkippedSection[]
  existing: string[]
  wouldAdd: number
}

export interface SourceResult {
  added: number
  existing: number
  skipped: SkippedSection[]
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

/** An answer the reply asked for. See shared/replyDraft.ts. */
export interface RecognisedAsk {
  id: string
  label: string
  questionKind: string | null
  attachment: boolean
  /** The sentence it was read from, verbatim. */
  evidence: string
}

export interface ReplyDraft {
  subject: string
  body: string
  asks: RecognisedAsk[]
  answered: string[]
  missing: string[]
  attachments: string[]
  unrecognised: string[]
  gaps: Array<{ marker: string; prompt: string }>
  /** Re-read from the stored snippet rather than the email. */
  approximate: boolean
}

export interface ReplyDraftResponse {
  replyId: number
  gig: { id: number; name: string; status: string } | null
  draft: ReplyDraft
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

/**
 * Fired when the Worker says the session is gone.
 *
 * Every screen makes its own requests, so the first one to be turned away is
 * arbitrary — which is why this is an event rather than a return value. The
 * gate listens once and re-asks who is signed in; without it a session that
 * expires mid-visit reads as every panel on the page failing separately with
 * "not signed in".
 */
export const UNAUTHENTICATED_EVENT = 'mhq:unauthenticated'

/**
 * The server wants the passkey touched again before it will do this.
 *
 * Thrown rather than returned so that a caller which has not been taught to
 * re-assert still fails visibly instead of silently doing nothing.
 */
export class ElevationRequired extends Error {}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    // The session cookie is same-origin and would be sent anyway; saying so
    // keeps it working if the API ever moves to its own host.
    credentials: 'same-origin',
    ...init,
  })
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT))
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error: string
      needsElevation?: boolean
    }
    // Not an error to show: the caller is expected to ask for the passkey and
    // try again. Carried on the error rather than returned, because every
    // caller that does not know about it should keep failing loudly.
    if (err.needsElevation) throw new ElevationRequired(err.error)
    throw new Error(err.error)
  }
  return res.json()
}

/** Which surface this session is on. See docs/multi-tenant-plan.md. */
export type SessionMode = 'artist' | 'admin'

/** Who is signed in, and what the login screen may offer. */
export interface SessionState {
  authenticated: boolean
  label: string | null
  /**
   * 'owner' decides whether the mode switch is offered at all. Null when
   * signed out. Not a grant — every admin route checks it again, because a
   * hidden button is still a URL.
   */
  role: 'owner' | 'artist' | null
  /** Which surface the app should render. Artist unless the session says so. */
  mode: SessionMode
  /** Whether any passkey exists yet. False means set-up, not sign-in. */
  enrolled: boolean
  /** Whether an emailed setup code can be sent at all. */
  recoveryAvailable: boolean
}

/** One artist, as the oversight surface sees them: a name, a date, numbers. */
export interface AdminArtist {
  id: string
  displayName: string | null
  since: string
  accounts: number
  owner: boolean
  usage: {
    day: string
    domainRows: number
    gigRows: number
    promoRows: number
    agentRuns: number
  } | null
}

export interface AdminArtists {
  items: AdminArtist[]
  /** Which usage fields have a writer. The rest are gaps, not zeroes. */
  measured: string[]
}

/** What removing an artist would destroy: a size per table, never content. */
export interface RemovalPreview {
  tenantId: string
  rows: Array<{ table: string; count: number }>
  total: number
  users: number
}

export interface RemovalResult {
  tenantId: string
  rowsDeleted: number
  usersDeleted: number
}

export interface PasskeySummary {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
  /** False means losing the device loses the passkey. */
  backedUp: boolean
  /** The one this browser signed in with. */
  current: boolean
}


/** A Google authorisation granted in the browser. See src/lib/googleGrant.ts. */
export interface GmailGrant {
  connected: boolean
  accountEmail: string | null
  grantedAt: string | null
  lastUsedAt: string | null
  /** False when Google handed back less than was asked for. */
  canDraft: boolean
  /** Whether the deployment can offer this at all. */
  configured: boolean
}

export interface GmailDraftPlan {
  ready: Array<{ id: number; name: string; to: string; subject: string; body: string }>
  skipped: Array<{ id: number; name: string; reason: string }>
  grant: GmailGrant
}

export interface GmailDraftResult {
  created: Array<{ id: number; name: string; draftId: string }>
  failed: Array<{ id: number; name: string; error: string }>
  skipped: Array<{ id: number; name: string; reason: string }>
}

export const api = {
  auth: {
    session: () => apiFetch<SessionState>('/auth/session'),
    logout: () => apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    logoutEverywhere: () => apiFetch<{ ok: boolean }>('/auth/logout-everywhere', { method: 'POST' }),
    loginOptions: () =>
      apiFetch<{ ceremony: string; options: Record<string, unknown> }>('/auth/login/options', {
        method: 'POST',
      }),
    loginVerify: (body: { ceremony: string; response: unknown }) =>
      apiFetch<{ ok: boolean; label: string }>('/auth/login/verify', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    requestCode: () =>
      apiFetch<{ sent: boolean; to: string; expiresAt: string }>('/auth/enrol/request', {
        method: 'POST',
      }),
    registerOptions: (body: { code?: string }) =>
      apiFetch<{ ceremony: string; options: Record<string, unknown> }>('/auth/register/options', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    registerVerify: (body: { ceremony: string; response: unknown; code?: string; label?: string }) =>
      apiFetch<{ ok: boolean; label: string }>('/auth/register/verify', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    elevateOptions: () =>
      apiFetch<{ ceremony: string; options: Record<string, unknown> }>('/auth/elevate/options', {
        method: 'POST',
      }),
    elevateVerify: (body: { ceremony: string; response: unknown }) =>
      apiFetch<{ ok: boolean; confirmedUntil: string | null }>('/auth/elevate/verify', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    /**
     * Move this session between the artist and oversight surfaces.
     *
     * Entering admin mode answers 403 with `needsElevation` until the passkey
     * is touched, so callers wrap it in `withConfirmation` like any other
     * action that changes who can get in.
     */
    setMode: (mode: SessionMode) =>
      apiFetch<{ mode: SessionMode }>('/auth/mode', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      }),
    passkeys: () => apiFetch<{ items: PasskeySummary[] }>('/auth/passkeys'),
    revoke: (id: string) =>
      apiFetch<{ ok: boolean; remaining: number }>(`/auth/passkeys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
  /**
   * Gmail drafting. Connecting is a browser navigation rather than a fetch —
   * it ends at Google's consent screen, which is not something an XHR can
   * show you.
   */
  gmail: {
    status: () => apiFetch<GmailGrant>('/gmail/status'),
    preview: () => apiFetch<GmailDraftPlan>('/gmail/drafts'),
    apply: (ids?: number[]) =>
      apiFetch<GmailDraftResult>('/gmail/drafts', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    disconnect: () => apiFetch<{ ok: boolean }>('/gmail/disconnect', { method: 'POST' }),
    connectHref: '/api/gmail/connect',
  },
  /**
   * The oversight surface.
   *
   * Every call here 403s unless the session is in admin mode, and every call
   * *outside* here 403s while it is — the two surfaces are separate rather
   * than nested, so the app renders one or the other and never both.
   */
  admin: {
    artists: () => apiFetch<AdminArtists>('/admin/artists'),
    removalPreview: (id: string) =>
      apiFetch<RemovalPreview>(`/admin/artists/${encodeURIComponent(id)}/removal`),
    remove: (id: string) =>
      apiFetch<RemovalResult>(`/admin/artists/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  /** What to call this artist. One field, set by them, read by oversight. */
  profile: {
    read: () => apiFetch<{ displayName: string | null }>('/profile'),
    save: (displayName: string | null) =>
      apiFetch<{ displayName: string | null }>('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ displayName }),
      }),
  },
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
    list: (params?: { kind?: string; freshness?: string }) => {
      const qs = new URLSearchParams()
      if (params?.kind) qs.set('kind', params.kind)
      if (params?.freshness) qs.set('freshness', params.freshness)
      return apiFetch<ArtistAssetPage>(`/artist${qs.size ? `?${qs}` : ''}`)
    },
    epk: (audience: EpkAudience) => apiFetch<Epk>(`/artist/epk?audience=${audience}`),
    create: (body: ArtistAssetInput) =>
      apiFetch<{ id: number }>('/artist', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: Partial<ArtistAssetInput>) =>
      apiFetch<ArtistAsset>(`/artist/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    /** Still good: pushes the review date out by the kind's own interval. */
    reviewed: (id: number) => apiFetch<ArtistAsset>(`/artist/${id}/reviewed`, { method: 'POST' }),
    delete: (id: number) => apiFetch<{ ok: boolean }>(`/artist/${id}`, { method: 'DELETE' }),
    /**
     * What the reference documents would add to the library, and then adding
     * it. Two calls rather than one, because a preview you cannot look at
     * before it writes is not a preview.
     */
    sourcePreview: () => apiFetch<SourcePreview>('/artist/source'),
    source: () =>
      apiFetch<SourceResult>('/artist/source', { method: 'POST' }),
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
    /**
     * The answer to their question, drafted from the artist database.
     * Composed on read, so an entry added since the mail arrived appears
     * without a re-scan. Nothing here sends anything.
     */
    draft: (id: number) => apiFetch<ReplyDraftResponse>(`/replies/${id}/draft`),
  },
  /**
   * Filling the columns migration 0001 added and nobody wrote to. Preview
   * first, then apply — a bulk write you cannot look at is one you find out
   * about afterwards.
   */
  backfill: {
    preview: () => apiFetch<BackfillPlan>('/backfill/notes'),
    apply: () => apiFetch<BackfillResult>('/backfill/notes', { method: 'POST' }),
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

/** One row a notes backfill would touch. See src/routes/backfill.ts. */
export interface BackfillRowPlan {
  table: 'gig' | 'sync'
  id: number
  name: string
  changes: Array<{ column: string; from: string | number | null; to: string | number | null }>
}

export interface BackfillPlan {
  scanned: number
  wouldChange: number
  byColumn: Record<string, number>
  rows: BackfillRowPlan[]
  /** When the one-shot cron run did this, or null if it never has. */
  ranAt: string | null
}

export interface BackfillResult {
  scanned: number
  changed: number
  byColumn: Record<string, number>
}
