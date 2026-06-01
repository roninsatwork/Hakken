# Platform Grade Refactor And Test Upgrade Plan

This plan is for turning Sonae from a healthy app into a platform-grade core that can safely become the base for many future products.

The current codebase is in good shape: checks pass, the build passes, and the test suite now covers many important risks. This plan assumes we are willing to do a deeper refactor where it improves the long-term platform shape. Temporary breakage during a slice is acceptable as long as each slice ends with tests, build, a diff summary, and explicit commit/push approval.

## Target Outcome

Move the codebase from roughly 88/100 to 95+ by improving:

- workflow/runtime architecture
- AI and tool execution boundaries
- provider-neutral naming and removal of stale Gemini-era language
- reusable frontend/admin primitives
- test depth, especially browser and workflow coverage
- future-agent handoff clarity
- platform extension points for new products

This is not a rewrite for its own sake. Every refactor should make the next product easier, safer, or faster to build.

## Operating Rules

- Work on `dev`.
- Do not commit unless the user explicitly says `commit`.
- Do not push unless the user explicitly says `push`.
- Do not push to `main` unless the user explicitly asks for live deploy testing.
- Movement demo stays frozen unless a required gate is broken:
  - `src/app/(dashboard)/demos/movements/**`
  - `src/app/(dashboard)/demos/movement-capture/page.tsx`
  - `convex/movements.ts`
- Vertex references are allowed where they describe the intentional backend provider setup.
- Gemini references should be removed, renamed, or documented unless they refer to an actual Google/Gemini model ID or external package/API.
- Each slice ends with:
  - focused tests for changed behavior or contracts
  - `npm run check`
  - `npm run build` when app/runtime surfaces changed
  - `git diff --check`
  - diff summary
  - user approval before commit/push

## Refactor Philosophy

Use this app as a future product core. That changes the refactor standard:

- Prefer clear platform APIs over page-local convenience.
- Prefer small typed services over large mixed handlers.
- Prefer provider-neutral concepts over hard-coded model/vendor language.
- Prefer testable pure helpers where runtime code is currently doing parsing, branching, and side effects together.
- Prefer shared UI primitives for repeated admin/app patterns.
- Prefer explicit extension points for new tools, agents, workflows, tenants, and integrations.

Do not refactor code only because it is imperfect. Refactor when it improves one of:

- product reuse
- security
- tenant isolation
- testability
- feature velocity
- operational reliability
- future-agent comprehension

## Phase 0: Baseline, Inventory, And Safety Rails

Status: Complete.

Goal:

- Create a trustworthy map of remaining risk before deeper refactors begin.
- Avoid accidentally mixing platform refactor work with unrelated product changes.

Scope:

- docs and plans
- package scripts
- existing tests
- GitHub Actions
- drift tests
- movement demo no-touch guardrails

Checklist:

- [x] Record current baseline: `npm run check`, `npm run build`, `npm audit --audit-level=high`.
- [x] Confirm the local app still runs on `localhost:3000` with Convex.
- [x] Review `src/quality-drift.test.ts` and add missing drift checks for new platform rules.
- [x] Add or update a drift check for movement demo no-touch paths if needed.
- [x] Add a provider-language drift check for accidental new Gemini references outside allowed locations.
- [x] Add a docs checklist entry for each deeper refactor phase.
- [x] Confirm CI deploy docs still match workflow behavior.

Baseline recorded on June 1, 2026:

- `npm run lint:all`: passed
- `npm run check`: passed, 58 test files and 177 tests
- `npm run build`: passed
- `npm audit --audit-level=high`: passed, 0 vulnerabilities
- Local app smoke: `npm run dev` served `http://localhost:3000/login` with HTTP 200 while `npm run convex:dev` reported functions ready

Phase tracking checklist:

- [x] Phase 0: Baseline, Inventory, And Safety Rails
- [x] Phase 1: Provider Neutrality And Naming Cleanup
- [x] Phase 2: Workflow Runtime Architecture Refactor
- [x] Phase 3: AI And Tool Execution Platform Layer
- [x] Phase 4: Backend Service Boundary Refactor
- [ ] Phase 5: Frontend Platform Primitives
- [ ] Phase 6: Data, Upload, And Knowledge Policy Layer
- [ ] Phase 7: E2E, Browser, And Regression Coverage Upgrade
- [ ] Phase 8: Product-Core Extraction And Extension Points
- [ ] Phase 9: Final Hardening And Release Readiness

