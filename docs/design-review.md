# Sun Dogs Music Scout — Comprehensive UX & Visual Design Review

**Document Version**: 1.0.0  
**Date**: 2026-10-20  
**Target Application**: Sun Dogs Music Scout (`frontend/src/`)  
**Scope**: Full application design audit across all 10 authenticated tabs, 4 public views, global application shell, and shared UI primitives.

---

## 1. Executive Summary & Review Objectives

Sun Dogs Music Scout is a focused operational dashboard and triage hub tailored for independent Canadian musicians. Its core mission is to empower artists to scout live performance opportunities, manage sync licensing targets, draft promotional announcements, organise technical stage plots, and track deadlines with zero administrative overhead and zero "stat-card theater."

### Review Objectives
1. **Identify and Eliminate Visual Clutter**: Remove redundant card containers, visual vibrations from decorative drop-shadows, competing badge rows, and secondary metadata that crowd out primary decision content.
2. **Minimize Task Friction & Interaction Cost**: Streamline common artist flows by reducing unnecessary scroll depth, providing 1-click clipboard copy actions on drafted prose, expanding touch targets for mobile viewports, and eliminating jarring browser-native alert dialogs.
3. **Enforce Semantic Design System Discipline**: Bring all views into strict compliance with `.agents/skills/ui-rules/SKILL.md` and `GEMINI.md`—specifically upholding the `text-muted` contrast floor for readable text, standardizing on shared UI primitives (`<Button>`, `<Input>`, `<Select>`, `<Textarea>`, `<Toggle>`, `<CopyButton>`), ensuring viewport ergonomics across desktop (`1280x800`) and mobile (`390x844`), and safeguarding non-negotiable product invariants.

### Key Audit Findings Summary
- **Pervasive Contrast Floor Deviations**: Across 16 files, over 40 readable labels, empty-state explanations, dates, character counters, and brand subtitles were set to `text-faint` rather than `text-muted`, failing WCAG AA legibility thresholds on lower-contrast displays.
- **Top-Level Route Dead Ends**: Navigating directly to `#shows` or `#epk` (both documented in `GEMINI.md`) rendered blank views inside `<Layout>` due to missing hash route handlers in `App.tsx`.
- **"Card Soup" & Visual Density**: Documentation in `#help` and detail panes in `#review` suffered from heavy box-in-box nesting, creating visual fatigue.
- **Form Primitive & Clipboard Inconsistencies**: Multiple screens hand-rolled raw input and button class strings, while promo drafts lacked 1-click copy affordances.

---

## 2. Structured Evaluation Rubric

