-- Migration: prepare applications when the window opens, not before
-- Apply with: wrangler d1 migrations apply dougmcarthur-music-hq --remote
--
-- Application forms usually aren't published until submissions open, so prep
-- now waits for the window and the notification waits for prep. These two
-- columns track that: how many times prep has been tried for the current
-- window, and whether the "answers are ready" email has gone out.

ALTER TABLE gig_opportunities ADD COLUMN prep_attempts INTEGER DEFAULT 0;
ALTER TABLE gig_opportunities ADD COLUMN answers_notified_at TEXT;

-- Reminders scheduled under the old model announced the window opening before
-- anything had been prepared. Those are superseded by the answers-ready email.
UPDATE reminders
   SET status = 'dismissed'
 WHERE status = 'pending'
   AND reminder_type IN ('window_soon', 'window_opens');
