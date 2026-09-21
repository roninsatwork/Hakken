> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# System Health Alerts Expansion Plan

This plan documents the work needed to expand Hakken platform alerts beyond analytics data health so operators are notified when agent runs fail or scheduled automation stops behaving correctly.

The immediate product goal is: daily platform alerts and the admin Maintenance UI should include agent failures and schedule failures, with enough examples and runbook guidance for an operator to investigate without reading source code first.

## Implementation Status

First slice implemented. Estimated plan completion: 85%.

Implemented in the first slice:

- Added a system-health report that combines analytics health with operational alert signals.
- Added operational checks for agent error logs, failed agent transactions, failed scheduled executions, stale running scheduled executions, overdue active schedules, and active schedules missing `nextRunAt`.
- Generalized the platform alert service so the daily alert email can report system-health signals.
- Updated the daily platform alert dispatcher to use the system-health report and system-health email renderer.
- Added a super-admin Maintenance UI page at `/admin/settings/system-health`.
- Added a Maintenance sidebar entry for System Health with English and Italian locale parity.
- Added focused service, Convex, and page tests.

Still remaining:

- Authenticated browser smoke of the new protected Maintenance page.
- Optional refinement of whether the page should duplicate analytics details or link to the analytics-specific view.
- Scheduled-agent execution truthfulness follow-up, where scheduled agent executions should be marked `SUCCESS` or `FAILED` from the real report action instead of the current simulation path.

## Current State

Hakken already has a platform alert path, but the implementation is currently analytics-specific.

- `convex/crons.ts` runs `analyticsCron.dispatchPlatformAlerts` daily at 00:25 UTC.
- `convex/analyticsCron.ts` builds an analytics data-health report, decides whether to alert, and dispatches email through Resend.
- `convex/platformAlertService.ts` contains reusable-looking alert types and email rendering, but its input report and subject text are still shaped around analytics health.
- `src/app/(dashboard)/admin/settings/analytics/page.tsx` shows the analytics health report in the admin UI.
- `src/ui/components/layout/SidebarNavigation.tsx` already has a super-admin Maintenance menu under admin, currently linking to maintenance scripts and auth diagnostics.
- Existing maintenance scripts live under `src/app/(dashboard)/admin/settings/scripts`.

Current alert thresholds only cover analytics drift:

- Missing global analytics snapshots.
- Duplicate analytics snapshot groups.
- Messages missing analytics dimensions.
- Message dimension mismatches.
- Messages whose thread record is missing.

## Audited Failure Sources

### Agent Failures

Primary sources:

- `convex/agentLogs.ts`
  - Agent failures are recorded in `agentLogs` with `interactionType: "ERROR"`.
  - Chat-agent failures and report-generation failures use this path.
- `convex/schema.ts`
  - `agentLogs` has `agentId`, optional `threadId`, optional `companyId`, `interactionType`, `promptContent`, `responseContent`, and `createdAt`.
  - `agentTransactions` has `status: "SUCCESS" | "FAILED"` and can provide additional billing/runtime failure signal.
- `convex/agentRuntime.ts`
  - Chat-agent runtime catches failures and inserts an `agentLogs` error row.
  - Workflow agent node execution logs successful `WORKFLOW_EXECUTION` rows, but failures usually surface through workflow execution state instead.
- `convex/salesReportActions.ts`
  - Sales report generation failures insert `agentLogs` rows with `interactionType: "ERROR"` and rethrow.

Important nuance:

- Agent failures are not all represented by failed `workflowExecutions`.
- For scheduled standalone agent runs, the dispatcher currently creates a `workflowExecutions` row, queues `salesReportActions.generateReport`, then separately queues a successful simulation completion. If the report action fails, the agent error log is more trustworthy than the schedule execution status.

### Schedule Failures

Primary sources:

- `convex/schema.ts`
  - `workflowExecutions` tracks workflow and scheduled-agent runs with `status: "RUNNING" | "SUCCESS" | "FAILED"`, `triggerType`, `startedAt`, optional `completedAt`, and optional `state`.
  - `schedules` tracks active schedules with `lastRunTs`, `nextRunAt`, `workflowId`, and `agentId`.
- `convex/workflowEngine.ts`
  - `scheduleDispatcher` reads due active schedules using `by_active_next_run`.
  - Scheduled workflow runs insert `workflowExecutions` with `triggerType: "SCHEDULE"` and queue `workflowRuntime.startWorkflow`.
  - Scheduled agent runs insert `workflowExecutions` with `triggerType: "SCHEDULE"` and queue `salesReportActions.generateReport`.
