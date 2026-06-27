# Workflow Runtime Internals

This guide documents the backend runtime that executes Sonae workflow graphs. It is implementation-focused and complements [Workflow Automation](./workflow-automation.md), which covers the full admin product surface and visual builder.

The current implementation is Convex-driven. Workflow records store React Flow graph JSON, runtime actions schedule node execution, internal mutations claim and finalize execution steps, and execution logs are stored in the same tables used by schedule-driven agent runs. The runtime supports manual workflow runs, due scheduled workflow dispatch, and public webhook workflow triggers. The schedule-list force-run action for workflow targets is intentionally different today: it creates a workflow execution log and completes it through a simulated backend heartbeat instead of executing the visual graph.

## Runtime Files

Core runtime code lives in these files:

- `convex/workflowRuntime.ts` contains Node runtime actions, node-type dispatch, downstream scheduling, email delivery, agent execution, and approval resumption.
- `convex/workflowEngine.ts` contains execution initialization, step finalization, downstream readiness checks, iterator fan-out, merge behavior, database operation enforcement, and the due schedule dispatcher.
- `convex/workflowRuntimeService.ts` contains pure runtime helpers for config parsing, template resolution, action request building, node outputs, wait decisions, approval halts, iterator outputs, and runtime error formatting.
- `convex/workflowExecutions.ts` contains execution and step helper mutations and queries, including pending-step claiming.
- `convex/scheduler.ts` contains schedule CRUD, agent schedule force-runs, workflow schedule force-run simulation, and execution log queries for the admin pages.
- `convex/workflowScheduleService.ts` calculates legacy and v2 schedule run times.
- `convex/workflows.ts` owns workflow CRUD, manual trigger creation, webhook secret generation, public webhook execution creation, and graph validation on update.
- `convex/webhooks.ts` exposes the public workflow webhook HTTP action.
- `convex/utils/workflowTypes.ts` parses and validates workflow graph, edge, state, and output JSON.

Frontend workflow routes live under `src/app/(dashboard)/admin/workflows/`, and shared workflow components live under `src/ui/components/workflows/`. Those files configure the graph and display logs; the runtime described here is the Convex execution path after a run has been started.

## Data Contracts

The runtime depends on four schema areas:

- `workflows` stores `name`, optional `description`, `isActive`, `triggerType`, serialized `nodes`, serialized `edges`, `createdBy`, timestamps, and optional `webhookSecret`.
- `workflowExecutions` stores run status, trigger type, optional `workflowId`, optional `companyId`, optional `agentId`, optional `agentRunId`, `startedBy`, timestamps, and serialized final `state`.
- `workflowExecutionSteps` stores one or more step attempts per node with `executionId`, `nodeId`, optional agent linkage, serialized `input`, serialized `output`, `status`, error text, and timestamps.
- `schedules` stores workflow or agent targets, active state, serialized interval configuration, `lastRunTs`, `nextRunAt`, and the creating user.

Runtime state is JSON. `initExecution` starts with a state shaped like:

```json
{
  "trigger": {}
}
```

As nodes complete, `processNodeFinalization` writes output under `nodes[nodeId].output`. Iterator fan-out creates per-item step inputs where the iterator node output is replaced with `{ item, index, items }` for each downstream item. This means downstream nodes should read runtime state by node id rather than assuming a flat payload shape.

## Entry Points

Manual designer runs call `api.workflows.triggerManualRun`. The mutation requires a super admin, creates a `workflowExecutions` row with status `RUNNING` and trigger type `MANUAL`, then schedules `internal.workflowRuntime.startWorkflow` immediately.

Action callers can use `runManualSync` in `convex/workflows.ts`; it requires action-level super-admin authorization and then follows the same runtime path.

Due schedule dispatch is handled by `internal.workflowEngine.scheduleDispatcher`, which is registered from `convex/crons.ts` to run every minute. The dispatcher queries active schedules whose `nextRunAt` is due, up to the bounded dispatch limit. Workflow schedules only execute the graph when the workflow exists, is active, and has `triggerType` set to `SCHEDULE`. Agent schedules queue agent runs and link them to workflow execution logs instead of invoking the workflow graph runtime.

Public webhooks enter through `convex/webhooks.ts`. The HTTP action reads the `workflowId` query parameter, requires the workflow to be active and configured as `WEBHOOK`, verifies the `x-sonae-secret` header against the stored secret, creates a public webhook execution through `createPublicWorkflowRunInternal`, and schedules `startWorkflow` with the request body as initial input. The secret is not accepted in the URL.

The schedule-list force-run action in `api.scheduler.manualRunSchedule` is not a graph execution path for workflows. For workflow targets, it creates an execution and schedules `internal.scheduler.completeSimulation`. For agent targets, it queues and runs the agent path. Use this distinction when debugging customer reports about force-run behavior.

## Execution Lifecycle

