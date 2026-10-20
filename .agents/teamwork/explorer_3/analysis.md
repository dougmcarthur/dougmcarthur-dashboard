# UX, Visual Design & Clutter Audit: Settings, Help, Global App Shell & Shared UI Primitives

**Audit Scope**:
- Routes: `#settings` (`SettingsPage.tsx`, all 11 settings cards), `#help` (`HelpPage.tsx`)
- Global Layout & Shell: Header/brand lockup, tab bar, mobile navigation drawer, banners, dialogs/modals, toast notifications, side panel dock (`Layout.tsx`, `NotificationBell.tsx`, `SidePanel.tsx`, `FeedbackModal.tsx`, `GoogleConsentModal.tsx`)
- Shared UI Primitives: `frontend/src/components/ui/` (`Button.tsx`, `Surface.tsx`, `Field.tsx`, `Disclosure.tsx`, `Explainer.tsx`, `Modal.tsx`, `Tabs.tsx`)
- Styling System: `tailwind.config.js`, semantic token discipline (`surface`, `raised`, `sunken`, `line`, `accent`, `ok`, `warn`, `danger`), font ramp, responsive behavior (desktop 1280x800 and mobile 390x844).

---

## Executive Summary

Sun Dogs Music Scout has established strong foundations: semantic color tokens wired to CSS custom variables in `themes.css`, automated guards in `test/uiConsistency.test.ts` and `test/calmUi.test.ts`, and core primitives in `components/ui/`.

However, an exhaustive audit of Settings, Help, Shell, and Primitives identified **16 concrete UX, visual clutter, friction, and token consistency issues**:
1. **Readable Contrast Floor Violations (`text-faint`)**: Multiple full sentences, definition list labels, and brand subtitles are set to `text-faint` instead of `text-muted`, violating Section 2 of `SKILL.md` and failing contrast on low-contrast themes.
2. **"Card Soup" & Visual Clutter in Help**: `HelpPage.tsx` stacks 9 separate boxed, bordered, shadowed cards with `space-y-8`, generating heavy visual clutter and repetitive container noise without quick-jump navigation.
3. **Severe Two-Column Layout Asymmetry in Settings**: On the `account` tab, non-owner artists (the primary users) see 3 cards stacked in the left column and a completely empty blank void in the right column at `>=1280px`.
4. **Interaction Friction & Inconsistency**: Ad-hoc On/Off buttons with unauthorized `hover:brightness-110` in `SuggestionsCard` and `DigestSettingsCard` clash with the polished `Toggle` switch in `AppearanceSettings`.
5. **Jarring Native `window.confirm()` Alerts**: `BandsintownCard`, `AssociationsCard`, and `PasskeysCard` trigger blocking OS/browser dialogs instead of calm in-place confirmations.
6. **Mobile Touch Target Deficits**: The `InfoGlyph` in `Explainer.tsx` has a 14x14px hit target, failing touch ergonomics on mobile devices.

---

## Section 1: Detailed Findings by Area & 3-Part Rubric

### 1. Shared UI Primitives (`frontend/src/components/ui/`)

#### Issue 1.1: `Explainer.tsx` Sub-Standard Mobile Touch Target
- **File & Lines**: `frontend/src/components/ui/Explainer.tsx:134-152`
- **Rubric**: Task Friction: High | Polish: High
- **Observation**:
  ```tsx
  <button
    type="button"
    onClick={() => setOpen((o) => !o)}
    aria-expanded={open}
    aria-controls={panelId}
    aria-label={open ? `Hide the note about ${name}` : `About ${name}`}
    className={`shrink-0 rounded-full transition-colors hover:text-body
                focus:outline-none focus:ring-2 focus:ring-accent
                ${open ? 'text-body' : 'text-faint'}`}
  >
    <InfoGlyph />
  </button>
  ```
  `InfoGlyph` renders an SVG of `h-3.5 w-3.5` (14px by 14px). The button has zero padding.
