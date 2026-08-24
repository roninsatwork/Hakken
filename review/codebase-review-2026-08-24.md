# Sonae Codebase Review — 2026-08-24

Scope: full repository (`src/` ~1,006 files / 206k lines, `convex/` ~525 files / 172k lines, `e2e/`, `scripts/`, CI). Reviewed for coding best practices, architectural best practices, and consistency, against the project's own documented conventions (`docs/developer/*`, `AGENTS.md`).

## Overall verdict: 8/10

A genuinely well-engineered codebase, unusually so for its size (~380k lines of TypeScript). What sets it apart is that quality is **mechanically enforced** rather than aspirational: conventions live in custom guard scripts and "drift tests" with shrink-only, dated, reasoned allowlists, so old debt is frozen and counted while new debt fails the build. The code is not flawless — it has god-components, naming drift, and acknowledged migrations mid-flight — but drift is contained rather than accumulating.

Per-area scores:

| Area | Score |
|---|---|
| Frontend (src/app, src/ui, src/context, src/hooks) | 8/10 |
| Convex backend | 8.5/10 |
| Cross-cutting consistency & TypeScript discipline | 8.5/10 |
| Testing & tooling | 8.5/10 |

---

## 1. Coding best practices — strong

### Strengths

- **TypeScript discipline near-perfect**: `strict: true`; across 380k lines there is exactly **1 real `: any`** (`convex/wikiAsk.ts:46`), **0 real `as any`**, 0 `@ts-ignore` (banned by ESLint at error level), and 2 justified `@ts-expect-error`s for `pdf-extraction`'s broken declarations. Types are shared correctly: 180 frontend files consume Convex generated `Doc`/`Id` types; zero hand-duplicated entity interfaces found.
- **Hygiene**: essentially zero TODO/FIXME markers, 1 `console.log` in app source (`src/app/w/[widgetId]/WidgetIframeClient.tsx:172`), 0 native `alert`/`confirm`, 0 `dangerouslySetInnerHTML`, 3 empty catch blocks total.
- **Testing is real**: 331 test files in `src/`, 232 in `convex/`, 18 in `e2e/`; only one snapshot test in the repo. The backend suite mostly runs the real Convex runtime via `convexTest` (138 of 232 files) with mocks only at the provider-adapter boundary. Tests document the historical defect they guard against (e.g. `convex/agentRuntime.test.ts`, 3,465 lines / 85 tests with mid-stream cancellation probes; `src/hooks/useAdminAction.test.tsx` asserting the three defects the hook was written to fix).
- **Coverage gating is honest**: the movement demo (~half of `src/`, better covered than the platform) is split out and reported-only so it cannot mask a platform regression. Enforced platform floors: lines 69 / statements 67 / branches 58 / functions 66, with a one-way ratchet, vacuous-pass guard, and the same thresholds wired into vitest.
- **Error surfacing has one good house pattern**: `src/lib/errors.ts` (`toUserFacingMessage`) + `src/hooks/useAdminAction.ts` (busy-ref, toast, `reportError`) on the frontend; `convex/utils/appError.ts` (stable code union over `ConvexError`, 354 call sites) on the backend.
- **Accessibility baseline**: 125 `aria-label`s across 81 files; `Field` component refuses to skip labels by construction; one well-placed localized error boundary at `src/app/(dashboard)/error.tsx` with telemetry.

### Issues

| Sev | Location | Issue |
|---|---|---|
| High | `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx` (1,453 lines) | Largest active god-component (also 10 `console.error` calls); needs decomposition. |
| High | `convex/agentRuntime.ts` (2,803), `convex/agentSkills.ts` (2,414), `src/ui/components/workflows/ConfigDrawer.tsx` (1,124), `src/ui/components/layout/SidebarNavigation.tsx` (944) | Oversized active modules; 36 files over 500 lines overall. (Frozen demo pages `demos/movements/**` at 1,794/1,684 lines are excluded by explicit owner decision.) |
| Med | `convex/` codebase-wide | 477 plain `throw new Error(` remain vs 354 `appError` + 54 raw `ConvexError`. Plain throws redact to "Server Error" in production Convex. Tracked by a shrink-only test, but the largest live consistency gap. |
| Med | ~486 of 494 convex files | Return validators almost absent (8 `returns:` total). Public functions return unshaped documents; e.g. `chat.ts:77 getMessages` returns whole message docs, so fields added to schema later leak automatically. |
| Med | Frontend mutation handling | `useAdminAction` adopted by only 22 files; 22 pages still hand-roll `setError`/try/catch; 145 `console.error` calls remain. |
| Low | 232 non-null assertions | Heavily concentrated in movement test files; low risk. |

