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
  status: text('status').default('discovered'),
  /** Calendar id for the "apply by" deadline reminder. See migration 0008. */
  googleEventId: text('google_event_id'),
  /** Calendar id for the "applications open" reminder. */
  opensEventId: text('opens_event_id'),
  /** Calendar id for the performance itself. Only ever set once booked. */
  showEventId: text('show_event_id'),
  /** When you are actually on stage. Null until something reaches `booked`. */
  performanceStart: text('performance_start'),
  performanceEnd: text('performance_end'),
  /** The pre-rename status, kept so a bad reading can be argued with. */
  legacyStatus: text('legacy_status'),
  /**
   * ISO datetime the application actually went out. Written once, on the
   * transition into the submitted phase, and never cleared — it is a fact
   * about the past. Null on every row that reached that phase before
   * migration 0010, which is why nothing may treat it as required.
   */
  submittedAt: text('submitted_at'),
  /**
   * Where the application form lives, when that is not the listing URL. The
   * research agents fill `url` with the page they found it on, which is often
   * an announcement rather than the form. See migration 0011.
   */
  applicationUrl: text('application_url'),
  /** unread | ready | blocked | failed — whether the form has been read. */
  prepStatus: text('prep_status'),
  prepCheckedAt: text('prep_checked_at'),
  /** Why it could not be read, in a sentence, verbatim from the parser. */
  prepNote: text('prep_note'),
  /**
   * What the trip costs, and the paperwork that gates it. Migration 0013.
   *
   * `location` is prose because that is how the research agents write it;
   * `country` is separate and coarse because the visa rule turns on that one
   * fact. `travelBand` and `lodgingTier` are set by hand — `shared/gigCost.ts`
   * guesses from `location` when they are null, and says that it guessed.
   */
  location: text('location'),
  country: text('country'), // CA | US | other
  travelBand: text('travel_band'), // drive | regional | transcontinental | international
  lodgingTier: text('lodging_tier'), // none | standard | major
  nights: integer('nights'), // 0 is a real answer; null is not
  /**
   * showcase | paid. The fact that decides whether a US date needs a P-2
   * (about $800 and ninety days) or nothing at all. Nullable and treated as
   * an open question, never as "showcase".
   */
  performanceKind: text('performance_kind'),
  /** What they pay you. Distinct from `feeAmount`, which is what you pay them. */
  stipendAmount: real('stipend_amount'),
  guaranteeAmount: real('guarantee_amount'),
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

/**
 * The artist database. See migration 0009 and shared/artistAssets.ts.
 *
 * `reviewBy` and `questionKind` are the two columns that make this more than a
 * folder: one says when an asset stops being trustworthy, the other says which
 * canonical application question it answers.
 */
