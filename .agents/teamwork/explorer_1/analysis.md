# Sun Dogs Music Scout: UX, Visual Design & Clutter Audit
## Explorer 1 — Core Hub & Discovery Surfaces (`#overview`, `#review`, `#gigs`, `#sync`)

**Auditor**: Explorer 1  
**Scope**: Core Hub & Discovery routes (`#overview`, `#review`, `#gigs`, `#sync`) and associated components in `frontend/src/`  
**Date**: 2026-10-20  
**Rubric**:
1. **Visual Clutter & Information Density**: Redundant chrome, nested boxes/borders, competing badges, excessive explanatory copy, secondary metadata crowding out primary content.
2. **Task Friction & Interaction Cost**: Unnecessary clicks, scroll depth, fragmented actions, unclear primary CTAs, awkward empty/loading/filter states in core artist workflows.
3. **Visual Hierarchy, Typography & Polish**: Alignment, spacing rhythm, scannability of tables/lists/cards, responsive ergonomics across desktop (1280x800) and mobile (390x844), adherence to `ui-rules` (Tailwind tokens, shared primitives, contrast floor).

---

## Executive Summary

The Core Hub and Discovery surfaces in Sun Dogs Music Scout have a strong conceptual foundation—they deliberately avoid "stat-card theater", implement a deck-based triage flow, and respect Canadian music domain requirements (e.g., P-2 visa lead times, FACTOR/provincial grant priorities, no automated sending).

However, an in-depth audit of `#overview`, `#review`, `#gigs`, and `#sync` reveals several systemic usability friction points, visual clutter hotspots, and component primitive inconsistencies:
1. **Pervasive Contrast Floor Violations (`text-faint` on readable text)**: Despite strict guidelines in `GEMINI.md` and `ui-rules` that `text-muted` is the floor for readable text and `text-faint` is strictly for decorative elements (dashes, dividers), numerous readable labels, dates, hints, question types, and loading notices use `text-faint`, creating accessibility issues and low contrast on laptops and mobile devices in bright environments.
2. **Hand-Rolled Markup Instead of Shared Primitives**: Several core components (`DecisionDeck`, `GigsPage`, `SyncPage`, `CreateGigForm`, `EditGigPanel`, `ApplicationPanel`) bypass shared primitives (`<Button>`, `<Select>`, `<Input>`, `<CopyButton>`), hand-rolling raw `<button>`, `<input className={FIELD}>`, `<select className={FILTER}>`, or duplicate copy components.
3. **Information Density & Nested Bounding Boxes**: Views frequently stack multiple layers of borders, tinted backgrounds (`bg-raised`, `bg-sunken`, `bg-info-bg/40`, `bg-cat-violet-bg/40`), and multiple badge rows, creating visual noise that distracts from core artist decisions.
4. **Mobile & Viewport Ergonomics**: On 390px mobile screens, wide tables require two-dimensional scrolling, filter chip bars wrap into 3-4 vertical rows, and the stacked layout in Review causes disorientation when navigating between the item list and detail pane.

---

## View-by-View Detailed Audit

### 1. Route: `#overview` (The Command Hub)
**Files**: `frontend/src/pages/OverviewPage.tsx`, `frontend/src/components/DecisionDeck.tsx`, `frontend/src/components/TimingStrip.tsx`, `frontend/src/components/OpenEndedRow.tsx`, `frontend/src/components/DataHealthRow.tsx`, `frontend/src/components/OnboardingCard.tsx`, `frontend/src/components/StartHere.tsx`