---

## 2. Architectural best practices — strong, one standout

### The standout: structural multi-tenant authorization

- Every client-callable Convex function must be declared through a guarded builder in `convex/tenantFunctions.ts`: `tenantQuery/Mutation`, `adminQuery/Mutation` (read admits READ_ONLY, write does not), `governanceQuery` (deliberately no mutation), `superAdmin*`, `moduleQuery/Mutation` (server-side capability gating), and `public*` builders that **require a written `reason`**.
- `convex/authzEnforcement.test.ts` fails the build on any raw `query`/`mutation`/`action` export; its migration allowlist is fully retired (0 pending, maxEntries 0). Guard resolution is an exhaustive `Record<Guard, resolver>` so an unwired guard fails to compile instead of defaulting open.
- All 8 sampled public surfaces (chat, audit logs, users, plans, knowledge, companies) correctly enforce auth + company scoping, and every function accepting `companyId` from the client re-verifies it against the caller's active company or super-admin role.

### Other architectural strengths

- **Layering enforced by tooling**: ESLint `no-restricted-imports` regex blocks browser imports of Convex function-defining modules (types/`utils/`/`*Service` allowed), zero exemptions; `src/movement-boundary.test.ts` fences 12 heavy 3D/ML packages inside the demo directories and verifies each guarded package is still installed so the guard can't go vacuous.
- **Bounded reads**: only 2 unbounded `.collect()` in non-test backend code (both on the small `governanceEstateRollups` table); 375 `.index(` + 26 search/vector indexes over 117 tables; ~5 db-level `.filter(` chains, all benign.
- **Actions are clean**: no `ctx.db` in action files; external work (providers, Resend, Apify, webhooks) lives in `*Actions.ts`/service modules with `actionAuth.ts` wired into the builder layer.
- **Audit coverage is real**: 60 non-test files write `auditLogs`; sampled privileged mutations all record rows; audit purges write purge records exempt from purging.
- **Service pattern applied consistently**: 75 `*Service.ts` files, only 2 register any Convex function — the rest are pure, unit-testable helpers, exactly as documented.
- **CI is coherent and cost-conscious**: guards → lint → typecheck → full unit suite with coverage → coverage gate → browser smoke on every dev push; full Playwright suite on PRs into main; deploy re-runs the full gate unless it can prove the exact code already passed CI; unconditional runtime `npm audit --audit-level=high`; SHA-tagged deploys.

### Issues

| Sev | Location | Issue |
|---|---|---|
| High | `next.config.ts:34,43`, `playwright.config.ts` | **E2E runs against a mocked Convex backend (`src/e2e/convexReactMock.tsx`) on a dev-mode server.** The real client↔backend integration is only covered by `playwright.real-auth.config.ts`, which is not in CI. The single biggest honesty gap in the pipeline. |
| Med | 51 occurrences across `analytics.ts`, `analyticsSnapshots.ts`, `systemHealth.ts`, `inventoryRollups.ts`, `companies.ts`, `users.ts`, `workflows.ts`, `properties.ts`, `knowledge.ts`, `arcade.ts`, `swarmRuntime.ts` | `.take(10000)` is bounded-in-name-only: at scale these analytics/rollup queries silently truncate and burn read bandwidth. Should be cursor-paginated internal jobs or maintained rollups. |
| Med | `src/app/(dashboard)/app/governance/page.tsx:7-9`, `app/governance/audit-trail/page.tsx:9` | `/app` pages import from `admin/_components/**` and `admin/settings/_components/AuditLogsTable` — cross-feature reach into admin internals contradicts the documented boundary; the shared pieces should be promoted to `src/ui/components/screens/` or a shared feature dir. |
| Med | `src/quality-drift.test.ts:158-165` | Core chat paths (`getMessages`, `sendMessage`, `getThreads`) sit in the broad-read allowlist at "Phase 3" — the hottest product path is among the unbounded reads. |
| Low | `convex/` flat directory, `convex/schema.ts` (4,416 lines) | At the edge of navigability; mitigated by very regular `foo.ts`/`fooService.ts`/`fooActions.ts` naming. Grouping `agent*` (40+ files) and `wiki*` into subdirectories would help. |
| Low | ~41 `public*` declarations, e.g. `plans.ts:20,44` | Copy-pasted `reason:` strings on surfaces that are actually auth-inside-handler soft-fail queries, blurring the "deliberately unauthenticated" semantics. A `softQuery` (authenticated-or-null) builder would restore the distinction. |
| Low | Client-component density | 301 of 377 non-test TSX files are `"use client"`; essentially no RSC data-fetch and no `loading.tsx` files (loading is hand-rolled per page, at least consistently). Partly structural given Convex. |