- **Problem**: On touch devices (e.g. mobile 390x844), tapping an exact 14x14px hit target is difficult and leads to missed taps or accidental taps on adjacent text/controls. WCAG 2.5.5 targets at least 24x24px (preferably 44x44px).
- **Recommendation**: Add tap-padding `p-1.5 -m-1.5` or `p-2 -m-2` to the button. This expands the hit target to ~28-30px without altering the visual spacing of the surrounding flex layout.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 1.2: Missing Visible Focus Rings on `Button.tsx`
- **File & Lines**: `frontend/src/components/ui/Button.tsx:60-67`
- **Rubric**: Polish: Medium | Friction: Medium
- **Observation**:
  `Button` sets:
  ```tsx
  className={`rounded-md font-medium transition-colors disabled:opacity-40
              disabled:pointer-events-none ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
  ```
  It has no explicit `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1` utility classes. While global `index.css` sets `:focus-visible { outline: 2px solid ... }`, buttons lack the rounded ring treatment that form fields enjoy (`focus:ring-2 focus:ring-accent`).
- **Recommendation**: Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent` to `Button` so keyboard navigation has an intentional, smooth indicator matching form inputs.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 1.3: `Banner` Primitive Polymorphism & Semantic Flexibility
- **File & Lines**: `frontend/src/components/ui/Surface.tsx:163`
- **Rubric**: Polish: Low | Clutter: Low
- **Observation**:
  `Banner` is hardcoded to return `<p className={...}>{children}</p>`. In `IntegrationsCard.tsx:706-712`, multiple lines are mapped inside `Banner` using `<span>` with `block` to avoid invalid nested `<p>` tags.
- **Recommendation**: Support `as?: 'div' | 'p'` or default to `<div>` / `<aside role="status">` so callers can render structured lines or paragraphs without HTML semantic nesting errors.
- **Confidence**: Recommended next step.

---

### 2. Global App Shell & Navigation (`Layout.tsx`, Modals, Side Panel)

#### Issue 2.1: Readable Contrast Floor Violation in Brand Header Lockup
- **File & Lines**: `frontend/src/components/Layout.tsx:173-178`
- **Rubric**: Polish: Critical | Clutter: Low
- **Observation**:
  ```tsx
  <a
    href={admin ? '#admin' : '#overview'}
    className="font-semibold text-ink text-sm tracking-tight hover:text-body transition-colors shrink-0"
  >
    Scout <span className="text-faint font-normal">— Sun Dogs Music</span>
  </a>
  ```
- **Problem**: `text-faint` is applied to "— Sun Dogs Music".
  Per `SKILL.md` Section 2:
  `text-faint` is **decorative only** (dividers, empty dashes '—', disabled states) and **never** on readable prose, captions, or brand labels.
  Per `GEMINI.md` Section 1:
  "Product name: **Sun Dogs Music Scout** in full; **Scout** once in context. Never use bare `Scout` as a standalone brand mark."
  Rendering "— Sun Dogs Music" in `text-faint` drops its contrast below readable threshold in light or low-contrast themes, causing the brand mark to read as bare "Scout".
- **Recommendation**: Change `text-faint` to `text-muted`.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 2.2: Mobile Navigation Drawer Touch Target Density
- **File & Lines**: `frontend/src/components/Layout.tsx:260-343`
- **Rubric**: Friction: Medium | Polish: Medium
- **Observation**:
  In `Layout.tsx`, mobile menu links use `linkClass(id)`:
  `px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ...`
  `py-1.5` produces an element height of ~34px. In the mobile dropdown on a phone screen, 10+ items are stacked in a narrow `w-48` popup.
- **Recommendation**: In mobile drawer links, increase vertical padding to `py-2` (achieving 40-42px touch targets) and increase dropdown width to `w-52` or `w-56` on small screens so labels have comfortable breathing room and thumb taps are accurate.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 2.3: `FeedbackModal.tsx` Contrast Floor Violation
- **File & Lines**: `frontend/src/components/FeedbackModal.tsx:118-120`
- **Rubric**: Polish: Medium | Friction: Low
- **Observation**:
  ```tsx
  <p className="mt-2 text-xs text-faint">
    Nothing else — not what is on the page, and nothing about your gigs or drafts.
  </p>
  ```
