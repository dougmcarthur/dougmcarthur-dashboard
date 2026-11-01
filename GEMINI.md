# Sun Dogs Music Scout — Project Instructions & Invariants

> **Context for Antigravity**: This project was originally built with Claude Code. `CLAUDE.md` (about 74 KB / 1,000 lines) is the full current-state reference and still exceeds Antigravity's 24 KB per-file rule limit. This `GEMINI.md` distils every active rule, invariant, and convention into a single always-on reference. Consult `CLAUDE.md` and `docs/*.md` when investigating the history of a specific subsystem.

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
   - **Application fields**: `answer_state` is `'empty' | 'suggested' | 'edited' | 'approved'`. Drafted or sourced text starts as `'suggested'`, and an unread suggestion is never counted as an answer you have read.
   - **Artist library freshness**: Sourced or imported assets (`shared/artistSource.ts`, association imports) land with `review_by = null` (`'unreviewed'`), never pre-approved (`fresh`) and never scolded as `'overdue'`.
   - **Contact details**: Sourced/imported assets and association profile readers (`shared/associationProfile.ts`, `shared/artistSource.ts`) **never** copy email addresses or phone numbers from public pages or prose.
   - **Sync terms**: A target whose submission policy hasn't been read is `'unverified'`, not `'rejected'`.
   - **Travel & costs**: Never substitute `0` or a silent default for an unknown cost or distance. Costs are always ranges (`{ low, high }` formatted via `formatCostRange`). When a travel band is inferred without `travel.home` set, `bandGuessed: true` must say so (`"(band inferred — set your home base in Settings)"`).
   - **Deadlines**: A `deadline` is often prose (`"None, rolling intake"`). Anything that needs a date goes through `splitDeadline` (`shared/reviewParse.ts`), which returns null rather than guess, and a date recovered from prose is shown with its prose.
4. **No clock in pure logic or test fixtures**:
   - Enforced by `test/uiConsistency.test.ts`. Files in `shared/` and `test/*.test.ts` must **never** call `new Date()` or `Date.now()` with no arguments. Pass `today: string` (`YYYY-MM-DD`) explicitly.
   - In the frontend, always use `localToday()` from `frontend/src/format.ts` (viewer's local calendar date), never `new Date().toISOString().slice(0, 10)` (which is UTC and shifts tomorrow's date after 4 PM PST).

---

## 3. Architecture & Stack

- **Runtime**: Single Cloudflare Worker (`src/index.ts`, Hono) serving both `/api/*` and static SPA assets (`frontend/dist`), backed by Cloudflare D1 (`DB`, Drizzle ORM in `src/db/schema.ts`).
- **Workspace layout**:
  - `shared/` — Pure TypeScript domain logic shared by Worker and SPA (scoring, readiness, travel, onboarding, startLanes, epk, stagePlot, survey, artistSource, associationProfile). Zero I/O, zero `Date.now()`.
  - `src/` — Worker routes (`src/routes/`); the sign-in, tenant and admin-mode middleware (`src/index.ts`, `src/lib/auth.ts`, `src/lib/actor.ts`, `src/context.ts`); tenant scoping (`src/db/scope.ts`); the cron (the `scheduled` handler in `src/index.ts`, with the jobs in `src/lib/`); mailers & Google OAuth (`src/lib/`).
  - `frontend/src/` — React 19 + Vite + Tailwind CSS SPA. Hash-routed (`#overview`, `#review`, `#gigs`, `#sync`, `#shows`, `#promo`, `#runs` (History), `#artist`, `#epk`, `#help`, `#settings/<page>`, `#admin/<page>` (admin mode only), plus `#join/<token>`, `#epk/<token>`, `#survey`, `#survey-results`).
  - `migrations/` — Sequential SQL migrations (`0001_...` through `0045_...`; next free is `0046`).
  - `test/` — Vitest suites. `test/support/sqliteD1.ts` runs the production schema (`schema.sql`, then every `migrations/*.sql` in order) on `node:sqlite` behind the D1 interface; `test/support/fakeD1.ts` only lets a request through the middleware.

