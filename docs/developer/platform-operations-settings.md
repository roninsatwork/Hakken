---
product: Hakken
documentation_type: developer guide
feature_area: platform operations and inherited limits
audience: developers and operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/platform-operations-settings.md
last_reviewed: '2026-10-26T15:14:20+00:00'
reviewed_against: current implementation
status: Current
---
# Platform Operations Settings Developer Guide

> **Product:** Hakken · **Document type:** developer guide · **Feature area:** platform operations and inherited limits
> **Reviewed:** 26 October 2026, 15:14:20 GMT (Europe/London)
> **Source path:** `docs/developer/platform-operations-settings.md` · **Status:** Current


## Inherited Limits Implementation

This section is verified against the current Limits implementation. The operational sections below have been reconciled with their specialist guides after the limits, settings, diagnostics and rollup reviews. The relevant entry points are `convex/platformLimits.ts`, `companyDataLimits.ts`, `fanOutLimits.ts`, `sharedLimits.ts`, and the shared `src/app/(dashboard)/admin/_components/limits/LimitsScreen.tsx`. Plan quotas are covered separately in [Platform Plans And Quotas](./platform-plans-and-quotas.md); these configuration values must not be presented as paid seats or revenue.

`getPlatformLimits`, `getCompanyLimits`, `getSiteLimits`, and their three setters use super-admin query or mutation builders. Do not replace those with a company-scoped builder just because an argument contains a company ID. These are platform operator controls. The builder names distinguish capability, not identical role lists: `superAdminQuery` includes `READ_ONLY`; setters admit `SUPER_ADMIN` alone. The company query checks the company exists; the site query resolves the `companyWebsites` hold and website, and returns null for a missing hold. The supplied hold identifies the company used for resolution. A global website identity and a company's holding are different entities.

`LIMITS` assembles the data, fan-out, and shared definitions into one registry. Every entry supplies choices, a starting number, reach, and competitor applicability. `COMPANY_KEYS` excludes platform-only entries. `WEBSITE_KEYS` contains website-reachable entries. `getSiteLimits` filters those further for competitor holdings. The setters validate keys and allowed numeric choices through `assertLimits` before routing changes to the existing storage helpers. Missing keys preserve prior settings; null means inheritance for company and website mutations. The platform setter accepts numeric values only.

Data limits are `keywordsPerSite`, `everydayKeywords`, and `backlinksPerSite`. Their allowed choices currently range from 100 to 10,000 through the enumerated `DATA_LIMIT_CHOICES`, with built-in starts of 1,000. `platformDataLimits` combines saved platform values with starts. `readCompanyDataLimits` overlays a company row. `resolveSiteDataLimits` overlays a holding row field by field and returns flags distinguishing explicit website choices. `readSiteDataLimits` provides the consumer-facing resolution path. Do not copy constants into a new consumer when the resolver already expresses the hierarchy.

Data overrides live in `companyDataLimits` and `websiteDataLimits`. The holding override also stores company identity. `writeCompanyDataLimits` and `writeSiteDataLimits` validate target records, calculate the resulting own fields, replace or insert the row, and delete it when every field inherits. They record actual changed fields in `auditLogs` as `DATA_LIMITS_CHANGED`, identifying the company or holding. No audit entry is emitted for unchanged values. A reset is represented as the parent level in audit metadata, not as a stored null numeric value.

Fan-out settings use `fanOutLimits` rows for company or holding overrides. The resolver reads the platform row and overlays a company row, then an eligible site row only for site-scoped keys. `writeSiteFanOutLimits` refuses competitor holdings; the competitor's data limits are handled separately. `writeCompanyFanOutLimits` and `writeSiteFanOutLimits` audit changed values as `FAN_OUT_LIMITS_CHANGED`. Changing `sitemapPagesRead` also calls `noteDataChanged` for the affected own-website page materialisation. The company path enumerates holdings up to its configured bound. This marks data for rebuilding; the setter is not itself a provider fetch or proof of a completed rebuilt list.

