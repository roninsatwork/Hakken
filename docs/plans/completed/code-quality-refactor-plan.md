> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Code Quality Refactor Plan

This plan tracks the cleanup needed after restoring the basic quality gates. The goal is to improve maintainability, type safety, and correctness without mixing the work into unrelated product changes.

## Goals

- Keep `npm run lint`, `npm run typecheck`, `npm run test:run`, and `npm run build` passing.
- Reduce the warning backlog shown by `npm run lint:all`.
- Replace broad `any` usage with useful domain types.
- Fix React/compiler warnings where they point to real correctness or maintainability issues.
- Tidy UI implementation where needed, including component structure, state handling, accessibility, and consistency.
- Keep each phase small enough to review safely.

## Non-Goals

- Do not introduce new product features.
- Do not change backend behavior unless the current behavior is incorrect or underspecified.
- Do not combine visual redesign with backend refactors.
- Do not rewrite entire modules where targeted cleanup is enough.

## UI Policy

UI cleanup is allowed. The aim is to make the interface code easier to maintain and fix real UI issues, not to preserve every existing implementation detail.

Allowed UI work:

- Tidy component structure.
- Move nested components out of render functions.
- Replace derived state effects with direct derived values.
- Fix ref usage that React flags as unsafe.
- Improve accessibility where the current UI is weak.
- Remove duplicated markup and dead UI code.
- Adjust layout or component composition when needed to resolve real bugs.

Guardrails:

- Avoid broad visual redesign inside code-quality PRs.
- Keep copy changes minimal unless text is broken, unsafe, or confusing.
- When UI behavior changes, call it out explicitly in the PR.
- Add or update tests for user-visible behavior changes.

## Phase 1: Keep Gates Stable

Scope:

- Keep the current quality gate scripts working.
- Keep lint hard-errors clean while existing debt remains visible as warnings.
- Confirm generated, vendored, and scratch files are excluded from app lint/typecheck.

Acceptance criteria:

- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm run test:run` passes.
- `npm run build` passes.
- `npm run lint:all` remains available for warning visibility.

## Phase 2: Backend Type Safety

Scope:

- Replace broad `any` in Convex backend hot paths.
- Prioritize auth, users, companies, chat, uploads, AI execution, and audit logging.
- Use generated Convex types such as `Doc<"users">` and `Id<"companies">`.

Acceptance criteria:

- Fewer backend `@typescript-eslint/no-explicit-any` warnings.
- No behavior changes without tests.
- Existing backend tests remain green.

## Phase 3: Workflow Runtime Typing

Scope:

- Define shared workflow node, edge, trigger, schedule, and execution payload types.
- Replace runtime/editor `any` usage where data shape is already known.
- Add parser/guard helpers for dynamic workflow config.

Acceptance criteria:

- Workflow tests remain green.
- Fewer workflow `any` casts.
- Invalid workflow payloads fail clearly instead of producing undefined behavior.

## Phase 4: Chat, Upload, And AI Contracts

Scope:

- Continue consolidating upload/file policy constants.
- Type model selection and AI execution config.
- Clarify inline image handling versus document/RAG handling.
- Avoid orphaned upload/document state on failed operations.

Acceptance criteria:

- Upload tests cover accepted and rejected file classes.
- AI/chat tests remain green.
- Shared constants prevent frontend/backend drift.

Status:

- Upload policy constants are shared between Convex and the frontend.
- Chat/document save paths validate the same supported file classes.
- AI, agent runtime, model sync, and swarm actions have typed generation config/tool payloads.
- Agent admin/logging/transaction paths avoid broad query-builder `any` usage.
- Analytics cost and snapshot paths share typed model-cost helpers and typed interaction payloads.
- Users, document parsing, template parsing, and security helpers avoid broad `any` usage in the active hot paths.
- Workflow runtime templating keeps typed caller contracts while using unknown-safe recursive parsing internally.
- Remaining backend-tail modules such as Apify, invites, orchestration, plans, properties, and settings have had obvious `any`/unused-import warnings removed.
- Sidebar navigation now derives route active state/open defaults instead of syncing them with effects, and the schema builder parses initial state without an effect.
- Rule and tool edit forms now keep local draft state derived from loaded records without effect-based state syncing, preserving unsaved edits during query refreshes.
- Remaining React `set-state-in-effect` warnings have been cleared by deriving display state directly, moving search reset into input handling, and using effect-safe refs/external-store mounted checks.
- Workflow UI components now share typed node/config contracts, removing broad `any` usage from the main config drawer, agent editor modal, agent node, and generic node surfaces.
- Admin agents, AI costs, plans, and workflow schedules pages now avoid broad local `any` usage in their main table/render paths, use typed Convex rows, and replace raw leaderboard/avatar images with Next `Image` where touched.
- Workflow schedules now calls the real `api.scheduler.manualRunSchedule` mutation instead of relying on an `api as any` reference to a non-existent `manualRunWorkflow` field.
- Workflow designer and system settings admin pages now use typed canvas/settings/purge/audit structures, removing local `any` casts, raw logo previews, and render-time `Date.now()` purity warnings in those pages.
- Company user management and workflow schedule create/edit pages now use typed user/invite/workflow/agent/schedule rows, direct generated Convex APIs, typed tests, and Next `Image` for user avatars where touched.
- Agent detail settings, knowledge, logs, and schemas pages now use typed Convex rows/form state, unknown-safe error handling, and Next `Image` for the touched avatar preview.
- Agent detail layout/dashboard/integrations/prompt/rules pages now remove dead imports, avoid local `any`, preserve prompt drafts during query refresh, and use Next `Image` for the touched layout avatar.
- AI model/rule/prompt/tool admin pages now remove dead imports, type event/ID usage, avoid local `any` in prompt save handling, and clear the touched unescaped text warnings.
- Company profile/analytics/invite/audit pages now remove local `any`, avoid render-time mock timestamps, type metric cards and plan rows, and replace touched leaderboard images with Next `Image`.
- Global/company knowledge, chat-log, widget, and prompt pages now share typed upload/event/error handling, preserve prompt drafts during query refreshes, trim dead imports, and replace touched logo/avatar previews with Next `Image`.
- Admin dashboard, company management, user, super-admin, workflow list/log, and analytics pages now use typed Convex rows and form state, unknown-safe error handling, and Next `Image` for touched avatars/leaderboards.
- Workflow execution approval now calls the typed Convex action with the required `action: "APPROVED"` payload instead of going through `api as any`.
- Super-admin tests now use typed hook mocks instead of broad `any` casts.
- User profile and small shared UI hooks/components now remove stale imports, typed upload storage IDs, and replace the touched profile avatar preview with Next `Image`.
- Legacy agent rule drift has been corrected for touched admin surfaces: no native alert usage, admin list pagination now uses 15 rows, and new feedback text has English/Italian locale parity.
- App settings, properties, shared chat/layout components, and the progressive loading hook now remove broad local `any` usage, raw touched avatar/property images, dead imports, and render-time random/time purity warnings.
- Small E2E, login, sandbox, and widget warnings now avoid unused variables and unescaped text where touched.
- Chat input now uses typed AI model rows, typed modal test mocks, and escaped modal copy without local `any` warnings.
- Reports page now uses typed chart tooltip values and inferred report row types, removes dead chart imports/data, and escapes remaining board-report copy.
- Backend tail modules, seed/test helpers, assistant/widget pages, arcade, movement capture, movement library, preview components, and the high-fidelity movement playback page now avoid broad local `any`, dead imports, unsafe render-time ref reads, and effect cleanup drift.
- Legacy agent rule drift has been tightened further: `/demos` is now protected by auth middleware, remaining admin table page sizes are 15, and native browser `alert`/`confirm`/`prompt` calls have been replaced with in-app feedback or confirmation flows.
- Current warning backlog after this slice: `npm run lint:all` reports 0 warnings and 0 errors.

## Phase 5: UI Code Cleanup

Scope:

- Address React compiler warnings in UI files.
- Move static/nested components out of render paths.
- Remove unnecessary effects that only mirror derived state.
- Fix unsafe ref reads during render.
- Clean repeated UI data mapping and local `any` types.

Acceptance criteria:

- UI tests remain green.
- Any visual or interaction change is documented.
- Relevant React/compiler warnings are removed from `npm run lint:all`.

## Phase 6: Tighten Rules Back To Errors

Scope:

- Promote warning rules back to errors category by category.
- Start with low-risk rules such as unused imports/vars after cleanup.
- Promote `no-explicit-any` only after core backend/workflow/UI areas are typed.

Candidate rules:

- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/ban-ts-comment`
- `react-hooks/static-components`
- `react-hooks/purity`
- `react-hooks/refs`
- `react-hooks/set-state-in-effect`
- `react/no-unescaped-entities`

Acceptance criteria:

- Each promoted rule has a clean baseline.
- CI continues to pass.
- No broad suppressions are added to hide new debt.

## Suggested PR Boundaries

1. Backend auth/users/companies typing.
2. Chat/upload/AI contract typing.
3. Workflow runtime types and guards.
4. Admin/dashboard table data typing.
5. React compiler cleanup in shared UI components.
6. React compiler cleanup in complex feature pages.
7. Rule tightening pass.

## Verification Commands

Run these before merging each phase:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Use this to inspect remaining cleanup debt:

```bash
npm run lint:all
```