---

## 4. Security, Auth & Multi-Tenant Rules

1. **Tenant isolation (`src/db/scope.ts`)**:
   - Enforced by `test/tenantScope.test.ts`. All 17 artist-owned tables (`SCOPED_TABLES`) must be read through `scoped(table, tenant, ...where)` and inserted with `withTenant(tenant, values)`.
   - Never query a tenant-scoped table with a bare `.where(eq(table.id, id))`.
2. **Artist mode vs. Admin mode (`docs/multi-tenant-plan.md`)**:
   - Enforced by `test/adminMode.test.ts`. A session is in `'artist'` mode or `'admin'` mode (`auth_sessions.mode`), never both.
   - `AdminEnv` (`src/context.ts`) carries an `admin` and no tenant, so an oversight route has nothing to hand `scoped()`. An artist-mode session is refused `/api/admin/*`, and an admin-mode session is refused everything else.
3. **Passkey elevation (`auth_sessions.elevated_at`)**:
   - Changing who can sign in, or destroying data across a boundary, needs a passkey touch within the last fifteen minutes: adding or removing a passkey, issuing or revoking agent tokens, entering admin mode, removing an artist tenant (`elevationState` in `shared/auth.ts`; the client re-asserts on refusal with `withConfirmation` in `frontend/src/confirmIdentity.ts`). The emailed setup code is exempt, because recovery cannot require the passkey you lost.
4. **Credentials & tokens never travel in URL paths**:
   - Enforced by `test/uiConsistency.test.ts`. Invite tokens (`#join/<token>`), public EPK share tokens (`#epk/<token>`), and survey response IDs must use URL **fragments** (`#...`) in the browser and **POST request bodies** on the wire so they never appear in `Referer` headers or Worker request logs.
5. **Agent tokens (`mhq_...`)**:
   - Research agents authenticate with `Authorization: Bearer mhq_...`, resolved per-tenant via SHA-256 hash in `agent_tokens`.
   - Agent tokens are limited to the routes in `AGENT_ROUTES` (`shared/agentRoutes.ts`: six reads, four creates and the run log), cannot manage tokens, and what the create routes accept is bounded by `agentWrite` (`src/lib/agentWrites.ts`).

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
  - Every custom colour class (`bg-*`, `text-*`, `border-*`) must exist in `tailwind.config.js` (`canvas`, `surface`, `raised`, `sunken`, `line`, `line-strong`, `ink`, `body`, `muted`, `faint`, `accent`, and the `danger-*`, `success-*`, `warn-*`, `info-*` and `cat-*` families; the complete list is in `.claude/skills/ui-rules/SKILL.md`).
  - Never use undefined classes like `text-subtle`, never pair `bg-X` with `hover:bg-X` (dead hover), and never use `text-faint` on readable prose or form labels (`text-muted` is the floor for readable text).

---

## 7. Build, Test & Verification Commands

- **Toolchain path**: On this machine, Node and npm live in `/opt/homebrew/bin` (and `/Users/doug/.nvm/versions/node/v22.22.3/bin`). Ensure `PATH` includes `/opt/homebrew/bin` when running commands if needed, and run `npm install` if `node_modules` is missing.
- **Required checks before finishing any code change**:
  1. `npm test` — Runs all Vitest suites (including `uiConsistency.test.ts`, `canadianCopy.test.ts`, `tenantScope.test.ts`, `adminMode.test.ts`, `noPersonInCode.test.ts`).
  2. `TZ=Pacific/Auckland npm test` — Verifies date math holds when local time is a calendar day ahead of UTC.
  3. `npm run typecheck` — Checks all three TypeScript configs (`tsconfig.json`, `tsconfig.frontend.json`, `tsconfig.scripts.json`).
