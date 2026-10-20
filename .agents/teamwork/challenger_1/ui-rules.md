# UI Rules (`frontend/src/`)

Every rule below is enforced by `test/uiConsistency.test.ts` and `test/canadianCopy.test.ts`. If you violate one, `npm test` will fail and name the file and line.

## 1. Use Shared Primitives (`frontend/src/components/ui/`)

Never hand-roll controls when a primitive exists in `frontend/src/components/ui/`:

- **Buttons**: `<Button variant="primary" | "ghost" | "accent" | "ok" | "warn" | "danger" size="sm" | "md">` from `ui/Button.tsx`.
  - Raw `<button>` is allowed **only** for: tab strip items (`role="tab"`), table sort headers, calendar day cells, filter pills, or inline text links (`underline`).
  - Never put `bg-*` or `px-* py-* rounded` on a raw `<button>`.
- **Form fields**: `<Input>`, `<Select>`, `<Textarea>`, or the class constants `FIELD` and `FILTER` from `ui/Field.tsx`.
  - Raw `<input>`, `<select>`, or `<textarea>` with a hand-rolled `bg-well border` class string is banned.
- **Cards & sections**: `<Card>` from `ui/Card.tsx`, `<Caption>` from `ui/Caption.tsx`, `<Explainer>` from `ui/Explainer.tsx`.
- **Preview-before-write panels**: `<Disclosure>` from `ui/Disclosure.tsx`.
  - Every bulk write (`/api/sync/reconcile`, `/api/gmail/drafts`, `/api/artist/source`, `/api/connectors/associations/:id/import`, `/api/backfill/notes`, `/api/drive/organise`, `/api/admin/artists/:id/removal`) must use `<Disclosure>` and call a preview endpoint before the write endpoint.

## 2. Tailwind Colour & Contrast Tokens

Only use semantic tokens defined in `tailwind.config.js`:

- **Surfaces**: `bg-surface` (page background), `bg-raised` (cards/panels), `bg-well` (recessed inputs/wells), `bg-hover` (interactive hover target).
- **Text**: `text-ink` (primary), `text-muted` (secondary readable text — minimum contrast floor for sentences and labels), `text-faint` (**decorative only** — dividers, empty-cell dashes `'—'`, disabled states; **never** on readable prose, captions, or form labels).
- **Borders**: `border-edge`, `border-line`.
- **Semantic**: `accent`, `ok`, `warn`, `danger` (each has `DEFAULT`, `dim`, `edge`).
- **Banned patterns**:
  - Undefined token classes like `text-subtle`, `bg-subtle`, `border-subtle`.
  - Dead hover states where `hover:bg-X` matches the resting `bg-X` (e.g. `bg-hover hover:bg-hover` or `bg-raised hover:bg-raised`). Pair `bg-raised` with `hover:bg-hover`.

## 3. Copy & Domain Honesty

- **Product name**: *Sun Dogs Music Scout* in full, or *Scout* once in context. Never bare "Scout" as a standalone brand mark; never "Music Scout". Survey pages say *Sun Dogs Music* and never "Scout".
- **Canadian spelling & context**: Canadian dollars (`CAD`), Canadian provinces/territories, P-2 work permit 90-day lead time from application deadline.
- **Never claim to send or submit**: Drafts and application packets use **Copy**, **Create drafts**, or **Open in Gmail** — never *Send* or *Submit*.
- **No internal identifiers in JSX**: Never render `taskId`, `doc.id`, `.md` file paths, migration numbers (`0001`), or person names in user-facing copy.
- **Dates**: Always use `localToday()` from `frontend/src/format.ts` for the viewer's date, never `new Date().toISOString().slice(0, 10)`.
