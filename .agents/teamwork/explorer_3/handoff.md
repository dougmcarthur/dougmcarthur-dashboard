# Handoff Report — Explorer 3: Settings, Help, Global App Shell & Shared UI Primitives

## 1. Observation

### Verification Baseline
- Automated test suites (`npm test`): **143 test files passed (3,236 tests)** with 0 failures.
- Timezone test suite (`TZ=Pacific/Auckland npm test`): **143 test files passed** with 0 failures.
- TypeScript compiler (`npm run typecheck` across `tsconfig.json`, `tsconfig.frontend.json`, `tsconfig.scripts.json`): **0 type errors**.

### Key Code Observations
1. **Readable Contrast Floor Violations (`text-faint` on readable text & labels)**:
   - `frontend/src/components/Layout.tsx:177`: `Scout <span className="text-faint font-normal">— Sun Dogs Music</span>`
   - `frontend/src/components/FeedbackModal.tsx:118`: `<p className="mt-2 text-xs text-faint">Nothing else — not what is on the page, and nothing about your gigs or drafts.</p>`
   - `frontend/src/components/IntegrationsCard.tsx:284, 288, 292`: `<dt className="w-28 shrink-0 text-faint">Account</dt>`, `Connected`, `Last used`
   - `frontend/src/components/IntegrationsCard.tsx:297`: `<p className="text-xs text-faint">Last checked {onDate(row.checkedAt)}</p>`
   - `frontend/src/components/IntegrationsCard.tsx:345`: `<p className="text-xs text-faint">{spec.breaks}</p>`
   - `frontend/src/components/IntegrationsCard.tsx:356`: `<p className="min-w-0 flex-1 text-xs text-faint">{LEAVES_BEHIND[spec.id]}</p>`
   - `frontend/src/components/IntegrationsCard.tsx:558`: `<p className="text-xs text-faint">The calendar, task list, Drive folder and drafts Scout made stay in the account...</p>`
   - `frontend/src/components/IntegrationsCard.tsx:593`: `<p className="text-xs text-faint">For keeping, say, your calendar on one account and your mail on another...</p>`
   - `frontend/src/components/AdminModeCard.tsx:60`: `<p className="text-xs text-faint">Asks for your passkey, and lasts until you switch back.</p>`

2. **Mobile Hit Target Deficit in `Explainer.tsx`**:
   - `frontend/src/components/ui/Explainer.tsx:134-152`: The button containing `<InfoGlyph />` is `h-3.5 w-3.5` (14x14px) with no padding, rendering a 14px target on mobile.

3. **Inconsistent Toggle Switches & Banned Utilities**:
   - `frontend/src/components/SuggestionsCard.tsx:31-44` and `frontend/src/components/DigestSettingsCard.tsx:65-81`: Both use an ad-hoc button saying "On" / "Off" with `hover:brightness-110` (untracked Tailwind filter utility) instead of a shared semantic toggle switch.
   - `frontend/src/components/AppearanceSettings.tsx:85-113`: Has a clean, accessible `Toggle` component (`role="switch"`, sliding thumb).

4. **Settings Page `account` Tab Column Void**:
   - `frontend/src/pages/SettingsPage.tsx:103-125`: `Columns` renders 2 columns on `xl` screens. Left column holds 3 cards (`ProfileCard`, `HomeBaseCard`, `PasskeysCard`). Right column holds owner-only cards (`AgentTokensCard`, `AdminModeCard`) and conditional `NotesBackfillCard`. For standard artist accounts (`role === 'artist'`), the entire right column is empty canvas.

5. **"Card Soup" & Visual Clutter in `HelpPage.tsx`**:
   - `frontend/src/pages/HelpPage.tsx:57-221`: 9 separate `<Card as="section" pad="md">` elements stacked with `space-y-8`, generating heavy borders, repeated shadows, and disjointed reading flow.
   - Redundant "Send feedback" card at the bottom (lines 197-207) duplicates the primary "Send feedback" header button (line 41).
   - "The screens" section (lines 77-98) lists 8 screens in plain inline paragraphs without scannable structure.

6. **Native Blocking `window.confirm()` Alerts**:
   - `frontend/src/components/BandsintownCard.tsx:124`
   - `frontend/src/components/AssociationsCard.tsx:117`
   - `frontend/src/components/PasskeysCard.tsx:130, 155`

7. **Bypassed Form Primitives**:
   - `frontend/src/components/AppearanceSettings.tsx:201-208`: Raw `<input id="custom-font" className="w-full max-w-sm rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint" />` lacking `border-field` and focus rings.
   - `frontend/src/components/AssociationsCard.tsx:105-110`: Hand-rolled button classes on `<a>` instead of `buttonClass('neutral', 'sm')`.
   - `frontend/src/components/DigestSettingsCard.tsx:129-141`: Raw `<select>` instead of `<Select filter>`.
   - `frontend/src/components/DigestSettingsCard.tsx:201-215`: Raw Preview/Send buttons instead of `<Button>`.

---

## 2. Logic Chain

