---
product: Hakken
documentation_type: Developer guide
feature_area: operational retention and bounded purges
audience: platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/data-retention-and-purges.md
last_reviewed: '2026-10-26T10:34:20+00:00'
reviewed_against: current implementation
status: Current
---
# Data Retention And Purges Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Operational retention and bounded purges
> **Reviewed:** 26 October 2026, 10:34:20 GMT (Europe/London)
> **Source path:** `docs/developer/data-retention-and-purges.md` · **Status:** Current

Hakken's current configurable retention engine is `convex/purges.ts`, with schedule and default policy in `convex/purgeScheduleService.ts`. This guide describes the implementation rather than promising that any deployed database has run its jobs. The existing user orientation is [Operational Diagnostics And Retention](../end-user/operational-diagnostics-and-retention.md). Personal erasure follows the separate manifest described in [Governance And Trust](./governance-and-trust.md).

## Entry Points, Roles And Storage

The retained configuration is JSON in `systemConfig` under `PURGE_PIPELINES_CONFIG`, selected through `by_key`. `getPipelineConfig`, `getPurgePreviewCounts`, `getRunningPurges` and `getPurgeHistoryPaginated` use `superAdminQuery`, which includes READ_ONLY readers. Configuration update, manual start and cancellation use `superAdminMutation`, which permits SUPER_ADMIN alone. Do not copy the old guide's assertion that all history reads are restricted to super admins.

The routes are `/admin/settings/security/retention` and `/admin/settings/security/purge-history`. `RetentionRulesSection.tsx` owns configuration, preview and action state; `RetentionRuleDialogs.tsx` supplies edit/confirmation dialogs. Their presence is current behavior even though the repository convention asks for pages for field editing. `PurgeHistorySection.tsx` uses `usePaginatedQuery` and fifteen-row display pages. Pipeline/status filters are sent to the server; free-text search operates on loaded results. The displayed known total is not a maintained whole-table count.

`purgeHistory` stores pipeline, MANUAL or SCHEDULED trigger, status, parent-record count, start/progress/completion timestamps, optional actor, error and leaked storage identifiers. `by_started` supports the ledger; `by_pipeline_started` supports pipeline-specific history and running checks. The UI's running-job query scans fifty newest history rows. The stale-run reaper scans the newest hundred, so neither should be described as an unbounded search for every old stuck job.

## Pipeline Defaults

All eighteen default pipelines are enabled and daily at 02:00 UTC. Saved values merge over defaults; an older saved `enabled: false` remains false. The configured minimum is thirty days. The defaults are:

| Pipeline | Days | Main data |
| --- | ---: | --- |
| agentLogs | 90 | agentLogs |
| workflowLogs | 90 | workflowExecutions and steps |
| userLogins | 180 | logins |
| chatHistory | 180 | threads and inspected children |
| auditLogs | 90 | auditLogs with protected purge evidence |
| publicApiRequests | 90 | publicApiRequests |
| authEvents | 180 | authEvents |
| aiActionRequests | 30 | aiActionRequests |
| analyticsSnapshots | 400 | analyticsDailySnapshots |
| webhookDeliveries | 90 | webhookDeliveries |
| agentRunHistory | 180 | terminal agentRuns and bounded children |
| agentTransactions | 90 | agentTransactions |
| phoneCalls | 90 | phoneCalls |
| decisionRuns | 90 | decisionRuns |
| hakkenTaskChecks | 90 | hakkenTaskChecks |
| sentEmails | 60 | settled outboxMessages |
| readingEvents | 90 | readingEvents |
| purgeHistory | 365 | older terminal history outside protected newest rows |

`normalizePurgePipelineConfigForUpdate` rejects invalid JSON, intervals outside Hourly/Daily/Weekly/Monthly, hours outside zero through twenty-three, weekday outside zero through six, and monthly day outside one through twenty-eight. It enforces the retention floor and recalculates enabled next-run timestamps, zeroing disabled ones. Update writes `UPDATE_PURGE_PIPELINES`. The parser's fallback is not proof that a saved malformed setting was deliberately approved.

## Dispatch, Concurrency And Cutoffs

`crons.ts` runs `unified-data-purge-dispatcher` hourly at minute fifteen through the job ledger. The dispatcher seeds missing configuration and returns; zero next-run times are initialized before due work. Each enabled due pipeline checks for an existing running purge, creates history, schedules `executePurgeRecursive` and advances its next scheduled time. A running chain prevents a second chain over the same pipeline. Schedule evaluation uses UTC; an interval is an eligibility rule rather than exact wall-clock execution assurance.

