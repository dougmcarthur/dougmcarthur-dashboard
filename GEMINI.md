# Sun Dogs Music Scout — Project Instructions & Invariants

> **Context for Antigravity**: This project was originally built with Claude Code. `CLAUDE.md` (163 KB / 2,460 lines) is an append-only architectural narrative and exceeds Antigravity's 24 KB per-file rule limit. This `GEMINI.md` distils every active rule, invariant, and convention into a single always-on reference. Consult `CLAUDE.md` and `docs/*.md` when investigating the history of a specific subsystem.

---

## 1. Product Identity & Copy Rules

- **Product name**: **Sun Dogs Music Scout** in full; **Scout** once in context.
  - Never use bare `Scout` as a standalone brand mark (title, header lockup, login card, email `From` name).
  - Never write `Music Scout`.
  - Public survey pages (`#survey`, `#survey-results`) say **Sun Dogs Music** and never mention `Scout` (the survey is not a product pitch).
- **Canadian focus**:
  - Built for independent **Canadian musicians**. Costs are in **CAD (`$`)**.
  - Canadian grants (FACTOR, Canada Council, Starseed, SOCAN Foundation, provincial funds/associations) and Canadian provinces/territories are the default frame.
  - **US entry (P-2 work permit)**: Any US festival/showcase requires a **90-day lead time from the application deadline** (not the show date).
  - **International opportunities are welcome**: Never filter out international calls by `reach`. Facts (genre mismatch, closed deadline, province-locked residency) remove with a named reason; preferences (`goals`, `reach`) only **order** what survives.
- **No person's name in code**:
  - Enforced by `test/noPersonInCode.test.ts` across `shared/`, `src/`, `frontend/src/`, and `scripts/`. Always refer to "the artist" or read from `artistNames(db, tenant)`.
- **No internal identifiers in visible UI copy**:
  - Enforced by `test/uiConsistency.test.ts`. Never render `taskId`, `doc.id`, `.md` filenames, migration numbers (`0001`), SQL column names, or raw route paths in user-facing JSX.

---

## 2. Non-Negotiable Product Invariants

1. **Scout never sends or submits**:
   - Scout drafts emails, sync pitches, and application answers. It **never** sends an email (`gmail.compose` only creates drafts) and **never** submits an external form.
   - Buttons say **Copy**, **Create drafts**, or **Open in Gmail** — never *Send* or *Submit* (except submitting feedback/survey/invite forms to Scout itself).
   - Never withhold copy behind `mailto:` or Gmail URL length limits; always offer a direct **Copy** button alongside.
2. **Every bulk write is preview-then-apply**:
   - Enforced by `test/uiConsistency.test.ts`. Any action that modifies or imports multiple rows (`/api/sync/reconcile`, `/api/gmail/drafts`, `/api/artist/source`, `/api/connectors/associations/:id/import`, `/api/backfill/notes`, `/api/drive/organise`, `/api/admin/artists/:id/removal`) must use `<Disclosure>` from `frontend/src/components/ui/Disclosure.tsx` and fetch a read-only preview before calling the write endpoint.
3. **A suggestion is not an answer; a missing input is not a zero**:
   - **Application fields**: `answer_state` is `'empty' | 'suggested' | 'confirmed'`. Editing text or choosing a library option confirms it; drafted/sourced text starts as `'suggested'`.
   - **Artist library freshness**: Sourced or imported assets (`sourceAssets`, association imports) land with `review_by = null` (`'unreviewed'`), never pre-approved (`fresh`) and never scolded as `'overdue'`.
   - **Contact details**: Sourced/imported assets and association profile readers (`shared/associationProfile.ts`, `shared/sourceAssets.ts`) **never** copy email addresses or phone numbers from public pages or prose.
   - **Sync terms**: A target whose submission policy hasn't been read is `'unverified'`, not `'rejected'`.
   - **Travel & costs**: Never substitute `0` or a silent default for an unknown cost or distance. Costs are always ranges (`{ low, high }` formatted via `formatCostRange`). When a travel band is inferred without `travel.home` set, `bandGuessed: true` must say so (`"(band inferred — set your home base in Settings)"`).
   - **Deadlines**: Deadlines recovered from `notes` prose carry `deadlineNote` (`"in notes — confirm on site"`). Closed deadlines are hidden from active review (`deadlinePassed`), while unstated deadlines remain visible as `"deadline not listed"`.
4. **No clock in pure logic or test fixtures**:
   - Enforced by `test/uiConsistency.test.ts`. Files in `shared/` and `test/*.test.ts` must **never** call `new Date()` or `Date.now()` with no arguments. Pass `today: string` (`YYYY-MM-DD`) explicitly.
   - In the frontend, always use `localToday()` from `frontend/src/format.ts` (viewer's local calendar date), never `new Date().toISOString().slice(0, 10)` (which is UTC and shifts tomorrow's date after 4 PM PST).

---

## 3. Architecture & Stack