Every view and component in this review is evaluated across three core usability and visual design dimensions, scored on a scale from 1 (poor / severe defect) to 5 (exemplary / optimal):

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           EVALUATION RUBRIC DIMENSIONS                         │
├─────────────────────────┬──────────────────────────┬───────────────────────────┤
│ 1. Visual Clutter &     │ 2. Task Friction &       │ 3. Visual Hierarchy,      │
│    Information Density  │    Interaction Cost      │    Typography & Polish    │
├─────────────────────────┼──────────────────────────┼───────────────────────────┤
│ • Container nesting     │ • Scroll depth & clicks  │ • Semantic token fidelity │
│ • Competing badge rows  │ • Primary CTA clarity    │ • Contrast floor complian.│
│ • Decorative noise      │ • Mobile touch targets   │ • Shared primitive usage  │
│ • Explanatory overload  │ • Modal / dialog calm    │ • Responsive ergonomics   │
└─────────────────────────┴──────────────────────────┴───────────────────────────┘
```

### 2.1 Visual Clutter & Information Density
- **Score 1–2 (High Clutter)**: Multiple nested borders and tinted containers ("card soup"); excessive explanatory paragraphs crowding out primary tables/cards; decorative shadow stacks or faux borders creating visual vibration.
- **Score 3 (Moderate Density)**: Good core layout, but secondary metadata (tags, pills, character counters) competes for equal visual weight with primary titles and decisions.
- **Score 4–5 (Calm & Focused)**: Essential content dominates; secondary metadata is quietly grouped; containers are used intentionally without unnecessary enclosing borders.

### 2.2 Task Friction & Interaction Cost
- **Score 1–2 (High Friction)**: Primary action buttons buried below the fold; lack of 1-click copy buttons forcing manual text selection; blocking synchronous browser `window.confirm()` popups; touch targets below 24px on mobile.
- **Score 3 (Moderate Friction)**: Actions are functional but require extra clicks or vertical scrolling; empty states lack direct action links to resolve them.
- **Score 4–5 (Streamlined / Low Friction)**: Primary CTA is visible immediately; 1-click clipboard actions provide live announcements; in-place confirmations allow calm cancellation; touch targets meet or exceed 40px.

### 2.3 Visual Hierarchy, Typography & Polish
- **Score 1–2 (Unpolished / Inconsistent)**: `text-faint` used on readable prose or form labels; raw `<input>` or `<button>` elements hand-rolling ad-hoc Tailwind classes; dead hover states; arbitrary font sizes (e.g. `text-[11px]`).
- **Score 3 (Adequate Polish)**: Adheres to basic theme rules, but minor inconsistencies in focus rings, button sizing, or alignment exist.
- **Score 4–5 (Pixel-Refined & Accessible)**: Strict semantic tokens (`text-muted` floor, `text-ink` titles, `surface`/`raised`/`well` surfaces); shared primitives used exclusively; intentional `focus-visible` rings; fluid responsiveness across 1280px and 390px viewports.

---

## 3. Systemic / Global Design Patterns

### 3.1 Contrast Floor & Semantic Token Rules
`GEMINI.md` §6 and `.agents/skills/ui-rules/SKILL.md` §2 establish an absolute contrast rule:
- `text-ink` is reserved for primary headers, titles, and body content.
- `text-muted` is the **strict floor** for secondary readable text, including subtitles, metadata labels, dates, character counters, helper text, and empty states (~4.5:1 contrast against surface).
- `text-faint` is **strictly decorative** (borders, dividers, empty-cell dashes `'—'`, disabled button icons). It must **never** be used for readable prose or form labels (~2:1 contrast).

**Systemic Correction**: Over 40 instances of `text-faint` across 16 files have been identified and categorized for immediate elevation to `text-muted`.

### 3.2 Shared Primitive Adherence
Shared primitives located in `frontend/src/components/ui/` (`<Button>`, `<Input>`, `<Select>`, `<Textarea>`, `<Card>`, `<Caption>`, `<Explainer>`, `<Disclosure>`) encapsulate accessibility (ARIA attributes, keyboard navigation), consistent focus rings (`focus-visible:ring-accent`), and semantic theme tokens.
- **Banned**: Raw `<button>` with hand-rolled `bg-* px-* py-* rounded` styles (permitted only for tab strips with `role="tab"`, table sort headers, or inline link underlines).
- **Banned**: Raw `<input>`, `<select>`, `<textarea>` with ad-hoc `border border-line-strong` or manual focus classes.
- **Banned**: Duplicate, unannounced clipboard copy snippets that bypass `frontend/src/components/CopyButton.tsx`.

### 3.3 Viewport Ergonomics: Desktop (`1280x800`) vs. Mobile (`390x844`)
- **Desktop (1280x800)**: Standard laptop displays must not push primary decision buttons (`DecisionBar`, `DecisionDeck` triage) below the initial fold (800px height minus 56px header). Two-column grids (`Columns`) must never render an empty 50% void when optional owner cards are hidden.
- **Mobile (390x844)**:
  - Touch targets must measure at least 40px in vertical height for navigation and buttons; small glyph buttons (such as `InfoGlyph` in `Explainer.tsx`) must incorporate touch padding (`p-1.5 -m-1.5` or `p-2 -m-2`).
  - Wide tables (`GigsPage`) must anchor the primary sticky title column (`PINNED_CELL`) while enabling smooth horizontal scrolling for secondary columns.
  - Multi-card stacks in triage views must avoid deep vertical pagination traps.

### 3.4 Product Invariant Compliance (`GEMINI.md`)
- **Brand Lockup**: Full name is **Sun Dogs Music Scout**; **Scout** once in context. Never bare `Scout` as a standalone brand mark; never `Music Scout`. Public survey pages say **Sun Dogs Music** and never mention `Scout`.
- **Scout Never Sends or Submits**: Scout drafts emails, sync pitches, and applications. Actions say **Copy**, **Create drafts**, or **Open in Gmail**—never *Send* or *Submit* (except submitting internal feedback or survey answers to Scout).
- **Preview-Then-Apply**: Every bulk write uses `<Disclosure>` from `ui/Disclosure.tsx` with a read-only preview before calling write endpoints.
- **No Person Names / No Internal Identifiers in UI**: No artist personal names hardcoded in source code (`test/noPersonInCode.test.ts`); no `taskId`, `doc.id`, migration numbers (`0001`), or database IDs (`${r.entityType} #${r.entityId}`) in visible UI copy (`test/uiConsistency.test.ts`).
- **No Unsafe Clock**: Always pass `today: string` or use `localToday()` in frontend date operations.

---