Acceptance:

- Baseline commands pass before deeper refactor begins.
- Refactor guardrails are testable rather than only written in docs.
- Future agents can see which phase is active and which files are off limits.

## Phase 1: Provider Neutrality And Naming Cleanup

Status: Complete.

Goal:

- Remove stale Gemini-era language and awkward naming so the app reads like a provider-neutral platform.

Why:

- The app is moving from a single-provider implementation toward a reusable AI platform core.
- Naming affects every future agent and developer who has to understand where to add new models, tools, and providers.

Scope:

- docs
- comments
- user-facing labels where provider-specific wording is accidental
- helper/function names
- test names
- AI model fallback helpers
- model/tool/admin surfaces

Do not remove:

- actual Gemini model IDs
- actual Google/Vertex integration code that is still intentional
- package/API names that must stay provider-specific
- historical migration notes where they are clearly marked as historical

Checklist:

- [x] Search for `Gemini`, `gemini`, `Vertex`, `vertex`, `Google`, and `google`.
- [x] Classify each hit as `keep by design`, `rename`, `document`, or `delete`.
- [x] Rename provider-specific helper names to provider-neutral names where the code is not genuinely Gemini-only.
- [x] Rename stale test descriptions that imply Gemini-only behavior.
- [x] Remove comments that refer to old temporary phases or old agents.
- [x] Shorten long function names only where the shorter name improves the platform API.
- [x] Add a small allowlist for intentional provider terms.
- [x] Add or update drift tests so accidental Gemini-isms do not return.

Completed on June 1, 2026:

- Provider-language inventory is now classified through `src/quality-drift.test.ts`.
- Stale product and architecture docs now describe configured model providers rather than a Gemini-specific platform.
- Dummy test data now uses provider-neutral model names unless a real model ID is required.
- Intentional remaining Gemini references are limited to actual model IDs, the current Vertex model sync list, seed/default configuration, and this plan/legacy-agent notes.
- Google/Vertex references remain where they describe real OAuth, analytics, Cloud Run, Google GenAI, or Vertex integration boundaries.

Naming guidelines:

- Use `model`, `provider`, `runtime`, `tool`, `adapter`, `fallback`, and `generation` for provider-neutral code.
- Use `vertex` only for infrastructure/provider integration boundaries.
- Use actual model IDs only where the ID is stored, shown, or sent to a provider.
- Avoid long names that restate the full call chain.
- Prefer names that describe responsibility, not implementation history.

Acceptance:

- Accidental Gemini-era naming is removed.
- Intentional Vertex/provider references are documented or allowlisted.
- Tests and docs still pass.

## Phase 2: Workflow Runtime Architecture Refactor

Status: Complete.

Goal:

- Turn workflow runtime code into smaller typed handlers with explicit contracts.

Why:

- Workflow runtime is one of the highest-value platform areas.
- Future apps will likely reuse workflows heavily.
- Runtime code currently mixes graph parsing, input mapping, node dispatch, side effects, output parsing, scheduling, and failure handling.

Scope:

- `convex/workflowRuntime.ts`
- `convex/workflowEngine.ts`
- `convex/workflowRuntimeService.ts`
- `convex/utils/workflowTypes.ts`
- workflow schedule helpers
- workflow tests

Already completed:

- [x] Add typed workflow graph node/edge validation for workflow updates.
- [x] Add tolerant runtime parsers for old saved graph data.
- [x] Add focused tests for malformed node/edge/schedule payloads.
- [x] Create a typed workflow runtime context helper for execution state, node data, parsed input, and global payload.
- [x] Extract pure runtime handlers for logic, iterator, merge, wait, approval, and bypass/default nodes.
- [x] Add config readers/parsers for logic, iterator, wait, and approval nodes.
- [x] Normalize JSON parsing for trigger input, execution state, step input, and pure runtime node outputs.
- [x] Add focused tests for malformed trigger input, malformed step input, malformed upstream output, invalid pure node config, and pure node output commands.
- [x] Add typed config readers and request/input builders for action/API, database, and email nodes.
- [x] Move downstream scheduling decisions and runtime error message normalization into tested service helpers.
- [x] Extract action/API, agent, database, email, code, and merge runtime handlers so `executeNode` mainly orchestrates node dispatch.
- [x] Add regression tests for iterator fan-out, merge fan-in, and approval halt/resume behavior.
- [x] Normalize node response/output shaping for API action, code, database, and email nodes.