- **Problem**: This is a full readable reassurance sentence clarifying data privacy. Using `text-faint` makes it washed out and hard to read, violating `SKILL.md`.
- **Recommendation**: Change `text-faint` to `text-muted`.
- **Confidence**: High-confidence immediate implementation target.

---

### 3. Settings Route (`SettingsPage.tsx` & Cards)

#### Issue 3.1: Severe Layout Asymmetry & Empty Right Column in `Account` Tab
- **File & Lines**: `frontend/src/pages/SettingsPage.tsx:103-125`
- **Rubric**: Clutter: High | Polish: High | Friction: Medium
- **Observation**:
  ```tsx
  section === 'account' ? (
    <Columns
      left={
        <>
          <ProfileCard />
          <HomeBaseCard />
          <PasskeysCard />
        </>
      }
      right={
        <>
          {session?.role === 'owner' && <AgentTokensCard />}
          {session?.role === 'owner' && <AdminModeCard />}
          <NotesBackfillCard />
        </>
      }
    />
  )
  ```
  `Columns` creates an `xl:grid-cols-2 gap-8` grid.
  For an independent musician (whose role is `'artist'`, not `'owner'`), `AgentTokensCard` is hidden, `AdminModeCard` is hidden, and `NotesBackfillCard` is hidden when there are no unparsed notes.
- **Problem**: At viewports `>= 1280px` (desktop standard), the musician sees three tall cards stacked down the left column and **literally nothing** in the right column — an empty expanse of canvas taking up 50% of the screen.
- **Recommendation**:
  When `session?.role !== 'owner'`, distribute the artist cards across the two columns:
  - Left column: `ProfileCard`, `HomeBaseCard`
  - Right column: `PasskeysCard`, `<NotesBackfillCard />`
  When `session?.role === 'owner'`:
  - Left column: `ProfileCard`, `HomeBaseCard`, `PasskeysCard`
  - Right column: `AgentTokensCard`, `AdminModeCard`, `<NotesBackfillCard />`
- **Confidence**: High-confidence immediate implementation target.

#### Issue 3.2: Inconsistent Toggle Switches in `SuggestionsCard` and `DigestSettingsCard`
- **File & Lines**:
  - `frontend/src/components/SuggestionsCard.tsx:31-44`
  - `frontend/src/components/DigestSettingsCard.tsx:65-81`
- **Rubric**: Friction: Medium | Polish: High | Clutter: Medium
- **Observation**:
  Both cards render an ad-hoc `<button>` with custom styling:
  ```tsx
  className={`shrink-0 text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-40 ${
    on
      ? 'bg-success-solid text-accent-fg hover:brightness-110'
      : 'bg-surface border border-line-strong text-body hover:bg-sunken'
  }`}
  ```
  Notice:
  1. `hover:brightness-110` is an ad-hoc Tailwind utility outside the design system semantic token discipline.
  2. In `AppearanceSettings.tsx:85-113`, a clean `Toggle` switch primitive is implemented with an accessible track, sliding knob, and `role="switch"`.