---

## 3. Consistency — good, with visible eras

The code is not uniform, but the non-uniformity is **known, named, and fenced** — the right failure mode. Three distinguishable eras:

1. **Pre-kit era** (`app/reports`, `app/sales-data`, `app/profile`, parts of `[workspace]/**`): inline English strings, per-page hex palettes, hand-rolled tabs/pagination, own chart-export logic. Nearly all i18n and token drift lives here.
2. **Kit era** (admin since 2026-08-16, newer app screens): uniform DataTable/PageHeader/DetailLayout anatomy via `src/ui/components/screens/`, i18n and theme tokens throughout. Sampled pages are near-identical in structure and import vocabulary.
3. **Demos era** (`demos/movements`, `demos/movement-capture`): deliberately frozen, excluded from enforcement, properly walled off.

Guard scripts freeze old code per rule, shrink-only with dates and reasons: 295 raw buttons across 120 files (from 408 at freeze), 41 hand headings, 1,231 hardcoded colors (down from ~2,039), 55 layering exceptions.

### What is enforced by tooling vs convention only

- **Enforced**: screen-kit anatomy (`check-screen-kit.mjs`, 11 rules), z-index layering, Convex pagination on named screens, i18n key resolution (`check-messages.mjs`) and en/it parity (4,868 keys each, test-enforced), i18n adoption floors, theme-color ratchet, movement bundle boundary, white-label fallback hygiene, authz builder usage, orphan files (knip), lint ratchets.
- **Convention only (the holes)**: new files with hardcoded English copy (explicitly acknowledged as uncatchable — "the floor defends the migration; review defends new screens"); file naming; export style; date formatting choice; `useAdminAction` vs hand-rolled try/catch; `appError` vs plain `Error` in convex.

### Genuine inconsistencies

| Sev | Issue | Evidence |
|---|---|---|
| Med | File naming splits three ways | Of ~583 `.tsx` files: 202 kebab-case, 207 camelCase (`src/ui/components/screens/standardTableScreen.tsx`), 174 PascalCase (`src/ui/atoms/Button.tsx`). No rule for components. |
| Med | Atoms live outside the atoms folder | `src/ui/atoms/` holds only `Button`, `StatusPill`, `typography`, `statusTone`, while the actual primitives (`Checkbox`, `Select`, `Field`, `CursorPagination`) live in `src/ui/components/screens/` next to composites (`DataTable`, `DetailLayout`, `ModalForm`). Mitigated: `scripts/check-screen-kit.mjs:439` reads kit names from both folders as one namespace, so the checks are unaffected — but there is no rule for where a new primitive goes (`Button` → atoms, `Checkbox` → screens), the exact "guessing instead of standards" gap `docs/developer/screen-kit.md` says the kit exists to close. |
| Med | i18n adoption gap by area | Admin 172/202 non-test tsx use `useTranslations` (85%); app area 27/53 (51%). No-i18n pages: `app/reports`, `app/sales-data`, `app/properties/logs`, `app/agentic-testing`. Ratchet floors (139/22) are well below current counts, so slack exists. |
| Med | Error-handling migration incomplete | 22 files on `useAdminAction`, 22 still hand-rolling; backend 477 plain `throw new Error` vs 354 `appError`. |
| Low | Duplicate local formatters despite `src/lib/dates.ts` | `formatDate` in `admin/settings/scripts/page.tsx:26`, `admin/settings/scripts/[scriptId]/page.tsx:37`, `admin/ai/models/[id]/page.tsx:23`; `formatCurrency` in `app/reports/page.tsx:16`; `formatNumber`/`formatTime` in replay-lab helpers and `convex/platformAlertService.ts:215`. |
| Low | No shared chart palette | 321 hex occurrences outside globals.css/demos; hotspots `admin/page.tsx` (21), `TimeframeDropdown.tsx` (11). Partly forced by the documented html2canvas/oklab constraint, but each page redeclares its own hexes. |
| Low | Export style | 48 ordinary components use default export (`TimeframeDropdown.tsx:20`, `chat/ChatHistoryList.tsx:19`) while most use named exports. |
| Low | Date handling split | 131 raw `toLocale*` calls coexist with 155 date-fns imports. |
| Low | Doc drift | `docs/developer/frontend.md` still documents `src/ui/components/header.tsx`/`footer.tsx`, which no longer exist. `<html lang="en">` never binds resolved locale (self-documented debt). |

