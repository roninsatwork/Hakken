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

- Backend coverage reaches at least 80 percent line coverage before raising to 85 percent.
- All security-sensitive mutations and actions have negative authorization tests.
- Coverage report does not show large untested service modules.

## Phase 3: Frontend Component And Utility Coverage

Goal: cover reusable UI behavior and pure frontend logic before testing every page directly.

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
- Add `docs/comprehensive-test-coverage-plan.md` to the docs index.

This creates measurement, fixes one known e2e blind spot, and protects the bug that triggered this coverage review.