The shared registry has platform-only limits for fan-out queries, cited sources, businesses, newly found websites, overview searches, and download rows. `sharedLimitsOf` merges the platform row and fallbacks; `getSharedLimits` is an internal query for actions that cannot read the database. `sharedLimitCeiling` gives the maximum supported choice for callers requiring an upper read bound. A shared AI answer or purchase serves multiple companies, which is why an individual company's override cannot redefine its parse size. Preserve that distinction when adding a new setting.

`setPlatformLimits` stores changed values in `platformLimits` with `updatedAt` and writes `PLATFORM_LIMITS_CHANGED`. Company and site setters split data from fan-out changes, then call the corresponding helpers within the mutation. They do not dispatch a universal cleanup, re-buy data, recompute every historical report, or synchronise billing. Verify each consumer before describing the effect of a decrease as deletion or the effect of an increase as immediate expanded results.

The platform, company, and site pages use the same `LimitsScreen`. `limitTopics.ts` groups every backend key and supplies units. Each `TopicCard` keeps only touched dropdown edits, converts the inherited empty option to null, and submits only changed keys through `useAdminAction`. Each card owns its save state. Company pages pass platform-only values into read-only shared cards linking to `/admin/settings/limits`; site pages omit those cards. The query's `others` lists show explicit lower-level overrides, not every record. `OWN_ROWS_READ` bounds platform override summaries at 2,000 rows per queried table; never treat these summaries as an exhaustive migration input.

Relevant local test sources are `convex/platformLimits.test.ts`, `convex/fanOutLimits.test.ts`, and the shared screen's `LimitsScreen.test.tsx`. The first checks inheritance, company-only reach, choice validation, super-admin access, audit records, shared values, competitor applicability, and complete topic/unit/locale coverage. The fan-out tests check resolution and application to rebuilds. These test declarations were inspected, not executed in this documentation pass. None establishes live supplier acceptance, available provider balance, deployment status, or a full retention contract.

