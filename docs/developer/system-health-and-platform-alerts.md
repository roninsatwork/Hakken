# System Health And Platform Alerts Developer Guide

System health is Sonae's operational risk report for analytics drift, agent failures, schedules, approvals, tool failures, provider failures, and cost pressure. Platform alerts are the daily email path built from the same health report.

Read this before changing `analyticsCron.getSystemHealthForAdmin`, health signal thresholds, platform alert emails, analytics health checks, or the System Health settings page. For the broader operations surface, see [Platform Operations Settings](./platform-operations-settings.md).

## Product Surface

- `src/app/(dashboard)/admin/health/page.tsx` renders `/admin/health`.
- `convex/analyticsCron.ts` builds analytics, operations, budget, alert-rule, and system health reports.
- `convex/platformAlertService.ts` converts health reports into alert decisions and email HTML.
- `convex/emailBrandingService.ts` supplies the sender name/address for alert dispatch.
- `convex/crons.ts` runs daily analytics snapshots at 00:05 UTC and daily platform alerts at 00:25 UTC.

The page uses `api.analyticsCron.getSystemHealthForAdmin` with a 7-day lookback. It renders metric tiles, budget controls, alert rules, operator signals with runbooks, investigation links, and a downloadable JSON report.

## Access And Scope

`getSystemHealthForAdmin` uses `requireAdmin`.

Super admins receive platform scope. Standard admins receive company scope based on their active company id. Company-scoped reports include the company id and company name and filter health collection to that company where the underlying data supports it. Admins without an active company id are rejected.

Keep this scope split intact. System health includes sensitive operational examples such as run ids, schedule ids, tool-call failures, provider failures, and budget pressure.

## Health Report Shape

`getSystemHealthReport` returns a `SystemHealthReport` with:

- `analytics`: snapshot coverage, message dimension health, missing threads, live assistant messages, and live agent transactions.
- `operations`: agent errors, failed transactions, stale runs, pending approvals, failed tool calls, provider failures, high-cost agents, failed scheduled executions, stale scheduled executions, overdue schedules, and schedules missing a next run.
- `budgetHealth`: agent run cost budget pressure and tenant message budget pressure.
- `alertRules`: simplified rule statuses for the UI.
- thresholds for high-cost agents, stale runs, pending approvals, and overdue schedules.
- checked date, checked timestamp, window start date/timestamp, days back, and scope.

The default lookback is 7 days and the helper clamps health lookbacks to 1-90 days.

## Analytics Health

Analytics health checks daily snapshot coverage and message dimension integrity.

Snapshot coverage checks:

- missing global daily snapshots for platform scope
- duplicate snapshot groups by date, type, and scope id
- global, company, and user snapshot counts per checked date
- total snapshots checked

Message dimension checks scan recent messages and join their threads. The report counts:

- messages missing analytics dimensions that can be inferred from the thread
- messages whose stored dimensions mismatch the thread
- messages whose thread no longer exists
- example message ids for investigation

Backfill and validation helpers live in the same module: `backfillMessageAnalyticsDimensions` and `validateMessageAnalyticsDimensions`. The alert runbook deliberately recommends dry-run and validation before patching analytics dimensions.

## Operational Health

Operational health collects examples with stable ids, labels, optional timestamps, summaries, target names, and target types.

The report covers:

- recent agent error logs
- failed agent transactions
- stale agent runs
- pending approvals older than the approval threshold
- failed tool calls
- repeated provider failures
- high-cost agents above the configured threshold
- failed scheduled workflow executions
- stale running scheduled executions
- overdue active schedules
- active schedules missing `nextRunAt`

Current thresholds include 60 minutes for stale running work, 30 minutes for pending approvals, 15 minutes for overdue schedules, GBP 5 for high-cost agents, 80 percent for budget warnings, 3 repeated provider failures, and 3 failed tool calls.

Health examples are intentionally capped. The page and email should show enough evidence for an operator to start investigation without turning health reports into full data exports.

## Budget Health

Budget health checks two pressure points:

- agent runs above 80 percent of configured `maxCostGBP`
- companies above 80 percent of assigned plan message limits

