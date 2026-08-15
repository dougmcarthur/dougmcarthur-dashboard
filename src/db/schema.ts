import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const gigOpportunities = sqliteTable('gig_opportunities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  organizer: text('organizer'),
  submissionMethod: text('submission_method'), // 'email' | 'portal' | 'form'
  audienceSize: integer('audience_size'),
  genreFitScore: integer('genre_fit_score'), // 1-5
  deadline: text('deadline'),
  feeAmount: real('fee_amount'),
  feeCurrency: text('fee_currency').default('USD'),
  fee: text('fee'), // legacy column, kept during migration
  paid: integer('paid').default(0), // 0/1 boolean
  fitNotes: text('fit_notes'), // legacy column
  fitRationale: text('fit_rationale'),
  url: text('url'),
  status: text('status').default('pending_review'),
  googleEventId: text('google_event_id'),
  // Submission window
  submissionOpensAt: text('submission_opens_at'),
  submissionClosesAt: text('submission_closes_at'),
  windowNote: text('window_note'),
  applicationUrl: text('application_url'),
  loginRequired: integer('login_required').default(0),
  // Application prep
  prepStatus: text('prep_status').default('none'), // none|queued|ready|blocked|failed
  prepError: text('prep_error'),
  prepUpdatedAt: text('prep_updated_at'),
  formTitle: text('form_title'),
  discoveredAt: text('discovered_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const applicationFields = sqliteTable('application_fields', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gigId: integer('gig_id').notNull(),
  fieldKey: text('field_key').notNull(),
  label: text('label').notNull(),
  fieldType: text('field_type').notNull().default('text'),
  options: text('options'), // JSON array
  required: integer('required').default(0),
  maxLength: integer('max_length'),
  helpText: text('help_text'),
  position: integer('position').default(0),
  draftAnswer: text('draft_answer'),
  answer: text('answer'),
  answerSource: text('answer_source'), // llm | profile | manual
  confidence: text('confidence'), // high | medium | low
  needsInput: integer('needs_input').default(0),
  note: text('note'),
  approved: integer('approved').default(0),
  questionKind: text('question_kind'),
  libraryId: integer('library_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const answerLibrary = sqliteTable('answer_library', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  questionKey: text('question_key').notNull(),
  label: text('label').notNull(),
  category: text('category').notNull(),
  content: text('content').notNull(),
  maxLength: integer('max_length'),
  notes: text('notes'),
  pinned: integer('pinned').default(0),
  usageCount: integer('usage_count').default(0),
  lastUsedAt: text('last_used_at'),
  sourceGigId: integer('source_gig_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const syncTargets = sqliteTable('sync_targets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  agencyType: text('agency_type'),
  contactEmail: text('contact_email'),
  contactRole: text('contact_role'),
  confirmationMethod: text('confirmation_method'),
  notes: text('notes'),
  pitchDraft: text('pitch_draft'),
  pitchSent: text('pitch_sent'),
  status: text('status').default('draft_ready'),
  discoveredAt: text('discovered_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  reconciledAt: text('reconciled_at'),
})

export const promoDrafts = sqliteTable('promo_drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  month: text('month').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  status: text('status').default('draft'),
  createdAt: text('created_at').notNull(),
})

export const referenceDocs = sqliteTable('reference_docs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const taskRuns = sqliteTable('task_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull(),
  runAt: text('run_at').notNull(),
  status: text('status').notNull(),
  summary: text('summary'),
  itemsAdded: integer('items_added').default(0),
})

export const reminders = sqliteTable('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type').notNull(), // 'gig' | 'sync'
  entityId: integer('entity_id').notNull(),
  // 'pre_deadline' | 'follow_up' | 'window_opens' | 'window_soon'
  reminderType: text('reminder_type').notNull(),
  scheduledFor: text('scheduled_for').notNull(),
  status: text('status').default('pending'), // 'pending' | 'sent' | 'dismissed'
  channel: text('channel').default('email'),
  subject: text('subject'),
  body: text('body'),
  sentAt: text('sent_at'),
  error: text('error'),
  createdAt: text('created_at').notNull(),
})

export type GigOpportunity = typeof gigOpportunities.$inferSelect
export type ApplicationField = typeof applicationFields.$inferSelect
export type AnswerLibraryEntry = typeof answerLibrary.$inferSelect
export type SyncTarget = typeof syncTargets.$inferSelect
export type PromoDraft = typeof promoDrafts.$inferSelect
export type ReferenceDoc = typeof referenceDocs.$inferSelect
export type TaskRun = typeof taskRuns.$inferSelect
export type Reminder = typeof reminders.$inferSelect
