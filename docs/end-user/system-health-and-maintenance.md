---
product: Hakken
documentation_type: End-user guide
feature_area: System health and maintenance
audience: authorized administrators and operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/system-health-and-maintenance.md
last_reviewed: '2026-10-26T14:35:25+00:00'
reviewed_against: current implementation
status: Current
---
# System Health And Maintenance

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** System health and maintenance
> **Reviewed:** 26 October 2026, 14:35:25 GMT (Europe/London)
> **Source path:** `docs/end-user/system-health-and-maintenance.md` · **Status:** Current

System health and maintenance scripts are Hakken operator tools for finding operational drift and running allowlisted repairs. Use them before and after launches, after provider incidents, when scheduled work looks stuck, when agent runs or approvals look wrong, or when dashboard data appears inconsistent.

For the broader settings map, see [Platform Operations Settings](./platform-operations-settings.md). For run triage and platform health, see [Health](./health.md).

## Where To Find It

- `/admin/health`: platform or company-scoped health report.
- `/admin/settings/scripts`: allowlisted maintenance script list.
- `/admin/settings/scripts/[scriptId]`: one script's guidance, run action, and history.
- `/admin/health`: recent agent run triage when system health points to run failures.
- `/admin/governance/approvals`: pending approval queue when system health reports stranded approvals.
- `/admin/workflows/schedules`: schedule configuration when system health reports schedule drift or execution failures.

System health accepts admins. Super admins see platform-wide evidence; company admins see company-scoped reports where supported. Maintenance script listing, detail, and execution require super-admin access because scripts are platform repair controls.

## What System Health Shows

The system health page reads a 7-day report and shows metric tiles, budget pressure, alert rules, operator signals, investigation links, and a downloadable JSON report.

Current signal areas include:

- agent execution errors
- failed agent transactions
- stale agent runs
- pending agent approvals
- failed agent tool calls
- provider failure clusters
- high-cost agents
- tenant message budget pressure
- failed scheduled executions
- stale running scheduled executions
- overdue active schedules
- active schedules missing a next run
- analytics snapshot and message-dimension drift
- live assistant message and agent transaction counts

The page is evidence, not an automatic repair. Each signal should lead to a focused investigation path.

## Read Health Signals

Start with signals that affect customer behavior:

1. Agent failures, stale runs, pending approvals, and failed tool calls.
2. Provider failures and model-related failures.
3. Failed or overdue schedules.
4. Budget and high-cost signals.
5. Analytics data-health drift.

Open the linked operational area before changing configuration. For example, a stale run should be inspected in the run timeline; a provider failure should be compared with provider settings and recent deploys; a schedule warning should be checked against schedule configuration and the target workflow or agent.

## Download The Health Report

Use the download action when a launch review, incident review, or customer handoff needs a static copy of the current report. The file is named with the scope and checked date.

Treat the downloaded JSON as operational evidence. It can include ids and examples that should stay in approved internal systems.

## Maintenance Scripts

Maintenance scripts are super-admin-only allowlisted actions, not arbitrary commands. The current registry includes `inventory-rollup-rebuild`, which recalculates admin overview inventory and plan-derived value estimates from current companies, users, and plans.

The script list shows:

- script name
- category
- risk level
- latest status
- last run time
- last runner

The script detail page shows:

- description
- when to run it
- expected changes
- repeatability
- expected duration
- recent run history
- run action

Run a script only when the symptom matches the script description and the expected changes are acceptable.

## Before Running A Script

Before running a maintenance script:

1. Confirm the symptom from system health, dashboard data, or support evidence.
2. Read the script's expected changes and repeatability notes.
3. Confirm the script is the narrowest available repair.
4. Check whether a recent run already fixed the issue.
5. Make sure the result is safe to audit and explain.

If the script does not match the symptom, do not use it as a general repair button. Investigate the source system instead.

## After Running A Script

After running a script:

