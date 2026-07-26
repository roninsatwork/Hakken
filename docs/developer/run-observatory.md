# Run Observatory Developer Guide

The run observatory is the sampled operations view for recent agent execution health. It aggregates run status, failure reasons, cost, tokens, latency, model usage, agent activity, tool risk, and recent run evidence so operators can spot release regressions and runtime incidents quickly.

Read this before changing `agentRuns.getRunObservatory`, `/admin/run-observatory`, run telemetry fields, tool-call sampling, or company scoping. For release review context, see [Releases And Observability](./releases-and-observability.md) and [Agent Release Infrastructure](./agent-release-infrastructure.md).

## Product Surface

- `src/app/(dashboard)/admin/run-observatory/page.tsx` renders `/admin/run-observatory`.
- `convex/agentRuns.ts` exports `getRunObservatory`.
- `convex/agentRuns.test.ts` covers company-scoped and platform-scoped observatory behavior.
- `src/app/(dashboard)/admin/run-observatory/page.test.tsx` covers the dashboard rendering contract.

The page is a dashboard, not a full historical analytics tool. It intentionally summarizes a bounded sample and links reviewers to individual agent run timelines for exact step, approval, replay, fixture, and memory evidence.

## Access And Scope

`getRunObservatory` uses `requireAdmin`.

Super admins receive platform scope. The query samples recent runs across all companies and statuses, then sorts the combined sample by `startedAt`.

Standard admins must have a `companyId`. They receive company scope through the `agentRuns.by_company_started` index and cannot view another company&apos;s runs. Tool-call stats are also filtered by tool-call `companyId` for standard admins.

Admins without a company id are rejected. Preserve this guard when refactoring auth helpers; otherwise a company admin without a scoped company could accidentally see platform-wide run telemetry.

## Sampling Contract

The query accepts optional `lookbackDays` and `limit`.

- `lookbackDays` defaults to 7 and is clamped from 1 to 90 days.
- `limit` defaults to `RUN_OBSERVATORY_LIMIT` and is clamped from 1 to `RUN_OBSERVATORY_LIMIT`.
- `RUN_OBSERVATORY_LIMIT` is 120 runs.
- `RUN_OBSERVATORY_TOOL_LIMIT` is 300 tool calls.

For super admins, the implementation samples each run status independently from `agentRuns.by_status_started`, flattens the results, filters by the lookback cutoff, sorts by most recent start time, and slices to the requested run limit.

For company admins, the implementation queries `agentRuns.by_company_started`, filters by the cutoff, and takes the requested limit.

Tool calls are sampled from the most recent 60 sampled runs, with up to 20 tool calls per run, then flattened and sliced to the global tool-call sample limit. This keeps the dashboard responsive and recent while still surfacing tool risk. Do not treat these aggregates as complete billing or audit totals.

## Returned Shape

`getRunObservatory` returns:

- `scope`: `platform` for super admins or `company` for company admins.
- `lookbackDays`, `sampledRuns`, and `sampledToolCalls`.
- `totals`: sampled run count, successful runs, failed runs, active runs, cost in GBP, input/output tokens, success rate, and average completed latency.
- `statusCounts`: counts for `QUEUED`, `RUNNING`, `PENDING_APPROVAL`, `SUCCESS`, `FAILED`, and `CANCELLED`.
- `triggerCounts`: counts by trigger type.
- `modelStats`: top sampled models by run count with failures and cost.
- `agentStats`: top sampled agents sorted by failures, then run count.
- `toolStats`: top sampled tools sorted by failures, then call count.
- `failureReasons`: top sampled failure or cancellation reasons.
- `recentRuns`: the 12 most recent sampled runs with timeline links and recommended next actions.

The page renders these sections as metric tiles, recent run evidence, status mix, failure reasons, agents needing attention, tool risk, models and triggers, and a token sample note.

## Aggregation Details

Run totals are derived from sampled `agentRuns` rows:

- successful runs are `SUCCESS`
- failed runs are `FAILED` plus `CANCELLED`
- active runs are `QUEUED`, `RUNNING`, plus `PENDING_APPROVAL`
- success rate is successful runs divided by completed runs, where completed means successful plus failed/cancelled
- average latency only includes runs with `completedAt`
- model key is `modelId`, then `providerModelId`, then `unresolved`
- failure reason is `error`, then `finalOutput`, then the run status

Agent names are joined from `agents` after collecting unique sampled `agentId` values. Missing agent rows display as `Unknown agent`.

Tool stats are derived from sampled `agentToolCalls` rows:

- failures include `FAILED` and `CANCELLED`
- approval count includes `APPROVAL_REQUIRED`
- denial count includes `DENIED`
- `writeOrExternal` counts `WRITE`, `DESTRUCTIVE`, and `EXTERNAL` side-effect levels

The dashboard should continue to bias sorting toward risk: failed agents and failed tools should appear before high-volume healthy items.

## Recent Run Actions

`getRunObservabilityAction` converts run status into operator guidance:

- failed or cancelled runs should be opened, inspected, and converted into eval fixtures when the failure should not repeat
- pending approval runs should be reviewed before continuation
- queued or running runs should be checked for progress or cancellation
- successful runs should be monitored for drift and compared with future replays if behavior changes

Keep this guidance practical and tied to implemented run timeline features. Do not mention future remediation automation unless it exists in the current code.

## Relationship To Other Run Surfaces

The observatory is a triage surface. It intentionally links to the agent run timeline at `/admin/agents/{agentId}/runs?runId={runId}` for detailed investigation.

Use the individual run timeline for:

- raw steps and step summaries
- sanitized or raw tool arguments according to role
- approvals
- replay and replay comparison
- fixture creation
- memory candidates
- run cancellation

Use analytics tables and analytics rollups for broader historical reporting. The run observatory samples recent records and should not be used as the source of truth for lifetime cost, usage, or incident totals.

## Tenant Isolation

The company scope is enforced in two places: run selection and tool-call aggregation. This matters because a run sample can include a recent run whose tool calls contain sensitive arguments, side-effect metadata, and handler mappings.

When changing indexes or adding richer observatory detail, keep these rules:

- standard admins must query by their own company id
- standard admins must not receive platform runs
- tool calls must stay company-filtered for standard admins
- raw argument access remains governed by the run timeline detail helpers, not by the observatory

Add or update tests in `convex/agentRuns.test.ts` whenever observatory scoping changes.

## Verification

Focused tests:

- `convex/agentRuns.test.ts` checks company versus platform scope, totals, tenant filtering, tool stats, failure reasons, and foreign-tenant exclusion.
- `src/app/(dashboard)/admin/run-observatory/page.test.tsx` checks metrics, breakdowns, failure text, tool risk, and run timeline links.

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