Platform operations settings cover API keys, webhook delivery internals, maintenance scripts, data retention, analytics health, system health, external connection checks, auth diagnostics, and audit log detail. These surfaces are implemented as admin operations rather than customer-facing product workflows, but they are important for launch support, incident response, and integration safety. For analytics rollups and data-health internals, see [Analytics Rollups](./analytics-rollups.md). For audit feed and audit purge internals, see [Audit Log Service](./audit-log-service.md). For auth event diagnostics, see [Auth Diagnostics](./auth-diagnostics.md). For email sender resolution, see [Email Branding](./email-branding.md). For maintenance script internals, see [Maintenance Scripts](./maintenance-scripts.md). For purge execution internals, see [Data Retention And Purges](./data-retention-and-purges.md). For health reports and daily platform alert emails, see [System Health And Platform Alerts](./system-health-and-platform-alerts.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/(system)/layout.tsx` renders the two-level settings menu: Identity, Security, White Label, and System Options, each opening the screens beneath it. It sits in a `(system)` route group so the sibling Plans, API Keys, Analytics and Scripts routes do not inherit it.
- Each section is its own route and saves only itself: `(system)/identity`, `(system)/identity/aesthetics`, `(system)/security`, `(system)/security/retention`, and `(system)/options` plus `self-improvement`, `approvals`.
- `src/app/(dashboard)/admin/settings/page.tsx` is now only an entry point: it forwards `/admin/settings` and every legacy `?tab=` link to the route that replaced it, using `_components/settingsTabs.ts`.
- `src/app/(dashboard)/admin/settings/_components/useSystemSettingsForm.ts` holds the `systemSettings` document for the three screens that write it (Core Identity, Global Aesthetics, Developer Diagnostics), each with its own save.
- `src/app/(dashboard)/admin/settings/_components/RetentionRulesSection.tsx` renders unified purge configuration, manual purge confirmation, cancellation, and recent purge history.
- `src/app/(dashboard)/admin/settings/analytics/page.tsx` manages the global analytics tracking id and renders seven-day analytics data-health checks.
- `src/app/(dashboard)/admin/settings/api-keys/page.tsx` manages tenant-scoped API keys.
- `src/app/(dashboard)/admin/settings/scripts/page.tsx` lists allowlisted maintenance scripts.
- `src/app/(dashboard)/admin/settings/scripts/[scriptId]/page.tsx` shows one script, run guidance, and history.
- `src/app/(dashboard)/admin/health/page.tsx` renders platform health, alert rules, budget pressure, analytics health, and runbook signals.
- `src/app/(dashboard)/admin/connections/page.tsx` renders external dependency probe state and scheduled job recency from `api.connectionProbes` and `api.jobLedger`.
- `src/app/(dashboard)/admin/auth-diagnostics/page.tsx` re-exports the shared auth diagnostics page.
- `src/app/(dashboard)/app/settings/auth-diagnostics/page.tsx` exposes the company settings diagnostics route.
- `src/app/(dashboard)/admin/audit-logs/[id]/page.tsx` renders one audit log record from the settings audit feed.

Shared screen-kit table components and `TABLE_PAGE_SIZE` are used for API keys, connection checks, job rows, scripts, and other table screens. Keep the 15-row admin pagination convention.

## System Settings Shell

The settings screens read and write these modules:

- `api.settings.get`, `api.settings.update`, and `api.settings.generateUploadUrl` for platform identity, logos, appearance, email sender values, theme tokens, and diagnostic routing.
- `api.system.getPiiConfig` and `api.system.updatePiiConfig` for PII masking configuration.
- `api.auditLogs.getRecentLogs` for the audit feed. The separate audit-only retention engine that used to sit on the security tab has been removed; `api.purges.*` is the only thing that clears audit records.
- `api.purges.*` through `PurgesSettingsSection` for the unified purge engine.

Each screen owns its own save button, so a save only writes that screen. The single header button this replaced wrote the whole settings document from whichever tab was open. The six White Label screens are read-only evidence views and render no save at all — keep that distinction when adding a screen.

`/admin/settings/options/self-improvement` reads and writes the audited `SELF_IMPROVEMENT_CONFIG` through `convex/selfImprovementConfig.ts`. The five independent switches are `autoReflection`, `outcomeWeightedRanking`, `endUserFeedback`, `retrievalPriors`, and `autonomousMemory`; missing or malformed fields fall back individually to defaults, which are currently all true. Autonomous memory can write safe candidates directly to active memory, while the other switches collect or rank evidence. Do not use this configuration as authority to auto-apply prompt, tool, skill, routing, approval-policy, or eval changes.

Logo uploads use the `adminImage` frontend policy and `settings.generateUploadUrl`; backend validation still happens when settings are saved. Settings updates write `UPDATE_SYSTEM_PREFERENCES` audit logs from `convex/settings.ts`, while PII updates write their own audit entries from `convex/system.ts`.

## API Keys

`convex/apiKeys.ts` implements key listing, creation, revocation, and public request authentication. API keys are company-scoped and can have `agent:run`, `workflow:run` and `run:read` scopes. `webhook:deliver` is still accepted so existing keys read back correctly, but it is no longer offered on screen: no endpoint has ever checked it, so it granted access to nothing.

Creation normalizes the name, scopes, expiration, and rate limit. The raw key is generated once, returned to the caller, digested with SHA-256, and stored as `keyDigest` plus `keyPrefix`. Revocation stores status, revoker, timestamp, and optional reason. Creation and revocation write audit logs.

`authenticatePublicRequest` is an internal mutation for public API handlers. It extracts the key prefix, finds active keys by prefix, compares digests in constant time, checks company, status, expiration, scope, and per-minute rate limit, records the request in `publicApiRequests`, and returns the authenticated key context or an error result.

Do not store or display raw API keys after creation. New public API routes should call the authentication path and require the narrowest scope possible.

## Webhook Deliveries

Webhook deliveries have no listing screen. The delivery engine — queueing, dispatch, retry backoff and per-attempt recording — is built and works, but nothing queues a delivery and there is nowhere in the product to register a destination URL, so the log could never contain anything. The screen was removed rather than left showing an empty log of an event that cannot happen. To make webhooks real: give a company somewhere to store a destination, and call `recordQueuedInternal` when a run finishes.

## Maintenance Scripts

`convex/maintenanceScriptRegistry.ts` is the allowlist. One current script id is `inventory-rollup-rebuild`, categorized as low-risk inventory maintenance; the maintenance guide explains the wider allowlist and migration operations. It recalculates global inventory rollup values from current companies, users, and plans.

`convex/maintenanceScripts.ts` lists definitions, reads one script with its last 10 runs, and executes scripts. Execution creates a `maintenanceScriptRuns` row, writes `MAINTENANCE_SCRIPT_STARTED`, runs the allowlisted implementation, patches the run to success or failed, and writes a matching success or failure audit log.

Do not add arbitrary shell execution. New scripts should have a typed registry entry, clear risk level, repeatability guidance, expected changes, an idempotent or explicitly bounded implementation, tests, and audit metadata.

The detailed script registry, execution, audit, history, and extension contract is documented in [Maintenance Scripts](./maintenance-scripts.md).

## Data Retention And Purges

`convex/purges.ts` implements the unified purge engine for agent logs, workflow logs, user logins, chat history, and audit logs. It supports super-admin configuration, manual runs, scheduled runs, recursive deletion, cancellation, purge history, and audit evidence. The older audit-only purge scheduler is absent from the current `convex/auditLogs.ts` exports and active cron wiring; use the unified engine rather than old scheduler instructions.

The settings UI exposes unified purge state through `PurgesSettingsSection`. It reads `api.purges.getPipelineConfig` and `api.purges.getRecentPurges`, updates the entire pipeline config map through `api.purges.updatePipelineConfig`, triggers manual runs through `api.purges.runManualPurge`, and cancels active runs through `api.purges.cancelPurge`. The UI paginates recent purge history with `ADMIN_PAGE_SIZE`.

The detailed retention contract, pipeline behavior, batch limits, cancellation semantics, and audit-only purge caveat are documented in [Data Retention And Purges](./data-retention-and-purges.md).

## System Health

`src/app/(dashboard)/admin/health/page.tsx` reads system health from `api.systemHealth.getSystemHealthForAdmin` and renders signal rows, alert rule cards, budget pressure, analytics health, and a downloadable JSON report.

Health report construction is supported by `convex/platformAlertService.ts` and related system/analytics modules. The report covers missing or duplicate analytics snapshots, message dimension drift, missing threads, agent error logs, failed transactions, stale runs, pending approvals, failed tool calls, provider failures, high-cost agents, budget pressure, failed or stale scheduled executions, overdue schedules, and schedules missing a next run.

Keep health signals actionable. Each signal should include counts, examples when possible, and a runbook that points operators to the next screen or repair path.

The detailed health-report shape, scoping behavior, threshold rules, platform alert decision flow, email dispatch path, and extension checklist are documented in [System Health And Platform Alerts](./system-health-and-platform-alerts.md).

## Connection Probes And Job Ledger

`src/app/(dashboard)/admin/connections/page.tsx` reads:

- `api.connectionProbes.listConnections` for configured dependency probe rows.
- `api.jobLedger.listJobRuns` for recent scheduled-job execution state.
- `api.connectionProbes.probeConnectionsNow` for the write-gated Check Now action.

The screen searches and paginates both tables client-side with
`TABLE_PAGE_SIZE`. Status copy must include words, not colour alone. This page
answers "can the outside dependency be reached?" and "has the scheduled
machinery reported recently?" System Health answers a different question:
whether Hakken's own stored data and operational thresholds look healthy.

Backend ownership lives in `convex/connectionProbes.ts`, `convex/jobLedger.ts`,
and scheduled wiring in `convex/crons.ts`. Probe state is stored on existing
connector/provider records; scheduled-job outcomes are stored in `jobRuns`. Add
tests there when adding a new probe, changing the job ledger row shape, or
changing manual-probe authorization.

## Analytics Rollups

`convex/analyticsSnapshots.ts` generates daily `analyticsDailySnapshots` for global, company, and user usage. `convex/analytics.ts` combines historical snapshots with today's live messages and agent transactions for admin dashboards. The analytics settings page also surfaces snapshot coverage and message dimension health.

`admin/settings/analytics/page.tsx` reads `api.system.getAnalyticsId`, writes `api.system.updateAnalyticsId`, and reads `api.systemHealth.getAnalyticsDataHealthForAdmin` with a seven-day window. It treats the tracking id and data-health report separately: saving a GTM/GA id updates frontend analytics mounting, while health signals report snapshot coverage, duplicate groups, missing or mismatched message dimensions, missing threads, and live counts.

The detailed rollup schema, snapshot generation flow, attribution rules, cost calculation, data-health checks, message-dimension backfill, and historical seeding behavior are documented in [Analytics Rollups](./analytics-rollups.md).

## Auth Diagnostics And Audit Detail

The auth diagnostics routes share `src/app/(dashboard)/_features/auth-diagnostics/AuthDiagnosticsPage.tsx`. Keep any sensitive auth data role-scoped in the backend and avoid exposing global admin-only diagnostics in the company settings route.

The detailed `authEvents` schema, logging sources, admin/company scoping, UI filters, and extension checklist are documented in [Auth Diagnostics](./auth-diagnostics.md).

`convex/auditLogs.ts` implements audit writes, bounded recent reads, paginated Governance reads, filters, export and direct `getAuditEntry`. The legacy `/admin/audit-logs/[id]` page still resolves against its recent feed with demo fallback behavior; Governance detail uses direct entry lookup with its own role/company checks. Do not apply the legacy recent-feed limitation to every audit-detail route.

When adding privileged operations, write explicit audit logs with actor, entity type, entity id, company id where relevant, timestamp, and compact metadata. Avoid storing raw secrets, raw webhook bodies, or large payloads in audit metadata.

The detailed audit row contract, recent-feed behavior, detail-route limitation, retired audit-only scheduler, and audit coverage checklist are documented in [Audit Log Service](./audit-log-service.md).

## Data Model

Relevant tables in `convex/schema.ts` include `apiKeys`, `publicApiRequests`, `webhookDeliveries`, `maintenanceScriptRuns`, `jobRuns`, `toolConnectors`, `aiProviders`, `auditLogs`, `systemConfig`, `analyticsDailySnapshots`, `inventoryRollups`, `agentRuns`, `agentToolCalls`, and schedule/workflow execution tables used by health reporting.

API key and webhook tables are indexed by company and created/status fields for admin filtering. Maintenance runs are indexed by script and start time. Audit logs are indexed by actor, company, and timestamp.

## Verification

Focused tests include `convex/apiKeys.test.ts`, `convex/webhookDeliveries.test.ts`, `convex/webhookDeliveryActions.ts` coverage where present, `convex/maintenanceScripts.test.ts`, `convex/connectionProbes.test.ts`, `convex/jobLedger.test.ts`, `convex/system.test.ts`, `convex/systemService.test.ts`, `convex/platformAlertService.test.ts`, `convex/auditLogs.test.ts`, and UI tests for settings pages.

For documentation-only edits, run `git diff --check`. Before merging code changes in this area, run the full repo gate:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run test:coverage
npm run coverage:check
npm run test:e2e:smoke
npm run build
git diff --check
```
