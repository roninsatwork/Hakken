# Maintenance Scripts Developer Guide

Maintenance scripts are allowlisted operational actions exposed in System Settings. They are for bounded repair or recalculation work that should be run by a super admin, recorded in durable history, and audited.

Read this before adding a script, changing script execution, or modifying the maintenance script settings pages. For the broader operations surface, see [Platform Operations Settings](./platform-operations-settings.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/scripts/page.tsx` lists available maintenance scripts.
- `src/app/(dashboard)/admin/settings/scripts/[scriptId]/page.tsx` shows one script, its guidance, execution action, and recent history.
- `convex/maintenanceScriptRegistry.ts` is the static allowlist and operator metadata source.
- `convex/maintenanceScripts.ts` lists scripts, reads script detail/history, executes scripts, writes run rows, and writes audit events.
- `convex/inventoryRollups.ts` currently provides the only script implementation through `rebuildGlobalInventoryRollupData`.

The route is a system administration surface. Script listing, detail, and execution all require super-admin authorization.

## Current Script Registry

The current registry contains one script:

- `inventory-rollup-rebuild`: a low-risk inventory script that recalculates global admin inventory and monthly recurring revenue metrics from current companies, users, plans, and plan assignments.

Registry entries include:

- id
- name
- category
- risk level
- short description
- full description
- when to run
- expected changes
- repeatability guidance
- expected duration

Keep registry metadata operationally specific. The UI depends on this text to help a super admin decide whether a script matches the current symptom.

## Execution Flow

`maintenanceScripts.run` performs these steps:

1. Requires super-admin authorization.
2. Looks up the script id in the static registry.
3. Rejects unknown script ids.
4. Inserts a `maintenanceScriptRuns` row with `status: "RUNNING"`, actor id, actor name, actor email, and start timestamp.
5. Writes `MAINTENANCE_SCRIPT_STARTED`.
6. Runs the allowlisted implementation.
7. On success, patches the run to `SUCCESS`, stores completion timestamp, summary, and JSON metadata.
8. Writes `MAINTENANCE_SCRIPT_SUCCEEDED` with script id, script name, run id, and result metadata.
9. On failure, patches the run to `FAILED`, stores completion timestamp and error message.
10. Writes `MAINTENANCE_SCRIPT_FAILED` with script id, script name, run id, and error message.

The mutation returns success state, run id, and either summary or error. The script runs inside the Convex mutation context, so implementations must remain bounded enough for Convex execution limits.

## Listing And Detail

`maintenanceScripts.list` returns every registry definition plus the latest run for each script. It uses `maintenanceScriptRuns.by_script_started`.

`maintenanceScripts.get` returns one registry definition, its latest run, and the 10 most recent history rows. Unknown script ids return `null`.

Do not make list or detail read arbitrary scripts from user input, storage, or the filesystem. The static registry is the safety boundary.

## Inventory Rollup Rebuild

The `inventory-rollup-rebuild` implementation calls `rebuildGlobalInventoryRollupData`.

The script summary reports how many companies and users were included. The metadata stores the rollup result, including plan inventory and monthly recurring revenue data returned by the rollup builder.

Run this script when:

- deploying rollup-backed inventory metrics into an environment with existing data
- admin overview inventory counts look stale
- monthly recurring revenue or plan inventory cards appear out of sync with current companies, users, or plans

The script is repeatable because it recalculates from current records each time. It should not apply incremental deltas or depend on previous run output.

## Audit And History

Maintenance script audit action types are:

- `MAINTENANCE_SCRIPT_STARTED`
- `MAINTENANCE_SCRIPT_SUCCEEDED`
- `MAINTENANCE_SCRIPT_FAILED`

Run history is stored in `maintenanceScriptRuns`, indexed by script id and start time. Preserve the run row as the durable operational record. Audit logs should identify the script and run id, while script metadata should stay compact enough for safe display.

Avoid storing secrets, raw customer payloads, or large exported datasets in script metadata.

## Adding A Script

When adding a script:

1. Add the id to `MaintenanceScriptId`.
2. Add a complete registry entry with clear risk, repeatability, expected duration, expected changes, and when-to-run guidance.
3. Add an explicit branch in `executeMaintenanceScript`.
4. Keep the implementation idempotent or clearly bounded.
5. Add tests for super-admin authorization, unknown script rejection, success history, failure history, audit logs, and result metadata.
6. Update the settings UI only if the generic script screens cannot represent the new script.
7. Update this guide and operator-facing documentation if the runbook changes.

Do not add arbitrary shell commands, dynamic imports from script ids, or user-provided code execution. If an operation needs external state, model it as a typed Convex action with explicit arguments and audit evidence.

## Verification

Focused tests include:

- `convex/maintenanceScripts.test.ts` for authorization, registry listing, script execution, run history, metadata, and audit events.
- `convex/inventoryRollups.test.ts` where inventory rollup behavior is covered.
- Settings page tests for script list/detail rendering where present.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
