# Handoff Report — Explorer 1 (Core Hub & Discovery Audit)

## 1. Observation
Across the Core Hub & Discovery routes (`#overview`, `#review`, `#gigs`, `#sync`) and their associated frontend components in `frontend/src/`, the following specific conditions and anomalies were observed:

### Contrast Floor Violations (`text-faint` on readable copy)
`GEMINI.md` §6 and `.agents/skills/ui-rules/SKILL.md` §2 explicitly mandate: `text-faint` is **decorative only** (dividers, empty-cell dashes `'—'`, disabled states) and **never** on readable prose, captions, or form labels (`text-muted` is the floor for readable text).
However, multiple readable sentences, labels, and timestamps use `text-faint`:
- `frontend/src/components/ReplyInbox.tsx:75`: `<span className="text-xs text-faint">low confidence</span>`
- `frontend/src/components/ReplyInbox.tsx:82`: `<span className="text-xs text-faint ml-auto">{shortDate(reply.receivedAt)}</span>`
- `frontend/src/components/ReplyInbox.tsx:86`: `<p className="text-xs text-faint">{reply.fromName ? ... : ''}{reply.fromAddress}</p>`
- `frontend/src/components/ReplyInbox.tsx:277`: `<span className="text-xs text-faint">{note}</span>` (scan summary note)
- `frontend/src/pages/gigs/GigDetail.tsx:81`: `<p className="text-xs text-faint mt-0.5">Pencilled in. Nothing reaches your calendar until it is accepted.</p>`
- `frontend/src/pages/gigs/GigDetail.tsx:165`: `<Button variant="quiet" className="ml-auto text-faint hover:text-danger-fg" ...>Delete</Button>`
- `frontend/src/pages/gigs/ApplicationPanel.tsx:77`: `<p className="text-xs text-faint mt-0.5">{field.helpText}</p>`
- `frontend/src/pages/gigs/ApplicationPanel.tsx:80`: `<span className="text-xs text-faint">{question.label}</span>`
- `frontend/src/pages/gigs/ApplicationPanel.tsx:107`: `<span className="text-xs ... text-faint">{value.length} ... characters</span>`
- `frontend/src/pages/gigs/ApplicationPanel.tsx:162`: `<p className="text-xs text-faint mt-1.5">From “{field.source.label}” in the artist database.</p>`
- `frontend/src/pages/gigs/ApplicationPanel.tsx:189`: `<span className="text-xs text-faint block">{item.candidates.length} on file — {item.candidates[0].label}</span>`
- `frontend/src/pages/gigs/ApplicationPanel.tsx:228`: `<p className="text-sm text-faint">Loading the application…</p>`
- `frontend/src/pages/gigs/EditGigPanel.tsx:219`: `<span className="text-faint font-normal">— 0 if you sleep at home</span>`
- `frontend/src/pages/gigs/EditGigPanel.tsx:255`: `<span className="text-faint font-normal">— CAD</span>`
- `frontend/src/pages/gigs/EditGigPanel.tsx:264`: `<span className="text-faint font-normal">— CAD</span>`
- `frontend/src/components/SyncTerms.tsx:111`: `<p className="text-xs text-faint">Checked {shortDate(view.checkedAt)}.</p>`
- `frontend/src/pages/SyncPage.tsx:406`: `<button ... className="... text-faint hover:text-danger-fg ...">×</button>`

