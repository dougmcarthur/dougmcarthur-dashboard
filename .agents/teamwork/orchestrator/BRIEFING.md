# BRIEFING — 2026-10-20T17:05:00Z

## Mission
Conduct a comprehensive UX and visual design review of Sun Dogs Music Scout, produce `docs/design-review.md`, and implement high-confidence UI/UX decluttering and polish improvements in `frontend/src/` with rigorous automated and visual verification.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/orchestrator
- Original parent: Sentinel
- Original parent conversation ID: 0698ab7f-8853-4449-8731-afff7ee125a8

## 🔒 My Workflow
- **Pattern**: Project Pattern (Survey -> Decompose & Delegate -> Iterate/Gate -> Verify & Complete)
- **Scope document**: /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/PROJECT.md
1. **Decompose**: Survey full frontend app surfaces (authenticated routes, public routes, shared primitives), draft comprehensive audit in `docs/design-review.md`, isolate high-confidence decluttering and friction reduction targets, and execute implementation and verification.
2. **Dispatch & Execute**:
   - Survey: Spawn 3 Explorers in parallel to audit (A) Core Hub & Discovery (#overview, #review, #gigs, #sync), (B) Artist Identity & Public (#shows, #promo, #artist, #epk, public views #epk/<token>, #survey, #survey-results, #join/<token>), (C) Settings, Help, Layout & Shared Primitives (#help, #settings, Header/Nav/Drawer, `frontend/src/components/ui/`).
   - Synthesis & Report: Worker compiles findings into `docs/design-review.md`.
   - Implementation: Worker implements high-confidence decluttering/polish fixes in `frontend/src/`.
   - Review & Challenge: Reviewers and Challengers verify code quality, UX improvements, responsive behavior (1280x800 & 390x844), and test suites (`npm test`, `TZ=Pacific/Auckland npm test`, `npm run typecheck`).
   - Forensic Audit: Auditor verifies integrity (no mock tests, no invariants violated).
3. **On failure**: Retry -> Replace -> Skip -> Redistribute -> Redesign -> Escalate
4. **Succession**: Threshold 16 spawns. On trigger, soft handoff, persist state, cancel crons, spawn successor.
- **Work items**:
  1. Survey & Audit (3 parallel Explorers) [in-progress]
  2. Synthesize & Produce `docs/design-review.md` [pending]
  3. Implement high-confidence UI/UX decluttering in `frontend/src/` [pending]
  4. Multi-agent review, adversarial challenge, and visual/test verification [pending]
  5. Forensic integrity audit [pending]
  6. Final delivery & reporting to Sentinel [pending]
- **Current phase**: 1 (Survey & Audit)
- **Current focus**: Parallel explorer audit of all frontend surfaces

## 🔒 Key Constraints
- Strict adherence to GEMINI.md invariants:
  - Brand name: "Sun Dogs Music Scout" in full, "Scout" once in context; never bare "Scout"; survey pages say "Sun Dogs Music".
  - Never claim to send or submit external forms/emails (Copy, Create drafts, Open in Gmail).
  - Every bulk write is preview-then-apply using `<Disclosure>`.
  - No person's name in code; no internal identifiers in visible UI copy; no clock in pure logic / use `localToday()` in frontend.
- Strict adherence to `.agents/skills/ui-rules/SKILL.md`:
  - Shared primitives (`<Button>`, `<Input>`, `<Select>`, `<Textarea>`, `<Card>`, `<Caption>`, `<Explainer>`, `<Disclosure>`).
  - Tailwind tokens only; `text-muted` is floor for readable text; no dead hover states.
- All tests must pass: `npm test`, `TZ=Pacific/Auckland npm test`, `npm run typecheck`.
- Visual inspection across desktop (1280x800) and mobile (390x844).
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.
- Dispatch-only orchestrator: Never modify source code directly; never run tests directly.

## Current Parent
- Conversation ID: 0698ab7f-8853-4449-8731-afff7ee125a8
- Updated: not yet

## Key Decisions Made
- Partitioned audit into 3 explorer domains to achieve full coverage of all routes and primitives without context overload.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_1 | teamwork_preview_explorer | Survey & Audit Core Hub (#overview, #review, #gigs, #sync) | completed | ab206cca-594a-4daa-a319-3259bc212b99 |
| explorer_2 | teamwork_preview_explorer | Survey & Audit Artist Identity & Public Views | completed | 5e5142d0-558f-4fa0-a1f8-b726a0c02b2d |
| explorer_3 | teamwork_preview_explorer | Survey & Audit Shell, Settings, Help & Primitives | completed | 06212a13-5dc8-4612-84f4-1cd18451544a |
| worker_1 | teamwork_preview_worker | Synthesize full audit into docs/design-review.md | completed | 6abfc0c3-bd79-48a6-b7cc-7e34104b57bc |
| worker_2 | teamwork_preview_worker | Implement high-confidence UI/UX polish in frontend/src/ | completed | 6418074d-5b9b-4af9-aa4e-d01c0a5028d1 |
| reviewer_1 | teamwork_preview_reviewer | Code & Invariants Review | in-progress | 5f6a91e4-4577-4711-9820-79953fb2fe00 |
| reviewer_2 | teamwork_preview_reviewer | UX & Ergonomics Review | completed | 2f83f217-1bb1-451f-a3e1-0e7dc7025e73 |
| challenger_1 | teamwork_preview_challenger | Responsive Ergonomics Challenge | completed | e66541bb-8c59-4c5b-a2d5-aadfaed3cd00 |
| challenger_2 | teamwork_preview_challenger | Invariant Stress Challenge | completed | 4fc1a1f7-89f2-47fc-8433-b9d6432150c0 |
| auditor_1 | teamwork_preview_auditor | Forensic Integrity Audit | in-progress | 0ac8b362-f6fb-4f9b-9144-9f9c39cd4829 |

## Succession Status
- Succession required: no
- Spawn count: 11 / 16
- Pending subagents: 0ac8b362-f6fb-4f9b-9144-9f9c39cd4829
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-18
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/ORIGINAL_REQUEST.md — Authoritative User Request
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/orchestrator/DISPATCH.md — Dispatch instructions
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/orchestrator/BRIEFING.md — Persistent context & identity
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/orchestrator/progress.md — Liveness & execution tracking
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/orchestrator/plan.md — Detailed execution plan
- /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/PROJECT.md — Global project architecture & milestones
