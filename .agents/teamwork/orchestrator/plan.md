# Plan — Sun Dogs Music Scout UX & Design Review

## Objective
Deliver a comprehensive UX audit report at `docs/design-review.md` and implement high-confidence UI/UX polish and decluttering in `frontend/src/` for Sun Dogs Music Scout, strictly adhering to GEMINI.md and .agents/skills/ui-rules/SKILL.md, fully verified visually and programmatically.

## Execution Steps

### 1. Survey & Audit (Exploration)
Spawn 3 parallel Explorers:
- **Explorer 1 (Core Hub & Discovery)**:
  - Audit `#overview`, `#review`, `#gigs`, `#sync`.
  - Evaluate Visual Clutter, Task Friction, and Visual Hierarchy.
  - Identify redundant borders, nested boxes, competing badges, excessive copy, awkward filters/empty states.
- **Explorer 2 (Artist Identity & Public Views)**:
  - Audit `#shows`, `#promo`, `#artist`, `#epk`, and public routes `#epk/<token>`, `#survey`, `#survey-results`, `#join/<token>`.
  - Evaluate clutter, friction, and hierarchy, especially responsive ergonomics and public presentation.
- **Explorer 3 (Global Layout, Settings, Help & Shared Primitives)**:
  - Audit `#settings`, `#help`, global header/navigation/mobile drawer, modals/dialogs, and shared primitives in `frontend/src/components/ui/` (`Button`, `Card`, `Field`, `Caption`, `Explainer`, `Disclosure`, etc.).
  - Check adherence to ui-rules, token usage, and layout density.

### 2. Synthesis & Documentation
- Worker compiles all explorer findings into `docs/design-review.md`.
- Structure into:
  - Executive Summary & Rubric definitions.
  - Systemic / Global UX Patterns & Opportunities.
  - Per-View Detailed Audit (all 14 routes + shared primitives) with scores and file citations.
  - Prioritized Recommendations matrix (Impact vs Effort).
  - Explicit partition: "Implemented in this pass" vs "Recommended next steps".

### 3. Implementation (High-Confidence Decluttering & Polish)
- Worker implements the selected high-confidence changes in `frontend/src/`:
  - Quieten visual clutter: soften harsh borders, reduce nested cards/boxes, clean up secondary metadata and badge noise.
  - Polish layout & spacing: improve vertical rhythm, card padding, typography scale, scannability.
  - Streamline interaction & task friction: clarify primary CTAs, improve empty/loading states, reduce unnecessary clicks.
  - Ensure zero regressions to GEMINI.md invariants (brand naming, preview-then-apply, no person in code, no internal IDs, localToday()).
  - Ensure strict compliance with `.agents/skills/ui-rules/SKILL.md`.

### 4. Review, Challenge & Visual Verification
- Reviewers: Check code changes, token discipline, adherence to UI rules and GEMINI invariants.
- Challengers: Run build, vitest (`npm test`, `TZ=Pacific/Auckland npm test`), typecheck (`npm run typecheck`), and verify desktop (1280x800) and mobile (390x844) visual rendering.
- Auditor: Forensic check for authentic implementation.

### 5. Gate & Reporting
- Evaluate all verdicts in `GATE_STATUS.md`.
- If all pass, update `progress.md` and report completion back to Sentinel with structured human report.
