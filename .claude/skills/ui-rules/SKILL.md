---
name: ui-rules
description: The frontend conventions for Sun Dogs Music Scout — the shared Button/Field/Disclosure components, the design-token palette, and the invariants test/uiConsistency.test.ts enforces at source level. Use this whenever you are about to add, restyle or restructure anything under frontend/src — a new screen, panel, card, button, input, badge, filter or empty state; a UX or design pass on Overview, Review, Gigs, Artist, Sync, Promo or Settings; a Tailwind class change; or any work that renders a status, a task, a draft or a bulk write. Use it even when the change looks like one line of CSS, because the mistakes this repository keeps making are exactly the ones that typecheck and render.
---

# Scout's UI rules

The guard is `test/uiConsistency.test.ts`. It reads the source and fails on
mistakes that typecheck and render perfectly — a hover state that does nothing,
a status a screen invented, a Send button where the app only ever copies. Every
rule below is one it enforces, and it exists because each one *shipped* at least
once.

This skill is for reading before the work, so a UX pass follows the rules rather
than discovering them in a red test afterwards.

**Run the guard first and last.** It is the spec, and it is fast:

```bash
npx vitest run test/uiConsistency.test.ts
```

## Use the shared components

`frontend/src/components/ui/` holds three. Reach for them rather than writing
class strings; fourteen hand-rolled button strings and five copies of the input
string are why they exist.

**`Button`** takes a variant named for what the button *means*, never for its
colour — so a palette change is one edit rather than a search:

| variant | for |
| --- | --- |
| `primary` | the one action the screen wants. At most one per group |
| `neutral` | everything else with a border. The most common button here |
| `quiet` | present but not competing — dismiss, copy, secondary affordances |
| `good` / `danger` / `info` | tinted, for outcome-carrying actions |

Sizes are `sm` and `md`. Pass extra layout with `className`; don't restate the
padding or the rounding.

**`Field`** exports `FIELD` (fills its container — forms) and `FILTER` (sized to
content — page-header controls), plus `Input`, `Textarea` and `Select`
(`<Select filter>` for the header treatment). A file outside `ui/` that contains
`border border-line-strong rounded-md … focus:ring-accent` fails the guard —
that is the copy being caught.

**`Disclosure`** is the closed-row → open → preview → apply shell. Anything that
writes across many rows uses it. A third hand-rolled copy fails the guard, and
so does calling a write endpoint without reading its preview endpoint first: a
bulk write you cannot look at first is one you find out about afterwards.

## Colours are tokens, and a token that does not exist renders as nothing

Tailwind emits no rule for a class it has no colour for, so `text-subtle`
silently inherits and looks *almost* right. That has cost real time. Check
`tailwind.config.js` before using a name you have not used before.

The complete set:

- Surfaces: `canvas` `surface` `raised` `sunken`
- Lines: `line` `line-strong`
- Text: `ink` (strongest) `body` `muted` `faint` — **there is no `subtle`**
- Accent: `accent` `accent-hover` `accent-fg` `accent-soft`
- Danger: `danger-bg` `danger-bg-hover` `danger-line` `danger-fg` `danger-solid`
- Success: `success-bg` `success-bg-hover` `success-line` `success-fg` `success-solid`
- Warn: `warn-bg` `warn-line` `warn-fg` — **no `warn-bg-hover`**
- Info: `info-bg` `info-bg-hover` `info-line` `info-fg`
- Categorical: `cat-{violet,sky,teal,orange,rose}-{bg,line,fg}`

Every one is a CSS variable with a light and a dark value, so use the token and
both themes follow. Never hardcode a hex.

The variables hold bare RGB channels (`--c-canvas: 11 12 11`), which is what
lets `bg-canvas/90` work. Until they did, Tailwind emitted *no rule* for any
`/NN` class and the modal backdrop, the sticky header and the warn banner were
all transparent. So in CSS, read a token as `rgb(var(--c-x))`, never
`var(--c-x)`, and add a new one as channels in both themes — the guard checks
the config and the stylesheet agree.

