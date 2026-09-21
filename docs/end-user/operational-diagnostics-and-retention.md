# Operational Diagnostics And Retention

Operational diagnostics and retention controls help Hakken operators explain privileged changes, troubleshoot authentication, inspect analytics data health, and manage bounded purges. These are sensitive administration surfaces. Use them deliberately and keep customer data, secrets, and audit evidence in approved systems.

For incident health checks and maintenance scripts, see [System Health And Maintenance](./system-health-and-maintenance.md). For public integration operations, see [Public API And Webhooks](./public-api-and-webhooks.md).

## Where To Find It

- `/admin/auth-diagnostics`: platform auth diagnostics for super admins and admins.
- `/app/settings/auth-diagnostics`: company settings auth diagnostics route.
- `/admin/audit-logs/[id]`: one audit log detail from the settings audit feed.
- `/admin/settings/analytics`: analytics settings and data-health checks.
- `/admin/settings?tab=purges`: unified purge pipeline configuration, manual purge actions, cancellation, and purge history.
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

Audit coverage is broad but not uniform across all historical features. The current audit detail route searches the recent audit feed, so very old rows may not always be reachable from the detail route. When a decision depends on audit evidence, check the feature-specific screen as well as the audit detail.

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

Purge settings control bounded deletion of old operational data. Current unified purge pipelines include:

- agent logs
- workflow logs
- user logins
- chat history
- audit logs

Unified purge configs are disabled by default and enforce a minimum retention floor. Operators can configure schedules, run a manual purge, cancel a running purge, and review recent purge history.

Purge schedules can be hourly, daily, weekly, or monthly. Scheduled runs create purge history rows. Manual runs also record who triggered the purge and the retention cutoff.

Purges delete records permanently. Cancellation stops future recursive deletion passes but does not restore records already deleted.

## Audit Retention Caveat

Hakken currently has both a unified purge pipeline for audit logs and an older audit-specific purge configuration path. They are related retention controls but not the same operational history.

The unified audit-log purge creates purge history rows and supports cancellation while running. The older audit-specific path has its own monthly schedule and does not create unified purge history rows.

When reviewing audit retention, confirm which control was used before explaining what happened.

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
