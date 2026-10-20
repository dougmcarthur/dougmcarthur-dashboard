# Handoff Report — Worker 1 (Master UX & Design Review Document)

**Role**: Worker 1 (Synthesis & Design Review Lead)  
**Date**: 2026-10-20  
**Artifact Produced**: `docs/design-review.md` (470 lines, 41.8 KB)  
**Working Directory**: `/Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/worker_1`

---

## 1. Observation

### Synthesized Input Sources
Directly analyzed and synthesized all findings from the three exploratory audits:
1. `explorer_1/analysis.md` & `explorer_1/handoff.md`: Core Hub & Discovery surfaces (`#overview`, `#review`, `#gigs`, `#sync`).
2. `explorer_2/analysis.md` & `explorer_2/handoff.md`: Artist Identity, Shows, Promo, EPK, and Public Surfaces (`#shows`, `#promo`, `#artist`, `#epk`, `#epk/<token>`, `#survey`, `#survey-results`, `#join/<token>`).
3. `explorer_3/analysis.md` & `explorer_3/handoff.md`: Settings, Help, Global App Shell, and Shared UI Primitives (`#settings`, `#help`, `Layout.tsx`, `frontend/src/components/ui/`).

### Concrete Issues Synthesized in `docs/design-review.md`
1. **Pervasive Contrast Floor Violations (`text-faint` on readable text)**:
   - Over 40 instances across 16 files where readable labels, timestamps, character counts, help notes, and brand subtitles violate `SKILL.md` Section 2 by using `text-faint` instead of `text-muted`:
     - `Layout.tsx:177`: `Scout <span className="text-faint font-normal">— Sun Dogs Music</span>`
     - `ReplyInbox.tsx:75, 82, 86, 277`: confidence, received date, sender address, summary note
     - `GigDetail.tsx:81, 165`: status note, delete button
     - `ApplicationPanel.tsx:77, 80, 107, 162, 189, 228`: helpText, kind label, char count, asset attribution, loading note
     - `EditGigPanel.tsx:219, 255, 264`: hotel hint, CAD currency notes
     - `SyncTerms.tsx:111`: "Checked [date]"
     - `ShowsPanel.tsx:35`: attribution links
     - `StagePlotTab.tsx:387`: tech rider instructions
     - `StageCards.tsx:505`: channel metadata
     - `LibraryViews.tsx:229, 263, 285, 313, 341, 375, 392`: empty state sentences & word count badges
     - `AssetRow.tsx:15, 83`: unreviewed status, review-by date
     - `AssetForm.tsx:52, 71, 77, 103`: meaning, character count, helper hints
     - `SourcePanel.tsx:72, 74`, `DriveImportPanel.tsx:104, 106`, `AssociationPanel.tsx:78, 80`: tag labels
     - `EpkView.tsx:73, 378`: bio word count, footer brand line
     - `SurveyScreens.tsx:120`: character count
     - `ResultsView.tsx:51`: threshold privacy disclaimer
     - `IntegrationsCard.tsx:284, 288, 292, 297, 345, 356, 558, 593`: account definitions, last checked, break warnings, notes
     - `AdminModeCard.tsx:60`: passkey prompt note
     - `FeedbackModal.tsx:118`: privacy clarification sentence
2. **Top-Level Dead-End Routing in `App.tsx:54-65`**:
   - `GEMINI.md` line 52 documents `#shows` and `#epk` as active top-level hash routes, but neither is matched in `App.tsx`, causing blank screen renders.
3. **Task Friction & Missing Affordances**:
   - `PromoDraftsPage.tsx:166-172`: Promo drafts expand without a 1-click **Copy** button.
   - `ShowsPanel.tsx:77-84`: Empty state instructs user to connect Bandsintown in Settings, but provides zero link or button to `#settings`.
   - `PublicEpkPage.tsx:42-46`: "Save as PDF" is rendered as a raw unadorned link below the footer.
   - `Explainer.tsx:134-152`: `InfoGlyph` touch target is 14x14px without padding, failing mobile ergonomics.
4. **Visual Clutter & Layout Asymmetry**:
   - `HelpPage.tsx:57-221`: "Card soup" of 9 separate heavy cards with repeated shadows and redundant feedback section.
   - `SettingsPage.tsx:103-125`: Severe 2-column asymmetry on `account` tab for non-owner artist accounts (left column has 3 cards, right column has an empty void).
5. **Primitive Bypasses & Banned Utilities**:
   - `SuggestionsCard.tsx:31-44` and `DigestSettingsCard.tsx:65-81`: Ad-hoc On/Off buttons using unauthorized `hover:brightness-110`.
   - `GigsPage.tsx`, `SyncPage.tsx`, `AppearanceSettings.tsx`, `AssociationsCard.tsx`, `DigestSettingsCard.tsx`, `DocumentsTab.tsx`: Raw `<input>`, `<select>`, `<button>`, or hand-rolled link styles bypassing `<Button>`, `<Input>`, `<Select>`, or `buttonClass(...)`.
6. **Internal ID Leaks & Invariants**:
   - `TimingStrip.tsx:119`: Renders `${r.entityType} #${r.entityId}` when `r.gigName` is absent.
   - `TimingStrip.tsx:39` & `OpenEndedRow.tsx:19`: Unsafe `new Date()` and `Date.now()` calls in frontend components.

