> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Analytics Scale Optimization Plan

This is the source-of-truth plan for scaling Hakken analytics, admin dashboards, AI running costs, and company dashboards. Follow this order unless the user explicitly changes scope.

The intent is not to make the dashboards merely faster for the current data size. The intent is to make their cost predictable as Hakken grows: historical data should come from snapshots, live data should be bounded by indexed ranges, and tenant isolation must remain non-negotiable.

## Scope

This plan covers:

- Global admin analytics dashboard.
- Global AI running-costs dashboard.
- Company analytics dashboard.
- Company settings usage dashboard.
- User cost overview pages.
- Daily analytics snapshot generation.
- Message and transaction analytics data shape.
- Regression tests and drift checks that protect scale-sensitive behavior.

This plan does not cover:

- Product redesign of dashboard UI.
- Movement demo code.
- Model provider selection refactors except where analytics cost calculation needs existing configuration.
- Billing product strategy, pricing tiers, or invoice generation.

## Non-Drift Rules

- Preserve tenant isolation. Company admins must never see another company's analytics.
- Prefer snapshot and aggregate reads over raw message scans.
- Keep dashboard queries bounded by indexed ranges.
- Do not rely on `take(10000)` as a scale strategy.
- Keep live-day calculations small; historical data should come from snapshots.
- Avoid duplicating cost math across dashboard paths when a shared helper can carry it.
- Do not weaken audit, auth, or role checks to improve dashboard speed.
- Keep movement demo code frozen unless a quality gate is broken by it.
- Keep AI model cost resolution configuration-driven. Do not hardcode runtime model literals.
- Add or update tests in the same change set as each scale-sensitive behavior change.

## Current Baseline

Current dashboard entry points:

- Global admin dashboard uses `api.analytics.getGlobalAnalytics`.
- Global AI running costs uses `api.analytics.getGlobalAnalytics`.
- Company dashboard uses `api.analytics.getCompanyMetrics`.
- Company settings dashboard uses `api.analytics.getCompanyMetrics`.
- User cost overview uses `api.analytics.getUserCostOverview`.
- Daily snapshots are generated through `convex/analyticsCron.ts`.

Current durable data:

- `analyticsDailySnapshots` stores daily global, company, and user summaries.
- `messages` stores chat messages and token metadata.
- `agentTransactions` stores agent/workflow transaction metadata.
- `threads` stores the historical link from messages to company/user/agent/widget context.

Current completed improvements:

- New message rows carry denormalized analytics dimensions:
  - `companyId`
  - `userId`
  - `agentId`
  - `widgetId`
- Message indexes now support company/user/agent live reads by role and created date.
- `agentTransactions` has a direct created-at index for global time-window reads.
- Global and company snapshot reads are bounded by indexed date ranges.
- Company live analytics uses the company-indexed message fast path.
- Production and dev historical message rows have been backfilled and validated.
- The temporary live-message legacy thread-join fallback has been removed from dashboard analytics paths.
- Historical message dimension backfill functions exist with dry-run, pagination, validation, and mismatch reporting.
- Dev message dimension backfill has been run and validated cleanly.
- Global analytics cost data is separated from broad platform inventory metrics through `getGlobalInventoryMetrics`.
- Drift tests protect `getGlobalAnalytics` from broad user/company/agent/thread/plan scans.
- User cost aggregates are separated from paginated thread-level cost details.
- Dashboard chart panels have stable explicit heights so Recharts renders reliably after responsive layout changes.

Current remaining scale risks:

- Some live analytics paths still load broad `threads`, `users`, `companies`, or `agents` sets to enrich leaderboards.
- Several reads still have `take(10000)` limits as temporary safety rails, not true scale design.
- Query-drift monitoring is automated, and production data-health visibility is surfaced through the admin UI and platform alerts.

## Target Architecture

The target architecture is snapshot-first with a live-day overlay.

Historical data:

- Any day before today should be read from `analyticsDailySnapshots`.
- Historical totals, token usage, costs, active users, model distribution, and leaderboards should come from snapshot records.
- Dashboard cost should be proportional to requested days, not raw event volume.

Live data:

- Today's activity can be computed from raw `messages` and `agentTransactions`.
- Live reads must use date-bounded indexes.
- Company/user/agent/widget dimensions must be available directly on live rows.
- Live analytics should not join threads for message dimensions; platform alerts should catch missing or mismatched dimensions.

Metadata:

- Names, avatars, logos, and company labels should be fetched through bounded lookup sets.
- Leaderboards should store enough display information in snapshots to avoid loading all users, companies, agents, and threads for every dashboard request.

Cost calculation:

- Use `convex/analyticsService.ts` helpers for cost context and aggregation behavior.
- Continue resolving costs from stored model configuration.
- Keep GBP conversion behavior consistent across snapshot and live overlay paths until a wider billing/currency refactor is explicitly planned.

## Data Model Direction

Message rows should become the primary live analytics source for assistant chat interactions.

Required message analytics fields:

- `companyId`: tenant owning the interaction.
- `userId`: authenticated user or widget-associated user where available.
- `agentId`: agent that generated the response, if applicable.
- `widgetId`: widget source, if applicable.
- `role`: existing role field.
- `createdAt`: existing timestamp field.
- `inputTokens`, `outputTokens`, `modelUsed`: existing cost fields.
- `analyticsDimensionsVersion`: marker proving the analytics dimensions have been written or backfilled.

Required live-message indexes:

- `companyId + role + createdAt`
- `userId + role + createdAt`
- `agentId + role + createdAt`
- Existing `role + createdAt` remains useful for global live overlays.
- `createdAt` supports table-wide backfill and validation pagination.

Transaction rows should support:

- Global date-window reads by `createdAt`.
- Company date-window reads by `companyId + createdAt`.
- Agent date-window reads by `agentId + createdAt`.

Snapshot rows should support:

- Global date-window reads by `type + date`.
- Company date-window reads by `companyId + date`.
- User date-window reads by `userId + date`.
- Day-specific maintenance by `date`.

## Phase 1: Bound Existing Reads

Goal: reduce avoidable full-window scans without changing dashboard behavior.

Tasks:

- Bound global snapshot reads by `type + date`.
- Bound company snapshot reads by `companyId + date`.
- Add a direct `agentTransactions.createdAt` index.
- Use the created-at index for global live transaction reads.
- Use the created-at index during daily snapshot generation.
- Keep existing dashboard response shape stable.

Acceptance:

- `getGlobalAnalytics` and `getCompanyMetrics` do not fetch all snapshots before filtering by date.
- Global live transaction reads use an index.
- Daily snapshot generation uses an indexed transaction read.
- Existing analytics totals remain stable.
- Analytics-focused tests pass.

Status:

- Completed initial indexed snapshot bounds for global and company analytics.
- Completed created-at indexing for global `agentTransactions` live reads and daily snapshot generation.
- Focused analytics tests cover preserved totals.

## Phase 2: Denormalize Message Analytics Dimensions

Goal: make live company, user, agent, and widget analytics queryable without broad thread joins.

Tasks:

- Add optional analytics fields to `messages`:
  - `companyId`
  - `userId`
  - `agentId`
  - `widgetId`
- Add message indexes for common live analytics reads:
  - company + role + createdAt
  - user + role + createdAt
  - agent + role + createdAt
- Write analytics dimensions when inserting user messages.
- Write analytics dimensions when inserting assistant messages.
- Include dimensions on quota rejection messages.
- Use message analytics dimensions directly after backfill validation.
- Update tests so the write path is protected.

Acceptance:

- New user and assistant message inserts carry analytics dimensions.
- Company dashboard can read live assistant messages by company index.
- Historical rows are counted through message analytics dimensions after backfill.
- Tests cover denormalized message writes.

Status:

- Completed optional message analytics fields and company/user/agent message indexes.
- Completed dimension writes for user and assistant chat messages.
- Completed `analyticsDimensionsVersion` marker for new and backfilled messages.
- Completed company live-message fast path and removed the temporary legacy fallback after production validation.

## Phase 3: Backfill Historical Message Dimensions

Goal: remove dependence on thread joins for old message rows.

Tasks:

- Add an internal paginated backfill mutation.
- Read messages missing one or more analytics dimensions in bounded batches.
- Resolve dimensions from the owning thread.
- Patch only missing analytics fields.
- Make the mutation idempotent.
- Return progress data:
  - scanned count
  - patched count
  - skipped count
  - next cursor or completion marker
- Add a small operational note for how to run the backfill safely.
- Add tests for idempotency and tenant-correct dimension assignment.

Acceptance:

- Backfill can stop and resume safely.
- Backfill does not overwrite already-correct analytics dimensions.
- No tenant data changes except filling message dimensions from the owning thread.
- Legacy fallback removal has a documented completion condition.

Status:

- Completed internal paginated backfill mutation in `convex/analyticsCron.ts`.
- Completed internal paginated validation query in `convex/analyticsCron.ts`.
- Completed dry-run support.
- Completed mismatch reporting for rows with already-filled dimensions that differ from the owning thread.
- Completed idempotency and non-destructive regression tests.
- Dev execution completed on June 2, 2026: 171 messages patched, 0 missing dimensions, 0 mismatches, 0 missing threads after validation.
- Production execution completed on June 2, 2026: 104 messages patched, 0 missing dimensions, 0 mismatches, 0 missing threads after validation.

Operational runbook:

1. Dry-run the first batch in the target environment:

   ```bash
   npx convex run analyticsCron:backfillMessageAnalyticsDimensions '{"paginationOpts":{"numItems":100,"cursor":null},"dryRun":true}'
   ```

2. If the dry-run counts look sensible, run the first real batch:

   ```bash
   npx convex run analyticsCron:backfillMessageAnalyticsDimensions '{"paginationOpts":{"numItems":100,"cursor":null}}'
   ```

3. Continue with the returned `continueCursor` until `isDone` is `true`:

   ```bash
   npx convex run analyticsCron:backfillMessageAnalyticsDimensions '{"paginationOpts":{"numItems":100,"cursor":"RETURNED_CURSOR"}}'
   ```

4. Validate in batches until `isDone` is `true`:

   ```bash
   npx convex run analyticsCron:validateMessageAnalyticsDimensions '{"paginationOpts":{"numItems":100,"cursor":null}}'
   ```

5. Investigate non-zero `missingThreads` or `mismatched` counts before removing legacy fallback.

Operational notes:

- `dryRun: true` reports patch candidates but does not mutate messages.
- The backfill patches only fields that are missing and available on the owning thread.
- The backfill stamps `analyticsDimensionsVersion: 1` on rows it successfully validates against a thread.
- The backfill does not overwrite existing analytics dimensions, even if they mismatch the thread. Mismatches are reported for manual investigation.
- Messages whose threads no longer exist are reported as `skippedMissingThread` or `missingThreads`.
- Use smaller `numItems` if Convex transaction limits or deployment latency become a concern.

Backout:

- Because this only fills optional fields from existing thread ownership, backout should not normally be needed.
- If a bug is found before fallback removal, stop the backfill immediately and keep legacy fallback enabled.
- Add a repair mutation only if incorrect fields were written.

Removal condition for legacy fallback:

- Backfill has completed.
- A validation query reports zero messages missing required analytics dimensions for threads that still exist.
- Snapshot generation has run successfully after backfill.
- Company/global analytics tests pass without the fallback path.

Removal status:

- Completed after production validation on June 2, 2026.
- Production backfill patched 104 messages.
- Production validation reported 0 missing dimensions, 0 mismatches, and 0 missing threads.

## Phase 4: Snapshot-First Dashboards

Goal: make admin and company dashboards cost proportional to requested days plus today's live events.

Tasks:

- Split analytics aggregation into explicit historical and live overlay steps.
- Read historical global totals from global snapshots.
- Read historical company totals from company snapshots.
- Read historical user totals from user snapshots.
- Keep today's overlay from indexed live `messages` and `agentTransactions`.
- Avoid loading all `threads` for global analytics.
- Avoid loading all `users`, `companies`, and `agents` unless the requested leaderboard requires them.
- Prefer snapshot-stored leaderboard display fields where possible.
- Create shared helpers for:
  - snapshot date-window reads
  - live message reads
  - live transaction reads
  - merging historical + live totals
  - model distribution aggregation

Acceptance:

- Historical dashboard work is bounded by number of requested days.
- Live dashboard work is bounded by today's indexed rows.
- Leaderboards are assembled from snapshots and small metadata lookups.
- Dashboard response shapes remain compatible with existing React pages.
- Tests cover snapshot + live overlay behavior for global and company analytics.

Backout:

- Keep the old aggregation code path available during implementation only if needed for test comparison.
- Do not ship a runtime flag unless the user explicitly asks.
- If totals diverge, fix the merge logic before continuing to later phases.

Status:

- Completed initial bounded live-overlay refactor.
- Global analytics no longer loads threads for live message dimension enrichment.
- Company analytics no longer loads threads for live message dimension enrichment.
- Global and company analytics no longer load all agents before rendering leaderboards; they hydrate snapshot-provided agents and live-observed agents only.
- User and company table loads remain because current response fields still expose total provisioned users, total provisioned companies, MRR, and plan distribution.
- Completed initial inventory split: `getGlobalAnalytics` handles analytics/costs, while `getGlobalInventoryMetrics` handles MRR, plan distribution, and total provisioned company/user counts.

## Phase 5: User Cost Pages

Goal: avoid nested `threads x messages` scans.

Tasks:

- Use user snapshots for historical user cost totals.
- Use `messages.by_user_role_created` for live-day assistant costs.
- Paginate thread-level detail separately from aggregate totals.
- Keep thread details available, but do not compute all details for every page load.
- Add tests for company admin access boundaries and super-admin cross-company access.

Acceptance:

- User cost overview no longer reads every message in every thread for aggregate totals.
- Thread details remain available through explicit pagination.
- Tenant authorization behavior is unchanged.
- Tests prove totals match previous behavior for representative data.

Status:

- Completed aggregate/detail split.
- `getUserCostOverview` now returns aggregate totals from user snapshots plus indexed live assistant messages.
- `getUserCostThreads` returns thread-level detail rows through Convex pagination.
- Admin and super-admin user profile cost tabs now load thread detail rows in 15-row chunks.
- Added drift guard preventing `getUserCostOverview` from regressing into per-thread message aggregation.
- Temporary today-only legacy fallback was removed after production message dimension backfill validation.

## Phase 6: Dashboard Metadata And Leaderboard Scaling

Goal: avoid loading all users, companies, agents, and threads just to render names and avatars.

Tasks:

- Store stable display fields in snapshot leaderboards:
  - user name
  - user email
  - user image
  - company name
  - company logo
  - agent name
  - agent avatar
- For live-day leaderboards, resolve only IDs observed in the live window.
- Add helper functions for bounded ID lookups.
- Preserve fallback labels for deleted users, companies, or agents.
- Add tests for deleted or missing metadata records.

Acceptance:

- Global analytics no longer needs to load every user/company/agent for ordinary dashboard rendering.
- Company analytics resolves only company-scoped or live-observed metadata.
- Missing metadata does not crash the dashboard.

Status:

- Completed initial snapshot metadata hardening for company analytics:
  - Historical company top users initialize from stored snapshot metadata even when the user record is missing or no live-day usage exists.
  - Company snapshot agent leaderboards now preserve stored agent avatars.
- Remaining work is to expand metadata drift checks and review any remaining dashboard paths outside `getGlobalAnalytics` and `getCompanyMetrics`.

## Phase 7: Monitoring And Drift Tests

Goal: catch analytics scale regressions before review.

Tasks:

- Add static drift checks for known bad patterns in analytics files.
- Flag unbounded `agentTransactions` reads in dashboard and snapshot paths.
- Flag snapshot reads that fetch all rows before date filtering.
- Flag new dashboard analytics code that scans all messages without indexed date bounds.
- Add tests for snapshot date bounds.
- Add tenant-isolation tests for company analytics queries.
- Add a documented exception mechanism for intentional migrations/backfills.

Acceptance:

- Analytics query drift is caught by `npm run check`.
- Scale-sensitive query patterns are documented and tested.
- Exceptions require a short explanation in the check allowlist.

Status:

- Completed first drift guard for `getGlobalAnalytics` broad inventory/table scans.
- Added drift guards for:
  - indexed `agentTransactions` reads in dashboard and snapshot paths
  - date-bounded snapshot reads in dashboard aggregation paths
  - indexed live message overlays
  - explicit allowlisted reasons for remaining broad analytics scans
