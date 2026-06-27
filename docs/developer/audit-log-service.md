# Audit Log Service Developer Guide

Audit logs are Sonae's durable record for privileged administrative and operational actions. Feature modules usually write audit rows directly, while `convex/auditLogs.ts` provides an internal write helper, recent-feed reads, actor-name enrichment, and a separate audit-log purge configuration.

Read this before changing audit log schema, audit feed behavior, audit detail routing, audit purge configuration, or the way privileged mutations record evidence. For broader platform operations, see [Platform Operations Settings](./platform-operations-settings.md). For unified retention purges, see [Data Retention And Purges](./data-retention-and-purges.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/_components/AuditLogsTable.tsx` renders the audit feed inside System Settings.
- `src/app/(dashboard)/admin/audit-logs/[id]/page.tsx` renders one audit log detail from the recent feed.
- `convex/auditLogs.ts` owns the internal log helper, audit purge config, audit purge dispatcher, recursive audit purge, and recent log reads.
- `convex/auditLogService.ts` owns audit purge config helpers, monthly schedule calculations, cutoff calculation, serialization, and actor-name enrichment.
- `convex/schema.ts` defines `auditLogs` and its indexes.

Audit feed and purge configuration are super-admin-only. Non-super-admin users receive `null` for config and an empty recent log list.

## Data Model

`auditLogs` rows contain:

- `actorId`: user who performed the action
- `actionType`: stable event name such as `UPDATE_SYSTEM_PROMPT`
- optional `entityId`: target id
- `entityType`: target table or system area
- optional `metadata`: compact JSON string
- optional `companyId`: tenant context where relevant
- `timestamp`

Indexes are:

- `by_actor`
- `by_company`
- `by_timestamp`

Use `companyId` when the action is tenant-scoped. Many platform-wide actions deliberately omit it.

## Writing Audit Logs

Most modules insert directly into `auditLogs` after a privileged operation succeeds. `internal.auditLogs.logAction` is available for internal callers that want a shared write helper.

Good audit metadata is compact and operational:

- include ids needed for investigation
- include human-provided reasons for destructive actions, rollbacks, cancellations, or revocations
- include configuration keys and summary counts
- avoid raw secrets, raw webhook bodies, uploaded file content, full prompts when a length/hash is enough, and large payload dumps

Write the audit row in the same mutation as the state change when possible. If the state change and audit write cannot be atomic because an action is involved, make the handoff explicit and test the expected evidence.

## Recent Feed And Detail Route

`getRecentLogs` requires a super admin. It reads the latest 500 audit rows by timestamp and enriches each row with `actorName` using the actor's name, then email, then `Unknown Admin`.

The settings audit table:

- shows 15 rows per page through the shared admin page size
- searches by action type and actor name
- links rows to `/admin/audit-logs/{id}`
- falls back to static mock rows when the database feed is empty

The detail route also reads `getRecentLogs` and finds the requested id in the returned feed. This means very old rows outside the latest 500 records are not reachable from the current detail route. There is no dedicated `getById` query yet.

If exact historical detail lookup becomes a requirement, add a backend `getById` query with super-admin authorization instead of widening the recent feed indefinitely.

## Audit Purge Configuration

`convex/auditLogs.ts` contains an older audit-specific purge scheduler under `AUDIT_PURGE_CONFIG`.

Config fields are:

- `enabled`
- `retentionDays`
- `dayOfMonth`
- `hourOfDay`
- `nextRunTimestamp`

`getConfig` returns defaults when no config is stored and only returns data to super admins. `updateConfig` requires a super admin, computes the next monthly run timestamp, upserts the system config row, and writes `UPDATE_AUDIT_PURGE_CONFIG`.

The dispatcher runs hourly from `convex/crons.ts`. When due, it schedules `executePurge`, advances the next monthly run timestamp, and patches the config.

`executePurge` deletes up to 500 old audit rows by timestamp. If it deletes a full batch, it schedules another pass after 1000 ms.

This audit-specific purge path is separate from the unified purge engine's `auditLogs` pipeline. The audit-specific path does not create `purgeHistory` rows and does not support per-run cancellation.

## Authorization

Current access behavior:

- `getConfig`: returns `null` unless the current user is a super admin.
- `updateConfig`: requires `requireSuperAdmin`.
- `getRecentLogs`: returns an empty array unless the current user is a super admin.
- `logAction`: internal mutation only.
- `dispatcher` and `executePurge`: internal mutations only.

Do not expose company-admin reads of the platform audit feed without designing a company-scoped query. If a tenant audit feed is added, it should filter by `companyId`, avoid platform-only events, and have separate tests.

## Adding Audit Coverage

Add an audit log for privileged mutations that:

- create, update, revoke, delete, archive, activate, roll back, cancel, or impersonate
- change system configuration, model defaults, prompts, rules, connectors, keys, domains, retention, or release state
- perform destructive cleanup or bulk repair
- deny or block security-sensitive access

Use stable `actionType` names. Avoid action names that encode dynamic ids or user text.

When adding new coverage, add focused tests that assert the row exists, the action type is stable, the entity type/id are useful, tenant context is present when relevant, and metadata does not include raw secrets.

## Known Gaps

Current limitations to preserve in docs and operator expectations:

- The audit detail route only searches the recent feed.
- Empty feeds display mock rows in the UI.
- Audit coverage is broad but not uniform across all historical features.
- Audit metadata is free-form JSON strings, not a typed event schema.
- Audit purge behavior exists in both the older audit-specific path and the unified purge engine.

These are documentation and future-maintenance concerns. Do not silently change user-facing audit behavior from documentation automation.

## Verification

Focused tests include:

- `convex/auditLogs.test.ts` for super-admin access, non-super-admin empty/null behavior, config update, and actor-name enrichment in recent logs.
- `convex/auditLogService.test.ts` for default config parsing, persisted config parsing, next/following monthly schedule calculations, cutoff calculation, serialization, and actor-name fallbacks.
- Feature-specific tests that assert audit rows in modules such as users, companies, agents, API keys, releases, workflows, widgets, knowledge, settings, maintenance scripts, and purges.
- `src/app/(dashboard)/admin/settings/_components/AuditLogsTable.test.tsx` for loading, empty/mock, search, and row rendering behavior.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