---

## 4. Testing & tooling notes

- **Gates are real, not theater**: every gate exits non-zero in the blocking CI path; the coverage script refuses vacuous passes and ratchet-lowering; drift tests guard themselves against going vacuous; exceptions are enumerated, annotated, shrink-only; the check scripts have their own unit tests.
- **Drift-tests-as-architecture-enforcement** (`quality-drift`, `theme-drift`, `movement-boundary`, `no-client-specific-fallbacks`, `admin-i18n-adoption`) is an excellent pattern, well executed. Costs: regex-based source extraction is fragile to refactors (`extractExportBody` in `check-convex-pagination.mjs`), and `quality-drift.test.ts` (1,462 lines) mixes ~10 unrelated concerns and should be split.
- **`scripts/movement-debug/`**: 143 files driving ~120 of ~160 npm scripts, many hyper-specific one-shots. Maintained, but it makes `package.json` unreadable for platform work; should live behind its own CLI or package.
- **`knip.json`** has `ignoreDependencies: [".*"]` — unused/undeclared dependency detection is fully off; only orphan files are checked.
- **Coverage ratchet-up is manual**: `nextRatchet` values exist in `coverage-thresholds.json` but nothing automates raising the floor.
- Redundant coverage runs in the main→PR path (`checks` and `full-gate` both run the coverage suite on the same commit).

---

## 5. Recommendations, in priority order

Each has a ready-to-use fix prompt in [prompts/](prompts/).

1. **Put the real-auth e2e suite into CI** — the only gate that overstates what it verifies. → [prompts/01-real-auth-e2e-in-ci.md](prompts/01-real-auth-e2e-in-ci.md)
2. **Finish the backend error migration** (477 `throw new Error` → `appError`). → [prompts/02-convex-app-error-migration.md](prompts/02-convex-app-error-migration.md)
3. **Finish the frontend error migration** (adopt `useAdminAction` on the remaining 22 hand-rolled pages). → [prompts/03-use-admin-action-adoption.md](prompts/03-use-admin-action-adoption.md)
4. **Decompose the active god-components** (`KnowledgeManager`, `agentRuntime`, `ConfigDrawer`, `SidebarNavigation`). → [prompts/04-decompose-god-components.md](prompts/04-decompose-god-components.md)
5. **Replace `.take(10000)` analytics reads** with paginated internal jobs or maintained rollups. → [prompts/05-fix-take-10000-analytics.md](prompts/05-fix-take-10000-analytics.md)
6. **Fix the `/app` → `admin/_components` cross-feature imports.** → [prompts/06-fix-app-admin-cross-imports.md](prompts/06-fix-app-admin-cross-imports.md)
7. **Add return validators to high-traffic public Convex functions.** → [prompts/07-convex-return-validators.md](prompts/07-convex-return-validators.md)
8. **Bring i18n to the pre-kit app pages and raise the adoption floors.** → [prompts/08-app-area-i18n.md](prompts/08-app-area-i18n.md)
9. **Pick one component file-naming convention and ratchet it.** → [prompts/09-file-naming-convention.md](prompts/09-file-naming-convention.md)
10. **Extract a shared chart palette and dedupe local formatters.** → [prompts/10-shared-palette-and-formatters.md](prompts/10-shared-palette-and-formatters.md)
11. **Split `quality-drift.test.ts` by concern.** → [prompts/11-split-quality-drift-test.md](prompts/11-split-quality-drift-test.md)
12. **Move movement-debug scripts behind their own CLI.** → [prompts/12-movement-scripts-cli.md](prompts/12-movement-scripts-cli.md)
13. **Consolidate `src/ui/atoms/` into the screen kit** — the primitives already live in `components/screens/` and the tooling treats both folders as one namespace; fold the vestigial 4-file atoms folder in and write down the placement rule. → [prompts/13-consolidate-atoms-folder.md](prompts/13-consolidate-atoms-folder.md)