- `convex/workflowRuntime.ts`
  - Workflow runtime failures call `workflowEngine.failNodeStep`, which marks both the failed step and the parent execution as `FAILED`.

Potential schedule failure meanings:

- A scheduled execution completed with `status: "FAILED"`.
- A scheduled execution stayed `RUNNING` beyond an expected grace period.
- An active schedule has `nextRunAt` in the past by more than a grace period.
- An active schedule has no `nextRunAt`.
- A schedule references a missing, inactive, or incompatible target.

## Proposed Alert Model

Keep one daily platform alert email, but broaden the report from analytics health to system health.

Recommended type split:

```ts
type SystemHealthReport = {
  checkedAt: number;
  daysBack: number;
  windowStartTs: number;
  analytics: AnalyticsHealthReport;
  operations: OperationalHealthReport;
};

type OperationalHealthReport = {
  agentFailures: {
    count: number;
    examples: OperationalFailureExample[];
  };
  failedAgentTransactions: {
    count: number;
    examples: OperationalFailureExample[];
  };
  failedScheduledExecutions: {
    count: number;
    examples: OperationalFailureExample[];
  };
  staleRunningScheduledExecutions: {
    count: number;
    examples: OperationalFailureExample[];
  };
  overdueSchedules: {
    count: number;
    examples: OperationalFailureExample[];
  };
  schedulesMissingNextRun: {
    count: number;
    examples: OperationalFailureExample[];
  };
};
```

`OperationalFailureExample` should stay small and safe:

```ts
type OperationalFailureExample = {
  id: string;
  label: string;
  occurredAt?: number;
  targetType?: "agent" | "workflow" | "schedule";
  targetName?: string;
  summary?: string;
};
```

Do not include full prompts, full responses, raw workflow state, API keys, provider payloads, or uploaded content in platform alert emails.

## Proposed Alert Signals

Add these signal keys to `PlatformAlertSignal`:

- `agentErrorLogs`
  - Count recent `agentLogs` where `interactionType === "ERROR"`.
  - Details should show agent name or id, timestamp, and a short sanitized error summary.
  - Runbook: open the agent log, inspect provider/config/tool failure, then retry or fix the agent configuration.
- `failedAgentTransactions`
  - Count recent `agentTransactions` with `status === "FAILED"`.
  - Details should show agent id/name, action context, provider/model if available, and timestamp.
  - Runbook: compare with agent logs and provider health before treating it as billing-only telemetry.
- `failedScheduledExecutions`
  - Count recent `workflowExecutions` where `triggerType === "SCHEDULE"` and `status === "FAILED"`.
  - Details should show workflow/agent target, execution id, timestamp, and first failed step if available.
  - Runbook: inspect the target workflow or agent run, fix failed node/config, then rerun manually.
- `staleScheduledExecutions`
  - Count scheduled executions still `RUNNING` after a grace period, for example 60 minutes.
  - Details should show target, execution id, age, and started timestamp.
  - Runbook: inspect Convex action logs and workflow steps; determine whether it is still processing or stranded.
- `overdueSchedules`
  - Count active schedules whose `nextRunAt` is older than the grace period.
  - Details should show schedule name, target, due time, and last run time.
  - Runbook: check whether `workflow-schedule-dispatcher` is running, the target exists, and `nextRunAt` recalculates.
- `schedulesMissingNextRun`
  - Count active schedules with no `nextRunAt`.
  - Details should show schedule name and target.
  - Runbook: toggle the schedule or repair schedule config after validating `intervalStr`.

## Threshold Defaults

Use low thresholds for the first pass so failures are visible while the system is still small.

- Agent error logs: alert when count is greater than 0 in the lookback window.
- Failed agent transactions: alert when count is greater than 0 in the lookback window.
- Failed scheduled executions: alert when count is greater than 0 in the lookback window.
- Stale scheduled executions: alert when count is greater than 0 and age is greater than 60 minutes.
- Overdue schedules: alert when count is greater than 0 and `nextRunAt` is more than 15 minutes overdue.
- Missing `nextRunAt`: alert when active schedule count is greater than 0.

These defaults can be tuned later if the daily email becomes noisy.

## Implementation Plan

