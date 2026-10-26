---
product: Hakken
documentation_type: End-user guide
feature_area: Operational diagnostics and retention
audience: authorized administrators and operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/operational-diagnostics-and-retention.md
last_reviewed: '2026-10-26T14:40:17+00:00'
reviewed_against: current implementation
status: Current
---
# Operational Diagnostics And Retention

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Operational diagnostics and retention
> **Reviewed:** 26 October 2026, 14:40:17 GMT (Europe/London)
> **Source path:** `docs/end-user/operational-diagnostics-and-retention.md` · **Status:** Current


Operational diagnostics and retention controls help Hakken operators explain privileged changes, troubleshoot authentication, inspect analytics data health, and manage bounded purges. These are sensitive administration surfaces. Use them deliberately and keep customer data, secrets, and audit evidence in approved systems.

For incident health checks and maintenance scripts, see [System Health And Maintenance](./system-health-and-maintenance.md). For public integration operations, see [Public API And Webhooks](./public-api-and-webhooks.md).

## Where To Find It

- `/admin/auth-diagnostics`: platform auth diagnostics for super admins and admins.
- `/app/settings/auth-diagnostics`: company settings auth diagnostics route.
- `/admin/audit-logs/[id]`: one audit log detail from the settings audit feed.
- `/admin/settings/analytics`: analytics settings and data-health checks.
- `/admin/settings/security/retention`: unified retention rules, previews, manual purge actions and cancellation.
- `/admin/settings/security/purge-history`: paginated purge history.
- `/admin/settings?tab=audit`: audit settings and audit feed entry points where available.

Access depends on role and scope. Super admins can review platform-wide operations where implemented. Company admins only receive scoped diagnostics where the backend supports it.

## Auth Diagnostics

Auth diagnostics show login, magic-link, invite, and provisioning events. Use them when a user cannot sign in, received the wrong invite behavior, appears in the wrong company, or has a role or provisioning mismatch.

Current event evidence can include:

- magic link requested
- magic link started
- magic link verified
- invite found
- invite missing
- invite expired
- invite revoked
- stale accepted invite recovered
- user found
- email dispatch simulated
- email dispatch started
- email dispatch failed

The diagnostics page supports searching, event-type filtering, time-window filtering, and company filtering for super admins.

Use diagnostics to decide whether to resend an invite, correct a user/company assignment, revoke and recreate an invite, or inspect email delivery configuration. Do not treat diagnostics as an authorization override.

## Audit Log Detail

Audit logs explain privileged changes and security-sensitive events. The detail view shows the event signature, timestamp, actor, target object, and metadata captured for one event.

Use audit detail when investigating:

- company changes
- user and invitation changes
- super-admin access changes
- impersonation activity
- system prompt or rule changes
- model default changes
- API key creation or revocation
- maintenance script execution
- purge configuration or manual purge actions

Audit coverage is broad but not uniform across all historical features. The older `/admin/audit-logs/[id]` compatibility route searches the recent feed, while Governance detail uses an authorized direct-entry query. When a decision depends on audit evidence, check the feature-specific screen as well as the audit detail.

Do not store or copy raw secrets, raw webhook payloads, or large customer data in audit notes.

## Analytics Settings And Data Health

Analytics settings and health checks help operators understand whether dashboard data is complete and internally consistent.

Use analytics settings when:

- dashboard counts look stale
- daily snapshots are missing
- duplicate snapshot groups appear
- message analytics dimensions are missing or mismatched
- a thread referenced by message analytics is missing
- cost or usage reports do not match expected recent activity

System health links to analytics data health when it detects drift. Start with the reported examples, then use analytics tools to validate or repair the affected dimensions.

Do not treat sampled run observatory costs as a replacement for analytics dashboards. The observatory is recent triage; analytics rollups are the reporting path for broader cost and usage views.

## Unified Purge Settings

Purge settings control bounded deletion of old operational data. The original five pipeline families remain part of the current eighteen-pipeline register:

- agent logs
- workflow logs
- user logins
- chat history
- audit logs

Current unified purge defaults are enabled and enforce a minimum retention floor. Operators can configure schedules, run a manual purge, cancel a running purge, and review recent purge history.

Purge schedules can be hourly, daily, weekly, or monthly. Scheduled runs create purge history rows. Manual runs also record who triggered the purge and the retention cutoff.

Purges delete records permanently. Cancellation stops future recursive deletion passes but does not restore records already deleted.

## Audit Retention Caveat

Current audit retention runs through the unified audit-log pipeline. The older audit-specific dispatcher, execution functions and cron registration were not found in the inspected current handlers. Some legacy parsing helpers and event labels remain in `convex/auditLogService.ts`; these do not establish an active second scheduler. Historical operations may have followed a different path. Keep their original records and investigate before claiming that every old purge appears in the current ledger.

## Before Running A Manual Purge

Before running a manual purge:

1. Confirm the pipeline and retention period.
2. Confirm the data class is safe to delete under customer, legal, and support expectations.
3. Check whether a scheduled purge is already due.
4. Review recent purge history.
5. Record the operational reason.

Never use purge settings as a quick way to hide a problem. If data is incorrect, investigate the source first.

## Troubleshooting

If auth diagnostics show `INVITE_MISSING`, confirm the email spelling and whether the user should be invited to a company.

