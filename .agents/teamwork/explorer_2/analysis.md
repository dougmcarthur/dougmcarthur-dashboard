# UX, Visual Design, and Clutter Audit: Artist Identity, Shows, and Public Surfaces
**Sun Dogs Music Scout** — Explorer 2 Report  
**Date**: 2026-10-20  
**Target Surfaces**:
- Authenticated: `#shows`, `#promo`, `#artist` (Library, Stage plot, Documents, Profile, Drive, Checklists), `#epk`
- Public: `#epk/<token>`, `#survey`, `#survey-results`, `#join/<token>`
- Associated components in `frontend/src/`

---

## Executive Summary

This audit evaluated all artist identity, live show presentation, promo draft workflows, and public-facing touchpoints in Sun Dogs Music Scout. Overall, the application has an exceptionally well-thought-out domain model and clear respect for musician workflows (e.g., sensible stage plot generation, EPK versioning per audience, Canadian dollar figures, and strict privacy on public survey pages).

However, our deep investigation uncovered four systemic categories of visual clutter, interaction friction, and design guideline deviations:

1. **Dead-End Routing & Missing Hash Route Handlers**: Navigating to `#shows` or bare `#epk` (both documented in `GEMINI.md`) renders completely empty screens inside `<Layout>`, stranding users with no content.
2. **Pervasive Contrast Floor Violations (`text-faint`)**: More than 20 instances across 10 files use `text-faint` on readable empty states, instructional sentences, status badge labels, date strings, character counts, and the EPK footer credit. `.agents/skills/ui-rules/SKILL.md` explicitly mandates that `text-muted` is the minimum contrast floor for readable text, and `text-faint` is strictly reserved for decorative glyphs (dividers, dashes).
3. **Primitive Violations & Hand-Rolled Controls**: Hand-rolled raw `<button>`, `<input>`, `<textarea>`, and link class strings are present in `PromoDraftsPage.tsx`, `DocumentsTab.tsx`, and `DriveTab.tsx` instead of using shared primitives (`<Button>`, `<Input>`, `<Textarea>`, `buttonClass`).
4. **Task Friction in Core Artist Actions**:
   - `PromoDraftsPage.tsx` provides no 1-click **Copy** button for draft prose.
   - `ShowsPanel.tsx` in its empty state instructs users to connect Bandsintown in Settings, but provides no CTA button or link.
   - `PublicEpkPage.tsx` renders a raw, unstyled "Save as PDF" text link stranded below the global footer.

---

## Detailed Evaluation by View & Component

### 1. Routing & Top-Level Navigation (`App.tsx`)

| File & Line | Rubric Category | Severity | Issue Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| `frontend/src/App.tsx:54-65` | Task Friction | **High** | `App.tsx` routes `overview`, `review`, `gigs`, `artist`, `sync`, `promo`, `runs`, `settings`, `help`. `GEMINI.md` explicitly specifies `#shows` and `#epk` as top-level hash routes, but neither is handled in `App.tsx`. Visiting `#shows` or `#epk` renders a blank canvas inside `<Layout>`. | In `App.tsx`, route `page === 'shows'` to `#artist/checklists` (where `ShowsPanel` resides) or `#gigs`, and route `page === 'epk'` to `#artist/profile` (where EPK share links and live preview reside). |

---

### 2. Shows Presentation & Integration (`ShowsPanel.tsx`, `EpkView.tsx`, `BandsintownCard.tsx`)

| File & Line | Rubric Category | Severity | Issue Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| `frontend/src/pages/artist/ShowsPanel.tsx:77-84` | Task Friction | **Medium** | When no shows are connected and the list is empty, `ShowsPanel` returns a raw prose paragraph: *"Shows come from Bandsintown and your Manitoba Music profile. Connect either under Settings..."*, but provides zero link or button to Settings. | Wrap in `<Card>` or append a `<Button variant="neutral" size="sm" onClick={() => window.location.hash = 'settings'}>Open Settings</Button>` to provide an immediate next action. |
| `frontend/src/pages/artist/ShowsPanel.tsx:35` | Polish / Contrast | **High** | `<p className="text-xs text-faint">` used for source attribution links (`Bandsintown`, `Manitoba Music`, `Scout`). Fails accessibility and `SKILL.md` token rules. | Change `text-faint` to `text-muted`. |
| `frontend/src/components/epk/EpkView.tsx:319` | Visual Polish | **Low** | In the EPK view, Upcoming and Past shows sit in `grid-cols-1 md:grid-cols-2`. If an artist has only upcoming dates (or only past dates), half the desktop screen is empty white space. | Use a dynamic grid class: `md:grid-cols-2` only when both `shows.upcoming.length > 0 && shows.past.length > 0`; otherwise render single column. |