#### Rubric Evaluation:
- **Visual Clutter & Information Density**:
  - `DecisionDeck.tsx` (lines 311–316): Stacked card faux-borders (`translate-y-[10px] scale-x-[0.965] opacity-55` and `translate-y-[5px] scale-x-[0.984] opacity-80`) create visual vibrations behind the active card without providing functional value.
  - `DecisionDeck.tsx` (lines 320–324): Three separate metadata chips/counters sit immediately above the title (`<Badge>`, `<KindTag>`, and `{remaining.length} left`).
  - `DecisionDeck.tsx` (lines 133–143): `<Facts>` grid renders a heavy dark grid line container (`border border-line-strong bg-line-strong overflow-hidden gap-px`), which feels heavy and unintegrated with the rest of the card.
  - `TimingStrip.tsx` (lines 110–165): Rows contain a status dot, title, metadata subtitle, right-aligned countdown badge, and (for reminders) inline action buttons ("Sent", "Dismiss"). This is cramped, especially on mobile.
  - `StartHere.tsx` (lines 88–90, 175–196): Displays lengthy verbatim policy quotes with multiple borders inside an already bordered card (`<Card pad="md">` -> `border border-line rounded-md` list).
- **Task Friction & Interaction Cost**:
  - `DecisionDeck.tsx` (lines 356–371): Triage action buttons rely exclusively on glyphs (check mark, cross mark, external arrow) with no visible text labels. On mobile/touch devices without hover tooltips, artists cannot know whether the cross means "Pass", "Archive", "Snooze", or "Delete".
  - `DecisionDeck.tsx` (line 351): When an opportunity has no automated one-click action, an "Open it" button appears using raw styling rather than `<Button>`.
  - `TimingStrip.tsx` (lines 60–85): The entire row has `role="button"` and `onClick`, but reminders nest `<Button>` controls inside with `stopPropagation()`. On mobile, tapping near a button easily triggers accidental row navigation.
  - `OverviewPage.tsx` (line 98): Uses `xl:grid-cols-[minmax(0,1fr),22rem]`. On viewports between 768px and 1279px (e.g. standard 1024px or 1200px laptops), the layout falls back to a single column, burying the Time-sensitive and Open-ended backlog far below the fold.
- **Visual Hierarchy, Typography & Polish**:
  - `TimingStrip.tsx` (lines 38–42): Calls `new Date()` without arguments rather than using `localToday()` or localized time helpers.
  - `TimingStrip.tsx` (line 119): Fallback title formats as `${r.entityType} #${r.entityId}` when `r.gigName` is missing, exposing internal database IDs in user-facing UI.
  - `OpenEndedRow.tsx` (line 19): Directly calls `Date.now()` in date calculation.
  - `OnboardingCard.tsx` (lines 281–290): Custom `<a>` styled with manual classes instead of using `buttonClass(...)` from `ui/Button.tsx`.
  - `DecisionDeck.tsx` (line 351): Raw `<button>` with manual classes instead of `<Button variant="primary">`.

---

### 2. Route: `#review` (The Triage & Detail Surface)
**Files**: `frontend/src/pages/ReviewPage.tsx`, `frontend/src/pages/review/QueueRow.tsx`, `frontend/src/pages/review/Detail.tsx`, `frontend/src/pages/review/DecisionBar.tsx`, `frontend/src/components/ReviewPanels.tsx`, `frontend/src/components/ReplyInbox.tsx`

#### Rubric Evaluation:
- **Visual Clutter & Information Density**:
  - `ReviewPage.tsx` (lines 251–324): 5 primary filter chips ("New mail", "Needs a decision", "In progress", "Waiting on them", "Everything") plus an inline `<Select filter>` "More filters". On smaller screens, these chips wrap into 3–4 lines, consuming valuable vertical space before the queue begins.
  - `Detail.tsx`: Visual density is overwhelming. The detail card contains up to 14 stacked sections:
    1. Header with `KindTag`, `StatusBadge`, multiple `stateChips`, `Open listing ↗`, `Open in Maps ↗`
    2. Decision rationale callout box (`bg-raised border border-line`)
    3. `TermsPanel` (for sync)
    4. `FactRow` (Deadline, Sent, Window opens, Entry fee, Pays, Where)
    5. `warningChips` row
    6. Snooze banner (`bg-info-bg/50`)
    7. `DecisionBar` action buttons
    8. `Needs you` panel (`bg-sunken rounded-lg` with colored dots)
    9. Summary & track pills (`bg-sunken rounded-full ♪ track`)
    10. How to submit (emails, copy buttons, links, bullet points)
    11. Timing notes
    12. Drafted application values (`FieldTable` with per-row copy buttons)
    13. Pitch draft / Promo draft
    14. Collapsible original raw note
  - `ReplyInbox.tsx` (lines 61–102): Each card stacks classification badge, confidence pill, spam badge, received date, bold subject, sender, quoted evidence in `border-l-2`, match explainer, and action bar.