export const artistAssets = sqliteTable('artist_assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  label: text('label').notNull(),
  value: text('value'),
  questionKind: text('question_kind'),
  variant: text('variant'),
  charCount: integer('char_count'),
  credit: text('credit'),
  usageRights: text('usage_rights'),
  reviewBy: text('review_by'),
  source: text('source'),
  notes: text('notes'),
  sortOrder: integer('sort_order').default(0),
  archived: integer('archived').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * The questions one application asks, and the answer staged against each.
 * See migration 0011 and shared/application.ts.
 *
 * `answer_state` is the column that makes this more than a cache of somebody
 * else's form: it separates "the app proposed this" from "you read it and said
 * yes", which is the difference between an application and a pile of guesses.
 */
export const applicationFields = sqliteTable('application_fields', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gigId: integer('gig_id').notNull(),
  fieldKey: text('field_key').notNull(),
  label: text('label').notNull(),
  fieldType: text('field_type').notNull().default('text'),
  /** JSON array for select/radio/checkbox. */
  options: text('options'),
  required: integer('required').default(0),
  maxLength: integer('max_length'),
  helpText: text('help_text'),
  position: integer('position').default(0),
  questionKind: text('question_kind'),
  answer: text('answer'),
  answerAssetId: integer('answer_asset_id'),
  answerState: text('answer_state').notNull().default('empty'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * Replies found in the mailbox, and how each was read. See migration 0012 and
 * shared/replyClassify.ts.
 *
 * Every row is a proposal. `proposedStatus` is what the reading *would* do;
 * nothing acts on it until a person accepts, because a wrong auto-transition
 * tells you that you were rejected when you were not.
 */
export const gigReplies = sqliteTable('gig_replies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gmailMessageId: text('gmail_message_id').notNull(),
  gmailThreadId: text('gmail_thread_id').notNull(),
  /** Null while nothing matched, or while two gigs matched equally well. */
  gigId: integer('gig_id'),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name'),
  subject: text('subject'),
  snippet: text('snippet'),
  receivedAt: text('received_at').notNull(),
  inSpam: integer('in_spam').default(0),
  classification: text('classification').notNull().default('unclear'),
  classConfidence: text('class_confidence'),
  /** The organiser's own sentence, verbatim. */
  evidence: text('evidence'),
  proposedStatus: text('proposed_status'),
  matchScore: integer('match_score').default(0),
  matchSignals: text('match_signals'),
  matchAmbiguous: integer('match_ambiguous').default(0),
  resolution: text('resolution'),
  resolvedAt: text('resolved_at'),
  /**
   * What the organiser asked for, as JSON, read at scan time while the whole
   * body is in hand — the snippet is 400 characters and an ask can sit below
   * it. See migration 0015 and shared/replyDraft.ts.
   */
  asks: text('asks'),
  /** Request sentences that matched nothing this app knows how to answer. */
  unrecognisedAsks: text('unrecognised_asks'),
  createdAt: text('created_at').notNull(),
})

/**
 * Who writes about which opportunity, learned by confirmation.
 *
 * The answer to the problem that makes phase 4 hard: replies almost never come
 * from the festival's own domain, so the first match is worked out from the
 * event's name and every one after it is a lookup.
 */
export const gigCorrespondents = sqliteTable('gig_correspondents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  gigId: integer('gig_id').notNull(),
  kind: text('kind').notNull(), // 'address' | 'thread'
  value: text('value').notNull(),
  createdAt: text('created_at').notNull(),
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

/**
 * What you have already seen. See migration 0006 — there is no notifications
 * table because phase 1 carries only conditions, which are derived on read.
 */
export const notificationMarks = sqliteTable('notification_marks', {
  dedupeKey: text('dedupe_key').primaryKey(),
  firstSeen: text('first_seen').notNull(),
  readAt: text('read_at'),
  dismissedAt: text('dismissed_at'),
})

/**
 * Notifications that are events rather than conditions. See migration 0007.
 *
 * The other half of the bell. `notificationMarks` above covers conditions,
 * which are recomputed on every read and need no row of their own; this covers
 * the things that happened at a moment and are gone if nobody wrote them down.
 */
export const notificationEvents = sqliteTable('notification_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(), // 'automation' | 'digest' | 'reconcile'
  tier: text('tier').notNull(), // 'critical' | 'attention' | 'info'
  title: text('title').notNull(),
  body: text('body'),
  href: text('href'),
  actionLabel: text('action_label'),
  /** Set only where a writer needs at-most-once; unique when present. */
  dedupeKey: text('dedupe_key'),
  createdAt: text('created_at').notNull(),
  readAt: text('read_at'),
  dismissedAt: text('dismissed_at'),
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
export type ArtistAsset = typeof artistAssets.$inferSelect
export type ApplicationFieldRow = typeof applicationFields.$inferSelect
export type GigReplyRow = typeof gigReplies.$inferSelect
export type GigCorrespondentRow = typeof gigCorrespondents.$inferSelect
export type TaskRun = typeof taskRuns.$inferSelect
export type Reminder = typeof reminders.$inferSelect
export type DigestReport = typeof digestReports.$inferSelect
export type AppSetting = typeof appSettings.$inferSelect
export type NotificationMark = typeof notificationMarks.$inferSelect
export type NotificationEvent = typeof notificationEvents.$inferSelect
