# Analytics Rollups Developer Guide

Analytics rollups are the daily precomputed usage snapshots behind Hakken's admin analytics dashboards and data-health checks. They reduce historical dashboard work by storing global, company, and user summaries in `analyticsDailySnapshots`, while the analytics queries add today's live messages and agent transactions on top.

Read this before changing `convex/analytics.ts`, `convex/analyticsSnapshots.ts`, `convex/analyticsService.ts`, analytics snapshot schema, the analytics data-health checks in `convex/systemHealth.ts`, or the Global Analytics Engine settings page. For system health alerts that consume analytics health, see [System Health And Platform Alerts](./system-health-and-platform-alerts.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/analytics/page.tsx` renders the Global Analytics Engine settings page and analytics data-health summary.
- `convex/analytics.ts` serves admin analytics queries for global costs, platform overview, user costs, company metrics, global inventory metrics, and global analytics.
- `convex/analyticsSnapshots.ts` generates daily snapshots, seeds historical snapshots, and validates/backfills message analytics dimensions.
- `convex/systemHealth.ts` exposes analytics data health.
- `convex/analyticsService.ts` owns timeframe resolution, aggregation grouping, model cost lookup, cost calculation, USD-to-GBP conversion, and metric rounding helpers.
- `convex/crons.ts` schedules `internal.analyticsSnapshots.generateDailySnapshots` daily at 00:05 UTC.

Analytics settings also manage the Google Analytics or Google Tag Manager tracking id through `api.system.getAnalyticsId` and `api.system.updateAnalyticsId`. This guide focuses on usage and cost rollups, not browser tracking injection.

## Data Model

`analyticsDailySnapshots` stores one day's aggregate data. Key fields are:

- `date`: UTC `YYYY-MM-DD`
- `type`: `global`, `company`, or `user`
- optional `companyId` for company snapshots
- optional `userId` for user snapshots
- `metrics.totalMessages`
- `metrics.totalInputTokens`
- `metrics.totalOutputTokens`
- `metrics.costGBP`
- optional `metrics.activeUsersCount`
- optional `uniqueUserIds`
- optional `modelMetrics`
- optional `leaderboards.topAgents`
- optional `leaderboards.topUsers`

Indexes include date, type/date, company/date, and user/date access patterns. Preserve these if dashboard queries are refactored; the current queries intentionally read historical snapshots by date/type and add live data separately.

Snapshots currently persist model distribution through `modelMetrics`, but they do not persist provider distribution. Provider distribution in `getGlobalAnalytics` and `getCompanyMetrics` is built from the live raw-message and agent-transaction overlay for the current day. Do not describe provider distribution as a complete historical rollup until provider metrics are added to snapshots and query aggregation.

## Snapshot Generation

`generateDailySnapshots` is an internal mutation. Without a target date it generates yesterday's UTC snapshot. With `targetDateStr`, it generates the requested `YYYY-MM-DD` UTC window.

The generator:

1. Computes the UTC day start and end.
2. Skips generation when any snapshot already exists for that date.
3. Loads model cost configuration and default model id.
4. Reads up to 10,000 assistant messages in the day.
5. Reads up to 10,000 agent transactions in the day.
6. Creates one empty global snapshot when the day has no messages or agent transactions.
7. Joins threads, users, companies, and agents needed for attribution and leaderboards.
8. Merges assistant messages and agent transactions into a unified interaction stream.
9. Computes global, company, and user aggregates.
10. Inserts one global snapshot, one snapshot per observed company, and one snapshot per observed non-widget user.

The duplicate guard is date-wide: if any snapshot exists for the target date, generation skips the entire date. Do not rely on rerunning `generateDailySnapshots` to repair partial or duplicate rows without first investigating and cleaning the existing data deliberately.

## Attribution Rules

Assistant messages are enriched from their message dimensions first and their thread dimensions as fallback. The generator observes user ids, company ids, agent ids, and widget ids from both messages and their parent threads.

Agent transactions contribute user, company, agent, model, token, and cost activity directly.

The special `system_assistant` id represents the platform assistant when no concrete agent id exists. Widget traffic may roll into a `WIDGET_USER_GROUP` leaderboard entry so external web traffic does not appear as a normal registered user.

User snapshots are only created for interactions with a user id and no widget id. This avoids treating anonymous widget traffic as a user-level snapshot.

## Cost Calculation

`analyticsService.buildModelCostContext` builds a lookup map from `aiModels` by:

- `modelId`
- `providerModelId`
- `providerKey:providerModelId`

`computeCostFromMap` calculates cost from input and output tokens using the configured model rates. Input cost switches to the above-200k rate when input tokens exceed 200,000. Dashboard code converts model costs to GBP using the current fixed `USD_TO_GBP_RATE` of `0.78`.

Keep analytics model choices resolved from stored model configuration. Do not hardcode provider model literals in analytics runtime paths.

## Dashboard Query Pattern

Historical windows combine snapshots with live data.

For days before today, queries read `analyticsDailySnapshots`. For today, queries read raw assistant messages and agent transactions directly. This keeps dashboards current without regenerating snapshots during the day.

Because historical snapshots do not store provider distribution, provider-distribution charts are currently strongest for live-day provider attribution and weaker for long historical windows. Model distribution, costs, leaderboards, messages, tokens, and active users are supported by stored snapshot fields.

Important queries:

- `getGlobalAICosts`: super-admin-only cost timeline from raw assistant messages for the selected timeframe.
- `getPlatformOverview`: super-admin-only 30-day platform summary from recent assistant messages.
- `getUserCostOverview`: admin-scoped user cost overview from user snapshots plus today's live assistant messages.
- `getUserCostThreads`: admin-scoped paginated user thread costs from raw thread messages.
- `getCompanyMetrics`: company-scoped analytics from company snapshots plus today's live messages and transactions.
- `getGlobalInventoryMetrics`: super-admin-only inventory/MRR rollup query backed by inventory rollups.
- `getGlobalAnalytics`: super-admin-only platform analytics from global/company snapshots plus today's live messages and transactions.

The query layer uses `requireAnalyticsSuperAdmin`, `requireAnalyticsAdmin`, user access assertions, and company access assertions. Preserve these checks when moving aggregation code.

## Analytics Data Health

Analytics data health checks whether snapshots and message dimensions are trustworthy enough for dashboard use.

`getAnalyticsDataHealthReport` checks:

- missing global snapshot dates for platform scope
- duplicate snapshot groups by date/type/scope id
- snapshot counts by date
- recent messages missing analytics dimensions
- recent messages whose dimensions mismatch their thread
- recent messages whose thread is missing
- today's live assistant message count
- today's live agent transaction count

`getAnalyticsDataHealthForAdmin` is super-admin-only and powers the analytics settings page. System health uses the same underlying report with platform or company scope.

## Dimension Backfill And Validation

`validateMessageAnalyticsDimensions` scans paginated messages and reports missing dimensions, missing threads, mismatches, examples, cursor state, and completion state.

`backfillMessageAnalyticsDimensions` scans the same pagination shape and patches only missing dimensions that can be inferred from the parent thread. It does not overwrite mismatched dimensions. It supports `dryRun` so operators can preview patch counts before writing.

Use the workflow documented in analytics plans and health runbooks:

1. Validate.
2. Run backfill in dry-run mode.
3. Run backfill for the same page range.
4. Continue with returned cursors until complete.
5. Validate again.

Do not automatically overwrite mismatches. A mismatch can indicate tenant attribution drift that needs manual investigation.

## Historical Seeding And Repair

`seedHistoricalSnapshots` is an internal action that dispatches `generateDailySnapshots` for each day from `daysBack` down to 1. Because daily generation skips dates that already have snapshots, this is useful for initial seeding but not for partial repair.

`wipeSnapshots` deletes up to 10,000 snapshot rows and exists as a blunt internal helper. Treat it as a development or carefully controlled repair tool, not a normal operator workflow.

If data health reports missing global snapshot dates, regenerate each missing date only after confirming no partial rows already exist. If duplicate snapshot groups appear, investigate before deleting data.

## Limits And Caveats

Current snapshot generation and dashboard reads use bounded `.take(10000)` calls. This is acceptable for current scale but should be revisited as usage grows.

The fixed GBP conversion rate is stored in code as `USD_TO_GBP_RATE = 0.78`. If finance requirements change, move exchange-rate handling into configuration and update analytics tests.

Snapshot rows store leaderboard and model distribution summaries, not raw event lists. Use raw message, thread, run, transaction, and audit tables for incident-level evidence.

## Verification

Focused tests include:

- `convex/analyticsCron.test.ts` for empty snapshots, duplicate skip behavior, global/company/user aggregation, message dimension backfill, validation, data health, and scoped system health behavior.
- `convex/analytics.test.ts` for analytics query access control, cost rollups, snapshot/live query behavior, and dashboard summaries.
- `convex/analyticsService.test.ts` for timeframe resolution, aggregation grouping, model cost lookup, conversion, and rounding helpers.
- `src/app/(dashboard)/admin/settings/analytics/page.test.tsx` for analytics settings and data-health UI behavior.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
