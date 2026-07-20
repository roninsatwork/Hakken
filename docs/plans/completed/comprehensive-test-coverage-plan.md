> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Comprehensive Test Coverage Plan

This plan describes how to move Sonae from a healthy tested app to a comprehensively covered product surface across backend, frontend, and browser journeys.

The goal is not to chase a single coverage percentage. The goal is to make regressions hard to ship in the places where they would hurt most: authentication, authorization, tenant boundaries, AI/model controls, workflows, uploads, knowledge, admin operations, and user-facing chat flows.

## Current Baseline

Baseline observed on June 1, 2026:

- `npm run test:run`: 81 test files, 315 tests, all passing.
- `npm run test:e2e`: 27 passing browser tests, 7 skipped authenticated browser tests.
- `npx vitest run --coverage`: initially not available because `@vitest/coverage-v8` was not installed.
- Phase 1 instrumentation baseline after adding `@vitest/coverage-v8`:
  - all files: 17.96 percent lines, 17.96 percent statements, 58.47 percent functions, 68.72 percent branches.
  - `convex`: 42.02 percent lines, 60.53 percent functions, 69.64 percent branches.
  - frontend page coverage is the primary reason the global line coverage baseline is low.
- Backend unit/integration coverage shape: 47 Convex test files for 72 top-level Convex modules.
- Frontend unit coverage shape: 29 `src` test files for 184 production `src` files.
- App route/page coverage shape: 83 route/layout/page files, 16 app-level test files.
- Playwright now runs the admin roles browser spec from `e2e/admin-roles.spec.ts`.

## Target State

### Coverage Targets

Use these as practical targets after coverage instrumentation is added:

- Backend line coverage: 85 percent minimum.
- Backend branch coverage: 75 percent minimum.
- Frontend shared utilities and reusable components: 80 percent minimum.
- Critical admin/user pages: covered by at least one component/page test or one authenticated browser test.
- Critical end-to-end journeys: covered by Playwright with deterministic auth state.
- New bug fixes: must include a regression test unless the change is purely docs, styling, or configuration.

### Quality Gates

