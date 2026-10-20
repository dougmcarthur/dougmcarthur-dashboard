# BRIEFING — 2026-10-20T17:12:00Z

## Mission
Conduct in-depth UX, visual design, and clutter audit of Artist Identity, Shows, and Public surfaces (`#shows`, `#promo`, `#artist`, `#epk`, `#epk/<token>`, `#survey`, `#survey-results`, `#join/<token>`).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis, UX/design audit
- Working directory: /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_2
- Original parent: 3eb5e891-573f-468d-a5f5-1d8eb2ecb607
- Milestone: Sun Dogs Music Scout UX & Design Review

## 🔒 Key Constraints
- Read-only investigation — do NOT implement changes in source code directly
- Strict adherence to GEMINI.md invariants:
  - Product name rules (no bare Scout, public survey pages say Sun Dogs Music and never mention Scout)
  - Canadian musician focus, CAD ($)
  - No person's name in code
  - No internal identifiers in UI copy
  - Scout never sends or submits
  - Every bulk write is preview-then-apply
  - Tokens never travel in URL paths (fragment only)
  - Tailwind token discipline and shared UI primitives

## Current Parent
- Conversation ID: 3eb5e891-573f-468d-a5f5-1d8eb2ecb607
- Updated: 2026-10-20T17:12:00Z

## Investigation State
- **Explored paths**:
  - `frontend/src/App.tsx`
  - `frontend/src/pages/PromoDraftsPage.tsx`
  - `frontend/src/pages/ArtistPage.tsx`
  - `frontend/src/pages/artist/ShowsPanel.tsx`
  - `frontend/src/pages/artist/ProfileTab.tsx`
  - `frontend/src/pages/artist/StagePlotTab.tsx`
  - `frontend/src/pages/artist/StageCards.tsx`
  - `frontend/src/pages/artist/LibraryViews.tsx`
  - `frontend/src/pages/artist/AssetRow.tsx`
  - `frontend/src/pages/artist/AssetForm.tsx`
  - `frontend/src/pages/artist/DocumentsTab.tsx`
  - `frontend/src/pages/artist/DriveTab.tsx`
  - `frontend/src/pages/artist/DriveImportPanel.tsx`
  - `frontend/src/pages/artist/SourcePanel.tsx`
  - `frontend/src/pages/artist/AssociationPanel.tsx`
  - `frontend/src/components/epk/EpkView.tsx`
  - `frontend/src/pages/epk/PublicEpkPage.tsx`
  - `frontend/src/pages/survey/SurveyPage.tsx`
  - `frontend/src/pages/survey/SurveyScreens.tsx`
  - `frontend/src/pages/survey/SurveyResultsPage.tsx`
  - `frontend/src/pages/survey/results/ResultsView.tsx`
  - `frontend/src/components/JoinScreen.tsx`
- **Key findings**:
  - Routing bug: `#shows` and bare `#epk` lead to blank screens in `App.tsx`.
  - Contrast violations: Over 20 instances of `text-faint` on readable empty state text, instructional copy, status badges, dates, and character counts across 10 files.
  - Primitive violations: Hand-rolled raw `<button>` delete controls in `PromoDraftsPage.tsx` and `DocumentsTab.tsx`; hand-rolled inputs in `DocumentsTab.tsx`; hand-rolled button classes in `DriveTab.tsx`.
  - Friction points: Promo drafts lack 1-click Copy; ShowsPanel empty state lacks a link to Settings; PublicEpk "Save as PDF" sits awkwardly below footer.
  - Invariants: Verified 0 occurrences of "Scout" on public survey surfaces (strictly "Sun Dogs Music"); token fragment isolation is strictly respected.
- **Unexplored areas**: None within assigned scope; all 8 views and associated components thoroughly investigated.

## Key Decisions Made
- Categorized all audit findings against 3-part rubric (Clutter, Friction, Polish).
- Documented full file paths and exact line numbers.
- Segregated immediate high-confidence implementation targets from recommended next steps.

## Artifact Index
- DISPATCH.md — Initial dispatch log
- BRIEFING.md — Working memory
- progress.md — Heartbeat and task progress
- analysis.md — Comprehensive UX audit report
- handoff.md — 5-component handoff report