### Automated Test Baseline
- `npm test`: 143 passed of 143 test files (3,236 tests passed, 0 failed).
- `TZ=Pacific/Auckland npm test`: 143 passed of 143 test files (3,236 tests passed, 0 failed).
- `npm run typecheck`: 0 errors across `tsconfig.json`, `tsconfig.frontend.json`, `tsconfig.scripts.json`.

---

## 2. Logic Chain

1. **Synthesis of Comprehensive Audit (Observation 1 -> Section 4 of Review Document)**:
   - All 15 required user-facing views and surfaces were grouped and structured systematically into `docs/design-review.md`.
   - Each view evaluates the 3 heuristic dimensions (Visual Clutter, Task Friction, Visual Polish/Hierarchy) with an explicit 1–5 scoring scale and concrete line citations.
   - Every finding is explicitly classified as either **Implemented in this pass** (high-confidence, non-breaking polish) or **Recommended next steps** (architectural/product proposals requiring owner sign-off).

2. **Delineation of High-Confidence vs Architectural Changes (Observations 1-6 -> Sections 5 & 6)**:
   - High-confidence changes focus strictly on:
     - Contrast floor elevation (`text-faint` -> `text-muted` on readable strings).
     - Component primitive replacement (raw controls -> `<Button>`, `<Input>`, `<Select>`, `<Toggle>`).
     - Route alias resolution (`#shows` -> `#artist/checklists`, `#epk` -> `#artist/profile`).
     - Direct task affordances (1-click `<CopyButton>` in Promo Drafts, "Open Settings" CTA in ShowsPanel).
     - Responsive mobile touch target padding (`Explainer.tsx`, mobile nav drawer).
     - Layout balance in Settings and decluttering "card soup" in Help.
   - Structural/workflow proposals (such as repositioning `DecisionBar` in Review detail, mobile master-detail drawers, or consolidated sync drawers) are cataloged under Recommended Next Steps to ensure existing user flows are not disrupted without product alignment.

3. **Safeguarding Product Invariants (Observation 6 -> Section 7)**:
   - Invariant rules from `GEMINI.md` are codified in the report's verification checklist:
     - No person names in code (`test/noPersonInCode.test.ts`).
     - No internal IDs in visible UI (`TimingStrip.tsx:119` sanitized).
     - Zero mentions of "Scout" on public survey views (`#survey`, `#survey-results`).
     - Brand lockup remains "Scout — Sun Dogs Music" with `text-muted` subtitle.
     - Bulk operations strictly preserve preview-then-apply `<Disclosure>`.
     - Scout never sends or submits external emails or forms.

---

## 3. Caveats

1. **ArtistPage Tab Count Constraint**:
   `test/calmUi.test.ts:107-113` enforces that `ArtistPage.tsx` must contain `<= 6` tabs. Any route aliasing for `#shows` and `#epk` must redirect to existing tabs (`checklists` and `profile`) rather than creating new sub-tabs.
2. **HelpPage Canadian Copy Verbatim Tests**:
   `test/canadianCopy.test.ts` matches exact regex strings (`'Made for Canadian artists'`, `'Opportunities outside Canada are never left out'`, `'Nothing is ever hidden because of it'`). The decluttering plan in `docs/design-review.md` explicitly preserves these exact phrases.
3. **Bulk Write Disclosure Invariant**:
   All bulk write panels (`/api/sync/reconcile`, `/api/gmail/drafts`, `/api/backfill/notes`, `/api/connectors/associations/:id/import`) must maintain their `<Disclosure>` preview-then-apply mechanics.

---

## 4. Conclusion

Requirement R2 is fully satisfied. `docs/design-review.md` has been authored as an authoritative, publication-ready design audit document containing:
- Complete executive summary and review objectives.
- Formally defined 3-part evaluation rubric.
- Deep dive into systemic design patterns (contrast floor, shared primitives, viewport ergonomics, product invariants).
- Per-view detailed audit across all 10 authenticated tabs (`#overview`, `#review`, `#gigs`, `#sync`, `#shows`, `#promo`, `#artist`, `#epk`, `#help`, `#settings`), 4 public views (`#epk/<token>`, `#survey`, `#survey-results`, `#join/<token>`), and shared layout/primitives.
- Concrete 16-point Implementation Plan for high-confidence decluttering and polish.
- 5 actionable Recommended Next Steps for future architectural evolution.
- Verification and invariant checklist cross-referenced against automated test suites.

---

## 5. Verification Method

To independently verify this report and the generated document:
1. **Document Inspection**:
   - Inspect `/Users/doug/Documents/GitHub/dougmcarthur-dashboard/docs/design-review.md` to confirm all 7 sections, 15 views, line citations, rubric scores, and implementation tags are fully populated.
2. **Automated Vitest Suite**:
   ```bash
   export PATH="/opt/homebrew/bin:/Users/doug/.nvm/versions/node/v22.22.3/bin:$PATH"
   npm test
   ```
   *Expected outcome*: 143 passed test files, 3,236 passed tests, 0 failures.
3. **Timezone Invariance Suite**:
   ```bash
   export PATH="/opt/homebrew/bin:/Users/doug/.nvm/versions/node/v22.22.3/bin:$PATH"
   TZ=Pacific/Auckland npm test
   ```
   *Expected outcome*: 143 passed test files, 0 failures.
4. **TypeScript Multi-Config Compilation**:
   ```bash
   export PATH="/opt/homebrew/bin:/Users/doug/.nvm/versions/node/v22.22.3/bin:$PATH"
   npm run typecheck
   ```
   *Expected outcome*: 0 errors across API, UI, and scripts.