`startWorkflow` calls `internal.workflowEngine.initExecution`. Initialization parses workflow nodes and edges, stores the initial trigger payload on the execution, finds nodes with no incoming edges, creates `PENDING` steps for those starting nodes, and returns their ids. Empty graphs are marked `SUCCESS` with a "No nodes to execute" state.

Each returned starting node is scheduled with `ctx.scheduler.runAfter(0, internal.workflowRuntime.executeNode, ...)`.

`executeNode` performs the runtime work:

- It stops early if the execution is missing or already failed.
- It loads and parses the workflow graph.
- It finds the requested node.
- It claims the oldest `PENDING` step for that execution and node by calling `claimNextPendingStep`.
- It creates runtime context from the step input, execution state, `_inputMapping`, and `_inputTemplate`.
- It dispatches by node type and produces a serialized output payload.
- It calls `finalizeNodeStep` to write output, update execution state, and create downstream `PENDING` steps.
- It schedules ready downstream node ids unless the output asks the scheduler to halt.

Pending-step claiming is important. Iterator fan-out can create multiple pending steps for the same downstream node. `claimNextPendingStep` uses `by_execution_node_status_started`, claims the oldest pending step, and patches it to `RUNNING`. If another worker already claimed the step, the action exits without failing the execution.

## Node Dispatch

The runtime recognizes these node behaviors:

| Node type | Runtime behavior |
| --- | --- |
| `agentNode` | Calls `internal.agentRuntime.runTriggeredAgentObjective` with trigger type `WORKFLOW`, passing workflow creator company/user context where available, then links the returned `agentRunId` to the step. |
| `actionNode` | Builds a templated HTTP request, validates the URL with `validateSafeUrl`, executes `fetch`, and stores status plus parsed response text. |
| `codeNode` | Resolves the configured input/template into a structured transform output. It is not arbitrary server-side code execution. |
| `logicNode` | Evaluates configured rules and stores the selected branch id in output so finalization can filter outgoing edges. |
| `databaseNode` | Builds a validated database operation request and delegates to `executeDatabaseOperation` for tenant and table enforcement. |
| `waitNode` | Produces a system delay. Downstream scheduling uses that delay. |
| `approvalNode` | Produces a system halt. The step becomes `PENDING_APPROVAL` and downstream nodes are not scheduled until approval resumes it. |
| `iteratorNode` | Converts a configured list into item payloads and fans out downstream pending steps. |
| `mergeNode` | Reads execution steps and combines successful upstream outputs. |
| `emailNode` | Builds a branded email. It sends through Resend when configured and records a simulated email output when `RESEND_API_KEY` is absent. |
| Unknown type | Bypasses the node and records the node type plus resolved input. |

Node config parsing and defaulting belong in `workflowRuntimeService.ts`. Keep new runtime node behavior split the same way: pure config and output helpers in the service file, Convex side effects in runtime actions or engine mutations.

## Finalization And Downstream Scheduling

`processNodeFinalization` is the central state transition helper. It is intentionally a local helper in `workflowEngine.ts` so multiple mutations can use it without nesting Convex mutations.

When a node completes, finalization:

- Loads the current execution and workflow.
- Finds the step by explicit `stepId` where possible, otherwise by latest execution/node step.
- Parses the node output.
- Marks the step `SUCCESS` or `PENDING_APPROVAL`.
- Writes node output into the execution state unless the node halted.
- Filters outgoing edges for logic router branch output.
- Checks dependency readiness for downstream nodes.
- Inserts `PENDING` downstream steps.
- Marks the execution `SUCCESS` when there are no pending, running, or approval steps left.

Merge nodes have special readiness behavior. A merge with `_mergeConfig.mode === "WAIT_FOR_ANY"` can proceed once one incoming branch has succeeded, but finalization blocks duplicate merge attempts if another branch has already fired that merge. Other nodes wait for all incoming dependencies to have latest successful steps.

Wait nodes return a delay through `_system.delayMs`. `scheduleDownstreamNodes` converts the output into run-after decisions, so a wait node's downstream nodes are created as pending steps during finalization and then scheduled after the configured delay.

Approval nodes return `_system.halt`. The step is left as `PENDING_APPROVAL`, no downstream nodes are created for that finalization pass, and the execution remains `RUNNING`. `resumeApprovalStep` can approve or reject. Approval calls `resumeNodeStep`, finalizes the approval node with an approved system output, and schedules newly ready downstream nodes immediately. Rejection calls `failNodeStep`, which marks the step and execution failed. The current admin log UI exposes the approval path.

Any thrown runtime error is caught by `executeNode`, passed through `getRuntimeErrorMessage`, and sent to `failNodeStep`. That mutation marks the current step failed when it can identify one and marks the whole execution `FAILED`, which prevents further scheduled node work from proceeding.

## Database Operation Safety

Database nodes are intentionally constrained even though workflow authoring is currently super-admin-only in the UI.