- **Recommendation**: Extract `Toggle` into `frontend/src/components/ui/Toggle.tsx` (or export from `ui/Field.tsx`), and replace the ad-hoc "On/Off" button in `SuggestionsCard` and `DigestSettingsCard` with the proper semantic `Toggle` switch.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 3.3: Multiple Contrast Floor (`text-faint`) Violations in `IntegrationsCard` and `AdminModeCard`
- **File & Lines**:
  - `frontend/src/components/IntegrationsCard.tsx:284, 288, 292`: `<dt className="w-28 shrink-0 text-faint">Account</dt>`, `Connected`, `Last used`
  - `frontend/src/components/IntegrationsCard.tsx:297`: `<p className="text-xs text-faint">Last checked {onDate(row.checkedAt)}</p>`
  - `frontend/src/components/IntegrationsCard.tsx:345`: `<p className="text-xs text-faint">{spec.breaks}</p>`
  - `frontend/src/components/IntegrationsCard.tsx:356`: `<p className="min-w-0 flex-1 text-xs text-faint">{LEAVES_BEHIND[spec.id]}</p>`
  - `frontend/src/components/IntegrationsCard.tsx:558`: `<p className="text-xs text-faint">The calendar, task list, Drive folder and drafts Scout made stay in the account...</p>`
  - `frontend/src/components/IntegrationsCard.tsx:593`: `<p className="text-xs text-faint">For keeping, say, your calendar on one account and your mail on another...</p>`
  - `frontend/src/components/AdminModeCard.tsx:60`: `<p className="text-xs text-faint">Asks for your passkey, and lasts until you switch back.</p>`
- **Rubric**: Polish: High | Friction: Medium
- **Problem**: 8 distinct places in Settings render readable copy, labels, and critical warnings in `text-faint`, violating `SKILL.md` Section 2.
- **Recommendation**: Replace `text-faint` with `text-muted` across all 8 locations.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 3.4: Jarring Browser-Native `window.confirm()` Dialogs
- **File & Lines**:
  - `frontend/src/components/BandsintownCard.tsx:124`
  - `frontend/src/components/AssociationsCard.tsx:117`
  - `frontend/src/components/PasskeysCard.tsx:130`
  - `frontend/src/components/PasskeysCard.tsx:155`
- **Rubric**: Friction: High | Polish: High
- **Observation**:
  `if (confirm('Disconnect Bandsintown?...'))` and `if (confirm('Sign out of every browser?'))` pop up synchronous browser-native alerts.
  By contrast, `IntegrationsCard.tsx:537-553` uses an in-place confirmation row:
  `{confirming === key ? ( <span>Disconnect?</span> <Button variant="danger">Disconnect</Button> <Button variant="quiet">Cancel</Button> ) : ( <Button variant="quiet">Disconnect</Button> )}`
- **Recommendation**: Adopt the in-place confirmation pattern (or a consistent `<ConfirmModal>`) across `BandsintownCard`, `AssociationsCard`, and `PasskeysCard`.
- **Confidence**: High-confidence immediate implementation target for in-place confirmations.

#### Issue 3.5: Form Controls Bypassing Primitives in Settings
- **File & Lines**:
  - `AppearanceSettings.tsx:201-208`: Raw `<input id="custom-font" className="w-full max-w-sm rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-faint" />` lacking `border-field` and `focus:ring-2 focus:ring-accent`.
  - `AssociationsCard.tsx:104-111`: Raw `<a>` tag with hand-rolled button classes: `text-xs px-3 py-1.5 rounded-md font-medium transition-colors border border-line-strong text-body hover:bg-sunken hover:text-ink` instead of `buttonClass('neutral', 'sm')`.
  - `DigestSettingsCard.tsx:129-141`: Raw `<select>` instead of `<Select filter size="sm">`.
  - `DigestSettingsCard.tsx:201-215`: Raw buttons for Preview/Hide and Send now instead of `<Button variant="quiet" size="sm">` and `<Button variant="primary" size="sm">`.
- **Rubric**: Polish: Medium | Clutter: Medium
- **Recommendation**: Replace all bypassed form controls with the designated primitives from `frontend/src/components/ui/`.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 3.6: `NotesBackfillCard.tsx` Styling Inconsistency
- **File & Lines**: `frontend/src/components/NotesBackfillCard.tsx:52-55`
- **Rubric**: Clutter: Medium | Polish: Medium
- **Observation**:
  `NotesBackfillCard` renders:
  ```tsx
  <div className="space-y-3 max-w-4xl">
    <h2 className="text-sm font-semibold text-ink">Data</h2>
    <Disclosure ... />
  </div>
  ```
  Every other card on Settings uses `<Card className="space-y-3">`. Having a floating `<h2>Data</h2>` with a detached `<Disclosure>` breaks the card grid rhythm.
