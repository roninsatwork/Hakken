---
product: Hakken
documentation_type: Developer guide
feature_area: Inventory and operational analytics rollups
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/analytics-rollups.md
last_reviewed: '2026-10-26T14:40:17+00:00'
reviewed_against: current implementation
status: Current
---
# Analytics Rollups Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Inventory and operational analytics rollups
> **Reviewed:** 26 October 2026, 14:40:17 GMT (Europe/London)
> **Source path:** `docs/developer/analytics-rollups.md` · **Status:** Current

Analytics rollups are the daily precomputed usage snapshots behind Hakken's admin analytics dashboards and data-health checks. They reduce historical dashboard work by storing global, company, and user summaries in `analyticsDailySnapshots`, while the analytics queries add today's live messages and agent transactions on top.

Read this before changing `convex/analytics.ts`, `convex/analyticsSnapshots.ts`, `convex/analyticsService.ts`, analytics snapshot schema, the analytics data-health checks in `convex/systemHealth.ts`, or the Global Analytics Engine settings page. For system health alerts that consume analytics health, see [System Health And Platform Alerts](./system-health-and-platform-alerts.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/analytics/page.tsx` renders the Global Analytics Engine settings page and analytics data-health summary.
- `convex/analytics.ts` serves admin analytics queries for global costs, platform overview, user costs, company metrics, global inventory metrics, and global analytics.
- `convex/analyticsSnapshots.ts` generates daily snapshots, seeds historical snapshots, and validates/backfills message analytics dimensions.
- `convex/systemHealth.ts` exposes analytics data health.
- `convex/analyticsService.ts` owns timeframe resolution, aggregation grouping, model cost lookup, shared USD cost calculation and metric rounding helpers.
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
- `metrics.costUsd`
- optional `metrics.activeUsersCount`
- optional `uniqueUserIds`
- optional `modelMetrics`
- optional `leaderboards.topAgents`
- optional `leaderboards.topUsers`

Indexes include date, type/date, company/date, and user/date access patterns. Preserve these if dashboard queries are refactored; the current queries intentionally read historical snapshots by date/type and add live data separately.

Snapshots persist per-model `modelMetrics`. `mergeSnapshotModelMetrics` derives historical provider distribution by joining those model identifiers to the current catalog, falling back to unknown for models no longer attributable. This is not merely today's provider overlay.

## Snapshot Generation

`generateDailySnapshots` is an internal action. It resolves yesterday's UTC day by default, or a supplied date, and skips when any snapshot exists for that date. It reads a bounded model catalog with a partial flag, refusing to write a wrongly priced snapshot when that catalog is incomplete.

It pages messages, ordinary transactions, and Decision runs through `readDayInteractionsPage`, 500 rows at a time. Decision input is reduced to model-bearing call rows, preventing one batched request from being counted as many independent calls. The accumulated day refuses above 250,000 interactions rather than writing a silently shortened day. Source reads, dimension joins, aggregation, and `writeDailySnapshots` are separate action/query/mutation stages. An empty day gets an empty global snapshot.

The date-existence check and final insert are not a single shared transaction. `writeDailySnapshots` inserts its supplied rows without independently rechecking the date. Do not assume concurrent action invocations provide exactly-once day generation. The date-wide skip also means one existing partial row can prevent an ordinary rerun from repairing that date. Health and a separately approved repair must assess duplicate/partial state.

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

`computeCostFromMap` delegates to `calculateModelCostUsd` using configured rates. Above-200k input pricing falls back to the standard input price when the higher-band value is absent. Current supplier costs are USD; the former fixed 0.78 GBP conversion is gone. Historical stored metrics must be interpreted with their original schema/verification context rather than rewritten as a later result.

Keep analytics model choices resolved from stored model configuration. Do not hardcode provider model literals in analytics runtime paths.

## Dashboard Query Pattern

Historical windows combine snapshots with live data.

For days before today, queries read `analyticsDailySnapshots`. For today, queries read raw assistant messages and agent transactions directly. This keeps dashboards current without regenerating snapshots during the day.

Historical provider distribution is derived from each snapshot's model metrics through the current catalog. Missing catalog models become unknown; this differs from preserving original provider identity immutably on every day row.

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

Dashboard reads generally use a 10,000-row coverage-aware limit, while snapshot generation pages up to its distinct day ceiling. Coverage flags identify truncated dashboard inputs; totals must be interpreted with those flags.

Plan-derived inventory value retains its `priceGBP`/`mrr` storage names independently of supplier USD costs. Neither is an exchange-rate conversion or Stripe receipt ledger.

Snapshot rows store leaderboard and model distribution summaries, not raw event lists. Use raw message, thread, run, transaction, and audit tables for incident-level evidence.

## Verification

Focused tests include:

- `convex/analyticsCron.test.ts` for empty snapshots, duplicate skip behavior, global/company/user aggregation, message dimension backfill, validation, data health, and scoped system health behavior.
- `convex/analytics.test.ts` for analytics query access control, cost rollups, snapshot/live query behavior, and dashboard summaries.
- `convex/analyticsService.test.ts` for timeframe resolution, aggregation grouping, model cost lookup, conversion, and rounding helpers.
- `src/app/(dashboard)/admin/settings/analytics/page.test.tsx` for analytics settings and data-health UI behavior.

For documentation-only edits, run `git diff --check`. For implementation changes, follow the current complete gates in [AGENTS.md](../../AGENTS.md).

## Maintained Inventory And Rebuild Refusal

`utils/inventoryRollupService.ts` maintains a global `inventoryRollups.by_key` row. Provisioning/deletion paths adjust user/company totals, company plan changes adjust plan populations, and plan updates/removal refresh pricing distribution. Counters are floored at zero. These are saved summaries, so a missing rollup can read as zero rather than prove there are no users. Incremental maintenance depends on every owning write path applying its appropriate adjustment.

`inventoryRollups.rebuildGlobalInventoryRollupData` reads one beyond 10,000 users, companies, and plans. If any population overflows, it refuses before replacement and leaves existing totals intact. The public rebuild mutation is super-admin-only; the allowlisted maintenance script invokes the same logic. It does not progressively accumulate a truncated rebuild, silently replace totals with a first page, or make a provider request.

The rebuild counts all provisioned user/company rows. Companies with a plan ID contribute to that plan's population. The stored mrr value is the sum of active plan priceGBP times assigned companies. It does not inspect Stripe subscription payment status, invoices, collection, refunds, trials, canceled subscriptions, per-seat billing, or an actual revenue ledger. A plan assignment is not a paid company; total provisioned users are not covered users. Keep those distinctions aligned with [the Stripe operator handoff](../operator/stripe-billing.md).

`getGlobalInventoryMetrics` returns the stored aggregates and normalized active plan distribution to super-admins. It is separate from daily AI usage snapshots and from customer frontend Billing. A rebuilt value can be internally consistent while failing to represent collected revenue, because collected revenue is not the formula's source.

## Coverage, Dates, And Repair Boundaries

`analytics.ts` uses coverage-aware reads with a one-past limit to detect truncated inputs. `getCompanyMetrics` and `getGlobalAnalytics` add today's messages, transactions, and model-bearing Decision calls to older snapshots. Sources have distinct dimensions and retention; a chart is not a raw event archive. A message, agent transaction, and Decision call can describe different parts of work, so do not infer unique customer requests solely from summed model interactions.

Snapshot days use UTC, while selected timeframe helpers include calendar calculations using the runtime's date handling. Read actual returned range/grouping when reconciling a boundary, particularly yesterday, year-to-date, or custom periods. Historical provider mapping also uses current catalog metadata; a renamed/deleted model can change attribution without a new source event.

Dimension backfill fills only missing values inferred from a thread and reports existing mismatches. A row with mismatches can still receive other missing fields, but those wrong existing values are not overwritten. Dry-run mode previews the current paged read; it does not make a later write identical if data changes. Historical seeding is bounded orchestration and cannot repair an existing date simply by ignoring the date-wide guard. Wipe and rebuild tools mutate saved evidence and require their own authorized operational task.

Relevant evidence includes analytics and analyticsCron tests, analyticsService tests, provisioning tests, and inventory maintenance cases. No rebuild, snapshot generation, backfill, wipe, provider bill lookup, Stripe read, or financial verification ran in this documentation pass. The formulas and limits here describe local implementation, leaving product decisions, historical records, and live acceptance unchanged.