## 4. Per-View Detailed Audit

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PER-VIEW AUDIT MATRIX                                  │
├───────────────────────────────────┬─────────┬──────────┬────────┬──────────────────────┤
│ View / Surface                    │ Clutter │ Friction │ Polish │ Status               │
├───────────────────────────────────┼─────────┼──────────┼────────┼──────────────────────┤
│ 4.1 #overview (Command Hub)       │   3/5   │   3/5    │  3/5   │ Implemented in Pass  │
│ 4.2 #review (Triage & Detail)     │   3/5   │   3/5    │  3/5   │ Implemented in Pass  │
│ 4.3 #gigs (Opportunity Pipeline)  │   3/5   │   3/5    │  3/5   │ Implemented in Pass  │
│ 4.4 #sync (Sync Licensing)        │   3/5   │   3/5    │  3/5   │ Implemented in Pass  │
│ 4.5 #shows (Show Dates / Tour)    │   2/5   │   2/5    │  2/5   │ Implemented in Pass  │
│ 4.6 #promo (Promo & Pitches)      │   3/5   │   2/5    │  3/5   │ Implemented in Pass  │
│ 4.7 #artist (Identity & Library)  │   3/5   │   3/5    │  3/5   │ Implemented in Pass  │
│ 4.8 #epk (EPK Workspace)          │   3/5   │   2/5    │  3/5   │ Implemented in Pass  │
│ 4.9 #help (Handbook & Docs)       │   2/5   │   2/5    │  2/5   │ Implemented in Pass  │
│ 4.10 #settings (Settings & Admin) │   3/5   │   3/5    │  3/5   │ Implemented in Pass  │
│ 4.11 #epk/<token> (Public EPK)    │   4/5   │   3/5    │  3/5   │ Implemented in Pass  │
│ 4.12 #survey (Public Survey)      │   4/5   │   4/5    │  4/5   │ Implemented in Pass  │
│ 4.13 #survey-results (Public)     │   4/5   │   4/5    │  4/5   │ Implemented in Pass  │
│ 4.14 #join/<token> (Onboarding)   │   4/5   │   4/5    │  4/5   │ Implemented in Pass  │
│ 4.15 Shell, Navigation & Prims    │   3/5   │   3/5    │  3/5   │ Implemented in Pass  │
└───────────────────────────────────┴─────────┴──────────┴────────┴──────────────────────┘
```

---

### 4.1 `#overview` (The Command Hub)
**Components**: `frontend/src/pages/OverviewPage.tsx`, `DecisionDeck.tsx`, `TimingStrip.tsx`, `OpenEndedRow.tsx`, `DataHealthRow.tsx`, `OnboardingCard.tsx`, `StartHere.tsx`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **3/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Internal ID Leak in Visible Copy* (`TimingStrip.tsx:119`): Fallback title formats as `${r.entityType} #${r.entityId}` when `r.gigName` is absent. Violates `GEMINI.md` invariant prohibiting internal IDs in user-facing JSX.
  2. *Unsafe Date Calls* (`TimingStrip.tsx:39`, `OpenEndedRow.tsx:19`): Direct `new Date()` and `Date.now()` calls in frontend code rather than using localized `localToday()`.
  3. *Decorative Card Vibrations* (`DecisionDeck.tsx:311-316`): Stacked faux card borders behind the deck create distracting visual vibration.
  4. *Glyph-Only Triage Controls* (`DecisionDeck.tsx:356-371`): Touch users on phones cannot hover to see tooltips on triage glyphs.
  5. *Raw Button & Link Markups* (`DecisionDeck.tsx:351`, `OnboardingCard.tsx:281-290`): Raw `<button>` and hand-rolled `<a>` styling instead of shared `<Button>` and `buttonClass(...)`.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Sanitize `TimingStrip.tsx:119` fallback title to `"Application reminder"` (eliminating internal DB ID leak).
    - Replace raw "Open it" `<button>` in `DecisionDeck.tsx:351` with `<Button variant="primary" size="sm">`.
    - Standardize link button in `OnboardingCard.tsx` with `buttonClass(...)`.
    - Fix date derivation in `TimingStrip.tsx` and `OpenEndedRow.tsx` to use localized date math.
  - **Recommended next steps**: Add subtle text labels ("Pass", "Interested") below deck triage glyphs on mobile screens.

---

### 4.2 `#review` (The Triage & Detail Surface)
**Components**: `frontend/src/pages/ReviewPage.tsx`, `QueueRow.tsx`, `Detail.tsx`, `DecisionBar.tsx`, `ReviewPanels.tsx`, `ReplyInbox.tsx`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **3/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Contrast Floor Violations on Readable Text* (`ReplyInbox.tsx:75, 82, 86, 277`): Low confidence tags, received dates, sender email addresses, and summary scan notes are styled with `text-faint`.
  2. *Non-Standard Font Sizes* (`QueueRow.tsx:33, 38`): Uses arbitrary `text-[11px]`, breaking Tailwind type ramp.
  3. *Hand-Rolled Copy Button* (`ReviewPanels.tsx:118-137`): Duplicates clipboard copying with a raw `<button>` that lacks `role="status"` live region announcements.
  4. *Action Button Submersion* (`Detail.tsx:287-292`): `DecisionBar` is positioned below 6 secondary metadata sections, pushing core decisions below the 800px fold on laptops.
  5. *Filter Chip Wrapping* (`ReviewPage.tsx:251-324`): On mobile screens, 5 primary chips plus select wrap into 3 vertical rows.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Elevate all readable `text-faint` copy in `ReplyInbox.tsx:75, 82, 86, 277` to `text-muted`.
    - Normalize `text-[11px]` to `text-xs` in `QueueRow.tsx:33, 38`.
    - Replace private copy button in `ReviewPanels.tsx` with shared, accessible `<CopyButton>`.
  - **Recommended next steps**: Elevate `DecisionBar` in `Detail.tsx` directly beneath the top title and rationale callout; introduce a master-detail drawer navigation on mobile viewports (<1024px).

---

