## 2026-10-20T17:02:07Z
You are Explorer 2 on Sun Dogs Music Scout UX & Design Review.
Your working directory is:
/Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_2

MANDATORY INPUTS:
- Read /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/ORIGINAL_REQUEST.md before starting work.
- Read /Users/doug/Documents/GitHub/dougmcarthur-dashboard/GEMINI.md for non-negotiable project invariants.
- Read /Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/skills/ui-rules/SKILL.md for UI guidelines and constraints.

YOUR MISSION & SCOPE:
Conduct an in-depth UX, visual design, and clutter audit of the Artist Identity, Shows, and Public surfaces:
- Authenticated routes: `#shows`, `#promo`, `#artist`, `#epk`
- Public routes: `#epk/<token>`, `#survey`, `#survey-results`, `#join/<token>`
- Associated components in `frontend/src/` (e.g. `Shows.tsx`, `Promo.tsx`, `Artist.tsx`, `Epk.tsx`, `PublicEpk.tsx`, `Survey.tsx`, `SurveyResults.tsx`, `Join.tsx`, etc.)

EVALUATE AGAINST THE 3-PART RUBRIC:
1. Visual Clutter & Information Density: Redundant chrome, nested boxes/borders, competing badges, excessive explanatory copy, secondary metadata crowding out primary content.
2. Task Friction & Interaction Cost: Unnecessary clicks, scroll depth, fragmented actions, unclear primary CTAs, awkward empty/loading/filter states in core artist workflows.
3. Visual Hierarchy, Typography & Polish: Alignment, spacing rhythm, scannability of tables/lists/cards, responsive ergonomics across desktop (1280x800) and mobile (390x844), especially artist showcase aesthetics and public presentation (must look polished, professional, and credible to industry bookers/fans).
- Check strict adherence to GEMINI.md: Public survey pages must say "Sun Dogs Music" and never mention "Scout"; no bare "Scout" anywhere; tokens never travel in URL paths (fragment only).

OUTPUT REQUIREMENTS:
- Write your detailed findings to `/Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_2/analysis.md`.
  - For each route/view, cite specific files and lines.
  - Score each issue against the rubric (Clutter, Friction, Polish).
  - Explicitly propose which items are "High-confidence immediate implementation targets" vs "Recommended next steps".
- Write `/Users/doug/Documents/GitHub/dougmcarthur-dashboard/.agents/teamwork/explorer_2/handoff.md` with:
  - Observation: Summary of findings across shows, promo, artist, epk, and public views.
  - Logic Chain: Reasoning for recommended fixes.
  - Caveats: Any delicate invariants.
  - Conclusion: Concrete list of actionable high-confidence fixes and candidate code edits.
- Use send_message to report completion back to the orchestrator when done.
