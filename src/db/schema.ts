import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const gigOpportunities = sqliteTable('gig_opportunities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  organizer: text('organizer'),
  submissionMethod: text('submission_method'), // 'email' | 'portal' | 'form'
  audienceSize: integer('audience_size'),
  genreFitScore: integer('genre_fit_score'), // 1-5
  deadline: text('deadline'), // ISO date after migration 0003; legacy rows may still hold prose
  deadlineNote: text('deadline_note'), // the qualifier the prose carried ("rolling intake", "TBD")
  opensAt: text('opens_at'), // when a submission window opens, distinct from when it closes
  feeAmount: real('fee_amount'),
  feeCurrency: text('fee_currency').default('USD'),
  fee: text('fee'), // legacy column, kept during migration
  paid: integer('paid').default(0), // 0/1 boolean
  fitNotes: text('fit_notes'), // legacy column
  fitRationale: text('fit_rationale'),
  url: text('url'),
  status: text('status').default('pending_review'),
  googleEventId: text('google_event_id'),
  snoozedUntil: text('snoozed_until'), // ISO date this comes back on its own
  snoozedAt: text('snoozed_at'), // when the snooze was set — see migration 0004
  discoveredAt: text('discovered_at').notNull(),
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
  snoozedUntil: text('snoozed_until'),
  snoozedAt: text('snoozed_at'),
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
  reminderType: text('reminder_type').notNull(), // 'pre_deadline' | 'follow_up'
  scheduledFor: text('scheduled_for').notNull(),
  status: text('status').default('pending'), // 'pending' | 'sent' | 'dismissed'
  createdAt: text('created_at').notNull(),
})

/**
 * What the digest has already told you about each item, and under which
 * heading. See migration 0005 — the fingerprint is what makes "never repeat an
 * item that has not changed" enforceable.
 */
export const digestReports = sqliteTable('digest_reports', {
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  grp: text('grp').notNull(),
  fingerprint: text('fingerprint').notNull(),
  reportedAt: text('reported_at').notNull(),
})

/** Key/value settings that must be changeable without a deploy. */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export type GigOpportunity = typeof gigOpportunities.$inferSelect
export type SyncTarget = typeof syncTargets.$inferSelect
export type PromoDraft = typeof promoDrafts.$inferSelect
export type ReferenceDoc = typeof referenceDocs.$inferSelect
export type TaskRun = typeof taskRuns.$inferSelect
export type Reminder = typeof reminders.$inferSelect
export type DigestReport = typeof digestReports.$inferSelect
export type AppSetting = typeof appSettings.$inferSelect
