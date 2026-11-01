---
name: ui-rules
description: Visual, structural, and copy rules for frontend components in Sun Dogs Music Scout. Apply whenever creating or editing files in frontend/src/.
---

# UI Rules (`frontend/src/`)

The rules live in one place: `.claude/skills/ui-rules/SKILL.md`. Read that file in full
before creating or editing anything under `frontend/src/`. It covers the shared
components, the colour tokens, the copy rules and the checks to run before finishing.

The guards that enforce them are `test/uiConsistency.test.ts` and
`test/canadianCopy.test.ts`. Run the first before and after the change:

```bash
npx vitest run test/uiConsistency.test.ts
```

Do not copy the rules back into this file. A second copy is how this one came to name
Button variants and colour tokens that no longer exist, and a class with no matching
token renders as nothing.