### Phase 1: Generalize Platform Alert Service

Status: Complete in first slice.

Refactor `convex/platformAlertService.ts` so analytics and operational signals can share one email and one decision path.

Recommended changes:

- Rename or add a broader decision builder, for example `buildSystemHealthPlatformAlertDecision`.
- Keep `buildAnalyticsHealthPlatformAlertDecision` available if tests or call sites still need it.
- Make `PlatformAlertDecision.alertType` support a broader value, for example `"systemHealth"`.
- Expand `PlatformAlertSignal.key` to include operational signal keys.
- Update the email renderer so it accepts a system-health report and displays both analytics and operational context.
- Preserve HTML escaping and compact example rendering.

Acceptance checks:

- Existing analytics alert tests still pass.
- New tests cover a clean system-health report.
- New tests cover mixed analytics and operational signals in one email.
- New tests confirm operational details are escaped.

### Phase 2: Add Operational Health Collection

Status: Complete in first slice.

Add a bounded internal query for operational health, probably in a new file or in `convex/analyticsCron.ts` if keeping dispatch centralized.

Recommended query:

```bash
npx convex run analyticsCron:getSystemHealth '{"daysBack":7}'
```

Collection rules:

- Window start: same `daysBack` logic as analytics health, clamped to 1 to 90 days.
- Query recent `agentLogs` using `by_createdAt`, filter to `interactionType === "ERROR"`, and cap examples.
- Query recent `agentTransactions` using `by_createdAt`, filter to `status === "FAILED"`, and cap examples.
- Query recent `workflowExecutions` using `by_startedAt`, filter to `triggerType === "SCHEDULE"` and `status === "FAILED"`.
- Query recent or currently running scheduled executions, filter to `triggerType === "SCHEDULE"`, `status === "RUNNING"`, and age greater than the stale threshold.
- Query active schedules through `by_active_next_run` for overdue schedules.
- Query active schedules through `by_active_last_run` or bounded `by_createdAt` scan for active schedules missing `nextRunAt`.
- Enrich examples with workflow and agent names when available, but keep the query bounded.

Acceptance checks:

- Backend tests cover each signal independently.
- Tests cover missing workflow/agent targets without throwing.
- Tests cover bounded example lists.
- Tests verify super-admin-only public access if a UI query is added.

### Phase 3: Dispatch System Health Alerts

Status: Complete in first slice.

Update `analyticsCron.dispatchPlatformAlerts` or introduce a new action name while preserving the cron schedule.

Recommended path:

- Keep the cron name `dispatch-platform-alerts`.
- Have `dispatchPlatformAlerts` build the broader system-health report.
- Use the existing recipient environment variables:
  - `PLATFORM_ALERT_EMAILS`
  - `PLATFORM_ALERT_EMAIL`
  - `ANALYTICS_ALERT_EMAILS` as deprecated fallback
  - `ANALYTICS_ALERT_EMAIL` as deprecated fallback
  - `INITIAL_SUPER_ADMIN_EMAIL`
- Change the Resend operation and idempotency key from analytics-specific naming to system-health naming.

Suggested idempotency key:

```txt
platform-alert:systemHealth:{windowStartDate}:{checkedDate}
```

Acceptance checks:

- Healthy report returns `reason: "healthy"` and does not send.
- Missing recipients returns `reason: "missing_recipients"` and logs the summary.
- Missing `RESEND_API_KEY` simulates dispatch and returns the signals.
- Real dispatch uses the broader subject and HTML.

### Phase 4: Maintenance UI

Status: Implemented with automated page coverage. Authenticated browser smoke remains.

Add a first-class alert visibility page under the existing super-admin Maintenance menu.

Recommended route:

- `/admin/settings/system-health`

Recommended navigation:

- Add a Maintenance submenu item labelled `System Health` or `Alerts`.
- Keep the existing `Scripts` and `Auth Diagnostics` items.
- Update Maintenance active-state logic so the new route opens and highlights the Maintenance section.
- Add English and Italian navigation labels in `messages/en.json` and `messages/it.json`.

Recommended page layout:

- Header: `System Health` with a concise operational subtitle.
- Status pill using the same health state as the daily alert decision:
  - `Healthy` when there are no signals.
  - `{n} signals` when attention is needed.
  - `Checking` while loading.
- Summary cards:
  - Agent errors.
  - Failed agent transactions.
  - Failed scheduled runs.
  - Stale running runs.
  - Overdue schedules.
  - Missing next run.
