# Platform Operations Settings

Platform operations settings are the internal controls for API keys, webhook delivery evidence, maintenance scripts, system health, auth diagnostics, and audit review. These screens help operators run Sonae safely after launch. They are not everyday customer-user workflows.

For task-level incident health checks and maintenance scripts, see [System Health And Maintenance](./system-health-and-maintenance.md). For auth diagnostics, audit evidence, analytics health, and retention purges, see [Operational Diagnostics And Retention](./operational-diagnostics-and-retention.md).

## Where To Find It

- `/admin/settings/api-keys` creates and revokes tenant-scoped API keys.
- `/admin/settings/webhook-deliveries` reviews callback delivery attempts.
- `/admin/settings/scripts` lists allowlisted maintenance scripts.
- `/admin/settings/scripts/[scriptId]` opens one maintenance script and its run history.
- `/admin/settings/system-health` shows platform health, budget pressure, analytics health, and operational risk signals.
- `/admin/auth-diagnostics` opens the admin auth diagnostics surface.
- `/app/settings/auth-diagnostics` opens the company-admin diagnostics surface.
- `/admin/audit-logs/[id]` opens an audit log detail view from the settings audit feed.

Access depends on role and scope. Super admins can review platform-wide data where the backend allows it. Company admins can only see company-scoped diagnostics and operations where the product exposes them.

## API Keys

API keys are tenant-scoped secrets for public API and webhook surfaces. The current scopes are:

- `agent:run`: trigger governed agent runs.
- `workflow:run`: trigger governed workflows.
- `run:read`: read run status and evidence.
- `webhook:deliver`: use callback delivery surfaces.

When an API key is created, Sonae returns the raw secret once. After that, the system stores only a digest and a prefix. Operators should record the secret in the approved customer secret store immediately; it cannot be recovered from Sonae later.

Each key has a company, name, scopes, status, rate limit per minute, optional expiry, creator, and revocation metadata. Revoke a key when ownership changes, a secret is exposed, a customer no longer needs integration access, or a launch test key is no longer required.

## Webhook Deliveries

Webhook deliveries show callback attempts, retries, and terminal failures. The page includes a 7-day summary, success rate, retrying count, failed or abandoned count, company filter, status filter, and a paginated table.

Statuses are pending, delivering, success, failed, retry scheduled, and abandoned. Each row shows event type, company, destination URL, status, attempts, last HTTP status or error, next retry, delivery time, and a short request preview.

Payloads are intentionally stored as short previews rather than full raw callback bodies. Use the page to diagnose destination health and retry behavior without turning Sonae into a long-term payload archive.

## Maintenance Scripts

Maintenance scripts are allowlisted operational actions. The current registry includes `inventory-rollup-rebuild`, which recalculates admin overview inventory and MRR metrics from current companies, users, and plans.

The maintenance scripts page shows script name, category, risk level, latest status, last run time, and last runner. Opening a script shows its description, when to run it, expected changes, repeatability, expected duration, history, and run action.

Scripts are permission-checked, confirmation-gated, and audited. They do not run arbitrary commands. Only run a script when the symptom matches the script description and the expected changes are acceptable.

## System Health

System health summarizes recent operational signals. It covers analytics snapshot coverage, live message and transaction counts, message analytics dimensions, agent failures, failed transactions, stale runs, pending approvals, failed tool calls, provider failures, high-cost agents, budget pressure, schedule issues, and alert-rule statuses.

The page presents runbook text for each signal and can download the current health report as JSON. Use it before and after launches, after provider incidents, before customer reviews, and whenever dashboard counts, scheduled jobs, approvals, or agent runs look wrong.

System health is evidence, not an automatic fix. A warning should lead to the relevant run timeline, approval queue, provider health check, schedule page, analytics job, or maintenance script.

## Auth Diagnostics

Auth diagnostics help support sign-in and account issues. The admin route and app settings route share the same diagnostics feature. Use it when a user cannot sign in, appears in the wrong company, has a role mismatch, or is affected by invite or session state.

Diagnostics should be handled with care because auth data can be sensitive. Confirm the user, company, and role before changing account configuration.

## Audit Log Detail

Audit log detail shows the event signature, timestamp, actor, target object, and metadata payload for one audit event. It is useful for explaining who changed a privileged setting, when the change happened, and what metadata was captured.

Audit coverage is broad but not perfect. Some older surfaces may not have the same detail as newer privileged actions. When an operational decision depends on audit evidence, check both the audit detail and the feature-specific screen.

## Practical Operator Flow

For integration launches, create a tenant-scoped API key with only the scopes required, record the one-time secret securely, then review public API request and webhook delivery evidence after the first test.

For operational incidents, start with system health. Open the linked runbook target, inspect run timelines or schedule state, then use maintenance scripts only when the script matches the symptom. Record the reason for any key revocation, release rollback, or manual repair in the relevant operational notes.
