# Workflow Automation

Workflow automation is Sonae's super-admin orchestration surface for building, scheduling, triggering, and inspecting graph-based AI and integration runs. It is implemented as an administrative feature, not as a tenant admin or standard user feature. The implementation currently combines a React Flow designer, inline agent configuration, external action nodes, database nodes, schedule records, webhook triggers, execution logs, and a Convex runtime that advances node steps through the graph.

This document describes the implementation as it exists now. It intentionally does not describe roadmap behavior as live behavior. The most important current caveat is that manual runs launched from the workflow designer use the real graph runtime, due cron dispatch uses the real graph runtime for workflow schedules whose workflow trigger type is `SCHEDULE`, but the schedule-list force-run action for workflow targets currently creates a workflow execution and completes it through a simulated backend heartbeat rather than executing the visual graph. Agent schedule force-runs do queue durable agent runs. For the lower-level execution contracts behind those paths, see [Workflow Runtime Internals](./workflow-runtime-internals.md).

## Product Surface

Workflow administration is under the admin route group:

- `src/app/(dashboard)/admin/workflows/page.tsx` lists workflows, searches by name, creates new workflows, deletes workflows, and links rows into the visual designer.
- `src/app/(dashboard)/admin/workflows/[id]/page.tsx` hosts the React Flow designer for one workflow.
- `src/app/(dashboard)/admin/workflows/schedules/page.tsx` lists standalone workflow and agent schedules.
- `src/app/(dashboard)/admin/workflows/schedules/new/page.tsx` creates a standalone schedule.
- `src/app/(dashboard)/admin/workflows/schedules/[id]/page.tsx` edits a standalone schedule.
- `src/app/(dashboard)/admin/workflows/logs/page.tsx` lists recent workflow execution records.
- `src/app/(dashboard)/admin/workflows/logs/[id]/page.tsx` shows one execution, its node steps, final state JSON, and approval-resume controls for paused approval steps.

The visual node components live in `src/ui/components/workflows/`. `WorkflowSidebar.tsx` is the drag source for node types. `ConfigDrawer.tsx` edits trigger, API action, database, logic, iterator, merge, wait, approval, email, and generic mapping fields. `AgentEditorModal.tsx` configures inline agent nodes and can promote non-global agents to global agents. `types.ts` defines the client-side node data shape used by the designer.

Schedules have an additional builder split between `src/app/(dashboard)/admin/workflows/schedules/_components/ScheduleBuilder.tsx` and `src/app/(dashboard)/admin/workflows/schedules/_lib/scheduleConfig.ts`. The builder serializes schedule choices into a versioned JSON `intervalStr`, while the backend service still supports legacy strings and legacy JSON schedule contracts.

## Data Model

The core schema is in `convex/schema.ts`.

`workflows` stores graph definitions:

- `name` and optional `description` are shown in the workflow list.
- `isActive` controls whether scheduled and webhook workflows can run.
- `triggerType` is `MANUAL`, `WEBHOOK`, or `SCHEDULE`.
- `nodes` and `edges` are stringified React Flow arrays.
- `createdAt`, `updatedAt`, and `createdBy` track ownership and audit context.
- `webhookSecret` is generated when a workflow is configured for webhook triggering.

`workflowExecutions` stores run-level state:

- `workflowId` is optional because the same log table also records agent schedule executions.
- `companyId` may be present for tenant-scoped public webhook executions.
- `agentId` and `agentRunId` connect schedule-driven agent runs to the execution log.
- `status` is `RUNNING`, `SUCCESS`, or `FAILED`.
- `triggerType` records the entry point, such as `MANUAL`, `SCHEDULE`, or `WEBHOOK`.
- `startedAt`, optional `completedAt`, and `startedBy` support logs and audit context.
- `state` is JSON used for final execution inspection and downstream node context.

`workflowExecutionSteps` stores node-level progress:

- `executionId`, `nodeId`, optional `agentId`, and optional `agentRunId` identify the step.
- `input` and optional `output` are JSON strings.
- `status` can be `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, or `PENDING_APPROVAL`.
- `error`, `startedAt`, and optional `completedAt` support diagnosis.

`schedules` stores standalone schedules for either workflows or agents:

- `workflowId` or `agentId` selects the target. Mutations reject schedules that have neither.
- `intervalStr` contains either legacy text, legacy JSON, or v2 schedule JSON.
- `isActive`, `lastRunTs`, and `nextRunAt` drive dispatcher selection.
- `createdAt` and `createdBy` provide ownership and execution actor context.

Indexes matter for scale and correctness. Workflows use `by_createdAt` and `search_name` for the admin list. Schedules use `by_createdAt` for the list, `by_workflow` and `by_agent` for target lookup, and `by_active_next_run` for the minute dispatcher. Execution logs use `by_startedAt`, `by_workflow`, and `by_company_started`. Step detail queries use execution and status indexes capped by constants in `convex/scheduler.ts` and `convex/workflowExecutions.ts`.

## Authorization And Tenancy

Workflow CRUD and schedule management are super-admin-only. `convex/workflows.ts` uses `requireSuperAdmin` for list, paginated list, get, create, update, delete, manual trigger, and webhook-secret read. `convex/scheduler.ts` also uses `requireSuperAdmin` for schedule list, get, create, update, toggle, delete, force run, and execution log queries. `convex/workflowRuntime.ts` uses `requireActionUser` for approval resumption, so an authenticated user can call the action, but the UI route that exposes it is in the admin workflow logs area and passes an existing workflow execution and workflow id.

Database nodes have a separate runtime guard in `convex/workflowEngine.ts`. The runtime loads the workflow creator and treats a creator with `SUPER_ADMIN` as unrestricted for database operations. If the creator is not a super admin, database operations are limited to an allowlist and force or verify the creator's company id. Non-super-admin database selects must use supported indexed query contracts or a document id that belongs to the creator's company. Inserts and updates force the creator company id and reject attempts to cross company boundaries. This matters even though the public UI currently limits workflow authoring to super admins, because runtime paths and tests cover tenant boundary behavior defensively.

Public webhook execution is exposed through internal/public trigger paths rather than the admin UI alone. `convex/workflows.ts` has `createPublicWorkflowRunInternal`, which creates a tenant-scoped webhook execution only for active workflows whose `triggerType` is `WEBHOOK`. It trims and limits public initial input to 20,000 characters. The HTTP action `handleWebhook` reads `workflowId` from the query string, requires an active webhook workflow, and verifies `x-sonae-secret` against the stored `webhookSecret` using constant-time comparison. It intentionally does not accept the secret in the URL.

## Designer Behavior

The workflow list uses `api.workflows.getPaginatedWorkflows` with the shared `ADMIN_PAGE_SIZE`, currently 15 rows per page. Searching calls the same query with `searchTerm` and uses the `search_name` search index. Creating a workflow inserts an active manual workflow with empty node and edge arrays, then navigates directly into the designer. Deleting a workflow removes the workflow document and writes a `DELETE_WORKFLOW` audit log; the mutation does not cascade through execution logs or schedules.

The designer initializes React Flow state by parsing `workflow.nodes` and `workflow.edges`. Dragging from the node library adds nodes with ids based on node type and the current timestamp. Connecting nodes creates animated edges. Before saving, the page performs a client-side depth-first cycle check; backward cycles are rejected with an in-app feedback banner, and users are directed to use iterator nodes for repeated work. On save, the page derives the workflow `triggerType` from the first trigger node's `_triggerType`, serializes the nodes and edges, and calls `api.workflows.updateWorkflow`.

`updateWorkflow` validates graph JSON with `convex/utils/workflowTypes.ts`. If saved nodes include a trigger node whose data says `SCHEDULE`, the mutation creates or updates one schedule row linked by `workflowId`; the interval comes from `_scheduleInterval` and defaults to `daily`. If the trigger is changed away from `SCHEDULE`, any linked workflow schedule is deleted. If the workflow is configured as `WEBHOOK`, a `webhookSecret` is generated if one does not already exist. Workflow create, update, and delete mutations each write audit logs with action types `CREATE_WORKFLOW`, `UPDATE_WORKFLOW`, and `DELETE_WORKFLOW`.

Node configuration is mixed maturity. Agent nodes are feature-rich: they create inline agents when needed, update model selection, system prompt, schema fields, reasoning settings, internet access, temperature, and graph input mapping. API action nodes support method, URL, headers, and body templates. Logic nodes route by configured rules and branch ids. Iterator nodes fan out an array. Merge nodes wait for all upstream branches by default or can accept the first successful branch. Wait nodes delay downstream scheduling. Approval nodes mark the step as needing approval. Email nodes build a message and send through Resend when configured. Database nodes support insert, update, delete, and indexed select contracts against selected tables. Some generic node mapping fields can be generated by `api.ai.generateNodeConfig`.

## Runtime Flow

Manual runs from the designer call `api.workflows.triggerManualRun`. The mutation creates a `workflowExecutions` row with `RUNNING` status, trigger type `MANUAL`, and the current super admin as `startedBy`. It then schedules `internal.workflowRuntime.startWorkflow` immediately. The synchronous action `runManualSync` exists for action callers and requires action-level super-admin auth before calling the same manual trigger path and runtime.

`startWorkflow` initializes execution state through `internal.workflowEngine.initExecution`. The initial state is `{ trigger: ... }`, where malformed JSON initial input becomes an empty object. Empty graphs complete successfully with a state message. Otherwise, the engine finds nodes with no incoming edges, creates `PENDING` steps for them, and schedules `executeNode` for each starting node.

`executeNode` claims the next pending step for the requested node to avoid duplicate work during fan-out. It builds a runtime context from step input, whole execution state, `_inputMapping`, and `_inputTemplate`. Then it dispatches by node type:

- `agentNode` calls `internal.agentRuntime.runTriggeredAgentObjective` with trigger type `WORKFLOW`, links the resulting `agentRunId` back to the step, and uses the agent output as the node output.
- `actionNode` validates the URL through `validateSafeUrl`, resolves headers/body templates, performs `fetch`, and stores status plus parsed response text.
- `codeNode` currently resolves the configured input template against a safe payload; it is not a general-purpose arbitrary code execution path.
- `logicNode` evaluates configured rules and returns the chosen downstream branch id.
- `databaseNode` builds a validated database operation and delegates tenant-sensitive behavior to `executeDatabaseOperation`.
- `waitNode` returns a system delay, which delays downstream node scheduling.
- `approvalNode` returns a system halt, which sets the step to `PENDING_APPROVAL`.
- `iteratorNode` converts the configured list target into items and creates one pending downstream step per item.
- `mergeNode` collects successful upstream step outputs.
- `emailNode` resolves email fields and either sends via Resend or records a simulated email output when `RESEND_API_KEY` is absent.
- Unknown node types are bypassed with a structured output recording the node type and received input.

After a successful node, `finalizeNodeStep` updates the step, appends the parsed output into execution state under `nodes[nodeId].output`, computes downstream readiness, creates pending downstream steps, and returns node ids that should be scheduled. If no pending, running, or approval steps remain, the execution is marked `SUCCESS`. Any thrown error calls `failNodeStep`, marks the current step failed when possible, and marks the entire execution `FAILED`.

Approval resumption is action-based. The log detail screen calls `api.workflowRuntime.resumeApprovalStep` for `APPROVED`. Rejection is implemented by the action but the current UI only exposes an approve-and-resume button. Approval resumes the halted node by finalizing it with an approved system output and schedules downstream nodes immediately.

## Schedules

Standalone schedules can target either a workflow graph or an autonomous agent. The schedule list reads at most 100 schedules, enriches each row with workflow or agent names, filters in the client, and paginates locally with 15 rows per page. The create and edit screens use the schedule builder, default to agent payload mode, require a schedule name and selected target, and validate the schedule draft before writing.

The current schedule config v2 supports recurring hourly, daily, weekly, monthly, and targeted local times. `scheduleConfig.ts` uses the browser timezone while editing, serializes to JSON, and displays UTC previews. `convex/workflowScheduleService.ts` validates timezones, converts local times to UTC candidates, deduplicates targeted times, and calculates both the most recent and next eligible run. It also retains support for legacy interval strings such as `daily`, `hourly`, `every 4 hours`, and legacy JSON modes.

`convex/crons.ts` runs `internal.workflowEngine.scheduleDispatcher` every minute. The dispatcher queries active schedules whose `nextRunAt` is due, up to 500 per tick. Agent schedules create a queued `agentRuns` record and a linked `workflowExecutions` record, then schedule `internal.agentRuntime.runTriggeredAgentObjective`. Workflow schedules only run when the target workflow exists, is active, and has trigger type `SCHEDULE`; they create a workflow execution and schedule `workflowRuntime.startWorkflow`. After dispatching, the schedule records `lastRunTs` and calculates the next run.

The schedule-list force-run button calls `api.scheduler.manualRunSchedule`. For agent targets this queues a durable agent run. For workflow targets it creates a workflow execution and schedules `internal.scheduler.completeSimulation` after two seconds. That means it verifies logging and schedule controls but does not execute the workflow graph. Use the workflow designer's manual run or the due schedule dispatcher path when testing real workflow graph execution.

## Verification

Relevant tests include:

- `convex/workflows.test.ts` for workflow authorization, webhook secret generation, lifecycle audit behavior, graph validation, runtime initialization, iterator fan-out, merge behavior, approval resume, database operation tenancy, and public webhook execution.
- `convex/workflowRuntime.test.ts` and `convex/workflowRuntimeService.test.ts` for runtime node behavior and helper output.
- `convex/workflowScheduleService.test.ts` for legacy and v2 schedule calculations.
- `convex/scheduler.test.ts` for schedule authorization, CRUD, bounded lists, force run behavior, due agent schedules, and due workflow schedule dispatch.
- `src/app/(dashboard)/admin/workflows/page.test.tsx` and `src/app/(dashboard)/admin/workflows/schedules/page.test.tsx` for the admin list and schedule list interactions.
- `src/app/(dashboard)/admin/workflows/schedules/_lib/scheduleConfig.test.ts` for schedule draft serialization and hydration.
- `src/ui/components/workflows/WorkflowComponents.test.tsx` for workflow UI components.

For local verification, run targeted tests around the changed area first, then the full project gate before merging documentation or code changes:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

When touching this area, also inspect both locale files because workflow UI strings live under the admin workflow namespaces in `messages/en.json` and `messages/it.json`. Keep the movement demo freeze in `AGENTS.md` in mind only because it shares the admin app shell; workflow work does not require touching the frozen movement demo.