**A hover must change something.** `hover:bg-X` on an element already painted
`bg-X` renders as no hover at all, and eight buttons shipped that way. The
tinted variants use the `-bg-hover` tokens, which is what makes them respond —
if a token has no `-bg-hover` twin, change the text or border instead.

## Screens name things; they never print identifiers

A `task_id` like `gig-festival-scan` is a handle an outside agent POSTs, not a
name. It reached three surfaces before anybody read one out loud.

Render one through `taskLabel()` from `shared/taskLabels.ts`. `{row.taskId}`
straight into JSX fails the guard, in the frontend and in the Worker's
notification titles alike. Passing the id around as a value is fine — the
filters query on it — printing it is not.

Do not render a path inside this repository either: `<code>docs/gmail-setup.md</code>`
fails, because whoever reads that card may not hold the source. Variable names
like `GOOGLE_REFRESH_TOKEN` *do* stay on configuration cards — there the
variable name is the actionable fact.

## The app copies; it does not send

Four surfaces render a draft — the application panel, the reply draft, the sync
pitch, and the shared `DraftActions`. None gets a Send button, and the guard
fails on a short element label that claims to send. A `mailto:` or Gmail-compose
link is fine: a pre-filled compose window is not a send, because the person's
own Send button is still the last step.

**Copy is never withheld.** It is the fallback that always works, so it must not
sit behind the same length test that hides a compose link when a draft is too
long to fit in a URL.

## A screen never offers a move the pipeline refuses

`PATCH /api/gigs/:id` validates against `nextGigStatuses`, so a button naming a
status is a claim about legality. Both decision surfaces got that wrong — the
Review action bar offered a fixed four whatever the row's status was, and every
one returned 400 on a `submitted` gig.

Derive the actions from `nextGigStatuses` / `decisionFor`. Do not keep a list of
statuses in a component; the guard fails if either surface starts naming them.

## Say what you could not do, not only what you could

The pattern this app keeps: a preview reports its **skipped** list with a reason
each, a sourcing panel names what it could not file, a cost figure is a range
with its unknowns named, and anything recovered from prose is marked as
recovered rather than shown as certain. "Drafted four of seven" without saying
which three is a worse answer than not drafting.

## Fixtures never read the clock

In `test/`, `new Date()` and `Date.now()` with no argument fail the guard. A
suite that passes today and fails tomorrow fails in CI on somebody else's
change; this has cost two deploys. Build dates relative to the fixture's own
`TODAY`, and check with `TZ=Pacific/Auckland npm test`, which runs a day ahead.

The seeded *database* is the deliberate exception and computes its dates when it
runs — a seeded row with a hardcoded date quietly stops being "due in nine days".

## Look at it, and then measure it

Some faults only exist in a layout. A chart whose bars were all width 0 passed
visual review twice; a status pill wrapped to two lines and collided with its
heading in a 288px column, and both typechecked and rendered.

So for anything structural, run the app with real density and look:

```bash
npm run db:seed:local -- --apply   # shapes, not data; prints a setup code
npm run build:ui && npx wrangler dev --port 8787
```

Sign in with the setup code the seed prints. The fixture deliberately contains a
prose deadline, an application silent past `NO_REPLY_DAYS`, `info_requested`
outranking a deadline, a visa risk, a stopped agent and an uncredited photo — so
the screens show the states they are built for.

**Then probe geometry rather than trusting the picture**: read back computed
styles and bounding boxes for the thing you changed — does the pill sit inside
its card, does it overlap the title, is it one line high. A screenshot verifies
design; only a measurement verifies layout.

## Before you call it done

1. `npx vitest run test/uiConsistency.test.ts`
2. `npm run typecheck && npm test`
3. `TZ=Pacific/Auckland npm test` if you touched anything date-shaped
4. Looked at the changed screen with the fixture loaded, if it was structural

If the guard fails, read the test's comment before changing the test. Each one
records a specific thing that went wrong, and the comment usually says what the
right fix is.
