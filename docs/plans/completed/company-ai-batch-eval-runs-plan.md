> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Company AI Batch Eval Runs Plan

Created: 2026-07-02

This plan documents how to move Company AI evals from one-by-one manual runs to batch readiness runs. It is a planning document only. Do not implement this work unless the user explicitly asks to move from planning into coding.

Related plans:

- [Company AI Upgrade Plan](./company-ai-upgrade-plan.md)
- [Company AI Overview UX Plan](./company-ai-overview-ux-plan.md)
- [Company AI Modal To Screen Plan](./company-ai-modal-to-screen-plan.md)

Index keywords: company AI evals, batch eval runs, run all evals, readiness evidence, automatic eval execution, eval batches, blocker evals.

## Product Decision

Add batch eval running.

The current one-by-one eval flow is acceptable for debugging a single case, but it is too tedious for readiness. If evals are supposed to prove whether a company AI works, admins need a way to run a group of evals and see a clear result.

The target UX should support:

- `Run blockers`
- `Run failed/not run`
- `Run all`
- later, `Run selected`

The mature version should not require the admin to paste the AI answer and evidence for every eval. The system should execute the company AI runtime for each eval prompt, capture the answer and runtime evidence, score the run, and update readiness.

## Current State

Current eval behavior:

1. Admin creates an eval case.
2. Admin clicks `Run` on one eval.
3. Admin manually enters:
   - answer,
   - evidence JSON,
   - resolved model,
   - resolved use case,
   - judge notes.
4. `convex/companyEvals.ts` scores deterministic checks:
   - forbidden claims,
   - required sources,
   - required memories,
   - required skills,
   - expected model use case.
5. The run is saved as `PASSED`, `FAILED`, or `NEEDS_REVIEW`.
6. The eval summary and company readiness update from latest runs.

This is useful as a proof model, but it is not the right operating UX for repeated readiness checks.

## Target User Experience

The Company Evals page should make batch readiness testing obvious.

Recommended header actions:

```text
[Run blockers] [Run failed/not run] [Run all] [New eval]
```

Recommended table states:

```text
Eval case                 Latest result      Action
Brand tone                Passed             Run
No hallucination          Failed             Run
Widget safety             Not run            Run
Memory usage              Needs review       Run
```

After a batch run starts, show progress:

```text
Running 10 evals
3 passed, 1 failed, 6 queued
```

After completion, show a batch summary:

```text
10 evals run
7 passed
2 failed
1 needs review

[View failed evals] [Record readiness snapshot]
```

## Run Modes

### Run Blockers

Runs active evals where `severity = BLOCKER`.

Purpose:

- fastest readiness answer,
- production gate check,
- useful before turning on widget or company chat confidence.

### Run Failed/Not Run

Runs active evals where the latest run is:

- missing,
- `FAILED`,
- `NEEDS_REVIEW`.

Purpose:

- efficient retry after fixes,
- avoids rerunning already passing evidence unless needed.

### Run All

Runs every active eval case for the company.

Purpose:

- full readiness refresh,
- useful after large knowledge, prompt, model, memory, skill, or widget changes.

### Run Selected

Future enhancement.

Purpose:

- lets admins choose a custom subset from the table,
- useful when investigating one category or surface.

## Important UX Rule

Do not implement batch run as a giant manual form where admins paste answers for every eval.

That would technically reduce clicks, but it would still be bad readiness UX. Batch running should mean the system executes the evals.

Keep single manual `Run` for debugging and temporary proof work, but make batch runs automatic.

## Execution Model

Batch eval execution should have two levels:

### Level 1: Deterministic Scoring

Already exists today.

Given:

- answer,
- evidence JSON,
- resolved model,
- resolved use case.

The backend computes:

- deterministic checks,
- status,
- score.

### Level 2: Runtime Execution

Needed for true batch runs.

For each eval case, the system should:

1. Build the company AI runtime context.
2. Execute the eval prompt against the correct surface:
   - company chat,
   - widget,
   - agent,
   - workflow,
   - app kit.
3. Capture the generated answer.
4. Capture runtime evidence:
   - retrieved knowledge IDs,
   - approved memory IDs,
   - skill IDs,
   - resolved model ID,
   - resolved use case,
   - token and cost data where available.
5. Pass the captured result into deterministic scoring.
6. Store one `companyEvalRuns` record per eval case.
7. Update batch progress and summary.

## Data Model

Keep `companyEvalRuns` as the source of individual run truth.

Add a batch-level record so the UI can show grouped progress and summary.

Recommended table: `companyEvalBatchRuns`

Fields:

- `_id`
- `companyId`
- `mode`: `BLOCKERS`, `FAILED_OR_NOT_RUN`, `ALL`, `SELECTED`
- `status`: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`
- `totalCount`
- `queuedCount`
- `runningCount`
- `passedCount`
- `failedCount`
- `needsReviewCount`
- `errorCount`
- `startedBy`
- `startedAt`
- `completedAt`
- `selectionJson`, optional selected eval IDs
- `summaryJson`, optional final summary

Recommended additions to `companyEvalRuns`:

- `batchRunId`, optional,
- `executionMode`: `MANUAL`, `BATCH_AUTOMATED`,
- `runtimeTraceJson`, optional,
- `errorMessage`, optional.

## Backend API Shape

Recommended queries:

- `companyEvals.getLatestBatchRunForCompany`
- `companyEvals.getBatchRunById`
- `companyEvals.getRunsForBatch`

Recommended mutations/actions:

- `companyEvals.startBatchRun`
- `companyEvals.cancelBatchRun`
- `companyEvals.recordAutomatedRunResult`

Use a Convex action for runtime execution because it will call AI providers and other runtime services. Use mutations for durable DB writes.

Suggested flow:

1. UI calls `startBatchRun`.
2. Backend creates a `companyEvalBatchRuns` record.
3. Backend resolves the eval case IDs for the selected mode.
4. Backend schedules or performs per-eval runtime execution.
5. Each eval result creates a normal `companyEvalRuns` row linked to the batch.
6. Batch counts update as each eval completes.
7. Readiness and drift resolution use the same latest-run semantics as today.

## Readiness Behavior

Batch runs should not create a second readiness system.

They should feed the existing readiness logic by creating normal eval run records.

Expected behavior:

- failed blocker evals make the company AI not ready,
- missing blocker eval evidence hurts readiness,
- passing evals can resolve drift,
- batch summary helps the admin understand what changed,
- readiness overview points to failed/not-run evals as the next action.

## UI Changes

### Evals Page Header

Replace the current single primary action area with:

- `Run blockers`
- `Run failed/not run`
- `Run all`
- `New eval`

Use `Run blockers` as the primary action when blocker cases exist.

### Batch Progress Panel

Show a temporary progress panel when a batch is queued or running.

Content:

- batch mode,
- progress counts,
- latest completed eval,
- cancel button if cancellation is supported.

### Batch Result Panel

Show the latest completed batch summary above the eval table.

Content:

- total run count,
- pass/fail/needs-review counts,
- failed eval links,
- optional `Record readiness snapshot` action.

### Eval Table

Add or improve latest status visibility:

- `Not run`
- `Passed`
- `Failed`
- `Needs review`
- `Stale`, later when drift affects a case.

Single eval `Run` should remain available for debugging one case.

## Implementation Phases

### Phase 1: Batch Run UX Shell

Goal:

- make the intended readiness workflow visible before wiring full automation.

Tasks:

- add `Run blockers`, `Run failed/not run`, and `Run all` controls,
- disable unavailable modes with clear labels, for example `No blockers`,
- add latest batch result/progress placeholder states,
- keep existing single-run flow unchanged.

Acceptance:

- page communicates that batch evals are the intended workflow,
- no existing single-run behavior regresses.

### Phase 2: Batch Data Model

Goal:

- store batch-level run history.

Tasks:

- add `companyEvalBatchRuns` schema,
- add `batchRunId` and execution metadata to `companyEvalRuns`,
- add queries for latest batch and batch details,
- add tests for tenant isolation and summary counts.

Acceptance:

- batch run records are company-scoped,
- admins cannot see another company's batch runs,
- batch summaries can be rendered without scanning unlimited run history.

### Phase 3: Batch Deterministic Runner

Goal:

- support batch orchestration using existing scoring, even before the full runtime runner is mature.

Tasks:

- add backend helper to resolve eval cases for each mode,
- add batch orchestration that records `NEEDS_REVIEW` or explicit skipped states when runtime execution is not yet available,
- keep manual single-run as the way to debug and fill missing evidence during this phase.

Acceptance:

- batch UI and data model work end to end,
- readiness does not falsely mark skipped cases as passing,
- admins can see which cases still need automated runtime support.

### Phase 4: Automated Runtime Execution

Goal:

- make `Run all` actually execute company AI against each eval prompt.

Tasks:

- add a runtime eval action that calls the same company AI assembly path as chat/widget where possible,
- capture answer, sources, memories, skills, model, use case, token usage, and cost,
- pass captured output into deterministic scoring,
- store one run per eval,
- update batch progress as each run completes.

Acceptance:

- `Run all` produces real answers and evidence without manual paste work,
- deterministic checks use captured evidence,
- failures are visible per eval and in the batch summary,
- existing readiness updates from the new runs.

### Phase 5: Failed/Not-Run And Selected Runs

Goal:

- make repeated readiness work efficient.

Tasks:

- implement `Run failed/not run`,
- add row selection,
- add `Run selected`,
- add filters for failed, not run, needs review, blocker, and stale.

Acceptance:

- admins can rerun only what needs attention,
- a company with many evals does not require repeated full-suite runs.

### Phase 6: Visual And Operational QA

Goal:

- ensure batch running feels trustworthy and safe.

Tasks:

- verify empty, running, failed, completed, and partially completed states,
- test mobile and desktop layouts,
- test permission boundaries,
- test cancellation or failure recovery if supported,
- run the local quality gate before merge or push.

Acceptance:

- `npm run verify:env` passes,
- `npm run lint:all` passes,
- `npm run check` passes,
- `npm run build` passes,
- `git diff --check` passes,
- screenshots show that batch run controls are obvious and not visually overwhelming.

## Non-Goals

- Do not remove single eval runs.
- Do not make a batch manual paste form.
- Do not introduce a separate readiness scoring system.
- Do not hardcode model choices; use stored company/global model configuration.
- Do not weaken tenant isolation.
- Do not touch the frozen movement demo.

## Open Questions

- Should `Run blockers` be the primary button by default, or should `Run failed/not run` become primary once blockers have passing evidence?
- Should batch runs execute evals sequentially for easier tracing, or with limited concurrency for speed?
- Should a failed eval stop the batch, or should the batch continue and report all failures?
- Should automatic eval runs use the company's configured runtime model or a dedicated eval execution model?
- Should LLM judging be part of the first automated batch runner, or should deterministic scoring remain the first automated milestone?
- How long should batch run history be retained before summarization or pruning?
