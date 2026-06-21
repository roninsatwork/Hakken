# Current Cleanup Checklist

This checklist is the active source of truth for the whole-app cleanup work. Do not mark a phase complete until every acceptance item in that phase is done and verified.

## Rules Going Forward

- No commits unless the user explicitly says `commit`.
- No pushes during a phase.
- Push to `dev` at the end of each verified phase after the user explicitly approves the phase-end push.
- Do not touch the movement demo pages:
  - `src/app/(dashboard)/demos/movements/**`
  - `src/app/(dashboard)/demos/movement-capture/page.tsx`
  - `convex/movements.ts`
- Work in bigger grouped sweeps, not one tiny file at a time.
- Each sweep ends with tests, diff summary, and user approval before commit.
- Each phase ends with a commit and push to `dev` after verification and explicit approval.
- If a phase is only partially done, call it a partial pass, not complete.

## Phase 1: Backend Access & Data Boundaries

Status: Complete.

Scope:

- `convex/workflows.ts`
- Remaining sensitive parts of `convex/users.ts`
- `convex/analytics.ts`
- `convex/knowledge.ts`
- Any remaining repeated auth helpers

Goal:

- Use shared helpers from `convex/authz.ts`.
- Reduce repeated `getAuthUserId` and role-check logic.
- Preserve tenant isolation and existing error behavior.
- Add or strengthen BOLA/security tests where needed.

Checks:

- Focused Convex tests.
- `npm run check`.

Completed commits:

- `eb68c5b Complete backend access boundary cleanup`

## Phase 2: Backend Service Boundaries

Status: Complete.

Scope:

- Large workflow logic.
- Knowledge/web ingestion helpers.
- Analytics calculations.
- Chat/admin backend helpers.

Goal:

- Smaller handler functions.
- Shared utilities for repeated query/filter patterns.
- Less duplicated business logic.
- Easier future-agent handover.
- No behavior change intended.

Already completed as a partial backend service-boundary pass:

- Extracted analytics range/timeline helpers.
- Extracted workflow schedule helpers.
- Extracted purge schedule helpers.
- Extracted workflow runtime pure helpers.

Partial commit:

- `4950f44 Extract backend service helpers`

Remaining checklist:

- [x] Audit `convex/chat.ts` for handler-level business logic that can move into helpers.
- [x] Extract chat attachment/message/thread helper logic where safe.
- [x] Add focused tests for extracted chat helpers.
- [x] Audit knowledge/web ingestion paths for helper extraction opportunities.
- [x] Audit admin-facing backend modules for repeated query/filter/business patterns.
- [x] Extract shared admin/backend helper logic where repetition is clear.
- [x] Add focused tests for extracted admin/backend helpers.
- [x] Confirm no movement demo files changed.
- [x] Run focused backend tests.
- [x] Run `npm run check`.
- [x] Run `npm run build` if the sweep touches generated API/type boundaries or broad app code.
- [x] Provide diff summary for user review.
- [x] Wait for explicit `commit` approval.
- [x] Push to `dev` after explicit phase-end push approval.

Completed commits:

- `04f3790 Complete backend service boundary cleanup`

## Phase 3: Frontend Admin Maintainability

Status: Complete.

Scope:

- Admin tables.
- Search/pagination/filter patterns.
- Repeated loading/empty/error states.
- Repeated mutation toast/feedback flows.

Goal:

- Reuse existing `AdminTable` and pagination utilities.
- Reduce repeated page boilerplate.
- Keep the current UI look and layout.
- Avoid movement demo pages.

Already completed as a partial frontend utility pass:

- Added shared `src/lib/errors.ts`.
- Added shared `src/lib/dates.ts`.
- Replaced repeated error/date formatting across touched admin/app surfaces.

Partial commit:

- `e24ab78 Consolidate client formatting helpers`

Remaining checklist:

- [x] Identify admin pages still duplicating table shell markup.
- [x] Move at least two more admin pages onto existing `AdminTable` primitives.
- [x] Consolidate repeated search/filter/page reset patterns.
- [x] Consolidate repeated loading rows, empty rows, and error states.
- [x] Consolidate repeated mutation feedback flows where safe.
- [x] Keep visual layout and current UI direction intact.
- [x] Add or update focused UI tests for touched shared patterns.
- [x] Confirm no movement demo files changed.
- [x] Run focused UI tests.
- [x] Run `npm run check`.
- [x] Run `npm run build`.
- [x] Provide diff summary for user review.
- [x] Wait for explicit `commit` approval.
- [x] Push to `dev` after explicit phase-end push approval.

Completed commit:

- Phase 3 frontend admin maintainability sweep.

## Phase 4: App UX Reliability Sweep

Status: Complete.

Scope:

- Loading states.
- Empty states.
- Error handling.
- Disabled states during mutations.
- Stale query/search behavior.
- Destructive action confirmation patterns.

Goal:

- Same design, sturdier behavior.
- Fewer inconsistent edge cases between pages.

Checklist:

- [x] Audit stale search/query behavior across admin and app pages.
- [x] Audit destructive actions for consistent confirmation and disabled states.
- [x] Audit loading/empty/error states for user-facing dead ends.
- [x] Fix grouped reliability issues without redesigning the app.
- [x] Add or update tests for important changed flows.
- [x] Confirm no movement demo files changed.
- [x] Run `npm run check`.
- [x] Run `npm run build`.
- [x] Provide diff summary for user review.
- [x] Wait for explicit `commit` approval.
- [x] Push to `dev` after explicit phase-end push approval.

Completed commit:

- Phase 4 app UX reliability sweep.

## Phase 5: Test & Drift Guardrails

Status: Complete.

Scope:

- BOLA tests.
- Admin page tests.
- Shared component tests.
- Quality drift tests.
- Lint rules already promoted to hard errors.

Goal:

- Add coverage around the most important app risks.
- Prevent pagination/search/auth patterns from drifting again.
- Keep `npm run check` meaningful.

Checklist:

- [x] Add or strengthen BOLA/security tests around high-risk backend paths.
- [x] Add admin page tests for shared table/search/pagination patterns.
- [x] Add shared component tests where repeated primitives carry behavior.
- [x] Add quality drift tests for rules we want future agents to respect.
- [x] Confirm promoted lint rules remain hard errors and clean.
- [x] Confirm no movement demo files changed.
- [x] Run `npm run check`.
- [x] Run `npm run build`.
- [x] Provide diff summary for user review.
- [x] Wait for explicit `commit` approval.
- [x] Push to `dev` after explicit phase-end push approval.

Completed commit:

- Phase 5 test and drift guardrails.

## Phase 6: Final Hardening Before Push

Status: Complete.

Only run when the cleanup is complete and the user is ready for final review.

Run:

```bash
npm run check
npm run build
npm audit --audit-level=high
```

Optional local smoke test:

```bash
npm run dev
npm run convex:dev
```

Then:

- [x] Review full diff.
- [x] Agree commit grouping.
- [x] Wait for explicit `commit` approval.
- [x] Wait for explicit `push` approval to `dev`.
- [x] Only merge/push `main` when the user explicitly approves live deploy.

Phase 6 verification completed:

- `npm run check`
- `npm run build`
- `npm audit --audit-level=high`
- Local app smoke on `localhost:3000/login`
- Convex dev readiness smoke
- `main` push completed after explicit user approval for deploy testing.

## Recommended Execution Order

1. Backend access/data boundaries.
2. Backend service boundaries.
3. Frontend admin maintainability.
4. UX reliability sweep.
5. Test/drift hardening.
6. Final build/push review.