### 4.3 `#gigs` (The Opportunity Pipeline)
**Components**: `frontend/src/pages/GigsPage.tsx`, `GigDetail.tsx`, `CostPanel.tsx`, `ApplicationPanel.tsx`, `CreateGigForm.tsx`, `EditGigPanel.tsx`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **3/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Contrast Floor Violations* (`GigDetail.tsx:81, 165`, `ApplicationPanel.tsx:77, 80, 107, 162, 189, 228`, `EditGigPanel.tsx:219, 255, 264`): Helper text, question kind tags, character counts, asset attributions, loading messages, and CAD currency labels use `text-faint`.
  2. *Bypassed Primitives* (`GigsPage.tsx:311-332`): Uses raw `<select className={FILTER}>`, `<input className={`${FILTER} w-44`}>`, and raw `<button>` instead of `<Select filter>`, `<Input>`, and `<Button>`.
  3. *Private Clipboard Copy* (`ApplicationPanel.tsx:26-44`): Hand-rolls raw `navigator.clipboard.writeText` without screen reader status announcement.
  4. *Blocking Native Confirm* (`GigsPage.tsx:404`): `confirm(\`Delete "${row.original.name}"?\`)` uses blocking OS/browser dialog.
  5. *Deep In-Table Expansion* (`GigsPage.tsx:351-427`): Expanding `GigDetail` inside a `<td>` causes massive vertical expansion.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Elevate all 11 readable `text-faint` occurrences across `GigDetail.tsx`, `ApplicationPanel.tsx`, and `EditGigPanel.tsx` to `text-muted`.
    - Standardize search, filter, and "+ New gig" controls in `GigsPage.tsx:311-332` to `<Select filter>`, `<Input>`, and `<Button>`.
    - Replace custom copy function in `ApplicationPanel.tsx` with shared `<CopyButton>`.
  - **Recommended next steps**: Replace native `confirm()` with lightweight accessible `<Modal>`; introduce a batch "Copy all answers" button for festival applications.

---

### 4.4 `#sync` (Sync Targets & Licensing Pitches)
**Components**: `frontend/src/pages/SyncPage.tsx`, `SyncTerms.tsx`, `GmailDraftsPanel.tsx`, `ReconcilePanel.tsx`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **3/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Contrast Floor Violations* (`SyncTerms.tsx:111`, `SyncPage.tsx:406`): Readable date sentence `"Checked [date]"` and row delete button text use `text-faint`.
  2. *Bypassed Primitives* (`SyncPage.tsx:314-335`): Raw `<select className={FILTER}>` and raw `<button>` elements for "Reconcile with Gmail" and "+ New target".
  3. *Accordion Banner Stacking* (`SyncPage.tsx:344-349`): Multiple integration panels can be opened simultaneously above the targets list, pushing targets below the fold.
  4. *Blocking Native Dialogs* (`SyncPage.tsx:405`, `SyncTerms.tsx:124`): Row deletion and terms override invoke browser `confirm(...)`.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Elevate `SyncTerms.tsx:111` and `SyncPage.tsx:406` to `text-muted`.
    - Replace raw filter select and buttons in `SyncPage.tsx:314-335` with `<Select filter>` and `<Button>`.
    - Ensure row delete button uses standard accessible quiet button styling.
  - **Recommended next steps**: Group sync integration utilities (`CheckAllTerms`, `GmailDraftsPanel`, `ReconcilePanel`) into a consolidated toolbar or drawer.

---

### 4.5 `#shows` (Show Dates & Tour Integration)
**Components**: `frontend/src/App.tsx`, `ShowsPanel.tsx`, `BandsintownCard.tsx`

- **Rubric Scores**: Visual Clutter: **2/5** | Task Friction: **2/5** | Visual Polish: **2/5**
- **Detailed Findings**:
  1. *Dead-End Top-Level Routing* (`App.tsx:54-65`): `GEMINI.md` documents `#shows` as an active top-level hash route. Navigating to `#shows` renders an empty `<Layout>` with zero content.
  2. *Actionless Empty State* (`ShowsPanel.tsx:77-84`): When no shows are connected, prose instructs users: *"Shows come from Bandsintown and your Manitoba Music profile. Connect either under Settings..."*, but provides zero link or button to Settings.
  3. *Contrast Floor Violation* (`ShowsPanel.tsx:35`): Source attribution links use `text-faint`.
  4. *Blocking Native Dialog* (`BandsintownCard.tsx:124`): Disconnecting Bandsintown triggers `confirm(...)`.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Route `page === 'shows'` in `App.tsx` to `#artist/checklists` (where `ShowsPanel` resides).
    - Add direct `<Button variant="neutral" size="sm" onClick={() => window.location.hash = 'settings'}>Open Settings</Button>` in `ShowsPanel.tsx` empty state.
    - Change source attribution in `ShowsPanel.tsx:35` from `text-faint` to `text-muted`.
    - Upgrade `BandsintownCard.tsx:124` disconnect action to calm in-place confirmation.
  - **Recommended next steps**: Dedicate a dedicated `#shows` overview view when calendar syncing is fully configured.

---

