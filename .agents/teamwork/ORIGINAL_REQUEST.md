# Original User Request

## 2026-10-20T16:58:52Z

Conduct a comprehensive UX and visual design review across all user-facing views of **Sun Dogs Music Scout**, produce a structured design audit report with prioritized recommendations, and directly implement high-confidence UI/UX improvements in `frontend/src/` that add polish, reduce task friction, and decrease visual clutter so independent Canadian musicians can focus on content and get tasks done.

Working directory: `/Users/doug/Documents/GitHub/dougmcarthur-dashboard`
Integrity mode: development

## Verification Resources & Project Guardrails

- **Project invariants (`GEMINI.md`)**:
  - Product name is **Sun Dogs Music Scout** in full, **Scout** once in context, never bare `Scout` as a standalone brand mark, never `Music Scout`. Public survey pages (`#survey`, `#survey-results`) say **Sun Dogs Music** and never mention `Scout`.
  - Scout never sends or submits external forms/emails (buttons say **Copy**, **Create drafts**, or **Open in Gmail**).
  - Every bulk write is preview-then-apply using `<Disclosure>`.
  - No person's name in code (`test/noPersonInCode.test.ts`); no internal identifiers in visible UI copy (`test/uiConsistency.test.ts`); no `new Date()` / `Date.now()` with no args in `shared/` or `test/*.test.ts` (use `localToday()` in frontend).
- **Frontend UI rules (`.agents/skills/ui-rules/SKILL.md`)**:
  - Shared primitives in `frontend/src/components/ui/` (`<Button>`, `<Input>`, `<Select>`, `<Textarea>`, `<Card>`, `<Caption>`, `<Explainer>`, `<Disclosure>`) must be used consistently.
  - Custom Tailwind tokens in `tailwind.config.js` (`surface`, `raised`, `well`, `hover`, `ink`, `muted`, `faint`, `edge`, `line`, `accent`, `ok`, `warn`, `danger`) must be respected; `text-muted` is the floor for readable prose/labels (never `text-faint` on readable text, never pair `bg-X` with `hover:bg-X`).
- **Automated test & typecheck suites**:
  - Note: Node and npm live in `/opt/homebrew/bin` (and `/Users/doug/.nvm/versions/node/v22.22.3/bin`); ensure `PATH` includes `/opt/homebrew/bin`.
  - `npm test` (including `test/uiConsistency.test.ts`, `test/canadianCopy.test.ts`, `test/tenantScope.test.ts`, `test/adminMode.test.ts`, `test/noPersonInCode.test.ts`)
  - `TZ=Pacific/Auckland npm test`
  - `npm run typecheck`

## Requirements

### R1. Comprehensive Full-App UX & Visual Clutter Audit
Evaluate every user-facing route and surface across the application (`#overview`, `#review`, `#gigs`, `#sync`, `#shows`, `#promo`, `#artist`, `#epk`, `#help`, `#settings`, `#join/<token>`, `#epk/<token>`, `#survey`, `#survey-results`, plus global navigation, headers, modals, and shared UI primitives in `frontend/src/components/ui/`). Assess each view against a structured heuristic rubric covering:
1. **Visual Clutter & Information Density**: Redundant chrome, nested boxes/borders, competing badges, excessive explanatory copy, or secondary metadata crowding out primary content.
2. **Task Friction & Interaction Cost**: Unnecessary clicks, scroll depth, fragmented actions, unclear primary CTAs, or awkward empty/loading/filter states in core artist workflows.
3. **Visual Hierarchy, Typography & Polish**: Alignment, spacing rhythm, scannability of tables/lists/cards, responsive ergonomics across desktop (`1280x800`) and mobile (`390x844`) viewports, and adherence to `.agents/skills/ui-rules/SKILL.md`.

### R2. Prioritized Design Review Report (`docs/design-review.md`)
Produce a comprehensive, actionable design review document at `docs/design-review.md`. Group findings by systemic/global patterns and by view, ranking each recommendation by impact on user focus and task completion vs. implementation complexity. Distinguish clearly between:
- **Implemented in this pass**: High-confidence decluttering, friction-reduction, and polish improvements applied directly to `frontend/src/`.
- **Recommended next steps**: Larger structural or workflow proposals that require product owner sign-off before changing behavior.

### R3. High-Confidence UI/UX Implementation (`frontend/src/`)
Directly implement the high-confidence improvements identified in the audit across `frontend/src/` to measurably reduce visual noise, streamline common user flows, and tighten visual polish while preserving all existing product functionality, accessibility, and invariants in `GEMINI.md` and `.agents/skills/ui-rules/SKILL.md`.

### R4. Visual & Automated Verification
Verify all implemented changes both programmatically (via the full Vitest suite and TypeScript compilers) and visually (by rendering the live local preview across desktop and mobile viewports using a headless browser or preview inspection to confirm layout integrity, reduced clutter, and zero visual regressions).

## Acceptance Criteria

### Audit & Rubric Completeness
- [ ] `docs/design-review.md` exists and evaluates all primary authenticated tabs (`#overview`, `#review`, `#gigs`, `#sync`, `#shows`, `#promo`, `#artist`, `#epk`, `#help`, `#settings`), public views (`#epk/<token>`, `#survey`, `#survey-results`, `#join/<token>`), and shared layout/primitives (`frontend/src/components/ui/`).
- [ ] Every finding in `docs/design-review.md` is scored against the heuristic rubric (Visual Clutter, Task Friction, Visual Polish/Hierarchy), cites specific component files, and is marked as either **Implemented** (with a summary of the code change) or **Proposed** (with concrete rationale and before/after behavior).

### Implemented UI Polish & Decluttering
- [ ] Concrete, high-confidence improvements are applied in `frontend/src/` addressing visual clutter (e.g., reducing redundant borders/containers, quieting secondary chrome/metadata, collapsing non-essential explainers, tightening spacing/hierarchy) and reducing workflow friction.
- [ ] All modified and new frontend code strictly obeys `.agents/skills/ui-rules/SKILL.md` (shared UI primitives, valid Tailwind tokens from `tailwind.config.js`, no `text-faint` on readable prose/labels, no dead hover states) and `GEMINI.md` invariants.

### Visual & Programmatic Verification
- [ ] An independent verification pass inspects the rendered application across both desktop (`1280x800`) and mobile (`390x844`) viewports and confirms no broken layouts, clipped text, horizontal overflow regressions, or dead controls.
- [ ] `npm test` passes with zero failures (including `uiConsistency.test.ts`, `canadianCopy.test.ts`, `noPersonInCode.test.ts`, `tenantScope.test.ts`, and `adminMode.test.ts`).
- [ ] `TZ=Pacific/Auckland npm test` passes with zero failures.
- [ ] `npm run typecheck` passes with zero errors across all three TypeScript configurations.
