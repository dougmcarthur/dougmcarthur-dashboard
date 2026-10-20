# Handoff Report: UX, Visual Design, and Clutter Audit (Explorer 2)

**Agent**: Explorer 2  
**Date**: 2026-10-20  
**Scope**: Artist Identity, Shows, Promo, EPK, and Public Surfaces (`#shows`, `#promo`, `#artist`, `#epk`, `#epk/<token>`, `#survey`, `#survey-results`, `#join/<token>`)  
**Working Directory**: `/Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_2`

---

## 1. Observation

### 1.1 Dead-End Top-Level Routing
- In `frontend/src/App.tsx:54-65`:
  ```tsx
  {page === 'overview' && <OverviewPage onNav={navigate} />}
  {page === 'review' && <ReviewPage initialFilter={arg} />}
  {page === 'gigs' && <GigsPage initialOpen={arg} />}
  {page === 'artist' && <ArtistPage initialTab={arg} />}
  {page === 'sync' && <SyncPage />}
  {page === 'promo' && <PromoDraftsPage />}
  {page === 'runs' && <HistoryPage key={arg ?? ''} initialKind={arg} onNav={navigate} />}
  {page === 'settings' && <SettingsPage initialTab={arg} />}
  {page === 'help' && <HelpPage />}
  ```
  Navigating to `#shows` or `#epk` (which are explicitly documented in `GEMINI.md` line 52 as hash routes) matches none of these conditions and renders an empty `<Layout>` container with no error and no content.

### 1.2 Contrast Floor Violations (`text-faint` on Readable Text)
`.agents/skills/ui-rules/SKILL.md` Section 2 states:
> "`text-muted` (secondary readable text — minimum contrast floor for sentences and labels), `text-faint` (**decorative only** — dividers, empty-cell dashes `'—'`, disabled states; **never** on readable prose, captions, or form labels)."

Direct observations of violations in production code:
- `frontend/src/pages/artist/LibraryViews.tsx:229`: `<p className="text-sm text-faint">No one-line description yet.</p>`
- `frontend/src/pages/artist/LibraryViews.tsx:263`: `<p className="text-sm text-faint">No bio yet.</p>`
- `frontend/src/pages/artist/LibraryViews.tsx:285`: `<span className="text-faint tabular-nums">...w</span>` (word count badge)
- `frontend/src/pages/artist/LibraryViews.tsx:313`: `<p className="text-sm text-faint">No live video or recordings yet. A live video is the first thing a programmer watches.</p>`
- `frontend/src/pages/artist/LibraryViews.tsx:341`: `<p className="text-sm text-faint">No press photos yet.</p>`
- `frontend/src/pages/artist/LibraryViews.tsx:375`: `<p className="text-sm text-faint">No facts yet — hometown, line-up, set length.</p>`
- `frontend/src/pages/artist/LibraryViews.tsx:392`: `<p className="text-sm text-faint">No stage plot, rider or tax forms yet.</p>`
- `frontend/src/pages/artist/AssetForm.tsx:52`: `<p className="text-xs text-faint mt-1">{meta.meaning}</p>`
- `frontend/src/pages/artist/AssetForm.tsx:71`: `<p className="text-xs text-faint mt-1 tabular-nums">{draft.value.length} characters</p>`
- `frontend/src/pages/artist/AssetForm.tsx:77`: `<span className="text-faint font-normal">— what a form is asking when it asks for this</span>`
- `frontend/src/pages/artist/AssetForm.tsx:103`: `<span className="text-faint font-normal">— blank for {meta.reviewMonths} months</span>`
- `frontend/src/pages/artist/AssetRow.tsx:15`: `unreviewed: { text: 'Never reviewed', className: 'border-line text-faint' }`
- `frontend/src/pages/artist/AssetRow.tsx:83`: `<span className="text-xs text-faint tabular-nums">Review by {asset.reviewBy}</span>`
- `frontend/src/pages/artist/ShowsPanel.tsx:35`: `<p className="text-xs text-faint">` (source attribution links)
- `frontend/src/pages/artist/StagePlotTab.tsx:387`: `<p className="text-xs text-faint print:hidden">Inputs are the usual choice...</p>`
- `frontend/src/pages/artist/StageCards.tsx:505`: `<div className="flex items-baseline justify-between text-[11px] text-faint">`
- `frontend/src/pages/artist/SourcePanel.tsx:72, 74`: `text-xs text-faint` on kind and variant labels
- `frontend/src/pages/artist/DriveImportPanel.tsx:104, 106`: `text-xs text-faint` on kind and variant labels
- `frontend/src/pages/artist/AssociationPanel.tsx:78, 80`: `text-xs text-faint` on kind and variant labels
- `frontend/src/components/epk/EpkView.tsx:73`: `${k === i ? 'text-muted' : 'text-faint'}` (bio word counts)
- `frontend/src/components/epk/EpkView.tsx:378`: `<p className="text-xs text-faint">Kept current with Sun Dogs Music Scout</p>` (public footer brand line)
- `frontend/src/pages/survey/SurveyScreens.tsx:120`: `<p className="text-xs text-faint" aria-live="polite">{text.length} of {q.maxLength} characters</p>`
- `frontend/src/pages/survey/results/ResultsView.tsx:51`: `<p className="text-xs text-faint">...fewer than 10 artists...</p>`