- **Task Friction & Interaction Cost**:
  - `ReviewPage.tsx` (lines 341–380): On mobile (<1024px `lg`), the queue list and detail pane are stacked vertically. Clicking a queue row scrolls down to the detail, but returning requires clicking a floating `↑ Back to the queue` button or scrolling through long detail content.
  - `Detail.tsx` (lines 287–292): The primary decision actions (`DecisionBar`) are placed below the header, rationale card, terms panel, facts row, warning chips, and snooze banner! On a 1280x800 desktop or a mobile screen, the action buttons are often below the initial fold, forcing the user to scroll down just to click "Will apply" or "Pass".
  - `ReviewPanels.tsx` (lines 118–137): Hand-rolls a duplicate `CopyButton` component that lacks accessible polite announcements and uses a raw `<button>` instead of using `frontend/src/components/CopyButton.tsx`.
- **Visual Hierarchy, Typography & Polish**:
  - `QueueRow.tsx` (lines 33, 38): Uses non-standard arbitrary font size `text-[11px]` for subtitle and flag labels, breaking the type ramp established in `tailwind.config.js`.
  - `ReplyInbox.tsx`: Severe `text-faint` contrast violations:
    - Line 75: `<span className="text-xs text-faint">low confidence</span>`
    - Line 82: `<span className="text-xs text-faint ml-auto">{shortDate(reply.receivedAt)}</span>`
    - Line 86: `<p className="text-xs text-faint">{reply.fromName ? ... : ''}{reply.fromAddress}</p>`
    - Line 277: `{note && <span className="text-xs text-faint">{note}</span>}`
    All of these represent readable copy and must be raised to `text-muted` per the contrast floor rule.

---

### 3. Route: `#gigs` (The Opportunity Pipeline)
**Files**: `frontend/src/pages/GigsPage.tsx`, `frontend/src/pages/gigs/GigDetail.tsx`, `frontend/src/pages/gigs/CostPanel.tsx`, `frontend/src/pages/gigs/ApplicationPanel.tsx`, `frontend/src/pages/gigs/CreateGigForm.tsx`, `frontend/src/pages/gigs/EditGigPanel.tsx`

#### Rubric Evaluation:
- **Visual Clutter & Information Density**:
  - `GigsPage.tsx` (lines 351–427): A wide data table with `min-w-[720px]`. On desktop it is manageable, but when a row is expanded, `GigDetail` expands *inside* the table row (`<td colSpan={columns.length}>`).
  - Expanding a row injects `GigDetail`, which further nests `CostPanel` (with an ASCII/SVG scale graphic, cost breakdown list, pay breakdown list, and P-2 visa alert box) and `ApplicationPanel` (with form fields, checklist, and warnings). This results in massive vertical page expansion and visual chaos inside an HTML table structure.
  - Table header (lines 308–334): Stage filter, search input, and "+ New gig" button wrap awkwardly on small viewports.
- **Task Friction & Interaction Cost**:
  - `GigsPage.tsx` (line 404): Calling `confirm(`Delete "${row.original.name}"?`)` uses the native browser dialog, freezing the UI thread and breaking styling polish.
  - `ApplicationPanel.tsx` (lines 26–44): Hand-rolls a separate `Copy` button component instead of using the shared `<CopyButton>`.
  - `ApplicationPanel.tsx`: Requires manual field-by-field copy actions with no "Copy all answers" or consolidated export view, creating repetitive clicking friction when filling external festival forms.
  - `CostPanel.tsx`: Very long breakdown for travel, lodging, per diems, and pay. When travel is not configured, long explanatory notes dominate the panel.
