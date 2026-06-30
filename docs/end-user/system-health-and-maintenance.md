# System Health And Maintenance

System health and maintenance scripts are Sonae operator tools for finding operational drift and running allowlisted repairs. Use them before and after launches, after provider incidents, when scheduled work looks stuck, when agent runs or approvals look wrong, or when dashboard data appears inconsistent.

For the broader settings map, see [Platform Operations Settings](./platform-operations-settings.md). For release and run triage, see [Release Review And Run Observatory](./release-review-and-run-observatory.md).

## Where To Find It

- `/admin/settings/system-health`: platform or company-scoped health report.
- `/admin/settings/scripts`: allowlisted maintenance script list.
- `/admin/settings/scripts/[scriptId]`: one script's guidance, run action, and history.
- `/admin/run-observatory`: recent agent run triage when system health points to run failures.
- `/admin/agents/approvals`: pending approval queue when system health reports stranded approvals.
- `/admin/workflows/logs`: workflow execution logs when system health reports schedule or execution failures.

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

Open the linked operational area before changing configuration. For example, a stale run should be inspected in the run timeline; a provider failure should be compared with provider settings and recent deploys; a schedule warning should be checked in workflow logs and schedule configuration.

## Download The Health Report

Use the download action when a launch review, incident review, or customer handoff needs a static copy of the current report. The file is named with the scope and checked date.

Treat the downloaded JSON as operational evidence. It can include ids and examples that should stay in approved internal systems.

## Maintenance Scripts

Maintenance scripts are super-admin-only allowlisted actions, not arbitrary commands. The current registry includes `inventory-rollup-rebuild`, which recalculates admin overview inventory and MRR metrics from current companies, users, and plans.

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

For high-cost agents, review run volume, token usage, model choice, retrieval scope, and budget settings before disabling an agent.

For failed scheduled executions, open workflow logs, inspect the failed node or target, repair the configuration, then rerun manually if appropriate.

For analytics drift, use analytics settings and the data-health guidance rather than running unrelated maintenance scripts.
