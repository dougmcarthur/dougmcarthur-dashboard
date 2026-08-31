# Notifications

A bell in the header with an unread count, opening a pane that collects the
things that happened across the app while you were not looking.

## 1. The distinction the whole feature rests on

**A notification is an event. The dashboard shows state.**

Everything that goes wrong with notification systems starts by confusing those
two. "18 items need a decision" is state — it is already on the Overview, it is
true until you act, and putting it in a feed means the feed is never empty.
"Two snoozed items came back yesterday" is an event: it happened at a moment,
you may not have seen it, and once seen it is done.

So the rule is: **if it is visible on a screen you already open, it is not a
notification.** The queue, the backlog and the time-critical strip stay where
they are. Notifications carry the delta.

## 2. What earns a notification

Seven sources, all of which the app already computes and none of which
currently surface anywhere you would see them.

| Source | Example | Tier |
|---|---|---|
| Connection health | Calendar or Gmail token rejected; email binding missing | Critical |
| Data health | Orphaned reminder; a status that contradicts its own note | Critical |
| Deadline crossings | An item entered the 14-day window, or went overdue | Attention |
| Snooze wake-ups | A deferred item came back, on time or because it changed | Attention |
| Reconcile findings | Gmail says a pitch was sent that is still marked draft | Attention |
| Automation runs | `gig-research` added 3; a run came back `partial` | Info |
| Digest | Sent, or failed to send | Info |

Three tiers, not five. More tiers than that and nobody remembers what they mean.

### Tiers are lightness, not hue

Clay for critical, strong ink for attention, muted for info — the same
two-hue discipline as the rest of the app. A third hue would put the palette
back where it started, and severity read through lightness survives every form
of colour blindness.

Ordering is tier first, then recency. A broken Calendar never sits below a
research run that added two rows.

## 3. Two kinds of notification, two mechanisms

This is the part worth getting right, because picking one mechanism for both
is what makes these systems rot.

### Conditions — derived, never stored

A connection being down, an item being overdue, a contradictory status: these
are **facts about the present**, recomputed on every read. They are not written
to a table.

What *is* stored is a row per `dedupe_key` recording when it was first seen and
whether it has been read:

```sql
CREATE TABLE notification_marks (
  dedupe_key  TEXT PRIMARY KEY,   -- 'connection:calendar', 'overdue:gig:14'
  first_seen  TEXT NOT NULL,
  read_at     TEXT,
  dismissed_at TEXT
);
```

The payoff is that conditions **self-heal**. Reconnect Calendar and the
notification is gone on the next read, because the condition that generated it
no longer holds. Nothing has to remember to delete it. This is the same shape
as `digest_reports`, which already works this way.

### Events — stored, immutable

A run finishing, a digest sending, a snooze waking: these happened at a moment
and are not recoverable from current state. They get a real row.

```sql
CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,      -- 'automation' | 'digest' | 'snooze_woke' | 'reconcile'
  tier        TEXT NOT NULL,      -- 'critical' | 'attention' | 'info'
  title       TEXT NOT NULL,
  body        TEXT,
  href        TEXT,               -- deep link, e.g. '#review/paid'
  action_label TEXT,              -- 'Reconnect', 'Review'
  entity_type TEXT, entity_id INTEGER,
  created_at  TEXT NOT NULL,
  read_at     TEXT
);
```

Events are pruned after 30 days. Nobody needs to know a research run finished
six weeks ago; that is what History is for.

The API merges both into one sorted list. The client never learns there were
two mechanisms.

## 4. The badge must be able to reach zero

The single most common failure: a badge wired to *unresolved* rather than
*unread*, which therefore never clears, which teaches you to stop looking at
it. This is worse than having no badge.

So:

- The badge counts **unread**, and only unread.
- Reading is cheap and explicit: opening an item marks it read. **Opening the
  pane does not** — a badge that clears on a glance is a badge that clears
  before you have read anything.
- "Mark all read" exists for when you genuinely do not care.
- A dismissed critical whose condition still holds **comes back tomorrow**.
  Dismissal is "not now", not "never" — the connection is still broken.

## 5. Grouping, so it cannot flood

Same-kind events inside 24 hours collapse to one row: *"Research added 3
opportunities"*, not three rows. Snooze wake-ups collapse the same way:
*"2 snoozed items came back"* with the names in the body.

Cap the pane at 20 rows with a "View all" into History. A feed that scrolls
forever is a log, and we already have one of those.

## 6. Delivery

No websockets. For one user on a Worker with D1:

- Poll `GET /api/notifications` every 60s **while the tab is visible**, paused
  via `visibilitychange` so a backgrounded tab costs nothing.
- Refetch immediately on focus, because the interesting case is coming back to
  the tab after an hour away.
- Refetch after any mutation that could generate one (approving a gig that
  fails to create a Calendar event should notify at once).

If it ever needs to be genuinely live, Server-Sent Events from the Worker are
the next step — but polling is right until there is a second user.

## 7. Endpoints

```
GET   /api/notifications          -> { items[], unread, unreadCritical }
POST  /api/notifications/read     -> { ids: [] } | { all: true }
POST  /api/notifications/dismiss  -> { dedupe_key | id }
```

Condition-derived rows come back with a `dedupe_key` and no `id`; event rows
have both. The client treats them identically.

## 8. Accessibility

- The bell's accessible name carries the count: `"Notifications, 3 unread"` —
  the badge is decorative and `aria-hidden`.
- The list is `aria-live="polite"` so an arriving notification is announced
  without stealing focus.
- Escape closes; focus returns to the bell; the pane and the overflow menu are
  mutually exclusive.
- Tier is never colour alone — each row carries an icon and, for criticals, the
  word in the title.

## 9. Build order

| Phase | Work |
|---|---|
| 1 | `notification_marks` table, the condition generators (connection, data health, deadline, snooze), `GET /api/notifications`, read/dismiss. Conditions only — no new table for events yet. |
| 2 | Bell, badge, pane in the header. Polling with visibility pause. |
| 3 | `notifications` table for events; automation runs and digest sends write to it. Grouping. |
| 4 | Pruning, "View all" into History, and delete the standalone alarm banner the pane replaces. |

Phase 1 and 2 alone are worth shipping: they cover every critical, and the
critical ones are the only notifications that can cost you something.

## 10. What this feature must never become

- A feed of everything the system did. That is History.
- A second copy of the queue. That is the Overview.
- A badge that never reaches zero.