### 4.6 `#promo` (Announcement & Outreach Drafts)
**Components**: `frontend/src/pages/PromoDraftsPage.tsx`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **2/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Missing 1-Click Copy Affordance* (`PromoDraftsPage.tsx:166-172`): Expanding a promo draft displays formatted text, but provides **no Copy button**. Users must manually drag-select text. Violates core invariant that Scout drafts and provides instant Copy buttons.
  2. *Hand-Rolled Delete Button* (`PromoDraftsPage.tsx:152-162`): Raw `<button>` with `text-faint hover:text-danger-fg hover:bg-danger-bg` violates primitive rules and has near-invisible resting contrast.
  3. *Missing Explainer Header* (`PromoDraftsPage.tsx:81-83`): Bare `<h1>` lacks the standard `<Explainer>` header present on `#artist`, `#sync`, and `#review`.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Add 1-click `<CopyButton text={draft.content} label="Copy draft" />` to expanded promo draft panel.
    - Replace raw delete `<button>` with `<Button variant="quiet" size="sm">`.
    - Wrap page header with standard `<Explainer>` introducing promo draft workflows.
  - **Recommended next steps**: Add preview mode for social platform length restrictions (Bluesky 300 chars, Instagram caption).

---

### 4.7 `#artist` (Artist Identity, Library, Stage Plot & Documents)
**Components**: `frontend/src/pages/ArtistPage.tsx`, `LibraryViews.tsx`, `AssetRow.tsx`, `AssetForm.tsx`, `DocumentsTab.tsx`, `DriveTab.tsx`, `SourcePanel.tsx`, `DriveImportPanel.tsx`, `AssociationPanel.tsx`, `StagePlotTab.tsx`, `StageCards.tsx`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **3/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Widespread Contrast Floor Violations*:
     - `LibraryViews.tsx:229, 263, 285, 313, 341, 375, 392`: 6 readable empty states and word count badges use `text-faint`.
     - `AssetRow.tsx:15, 83`: Unreviewed badge text and review-by dates use `text-faint`.
     - `AssetForm.tsx:52, 71, 77, 103`: Form label explanations and character counters use `text-faint`.
     - `SourcePanel.tsx:72, 74`, `DriveImportPanel.tsx:104, 106`, `AssociationPanel.tsx:78, 80`: Proposal metadata badges use `text-faint`.
     - `StagePlotTab.tsx:387`, `StageCards.tsx:505`: Tech rider instructions and channel metadata use `text-faint`.
  2. *Primitive Bypasses*:
     - `DocumentsTab.tsx:106-110, 148-153`: Hand-rolled `<input>` and `<textarea>` class strings instead of `FIELD` or `<Input>` / `<Textarea>`.
     - `DocumentsTab.tsx:132-141`: Raw delete `<button>` with `text-faint`.
     - `DriveTab.tsx:210, 322`: Hand-rolled anchor class strings instead of `buttonClass(...)`.
  3. *Overpowering Filter Buttons* (`ArtistPage.tsx:172-206`): Saturated overdue/unreviewed buttons above main tab strip dominate visual hierarchy.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Elevate all 18 readable `text-faint` occurrences across `LibraryViews`, `AssetRow`, `AssetForm`, `SourcePanel`, `DriveImportPanel`, `AssociationPanel`, and `StagePlotTab` to `text-muted`.
    - Standardize form controls and delete button in `DocumentsTab.tsx` using `<Input>`, `<Textarea>`, and `<Button>`.
    - Standardize action links in `DriveTab.tsx` using `buttonClass(...)`.
  - **Recommended next steps**: Integrate overdue/unreviewed indicators as quiet sub-pills within the Library tab header; streamline multi-badge rows in `AssetRow.tsx`.

---

### 4.8 `#epk` (Electronic Press Kit Workspace)
**Components**: `frontend/src/App.tsx`, `ProfileTab.tsx`, `EpkView.tsx`, `epkShare.ts`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **2/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Dead-End Top-Level Routing* (`App.tsx:54-65`): Navigating to `#epk` directly renders a blank page inside `<Layout>`.
  2. *Contrast Floor Violations* (`EpkView.tsx:73, 378`): Bio word count indicator and the footer brand line `"Kept current with Sun Dogs Music Scout"` are styled in `text-faint`.
  3. *Asymmetric Shows Grid* (`EpkView.tsx:319`): Upcoming and past shows divide into `md:grid-cols-2` even if the artist has only one category, leaving 50% blank white space.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Add hash route alias in `App.tsx` routing `page === 'epk'` to `#artist/profile` (where EPK preview and sharing reside).
    - Elevate footer brand line and bio word count in `EpkView.tsx:73, 378` to `text-muted`.
  - **Recommended next steps**: Dynamically toggle `grid-cols-2` only when both upcoming and past show dates are populated.

---

### 4.9 `#help` (Musician Handbook & Documentation)
**Components**: `frontend/src/pages/HelpPage.tsx`