Checklist:

- [x] Create a typed workflow runtime context object for execution state, node data, parsed input, and global payload.
- [ ] Extract node-specific handlers:
  - [x] action/API node
  - [x] agent node
  - [x] database node
  - [x] logic node
  - [x] iterator node
  - [x] merge node
  - [x] wait node
  - [x] approval node
  - [x] email node
  - [x] bypass/default node
- [x] Add config readers/parsers for each node type.
- [x] Replace local casts such as `as ActionConfig`, `as DatabaseConfig`, and `as LogicConfig`.
- [ ] Normalize JSON parsing for:
  - [x] execution state
  - [x] step input
  - [x] step output
  - [x] node config
  - [x] system commands
- [x] Move scheduling decisions into a small tested helper.
- [x] Move failure message formatting into a small helper.
- [x] Add tests for invalid config per node type.
- [x] Add tests for malformed execution state and malformed upstream output.
- [x] Add tests for iterator fan-out and merge fan-in behavior.
- [x] Add tests for approval halt/resume behavior.

Acceptance:

- `executeNode` becomes an orchestration function rather than a large handler.
- Each node type has a testable runtime handler.
- Invalid workflow config fails clearly.
- Existing valid workflows still execute as before.
- `npm run check` and `npm run build` pass.

## Phase 3: AI And Tool Execution Platform Layer

Status: Complete.

Goal:

- Make AI/tool execution safe, typed, provider-aware, and easier to extend.

Why:

- AI/tool execution combines model output, credentials, tenant boundaries, external services, and user data.
- This will be central to future products, so it should not remain a collection of broad handlers and loose payloads.

Scope:

- `convex/ai.ts`
- `convex/aiTools.ts`
- `convex/agentRuntime.ts`
- `convex/aiModels.ts`
- `convex/aiModelService.ts`
- tool admin pages if needed
- upload/file policy helpers if they interact with AI tools

Checklist:

- [x] Map current AI execution flows from user request to model call to tool execution.
- [x] Define provider-neutral types for model requests, model responses, tool calls, and tool results.
- [x] Keep provider adapters isolated behind provider-specific modules.
- [x] Confirm Vertex usage remains intentional and clearly named.
- [x] Extract model fallback selection into a stable service boundary.
- [x] Add typed guards for tool input and output payloads.
- [x] Add tests for:
  - [x] model fallback selection
  - [x] disabled model behavior
  - [x] missing credential behavior
  - [x] invalid tool payload behavior
  - [x] failed external tool call behavior
  - [x] tenant/role enforcement around tool execution
- [x] Normalize error shapes returned to the UI.
- [x] Document how to add a new provider or tool safely.

Acceptance:

- AI/tool code is provider-neutral except at adapter boundaries.
- Invalid tool payloads fail clearly.
- Provider fallback is tested and easy to understand.
- Adding a new tool or provider has a documented path.

## Phase 4: Backend Service Boundary Refactor

Status: Complete.

Goal:

- Make Convex modules smaller, more typed, and easier to reuse across future apps.

Why:

- The backend is the real product core.
- Future products will need reliable auth, tenancy, settings, knowledge, workflows, AI, audit, and admin surfaces.

Scope:

- Convex modules outside movement demo
- shared auth helpers
- admin query helpers
- knowledge/upload helpers
- analytics helpers
- settings/plans helpers
- audit helpers

First backend audit slice:

- `analytics.ts` and `analyticsHybrid.ts` mix auth, reads, cost math, timeline formatting, and leaderboard aggregation.
- `users.ts` mixes auth, tenant checks, user mutation policy, audit logging, and purge orchestration.
- `purges.ts` mixes schedule policy, purge execution, and cross-table deletion.
- `knowledge.ts` mixes upload policy, tenant access, storage metadata, and document status transitions.
- Workflow runtime files are large but were handled in Phase 2, so Phase 4 should avoid reworking them unless a gate breaks.

