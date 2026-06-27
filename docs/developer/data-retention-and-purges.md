# Data Retention And Purges Developer Guide

Sonae has two purge paths: the unified data purge engine for configurable product and operations data, and a legacy audit-log purge scheduler. Both are super-admin-controlled retention tools. They delete old records in bounded Convex transactions, record operational history where implemented, and avoid arbitrary shell execution.

Read this before changing purge schedules, retention floors, purge recursion, purge history, audit-log retention, or the System Settings purge UI. For the broader settings surface, see [Platform Operations Settings](./platform-operations-settings.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/page.tsx` includes the Settings `purges` tab.
- `src/app/(dashboard)/admin/settings/_components/PurgesSettingsSection.tsx` renders pipeline configuration, manual purge actions, cancellation, and recent purge history.
- `convex/purges.ts` owns unified purge configuration, history, manual runs, scheduled dispatch, recursive deletion, and cancellation.
- `convex/purgeScheduleService.ts` owns purge defaults, parsing, retention validation, cutoff calculation, and next-run calculation.
- `convex/auditLogs.ts` owns the older audit-specific purge config, dispatcher, and recursive audit-log deletion.
- `convex/auditLogService.ts` owns audit purge config helpers and monthly scheduling calculations.
- `convex/crons.ts` runs both `audit-log-purge-dispatcher` and `unified-data-purge-dispatcher` hourly.

All purge configuration and execution controls require super-admin privileges. Standard admins and users must not be able to configure, trigger, cancel, or inspect platform-wide purge history.

## Unified Purge Pipelines

The unified purge engine supports these pipeline keys:

- `agentLogs`
- `workflowLogs`
- `userLogins`
- `chatHistory`
- `auditLogs`

Default unified purge configs are disabled. Defaults set retention to 90 days for agent logs, workflow logs, and audit logs, and 180 days for user logins and chat history. The minimum retention floor is 30 days.

The config is stored in `systemConfig` under `PURGE_PIPELINES_CONFIG`. `getPipelineConfig` parses the saved JSON and merges it over defaults. Invalid or missing JSON falls back to defaults. `updatePipelineConfig` normalizes the submitted JSON, recalculates `nextRunTimestamp` for enabled pipelines, clears `nextRunTimestamp` for disabled pipelines, upserts the config row, and writes an `UPDATE_PURGE_PIPELINES` audit log.

## Scheduling

Unified purge intervals are `Hourly`, `Daily`, `Weekly`, and `Monthly`.

`calculateNextPurgeRun` uses UTC scheduling:

- hourly schedules run at the next UTC hour boundary
- daily schedules run at the configured UTC hour today or tomorrow
- weekly schedules run on the next configured UTC weekday and hour
- monthly schedules run on the next configured UTC day-of-month and hour

`internal.purges.dispatcher` runs hourly. It loads the unified config, skips disabled pipelines, initializes missing `nextRunTimestamp` values, starts due scheduled purges, advances the next-run timestamp, and patches the config when it changes.

Scheduled unified purge runs insert a `purgeHistory` row with `triggerType: "SCHEDULED"` and `status: "RUNNING"`, then schedule `executePurgeRecursive` immediately through the Convex scheduler.

## Manual Purges

`runManualPurge` requires a super admin, loads the current unified config, resolves the pipeline retention days, enforces the 30-day minimum retention floor, calculates the cutoff timestamp, inserts a running `purgeHistory` row, writes a `MANUAL_PURGE_TRIGGER` audit log, and schedules recursive deletion immediately.

Manual purge metadata includes pipeline key, retention days, and cutoff timestamp. Keep this metadata compact but sufficient for incident review.

Do not add generic command execution or arbitrary collection deletion to this system. New purge capabilities should be explicit pipeline keys with bounded deletion logic, tests, UI labels, and audit evidence.

## Recursive Deletion

`executePurgeRecursive` is an internal mutation that deletes bounded batches and reschedules itself when more data remains.

Pipeline behavior:

- `agentLogs`: deletes up to 500 `agentLogs` rows older than the cutoff using `by_createdAt`.
- `userLogins`: deletes up to 500 `logins` rows older than the cutoff using `by_timestamp`.
- `auditLogs`: deletes up to 500 `auditLogs` rows older than the cutoff using `by_timestamp`.
- `workflowLogs`: deletes up to 200 old `workflowExecutions` using `by_startedAt` and cascades each execution's `workflowExecutionSteps` before deleting the execution.
- `chatHistory`: deletes up to 100 old `threads` using `by_updatedAt`, cascades messages, message attachment storage files, and swarm logs, then deletes the thread.

Chat history has an additional storage-file safety cap. When a batch reaches 200 deleted storage files, the mutation stops before deleting the partially processed thread and schedules another pass. This avoids deleting a thread before all of its messages, attachments, and related swarm logs are removed.

Each recursive pass checks that the `purgeHistory` row still exists and has `status: "RUNNING"`. If the run is no longer running, recursion stops. Successful partial batches update `recordsPurged` and schedule the next pass after 1000 ms. A completed run is patched to `SUCCESS` with `completedAt`. Errors patch the run to `FAILED` with the error message and completion timestamp.

## Cancellation

`cancelPurge` requires a super admin and only accepts running `purgeHistory` rows. It patches the run to `CANCELLED`, sets `completedAt`, and writes a `MANUAL_PURGE_CANCEL` audit log containing the pipeline key and records purged so far.

Cancellation does not roll back records already deleted by prior recursive passes. It stops future passes because `executePurgeRecursive` checks the history status before deleting the next batch.

## Purge History

`getRecentPurges` returns up to 500 recent purge history rows to super admins and enriches manual runs with actor names. Non-super-admin callers receive an empty list.

`getPurgeHistoryPaginated` exposes paginated purge history for super admins. The settings UI currently uses recent history and paginates client-side with the standard 15-row admin page size.

The `purgeHistory` record is operational evidence. Preserve `pipelineKey`, `triggerType`, `status`, `recordsPurged`, `startedAt`, `completedAt`, actor id, and error fields when changing the schema or UI.

## Audit-Only Purge Path

`convex/auditLogs.ts` also contains a separate audit purge config under `AUDIT_PURGE_CONFIG`.

This older path stores:

- `enabled`
- `retentionDays`
- `dayOfMonth`
- `hourOfDay`
- `nextRunTimestamp`

`updateConfig` requires a super admin, writes `AUDIT_PURGE_CONFIG`, and records `UPDATE_AUDIT_PURGE_CONFIG`. The audit dispatcher runs hourly, checks whether the monthly schedule is due, schedules `executePurge`, and advances the next run to the following month.

`executePurge` deletes up to 500 old audit logs and reschedules itself after 1000 ms when the batch is full. Unlike unified purges, this path does not create `purgeHistory` rows and does not have per-run cancellation.

Because unified purges also include an `auditLogs` pipeline, be careful when changing audit retention UI. Do not make both systems appear to be the same operational control unless the implementation has actually been consolidated.

## Authorization And Audit

Unified purge operations use `requireSuperAdmin` for config update, manual run, history pagination, and cancellation. `getRecentPurges` returns data only for super admins.

Audit events written by purge code include:

- `UPDATE_PURGE_PIPELINES`
- `MANUAL_PURGE_TRIGGER`
- `MANUAL_PURGE_CANCEL`
- `UPDATE_AUDIT_PURGE_CONFIG`

Avoid storing raw deleted data in audit metadata. Metadata should describe the operation, retention policy, cutoff, actor, and target pipeline, not the deleted record contents.

## Adding A New Pipeline

When adding a purge pipeline:

1. Add the key to `PurgePipelineKey` and `DEFAULT_PURGE_CONFIGS`.
2. Keep the default disabled unless there is a product decision to enable it.
3. Enforce the 30-day minimum retention floor unless a deliberate policy change updates tests and operator docs.
4. Add explicit bounded deletion logic in `executePurgeRecursive`.
5. Cascade child rows before parent rows where needed.
6. Update the settings UI labels and locale dictionaries in both English and Italian.
7. Add tests for config parsing, retention validation, manual run metadata, recursive deletion, cancellation behavior if applicable, and retention of newer records.
8. Update this guide and the platform operations guide.

## Verification

Focused tests include:

- `convex/purgeScheduleService.test.ts` for schedule calculation, config parsing, retention fallback, normalization, and cutoff calculation.
- `convex/purges.test.ts` for super-admin enforcement, retention-floor enforcement, cancellation, manual run history/audit metadata, recursive deletion, child-row retention, and newer-record retention.
- `convex/auditLogs.test.ts` and `convex/auditLogService.test.ts` for audit purge configuration, scheduling, and audit log behavior.
- `src/app/(dashboard)/admin/settings/_components/SettingsSections.test.tsx` and related settings tests for purge UI rendering.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
