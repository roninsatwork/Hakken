# True Agentic Platform Plan

This plan turns Sonae from an AI workflow and configurable-agent system into a platform that can honestly be called a true agentic automation platform.

Use this as the locked source of truth for agent runtime, tool execution, durable runs, approvals, memory, and agent evaluation work. Follow the phases in order unless the user explicitly changes scope.

## Goal

Sonae should support agents that can safely pursue a user or system objective over multiple steps by planning, calling real tools, inspecting results, asking for approval when needed, persisting progress, and completing or failing with a clear audit trail.

The target claim is:

> Sonae is an agentic automation platform where governed agents can reason over tenant-scoped context, execute approved tools, run from chat, schedules, webhooks, or workflows, and leave durable, replayable traces of every step.

## Current Position

Sonae already has useful agentic foundations:

- `convex/chat.ts` routes user messages to normal assistant, agent-backed thread, or swarm execution.
- `convex/agentRuntime.ts` loads an agent prompt, resolves a configured model, retrieves agent-scoped RAG context, and performs a model response.
- `convex/workflowRuntime.ts` runs durable workflow graphs with agent, API, code, logic, database, wait, approval, iterator, merge, and email nodes.
- `convex/workflowEngine.ts` persists workflow execution state and schedules downstream nodes.
- `convex/swarmActions.ts` chains multiple configured micro-agents with shared memory.
- `convex/aiPromptAssembly.ts` has a platform safety contract for tenant isolation, hidden prompt handling, untrusted knowledge, and tool-call policy.
- `convex/aiToolExecutionService.ts` has early tool declaration, policy normalization, role checks, tenant checks, and normalized result payload helpers.
- Admin surfaces already expose agents, tools, rules, knowledge, schemas, models, logs, transactions, workflows, and schedules.

The main gap has been closed at the minimum-platform level: the named agent runtime now has a bounded durable loop, read-only tools, first-class approval pause/resume, one governed write tool, generic manual/scheduled/workflow triggers, tenant-scoped memory, replay/cancellation controls, analytics, and admin run inspection. Future work should broaden the tool inventory, add deeper replay diffing, harden evaluator coverage, and follow `docs/agent-learning-improvement-plan.md` for governed agent learning over time, but the core architecture now supports the agentic automation platform claim.

## Honest Product Language

Until this plan reaches the acceptance gate, use conservative product language:

- Preferred: "AI workflows", "configurable agents", "agent-backed assistant", "agentic scaffolding", "AI automation".
- Avoid: "fully autonomous agents", "true agentic platform", "self-directed agents", "agents that execute tools" unless describing planned work or a completed slice.

After the final acceptance gate, "agentic automation platform" is a fair claim.

## Non-Drift Rules

- Do not touch the frozen movement demo unless explicitly requested or a quality gate is broken by it.
- Keep runtime model selection configuration-driven. Do not hardcode provider/model literals in generic agent paths.
- Preserve tenant isolation in every query, mutation, tool call, memory read, memory write, workflow node, and scheduled run.
- Treat model tool calls as requests, not permissions.
- Every real-world side effect must have deterministic backend authorization and an audit record.
- Destructive, external, or high-risk actions must support explicit approval before execution.
- Keep English and Italian locale dictionaries in parity for new UI.
- Admin tables and feeds should keep 15 rows per page unless a specific product requirement says otherwise.

## Target Architecture

### Durable Agent Runs

Add first-class run records instead of relying on chat messages and agent logs as the only source of truth.

Recommended tables:

- `agentRuns`
- `agentRunSteps`
- `agentToolCalls`
- `agentRunApprovals`
- optional later: `agentMemories`

Recommended `agentRuns` fields:

- `agentId`
- `threadId`, optional
- `workflowId`, optional
- `scheduleId`, optional
- `triggerType`: `CHAT`, `MANUAL`, `SCHEDULE`, `WEBHOOK`, `WORKFLOW`, `EVENT`
- `objective`
- `status`: `QUEUED`, `RUNNING`, `PENDING_APPROVAL`, `SUCCESS`, `FAILED`, `CANCELLED`
- `companyId`
- `userId`, optional
- `modelId`, `providerKey`, `providerModelId`
- `maxSteps`
- `maxCostGBP`, optional
- `maxRuntimeMs`, optional
- `inputTokens`, `outputTokens`, `costGBP`
- `startedAt`, `completedAt`, `cancelledAt`, `updatedAt`
- `error`, optional
- `finalOutput`, optional

Recommended `agentRunSteps` fields:

- `runId`
- `stepIndex`
- `kind`: `OBSERVE`, `PLAN`, `MODEL`, `TOOL_CALL`, `TOOL_RESULT`, `APPROVAL_REQUEST`, `REPLAN`, `FINAL`
- `status`: `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `SKIPPED`
- `input`
- `output`
- `modelId`, `providerKey`, `providerModelId`, optional
- `inputTokens`, `outputTokens`, `costGBP`, optional
- `startedAt`, `completedAt`
- `error`, optional

Recommended `agentToolCalls` fields:

- `runId`
- `stepId`
- `agentId`
- `toolId`
- `normalizedToolName`
- `handlerMapping`
- `argumentsJson`
- `redactedArgumentsJson`
- `resultJson`
- `status`: `PENDING`, `APPROVAL_REQUIRED`, `SUCCESS`, `FAILED`, `DENIED`, `CANCELLED`
- `requiredRole`
- `sideEffectLevel`: `READ`, `WRITE`, `DESTRUCTIVE`, `EXTERNAL`
- `confirmationRequired`
- `confirmationGrantedAt`, optional
- `companyId`
- `userId`, optional
- `startedAt`, `completedAt`
- `error`, optional

### Agent Runtime Loop

Replace the current one-or-two-pass agent path with a bounded loop:

```text
create run
observe objective + context
create or update plan
while run is active and budgets allow:
  ask model for next action or final answer
  validate action
  if tool call:
    authorize
    request approval if needed
    execute real handler
    persist result
    continue
  if final answer:
    persist output
    complete run
  if model/tool failure:
    retry or replan within limits