`runManualPurge` applies the same running guard and retention floor, calculates its cutoff, inserts history, audits `MANUAL_PURGE_TRIGGER` and schedules the first batch immediately. The cutoff is passed through later batches, not recalculated from configuration each time. The internal proof variants exist for explicitly authorized live proof work; this documentation pass did not invoke them. They do not grant browser clients anonymous purge permission.

## Batch Deletion And Cascades

Most simple table pipelines delete at most 500 old rows through a time-leading index, then schedule another pass when full. Phone calls age by `startedAt`, including stuck in-progress rows; settled email selection explicitly includes SENT, FAILED and SKIPPED, leaving pending/sending rows. Snapshot and task-check cutoffs use date keys. Workflow deletion takes up to 200 old executions and collects each execution's steps; linked agent runs age through their own pipeline. The parent ceiling is not a universal bounded-child guarantee because step collection is unbounded within that execution loop.

Agent history considers twenty-five old completed candidates, verifies terminal status and uses a nominal 400-row budget between runs. `deleteAgentRunCascade` takes up to 200 per child table for steps, tool calls, reflections, memory use and feedback, retaining a parent when a child collection hits its ceiling. Because the budget is checked between runs, one run can exceed the nominal budget across child tables. Approvals, separate finance rows and learned artifacts intentionally survive; optional source references may then dangle. Do not rerun the memory-outcome backfill after its source usage rows have expired.

Chat history considers twenty-five old threads with a 500-message budget and a storage-file threshold of 200. It reads one extra message to detect partial threads. It removes up to fifty feedback rows per message, attempts attachment deletion, then deletes the message. The file threshold is checked between portions of the thread loop rather than enforced as an absolute per-file transaction ceiling. Partly drained threads remain for a subsequent pass. Memory-use rows drain in batches of 500 before the parent goes; swarm logs are collected and deleted. These details matter when evaluating transaction size or promising complete unusual-data cleanup.

Storage deletion failures are caught and appended to `leakedStorageIds` in purge history and completion audit. The corresponding message can still be deleted. A SUCCESS status with leaked identifiers is therefore not proof of full blob deletion. `recordsPurged` counts completed parent threads or runs in cascade pipelines, not all child deletions or storage bytes.

Audit retention uses cursor pagination so protected prior purge-summary rows cannot trap the worker in the same oldest batch. `isAuditPurgeRecord` preserves those records. Purge-history retention protects the newest two hundred, the current run and running rows. This evidence deliberately outlives ordinary deletion windows; do not equate a remaining summary with a failed generic retention rule.

## Progress, Errors And Cancellation

Every batch first reloads history and stops unless it is RUNNING. Partial work updates counts, progress time and leaked identifiers before scheduling another mutation after one second. Completion sets SUCCESS and records `RECORDS_PURGED` or the audit-purge action when anything was removed or leaked. In-handler exceptions set FAILED, but a commit-time abort can roll back that failure patch too.

`reapStalePurges` is scheduled every ten minutes and marks inspected running records FAILED after thirty minutes without progress. It records the interruption; it does not resume deletion automatically. Operator recovery remains necessary and already removed rows stay removed. `cancelPurge` sets CANCELLED, completion time and a `MANUAL_PURGE_CANCEL` audit record. Future batches refuse that status. No cancellation rolls back previous committed work.

## Previews, Measurements And Historical Paths

Preview reads are capped at 5,001 candidates per pipeline and report capped counts. They describe potential parent records, not exact cascaded rows or bytes. Additional execution predicates and protected records can change final results. Keep those limits visible when interpreting a preview or a small filtered history result.

The old audit-specific `AUDIT_PURGE_CONFIG` dispatcher/execution and hourly registration described in the previous guide were not found in current `auditLogs.ts` or `crons.ts`. `auditLogService.ts` still has legacy parsing/default helpers and an event label. Treat the old live scheduler as possibly deprecated, retain historical operational evidence and request manual review before deleting residual helpers. The current unified audit pipeline is the implemented path inspected here.

`storageMeasure.measureEveryTable` is an internal read action over tables declared by `KEEP_RULES`. It pages at 200 rows initially, halves the same-page size on any query error until one row, uses Convex document/value size functions and returns sorted table/field totals. The catch is broader than a size-only error. This operation reads whole tables and consumes database read allowance; it is not a cheap health check or storage deletion. Its result measures database document bytes, not all file-storage objects or supplier costs. No measurement was executed.

Relevant source tests are `purgeScheduleService.test.ts`, `purges.test.ts`, `auditLogService.test.ts`, `keepRules.test.ts` and the retention/history UI tests. They cover policy parsing, scheduling, auth, cascades, stalling, evidence protection and display behavior. This documentation pass used source inspection and Markdown validation only. Implementation gates remain in current AGENTS.md; no old abbreviated command list here supersedes them.
