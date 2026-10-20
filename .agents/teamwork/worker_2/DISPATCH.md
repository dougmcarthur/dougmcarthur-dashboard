## 2026-10-20T17:19:29Z

You are Worker 2 on Sun Dogs Music Scout UX & Design Review.
Your working directory is:
/Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/worker_2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY INPUTS (Read before starting):
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/ORIGINAL_REQUEST.md
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/GEMINI.md
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/skills/ui-rules/SKILL.md
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/docs/design-review.md (Pay special attention to Section 5: Implementation Plan)
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_1/handoff.md
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_2/handoff.md
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_3/handoff.md

EXCLUSIVE FILE OWNERSHIP:
You exclusively own and write:
- Files in `frontend/src/`
- Files in your working directory `/Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/worker_2/`

YOUR TASK (Requirement R3):
Implement the high-confidence UI/UX polish and decluttering changes outlined in Section 5 of `docs/design-review.md` and the three explorer handoffs:

1. **Brand lockup & Layout Polish** (`frontend/src/components/Layout.tsx`):
   - Elevate brand lockup subtitle in header (line 177) from `text-faint` to `text-muted` so it doesn't read as bare "Scout".
   - Increase mobile drawer navigation link padding from `py-1.5` to `py-2` and expand menu width to `w-52` for easier thumb tapping.
2. **Hit Target in Explainer** (`frontend/src/components/ui/Explainer.tsx`):
   - Expand `InfoGlyph` button touch target from 14px by adding `p-1.5 -m-1.5` so it meets mobile touch guidelines without altering visual layout.
3. **Button Focus Rings** (`frontend/src/components/ui/Button.tsx`):
   - Ensure clean focus-visible styles (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`).
4. **Feedback Modal Contrast** (`frontend/src/components/FeedbackModal.tsx`):
   - Change privacy note (line 118) from `text-faint` to `text-muted`.
5. **Route Aliases in `frontend/src/App.tsx`**:
   - Add route handlers for `#shows` and `#epk` (e.g. mapping `#shows` to render `<ArtistPage initialTab="checklists" />` and `#epk` to render `<ArtistPage initialTab="profile" />`). Remember: `test/calmUi.test.ts` enforces <= 6 tabs on ArtistPage, so alias to existing tabs!
6. **Settings Layout Balancing** (`frontend/src/pages/SettingsPage.tsx`):
   - On the `account` tab, if `session?.role !== 'owner'`, distribute cards cleanly across both columns (e.g. HomeBaseCard in column 2) so column 2 isn't a 50% blank void on desktop.
7. **Toggle Switch Standardization** (`frontend/src/components/SuggestionsCard.tsx` and `frontend/src/components/DigestSettingsCard.tsx`):
   - Standardize toggle switches to use the clean `Toggle` component from `AppearanceSettings.tsx` (or extract/share it), eliminating ad-hoc buttons and `hover:brightness-110`.
8. **Settings & Integrations Contrast Floor**:
   - Fix readable `text-faint` strings to `text-muted` in `IntegrationsCard.tsx` and `AdminModeCard.tsx`.
9. **Help Page Decluttering** (`frontend/src/pages/HelpPage.tsx`):
   - Unify the 9-card stack into structured thematic sections with quick-jump anchor pills.
   - Remove redundant second "Send feedback" card at bottom (already in header).
   - CRITICAL INVARIANT: Preserve exact Canadian copy sentences tested by `test/canadianCopy.test.ts`:
     - 'Made for Canadian artists'
     - 'Opportunities outside Canada are never left out'
     - 'Nothing is ever hidden because of it'
10. **Promo Drafts 1-Click Copy & Polish** (`frontend/src/pages/PromoDraftsPage.tsx`):
    - Add a 1-click Copy button when a draft is expanded.
    - Replace raw `<button>` delete controls with `<Button variant="quiet" size="sm">` or `<Button variant="danger" size="sm">`.
11. **Shows Empty State CTA** (`frontend/src/pages/artist/ShowsPanel.tsx`):
    - Add a clean CTA button linking to `#settings` in the Bandsintown unlinked empty state.
12. **Public EPK Save as PDF** (`frontend/src/pages/epk/PublicEpkPage.tsx`):
    - Upgrade raw unstyled text link to `<Button variant="ghost" size="sm">`.
13. **Core Hub Contrast Floor & Shared Primitives**:
    - `ReplyInbox.tsx`: promote `text-faint` on confidence badges, dates, and email strings to `text-muted`.
    - `QueueRow.tsx`: change `text-[11px]` to `text-xs`.
    - `DecisionDeck.tsx`: replace raw "Open it" button with `<Button variant="primary">`.
    - `GigsPage.tsx`: replace raw `<select className={FILTER}>`, `<input className={`${FILTER} w-44`}>`, and raw button with `<Select filter>`, `<Input>`, `<Button>`.
    - `GigDetail.tsx`, `ApplicationPanel.tsx`, `EditGigPanel.tsx`: promote `text-faint` help text, character counters, and loading text to `text-muted`.
    - `SyncPage.tsx`: replace raw `<select className={FILTER}>` and raw buttons with `<Select filter>`, `<Button>`; promote `text-faint` in `SyncTerms.tsx`.
    - Deduplicate copy buttons in `ReviewPanels.tsx` and `ApplicationPanel.tsx` by using `<CopyButton>`.
14. **TimingStrip Invariants** (`frontend/src/components/TimingStrip.tsx`):
    - Ensure date calculations use `localToday()` from `frontend/src/format.ts`.
    - Ensure reminder titles do not leak `${r.entityType} #${r.entityId}`.
15. **Artist Tabs Contrast Floor**:
    - Promote `text-faint` on empty state strings, form labels, and word count badges to `text-muted` across `LibraryViews.tsx`, `AssetForm.tsx`, `AssetRow.tsx`, `StagePlotTab.tsx`, `StageCards.tsx`, `SourcePanel.tsx`, `DriveImportPanel.tsx`, `AssociationPanel.tsx`, `EpkView.tsx`, `SurveyScreens.tsx`, and `ResultsView.tsx`.