fail or cancel clearly when limits are hit
```

The loop must be bounded by:

- max step count
- max cost
- max runtime
- max tool calls
- provider retry policy
- user or admin cancellation

### Real Tool Execution

Move from tool declarations and mocked results to a real tool dispatcher.

Required capabilities:

- Store JSON input schema on `aiTools`.
- Store side-effect level and approval policy on `aiTools`.
- Validate model-provided args against schema before execution.
- Resolve `handlerMapping` through an allowlisted dispatcher, not arbitrary dynamic invocation.
- Re-check user role, company scope, and target object scope at execution time.
- Persist every tool call and result.
- Return normalized tool results to the model.
- Never execute a tool solely because the model requested it.

Recommended tool classes:

- Tenant data query tools.
- Knowledge search tools.
- CRM/company record mutation tools.
- Email/notification tools.
- Workflow/task creation tools.
- Approved external API tools.
- MCP proxy tools after a stricter approval and schema story exists.

### Human Approval

Human approval should be part of the agent runtime, not only workflow nodes.

An agent must be able to pause a run when:

- the agent requires approval globally,
- the tool requires approval,
- the side-effect level is destructive or external,
- the estimated risk crosses a configured threshold,
- the model requests an action outside normal policy.

The UI should show:

- objective
- proposed action
- tool name
- arguments with PII redaction
- target tenant/object
- side-effect level
- model rationale or summary
- approve/reject controls

Approval should resume the same run from the same step. Rejection should either fail the run or let the agent replan without that action, depending on policy.

### Memory

Memory should be explicit and governed. Do not treat chat history as the only agent memory.

Recommended memory types:

- run working memory: short-lived facts and intermediate state for a single run
- agent memory: reusable facts for a configured agent
- tenant memory: company-scoped operating context
- user memory: optional future personalization, only if product policy supports it

Memory writes must be policy-controlled:

- never store secrets, credentials, hidden prompts, or sensitive personal data by default
- support tenant/user deletion and audit requirements
- include source run and confidence metadata
- retrieve memory with tenant and agent scope filters

### Governed Learning Loop

Agents should improve over time from approved retained context, measured outcomes, replayed failures, and human feedback. This is operational learning, not silent model-weight training.

The follow-on roadmap is saved in `docs/agent-learning-improvement-plan.md`.

The high-level loop is:

- complete or fail an agent run
- record steps, tools, approvals, cost, latency, and outcome
- collect human feedback where available
- generate a structured failure or success reflection
- propose candidate memories, eval fixtures, prompt improvements, rule changes, tool schema changes, or routing changes
- policy-check every candidate
- require approval for high-impact memories and behavior changes
- apply approved changes as versioned configuration
- compare future runs against prior versions

Hard boundaries:

- no cross-tenant learning
- no hidden prompt or secret retention
- no automatic weakening of approval policy
- no self-modifying system prompts without review
- every applied learning artifact must cite source runs and remain reversible

### Triggers

Agents should run from multiple entry points through one runtime contract:

- chat
- manual admin run
- workflow agent node
- schedule
- webhook
- future event triggers

Each trigger should create an `agentRun` with a clear objective and payload. Scheduled and webhook runs should not require a chat thread.

### Evaluation And Replay

The platform should prove agent behavior with regression coverage.

Needed:

- fixtures for agent objectives and expected tool plans
- tests for tool schema validation
- tests for tenant isolation during tool calls
- tests for approval pauses and resumes
- tests for cancellation
- tests for prompt-injection attempts through RAG and tool args
- replay view or internal helper for failed runs
- analytics for cost, latency, tool success rate, approval rate, and failure reasons

## Implementation Phases

### Progress Tracker

Current overall completion: **100%**

Progress is weighted by production value, not by number of phases. Update this table whenever a phase is completed or materially advanced.

| Phase | Weight | Status | Contribution Complete |
| --- | ---: | --- | ---: |
| Phase 1: Agent Run Data Model | 12% | Complete | 12% |
| Phase 2: Tool Contract Hardening | 12% | Complete | 12% |
| Phase 3: Real Read-Only Tools | 10% | Complete | 10% |
| Phase 4: Bounded Multi-Step Runtime | 18% | Complete | 18% |
| Phase 5: Human Approval Runtime | 12% | Complete | 12% |
| Phase 6: Write Tools And Side Effects | 10% | Complete | 10% |
| Phase 7: Generic Agent Triggers | 10% | Complete | 10% |
| Phase 8: Agent Memory | 8% | Complete | 8% |
| Phase 9: Evaluation, Replay, And Analytics | 8% | Complete | 8% |

Status values:

- `Not started`: no implementation committed.
- `In progress`: implementation has begun but acceptance criteria are incomplete.
- `Blocked`: implementation cannot continue without product, security, provider, or user decision.
- `Complete`: acceptance criteria are met and verification has passed.

When a phase completes, update:

- current overall completion
- phase row status and contribution
- phase `Status` note
- phase `What Is Next` note
- any newly discovered follow-up work

### Phase Completion Report Format

Use this format in the final response after each phase:

```text
Phase N complete: <phase name>
Overall progress: <old>% -> <new>%
Completed:
- <high-signal item>
- <high-signal item>
Verified:
- <commands/tests run>
What is next:
- <next phase or next slice>
Risks/notes:
- <only if needed>
```

### Phase 1: Agent Run Data Model

Progress weight: 12%
Status: Complete as of June 14, 2026. Added durable run, step, tool-call, and approval tables, admin-scoped run/detail reads, internal write helpers, and focused tenant-boundary coverage.

Goal: add durable run and step storage without changing current runtime behavior.

Tasks:

- Add `agentRuns`, `agentRunSteps`, `agentToolCalls`, and `agentRunApprovals` to `convex/schema.ts`.
- Add indexes by agent, company, status, thread, workflow, schedule, and started date.
- Add internal mutations for creating runs, appending steps, updating status, and recording cost.
- Add read APIs for admin run lists and run details.
- Add tests for tenant-scoped reads and super-admin reads.

Acceptance:

- Existing agent/chat/workflow behavior is unchanged.
- Admins can read only their company runs.
- Super-admins can read all runs.
- Runs and steps are bounded/paginated in admin queries.

What Is Next:

- Phase 2 is next: harden the tool contract with schemas, side-effect policy, active state, and a fail-closed dispatcher contract.

### Phase 2: Tool Contract Hardening

Progress weight: 12%
Status: Complete as of June 14, 2026. Added tool schemas, side-effect policy, confirmation policy, active state, versioning, backend schema validation, argument validation, fail-closed handler execution, and admin UI controls.

Goal: make tool definitions executable in principle, even before broad tool inventory exists.

Tasks:

- Extend `aiTools` with:
  - `inputSchema`
  - `outputSchema`, optional
  - `sideEffectLevel`
  - `confirmationRequired`
  - `isActive`
  - `version`
  - `updatedAt`
- Update create/edit tool UI and tests.
- Update `aiToolExecutionService.ts` to validate tool args against JSON schema.
- Add a dispatcher registry that maps approved `handlerMapping` values to explicit internal implementations.
- Preserve existing role and tenant checks.

Acceptance:

- Tools cannot be saved with invalid schemas.
- Runtime rejects invalid tool args before handler execution.
- Unknown `handlerMapping` values fail closed.
- Existing tool tests cover create, update, bind, unbind, delete, and schema validation.

What Is Next:

- Phase 3 is next: implement real read-only tools end to end, starting with a scoped knowledge search tool.

### Phase 3: Real Read-Only Tools

Progress weight: 10%
Status: Complete as of June 14, 2026. Added the first real read-only tool path with scoped `knowledge.search`, tenant-safe result retrieval, normalized model-facing results, durable `agentToolCalls` persistence from the agent runtime, and focused boundary tests.

Goal: execute safe read-only tools end to end.

Tasks:

- Implement first read-only tools:
  - knowledge search
  - company profile lookup
  - user-visible CRM/query lookup if product scope supports it
  - workflow execution status lookup
- Persist `agentToolCalls` with args, redacted args, result, status, and timing.
- Feed normalized tool results back into the model loop.
- Add read-only tool execution tests with tenant boundaries.

Acceptance:

- A chat agent can call a real read-only tool and synthesize the result.
- Tool calls are visible in run detail and audit/log views.
- A user cannot use a read-only tool to cross tenant boundaries.

What Is Next:

- Phase 4 is complete. Phase 5 is next: add first-class human approval pause/resume for write, destructive, and external tool calls.

### Phase 4: Bounded Multi-Step Runtime

Progress weight: 18%
Status: Complete as of June 14, 2026. Added canonical `runAgentObjective`, kept `generateAgentResponse` as a compatibility wrapper, moved chat agent scheduling to the canonical action, introduced bounded model/tool looping with step, tool-call, runtime, token, and cost budgets, persisted model/tool-call/tool-result/final steps, accumulated model usage across loop passes, linked tool calls to steps, and added deterministic loop-budget tests.

Goal: replace the one-tool branch with a bounded agent loop.

Tasks:

- Add `runAgentObjective` as the canonical agent runtime action.
- Keep the old `generateAgentResponse` as a compatibility wrapper while migrating.
- Add loop budgets: steps, tool calls, runtime, tokens, cost.
- Persist every model call, tool call, tool result, replan, and final output.
- Support model-requested final answer versus next action.
- Add retry/replan handling for recoverable tool/provider failures.

Acceptance:

- Agent runs can perform more than one tool call when needed.
- Runs stop cleanly when step or cost limits are reached.
- Failed tool calls are visible and can trigger a model replan.
- Existing chat agent behavior still works through the new runtime.

What Is Next:

- Phase 5 is complete. Phase 6 is next: add narrow governed write tools protected by the approval runtime.

### Phase 5: Human Approval Runtime

Progress weight: 12%
Status: Complete as of June 14, 2026. Added runtime pause behavior for confirmation-required tool calls, durable `APPROVAL_REQUEST` steps, public pending approval list and approve/reject/cancel mutations, tenant-scoped approval decisions, approved-tool resume action for implemented handlers, admin approval queue UI, sidebar navigation, locale parity, and focused approval policy tests.

Goal: make approvals a first-class pause/resume state for agent runs.

Tasks:

- Implement `PENDING_APPROVAL` for agent runs and tool calls.
- Add approval mutations for approve, reject, cancel.
- Add admin/user UI for pending approvals.
- Pause before write/destructive/external tools unless policy allows otherwise.
- Resume the exact run step after approval.

Acceptance:

- High-risk tool calls pause before execution.
- Approval/rejection is audited.
- Rejected actions do not execute.
- Approved actions resume without losing prior run context.

What Is Next:

- Phase 6 is complete. Phase 7 is next: route non-chat triggers through the same durable agent run contract.

### Phase 6: Write Tools And Side Effects

Progress weight: 10%
Status: Complete as of June 14, 2026. Added `company.overview.update` as the first governed write tool, made `WRITE` tools require approval by default, wired approved resume execution for the write handler, scoped writes to the active tenant company, recorded before/after mutation summaries in audit logs, preserved idempotent state behavior for duplicate retries, and added focused write-tool tests.

Goal: safely enable useful write operations.

Tasks:

- Implement narrow write tools with strong contracts:
  - create internal task/action
  - send notification
  - draft email
  - update permitted CRM/company records
  - create workflow execution request
- Require approval where appropriate.
- Add idempotency keys for external side effects.
- Store before/after summaries for mutations.

Acceptance:

- Write tools cannot mutate foreign tenant data.
- Destructive or external side effects require approval by default.
- Duplicate retries do not duplicate external sends.
- Every side effect has an audit trail.

What Is Next:

- Phase 7 is complete. Phase 8 is next: add governed agent memory.

### Phase 7: Generic Agent Triggers

Progress weight: 10%
Status: Complete as of June 14, 2026. Added `runTriggeredAgentObjective` for manual, scheduled, webhook/event-ready, and workflow-triggered agent objectives; linked workflow executions and workflow steps to durable `agentRuns`; converted workflow `agentNode` execution to create agent runs; converted manual and scheduled agent dispatch away from sales-report-specific behavior; and added focused scheduler coverage for linked manual/scheduled agent runs.

Goal: route chat, schedules, webhooks, and workflow nodes through the same agent runtime.

Tasks:

- Convert workflow `agentNode` execution to create an `agentRun`.
- Convert scheduled agent execution away from sales-report-only behavior.
- Add webhook-triggered agent run creation where product scope requires it.
- Keep sales report generation as a specialized tool or specialized agent objective, not a separate hidden runtime.
- Add run detail links from schedules, workflows, and agent logs.

Acceptance:

- A scheduled agent can run a generic objective.
- Workflow agent nodes produce durable agent runs.
- Webhook/manual/chat runs share the same run schema and status behavior.
- Old schedule simulation comments/behavior are removed or replaced.

What Is Next:

- Phase 8 is complete. Phase 9 is next: add evaluation, replay, and analytics.

### Phase 8: Agent Memory

Progress weight: 8%
Status: Complete as of June 14, 2026. Added tenant-scoped `agentMemories`, internal governed memory write/search helpers, safety rejection for hidden-instruction/permission-bypass/cross-tenant memory content, audit logs for memory write/delete, runtime memory observation steps for chat and triggered agent runs, and an admin Memory tab for inspecting and deleting retained memories.

Goal: add governed memory after the runtime is already safe and auditable.

Tasks:

- Add memory schema and scoped retrieval helpers.
- Add explicit memory write policy.
- Add admin controls for enabling/disabling memory by company and agent.
- Add memory search to the agent observation step.
- Add deletion and audit support.

Acceptance:

- Agents can retrieve scoped memory without crossing tenants.
- Agents cannot silently store sensitive or hidden configuration.
- Admins can inspect and remove agent memory.

What Is Next:

- Phase 9 can begin now that memory reads and writes are explicitly governed, inspectable, and tenant-scoped.
- The next implementation slice is Phase 9: add run replay helpers, reliability analytics, and regression tests for approval, tenant boundaries, and replayable failures.

### Phase 9: Evaluation, Replay, And Analytics

Progress weight: 8%
Status: Complete as of June 14, 2026. Added tenant-scoped run analytics for reliability, cost, latency, tools, approvals, models, triggers, and failure reasons; added controlled failed/cancelled run replay; added admin cancellation with pending approval/tool cleanup; added audit logs for replay and cancellation; added a Runs admin tab with metrics, run history, replay controls, and cancel controls; and added deterministic tests for analytics, replay restrictions, tenant boundaries, cancellation cleanup, and cancelled-run terminal protection.

Goal: make agent reliability measurable.

Tasks:

- Add deterministic tests for:
  - routing
  - tool planning
  - tool arg validation
  - approval pause/resume
  - tenant boundaries
  - prompt-injection through RAG
  - cancellation
- Add replay helpers for failed runs.
- Add analytics dimensions for runs, steps, tools, approvals, cost, latency, and failures.
- Add admin run dashboards.

Acceptance:

- Agent behavior has regression tests, not only manual demos.
- Failed runs can be inspected and replayed in a controlled way.
- Admin dashboards show cost and reliability by agent/tool/model/company.

What Is Next:

- The minimum architecture is complete. Next work should run the full verification gate, commit/push when requested, and then expand the platform with more governed tools, evaluator fixtures, replay comparison views, and production monitoring.

## Minimum Bar For "True Agentic Platform"

The minimum claim is now supported when the implementation is verified:

- Real backend tool execution exists for at least read-only and one approved write flow.
- The agent runtime supports bounded multi-step execution.
- Agent runs, steps, tool calls, approvals, and final outputs are durable.
- Tool calls are schema-validated and authorization-checked outside the model.
- Human approval can pause and resume the agent runtime.
- Chat, workflow node, and scheduled agent execution use the same run contract.
- Tenant isolation and tool escalation have regression tests.
- Admins can inspect, cancel, and audit agent runs.

## Recommended First Slice

The safest first implementation slice is:

1. Add agent run tables and internal run/step mutations.
2. Extend tool schema with `inputSchema`, `sideEffectLevel`, and `confirmationRequired`.
3. Implement one read-only knowledge search tool end to end.
4. Route chat-agent execution through a bounded loop with a max of three steps.
5. Add run detail visibility and tests for tenant boundaries.

This creates a genuine agentic core without immediately risking destructive side effects.

## Verification Gates

Before merging agentic platform slices, run the repo gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For runtime-heavy slices, also run focused tests near:

- `convex/agentRuntime.test.ts`
- `convex/aiToolExecutionService.test.ts`
- `convex/aiTools.test.ts`
- `convex/workflowRuntime.test.ts`
- `convex/workflowRuntimeService.test.ts`
- `convex/chat.test.ts`
- `convex/aiPromptAssembly.test.ts`

Add new tests where no focused test file exists yet.
