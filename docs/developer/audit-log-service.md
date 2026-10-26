---
product: Hakken
documentation_type: Developer guide
feature_area: Audit log service and evidence
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/audit-log-service.md
last_reviewed: '2026-10-26T15:01:33+00:00'
reviewed_against: current implementation
status: Current
---
# Audit Log Service Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Audit log service and evidence
> **Reviewed:** 26 October 2026, 15:01:33 GMT (Europe/London)
> **Source path:** `docs/developer/audit-log-service.md` · **Status:** Current

Audit logs are Hakken's durable record for privileged administrative and operational actions. Feature modules usually write audit rows directly, while `convex/auditLogs.ts` provides an internal write helper, recent-feed reads, actor-name enrichment, and governance-scoped audit projections.

Read this before changing audit log schema, audit feed behavior, audit detail routing, audit purge configuration, or the way privileged mutations record evidence. For broader platform operations, see [Platform Operations Settings](./platform-operations-settings.md). For unified retention purges, see [Data Retention And Purges](./data-retention-and-purges.md).

## Product Surface

- `src/ui/components/governance/AuditLogsTable.tsx` renders the audit feed inside System Settings.
- `src/app/(dashboard)/admin/audit-logs/[id]/page.tsx` renders one audit log detail from the recent feed.
- `convex/auditLogs.ts` owns the internal helper, recent read, indexed governance page/export, and direct governance entry read.
- `convex/auditLogService.ts` owns audit purge config helpers, monthly schedule calculations, cutoff calculation, serialization, and actor-name enrichment.
- `convex/schema.ts` defines `auditLogs` and its indexes.

Audit read functions check governance roles and scope ordinary callers to their active company. Retention configuration uses the separate current purge contracts.

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

`getRecentLogs` allows the configured governance read roles, with platform-wide scope only for SUPER_ADMIN and active-company scope otherwise. It reads the latest 500 audit rows by timestamp and enriches each row with `actorName` using the actor's name, then email, then `Unknown Admin`.

The settings audit table:

- shows 15 rows per page through the shared admin page size
- searches by action type and actor name
- links rows to `/admin/audit-logs/{id}`
- shows the actual empty state when the supplied feed has no rows

The detail route also reads `getRecentLogs` and finds the requested id in the returned feed. This means very old rows outside the latest 500 records are not reachable from the current detail route. The Governance detail route instead uses the existing `getAuditEntry` direct-ID query.

Use the existing authorized Governance entry route for historical detail rather than widening the old recent-feed route or inventing another direct-ID API.

## Audit Retention And Historical Helpers

The current deletion path is the unified audit retention pipeline in `purges.ts`, including protected purge-summary evidence. Older audit configuration/service helpers do not establish an active hourly dispatcher: current `auditLogs.ts` exports read/write evidence projections and the internal log helper, and the dedicated old scheduler was not found in current cron registration. Preserve historical notes, but use [Data retention](./data-retention-and-purges.md) for actual configured cleanup, cancellation and bounded batches.

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
- `src/ui/components/governance/AuditLogsTable.test.tsx` for loading, empty/mock, search, and row rendering behavior.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

## Current Read And Export Contracts

`getAuditPage` applies the authorized platform/company/date scope through indexes, then formats the feed for governance UI. `getAuditEntry` reads an ID directly and checks governance role plus company ownership before returning enriched fields, changes and details. This differs from `/admin/audit-logs/[id]`, whose compatibility screen still searches the 500-row recent feed. A missing entry on that older route is not proof the row was deleted.

`getAuditExport` reads at most 5,001 candidates to detect the 5,000-row export ceiling, then applies supported filters and records export evidence. An export is bounded; search/action/actor filtering after candidate selection does not reconstruct an unlimited archive. Super-admin platform reach and an ordinary oversight user's active-company reach must be preserved independently for list, detail and export.

`auditLogService.ts` formats field changes and recognized metadata using allowlisted/shortened values, including the 120-character value limit. Not every arbitrary raw metadata key belongs in a human detail/export. New audit writers should minimize data and avoid credentials, prompts, tokens, private memory content and uploaded documents. Personal-note audit deliberately records the event without its words.

Audit rows are evidence of what the application recorded, not a guarantee every privileged historical path wrote a complete row. Effects in actions and later audit writes can have separate failure points. Success of an export mutation does not prove an outside recipient received it or that every referenced entity still exists; deleted targets can require fallback labels. No export, purge, role change, record deletion or live verification was executed during this documentation review.

The current authority comes from `GOVERNANCE_READ_ROLES`, active-company helpers, and the owning handler; older prose listing only super-admin reads is superseded by these contracts. Relevant tests in auditLogs/auditLogService and governance UI provide local examples. Keep historical verification records separate from later API behavior and source fixes.