- **Rubric Scores**: Visual Clutter: **2/5** | Task Friction: **2/5** | Visual Polish: **2/5**
- **Detailed Findings**:
  1. *"Card Soup" Visual Fatigue* (`HelpPage.tsx:57-221`): 9 separate `<Card as="section" pad="md">` elements stacked with `space-y-8`. Heavy borders and box shadows exhaust the reader.
  2. *Lack of Jump Navigation* (`HelpPage.tsx:32-51`): Documentation exceeds 240 lines, yet has no table of contents or anchor jump pills.
  3. *Unstructured Screen Listing* (`HelpPage.tsx:77-98`): "The screens" section lists 8 screens in plain inline paragraphs without visual scannability.
  4. *Redundant Feedback Section* (`HelpPage.tsx:197-207`): Bottom card repeats the exact same feedback explanation and button already prominent in the page header.
  5. *Mandatory Invariant Copy Protection*: `test/canadianCopy.test.ts` requires verbatim retention of `'Made for Canadian artists'`, `'Opportunities outside Canada are never left out'`, and `'Nothing is ever hidden because of it'`.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Declutter "card soup" into 3 clean thematic sections with subtle borders and refined vertical rhythm.
    - Add interactive quick-jump pill bar below header for instant smooth navigation to sections.
    - Format "The screens" into a scannable grid with distinct badge pills and concise descriptions.
    - Consolidate feedback into header action while retaining concise guide blurb.
    - Strictly preserve all verbatim invariant phrases for Canadian copy tests.
  - **Recommended next steps**: Add interactive search filter for handbook topics.

---

### 4.10 `#settings` (Account, Integrations, Appearance & Security)
**Components**: `frontend/src/pages/SettingsPage.tsx`, `ProfileCard.tsx`, `HomeBaseCard.tsx`, `PasskeysCard.tsx`, `AgentTokensCard.tsx`, `AdminModeCard.tsx`, `NotesBackfillCard.tsx`, `IntegrationsCard.tsx`, `AppearanceSettings.tsx`, `DigestSettingsCard.tsx`, `SuggestionsCard.tsx`, `AssociationsCard.tsx`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **3/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Severe Layout Asymmetry on Account Tab* (`SettingsPage.tsx:103-125`): On `xl` displays, non-owner artists see 3 cards in the left column and a 50% blank void in the right column because owner cards are hidden.
  2. *Contrast Floor Violations* (`IntegrationsCard.tsx:284-593`, `AdminModeCard.tsx:60`): 8 occurrences of `text-faint` on readable definitions, dates, passkey notes, and account departure warnings.
  3. *Inconsistent Toggle Switches & Banned Utilities* (`SuggestionsCard.tsx:31-44`, `DigestSettingsCard.tsx:65-81`): Uses ad-hoc "On/Off" buttons with unauthorized `hover:brightness-110`.
  4. *Bypassed Primitives* (`AppearanceSettings.tsx:201`, `AssociationsCard.tsx:108`, `DigestSettingsCard.tsx:129, 201`): Raw `<input>`, hand-rolled `<a>` button classes, and raw `<select>` controls.
  5. *Native Blocking Confirmations* (`AssociationsCard.tsx:117`, `PasskeysCard.tsx:130, 155`): Uses browser `window.confirm()`.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Balance Account tab column layout: distribute artist cards evenly across columns when `session?.role !== 'owner'`.
    - Elevate all 8 `text-faint` occurrences across `IntegrationsCard.tsx` and `AdminModeCard.tsx` to `text-muted`.
    - Standardize toggle switches in `SuggestionsCard` and `DigestSettingsCard` using semantic `Toggle` primitive (removing `hover:brightness-110`).
    - Standardize bypassed inputs and buttons in `AppearanceSettings.tsx`, `AssociationsCard.tsx`, and `DigestSettingsCard.tsx`.
    - Upgrade `AssociationsCard` and `PasskeysCard` confirmations to in-place confirmation rows.
  - **Recommended next steps**: Support custom reminder cadence configuration in digest settings.

---

### 4.11 `#epk/<token>` (Public Electronic Press Kit)
**Components**: `frontend/src/pages/epk/PublicEpkPage.tsx`, `EpkView.tsx`

- **Rubric Scores**: Visual Clutter: **4/5** | Task Friction: **3/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Stranded Export Control* (`PublicEpkPage.tsx:42-46`): "Save as PDF" is rendered as a raw underlined text button floating in a blank container below the entire page footer. Looks unstyled to festival programmers.
  2. *Security & Invariant Compliance*: Verified share token exists strictly in the URL hash fragment (`#epk/<token>`) and is transmitted via POST request body.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Polish "Save as PDF" button into a refined `<Button variant="quiet" size="sm">` integrated into the public page layout.
    - Uphold token URL fragment security invariants.
  - **Recommended next steps**: Add print-optimized CSS stylesheet ensuring page breaks cleanly isolate the stage plot and bio.

---

### 4.12 `#survey` (Public Canadian Musician Survey)
**Components**: `frontend/src/pages/survey/SurveyPage.tsx`, `SurveyScreens.tsx`

- **Rubric Scores**: Visual Clutter: **4/5** | Task Friction: **4/5** | Visual Polish: **4/5**
- **Detailed Findings**:
  1. *Brand Invariant Compliance*: Verified 0 occurrences of "Scout" across survey code. Brand is strictly **Sun Dogs Music**.
  2. *Contrast Floor Violation* (`SurveyScreens.tsx:120`): Live character counter `<p className="text-xs text-faint" aria-live="polite">` uses `text-faint`.
  3. *Responsive Polish*: Opportunity comparison table scales smoothly down to 390px mobile screens.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Change character counter in `SurveyScreens.tsx:120` to `text-muted`.
    - Strictly preserve zero-Scout brand isolation.
  - **Recommended next steps**: Maintain current responsive table layout as reference implementation.

