# Post Scale Hardening Plan

This plan tracks the remaining belt-and-braces work after the analytics and platform scale-hardening phases completed. These items are not blockers for ordinary product use. They are follow-up work to make production operation, workflow scale, and dependency health even stronger.

Follow this plan in order unless the user explicitly changes priority.

## Current Position

Sonae has already completed the main scale-hardening work:

- Analytics, AI running costs, admin dashboards, and company dashboards are snapshot-first or bounded by indexed overlays.
- Admin inventory surfaces use paginated, indexed, server-filtered reads.
- Knowledge, chat logs, workflow runtime paths, inventory/MRR rollups, configuration catalogues, and legacy/debug modules have been scale hardened.
- Drift tests now protect broad reads, tenant boundaries, admin pagination, provider-neutral platform language, chart stability, no-native-dialog rules, locale parity, and deleted legacy modules.

This plan is for the remaining operational and maturity work only.

## Non-Drift Rules

- Do not reopen completed scale phases unless a test, production issue, or explicit user request requires it.
- Keep daily development on `dev`; push `main` only when the user asks.
- Keep movement demo files frozen unless explicitly requested or a quality gate is broken by them.
- Keep model selection configuration-driven.
- Preserve tenant isolation and admin versus super-admin boundaries.
- Any workflow runtime change must keep invalid payloads failing clearly and safely.
- Any dependency change that touches auth must be treated as higher risk and tested with magic-link login.

## Phase 1: Production Smoke And Rollup Backfill

Goal: confirm the deployed app behaves correctly after the scale work and seed the new inventory rollup for existing production data.

Tasks:

- Confirm the `main` deployment completes successfully.
- Smoke test:
  - magic-link login,
  - admin analytics charts,
  - AI running costs,
  - company dashboard,
  - admin pagination/load-more,
  - widget chat.
- Run the one-time production inventory backfill:
  - `inventoryRollups.rebuildGlobalInventoryRollup`
- Verify the admin overview values line up with existing companies, users, plans, and MRR.
- Record any production-only issue before starting implementation work.

Acceptance:

- Production login and core dashboards work.
- Inventory/MRR values are present after the rollup backfill.
- No production smoke issue is left undocumented.

Status:

- Pending production smoke and backfill after the target deployment is available.

## Phase 2: Workflow Database Node Query Contract

Goal: replace the current safe 100-row cap on workflow database SELECT nodes with an explicit indexed query contract.

Why:

- The current cap prevents runaway reads, so it is safe.
- The stronger long-term shape is to make workflow database nodes declare exactly which indexed table/query path they are allowed to use.

Tasks:

- Audit current workflow database-node usage and UI expectations.
- Define a typed SELECT contract with:
  - allowed table,
  - required index or approved query mode,
  - equality filters,
  - optional bounded range filters,
  - explicit sort direction,
  - required result limit.
- Reject unindexed or unconstrained SELECT operations at validation/runtime boundaries.
- Update the workflow builder UI only where needed to collect the safer query fields.
- Keep backward compatibility or provide a migration path for existing workflows.
- Add tests for valid indexed SELECT nodes, rejected unindexed nodes, tenant scoping, and result limits.

Acceptance:

- Workflow database SELECT cost is tied to explicit indexed contracts.
- Existing safe workflows keep working or fail with a clear repair path.
- Workflow runtime tests cover the new contract.
- `npm run check` and workflow-focused tests pass.

Status:

- Completed locally in the product-core hardening pass:
  - database SELECT nodes now require either a direct document ID or an explicit indexed query contract,
  - indexed SELECT contracts include table, index name, equality filters, sort order, and bounded limit,
  - runtime rejects unindexed SELECT list reads instead of falling back to broad reads,
  - non-super-admin workflow SELECTs remain tenant scoped,
  - the workflow builder exposes indexed SELECT controls for supported workflow tables,
  - regression tests cover accepted indexed SELECTs, rejected blank SELECTs, and foreign-company query rejection.