The standard pre-merge gate should become:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:e2e
npm run test:coverage
```

`npm run test:e2e` should eventually have no skipped critical authenticated tests in CI.

## Phase 1: Add Coverage Measurement

Goal: make test coverage measurable and visible without blocking development too aggressively at first.

Tasks:

- Install `@vitest/coverage-v8`.
- Add `test:coverage` script.
- Configure Vitest coverage for both projects:
  - `src/**/*.{ts,tsx}`
  - `convex/**/*.ts`
- Exclude generated and non-product files:
  - `convex/_generated/**`
  - `*.config.*`
  - `*.test.*`
  - `vitest.setup.ts`
  - `.next/**`
  - `node_modules/**`
  - `adk-python/**`
- Generate text, HTML, and JSON-summary reports.
- Add initial global thresholds at the measured baseline:
  - lines: 17 percent
  - branches: 50 percent
  - functions: 58 percent
  - statements: 17 percent
- Document how to inspect the HTML coverage report locally.

Acceptance:

- `npm run test:coverage` runs locally.
- Coverage reports separate frontend and backend clearly enough to identify gaps.
- Initial thresholds pass on the current codebase or are set to the measured baseline plus a small buffer.

## Phase 2: Backend Coverage Completion

Goal: make Convex and service-layer behavior reliable under happy paths, failure paths, and security boundaries.

Progress:

- Slice 1 started on June 1, 2026.
- Phase 2 completed on June 1, 2026.
- Current measured coverage after Phase 2:
  - `npm run test:coverage`: 95 test files, 401 tests, all passing.
  - `convex`: 80.01 percent line coverage, 73.03 percent branch coverage, 89.01 percent function coverage.
  - all files: 28.17 percent line coverage. The global number remains lower because frontend routes and app pages are intentionally covered in Phases 3 and 4.
  - Coverage excludes generated files plus non-product operational scaffolding: Convex generated code, cron registration, debug helpers, HTTP entrypoint wiring, migrations, seed scripts, and the test-only query helper.
  - Backend line coverage has reached the initial 80 percent phase gate. Backend branch coverage is close to the 75 percent target and should be raised by the remaining action/runtime modules.
  - Remaining high-impact backend gaps: `agentRuntime.ts`, `swarmActions.ts`, `ai.ts`, `auth.ts`, and external action-heavy paths such as deeper Apify/knowledge/sales-report integrations.
- Added deeper AI model backend coverage for:
  - default model promotion.
  - disabling default models.
  - audit log side effects.
  - pricing configuration authorization and audit metadata.
  - authenticated model reads and unauthenticated read denial.
  - internal model sync upsert behavior.
- Added deeper AI tool backend coverage for:
  - authenticated and anonymous tool reads.
  - create/update/delete authorization boundaries.
  - internal tool lookup.
  - agent-tool binding idempotency.
  - unbind behavior.
  - delete cleanup of tool bindings.
- Added deeper agent backend coverage for:
  - global agent create/list/get/update/delete lifecycle.
  - default model fallback behavior.
  - audit metadata for create, update, delete, inline creation, and promotion.
  - cleanup of agent-tool bindings on delete.
  - inline workflow agent creation and promotion to global scope.
  - internal agent lookup and active-agent retrieval.
- Added deeper AI rules backend coverage for:
  - global rule create/update/toggle/delete lifecycle.
  - audit metadata for rule lifecycle actions.
  - global, company, and agent scoped rule visibility.
  - admin denial for global and foreign scoped rules.
  - internal active-rule resolution across global, company, and agent context.
  - pricing rule seeding preconditions.
- Added deeper knowledge backend coverage for:
  - company manual document lifecycle with upload/delete audit logs.
  - global document authorization for super admins versus company admins.
  - agent-scoped document visibility across company admins and super admins.
  - thread document visibility for owners, company admins, super admins, and denied users.
  - website URL deduplication, forced refresh, and pending queue lookup.
  - company-scoped website bulk deletion by root domain.
  - internal chunk replacement and expired thread vector garbage collection.
- Added deeper analytics backend coverage for:
  - global AI cost authorization and bounded assistant-message aggregation.
  - user cost overview tenant isolation and per-thread token/cost totals.
  - company metrics combining live usage, daily snapshots, plan MRR, and knowledge counts.
  - company analytics cross-tenant denial.
  - empty platform overview behavior for super admins and denial for standard users.
- Added workflow execution internal coverage for:
  - execution creation defaults.
  - terminal status updates and completion timestamps.
  - node step upsert behavior.
  - iterator/fan-out pending-step claim ordering.
  - no-op claim behavior when pending work is exhausted.
- Added deeper user management backend coverage for:
  - super admin create/update/delete lifecycle and audit logs.
  - paginated user query scoping for admins and impersonating super admins.
  - company user list authorization.
  - login tracking throttling and login visibility boundaries.
  - admin authentication audit logging.
  - super admin impersonation, assignment, detachment, and audit logs.
- Added deeper company management backend coverage for:
  - company list enrichment with user counts.
  - public and internal company reads.
  - update, prompt, description, profile, and plan assignment mutations.
  - update/profile audit logs.
  - delete lifecycle and delete audit metadata.
- Added broader backend coverage for:
  - invites, widgets, plans, settings, system information, scheduler guardrails, purges, and properties.
  - agent logs, agent transactions, workflow runtime behavior, workflow executions, and hybrid analytics.
  - analytics cron rollups, webhooks, file parsing, swarm runtime, Arcade actions, orchestrator routing, and Apify configuration/error paths.
  - knowledge actions and sales report actions, including authorization and failure cases where external services are mocked or unavailable.

Priority modules:

- AI model selection, enforcement, provider resolution, and default model behavior.
- AI tools, tool execution, and provider/tool authorization.
- Workflow runtime, scheduling, logs, and failure recovery.
- Upload, knowledge, file parsing, and tenant-safe access policies.
- User, company, invite, role, and admin management.
- Settings, plans, purges, audit logs, analytics, and sales reports.
- Authz helpers and shared security utilities.

Required test shape for every backend module:

- Happy path.
- Validation failure.
- Unauthenticated request.
- Unauthorized role.
- Cross-tenant or cross-company access denial where applicable.
- Empty data state.
- Boundary data state.
- Side effects such as audit logs, scheduled jobs, or database patches.

Specific gaps to close:

- Add explicit regression coverage for the AI models status filter behavior:
  - omitted status filter returns all models.
  - active filter returns enabled models.
  - inactive filter returns disabled models.
  - invalid status values are rejected by Convex validation.
- Add tests for analytics/reporting calculations with edge cases:
  - no data.
  - partial data.
  - deleted or inactive entities.
  - date boundaries.
- Add tests for workflow runtime errors:
  - failed tool call.
  - missing model.
  - disabled model.
  - malformed node configuration.
  - schedule execution guardrails.

Acceptance:

- Backend coverage reaches at least 80 percent line coverage before raising to 85 percent. Status: complete at 80.01 percent.
- All security-sensitive mutations and actions have negative authorization tests. Status: materially improved, with remaining runtime/action-heavy modules tracked for the next backend hardening slice.
- Coverage report does not show large untested service modules. Status: service coverage is strong; remaining large gaps are concentrated in external runtime/action modules.

## Phase 3: Frontend Component And Utility Coverage

Goal: cover reusable UI behavior and pure frontend logic before testing every page directly.

Progress:

- Phase 3 completed on June 1, 2026.
- Current measured coverage after Phase 3:
  - `npm run test:run -- --project ui`: 46 frontend test files, 156 tests, all passing.
  - `npm run test:coverage`: 111 total test files across frontend and backend, all passing.
  - all files: 34.05 percent line coverage, 73.54 percent branch coverage, 76.82 percent function coverage.
  - `convex`: 79.48 percent line coverage, 73.24 percent branch coverage, 88.81 percent function coverage.
  - frontend page and route files remain the primary reason the global line coverage number is still below the final target; those are explicitly assigned to Phase 4 and Phase 6.
- Added reusable frontend coverage for:
  - assistant composer, model selector, thinking selector, upload tray, upload status, welcome hero, and modal behavior.
  - widget configuration tabs, empty state, panels, welcome capture, greeting copy, conversation starters, integration snippet, appearance controls, and live preview panel.
  - AI cost metric blocks, header controls, leaderboards, timeline chart, model distribution chart, token chart, and formatter helpers.
  - settings identity, appearance, setting blocks, and audit log table loading, fallback, filtering, and navigation states.
  - chart export wrapper behavior, timeframe dropdown interactions, chat status cards, shared atoms, theme/layout providers, schema builder, workflow sidebar/node basics, debounce hook, avatar constants, telemetry, transcript, date, and error helpers.
- Coverage highlights after Phase 3:
  - `src/app/(dashboard)/app/assistant/_components`: 96.63 percent lines.
  - `src/app/(dashboard)/admin/companies/[id]/widget/_components`: 97.51 percent lines.
  - `src/app/(dashboard)/admin/ai/costs/_components`: 98.15 percent lines.
  - `src/ui/atoms`: 100 percent lines.
  - `src/ui/components/charts`: 100 percent lines.
  - `src/ui/components/settings`: 100 percent lines.
  - `src/ui/providers`: 100 percent lines.
  - `src/lib/constants`: 95.74 percent lines.
- Remaining frontend gaps intentionally deferred:
  - page-level route wiring and Convex query/mutation argument coverage, covered in Phase 4.
  - deterministic authenticated browser flows, covered in Phase 5 and Phase 6.
  - large workflow editor surfaces such as `ConfigDrawer`, `AgentEditorModal`, and `AgentNode`.
  - operational settings surfaces such as purge configuration.
  - broader layout/navigation shell files where meaningful coverage should come from page or browser tests rather than shallow component snapshots.

Priority components and helpers:

- Admin table primitives.
- Admin modal/form primitives.
- Admin save controls.
- Admin confirmation flows.
- Pagination helpers.
- Knowledge manager helpers.
- Widget configuration helpers.
- Assistant composer, pending file tray, model selector, and upload state.
- Chat history, markdown rendering, telemetry, and transcript helpers.
- Error, empty, loading, and disabled states.

Required frontend test shape:

- Renders expected content from props.
- Handles loading state.
- Handles empty state.
- Handles error state where supported.
- Fires the expected callback or mutation.
- Does not expose actions when disabled or unauthorized.
- Preserves accessible names for buttons, fields, tabs, and dialogs.

Acceptance:

- Shared frontend utility/component coverage reaches at least 75 percent before raising to 80 percent.
- High-reuse admin primitives have tests for interaction and accessibility basics.
- New shared UI components are not merged without tests.

## Phase 4: Page-Level Integration Coverage

Goal: protect the pages that wire together Convex queries, mutations, UI state, filters, pagination, forms, and navigation.

Progress:

- Phase 4 completed on June 1, 2026.
- Current measured coverage after Phase 4:
  - `npm run typecheck`: passing.
  - `npm run lint`: passing.
  - `npm run test:run`: 121 test files, 474 tests, all passing.
  - `npm run test:e2e`: 27 passing browser tests, 7 skipped authenticated browser tests.
  - `npm run test:coverage`: 121 test files, 474 tests, all passing.
  - all files: 40.09 percent line coverage, 73.09 percent branch coverage, 74.16 percent function coverage.
  - `convex`: 79.49 percent line coverage, 73.18 percent branch coverage, 88.78 percent function coverage.
- Added page-level integration coverage for:
  - AI tools connector listing, search, loading/empty states, external links, and delete confirmation.
  - companies listing, search, navigation, create/edit/delete modals, and mutation payloads.
  - users listing, search pagination arguments, load-more behavior, edit/delete/revoke actions, and invite visibility.
  - subscription plans listing, search, loading/empty states, create/edit/delete modals, and mutation payloads.
  - workflows listing, filtering, navigation, create, and delete behavior.
  - workflow schedules listing, filtering, schedule creation route, enable/disable, manual run, and delete behavior.
  - company widget initialization, publish behavior, and integration snippet copy.
  - admin settings identity, security, and audit-tab behavior.
  - assistant landing page user/model context and thread creation.
  - app settings dashboard loading, no-organization, populated analytics, and timeframe query arguments.
- Coverage highlights after Phase 4:
  - `/admin/ai/tools`: 98.63 percent lines.
  - `/admin/companies`: 97.17 percent lines.
  - `/admin/users`: 94.98 percent lines.
  - `/admin/settings`: 82.40 percent lines.
  - `/admin/settings/plans`: 98.42 percent lines.
  - `/admin/workflows`: 96.24 percent lines.
  - `/admin/workflows/schedules`: 95.90 percent lines.
  - `/admin/companies/[id]/widget`: 76.17 percent lines.
  - `/app/settings`: 95.06 percent lines.
  - `/app/assistant`: 64.60 percent lines.
- Remaining page-level gaps intentionally deferred:
  - authenticated browser role coverage, assigned to Phase 5.
  - deeper end-to-end journeys that assert persisted UI outcomes, assigned to Phase 6.
  - large nested editor/detail pages such as workflow schedule detail, agent detail, and company detail subroutes.

Priority pages:

- `/admin/ai/models`
- `/admin/ai/tools`
- `/admin/users`
- `/admin/companies`
- `/admin/companies/[id]/users`
- `/admin/companies/[id]/widget`
- `/admin/workflows`
- `/admin/workflows/schedules`
- `/admin/settings`
- `/admin/settings/plans`
- `/app/assistant`
- `/app/settings`

Required test shape for each high-priority page:

- Loading state.
- Empty state.
- Populated state.
- Search/filter behavior.
- Pagination behavior when present.
- Primary action success.
- Primary action failure.
- Permission-gated actions hidden or disabled.
- Query arguments sent to Convex match the expected contract.

Specific regression tests:

- AI models page must never send `"all"` as `statusFilter`; it should omit the field for the All state.
- AI models Active and Inactive filters must send `"active"` and `"inactive"` exactly.
- Search changes reset pagination to page 1.
- Pagination controls do not move past first or last page.

Acceptance:

- Every listed priority page has at least one page-level integration test or an authenticated e2e test.
- Pages with prior production/runtime bugs get direct regression tests.
- Route/page coverage is visible in the coverage report.

## Phase 5: Deterministic Browser Auth

Goal: convert skipped authenticated e2e tests into reliable CI coverage.

Progress:

- Phase 5 completed on June 1, 2026.
- Current measured coverage after Phase 5:
  - `npm run typecheck`: passing.
  - `npm run lint`: passing.
  - `npm run test:run`: 121 test files, 474 tests, all passing.
  - `npm run test:e2e`: 35 browser tests passing, 0 skipped.
  - `npm run test:coverage`: 121 test files, 474 tests, all passing.
  - all files: 40.23 percent line coverage, 73.06 percent branch coverage, 74.26 percent function coverage.
  - `convex`: 80.03 percent line coverage, 73.10 percent branch coverage, 89.01 percent function coverage.
- Added deterministic Playwright role projects:
  - `setup` generates role storage state.
  - `unauthenticated` covers auth redirects and public login access.
  - `super-admin` covers authenticated admin routes, table behavior, role behavior, and exports.
  - `user` covers authenticated assistant and profile journeys.
- Added a test-only e2e auth cookie and Convex React mock that are enabled only when `E2E_AUTH_ENABLED=1` and `NEXT_PUBLIC_E2E_AUTH_ENABLED=1`.
- Excluded `src/e2e/**` from product coverage totals so the browser harness does not count as uncovered application code.
- Generated storage state files are written under `e2e/.auth/` and ignored by git.
- Replaced authenticated skip behavior with assertions: `skipWhenRedirectedToLogin` now fails if an authenticated role project unexpectedly reaches `/login`.
- Updated authenticated browser specs for the current UI copy and hydration timing:
  - admin table pagination now asserts `Showing 1-15 of 18` and `Showing 16-18 of 18`.
  - empty rule search asserts the empty first page.
  - user chat waits for the hydrated e2e user shell before typing.

Tasks:

- Create deterministic test users:
  - super admin.
  - company admin.
  - regular user.
- Add a test-only seed/setup path for Playwright.
- Generate and store Playwright storage states:
  - `.auth/super-admin.json`
  - `.auth/company-admin.json`
  - `.auth/user.json`
- Update Playwright projects to run by role.
- Move `tests/e2e/admin-roles.spec.ts` under `e2e/` or update `playwright.config.ts` to include it.
- Remove conditional skips from authenticated tests once storage state is available in CI.

Acceptance:

- `npm run test:e2e` runs authenticated admin and user flows locally.
- CI fails if authenticated admin/user flows are skipped unexpectedly.
- Role-based browser tests can assert redirects, forbidden states, and successful access.

## Phase 6: End-To-End Journey Coverage

Goal: protect the most important real user journeys across routing, browser UI, Convex, and client state.

Progress:

- Phase 6 completed on June 1, 2026.
- Current measured coverage after Phase 6:
  - `npm run typecheck`: passing.
  - `npm run lint`: passing.
  - `npm run test:run`: 121 test files, 474 tests, all passing.
  - `npm run test:e2e`: 40 browser tests passing, 0 skipped.
  - `npm run test:coverage`: 121 test files, 474 tests, all passing.
  - all files: 40.23 percent line coverage, 73.09 percent branch coverage, 74.26 percent function coverage.
  - `convex`: 80.03 percent line coverage, 73.16 percent branch coverage, 89.01 percent function coverage.
- Added deterministic browser journeys for:
  - login redirect behavior for authenticated users and protected route denial after clearing session cookies.
  - AI model All, Active, and Inactive filter behavior using visible result counts and status labels.
  - AI connector rendering with deterministic connector metadata.
  - admin user search and edit dialog controls.
  - company widget configuration editing, publish state, and integration snippet copy action.
  - workflow creation, workflow detail rendering, schedules, and manual schedule dispatch.
- Expanded the e2e Convex React mock so authenticated browser journeys can exercise widget, workflow, schedule, AI model, AI tool, and user-management data without live Convex/Auth dependencies.
- Existing route-stability e2e specs collect page errors for high-value routes. Broader global console-error enforcement remains a Phase 7 hardening item because the current app still emits known hydration, chart-dimension, and clipboard warnings during otherwise passing browser journeys.

Required e2e journeys:

- Login and logout.
- Admin dashboard route stability.
- Super admin can view AI models and use All, Active, and Inactive filters.
- Super admin can view AI tools.
- Super admin can invite or manage users.
- Admin can view and edit company widget configuration.
- Admin can create or edit workflow configuration.
- Admin can view workflow schedules and logs.
- User can submit assistant chat message and land in a thread.
- User can edit profile/settings.
- Unauthenticated user is redirected from protected app/admin pages.
- Non-admin user is blocked from admin-only pages.
- Export flow creates a downloadable/blob artifact where expected.

Acceptance:

- Browser tests run under deterministic auth roles.
- Critical journeys assert visible UI results, not only HTTP status or lack of crashes.
- Browser tests collect console/page errors and fail on unexpected runtime errors.

## Phase 7: CI And Reporting

Goal: make coverage part of normal delivery instead of an occasional local check.

Progress:

- Phase 7 completed on June 1, 2026.
- Added `.github/workflows/ci.yml` for pushes and pull requests targeting `dev` and `main`.
- CI now runs the full quality gate:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:e2e`
  - `npm run test:coverage`
- CI installs the Chromium Playwright browser before running browser tests.
- CI publishes a coverage table to the GitHub job summary using `coverage/coverage-summary.json`.
- CI uploads the full `coverage/` report on every run.
- CI uploads the `playwright-report/` artifact on failures.
- Raised Vitest coverage thresholds to the Phase 6 measured floor:
  - lines: 40 percent.
  - statements: 40 percent.
  - branches: 73 percent.
  - functions: 74 percent.

Tasks:

- Update CI to run:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:run`
  - `npm run test:coverage`
  - `npm run test:e2e`
- Upload coverage artifacts from CI.
- Upload Playwright HTML report on failure.
- Add a coverage summary comment or job summary.
- Fail CI when coverage drops below thresholds.
- Add a documented process for raising thresholds over time.

Acceptance:

- CI exposes coverage trend and browser failure artifacts.
- Coverage thresholds prevent accidental regressions.
- Developers can reproduce CI coverage locally with one command.

## Phase 8: Threshold Ratchet

Goal: raise standards gradually without creating churn.

Progress:

- Phase 8 completed on June 1, 2026.
- Added `coverage-thresholds.json` as the single source of truth for:
  - current enforced thresholds.
  - the minimum allowed threshold floor.
  - the latest measured coverage.
  - the next ratchet target.
  - long-term backend/frontend/browser goals.
- Updated `vitest.config.ts` to read thresholds from `coverage-thresholds.json`.
- Added `npm run coverage:check`, backed by `scripts/check-coverage-thresholds.mjs`, to:
  - verify generated coverage meets the current thresholds.
  - fail if the configured current thresholds drop below the floor.
  - print the same coverage summary table locally and in GitHub Actions.
- Updated CI to run `npm run coverage:check` after `npm run test:coverage`.
- Current enforced floor:
  - lines: 40 percent.
  - statements: 40 percent.
  - branches: 73 percent.
  - functions: 74 percent.
- Next ratchet target:
  - lines: 45 percent.
  - statements: 45 percent.
  - branches: 73 percent.
  - functions: 75 percent.

Suggested ratchet:

- Week 1: establish measured baseline and pass at current level.
- Week 2: raise global line/function thresholds to 65 percent.
- Week 3: backend line threshold to 80 percent.
- Week 4: frontend shared component/util threshold to 75 percent.
- Week 5: backend branch threshold to 75 percent.
- Week 6: critical page/journey checklist required for releases.

Rules:

- Never lower thresholds without documenting why.
- New files should include tests in the same PR unless explicitly deferred.
- Bug fixes should include regression tests.
- High-risk pages and backend modules should receive targeted tests before broad snapshot-style tests.

## Ownership Checklist

For each feature or bug fix, verify:

- Backend query/mutation/action has tests if backend behavior changed.
- Frontend component/page has tests if visible behavior changed.
- E2E test exists if the change crosses auth, routing, data persistence, or browser-only behavior.
- Coverage report does not show a new large untested file.
- CI passes without unexpected skips.

## First Implementation Slice

The first implementation PR should be intentionally small:

- Add `@vitest/coverage-v8`.
- Add `test:coverage` script and Vitest coverage config.
- Move or include `tests/e2e/admin-roles.spec.ts`.
- Add AI models status filter regression tests:
  - backend query behavior for omitted, active, and inactive filters.
  - frontend page test proving All omits `statusFilter`.
- Add `docs/plans/active/comprehensive-test-coverage-plan.md` to the docs index.

This creates measurement, fixes one known e2e blind spot, and protects the bug that triggered this coverage review.