1. **Contrast & Readability**:
   - Section 2 of `SKILL.md` mandates that `text-muted` is the minimum contrast floor for readable text, sentences, captions, and labels. `text-faint` is strictly reserved for decorative elements (dashes, dividers, disabled states).
   - `Layout.tsx`, `FeedbackModal.tsx`, `IntegrationsCard.tsx`, and `AdminModeCard.tsx` contain 10 instances of `text-faint` on full sentences, brand subtitles, and definition list labels.
   - Changing these to `text-muted` restores WCAG AA legibility across all themes without altering layout or breaking any tests.

2. **Mobile Ergonomics**:
   - A 14x14px hit target on `Explainer.tsx` violates mobile usability and WCAG 2.5.5 touch target size recommendations. Adding `p-1.5 -m-1.5` increases the interactive area to ~28px while keeping visual layout intact.
   - In `Layout.tsx`, increasing mobile menu drawer link vertical padding from `py-1.5` to `py-2` increases tap heights from ~34px to 42px.

3. **Layout Balance in Settings**:
   - On the `account` tab, `AgentTokensCard` and `AdminModeCard` are strictly gated to `session?.role === 'owner'`.
   - Because standard musicians are not owners, having a static 2-column layout with all 3 artist cards in column 1 creates an empty 50% void in column 2.
   - Distributing cards across both columns when `session?.role !== 'owner'` (e.g. Profile + HomeBase in left, Passkeys in right) creates an aesthetically balanced, polished layout.

4. **Decluttering Help**:
   - Stacking 9 distinct bordered cards with `space-y-8` creates visual fatigue and fragments reading flow.
   - Unifying the content into cohesive thematic sections with quick-jump pills at the top significantly improves navigation speed.
   - The verbatim strings in `HelpPage.tsx` required by `test/canadianCopy.test.ts` (`'Made for Canadian artists'`, `'Opportunities outside Canada are never left out'`, `'Nothing is ever hidden because of it'`) are strictly preserved.

5. **Token Discipline & Primitive Unification**:
   - `hover:brightness-110` in `SuggestionsCard` and `DigestSettingsCard` bypasses semantic tokens. Extracting `Toggle` into a shared primitive provides a uniform switch UI.
   - Using `<Button>` and `<Input>` everywhere avoids class string drift.

---

## 3. Caveats

1. **Disclosure Invariant for Bulk Writes**:
   - Any bulk write (`/api/backfill/notes`, `/api/sync/reconcile`, etc.) MUST use `<Disclosure>` from `ui/Disclosure.tsx` and preview before applying. `NotesBackfillCard` must preserve its `<Disclosure>` structure.
2. **Explainer Interaction Invariants**:
   - `test/uiConsistency.test.ts` enforces that `Explainer` opens on click, closes on Escape, does NOT close on click-outside, and respects `useAppearance().appearance.showHints`. Modifying `Explainer` must touch only hit target padding/classes.
3. **Exact Canadian Copy Invariants**:
   - `test/canadianCopy.test.ts` tests `HelpPage.tsx` with regexes:
     - `expect(help).toContain('Made for Canadian artists')`
     - `expect(help).toMatch(/Opportunities outside Canada are never left out/)`
     - `expect(read('frontend/src/pages/HelpPage.tsx')).toMatch(/Nothing is ever hidden because of it/)`
     These sentences must be retained verbatim in any decluttering of `HelpPage.tsx`.
4. **Elevation Invariants**:
   - `PasskeysCard`, `AgentTokensCard`, and `AdminModeCard` rely on `withConfirmation` for passkey elevation. The underlying mutation logic must not be modified when improving UI polish.

---

## 4. Conclusion

The audit identifies **16 concrete issues** across Settings, Help, Shell, and Primitives. All 16 can be implemented safely without regression:
- **Immediate High-Confidence Edits**:
  1. Fix 10 `text-faint` violations across `Layout.tsx`, `FeedbackModal.tsx`, `IntegrationsCard.tsx`, `AdminModeCard.tsx`.
  2. Expand `Explainer.tsx` button hit target with `p-1.5 -m-1.5`.
  3. Balance Settings `account` tab layout for artist sessions.
  4. Extract `Toggle` primitive and use in `SuggestionsCard` and `DigestSettingsCard` (eliminating `brightness-110`).
  5. Replace bypassed inputs and buttons in `AppearanceSettings.tsx`, `AssociationsCard.tsx`, and `DigestSettingsCard.tsx` with shared primitives.
  6. Increase mobile nav drawer tap target padding to `py-2`.
  7. Declutter `HelpPage.tsx` (unify card soup, add quick-jump anchor navigation, clean screen definition list).
  8. Upgrade native `confirm()` in `BandsintownCard`, `AssociationsCard`, `PasskeysCard` to in-place confirmation.

Detailed findings and line citations are recorded in:
`/Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_3/analysis.md`

---

## 5. Verification Method

To independently verify the audit and any resulting implementation:
1. `export PATH="/opt/homebrew/bin:/Users/doug/.nvm/versions/node/v22.22.3/bin:$PATH"`
2. `npm test` — Verifies all 143 test suites (including `uiConsistency.test.ts`, `canadianCopy.test.ts`, `a11yShell.test.ts`, `calmUi.test.ts`).
3. `TZ=Pacific/Auckland npm test` — Verifies no date math failures.
4. `npm run typecheck` — Verifies TypeScript across all configs.
5. Search for `text-faint` in `frontend/src/components/` to confirm zero contrast floor violations.
