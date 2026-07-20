> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Final Scale Readiness Plan

This plan captures the last items found during the June 2, 2026 readiness review. The goal is to make the app genuinely ready for the next refactor and for a controlled scale-up to thousands of users without introducing unnecessary operational noise.

Follow this plan in order unless the user changes priority.

## Current Baseline

Verified locally on `dev`:

- `npm run check` passes:
  - quiet lint,
  - TypeScript,
  - `560` Vitest tests across `131` files.
- `npm run build` passes.
- `npm audit --audit-level=high` reports `0` vulnerabilities.
- `git diff --check` passes.
- The working tree is clean.

Warning baseline:

- `npm run lint:all` reports `0` warnings and `0` errors.

## Non-Drift Rules

- Keep daily development on `dev`.
- Do not push to `main` unless the user explicitly asks.
- Keep the movement demo frozen unless a required gate breaks or the user changes scope.
- Keep tenant isolation and admin versus super-admin boundaries intact.
- Keep AI model choices configuration-driven.
- Do not start broad product refactors until the warning cleanup and maintenance-script path are finished or explicitly deferred.

## Phase 1: Clear The Remaining Lint Warnings

Goal: restore `npm run lint:all` to `0` warnings and `0` errors so the docs, quality gate expectations, and actual repo state agree.

Observed warning categories:

- Test mocks for `next/image` rendering raw `<img>` without `alt`.
- Mocked props such as `_unoptimized`, `_initial`, `_animate`, `_exit`, `_layoutId`, and `_transition` being declared but unused.
- E2E Convex mock placeholders such as `_url` and `_functionReference`.

Tasks:

- Replace repeated `next/image` test mocks with a shared test helper where practical.
- Ensure mocked image output includes an `alt` prop or uses a narrowly scoped lint-safe helper.
- Remove or explicitly consume unused mock props without weakening production lint rules.
- Keep changes limited to tests and mocks unless a real production warning appears.
- Update any stale docs that still claim zero warnings only after the command is actually clean.

Acceptance:

- `npm run lint:all` reports `0` warnings and `0` errors.
- `npm run check` passes.
- No production UI behavior changes.

Status:

- Completed. Test image mocks, framer-motion mocks, and E2E placeholder arguments are lint-clean.

## Phase 2: Add Super-Admin Maintenance Scripts

Goal: give less technical operators a safe in-app way to run approved maintenance tasks, starting with the inventory rollup rebuild.

Why:

- The production inventory rollup backfill should not rely on a developer running a terminal command.
- Operators need a clear description of what a maintenance script does, when to run it, what it changes, and whether it is safe to repeat.
- The app should expose only allowlisted maintenance tasks, not arbitrary command execution.

UI shape:

- Add a new super-admin submenu option under System Settings:
  - preferred label: `Maintenance`,
  - acceptable route: `/admin/settings/scripts`.
- The list page should show a searchable admin table with the standard 15 rows per page.
- Clicking a row should open a detail page for that script.
- The detail page should include:
  - what the script does,
  - when to run it,
  - what records or metrics it changes,
  - whether it is safe to run more than once,
  - expected duration,
  - last run result if available,
  - a `Run` button,
  - a back button to the scripts table.

Safety rules:

- Super-admin only.
- No arbitrary command input.
- No dynamic script execution from user-provided strings.
- Use an allowlisted registry of maintenance script IDs.
- Use an in-app confirmation modal before running a script.
- Disable the run button while a script is running.
- Show in-app success/error feedback.
- Write an audit log entry for every run attempt and result.
- Do not use native browser dialogs.

First script:

- `inventory-rollup-rebuild`
  - Runs `inventoryRollups.rebuildGlobalInventoryRollup`.
  - Recalculates global company count, user count, plan inventory, and MRR from existing records.
  - Safe to run again if admin overview metrics look stale.

Likely future scripts:

- Regenerate analytics snapshots.
- Backfill message analytics dimensions.
- Re-sync provider model catalogues.
- Repair stale workflow schedules.
- Purge old logs through existing retention rules.

Acceptance:

- Super-admins can find the maintenance scripts page from System Settings.
- The scripts list is searchable and uses shared admin table patterns.
- Script details are clear enough for a non-developer operator.
- The inventory rollup rebuild can be run from the UI.
- Every run is permission-checked, confirmation-gated, and audited.
- `npm run check` passes.

Status:

- Implemented the first maintenance surface:
  - `/admin/settings/scripts`,
  - `/admin/settings/scripts/[scriptId]`,
  - System Settings sidebar entry labelled `Maintenance`,
  - allowlisted `inventory-rollup-rebuild` script,
  - run history in `maintenanceScriptRuns`,
  - audit logs for started, succeeded, and failed runs.

## Phase 3: Production Smoke And In-App Inventory Rollup Run

Goal: confirm the deployed app behaves correctly after the scale-hardening work and run the inventory rollup rebuild through the new maintenance UI when needed.

Tasks:

- Confirm the `main` deployment completes successfully.
- Smoke test production:
  - magic-link login,
  - admin analytics charts,
  - AI running costs,
  - company dashboard,
  - admin pagination and load-more,
  - widget chat,
  - assistant chat with a normal text prompt.
- If existing production inventory metrics need seeding or repair, run `inventory-rollup-rebuild` from the new System Settings maintenance page.
- Verify admin overview counts and MRR line up with existing companies, users, and plans.
- Record any production-only issue before starting larger refactors.

Acceptance:

- Production login works.
- Core dashboards render with credible data.
- Inventory and MRR values are present after the in-app maintenance run, if the run was needed.
- Any production-only issue has a documented owner or follow-up.

## Phase 4: Low-Risk Scale Confidence Review

Goal: build confidence in the scale work without running synthetic load tests or creating avoidable AI/provider traffic.

Targets:

- Public widget chat.
- Authenticated assistant chat.
- Admin chat-log browsing.
- Admin analytics and AI cost dashboards.
- Knowledge document upload/list/search.
- Admin inventory pagination.

Tasks:

- Walk the key routes manually in development or production after deployment.
- Watch the Convex dashboard/logs while using the app normally.
- Confirm the key scale guardrails still pass through `npm run check`.
- Review the remaining broad-read allowlist in `src/quality-drift.test.ts` and make sure every remaining exception is still intentional.
- Confirm high-cost AI paths have user-facing limits, quota checks, or provider-side protection.
- Document any known operating limit, such as capped chat history, capped admin search candidates, or provider/API throttling behavior.
- Convert any surprising finding into either a code fix, a drift-test update, or a documented follow-up.

Acceptance:

- No tenant-boundary leak is observed.
- No unclassified broad-read path is introduced.
- The main manual journeys complete without errors.
- Any remaining cap or operating assumption is documented.
- Provider/API throttling behavior is understood well enough for the current launch stage.

## Phase 5: Refactor Readiness Lock

Goal: make sure the larger refactor starts from a stable, documented base.

Tasks:

- Re-run the local release gates:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

- Before a production push, also run:

```bash
npm audit --audit-level=high
npm run lint
npm run typecheck
npm run test:run
npm run build
```

- Confirm the docs agree with the actual command outputs.
- Confirm no movement-demo files changed unless the user explicitly allowed it.
- Confirm any remaining scale caveat is documented here or in `docs/plans/active/post-scale-hardening-plan.md`.

Acceptance:

- The warning backlog is gone or explicitly deferred with a reason.
- Production smoke and any needed in-app maintenance run are complete or deliberately deferred.
- Low-risk scale review findings are either clean or converted into tracked work.
- The user has a clear yes/no decision point before the next major refactor.

## Morning Order

1. Clear the `npm run lint:all` warnings.
2. Run `npm run lint:all`, `npm run check`, `npm run build`, and `git diff --check`.
3. Build the System Settings maintenance scripts page, with inventory rollup rebuild as the first script.
4. If deploying, complete production smoke and run the inventory rollup rebuild from the UI only if needed.
5. Do the low-risk scale confidence review without synthetic load testing.
6. Start the larger refactor only after the findings are clean or intentionally scoped.