## Phase 3: Scheduler `nextRunAt` Optimization

Goal: make schedule dispatch proportional to due schedules if schedule volume becomes high.

Why:

- The scheduler is already improved because it reads active schedules in bounded batches.
- At larger volume, storing `nextRunAt` lets the dispatcher read only schedules that are actually due.

Tasks:

- Add `nextRunAt` to scheduled workflow rows.
- Backfill or lazily initialize `nextRunAt` for existing active schedules.
- Update schedule create/update/resume paths to compute the next run time.
- Change dispatcher reads to use an active/due index.
- After each dispatch, compute and store the following `nextRunAt`.
- Add tests for due, future, disabled, and recurring schedules.

Acceptance:

- Dispatcher reads only due active schedules.
- Recurring schedules continue to advance correctly.
- Existing schedule behavior remains stable.

Status:

- Completed in the product-core hardening pass:
  - added optional `nextRunAt` to schedules and indexed active schedules by next run time,
  - schedule create/update/toggle and workflow trigger sync now compute `nextRunAt`,
  - dispatcher reads active due schedules through `by_active_next_run`,
  - dispatcher advances `nextRunAt` after each run and lazily backfills old active schedules included by the due index,
  - legacy monthly schedule strings now resolve to a bounded interval instead of getting stranded,
  - regression tests cover next-run calculation, schedule write paths, due dispatch, and future schedule exclusion.

## Phase 4: Dependency And Deprecation Cleanup

Goal: reduce dependency age and deprecation warnings without destabilizing auth or deployment.

Tasks:

- Inventory current install/build deprecation warnings.
- Split dependencies into:
  - low-risk utility upgrades,
  - transitive dependency warnings,
  - auth/session-impacting packages,
  - CI/build-system packages.
- Upgrade low-risk packages first.
- Treat `lucia` or auth-library migration as a separate auth project, not a casual dependency bump.
- Run the full production gate after each meaningful batch.

Acceptance:

- No high-severity audit issues.
- Deprecated utility packages are reduced where practical.
- Auth-touching dependency changes include magic-link login tests and manual smoke checks.

Status:

- Completed direct low-risk cleanup in the product-core hardening pass:
  - upgraded safe patch/minor direct dependencies: `next`, `@next/third-parties`, `eslint-config-next`, `convex`, `@types/react`, `@xyflow/react`, `framer-motion`, `lucide-react`, `resend`, `react`, and `react-dom`,
  - kept React and React DOM exact-pinned at the upgraded patch version,
  - confirmed `npm audit --audit-level=high` reports zero vulnerabilities,
  - inventoried remaining deprecated packages as transitive dependencies rather than direct app dependencies.
- Deferred intentionally:
  - `lucia` remains transitive through `@convex-dev/auth`; replacing it is an auth migration project and must include magic-link/session regression coverage,
  - old `glob`, `rimraf`, `fstream`, and `inflight` remain transitive through `exceljs`; removing them requires replacing or deeply upgrading spreadsheet/export tooling,
  - `lodash.isequal` remains transitive through `apify-client` and `exceljs`,
  - `node-domexception` remains transitive through Google auth/fetch dependencies,
  - major upgrades for `@google/genai`, `eslint`, `jsdom`, and Node types are deferred to separate compatibility passes.

## Verification Checklist

For implementation phases, run:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

Before pushing to `main`, also run:

```bash
npm audit --audit-level=high
npm run lint
npm run typecheck
npm run test:run
npm run build
```

If the local frontend is running on port 3000, stop it before `npm run build`, then restart:

```bash
npm run dev
npm run convex:dev
```

## Recommended Order

1. Phase 1: production smoke and rollup backfill.
2. Phase 2: workflow database-node indexed query contract.
3. Phase 3: scheduler `nextRunAt` optimization, only when schedule volume justifies it.
4. Phase 4: dependency cleanup, with auth migration treated as its own project if needed.