### Shared Primitive Bypasses & Hand-Rolled Controls
`.agents/skills/ui-rules/SKILL.md` §1 mandates using shared primitives (`<Button>`, `<Input>`, `<Select>`, `<Textarea>`, `<Card>`, `<Caption>`, `<Explainer>`, `<Disclosure>`).
Observed bypasses:
- `frontend/src/components/DecisionDeck.tsx:351`: Raw `<button className="text-sm px-3.5 py-1.5 rounded-md font-medium bg-accent text-accent-fg hover:bg-accent-hover transition-colors">Open it</button>` instead of `<Button variant="primary">`.
- `frontend/src/components/OnboardingCard.tsx:281–290`: Hand-rolled button styling on `<a>` instead of using `buttonClass(...)`.
- `frontend/src/pages/GigsPage.tsx:311`: Raw `<select value={stageFilter} className={FILTER}>` instead of `<Select filter ...>`.
- `frontend/src/pages/GigsPage.tsx:319`: Raw `<input placeholder="Search by name…" className={`${FILTER} w-44`} />` instead of `<Input className="w-44" />`.
- `frontend/src/pages/GigsPage.tsx:325–332`: Raw `<button ... className={showCreate ? 'bg-line text-body' : 'bg-accent text-accent-fg hover:bg-accent-hover'}>` instead of `<Button variant={showCreate ? 'neutral' : 'primary'}>`.
- `frontend/src/pages/SyncPage.tsx:314`: Raw `<select className={FILTER}>` instead of `<Select filter ...>`.
- `frontend/src/pages/SyncPage.tsx:318, 328`: Raw `<button>` elements for "Reconcile with Gmail" and "+ New target" instead of `<Button>`.
- `frontend/src/pages/gigs/CreateGigForm.tsx`, `frontend/src/pages/gigs/EditGigPanel.tsx`, `frontend/src/pages/SyncPage.tsx` (Create & Edit): Raw `<input className={FIELD}>`, `<select className={FIELD}>`, and `<textarea className={FIELD}>` used instead of `<Input>`, `<Select>`, and `<Textarea>`.
- `frontend/src/components/ReviewPanels.tsx:118–137`: Re-implements a private, raw `<button>` `CopyButton` lacking accessible live region announcements, instead of importing `frontend/src/components/CopyButton.tsx`.
- `frontend/src/pages/gigs/ApplicationPanel.tsx:26–44`: Re-implements a private `Copy` button component with raw `navigator.clipboard.writeText` and setTimeout.

### Typography Scale & Font Deviations
- `frontend/src/pages/review/QueueRow.tsx:33, 38`: Uses arbitrary `text-[11px]` rather than theme tokens (`text-xs`).

### Date Math & Internal Identifier Invariants
- `frontend/src/components/TimingStrip.tsx:39`: `const today = new Date()` called directly without arguments rather than deriving from `localToday()`.
- `frontend/src/components/TimingStrip.tsx:119`: Reminder fallback title renders `${r.entityType} #${r.entityId}` if `r.gigName` is absent, which violates the `GEMINI.md` invariant: "No internal identifiers in visible UI copy: Never render taskId, doc.id, ... SQL column names, or raw route paths in user-facing JSX."
- `frontend/src/components/OpenEndedRow.tsx:19`: Calls `Date.now()` directly in `since()`.

---

## 2. Logic Chain

1. **Accessibility and Contrast Floor**:
   - `text-faint` resolves to CSS variable `--c-faint`, which in light and dark themes yields a contrast ratio near 2:1 against surface backgrounds.
   - For decorative borders, dashes, and empty cells, this is acceptable.
   - For text that provides context (character counters, timestamps, help text, loading messages, and email addresses), 2:1 fails WCAG AA readability standards.
   - Promoting these readable strings to `text-muted` achieves WCAG contrast floors (~4.5:1) without increasing visual clutter because font size remains compact (`text-xs`).

2. **Primitive Uniformity and Maintenance**:
   - When raw inputs and buttons duplicate class strings (`FILTER`, `FIELD`), variations in focus outlines, hover states, border radius, and disabled states creep into the UI.
   - Consolidating to `<Button>`, `<Select filter>`, `<Input>`, and `<Textarea>` guarantees that changes to border styling, focus rings, or hover states in `Surface.tsx` / `Field.tsx` / `Button.tsx` take effect globally.

3. **Accessibility of Clipboard Actions**:
   - Screen reader users copying an application value or contact email cannot detect clipboard completion unless `role="status"` with `aria-live="polite"` announces it.
   - The shared `<CopyButton>` in `frontend/src/components/CopyButton.tsx` already handles this correctly. Replacing local raw copy components with `<CopyButton>` immediately brings accessible feedback to `#review` and `#gigs`.

4. **Preserving Critical Product Invariants**:
   - Scout's core invariants (`preview-then-apply`, `Scout never sends or submits`, `localToday()` calendar safety, and brand naming) must remain untouched.
   - UI polish changes must strictly adjust presentation, markup, and styling tokens while preserving backend event contracts and query invalidation chains.

---

## 3. Caveats

1. **Bulk-Write Disclosures**:
   - In `#sync`, bulk operations (`GmailDraftsPanel`, `ReconcilePanel`) must remain inside `<Disclosure>` or preview modals. Never convert them into single-click direct execution buttons.
2. **Review Decision Bar Semantics**:
   - In `#review` (`DecisionBar.tsx`), buttons are dynamically derived from `gigMoves(...)` and `promoMoves(...)` to match backend state machine validation. Do not hardcode button variants or statuses.