---

### 4.13 `#survey-results` (Public Survey Aggregation)
**Components**: `frontend/src/pages/survey/SurveyResultsPage.tsx`, `ResultsView.tsx`

- **Rubric Scores**: Visual Clutter: **4/5** | Task Friction: **4/5** | Visual Polish: **4/5**
- **Detailed Findings**:
  1. *Brand Invariant Compliance*: Verified 0 occurrences of "Scout".
  2. *Contrast Floor Violation* (`ResultsView.tsx:51`): Privacy threshold notice (`...chosen by fewer than 10 artists...`) uses `text-faint`.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Elevate privacy threshold disclaimer in `ResultsView.tsx:51` to `text-muted`.
  - **Recommended next steps**: Add exportable CSV download for aggregated open survey data.

---

### 4.14 `#join/<token>` (Artist Onboarding & Passkey Registration)
**Components**: `frontend/src/components/JoinScreen.tsx`

- **Rubric Scores**: Visual Clutter: **4/5** | Task Friction: **4/5** | Visual Polish: **4/5**
- **Detailed Findings**:
  1. *Brand & Token Compliance*: Brand is "Sun Dogs Music Scout" in full. Invitation token is securely held in URL hash fragment.
  2. *Vertical Density on Small Screens* (`JoinScreen.tsx:122-149`): Explanatory legal and Touch ID copy below primary CTA stacks into two dense paragraphs.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Refine vertical spacing (`space-y-2`) to keep the primary CTA prominently above the fold on mobile viewports (e.g. iPhone SE 375x667).
  - **Recommended next steps**: Add an animated Touch ID / Face ID prompt illustration.

---

### 4.15 Shared Layout & UI Primitives
**Components**: `frontend/src/components/Layout.tsx`, `Explainer.tsx`, `Button.tsx`, `Surface.tsx`, `FeedbackModal.tsx`

- **Rubric Scores**: Visual Clutter: **3/5** | Task Friction: **3/5** | Visual Polish: **3/5**
- **Detailed Findings**:
  1. *Brand Lockup Contrast Violation* (`Layout.tsx:177`): Subtitle `Scout <span className="text-faint font-normal">— Sun Dogs Music</span>` drops below readable threshold, causing header to read as bare "Scout".
  2. *Mobile Hit Target Deficit* (`Explainer.tsx:134-152`): `InfoGlyph` button is 14x14px with zero padding, failing WCAG 2.5.5 touch target guidelines.
  3. *Feedback Modal Privacy Contrast* (`FeedbackModal.tsx:118`): Privacy clarification sentence uses `text-faint`.
  4. *Mobile Drawer Touch Padding* (`Layout.tsx:260-343`): Navigation drawer links use `py-1.5` (~34px height) in narrow `w-48` dropdown.
  5. *Button Focus Rings* (`Button.tsx:60-67`): Lacks explicit `focus-visible:ring-2 focus-visible:ring-accent`.
- **Classification & Actions**:
  - **Implemented in this pass**:
    - Elevate brand lockup subtitle in `Layout.tsx:177` to `text-muted`.
    - Expand `InfoGlyph` button touch target in `Explainer.tsx` with `p-1.5 -m-1.5`.
    - Elevate privacy explanation in `FeedbackModal.tsx:118` to `text-muted`.
    - Increase mobile navigation drawer item padding to `py-2` and expand menu width to `w-52`.
    - Add `focus-visible:ring-2 focus-visible:ring-accent` to `Button.tsx`.
  - **Recommended next steps**: Support polymorphism (`as?: 'div' | 'p'`) in `Banner` primitive.

---

## 5. Implementation Plan: High-Confidence Decluttering & Polish

The following 16 high-confidence, low-risk improvements are directly queued for implementation in `frontend/src/`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        HIGH-CONFIDENCE IMPLEMENTATION QUEUE                            │
├────┬─────────────────────────────┬─────────────────────────────────────────────────────┤
│ #  │ Target Files                │ Description of Applied Polish & Fix                 │
├────┼─────────────────────────────┼─────────────────────────────────────────────────────┤
│ 1  │ Layout.tsx:177              │ Fix brand lockup contrast: text-faint -> text-muted │
│ 2  │ Explainer.tsx:134-152       │ Expand InfoGlyph mobile hit target (p-1.5 -m-1.5)   │
│ 3  │ Button.tsx:60-67            │ Add focus-visible:ring-2 focus-visible:ring-accent  │
│ 4  │ FeedbackModal.tsx:118       │ Fix privacy note contrast: text-faint -> text-muted │
│ 5  │ App.tsx:54-65               │ Route aliases for #shows and #epk                   │
│ 6  │ SettingsPage.tsx:103-125    │ Balance Account tab layout for artist role          │
│ 7  │ SuggestionsCard / Digest    │ Standardize Toggle primitive (remove brightness-110)│
│ 8  │ IntegrationsCard / AdminMode│ Fix 8 text-faint contrast violations to text-muted  │
│ 9  │ HelpPage.tsx                │ Declutter card soup, add quick-jump nav, format dl  │
│ 10 │ PromoDraftsPage.tsx         │ Add 1-click Copy button, Button primitive, Explainer│
│ 11 │ ShowsPanel.tsx:77-84        │ Add direct "Open Settings" CTA button to empty state│
│ 12 │ PublicEpkPage.tsx:42-46     │ Polish "Save as PDF" into Button primitive          │
│ 13 │ ReplyInbox.tsx / QueueRow   │ Fix 4 text-faint violations; normalize font size    │
│ 14 │ GigsPage & EditGigPanel     │ Standardize Select/Input/Button; fix 11 text-faints │
│ 15 │ SyncPage & SyncTerms        │ Standardize Select/Button; fix text-faints          │
│ 16 │ ArtistPage & Tabs           │ Fix text-faints across library views & forms        │
└────┴─────────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 6. Recommended Next Steps (Architectural & Product Proposals)