`executeDatabaseOperation` loads the workflow creator and treats `SUPER_ADMIN` creators as unrestricted for supported Convex table names. Non-super-admin creators are restricted to an allowlist:

- `properties`
- `threads`
- `messages`
- `widgets`
- `knowledgeDocuments`
- `knowledgeChunks`
- `aiRules`
- `agentLogs`
- `agentTransactions`
- `arcadeScores`
- `salesReports`

For non-super-admin creators, the workflow creator must have a company id. Selects by document id verify the document belongs to that company. Indexed selects must use supported table/index contracts and either require or enforce the creator company id. Inserts force the company id. Updates and deletes verify the existing document belongs to the creator company and reject company reassignment.

The indexed select contracts are deliberately explicit. Adding a new selectable table or index requires updating `executeIndexedSelect`, adding tests for the expected tenant boundary, and documenting the contract for workflow builders. Do not bypass this with generic dynamic queries.

## Schedule Semantics

Schedule configuration is serialized in `schedules.intervalStr`. The backend supports legacy string values, legacy JSON, and version 2 JSON from the schedule builder.

Version 2 schedule configs support:

- recurring hourly schedules with `everyHours`, `startTimeLocal`, and timezone
- recurring daily schedules with local time and timezone
- recurring weekly schedules with day of week, local time, and timezone
- recurring monthly schedules with day of month, local time, and timezone
- targeted local times with one to 24 local times and timezone

`workflowScheduleService.ts` validates timezone strings using `Intl.DateTimeFormat`, validates `HH:mm` times, converts local candidates to UTC, and looks up future or recent eligible run times. `scheduleDispatcher` calls `shouldRunWorkflowSchedule` before dispatch and patches `lastRunTs` plus `nextRunAt` after a run is queued.

Paused schedules have no `nextRunAt`. Toggling a schedule active recalculates `nextRunAt` from the saved interval, previous `lastRunTs`, and current time.

## Webhook Runtime Boundaries

Webhook runtime is intentionally narrow:

- The workflow must exist, be active, and have `triggerType === "WEBHOOK"`.
- The request must send the exact secret in the `x-sonae-secret` header.
- Secret comparison uses constant-time comparison in `convex/workflows.ts`.
- Initial public input is trimmed and limited before it is stored.
- Public execution creation can include tenant context through `companyId` when the caller path supplies it.

Keep webhook secrets out of URLs, logs, and docs examples. When debugging, inspect whether the workflow still has webhook trigger type, whether the secret was generated during workflow update, and whether the body shape matches the downstream node templates.

## Observability And Debugging

The admin execution log pages read from `workflowExecutions` and `workflowExecutionSteps`. The list is bounded and sorted by newest `startedAt`; the detail view shows steps and execution state JSON.

When diagnosing a runtime issue, check:

- The execution row status, trigger type, `workflowId`, `agentId`, `agentRunId`, `startedBy`, and final `state`.
- Step rows ordered by `startedAt`, especially `PENDING`, `RUNNING`, `PENDING_APPROVAL`, and `FAILED` statuses.
- Whether a downstream node has unsatisfied incoming dependencies.
- Whether a merge node is `WAIT_FOR_ANY` or default all-upstream mode.
- Whether an iterator produced multiple pending steps for the same downstream node.
- Whether a wait node delayed scheduling rather than failed.
- Whether an email node simulated output because `RESEND_API_KEY` is absent.
- Whether schedule-list force-run was used for a workflow target, because that path does not run the graph.

The runtime stores raw node outputs and execution state as JSON strings. Treat those values as potentially sensitive because they can include customer records, external API responses, AI outputs, webhook payloads, and email content.

## Tests And Maintenance Checks

Targeted tests for this area include:

- `convex/workflows.test.ts`
- `convex/workflowRuntime.test.ts`
- `convex/workflowRuntimeService.test.ts`
- `convex/workflowExecutions.test.ts`
- `convex/workflowScheduleService.test.ts`
- `convex/scheduler.test.ts`
- `convex/webhooks.test.ts`
- `src/app/(dashboard)/admin/workflows/page.test.tsx`
- `src/app/(dashboard)/admin/workflows/schedules/page.test.tsx`
- `src/app/(dashboard)/admin/workflows/schedules/_lib/scheduleConfig.test.ts`
- `src/ui/components/workflows/WorkflowComponents.test.tsx`

Before merging implementation changes in this area, run the normal project gates from `AGENTS.md`. For documentation-only changes, still run `git diff --check`.

When extending the runtime:

- Preserve super-admin-only workflow management unless a product requirement explicitly changes it.
- Keep database-node tenancy enforcement in `executeDatabaseOperation` and cover new table/index contracts with tests.
- Keep service helpers pure where possible so node behavior can be tested without Convex side effects.
- Update both workflow docs if runtime behavior changes in a way users must understand.
- Update locale files when changing workflow UI labels or messages.
- Do not touch frozen movement demo implementation files as part of workflow work.