- **Visual Hierarchy, Typography & Polish**:
  - `GigsPage.tsx` (lines 311–332): Uses raw `<select className={FILTER}>`, `<input className={`${FILTER} w-44`}>`, and raw `<button className="...">` instead of `<Select filter>`, `<Input>`, and `<Button>`.
  - `GigDetail.tsx` (line 81): `<p className="text-xs text-faint mt-0.5">Pencilled in. Nothing reaches your calendar until it is accepted.</p>` uses `text-faint` on readable prose.
  - `GigDetail.tsx` (line 165): `<Button variant="quiet" className="ml-auto text-faint hover:text-danger-fg">Delete</Button>` applies `text-faint` to button text.
  - `ApplicationPanel.tsx`: Heavy `text-faint` misuse on readable content:
    - Line 77: `field.helpText` rendered as `text-faint`
    - Line 80: question kind badge rendered as `text-faint`
    - Line 107: character count rendered as `text-faint`
    - Line 162: source attribution ("From ... in the artist database") rendered as `text-faint`
    - Line 189: materials candidate descriptions rendered as `text-faint`
    - Line 228: "Loading the application…" rendered as `text-faint`
  - `EditGigPanel.tsx`:
    - Line 219: hint `— 0 if you sleep at home` rendered as `text-faint`
    - Line 255: `— CAD` rendered as `text-faint`
    - Line 264: `— CAD` rendered as `text-faint`
    - Forms use raw `<input className={FIELD}>` and `<select className={FIELD}>` throughout.

---

### 4. Route: `#sync` (Sync Targets & Pitch Management)
**Files**: `frontend/src/pages/SyncPage.tsx`, `frontend/src/components/SyncTerms.tsx`, `frontend/src/components/GmailDraftsPanel.tsx`, `frontend/src/components/ReconcilePanel.tsx`

#### Rubric Evaluation:
- **Visual Clutter & Information Density**:
  - `SyncPage.tsx` (lines 344–349): Above the targets list, two large panels can be open simultaneously: `CheckAllTerms` Card and `GmailDraftsPanel` Disclosure. In addition, opening "Reconcile with Gmail" or "+ New target" mounts additional full-width cards. This creates an "accordion stack" that pushes the actual sync targets below the fold.
  - `SyncPage.tsx` (lines 359–410): Each row in the target card contains a Chevron, Name, Agency type, Contact email, Contact role, TermsChip, StatusBadge, Quick Action buttons ("Mark Pitched" / "Archive" / "Confirmed" + "Declined"), and a Delete button (`×`). On screens <768px, this flex layout wraps into 3 separate wrapped lines per row, breaking tabular rhythm.
- **Task Friction & Interaction Cost**:
  - `SyncPage.tsx` (line 405): Delete target uses browser native `confirm(...)`.
  - `SyncTerms.tsx` (line 124): Terms override uses browser native `confirm(...)`.
  - `SyncPage.tsx` (lines 318–335): Both "Reconcile with Gmail" and "+ New target" toggle open in-page panels without smooth scrolling to them or visually indicating which action is active.
- **Visual Hierarchy, Typography & Polish**:
  - `SyncPage.tsx` (lines 314–335): Uses raw `<select className={FILTER}>` and raw `<button>` elements for "Reconcile with Gmail" and "+ New target" instead of `<Select filter>` and `<Button>`.
  - `SyncPage.tsx` (lines 404–409): The row delete control is a raw `<button>` with `text-faint` styling (`className="w-6 h-6 flex items-center justify-center rounded text-faint hover:text-danger-fg hover:bg-danger-bg..."`).
  - `SyncTerms.tsx` (line 111): `<p className="text-xs text-faint">Checked {shortDate(view.checkedAt)}.</p>` uses `text-faint` on a readable date sentence.
  - `CreateSyncForm` & `EditSyncPanel`: Raw `<input className={FIELD}>`, `<select className={FIELD}>`, and `<textarea className={FIELD}>` instead of shared `<Input>`, `<Select>`, `<Textarea>`.