3. **Date Calculations & Timezones**:
   - In `#gigs` and `#overview`, date calculations must use `localToday()` from `frontend/src/format.ts` to prevent UTC rollover bugs across Canadian timezones (e.g. 7 PM Winnipeg / 4 PM Pacific).
4. **Table Cell Pinning on Mobile**:
   - In `GigsPage.tsx`, the sticky pinned first column (`PINNED_CELL` and `PINNED_TINT`) requires careful class preservation so horizontal scrolling on mobile (390px) keeps the row title anchored.

---

## 4. Conclusion & Actionable Implementation Targets

The findings divide cleanly into **high-confidence immediate code edits** (safe decluttering, contrast fixes, and primitive normalization) and **architectural next steps**:

### High-Confidence Immediate Implementation Targets (Ready for Implementation):
1. **Fix `text-faint` contrast floor across all 4 views**:
   - `frontend/src/components/ReplyInbox.tsx`: lines 75, 82, 86, 277 -> `text-muted`
   - `frontend/src/pages/gigs/GigDetail.tsx`: lines 81, 165 -> `text-muted`
   - `frontend/src/pages/gigs/ApplicationPanel.tsx`: lines 77, 80, 107, 162, 189, 228 -> `text-muted`
   - `frontend/src/pages/gigs/EditGigPanel.tsx`: lines 219, 255, 264 -> `text-muted`
   - `frontend/src/components/SyncTerms.tsx`: line 111 -> `text-muted`
   - `frontend/src/pages/SyncPage.tsx`: line 406 -> `text-muted`
2. **Standardize Shared Primitives**:
   - `frontend/src/pages/GigsPage.tsx`: replace raw `<select className={FILTER}>`, `<input className={`${FILTER} w-44`}>`, and raw `<button>` with `<Select filter>`, `<Input>`, `<Button>`.
   - `frontend/src/pages/SyncPage.tsx`: replace raw `<select className={FILTER}>` and raw buttons with `<Select filter>`, `<Button>`.
   - `frontend/src/components/DecisionDeck.tsx`: replace raw "Open it" button with `<Button variant="primary">`.
   - `frontend/src/components/OnboardingCard.tsx`: use `buttonClass(...)` for link actions.
   - `frontend/src/pages/review/QueueRow.tsx`: replace `text-[11px]` with `text-xs`.
3. **Deduplicate Copy Primitives**:
   - `frontend/src/components/ReviewPanels.tsx`: replace custom `CopyButton` with import of `frontend/src/components/CopyButton.tsx`.
   - `frontend/src/pages/gigs/ApplicationPanel.tsx`: replace custom `Copy` function with `<CopyButton>`.
4. **Fix Date Invariants & Copy**:
   - `frontend/src/components/TimingStrip.tsx`: replace `${r.entityType} #${r.entityId}` with `"Application"` / clean title, and use `localToday()` for date diffs.
   - `frontend/src/components/OpenEndedRow.tsx`: sanitize `Date.now()`.

### Recommended Next Steps (Requires Design/Product Alignment):
1. Elevate `DecisionBar` in `Detail.tsx` above secondary metadata for quicker triage.
2. Introduce a split master-detail view or drawer for `#review` on mobile viewports (<1024px).
3. Consolidate sync integration tools (`CheckAllTerms`, `GmailDraftsPanel`, `ReconcilePanel`) into a unified toolbar or drawer.
4. Replace browser native `confirm(...)` calls with a lightweight accessible `<Modal>`.

---

## 5. Verification Method

To independently verify these findings:
1. **Contrast & Class Verification**:
   - Grep for `text-faint` across `frontend/src/pages/` and `frontend/src/components/` to verify occurrences on readable prose vs decorative dashes:
     `git grep "text-faint" frontend/src/`
   - Check raw `<button>` and `<input>` uses:
     `git grep "<button" frontend/src/pages/`
2. **Automated Test Verification**:
   - Run Vitest suite:
     `npm test`
   - Run timezone-sensitive tests:
     `TZ=Pacific/Auckland npm test`
   - Run TypeScript typecheck:
     `npm run typecheck`
3. **Responsive Visual Inspection**:
   - Inspect `#overview`, `#review`, `#gigs`, `#sync` at desktop (`1280x800`) and mobile (`390x844`) in browser preview to verify no layout shifts, text clipping, or overflow regressions.
