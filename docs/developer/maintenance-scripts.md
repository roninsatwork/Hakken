---
product: Hakken
documentation_type: developer guide
feature_area: maintenance registry and data migration orchestration
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/maintenance-scripts.md
last_reviewed: '2026-10-26T10:36:00+00:00'
reviewed_against: current implementation
status: Current
---
# Maintenance Scripts Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Maintenance registry and data migration orchestration
> **Reviewed:** 26 October 2026, 10:36:00 GMT (Europe/London)
> **Source path:** `docs/developer/maintenance-scripts.md` · **Status:** Current

Maintenance scripts are allowlisted operational actions exposed in System Settings. They are for bounded repair or recalculation work that should be run by a super admin, recorded in durable history, and audited.

Read this before adding a script, changing script execution, or modifying the maintenance script settings pages. For the broader operations surface, see [Platform Operations Settings](./platform-operations-settings.md).

## Product Surface

- `src/app/(dashboard)/admin/settings/scripts/page.tsx` lists available maintenance scripts.
- `src/app/(dashboard)/admin/settings/scripts/[scriptId]/page.tsx` shows one script, its guidance, execution action, and recent history.
- `convex/maintenanceScriptRegistry.ts` is the static allowlist and operator metadata source.
- `convex/maintenanceScripts.ts` lists scripts, reads script detail/history, executes scripts, writes run rows, and writes audit events.
- `convex/inventoryRollups.ts` implements the inventory rebuild; `convex/dataMigrations.ts` supplies the registered background migration runner.

The route is a system administration surface. Listing and detail use `superAdminQuery`, admitting SUPER_ADMIN and READ_ONLY. Execution uses `superAdminMutation`, admitting SUPER_ADMIN alone.

## Current Script Registry

The current registry contains two scripts:

- `inventory-rollup-rebuild`: a low-risk registry entry that recalculates global inventory and a plan-assignment value estimate from current companies, users and plans. The registry still calls this MRR; that wording does not make it Stripe-collected or contracted revenue.

- `data-migrations-apply`: starts registered migrations that are neither complete nor already running and reports the ledger state. Script success means accepted scheduling, not completed backfills.

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
- plan-assignment estimates or inventory cards appear out of sync with current companies, users or plans

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
- `convex/inventoryRollups.ts` for the rollup implementation. Add focused tests when maintenance-script work changes inventory rollup behavior.
- Settings page tests for script list/detail rendering where present.

For documentation edits, use focused Markdown checks and `git diff --check`. For separately authorized application changes, follow the current complete gates in AGENTS.md; this guide does not supply an abbreviated replacement.

## Registered Migration Scheduling

`startPendingDataMigrations` reads at most 1,000 `dataMigrations` ledger records and maps them by name. It obtains registry names from `getRegisteredMigrationNames`, skips COMPLETED records, leaves RUNNING records alone and schedules `internal.dataMigrations.run` with `force: true` for absent or failed records. The maintenance script reports started, already-running and already-complete names, registered count and previously recorded updated-row totals. It does not wait for every worker or establish that all stored rows now satisfy the new schema.

`dataMigrations.run` is internal. It rejects unknown names and resolves a unique ledger row through `by_name`. Without force, a completed or running record returns its current state. Starting a failed record or forcing a run resets its cursor, counters, timestamps and error before scheduling `processBatch`. The normal batch size is 200; individual migration runners can choose smaller bounded work or interpret a cursor as a day rather than a database row. The internal argument validator accepts a number without a shared positive-integer clamp, so operational callers should not infer that arbitrary batch sizes have been validated.

`processBatch` reloads the ledger and refuses to continue anything outside RUNNING. It marks a removed registry entry failed and imposes a maximum of 10,000 batches. A successful partial result saves cursor, processed/updated counters, batch count and update time, then immediately schedules the next segment. A complete result clears the cursor and records COMPLETED. Normal progress therefore hands itself on without a person repeatedly pressing a button.

A caught runner exception saves FAILED and the error; the inspected worker does not automatically retry it. Starting the failed migration again resets to the beginning, rather than resuming the old failed cursor. Registry implementations are intended to tolerate reinspection, but repeatability depends on the named runner and its retained input. The catch occurs inside the same mutation: do not promise rollback of every write a runner performed before throwing merely because an old source comment says so. A commit-time abort is different and can leave a ledger RUNNING; no independent migration stall reaper was established in this reviewed path.

`getStatus` and `listStatus` use `superAdminQuery`. Listing returns every registered name, including NOT_RUN records, from at most 1,000 saved ledger entries. Status inspection is distinct from running the generic maintenance action, which can start pending work. There is no general customer-facing migration workflow, so this capability belongs in developer/operator documentation rather than an invented customer guide.

## Named Migration Boundaries

The registry includes currency-field normalization, website-hold ownership, search/AI answer extraction and summaries, private-list repair, company limits, knowledge content, website icons, governance historical buckets, skill bindings, memory settings and cost repricing. `NORMALISATION_MIGRATIONS` adds further named entries. Inspect the specific runner before authorizing one; this review validates the orchestration contract, not every historical migration's business semantics or applicability to a deployed database.

Some names have historical prerequisites. The memory-outcome counter migration depends on usage history that agent-run retention later removes; the retention guide explicitly warns against rerunning that backfill once those source rows have expired. A completed migration should not be forced merely to make a dashboard look fresh. Schema deployment, saved ledger completion and live business acceptance are three different facts.

The inventory rebuild separately reads 10,001 users, companies and plans to detect its 10,000-per-table ceiling. It refuses overflow before replacing the existing rollup. Within the bound it counts provisioned rows and company plan assignments, then derives an active-plan price estimate from `priceGBP`. That is not paid-company coverage, covered users, Stripe subscription acceptance or money received. The registry's MRR label remains a source wording discrepancy; this documentation task does not rename its implementation.

## Local Command Boundaries

Use [Operational Scripts Reference](./operational-scripts-reference.md) for the package-command map. A script's local filename does not prove local-only effects. `verify:deployment` invokes the Convex CLI to list a selected backend environment, with `--prod` selecting production; it verifies required key names without proving provider connectivity or frontend configuration. Its implementation suppresses raw CLI error output because that output can contain environment values. This documentation pass did not invoke it.

`auth:local:seed` and `auth:local:cleanup` call backend mutations using a secret and configured endpoint. `auth:local:state` launches Playwright, signs in selected deterministic roles and writes browser session state under `e2e/.auth`. It is not a command that merely prints configuration. URL selection can come from environment or `.env.local`, so the command name alone does not establish which backend would be touched. The existing operator runbook remains the place for a separately authorized local test workflow.

Maintenance run records and audit entries are saved within the mutation executing the implementation. In-handler failure returns a failed result with history, while a transaction abort at commit can prevent that evidence from persisting. No arbitrary code, shell execution, provider API call or migration was performed in this documentation review. Tests were inspected as source evidence only; pending subsystem and live acceptance work remains separately tracked in the documentation inventory.