---

### 3. Promo & Pitch Drafts (`PromoDraftsPage.tsx`)

| File & Line | Rubric Category | Severity | Issue Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| `frontend/src/pages/PromoDraftsPage.tsx:166-172` | Task Friction | **High** | Core product invariant: Scout drafts, musicians review and copy. Expanding a promo draft displays formatted text, but has **no Copy button**. Users must manually click, drag-select, and copy. | Add a `<Button variant="neutral" size="sm">Copy</Button>` (or `<CopyButton>`) beside Publish / Delete inside the expanded header or panel. |
| `frontend/src/pages/PromoDraftsPage.tsx:152-162` | Clutter / Primitives | **Medium** | Raw hand-rolled `<button className="w-6 h-6 flex items-center justify-center rounded text-faint hover:text-danger-fg hover:bg-danger-bg disabled:opacity-40 transition-colors" title="Delete"> × </button>` violates `SKILL.md` (no hand-rolled buttons). The resting state is `text-faint`, making it almost invisible. | Replace with `<Button variant="quiet" size="sm" onClick={...}>Delete</Button>` or a standard icon button. |
| `frontend/src/pages/PromoDraftsPage.tsx:81-83` | Visual Hierarchy | **Low** | Bare `<h1>Promo Drafts</h1>` lacks the standard `<Explainer>` header present on other core views (`Artist`, `Sync`, `Review`). | Wrap title in `<Explainer title="Promo Drafts">` with a concise blurb describing that drafts are generated for announcements and outreach. |

---

### 4. Artist Identity & Asset Library (`ArtistPage.tsx`, `LibraryViews.tsx`, `AssetRow.tsx`, `AssetForm.tsx`)

| File & Line | Rubric Category | Severity | Issue Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| `frontend/src/pages/ArtistPage.tsx:172-206` | Visual Clutter | **Medium** | Overdue and unreviewed filter buttons use heavy solid/saturated styling (`bg-danger-bg text-danger-fg border-danger-line` and `bg-ink text-surface`) placed directly above the main tab bar. They overpower the visual hierarchy. | Tone down to subtle badge pills with quiet borders, so the primary section tabs (`Library`, `Stage plot`, etc.) retain clear visual dominance. |
| `frontend/src/pages/artist/LibraryViews.tsx:229, 263, 313, 341, 375, 392` | Polish / Contrast | **High** | Six separate empty state sentences in ProfileView use `text-faint`: *"No one-line description yet."*, *"No bio yet."*, *"No live video or recordings yet..."*, *"No press photos yet."*, *"No facts yet..."*, *"No stage plot, rider or tax forms yet."*. Fails `SKILL.md` contrast floor. | Change all 6 instances from `text-faint` to `text-muted`. |
| `frontend/src/pages/artist/LibraryViews.tsx:285` | Polish / Contrast | **Medium** | Word count badge on secondary bio buttons uses `text-faint tabular-nums`. | Change to `text-muted tabular-nums`. |
| `frontend/src/pages/artist/AssetRow.tsx:15` | Polish / Contrast | **High** | `unreviewed` status config uses `className: 'border-line text-faint'`. Status badge text "Never reviewed" fails contrast floor. | Change `text-faint` to `text-muted`. |
| `frontend/src/pages/artist/AssetRow.tsx:83` | Polish / Contrast | **High** | `<span className="text-xs text-faint tabular-nums">Review by {asset.reviewBy}</span>` uses `text-faint` on readable date text. | Change to `text-muted`. |
| `frontend/src/pages/artist/AssetRow.tsx:88-111` | Visual Clutter | **Medium** | Each asset row can display up to 4 pill borders simultaneously (`Answers: ...`, `chars`, `© credit`, `usageRights`), cluttering the card on mobile screens (390px). | Group secondary attribution tags into a streamlined metadata line with clean bullet separators (`·`). |
| `frontend/src/pages/artist/AssetForm.tsx:52, 71, 77, 103` | Polish / Contrast | **High** | Four occurrences of `text-faint` on form label explanations and character counts: line 52 (`meta.meaning`), line 71 (`characters`), line 77 (`— what a form is asking...`), line 103 (`— blank for X months`). | Change all 4 instances from `text-faint` to `text-muted`. |
| `frontend/src/pages/artist/DocumentsTab.tsx:106-110, 148-153` | Primitives | **Medium** | Hand-rolled `<input>` and `<textarea>` class strings used for title and content editing instead of `<Input>` / `<Textarea>` or `FIELD`. | Refactor to use `FIELD` or `<Input>` / `<Textarea>`. |
| `frontend/src/pages/artist/DocumentsTab.tsx:132-141` | Primitives | **Medium** | Raw `<button>` with `text-faint hover:text-danger-fg hover:bg-danger-bg` used for document deletion. | Replace with `<Button variant="quiet" size="sm">` or `<Button variant="danger" size="sm">`. |
| `frontend/src/pages/artist/DriveTab.tsx:210-215` | Primitives | **Low** | Hand-rolled anchor class string `inline-flex items-center h-10 px-4 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover` instead of `buttonClass('primary', 'md')`. | Refactor to `buttonClass('primary', 'md')`. |
| `frontend/src/pages/artist/DriveTab.tsx:322-324` | Primitives | **Low** | Hand-rolled anchor class string `text-xs px-3 py-1.5 rounded-md text-body hover:text-ink hover:bg-sunken` instead of `buttonClass('quiet', 'sm')`. | Refactor to `buttonClass('quiet', 'sm')`. |
| `frontend/src/pages/artist/SourcePanel.tsx:72, 74` | Polish / Contrast | **High** | Proposal metadata tags use `text-xs text-faint` for kind and variant labels. | Change to `text-xs text-muted`. |
| `frontend/src/pages/artist/DriveImportPanel.tsx:104, 106` | Polish / Contrast | **High** | Proposal metadata tags use `text-xs text-faint` for kind and variant labels. | Change to `text-xs text-muted`. |
| `frontend/src/pages/artist/AssociationPanel.tsx:78, 80` | Polish / Contrast | **High** | Association proposal tags use `text-xs text-faint` for kind and variant labels. | Change to `text-xs text-muted`. |