If auth diagnostics show `INVITE_EXPIRED` or `INVITE_REVOKED`, issue a new invite only after confirming the user's role and company.

If audit detail is missing for an old event, check the feature-specific history and remember that the current detail route searches recent logs.

If analytics data-health drift appears, review the examples and use the analytics repair path before trusting trend charts.

If a purge is running longer than expected, review purge history. Cancel only if the purge target or retention policy was wrong; cancellation will not restore already deleted records.

## Current Retention Rules And Defaults

This review revalidated the retention sections and current purge screens. The earlier authentication and analytics diagnostic sections remain a useful orientation but still need their own focused refresh with System Health and analytics documentation. The guide is therefore marked Needs review rather than claiming every diagnostic statement is current.

The current retention register contains eighteen named pipelines. Agent logs, workflow logs, audit logs, public API requests, webhook deliveries, individual AI cost rows, phone calls, decision records, recurring-task checks and Reading room events default to ninety days. Login records, authentication events, chat history and agent-run history default to 180 days. AI action rate-limit counters default to thirty days, analytics daily snapshots to 400 days, settled email rows to sixty days, and purge history to 365 days. Existing saved settings override defaults, including an older saved decision to disable a pipeline. An enabled default does not prove that a deployed operator has left it enabled or that a scheduled run succeeded.

The rules screen offers a bounded preview of eligible records, schedule configuration and Run now. The normal administration table uses fifteen rows per page, so the eighteenth rule may require another page or a search. READ_ONLY accounts can inspect rules, running jobs and history. Only super admins can save configuration, start a manual purge or cancel one. Company admins do not receive permission to delete platform data through this screen.

Schedules use UTC rather than the viewing browser's local timezone. The saved interval can be hourly, daily, weekly or monthly, with monthly day selection limited to the first through twenty-eighth. A daily default uses 02:00 UTC; local UK clock time differs during summer. The hourly dispatcher checks schedules at minute fifteen, so a nominal due time is not a promise that deletion begins at that exact minute. A new unset configuration is seeded and initialized before subsequent due runs.

## Interpret Previews And Results

A preview is a bounded count of candidate parent records, not an exact size estimate, a backup or a deletion proof. Large counts are capped. Some families apply additional rules during deletion: an unfinished agent run is retained, unsent or sending email is retained, and the newest purge-history records are protected. Audit-purge summary records also survive ordinary audit retention. A preview can consequently differ from the eventual result without every difference indicating a failed job.

Run now uses the saved retention for that pipeline and rejects a second concurrent running purge of the same kind. It does not bypass the thirty-day retention floor. The run has its own cutoff; later changes to the saved rule do not rewrite the cutoff already handed to its deletion chain. Batches continue automatically, so a person does not need to repeatedly press Run now to work through an ordinary large history.

The history ledger distinguishes manual from scheduled work and shows status, actor, timestamps and records purged. The count's meaning depends on the pipeline: chat counts completed threads and agent history counts completed runs, while simpler pipelines count table rows. These are not bytes saved or a combined count of every child row. History is loaded in server pages; local search filters loaded history, so a missing search result need not mean the entire archive was searched.

Cancellation stops later batches and does not restore earlier deletions. A stalled run is marked failed after thirty minutes without progress when the ten-minute reaper sees it, allowing an operator to investigate and authorize recovery. A failure is not an automatic promise that nothing was removed. Check recorded progress and any stored-file deletion failures before explaining the outcome to a customer.

## Deletion Boundaries

Chat-history retention drains old messages, their inspected feedback, attachment files, memory-use records and swarm logs before removing a completed thread. The worker deliberately leaves a partly processed thread for another pass. Storage deletion errors are recorded as leaked file identifiers in purge evidence; the overall run can still finish successfully. A success label therefore needs to be read alongside that evidence when the question is complete file removal.

Phone-call retention ages by start time even if a final provider callback never arrived. It removes the stored call row, including its saved transcript, but does not establish deletion at a phone provider. Settled email retention removes SENT, FAILED and SKIPPED outbox records; pending and sending messages remain. Reading events and individual cost rows can expire while their retained summary reports continue to exist.

These operational retention rules differ from deleting a person, disconnecting a website integration or resetting a browser widget. Each operation has its own ownership and lifecycle contract. Read [Governance And Trust](./governance-and-trust.md) for the personal-data manifest and exceptions, and [Embedded Widgets](./embedded-widgets.md) for browser reset behavior. No purge, live measurement, provider call or destructive verification was performed during this documentation pass.

## Inventory Values And Report Coverage

The platform's provisioned user/company totals and plan-value estimate come from a maintained inventory summary. A repair rebuild refuses populations above its safe counting limit rather than replacing them with a shortened total. The stored value labeled mrr is based on active plan price times assigned companies. It is not Stripe collected revenue, a paid-company count, or the number of covered users. Use the approved billing screens and operator handoff for those different questions.

Usage dashboards combine retained daily summaries with current-day activity and report when source reads are capped. Supplier model spend is USD in current accounting; a plan's stored GBP value is a separate measure. A downloaded report should keep its dates, scope, and incomplete-data notices. Neither a healthy summary nor a successful maintenance run proves that every external integration, individual event, or mailbox delivery was checked. This documentation pass performed no repair or data-changing operation.