- Alert details section:
  - Signal label.
  - Count.
  - Recent safe examples.
  - Operator response.
- Optional analytics section:
  - Either include existing analytics health signals on the same page, or link back to `/admin/settings/analytics` for the analytics-specific view.

Content rules:

- Keep raw prompts, full agent responses, raw workflow state, provider payloads, and uploaded content out of the UI.
- Show sanitized summaries and stable ids only.
- Link to existing detail pages where possible:
  - Agent logs: `/admin/agents/{agentId}/logs`.
  - Schedules: `/admin/workflows/schedules/{scheduleId}`.
- Use in-app empty states and feedback only; no native browser dialogs.

Acceptance checks:

- Super-admin only.
- English and Italian locale dictionaries stay in parity if new localized copy is added.
- No native browser dialogs.
- Admin table/feed pagination remains 15 rows if a detailed list is added.
- Page tests cover loading, healthy, and attention-needed states.
- Sidebar tests or component tests cover the new Maintenance menu item and active route behavior.

### Phase 5: Fix Scheduled Agent Execution Truthfulness

Status: Deferred follow-up.

This is not required for the first alert pass, but it should be done before relying on scheduled-agent execution status as a source of truth.

Current issue:

- Scheduled agent dispatch creates a `workflowExecutions` row and then queues `scheduler.completeSimulation` with `success: true`.
- `salesReportActions.generateReport` may fail and write an agent error log while the schedule execution is later marked successful.

Recommended fix:

- Replace the simulation completion path for scheduled agents with an action/mutation that marks the execution based on the actual report result.
- Pass `executionId` into `salesReportActions.generateReport` or wrap scheduled agent execution in a purpose-built action.
- On success, mark the execution `SUCCESS`.
- On failure, mark the execution `FAILED` and include a sanitized state summary.

Acceptance checks:

- A failing scheduled agent action marks its `workflowExecutions` row as `FAILED`.
- A successful scheduled agent action marks its execution as `SUCCESS`.
- Agent error logs still record the actionable error details.
- Alert tests no longer need to treat scheduled-agent error logs as the only trustworthy signal.

## Operational Commands

Existing analytics health check:

```bash
npx convex run analyticsCron:getAnalyticsDataHealth '{"daysBack":7}'
```

Proposed system health check:

```bash
npx convex run analyticsCron:getSystemHealth '{"daysBack":7}'
```

Proposed one-off platform alert dry run:

```bash
npx convex run analyticsCron:dispatchPlatformAlerts '{"daysBack":7}'
```

## Verification Gates

Focused checks for this work:

```bash
npm run test:run -- convex/platformAlertService.test.ts
npm run test:run -- convex/analyticsCron.test.ts
npm run test:run -- convex/scheduler.test.ts
npm run test:run -- 'src/app/(dashboard)/admin/settings/system-health/page.test.tsx'
```

Full repo gates before merge or push:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

If the local frontend is running on port 3000, stop it before `npm run build`, then restart both services afterwards:

```bash
npm run dev
npm run convex:dev
```

## Open Decisions

1. Should the Maintenance submenu label be `System Health` or `Alerts`?
2. Should schedule failures include only failed executions, or also overdue/missing-next-run schedule health?
3. What stale-running threshold should production use: 30 minutes, 60 minutes, or schedule-specific?
4. Should failures alert immediately in the future, or is the daily digest sufficient for now?
5. Should analytics health be duplicated on the new Maintenance page, or linked from it to avoid two competing health surfaces?
6. Should `ANALYTICS_ALERT_EMAILS` remain a long-term fallback, or should it be deprecated after system-health rollout?

## Recommended First Slice

Implement the smallest useful slice first:

1. Add operational health collection for `agentLogs.ERROR`, failed scheduled executions, stale running scheduled executions, overdue schedules, and active schedules missing `nextRunAt`.
2. Generalize the platform alert decision and email to include operational signals.
3. Add a super-admin Maintenance page at `/admin/settings/system-health` backed by the same report.
4. Add the Maintenance submenu item, active-state behavior, and English/Italian labels.
5. Keep dispatch cadence and recipient environment variables unchanged.
6. Add focused service, Convex, and page tests.
7. Defer scheduled-agent execution truthfulness to a follow-up phase unless the first implementation reveals a blocking issue.
