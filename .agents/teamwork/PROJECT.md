# Project: Sun Dogs Music Scout UX & Design Review

## Architecture
- Frontend: Single-page React 18 + TypeScript + Vite + Tailwind CSS (`frontend/src/`)
- Backend: Cloudflare Worker + Hono (`src/`) backed by Cloudflare D1
- Shared logic: Pure TypeScript domain logic (`shared/`)
- Design System: Shared primitives in `frontend/src/components/ui/` + Tailwind semantic tokens in `tailwind.config.js`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Full-App UX Audit | Comprehensive heuristic evaluation across all routes, public views, and shared UI primitives | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Design Review Report | Structured, prioritized report at `docs/design-review.md` distinguishing Implemented vs Next Steps | M2 | ORIGINAL_REQUEST §R2 |
| 3 | High-Confidence Implementation | Decluttering, friction reduction, spacing/typography polish in `frontend/src/` | M3 | ORIGINAL_REQUEST §R3 |
| 4 | Visual & Automated Verification | Full test suites passing + visual inspection across desktop (1280x800) and mobile (390x844) | M4 | ORIGINAL_REQUEST §R4 |
| 5 | Forensic Integrity Audit | Systematic integrity verification against shortcuts or regressions | M5 | ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| M1 | Survey & Audit | 3 parallel Explorers auditing Core Hub, Artist/Public, and Settings/Primitives | none | DONE | 3 analysis & handoff reports |
| M2 | Report Documentation | Compile `docs/design-review.md` with complete scores, citations, recommendations | M1 | DONE | `docs/design-review.md` (470 lines) |
| M3 | UI/UX Implementation | Implement high-confidence decluttering and polish in `frontend/src/` | M2 | DONE | 42 files modified, new Toggle primitive |
| M4 | Review & Verification | Vitest (`npm test`, `TZ=Pacific/Auckland npm test`), `npm run typecheck`, responsive visual check | M3 | DONE | 4 APPROVE verdicts from 2 Reviewers and 2 Challengers |
| M5 | Forensic Audit & Handoff | Forensic integrity check and final report to Sentinel | M4 | DONE | Binary CLEAN verdict from Auditor |

## Interface Contracts & Constraints
- Brand name: "Sun Dogs Music Scout" in full, "Scout" once in context; public survey is "Sun Dogs Music".
- Never claim to send or submit external forms or emails.
- Every bulk write is preview-then-apply using `<Disclosure>`.
- Shared primitives in `frontend/src/components/ui/` must be used; valid Tailwind tokens only.
- `text-muted` is floor for readable copy; no dead hover states.
- `localToday()` for all frontend date logic.
- Node/npm path: `/opt/homebrew/bin` must be in PATH.