---

### 5. Stage Plot & Tech Rider (`StagePlotTab.tsx`, `StageCards.tsx`)

| File & Line | Rubric Category | Severity | Issue Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| `frontend/src/pages/artist/StagePlotTab.tsx:387` | Polish / Contrast | **High** | `<p className="text-xs text-faint print:hidden">Inputs are the usual choice for each instrument...</p>` uses `text-faint` on instructional prose. | Change `text-faint` to `text-muted`. |
| `frontend/src/pages/artist/StageCards.tsx:505` | Polish / Contrast | **Medium** | Channel card footer metadata uses `text-[11px] text-faint`. | Change `text-faint` to `text-muted`. |
| `frontend/src/pages/artist/StagePlotTab.tsx:234-267` | Visual Clutter | **Medium** | Three separate toggles (Colour, Detail, Names) plus "Rearrange" button sit in a cramped row. On mobile viewports (390px), this breaks into uneven staggered rows. | Group the toggles cleanly using flex wrap with consistent gap and compact segmented pill styling. |

---

### 6. EPK & Public EPK (`EpkView.tsx`, `PublicEpkPage.tsx`, `ProfileTab.tsx`)

| File & Line | Rubric Category | Severity | Issue Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| `frontend/src/components/epk/EpkView.tsx:378` | Polish / Contrast | **High** | `<p className="text-xs text-faint">Kept current with Sun Dogs Music Scout</p>`. Brand tagline footer is set in unreadable `text-faint`. | Change `text-faint` to `text-muted`. |
| `frontend/src/components/epk/EpkView.tsx:73` | Polish / Contrast | **Medium** | Word count indicator inside bio length buttons uses `text-faint` when unselected (`${k === i ? 'text-muted' : 'text-faint'}`). | Change unselected state to `text-muted` or opacity-60. |
| `frontend/src/pages/epk/PublicEpkPage.tsx:42-46` | Visual Hierarchy | **High** | "Save as PDF" is rendered as a standalone raw underlined button floating in a blank container below the entire page footer. To a festival booker, it looks like an unstyled afterthought. | Integrate the export action cleanly into the EPK header bar or a fixed/sticky top or footer action bar with a polished `<Button variant="quiet" size="sm">Save as PDF</Button>`. |
| `frontend/src/pages/artist/ProfileTab.tsx:211-232` | Visual Hierarchy | **Low** | The list of withheld library items uses an unadorned `<details>` summary inside `<Card>`. It lacks clear visual structure. | Add subtle border and padding to make the disclosure expand cleanly. |

---

### 7. Public Survey & Survey Results (`SurveyPage.tsx`, `SurveyScreens.tsx`, `SurveyResultsPage.tsx`, `ResultsView.tsx`)