- **Recommendation**: Wrap `NotesBackfillCard` content inside `<Card className="space-y-3">` or integrate it as a clean disclosure within the Account section.
- **Confidence**: High-confidence immediate implementation target.

---

### 4. Help Route (`HelpPage.tsx`)

#### Issue 4.1: "Card Soup" Visual Clutter & Broken Reading Rhythm
- **File & Lines**: `frontend/src/pages/HelpPage.tsx:57-221`
- **Rubric**: Clutter: High | Polish: High | Friction: Medium
- **Observation**:
  `HelpPage` renders 9 separate `<Card as="section" pad="md" className="space-y-3 text-sm text-body leading-relaxed">` elements stacked with `space-y-8`.
  1. Made for Canadian artists
  2. The screens
  3. How an opportunity moves
  4. What Scout will not do
  5. Connecting Google
  6. Signing in
  7. Looking after your eyes
  8. Your information, privacy and terms
  9. Feedback
- **Problem**: When reading documentation, surrounding every short section with a heavy `border border-line rounded-xl shadow-card bg-surface` creates severe container fatigue. The borders and box containers dominate the page visually rather than the content.
- **Recommendation**:
  - Unify the documentation into a cohesive, structured layout.
  - Group related sections into 3 logical topics (e.g. *Getting Started & Canadian Context*, *Opportunities & Workflow*, *Account, Privacy & Appearance*).
  - Use soft horizontal rules or clean typographic sectioning rather than 9 heavy separate cards.
  - Maintain the required invariant phrases verbatim (`Made for Canadian artists`, `Opportunities outside Canada are never left out`, `Nothing is ever hidden because of it`).
- **Confidence**: High-confidence immediate implementation target.

#### Issue 4.2: Lack of Sticky Quick-Navigation / Table of Contents
- **File & Lines**: `frontend/src/pages/HelpPage.tsx:32-51`
- **Rubric**: Friction: High | Clutter: Medium
- **Observation**:
  The help page is ~240 lines of long-form text. A user coming to Help to look up "Connecting Google" or "Work permits / travel abroad" or "Signing in" must scroll through the entire page. There are no quick jump anchor pills or table of contents.
- **Recommendation**:
  Add an interactive horizontal jump pill bar below the header:
  `[Canadian artists] [The screens] [Opportunity stages] [Google access] [Passkeys & security] [Themes]`
  Clicking smooth-scrolls to that section anchor.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 4.3: Redundant "Send feedback" Card
- **File & Lines**: `frontend/src/pages/HelpPage.tsx:41-43` & `197-207`
- **Rubric**: Clutter: Medium | Friction: Low
- **Observation**:
  "Send feedback" is already the primary CTA button in the page header (line 41). Section 9 ("Feedback") repeats an entire card explaining feedback and rendering another "Send feedback" button.
- **Recommendation**:
  Consolidate feedback into the header and the help menu, keeping a concise note in the help guide rather than an entire redundant card.
- **Confidence**: High-confidence immediate implementation target.

#### Issue 4.4: Unstructured "The screens" Listing
- **File & Lines**: `frontend/src/pages/HelpPage.tsx:77-98`
- **Rubric**: Polish: High | Clutter: Medium
- **Observation**:
  `The screens` section renders 8 plain paragraphs with an inline link and em-dash:
  ```tsx
  <p><a href="#overview" className="font-medium text-ink hover:text-accent">Overview</a> — What needs you today...</p>
  ```
- **Problem**: At a glance, this is a monotonous block of text where screen names blur together.
- **Recommendation**: Format into a clean, scannable definition list (`<dl>`) or 2-column badge-and-description grid where the screen badge stands out clearly on the left and the 1-sentence description sits beside it.
- **Confidence**: High-confidence immediate implementation target.

---

## Section 2: Implementation Priority Matrix

