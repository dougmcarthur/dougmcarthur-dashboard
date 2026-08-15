export type GigStatus =
  | 'pending_review'
  | 'approved'
  | 'awaiting_window'
  | 'rejected'
  | 'submitted'
  | 'archived'
export type SyncStatus = 'draft_ready' | 'pitched' | 'confirmed' | 'declined' | 'archived'
export type WindowState = 'open' | 'upcoming' | 'closed' | 'unknown'
export type PrepStatus = 'none' | 'queued' | 'ready' | 'blocked' | 'failed'

export interface GigOpportunity {
  id: number
  name: string
  type: string
  organizer: string | null
  submissionMethod: 'email' | 'portal' | 'form' | null
  audienceSize: number | null
  genreFitScore: number | null
  deadline: string | null
  feeAmount: number | null
  feeCurrency: string | null
  fee: string | null // legacy
  paid: number
  fitNotes: string | null // legacy
  fitRationale: string | null
  url: string | null
  status: GigStatus
  googleEventId: string | null
  // Submission window
  submissionOpensAt: string | null
  submissionClosesAt: string | null
  windowNote: string | null
  applicationUrl: string | null
  loginRequired: number
  // Application prep
  prepStatus: PrepStatus | null
  prepError: string | null
  prepUpdatedAt: string | null
  formTitle: string | null
  discoveredAt: string
  updatedAt: string
}

export interface ApplicationField {
  id: number
  gigId: number
  fieldKey: string
  label: string
  fieldType: string
  options: string | null // JSON array
  required: number
  maxLength: number | null
  helpText: string | null
  position: number
  draftAnswer: string | null
  answer: string | null
  answerSource: 'llm' | 'profile' | 'manual' | 'library' | null
  confidence: 'high' | 'medium' | 'low' | null
  needsInput: number
  note: string | null
  approved: number
  questionKind: string | null
  libraryId: number | null
  // Annotations added by the API when reading an application
  libraryLabel?: string | null
  libraryDrift?: boolean
  harvestable?: boolean
  createdAt: string
  updatedAt: string
}

export type LibraryCategory = 'identity' | 'links' | 'story' | 'pitch' | 'logistics'

export interface LibraryEntry {
  id: number
  questionKey: string
  label: string
  category: LibraryCategory | string
  content: string
  maxLength: number | null
  notes: string | null
  pinned: number
  usageCount: number
  lastUsedAt: string | null
  sourceGigId: number | null
  createdAt: string
  updatedAt: string
  usedBy: Array<{ gigId: number; gigName: string | null }>
}

export interface QuestionKindOption {
  key: string
  label: string
  category: LibraryCategory | string
  lengthSensitive: boolean
}

export interface LibraryResponse {
  entries: LibraryEntry[]
  kinds: QuestionKindOption[]
}

export interface HarvestResult {
  entry?: LibraryEntry
  action: 'created' | 'updated' | 'linked' | 'unchanged' | 'conflict' | 'skipped'
  error?: string
}

export interface ApplicationPrep {
  gigId: number
  gigName: string
  formTitle: string | null
  applicationUrl: string | null
  loginRequired: boolean
  prepStatus: PrepStatus
  prepError: string | null
  prepUpdatedAt: string | null
  windowState: WindowState
  submissionOpensAt: string | null
  submissionClosesAt: string | null
  stats: {
    total: number
    answered: number
    needsInput: number
    approved: number
    fromLibrary: number
    drifted: number
  }
  fields: ApplicationField[]
}

export interface PrepResult {
  gigId: number
  status: 'ready' | 'blocked' | 'failed'
  fieldCount: number
  usedLlm: boolean
  libraryHits: number
  formTitle: string | null
  loginRequired: boolean
  error?: string
}

export interface GigPrepCounts {
  total: number
  needsInput: number
  approved: number
}

export type GigWithPrep = GigOpportunity & { prep: GigPrepCounts }