- review the run status and message
- confirm the target dashboard or metric changed as expected
- re-open system health if the script was run for a health signal
- record the reason in the relevant launch, incident, or support notes
- avoid repeated runs unless the script is documented as repeatable and the symptom persists

Maintenance runs are audited. Failed runs should be investigated rather than retried blindly.

## Common Triage Paths

For stale agent runs, open the run timeline and decide whether the run needs cancellation, replay, provider repair, tool repair, or agent configuration changes.

For pending approvals, open the approvals page and approve, reject, or cancel each stranded decision. If approvals repeatedly strand, review the tool's approval policy and operator handoff.

For failed tool calls, inspect the tool call evidence, connector diagnostics, side-effect level, and tenant policy before retrying the run.

For provider failure clusters, check provider credentials, provider connectivity, model defaults, recent deploys, and provider status before editing prompts.

High-cost agents counts AI model spend only; data an agent buys is not included. For high-cost agents, review run volume, token usage, model choice, retrieval scope, and budget settings before disabling an agent.

For failed scheduled executions, inspect the target workflow or agent run, repair the configuration, then rerun manually if appropriate.

For analytics drift, use analytics settings and the data-health guidance rather than running unrelated maintenance scripts.

## Read Bounds And Dates With The Result

Health is a bounded local report. Most collections inspect at most 10,000 rows and show up to ten examples; some source families have smaller bounds. A count or an empty example list does not establish exhaustive platform history. The normal screen asks for seven days, while backend lookbacks are clamped to one through ninety days. Keep the checked time, scope, and window with an exported report so another operator can reproduce the question being asked.

Current warning thresholds include 60 minutes for stale running work, 30 minutes for pending approvals, 15 minutes for overdue schedules, and five dollars of AI model spend in the window for a high-cost agent. Run and company-message budget pressure begins at 80 percent of the configured allowance. These are investigation signals, not automatic cancellation, extra purchased capacity, or proof that a customer was overcharged.

High-cost agent signals intentionally exclude paid service purchases such as collected SEO data and X reads. Other cost views can include those services, so different totals are not automatically a reconciliation failure. Compare identical sources and windows before describing a cost spike. Customer Stripe billing and revenue remain separate from supplier model expenditure.

A stale pending approval can be waiting for a legitimate human decision. A missing next-run time can indicate disabled or incomplete schedule configuration. Open the original record and use its actual controls after reviewing consequences. Downloading a report or opening Health does not itself retry a workflow, call a model, refresh provider credentials, purge data, or repair a stalled run.

## Platform Alerts And Monitoring

The saved cron registers health alerts daily at 00:25 UTC, after analytics snapshots at 00:05 UTC. Alert processing builds the local report, decides whether a signal exists, and queues a platform alert in the Outbox. A healthy report can produce no alert. Configured recipient addresses take precedence; otherwise the implementation falls back to up to ten super-admin email records. Missing recipients are reported separately from a healthy result.

Queued means the alert reached the delivery queue, not that an external mailbox accepted it. Its identity includes alert type and report-window dates to limit duplicate queueing. The Outbox has its own sending run and delivery evidence. Do not use a missing inbox message as the only evidence that Health found nothing; check the report, alert outcome, queue, and actual delivery state.

Optional Sentry monitoring is a separate path for unexpected browser/server errors. It depends on a configured DSN and does not substitute for the company-scoped business-health report. Neither a locally configured monitoring client nor a passing source test proves the deployed service is sending reports. Do not add customer content, secrets, or raw credentials to an exported diagnostic context.

The maintenance registry and inventory rebuilding behavior are documented in [Maintenance scripts](../developer/maintenance-scripts.md) and [Analytics rollups](../developer/analytics-rollups.md). A registry repair can change saved summaries and must be assessed by its actual guidance. This documentation review performed no repairs, connection probes, scheduled dispatch, email send, Sentry test, or live acceptance test.