Completed service-boundary slices:

- Moved AI model cost mapping, cost calculation, GBP conversion, and metric rounding into `analyticsService`.
- Moved user-management create/update/delete role and tenant policy into `userManagementService`.
- Moved purge pipeline defaults, schedule config parsing, retention-floor validation, next-run normalization, and cutoff timestamp calculation into `purgeScheduleService`.
- Moved knowledge document/chunk record shaping, audit metadata formatting, thread-vector expiry threshold calculation, and website bulk-delete matching into `knowledgeService`.
- Moved audit purge config defaults, monthly schedule calculation, cutoff math, config serialization, and recent-log actor-name decoration into `auditLogService`.
- Moved plan-status derivation, plan creation record shaping, and assigned-plan delete error formatting into `planService`.
- Moved system settings defaults, patch normalization, logo storage-reference detection, default merging, and settings audit metadata formatting into `settingsService`.
- Moved system config keys, config write/patch shaping, analytics ID trimming, system prompt/analytics audit metadata, and admin PII config parsing into `systemService`.
- Moved company record/profile patch shaping, user-count enrichment, company audit metadata, and purge continuation decisions into `companyService`.
- Moved agent record/update patch shaping, global-agent filtering, agent audit metadata, and inline-agent/promotion defaults into `agentService`.

Checklist:

- [x] Audit large Convex files by line count and responsibility.
- [x] Identify handlers that mix auth, query, filtering, formatting, and side effects.
- [x] Move pure filtering/formatting/calculation into service helpers.
- [x] Keep auth and tenant checks explicit at handler boundaries.
- [x] Use generated Convex types wherever possible.
- [x] Add tests for extracted service helpers.
- [x] Add BOLA tests when a refactor touches tenant-scoped data.
- [x] Keep external behavior unchanged unless the existing behavior is clearly wrong.

Acceptance:

- Large backend handlers become easier to scan.
- Shared backend logic is tested outside Convex handler plumbing.
- Tenant isolation remains covered.

## Phase 5: Frontend Platform Primitives

Status: Not started.

Goal:

- Turn repeated frontend/admin UI patterns into reusable platform primitives without forcing a redesign.

Why:

- If Sonae becomes a core for many apps, repeated page boilerplate will slow every future product.
- Admin tables, detail pages, forms, mutation feedback, and empty/error/loading states should feel consistent and be easy to compose.

Scope:

- admin pages
- app shell
- shared table primitives
- detail page layout patterns
- forms and modals
- loading/empty/error components
- mutation feedback helpers

Checklist:

- [ ] Audit admin pages still hand-rolling table shells, filters, loading rows, empty rows, or pagination.
- [ ] Expand shared admin table primitives where patterns are genuinely repeated.
- [ ] Create or improve shared detail-page primitives where pages repeat header/action/sidebar structures.
- [ ] Create shared form field patterns only where they remove real duplication.
- [ ] Standardize destructive action confirmation and disabled states.
- [ ] Standardize mutation toast/modal/error flows.
- [ ] Add tests for shared UI primitives.
- [ ] Keep the current UI direction unless the user explicitly chooses a redesign.

Acceptance:

- New admin pages can be built from documented primitives.
- Existing pages keep their visual direction.
- Shared behavior has tests.

## Phase 6: Data, Upload, And Knowledge Policy Layer

Status: Not started.

Goal:

- Make file, upload, and knowledge ingestion policy consistent and reusable.

Why:

- Future apps will likely use different document types and ingestion rules.
- File policy drift is a common source of security and product bugs.

Scope:

- upload helpers
- knowledge ingestion
- document chunking paths
- AI file usage
- frontend upload UI where needed

Checklist:

- [ ] Map every upload and ingestion entry point.
- [ ] Centralize allowed file type, size, and storage policy checks.
- [ ] Add tests for allowed and rejected file policies.
- [ ] Normalize user-facing errors for rejected uploads.
- [ ] Confirm tenant scoping for knowledge documents and chunks.
- [ ] Document how future products should add file types.

Acceptance:

- Upload and ingestion policy is enforced consistently.
- Policy changes happen in one obvious place.
- Tests cover allowed and rejected cases.