| File & Line | Rubric Category | Severity | Issue Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| *GEMINI.md Invariant Check* | Invariant | **Pass** | Verified: Survey pages (`#survey`, `#survey-results`) say **Sun Dogs Music** and contain **zero occurrences** of "Scout". | Maintain strict isolation. |
| `frontend/src/pages/survey/SurveyScreens.tsx:120` | Polish / Contrast | **High** | Character count `<p className="text-xs text-faint" aria-live="polite">{text.length} of {q.maxLength} characters</p>` uses `text-faint`. | Change to `text-muted`. |
| `frontend/src/pages/survey/results/ResultsView.tsx:51` | Polish / Contrast | **High** | Privacy threshold disclaimer `<p className="text-xs text-faint">...chosen by fewer than 10 artists...</p>` uses `text-faint`. | Change to `text-muted`. |
| `frontend/src/pages/survey/SurveyScreens.tsx:249-277` | Responsive Polish | **Pass** | Comparison table for Opportunity A vs Opportunity B scales cleanly down to 390px mobile viewport with single-row attributes. | Retain as reference implementation for responsive tables. |

---

### 8. Join / Onboarding Screen (`JoinScreen.tsx`)

| File & Line | Rubric Category | Severity | Issue Description | Proposed Resolution |
| :--- | :--- | :--- | :--- | :--- |
| *GEMINI.md Invariant Check* | Invariant | **Pass** | Product name is "Sun Dogs Music Scout" in full. Invitation token is kept strictly in the URL hash fragment (`#join/<token>`) and transmitted in the POST body. Passkey authentication is cleanly handled. | Maintain invariant. |
| `frontend/src/components/JoinScreen.tsx:122-149` | Information Density | **Low** | Touch ID explainer and terms/privacy legal copy stack into two consecutive dense paragraphs directly beneath the primary button. | Slightly tighten vertical margin (`space-y-2`) to keep the primary CTA prominently above the mobile fold on short screens (iPhone SE). |

---

## Prioritized Implementation Roadmap

### Phase 1: High-Confidence Immediate Implementation Targets
These items are low-risk, uncontroversial, strictly comply with all invariants, and directly improve readability, accessibility, and task completion:

1. **Eliminate All `text-faint` Contrast Violations on Readable Text**:
   - `frontend/src/pages/artist/LibraryViews.tsx` (lines 229, 263, 285, 313, 341, 375, 392)
   - `frontend/src/pages/artist/AssetForm.tsx` (lines 52, 71, 77, 103)
   - `frontend/src/pages/artist/AssetRow.tsx` (lines 15, 83)
   - `frontend/src/pages/artist/ShowsPanel.tsx` (line 35)
   - `frontend/src/pages/artist/StagePlotTab.tsx` (line 387)
   - `frontend/src/pages/artist/StageCards.tsx` (line 505)
   - `frontend/src/pages/artist/SourcePanel.tsx` (lines 72, 74)
   - `frontend/src/pages/artist/DriveImportPanel.tsx` (lines 104, 106)
   - `frontend/src/pages/artist/AssociationPanel.tsx` (lines 78, 80)
   - `frontend/src/components/epk/EpkView.tsx` (lines 73, 378)
   - `frontend/src/pages/survey/SurveyScreens.tsx` (line 120)
   - `frontend/src/pages/survey/results/ResultsView.tsx` (line 51)
2. **Add 1-Click Copy Affordance in Promo Drafts**:
   - Add `<Button variant="neutral" size="sm">` or `<CopyButton>` in `PromoDraftsPage.tsx` so artists can copy drafted announcements with one click.
3. **Replace Hand-Rolled Buttons with Shared Primitives**:
   - `PromoDraftsPage.tsx:152`: Replace raw delete `<button>` with `<Button variant="quiet" size="sm">` or `<Button variant="danger" size="sm">`.
   - `DocumentsTab.tsx:132`: Replace raw delete `<button>` with `<Button variant="quiet" size="sm">`.
   - `DriveTab.tsx:210, 322`: Replace raw anchor class strings with `buttonClass(...)`.
4. **Fix Empty-State CTA in `ShowsPanel.tsx`**:
   - Provide an actionable button linking directly to `#settings` when no shows/integrations are connected.
5. **Fix Top-Level Routing for `#shows` and `#epk` in `App.tsx`**:
   - Alias `#shows` to `#artist/checklists` and `#epk` to `#artist/profile`.
6. **Polish "Save as PDF" Presentation in `PublicEpkPage.tsx`**:
   - Integrate the print trigger into the header or clean footer action bar instead of a lonely unstyled link.

### Phase 2: Recommended Next Steps (Requires Product Review)
1. **Re-architect Asset Library Overdue/Unreviewed Filter Banners**: Replace aggressive full-color action buttons above tabs with integrated filter chips or sub-tab indicators.
2. **Dynamic EPK Shows Grid**: Automatically collapse from 2-column to 1-column layout when an artist only has upcoming or past shows.
3. **Stage Plot Mobile Layout Ergonomics**: Re-order control toggles and add horizontal scroll affordance indicators for input list tables on narrow viewports (<400px).