### 1.3 Primitive Violations (Raw Controls & Banned Patterns)
- `frontend/src/pages/PromoDraftsPage.tsx:152-162`: Raw `<button>` with `rounded text-faint hover:text-danger-fg hover:bg-danger-bg` used for delete action.
- `frontend/src/pages/artist/DocumentsTab.tsx:132-141`: Raw `<button>` with `rounded text-faint hover:text-danger-fg hover:bg-danger-bg` used for delete action.
- `frontend/src/pages/artist/DocumentsTab.tsx:106-110, 148-153`: Hand-rolled `<input>` and `<textarea>` class strings rather than using `FIELD` or `<Input>` / `<Textarea>`.
- `frontend/src/pages/artist/DriveTab.tsx:210, 322`: Hand-rolled anchor class strings rather than using `buttonClass(...)`.

### 1.4 Workflow Friction & Missing Actions
- `frontend/src/pages/PromoDraftsPage.tsx:166-172`: When a draft is expanded, there is no Copy button.
- `frontend/src/pages/artist/ShowsPanel.tsx:77-84`: Empty state instructs user to connect Bandsintown in Settings, but has no button or link to `#settings`.
- `frontend/src/pages/epk/PublicEpkPage.tsx:42-46`: "Save as PDF" is a raw unstyled text button stranded below the footer.

### 1.5 Invariant Compliance Checks
- Public Survey pages (`#survey`, `#survey-results`): Verified 0 occurrences of "Scout". Brand is strictly "Sun Dogs Music".
- No bare "Scout" standalone brand marks observed.
- Sensitive tokens (`#join/<token>`, `#epk/<token>`): Verified tokens exist only in URL hash fragment, never in request path.

---

## 2. Logic Chain

1. **Accessibility and Design Integrity**:
   - Observations in Section 1.2 demonstrate that readable text across artist empty states, forms, and public presentation is styled with `text-faint`.
   - `SKILL.md` explicitly designates `text-faint` as decorative-only (contrast floor is `text-muted`).
   - Therefore, promoting these 20+ instances to `text-muted` fixes contrast without visual noise or regression.

2. **Core Artist Workflow Friction**:
   - Observations in Section 1.4 show that Promo drafts lack a 1-click Copy button.
   - Core product invariant in `GEMINI.md`: "Scout drafts emails, sync pitches, and application answers... Buttons say Copy, Create drafts, or Open in Gmail".
   - Therefore, adding a 1-click Copy action directly inside the expanded promo card aligns with the core product invariant and removes manual highlight friction.