---

## Prioritized Implementation Recommendations

### A. High-Confidence Immediate Implementation Targets (Low Risk, High Polish Win)
1. **Fix all `text-faint` contrast floor violations across Core Hub & Discovery**:
   - `ReplyInbox.tsx`: Change lines 75, 82, 86, 277 from `text-faint` to `text-muted`.
   - `GigDetail.tsx`: Change line 81 from `text-faint` to `text-muted`; remove `text-faint` from Delete button (line 165).
   - `ApplicationPanel.tsx`: Change lines 77, 80, 107, 162, 189, 228 from `text-faint` to `text-muted`.
   - `EditGigPanel.tsx`: Change lines 219, 255, 264 from `text-faint` to `text-muted`.
   - `SyncTerms.tsx`: Change line 111 from `text-faint` to `text-muted`.
   - `SyncPage.tsx`: Change line 406 delete button text from `text-faint` to `text-muted`.
2. **Replace Raw Form Elements & Buttons with Shared Primitives**:
   - `GigsPage.tsx`: Replace raw `<select className={FILTER}>` with `<Select filter>`, raw `<input className={`${FILTER} w-44`}>` with `<Input className="w-44" />`, and raw button with `<Button variant={showCreate ? 'neutral' : 'primary'}>`.
   - `SyncPage.tsx`: Replace raw `<select className={FILTER}>` with `<Select filter>`, raw buttons with `<Button>`.
   - `DecisionDeck.tsx` (line 351): Replace raw `<button>` with `<Button variant="primary">`.
   - `CreateGigForm.tsx`, `EditGigPanel.tsx`, `CreateSyncForm.tsx`, `EditSyncPanel.tsx`: Convert raw inputs/selects/textareas to `<Input>`, `<Select>`, `<Textarea>`.
   - `OnboardingCard.tsx`: Use `buttonClass(...)` for link actions.
3. **Normalize Non-Standard Typography**:
   - `QueueRow.tsx`: Replace arbitrary `text-[11px]` (lines 33, 38) with standardized `text-xs`.
4. **Eliminate Redundant Copy Implementation**:
   - `ReviewPanels.tsx` & `ApplicationPanel.tsx`: Replace hand-rolled copy components with the accessible, announced `<CopyButton>` from `frontend/src/components/CopyButton.tsx`.
5. **Fix Invariant / Date Math Issues**:
   - `TimingStrip.tsx` (line 119): Replace `${r.entityType} #${r.entityId}` with `"Application reminder"` or clean label that does not render database IDs.
   - `TimingStrip.tsx` (lines 38–42): Update date math to use localized calendar date logic (`localToday()`).

### B. Recommended Next Steps (Structural / Architectural)
1. **Elevate Decision Actions in Review Detail**:
   - Reposition `DecisionBar` higher in `Detail.tsx` (immediately under the title and rationale badge) so that artists on laptops (1280x800) and tablets can approve or pass without scrolling past large blocks of secondary metadata.
2. **Review Queue Mobile Drawer / Master-Detail View**:
   - On screens <1024px, replace the continuous vertical stack of Queue and Detail with a split master-detail navigation or drawer, reducing excessive scrolling on 20+ item queues.
3. **De-duplicate Accordion Banners on Sync Page**:
   - Group `CheckAllTerms`, `GmailDraftsPanel`, and `ReconcilePanel` into a clean, collapsible "Tools & Integration" tab or toolbar section so that the primary Sync Targets list is immediately visible on page load.
4. **Standardize Modal Confirmations for Destructive Actions**:
   - Replace native browser `confirm(...)` calls in `GigsPage`, `SyncPage`, and `SyncTerms` with a unified lightweight accessible `<Modal>` confirmation dialog.