Examples include target name, target type, used amount, limit, percent used, summary, optional timestamp, and id. Treat these as operational warnings, not automatic quota changes. Operators should inspect model choice, retrieval breadth, usage patterns, and plan assignment before raising limits.

## Alert Rules

`buildAlertRules` converts operations and budget health into compact UI rule cards.

Current rule keys are:

- `stuckRuns`
- `staleApprovals`
- `repeatedProviderFailures`
- `costSpikes`
- `toolFailures`

Each rule includes count, details, label, next action, status, and threshold text. Rule status is `ok`, `warning`, or `critical` based on count compared with its threshold.

The rule cards are summary affordances. The richer operator signals below them are generated from platform alert signals and include runbook text plus examples.

## Platform Alert Decisions

`platformAlertService.ts` builds alert signals from analytics, operational, and budget reports.

Analytics alert signals include missing global snapshots, duplicate snapshots, missing dimensions, mismatched dimensions, and missing threads.

Operational alert signals include agent execution errors, failed transactions, stale runs, pending approvals, failed tool calls, provider failure clusters, high-cost agents, failed scheduled executions, stale scheduled executions, overdue schedules, and schedules missing next run.

Budget alert signals include agent cost budget pressure and tenant message budget pressure.

`buildSystemHealthPlatformAlertDecision` combines all system health signals. It sets `shouldAlert` to true when at least one signal exists, builds a subject with the total signal count, and summarizes the report window.

## Email Dispatch

`dispatchPlatformAlerts` is an internal action scheduled daily at 00:25 UTC with `daysBack: 7`.

Dispatch flow:

1. Read the internal system health report.
2. Build a system health alert decision.
3. Return `healthy` without sending when no signals exist.
4. Resolve recipients from `PLATFORM_ALERT_EMAILS`, `PLATFORM_ALERT_EMAIL`, `ANALYTICS_ALERT_EMAILS`, `ANALYTICS_ALERT_EMAIL`, or `INITIAL_SUPER_ADMIN_EMAIL`.
5. Where none of those are set, fall back to every super admin's email address, via `internal.platformAlertRecipients.getPlatformAlertFallbackRecipients`. That query lives in a module of its own on purpose: a query and its caller in the same module resolve their types through the generated api and back again, and that cycle widens every `ctx.db.get` in the codebase to a union of every table.
6. Return `missing_recipients` only when there are no configured recipients and no super admins — previously this was the normal outcome on any deployment without the environment variables set, which meant the job decided the platform was unhealthy every day and wrote it to a log nobody reads.
6. Build system health alert HTML.
7. Simulate dispatch when `RESEND_API_KEY` is missing.
8. Otherwise load email branding, build the sender address, and send through Resend with an idempotency key based on alert type and report window.

Alert emails include the summary, window, analytics counts, operational counts, signal rows, example details, and runbook text. Keep email content concise and escaped through the existing helpers.

## UI Export And Investigation Links

The System Health page can export the current health report as JSON. This is useful for incident notes and before/after launch checks.

Investigation links point to:

- workflow schedules
- agent approvals
- agents
- AI costs
- analytics data health

When adding a health signal, add a corresponding investigation path or runbook text. A signal without a clear next action creates noise during incidents.

## Adding Or Changing Signals

When adding a signal:

1. Add the collection logic to analytics, operational, or budget health.
2. Keep collection bounded with explicit limits and example caps.
3. Preserve company scoping when standard admins can view the signal.
4. Add alert signal mapping and runbook text in `platformAlertService.ts`.
5. Add or adjust `alertRules` only when the signal belongs in the compact rule card area.
6. Update the System Health page if the signal needs a new card or investigation link.
7. Add tests for platform scope, company scope where relevant, threshold behavior, and UI rendering.
8. Update this guide and operator-facing documentation if the operator workflow changes.

## Verification

Focused tests include:

- `convex/system.test.ts` and `convex/systemService.test.ts` for system config helper behavior.
- `convex/analyticsCron.test.ts` for analytics snapshot and health report behavior.
- `convex/analyticsService.test.ts` for cost and analytics helper behavior.
- `convex/platformAlertService.test.ts` where present for alert decision and email helpers.
- `src/app/(dashboard)/admin/health/page.test.tsx` for loading, healthy, warning, budget, rule, and company-scope UI states.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