3. **Routing Completeness**:
   - `GEMINI.md` documents `#shows` and `#epk` as active routes.
   - Currently, navigating to `#shows` or `#epk` yields a blank canvas.
   - Mapping `#shows` -> `#artist/checklists` (or `#gigs`) and `#epk` -> `#artist/profile` ensures that direct navigation or external links cleanly resolve to relevant artist surfaces.

4. **Component Consistency**:
   - `PromoDraftsPage.tsx` and `DocumentsTab.tsx` hand-roll raw delete buttons with `text-faint` and `hover:bg-danger-bg`.
   - `SKILL.md` requires shared primitives (`<Button>`).
   - Using `<Button variant="quiet" size="sm">` or `<Button variant="danger" size="sm">` enforces consistency and ensures visible hover states.

---

## 3. Caveats

1. **Six-Tab Limit on ArtistPage (`test/calmUi.test.ts:107-113`)**:
   `test/calmUi.test.ts` strictly enforces that `ArtistPage.tsx` must contain `<= 6` tabs. Any routing alias for `#shows` or `#epk` must redirect/alias existing sub-tabs (e.g. `checklists` and `profile`) rather than adding new tabs to `ArtistPage.tsx`.
2. **Survey Anonymity & Brand Rule**:
   Public survey pages (`#survey`, `#survey-results`) must never mention "Scout" under any circumstances (`test/canadianCopy.test.ts` & `GEMINI.md`).
3. **No Person Name in Code**:
   `test/noPersonInCode.test.ts` scans all frontend code; new or modified copy must never contain person names.

---

## 4. Conclusion

The audit identifies a high-confidence, non-breaking set of improvements that substantially improve readability, reduce friction, and align the frontend with project rules:

### High-Confidence Implementation Targets (Immediate):
1. **Promote `text-faint` to `text-muted`** across `LibraryViews.tsx`, `AssetForm.tsx`, `AssetRow.tsx`, `ShowsPanel.tsx`, `StagePlotTab.tsx`, `StageCards.tsx`, `SourcePanel.tsx`, `DriveImportPanel.tsx`, `AssociationPanel.tsx`, `EpkView.tsx`, `SurveyScreens.tsx`, and `ResultsView.tsx`.
2. **Add 1-Click Copy button** to expanded promo drafts in `PromoDraftsPage.tsx`.
3. **Replace raw `<button>`** delete elements in `PromoDraftsPage.tsx` and `DocumentsTab.tsx` with `<Button>`.
4. **Add CTA button to Settings** in `ShowsPanel.tsx` empty state.
5. **Add route aliases** for `#shows` and `#epk` in `App.tsx`.
6. **Polish "Save as PDF" button** in `PublicEpkPage.tsx`.

---

## 5. Verification Method

1. **Automated Test Suites**:
   - Run Vitest suite:
     `export PATH="/opt/homebrew/bin:$PATH" && npm test`
     (Verifies `uiConsistency.test.ts`, `calmUi.test.ts`, `canadianCopy.test.ts`, `noPersonInCode.test.ts`).
   - Run timezone-independent test:
     `export PATH="/opt/homebrew/bin:$PATH" && TZ=Pacific/Auckland npm test`
2. **TypeScript Compilation**:
   - Run multi-compiler typecheck:
     `export PATH="/opt/homebrew/bin:$PATH" && npm run typecheck`
3. **Visual Layout Verification**:
   - Inspect `#artist`, `#promo`, `#shows`, `#epk/<token>`, `#survey`, and `#survey-results` across desktop (1280x800) and mobile (390x844).
   - Invalidation conditions: Any test failure in `uiConsistency.test.ts` (dead hovers, unshared primitives), `calmUi.test.ts` (uppercase, card borders, tab counts), or `canadianCopy.test.ts` (Canadian spelling / product names).