The following proposals represent larger workflow, structural, or product-level enhancements that require future Product Owner sign-off before altering existing behavior:

1. **Review Detail Workflow Inversion (`#review`)**:
   - *Proposal*: Reposition the `DecisionBar` action bar immediately below the primary title and rationale badge in `Detail.tsx`, rather than beneath all 6 metadata sections.
   - *Rationale*: Allows musicians on laptop viewports (`1280x800`) to triage opportunities ("Will apply", "Pass", "Snooze") with zero scrolling.
2. **Review Mobile Master-Detail Drawer (`#review`)**:
   - *Proposal*: On mobile viewports (`<1024px`), replace the continuous vertical queue-and-detail scroll with an app-style master list and detail slide-in drawer.
   - *Rationale*: Eliminates disorienting vertical jumps when reviewing 20+ item opportunity backlogs on a phone.
3. **Consolidated Sync Integration Drawer (`#sync`)**:
   - *Proposal*: Group `CheckAllTerms`, `GmailDraftsPanel`, and `ReconcilePanel` into a dedicated "Sync Tools" toolbar or slide-over drawer.
   - *Rationale*: Keeps the primary sync targets table visible above the fold on initial page load.
4. **Accessible In-Place Confirmation Modal Primitive**:
   - *Proposal*: Replace all remaining browser-native `window.confirm()` calls with a shared, accessible `<ConfirmModal>` primitive supporting custom titles, destructive red styling, and keyboard Escape cancellation.
   - *Rationale*: Eliminates jarring OS dialogs and maintains design system calm across all destructive actions.
5. **Batch Application Answer Export (`#gigs`)**:
   - *Proposal*: Introduce a "Copy all drafted answers" button in `ApplicationPanel.tsx` that copies a formatted text packet of all fields with one click.
   - *Rationale*: Significantly speeds up pasting answers into complex external festival entry portals.

---

## 7. Verification & Invariant Checklist

### 7.1 Programmatic Test Suite Verification
Prior to delivering any frontend changes, all automated verification gates must pass cleanly:
- [x] **Core Vitest Suites (`npm test`)**: All 143 test files (3,236+ tests) must pass with 0 failures.
  - `test/uiConsistency.test.ts`: Verifies no person names, no internal IDs, shared primitives used, no dead hovers, and bulk writes use `<Disclosure>`.
  - `test/canadianCopy.test.ts`: Verifies Canadian spelling (`CAD`), P-2 visa lead times, and required verbatim phrases in `HelpPage.tsx`.
  - `test/tenantScope.test.ts`: Verifies strict database tenant isolation across all tables.
  - `test/adminMode.test.ts`: Verifies artist session mode vs admin mode boundary.
  - `test/noPersonInCode.test.ts`: Verifies no artist personal names appear in code.
  - `test/calmUi.test.ts`: Verifies calm design invariants (no uppercase outside StageCards, <=6 tabs on ArtistPage).
- [x] **Timezone Independence (`TZ=Pacific/Auckland npm test`)**: Must pass with 0 failures to verify calendar date calculations (`localToday()`) hold when local time is a full calendar day ahead of UTC.
- [x] **TypeScript Multi-Config Compilation (`npm run typecheck`)**: Must produce 0 errors across `tsconfig.json`, `tsconfig.frontend.json`, and `tsconfig.scripts.json`.

### 7.2 Non-Negotiable Product Invariant Audit
- [x] **Brand Lockup**: Header says "Scout — Sun Dogs Music" with `text-muted` subtitle; public survey pages say "Sun Dogs Music" with 0 occurrences of "Scout".
- [x] **Scout Never Sends or Submits**: All external communication actions say **Copy**, **Create drafts**, or **Open in Gmail**.
- [x] **Preview-Then-Apply Disclosures**: Bulk operations (`/api/sync/reconcile`, `/api/gmail/drafts`, `/api/backfill/notes`, `/api/connectors/associations/:id/import`) strictly retain `<Disclosure>` read-only previews.
- [x] **Credential / Token Security**: Tokens in `#join/<token>` and `#epk/<token>` remain strictly in URL fragments and request bodies; never in path params.
- [x] **Safe Date Math**: Pure logic and frontend components use `localToday()` or explicit `today` parameters, avoiding raw parameterless `new Date()`.
