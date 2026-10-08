-- The decision log: what an artist chose, and what the screen showed them when
-- they chose it.
--
-- A gig's `status`, `outcome` and `flag` say where it ended up. They do not say
-- when, in what order, or against what: a gig passed on in March because it
-- closed in a week and one passed on because it cost $2,400 to reach are the
-- same row afterwards. Scoring an opportunity for one artist — and checking
-- whether a score was any good — needs the second kind of fact, and it cannot
-- be reconstructed once the row has moved on. The deadline was a week away
-- *then*; the cost range was whatever the row said *then*.
--
-- Nothing reads this yet. It is written first because every week without it is
-- data that cannot be regenerated. See docs/gig-pipeline-plan.md §8, which asks
-- for exactly this ("the score at decision time is stored").
--
-- One row per move: a status change, a snooze set or cleared, or a row removed.
-- `context` is JSON, built by shared/decisionLog.ts from an allow-list of
-- listing facts and derived flags — never notes, drafts or anything the artist
-- wrote — and carries a version so a later reader can tell what it is looking
-- at.
--
-- The seventeenth scoped table. `tenant_id` has no default, unlike the older
-- ones: those had to be readable by a Worker that predates tenants, and this
-- table is new, so a write that forgot the tenant should fail instead of
-- landing on the owner. `entity_id` has no foreign key, deliberately — the row
-- it names can be deleted, and a decision about it is still a decision.
--
-- Additive: a new table the deployed Worker never names.

CREATE TABLE IF NOT EXISTS decision_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  -- gig | sync
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  -- The shared catalog entry the row was linked to at the time, when it was.
  opportunity_id INTEGER,
  -- move | snooze | wake | remove
  action TEXT NOT NULL,
  -- For a move, the status either side of it, in the fourteen-value vocabulary
  -- the code reasons in. For a snooze, `to_value` is the date it comes back on.
  from_value TEXT,
  to_value TEXT,
  -- The same move in the screens' language, so a reader need not translate.
  to_stage TEXT,
  to_outcome TEXT,
  -- Which door it came through: gig_patch | gig_delete | snooze |
  -- application_start | sync_patch | sync_reconcile. A step that follows a
  -- choice already made (application_start) is not a choice, and a learner
  -- needs to be able to tell.
  via TEXT NOT NULL,
  -- user | agent. A research agent PATCHing a row is not the artist deciding.
  actor TEXT NOT NULL,
  context TEXT NOT NULL,
  decided_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS decision_log_tenant_time ON decision_log (tenant_id, decided_at);
CREATE INDEX IF NOT EXISTS decision_log_tenant_entity ON decision_log (tenant_id, entity_type, entity_id);