- **Runtime**: Single Cloudflare Worker (`src/index.ts`, Hono) serving both `/api/*` and static SPA assets (`frontend/dist`), backed by Cloudflare D1 (`DB`, Drizzle ORM in `src/db/schema.ts`).
- **Workspace layout**:
  - `shared/` — Pure TypeScript domain logic shared by Worker and SPA (scoring, readiness, travel, onboarding, startLanes, epk, stagePlot, survey, sourceAssets, associationProfile). Zero I/O, zero `Date.now()`.
  - `src/` — Worker routes (`src/routes/`), auth & session middleware (`src/auth.ts`), tenant scoping (`src/lib/tenant.ts`), cron jobs (`src/cron/`), mailers & Google OAuth (`src/lib/`).
  - `frontend/src/` — React 18 + Vite + Tailwind CSS SPA. Hash-routed (`#overview`, `#review`, `#gigs`, `#sync`, `#shows`, `#promo`, `#artist`, `#epk`, `#help`, `#settings`, plus `#join/<token>`, `#epk/<token>`, `#survey`, `#survey-results`).
  - `migrations/` — Sequential SQL migrations (`0001_...` through `0043_...`; next free is `0044`).
  - `test/` — Vitest suites running against `better-sqlite3` (`test/helpers.ts` applies all `migrations/*.sql` in order).

---

## 4. Security, Auth & Multi-Tenant Rules

1. **Tenant isolation (`src/lib/tenant.ts`)**:
   - Enforced by `test/tenantScope.test.ts`. All 17 artist-owned tables (`TENANT_TABLES`) must be read through `scoped(table, tenant, ...where)` and inserted with `withTenant(tenant, values)` (or `scopedSql` for raw SQL).
   - Never query a tenant-scoped table with a bare `.where(eq(table.id, id))`.
2. **Artist mode vs. Admin mode (`docs/multi-tenant-plan.md`)**:
   - Enforced by `test/adminMode.test.ts`. A session is in `'artist'` mode or `'admin'` mode (`session_mode`), never both.
   - `AdminEnv` (`src/routes/admin.ts`) does **not** carry a `tenant` variable. Artist routes 403 while in admin mode; `/api/admin/*` routes 403 unless `role === 'owner'` and `mode === 'admin'`.
3. **Passkey elevation (`confirmed_until`)**:
   - Sensitive actions (revoking passkeys, issuing/revoking agent tokens, entering admin mode, removing an artist tenant) require recent passkey confirmation (`requireElevation` on the server, `withConfirmation` in `frontend/src/elevate.tsx`).
4. **Credentials & tokens never travel in URL paths**:
   - Enforced by `test/uiConsistency.test.ts`. Invite tokens (`#join/<token>`), public EPK share tokens (`#epk/<token>`), and survey response IDs must use URL **fragments** (`#...`) in the browser and **POST request bodies** on the wire so they never appear in `Referer` headers or Worker request logs.
5. **Agent tokens (`mhq_...`)**:
   - Research agents authenticate with `Authorization: Bearer mhq_...`, resolved per-tenant via SHA-256 hash in `agent_tokens`.
   - Agent tokens are allowed only on `AGENT_API_PREFIXES` (`src/auth.ts`) and are blocked from `/api/auth`, `/api/admin`, `/api/agent-tokens`, `/api/gmail`, `/api/drive`, `/api/calendar`, `/api/tasks`, `/api/epk`, `/api/profile`, `/api/onboarding`, and `/api/feedback`.

---

## 5. Database & Migration Discipline

- **Never hand-run schema SQL against production D1**. Every schema change is a numbered file in `migrations/` (`0044_<name>.sql`) paired with `src/db/schema.ts`.
- **Additive migrations only**: CI runs `wrangler d1 migrations apply --remote` *before* `wrangler deploy`. The currently-deployed Worker briefly runs against the newly-migrated database, so new columns must be nullable or have a `DEFAULT`, and columns must not be dropped or renamed in the same release that stops reading them.
- **No person-specific seed data in migrations**: Migrations run for every tenant and every test database.

---

## 6. UI & Frontend Rules (See `.agents/skills/ui-rules/SKILL.md`)

- **Shared primitives (`frontend/src/components/ui/`)**:
  - Always use `<Button>`, `<Input>` / `<Select>` / `<Textarea>` (or `FIELD` / `FILTER`), `<Card>`, `<Caption>`, `<Explainer>`, and `<Disclosure>`.
  - Raw `<button>` is permitted only for tab strip items, table sort headers, calendar cells, or inline text links (`underline`).
- **Tailwind token discipline**:
  - Every custom colour class (`bg-*`, `text-*`, `border-*`) must exist in `tailwind.config.js` (`surface`, `raised`, `well`, `hover`, `ink`, `muted`, `faint`, `edge`, `line`, `accent`, `ok`, `warn`, `danger`).
  - Never use undefined classes like `text-subtle`, never pair `bg-X` with `hover:bg-X` (dead hover), and never use `text-faint` on readable prose or form labels (`text-muted` is the floor for readable text).

---

## 7. Build, Test & Verification Commands

- **Toolchain path**: On this machine, Node and npm live in `/opt/homebrew/bin` (and `/Users/doug/.nvm/versions/node/v22.22.3/bin`). Ensure `PATH` includes `/opt/homebrew/bin` when running commands if needed, and run `npm install` if `node_modules` is missing.
- **Required checks before finishing any code change**:
  1. `npm test` — Runs all Vitest suites (including `uiConsistency.test.ts`, `canadianCopy.test.ts`, `tenantScope.test.ts`, `adminMode.test.ts`, `noPersonInCode.test.ts`).
  2. `TZ=Pacific/Auckland npm test` — Verifies date math holds when local time is a calendar day ahead of UTC.
  3. `npm run typecheck` — Checks all three TypeScript configs (`tsconfig.json`, `tsconfig.worker.json`, `frontend/tsconfig.json`).