| Item # | Component / File | Issue Description | Rubric Category | Priority & Category |
|---|---|---|---|---|
| **1** | `Layout.tsx:177` | Fix `text-faint` on brand subtitle `— Sun Dogs Music` (change to `text-muted`) | Polish / Brand | **Immediate Target** |
| **2** | `Explainer.tsx:134-152` | Expand `InfoGlyph` mobile hit target to >=28px with `p-1.5 -m-1.5` | Friction / A11y | **Immediate Target** |
| **3** | `FeedbackModal.tsx:118` | Fix `text-faint` on privacy explanation sentence (change to `text-muted`) | Polish / Contrast | **Immediate Target** |
| **4** | `IntegrationsCard.tsx:284-593` | Fix 7 instances of `text-faint` on readable copy, labels, and notes | Polish / Contrast | **Immediate Target** |
| **5** | `AdminModeCard.tsx:60` | Fix `text-faint` on passkey prompt note (change to `text-muted`) | Polish / Contrast | **Immediate Target** |
| **6** | `SettingsPage.tsx:103-125` | Fix Account tab empty right column for non-owner artist accounts | Clutter / Layout | **Immediate Target** |
| **7** | `SuggestionsCard.tsx:31-44` | Replace ad-hoc button + `hover:brightness-110` with standard `Toggle` | Polish / Tokens | **Immediate Target** |
| **8** | `DigestSettingsCard.tsx:65-81` | Replace ad-hoc button + `hover:brightness-110` with standard `Toggle` | Polish / Tokens | **Immediate Target** |
| **9** | `AppearanceSettings.tsx:201` | Replace raw `<input>` with standard `<Input>` primitive | Polish / A11y | **Immediate Target** |
| **10** | `AssociationsCard.tsx:108` | Replace hand-rolled button classes with `buttonClass('neutral', 'sm')` | Polish / System | **Immediate Target** |
| **11** | `DigestSettingsCard.tsx:201` | Replace raw Preview/Send buttons with `<Button size="sm">` | Polish / System | **Immediate Target** |
| **12** | `Layout.tsx:260-343` | Increase mobile nav drawer item vertical padding for touch target accuracy | Friction / Mobile | **Immediate Target** |
| **13** | `HelpPage.tsx` | Declutter "card soup", add quick-jump navigation, format screen list | Clutter / UX | **Immediate Target** |
| **14** | `BandsintownCard.tsx:124` | Replace native `window.confirm()` with in-place confirmation | Friction / UX | **Immediate Target** |
| **15** | `AssociationsCard.tsx:117` | Replace native `window.confirm()` with in-place confirmation | Friction / UX | **Immediate Target** |
| **16** | `PasskeysCard.tsx:130,155` | Replace native `window.confirm()` with in-place confirmation | Friction / UX | **Immediate Target** |

---

## Section 3: Invariant Protection & Verification

When implementing the immediate targets:
1. **Brand Invariants (`GEMINI.md`)**:
   - Header lockup remains "Scout — Sun Dogs Music" (never bare "Scout", never "Music Scout"). Changing the subtitle from `text-faint` to `text-muted` reinforces brand presence.
2. **Copy Invariants (`test/canadianCopy.test.ts`)**:
   - `HelpPage.tsx` MUST retain verbatim:
     - `'Made for Canadian artists'`
     - `/Opportunities outside Canada are never left out/`
     - `/Nothing is ever hidden because of it/`
3. **Calm UI Invariants (`test/calmUi.test.ts`)**:
   - No `uppercase` outside `StageCards.tsx`.
   - No colored left borders (`border-l-*`).
   - Danger tone is only for broken/destructive states.
4. **UI Consistency Invariants (`test/uiConsistency.test.ts`)**:
   - No dead hover states (`bg-X hover:bg-X`).
   - Bulk writes continue using `<Disclosure>`.
   - No per-page hand-rolled input strings.
   - Explainer must retain Escape closing, click toggling, aria attributes, and `showHints` hook.