- Removed the `getGlobalAICosts` all-thread scan by using message analytics dimensions directly.
- Removed the `getPlatformOverview` all-user/all-thread scans by making it a bounded recent-cost overview and leaving exact inventory counts to `getGlobalInventoryMetrics`.
- Removed daily snapshot metadata scans by hydrating only users, companies, agents, and threads observed in the snapshot activity window.
- Remaining drift work should remove or narrow temporary broad-scan exception entries after their refactors land.

## Phase 8: Operational Readiness

Goal: make analytics scale safe to run and maintain in production.

Tasks:

- Document snapshot generation schedule and expected behavior.
- Document manual snapshot backfill commands.
- Document message-dimension backfill commands.
- Add sanity checks for duplicate snapshots.
- Add sanity checks for missing snapshots.
- Add a dashboard/data-health view or internal query for:
  - snapshot coverage by date
  - messages missing analytics dimensions
  - live-day event counts
  - snapshot generation status
- Decide whether to alert on failed snapshot generation.

Acceptance:

- A future operator can understand how to repair missing analytics data.
- Snapshot gaps are detectable.
- Message dimension backfill progress is visible.
- Production support does not require reading source code first.

Status:

- Added `analyticsCron:getAnalyticsDataHealth` as an internal bounded health query.
- The health query reports checked snapshot dates, missing global snapshot dates, duplicate snapshot groups, recent message-dimension gaps, recent dimension mismatches, missing threads, and today's live assistant-message and agent-transaction counts.
- Added regression coverage for snapshot gaps, duplicate snapshots, dimension drift, and live-day counts.
- Ran the health query in dev on June 2, 2026. It detected 6 recent messages missing analytics dimensions before backfill and 0 after backfill.
- Confirmed the admin dashboard charts render again after replacing percentage-height chart containers with explicit numeric Recharts heights and fixed-height wrappers.
- Added `analyticsCron:getAnalyticsDataHealthForAdmin` as a super-admin-only public query for the admin UI.
- Added an Analytics Data Health panel to `/admin/settings/analytics`.
- Added focused tests for healthy and warning panel states, plus backend authorization coverage.
- Added `analyticsCron:dispatchPlatformAlerts` as a daily internal action that emails operators when platform alert thresholds trip.
- Added `dispatch-platform-alerts`, scheduled daily at 00:25 UTC after the daily snapshot generator.
- Added `convex/platformAlertService.ts` so analytics health is the first reusable platform alert type instead of a one-off analytics-only alert path.
- Added pure platform-alert decision tests for healthy reports, snapshot drift, dimension drift, escaped email rendering, and recipient parsing.
- Remaining Phase 8 work is to configure production recipients and validate one live alert cycle after deployment.

Operational check:

```bash
npx convex run analyticsCron:getAnalyticsDataHealth '{"daysBack":7}'
```

If `snapshotCoverage.missingGlobalDates` is not empty, run `analyticsCron:generateDailySnapshots` for each missing date after confirming the date is safe to regenerate.

If `snapshotCoverage.duplicateSnapshotGroups` is not empty, investigate before deleting anything. Duplicates indicate a guard failure or manual data repair.

If `messageDimensions.missingDimensions` is not zero, run the documented message-dimension dry run, then backfill, then validate again.

If `messageDimensions.mismatched` is not zero, do not overwrite automatically. Review the example message IDs because mismatches can indicate historical tenant attribution issues.

Platform alert configuration:

- `PLATFORM_ALERT_EMAILS`: comma-separated operator recipients.
- `PLATFORM_ALERT_EMAIL`: single-recipient fallback.
- `ANALYTICS_ALERT_EMAILS` and `ANALYTICS_ALERT_EMAIL`: deprecated compatibility fallbacks.
- `INITIAL_SUPER_ADMIN_EMAIL`: final fallback if no platform-specific recipient is configured.
- `RESEND_API_KEY`: required for real dispatch. Without it, alert dispatch is simulated and logged.
- `RESEND_FROM_EMAIL`: optional sender override.

Alert thresholds:

- `snapshotCoverage.missingGlobalDates.length > 0`
- `snapshotCoverage.duplicateSnapshotGroups.length > 0`
- `messageDimensions.missingDimensions > 0`
- `messageDimensions.mismatched > 0`
- `messageDimensions.missingThreads > 0`

## Phase Completion Matrix

| Phase | Status | Primary Files | Required Tests |
| --- | --- | --- | --- |
| Phase 1: Bound Existing Reads | Completed initial slice | `convex/analytics.ts`, `convex/analyticsCron.ts`, `convex/schema.ts` | Analytics and cron snapshot tests |
| Phase 2: Message Dimensions | Completed initial slice | `convex/chat.ts`, `convex/schema.ts`, `convex/analytics.ts` | Chat write-path and company metrics tests |
| Phase 3: Historical Backfill | Production execution complete | `convex/analyticsCron.ts` | Backfill idempotency and validation tests |
| Phase 4: Snapshot-First Dashboards | Initial bounded live-overlay slice complete | `convex/analytics.ts`, shared analytics helpers | Snapshot + live overlay tests |
| Phase 5: User Cost Pages | Initial aggregate/detail split complete | `convex/analytics.ts`, user profile pages | User cost and tenant-boundary tests |
| Phase 6: Metadata Scaling | Initial hardening complete | `convex/analytics.ts`, `convex/analyticsCron.ts` | Missing metadata and leaderboard tests |
| Phase 7: Drift Tests | Initial static guardrail suite complete | `src/quality-drift.test.ts` or companion check | Static query-pattern tests |
| Phase 8: Operational Readiness | Admin health panel and daily alert path complete | docs, admin analytics settings, maintenance queries, crons | Data-health, panel, and alert-decision tests |

## Verification Gates

Run these for every phase:

```bash
npm run lint:all
npm run check
git diff --check
```

Run this when changing schema, dashboard runtime behavior, or Convex query/mutation code:

```bash
npm run build
```

Run focused tests before broad gates:

```bash
npm run test:run -- convex/chat.test.ts convex/analytics.test.ts convex/analyticsCron.test.ts
```

Before a production push, follow the repo-level gate from `AGENTS.md` and include:

```bash
npm audit --audit-level=high
npm run lint:all
npm run check
npm run build
git diff --check
```

## Tenant Isolation Checklist

Every analytics change must answer yes to these questions:

- Does every company-admin query scope by the admin's company?
- Can a company admin request another company's analytics?
- Can a standard user access admin analytics?
- Can a deleted or missing company/user/agent leak data from another tenant?
- Are global analytics endpoints still super-admin only?
- Do tests cover at least one unauthorized company-admin path?

## Performance Checklist

Every analytics change must answer yes to these questions:

- Is the query bounded by an index where possible?
- Is historical data read from snapshots instead of raw messages?
- Is live data limited to today or the explicit requested window?
- Are broad `take(10000)` reads removed, reduced, or documented as temporary?
- Are metadata lookups limited to observed IDs instead of whole tables?
- Does the implementation avoid nested per-thread message scans for aggregate totals?

## Data Correctness Checklist

Every analytics change must answer yes to these questions:

- Are assistant messages counted for AI cost metrics and user messages excluded where appropriate?
- Are `agentTransactions` merged without double-counting chat assistant messages?
- Are token totals and cost totals preserved across old and new paths?
- Are snapshots excluded from today's live overlay to prevent double counting?
- Are out-of-range snapshots excluded by date bounds?
- Have historical rows been backfilled and validated before removing fallback paths?

## Change Control

If a future phase changes:

1. Update this document in the same change set.
2. State which phase changed and why.
3. Preserve tenant isolation and snapshot-first direction.
4. Add or update tests for the new behavior.
5. Update the phase completion matrix.

## Next Recommended Slice

The next recommended slice is production readiness for the analytics scale phase.

Deliverables:

- Configure production platform alert recipients.
- Run the production message-dimension dry run.
- Run the production message-dimension backfill if the dry run is sensible.
- Validate production analytics health.
- Confirm the scheduled alert action is visible in Convex deployment logs after one cycle.
- Confirm the next scheduled platform alert cycle stays healthy after fallback removal.
