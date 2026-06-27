# Platform Operations Settings Developer Guide

Platform operations settings cover API keys, webhook delivery logs, maintenance scripts, data retention, analytics health, system health, auth diagnostics, and audit log detail. These surfaces are implemented as admin operations rather than customer-facing product workflows, but they are important for launch support, incident response, and integration safety. For analytics rollups and data-health internals, see [Analytics Rollups](./analytics-rollups.md). For audit feed and audit purge internals, see [Audit Log Service](./audit-log-service.md). For auth event diagnostics, see [Auth Diagnostics](./auth-diagnostics.md). For email sender resolution, see [Email Branding](./email-branding.md). For maintenance script internals, see [Maintenance Scripts](./maintenance-scripts.md). For purge execution internals, see [Data Retention And Purges](./data-retention-and-purges.md). For health reports and daily platform alert emails, see [System Health And Platform Alerts](./system-health-and-platform-alerts.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/api-keys/page.tsx` manages tenant-scoped API keys.
- `src/app/(dashboard)/admin/settings/webhook-deliveries/page.tsx` lists callback delivery attempts and summaries.
- `src/app/(dashboard)/admin/settings/scripts/page.tsx` lists allowlisted maintenance scripts.
- `src/app/(dashboard)/admin/settings/scripts/[scriptId]/page.tsx` shows one script, run guidance, and history.
- `src/app/(dashboard)/admin/settings/system-health/page.tsx` renders platform health, alert rules, budget pressure, analytics health, and runbook signals.
- `src/app/(dashboard)/admin/auth-diagnostics/page.tsx` re-exports the shared auth diagnostics page.
- `src/app/(dashboard)/app/settings/auth-diagnostics/page.tsx` exposes the company settings diagnostics route.
- `src/app/(dashboard)/admin/audit-logs/[id]/page.tsx` renders one audit log record from the settings audit feed.

Shared admin table components and `ADMIN_PAGE_SIZE` are used for API keys, webhook deliveries, and scripts. Keep the 15-row admin pagination convention.

## API Keys

`convex/apiKeys.ts` implements key listing, creation, revocation, and public request authentication. API keys are company-scoped and can have `agent:run`, `workflow:run`, `run:read`, and `webhook:deliver` scopes.

Creation normalizes the name, scopes, expiration, and rate limit. The raw key is generated once, returned to the caller, digested with SHA-256, and stored as `keyDigest` plus `keyPrefix`. Revocation stores status, revoker, timestamp, and optional reason. Creation and revocation write audit logs.

`authenticatePublicRequest` is an internal mutation for public API handlers. It extracts the key prefix, finds active keys by prefix, compares digests in constant time, checks company, status, expiration, scope, and per-minute rate limit, records the request in `publicApiRequests`, and returns the authenticated key context or an error result.

Do not store or display raw API keys after creation. New public API routes should call the authentication path and require the narrowest scope possible.

## Webhook Deliveries

`convex/webhookDeliveries.ts` stores and lists webhook delivery records. Admin queries support platform or company scope, status filters, 7-day summaries, success rate, retry counts, failed/abandoned counts, and next-action text.

Internal mutations record queued deliveries, schedule dispatch, and record attempts. Event type, destination URL, payload JSON, preview, max attempts, status, status code, errors, response previews, retry time, and delivery time are normalized. Payload previews are capped and full payloads are passed to the dispatch action rather than kept as long-term log data.

`convex/webhookDeliveryActions.ts` performs dispatch. It loads the delivery, sends the callback, records success or failure, and schedules retries until attempts are exhausted. Keep retry decisions and payload preview limits aligned with the UI's promise that logs are evidence, not payload archives.

## Maintenance Scripts

`convex/maintenanceScriptRegistry.ts` is the allowlist. The current script id is `inventory-rollup-rebuild`, categorized as low-risk inventory maintenance. It recalculates global inventory rollup values from current companies, users, and plans.

`convex/maintenanceScripts.ts` lists definitions, reads one script with its last 10 runs, and executes scripts. Execution creates a `maintenanceScriptRuns` row, writes `MAINTENANCE_SCRIPT_STARTED`, runs the allowlisted implementation, patches the run to success or failed, and writes a matching success or failure audit log.

Do not add arbitrary shell execution. New scripts should have a typed registry entry, clear risk level, repeatability guidance, expected changes, an idempotent or explicitly bounded implementation, tests, and audit metadata.

The detailed script registry, execution, audit, history, and extension contract is documented in [Maintenance Scripts](./maintenance-scripts.md).

## Data Retention And Purges

`convex/purges.ts` implements the unified purge engine for agent logs, workflow logs, user logins, chat history, and audit logs. It supports super-admin configuration, manual runs, scheduled runs, recursive deletion, cancellation, purge history, and audit evidence. `convex/auditLogs.ts` also contains a separate older audit-log purge scheduler.

The detailed retention contract, pipeline behavior, batch limits, cancellation semantics, and audit-only purge caveat are documented in [Data Retention And Purges](./data-retention-and-purges.md).

## System Health

`src/app/(dashboard)/admin/settings/system-health/page.tsx` reads system health from `api.analyticsCron.getSystemHealthForAdmin` and renders signal rows, alert rule cards, budget pressure, analytics health, and a downloadable JSON report.

Health report construction is supported by `convex/platformAlertService.ts` and related system/analytics modules. The report covers missing or duplicate analytics snapshots, message dimension drift, missing threads, agent error logs, failed transactions, stale runs, pending approvals, failed tool calls, provider failures, high-cost agents, budget pressure, failed or stale scheduled executions, overdue schedules, and schedules missing a next run.

Keep health signals actionable. Each signal should include counts, examples when possible, and a runbook that points operators to the next screen or repair path.

The detailed health-report shape, scoping behavior, threshold rules, platform alert decision flow, email dispatch path, and extension checklist are documented in [System Health And Platform Alerts](./system-health-and-platform-alerts.md).

## Analytics Rollups

`convex/analyticsCron.ts` generates daily `analyticsDailySnapshots` for global, company, and user usage. `convex/analytics.ts` combines historical snapshots with today's live messages and agent transactions for admin dashboards. The analytics settings page also surfaces snapshot coverage and message dimension health.

The detailed rollup schema, snapshot generation flow, attribution rules, cost calculation, data-health checks, message-dimension backfill, and historical seeding behavior are documented in [Analytics Rollups](./analytics-rollups.md).

## Auth Diagnostics And Audit Detail

The auth diagnostics routes share `src/app/(dashboard)/_features/auth-diagnostics/AuthDiagnosticsPage.tsx`. Keep any sensitive auth data role-scoped in the backend and avoid exposing global admin-only diagnostics in the company settings route.

The detailed `authEvents` schema, logging sources, admin/company scoping, UI filters, and extension checklist are documented in [Auth Diagnostics](./auth-diagnostics.md).

`convex/auditLogs.ts` handles audit log writes, config, purging, dispatch, and recent log reads. The current detail route reads `api.auditLogs.getRecentLogs` and falls back to static demo records when the database is empty. Because detail lookup searches the recent feed rather than a dedicated `getById` query, very old audit rows may not be reachable from that detail route without a future backend addition.

When adding privileged operations, write explicit audit logs with actor, entity type, entity id, company id where relevant, timestamp, and compact metadata. Avoid storing raw secrets, raw webhook bodies, or large payloads in audit metadata.

The detailed audit row contract, recent-feed behavior, detail-route limitation, audit-specific purge path, and audit coverage checklist are documented in [Audit Log Service](./audit-log-service.md).

## Data Model

Relevant tables in `convex/schema.ts` include `apiKeys`, `publicApiRequests`, `webhookDeliveries`, `maintenanceScriptRuns`, `auditLogs`, `systemConfig`, `analyticsDailySnapshots`, `inventoryRollups`, `agentRuns`, `agentToolCalls`, and schedule/workflow execution tables used by health reporting.

API key and webhook tables are indexed by company and created/status fields for admin filtering. Maintenance runs are indexed by script and start time. Audit logs are indexed by actor, company, and timestamp.

## Verification

Focused tests include `convex/apiKeys.test.ts`, `convex/webhookDeliveries.test.ts`, `convex/webhookDeliveryActions.ts` coverage where present, `convex/maintenanceScripts.test.ts`, `convex/system.test.ts`, `convex/systemService.test.ts`, `convex/platformAlertService.test.ts`, `convex/auditLogs.test.ts`, and UI tests for settings pages.

For documentation-only edits, run `git diff --check`. Before merging code changes in this area, run the full repo gate:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
