-- Google Tasks as a second destination, and somewhere to say which things go
-- where.
--
-- The calendar was the only place Scout could put anything, and it was the
-- wrong shape for most of what it wrote. A calendar entry is a claim that you
-- have to be somewhere; an application deadline is not that — nothing happens
-- on the day except that a form closes. Putting the two side by side in one
-- diary makes a festival you are playing look like a form you have not filled
-- in, which is the same confusion the status rename exists to end.
--
-- So: confirmed shows stay on the calendar, and the work — deadlines, windows
-- opening, replies owed — goes to Google Tasks. `shared/nudgeRouting.ts` holds
-- the rules, and this migration holds the three things they need in D1.
--
-- 1. THE TASK LIST ID, on the grant.
--
-- Google offers no narrow Tasks scope. There is `tasks.readonly`, which
-- cannot write, and `tasks`, which is read and write over every list in the
-- account — no `tasks.app.created`. So this is the `gmail.compose` trade
-- rather than the `calendar.app.created` one: the limit is kept by
-- src/lib/googleTasks.ts naming one list and never enumerating, not by
-- Google. The id belongs to the grant for the same reason `calendar_id` does
-- — a new grant is a new list — and it is a separate column rather than a
-- reuse, because a column called `calendar_id` holding a task list id is a
-- name that lies to the next reader.
--
-- 2. THE TASK IDS, on the gig.
--
-- Three more, beside the three event ids already there. The reconcile
-- compares wanted-against-present, so it needs somewhere to record what it
-- made. `reply_task_id` has no calendar counterpart on purpose: a reply you
-- owe has no date it happens on, so it can only ever be a task.
--
-- 3. TENANT_SETTINGS, which is new.
--
-- `app_settings` is platform state — the digest schedule, the one-shot
-- markers — and these preferences are not. Two artists want different answers
-- about their own calendars, so this is the fifteenth scoped table and goes
-- through src/db/scope.ts like the other fourteen. Key/value rather than
-- columns because the set will grow and a column per preference is a
-- migration per preference.
--
-- All three are additive: new columns and a new table, so the currently
-- deployed Worker reads everything it already read, unchanged, across the
-- migrate-then-deploy gap. It selects named columns and never SELECT *.

ALTER TABLE google_grants ADD COLUMN tasks_list_id TEXT;

ALTER TABLE gig_opportunities ADD COLUMN opens_task_id TEXT;
ALTER TABLE gig_opportunities ADD COLUMN deadline_task_id TEXT;
ALTER TABLE gig_opportunities ADD COLUMN reply_task_id TEXT;

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT NOT NULL DEFAULT 'doug',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

-- The default above matches migration 0021's, and is there for the same
-- reason: with it in place a write cannot produce a NULL tenant, so the
-- constraint `withTenant` and test/tenantScope.test.ts already make
-- unreachable is guarded by the schema too.