export interface SyncTarget {
  id: number
  name: string
  agencyType: string | null
  contactEmail: string | null
  contactRole: string | null
  confirmationMethod: string | null
  notes: string | null
  pitchDraft: string | null
  pitchSent: string | null
  status: SyncStatus
  discoveredAt: string
  updatedAt: string
  reconciledAt: string | null
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

export interface PromoDraft {
  id: number
  month: string
  title: string
  content: string
  status: string
  createdAt: string
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
  stats: {
    totalGigs: number
    totalSync: number
    totalPromo: number
    awaitingWindow: number
    applicationsReady: number
  }
  recentRuns: TaskRun[]
  pendingReview: {
    gigs: GigOpportunity[]
    sync: SyncTarget[]
    promo: PromoDraft[]
  }
  upcomingDeadlines: GigOpportunity[]
  dueReminders: DueReminder[]
  awaitingWindow: GigWithPrep[]
  applicationsReady: GigWithPrep[]
  applicationsBlocked: GigWithPrep[]
}

export interface ScheduledSummary {
  windowsOpened: number
  prepared: number
  prepFailed: number
  remindersSent: number
  remindersFailed: number
  notes: string[]
}

export interface ReferenceDoc {
  id: string
  title: string
  content: string
  updatedAt: string
}

export interface HealthStatus {
  calendarConfigured: boolean
  calendarMissingSecrets: string[]
  gmailConfigured: boolean
  gmailMissingSecrets: string[]
  emailConfigured: boolean
  emailMissingSecrets: string[]
  answerDraftingConfigured: boolean
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
  gigs: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return apiFetch<GigOpportunity[]>(`/gigs${qs}`)
    },
    patch: (id: number, body: Partial<GigOpportunity>) =>
      apiFetch<GigOpportunity>(`/gigs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: number) => apiFetch<{ ok: boolean }>(`/gigs/${id}`, { method: 'DELETE' }),
    create: (body: Partial<Omit<GigOpportunity, 'id' | 'discoveredAt' | 'updatedAt'>>) =>
      apiFetch<{ id: number }>('/gigs', { method: 'POST', body: JSON.stringify(body) }),
  },
  applications: {
    get: (gigId: number) => apiFetch<ApplicationPrep>(`/gigs/${gigId}/application`),
    prepare: (gigId: number) =>
      apiFetch<PrepResult>(`/gigs/${gigId}/application/prepare`, { method: 'POST' }),
    exportText: (gigId: number) =>
      apiFetch<{ text: string }>(`/gigs/${gigId}/application/export`),
    addField: (gigId: number, body: { label: string; fieldType?: string; answer?: string }) =>
      apiFetch<ApplicationField>(`/gigs/${gigId}/application/fields`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    patchField: (
      id: number,
      body: { answer?: string | null; approved?: boolean; needsInput?: boolean; label?: string },
    ) =>
      apiFetch<ApplicationField>(`/application-fields/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteField: (id: number) =>
      apiFetch<{ ok: boolean }>(`/application-fields/${id}`, { method: 'DELETE' }),
    saveToLibrary: (fieldId: number, overwrite?: boolean) =>
      apiFetch<HarvestResult>('/answer-library/from-field', {
        method: 'POST',
        body: JSON.stringify({ fieldId, overwrite }),
      }),
    approveAll: (gigId: number) =>
      apiFetch<{ ok: boolean; libraryAdded: number; libraryConflicts: number }>(
        '/application-fields/approve-all',
        { method: 'POST', body: JSON.stringify({ gigId }) },
      ),
  },
  library: {
    list: () => apiFetch<LibraryResponse>('/answer-library'),
    create: (body: {
      questionKey: string
      content: string
      label?: string
      category?: string
      maxLength?: number | null
      notes?: string | null
    }) => apiFetch<LibraryEntry>('/answer-library', { method: 'POST', body: JSON.stringify(body) }),
    patch: (
      id: number,
      body: { content?: string; label?: string; notes?: string | null; pinned?: boolean },
    ) =>
      apiFetch<LibraryEntry>(`/answer-library/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/answer-library/${id}`, { method: 'DELETE' }),
    seed: () =>
      apiFetch<{ created: number; skipped: string[] }>('/answer-library/seed', { method: 'POST' }),
    fromField: (fieldId: number, opts?: { questionKey?: string; overwrite?: boolean }) =>
      apiFetch<HarvestResult>('/answer-library/from-field', {
        method: 'POST',
        body: JSON.stringify({ fieldId, ...opts }),
      }),
  },
  tasks: {
    run: () => apiFetch<ScheduledSummary>('/tasks/run', { method: 'POST' }),
  },
  sync: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return apiFetch<SyncTarget[]>(`/sync${qs}`)
    },
    create: (body: Omit<SyncTarget, 'id' | 'discoveredAt' | 'updatedAt' | 'reconciledAt' | 'pitchSent'>) =>
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
}