## Phase 7: E2E, Browser, And Regression Coverage Upgrade

Status: Not started.

Goal:

- Move browser coverage from smoke-level to deploy-confidence coverage.

Why:

- Unit and integration tests are strong, but future product work needs confidence that key routes actually render and basic workflows do not collapse in the browser.

Scope:

- Playwright tests under `e2e/**`
- auth redirects
- admin shell
- admin tables
- workflow pages
- AI models/tools pages
- chat/admin log pages

Checklist:

- [ ] Review existing Playwright tests and classify them as smoke, regression, or behavior tests.
- [ ] Add route render tests for the highest-value admin sections.
- [ ] Add shared admin table search/pagination browser coverage.
- [ ] Add workflow designer and schedule page browser coverage where auth setup allows.
- [ ] Add AI models/tools route coverage.
- [ ] Add a test that catches Next.js shell crashes after route load.
- [ ] Document any auth limitations that block deeper browser tests.
- [ ] Keep tests deterministic and fast enough to run before deploy.

Acceptance:

- Browser tests catch route crashes and obvious shared UI regressions.
- E2E suite is reliable enough for release checks.
- Test commands are documented.

## Phase 8: Product-Core Extraction And Extension Points

Status: Not started.

Goal:

- Make it obvious how future products should build on Sonae without copying random page internals.

Why:

- The app is intended to become a reusable core.
- That needs extension points, not just cleaner code.

Scope:

- docs
- folder structure
- admin primitives
- workflow node registration
- AI tool registration
- provider registration
- tenant settings
- app shell customization

Checklist:

- [ ] Document the intended platform layers:
  - app shell
  - admin shell
  - Convex backend
  - AI runtime
  - workflow runtime
  - integrations/tools
  - tenant settings
- [ ] Document how to add a new admin section.
- [ ] Document how to add a new workflow node type.
- [ ] Document how to add a new AI tool.
- [ ] Document how to add a new model/provider.
- [ ] Document how to customize branding/navigation for a new product.
- [ ] Add small examples where docs alone are not enough.

Acceptance:

- A future agent can add common product extensions without reverse-engineering the whole app.
- New product customization points are clear.

## Phase 9: Final Hardening And Release Readiness

Status: Not started.

Goal:

- Finish the deeper refactor with confidence and a clean release path.

Checklist:

- [ ] Confirm no movement demo files changed unless explicitly allowed.
- [ ] Run `npm run lint:all`.
- [ ] Run `npm run check`.
- [ ] Run `npm run build`.
- [ ] Run `npm audit --audit-level=high`.
- [ ] Run selected Playwright/browser tests.
- [ ] Smoke test local app on `localhost:3000` with Convex running.
- [ ] Review full diff.
- [ ] Update this plan with completed phases and commits.
- [ ] Commit only after explicit approval.
- [ ] Push to `dev` only after explicit approval.
- [ ] Push to `main` only after explicit live deploy approval.

Acceptance:

- Full verification passes.
- The repo is clean on `dev`.
- Docs match actual workflow and architecture.
- The app is ready to build features from a stronger platform base.

## Suggested Execution Order

1. Phase 0: Baseline, Inventory, And Safety Rails
2. Phase 1: Provider Neutrality And Naming Cleanup
3. Phase 2: Workflow Runtime Architecture Refactor
4. Phase 3: AI And Tool Execution Platform Layer
5. Phase 4: Backend Service Boundary Refactor
6. Phase 5: Frontend Platform Primitives
7. Phase 6: Data, Upload, And Knowledge Policy Layer
8. Phase 7: E2E, Browser, And Regression Coverage Upgrade
9. Phase 8: Product-Core Extraction And Extension Points
10. Phase 9: Final Hardening And Release Readiness

## Definition Of Done

This plan is complete when:

- provider-specific language is intentional and documented
- workflow runtime is split into typed, tested handlers
- AI/tool execution is provider-neutral and guarded by typed contracts
- backend service helpers cover repeated business logic
- frontend/admin primitives are reusable for future products
- upload and knowledge policy is centralized
- browser tests cover key route and shared UI regressions
- future product extension points are documented
- full verification passes:

```bash
npm run lint:all
npm run check
npm run build
npm audit --audit-level=high
git diff --check
```
