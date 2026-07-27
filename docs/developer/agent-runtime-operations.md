# Agent Runtime Operations Developer Guide

Agent runtime operations cover durable run execution, run detail evidence, approval decisions, feedback, eval fixtures, memory candidates, reflections, improvement suggestions, version snapshots, and release readiness. This guide splits those implementation details out of the broad Agents guide.

Read this with `docs/developer/agents.md`, `docs/developer/ai-tools-and-connectors.md`, `docs/developer/ai-rules-and-prompts.md`, and `docs/developer/knowledge-management.md` before changing agent runtime or review behavior.

## Route Map

Operational routes:

- `src/app/(dashboard)/admin/agents/[id]/runs/page.tsx` reads analytics, paginated runs, run detail, feedback, reflections, memory candidates, eval fixtures, smoke history, versions, and improvement suggestions. It also triggers replay, cancellation, feedback writes, reflection creation, memory candidate generation/review, eval creation, eval suite execution, and improvement suggestion review.
- `src/app/(dashboard)/admin/agents/[id]/evals/page.tsx` manages checks, smoke evals, suite presets, and skill coverage.
- `src/app/(dashboard)/admin/agents/[id]/memory/page.tsx` reviews active memories, quality signals, memory candidates, reflections, and improvement suggestions.
- `src/app/(dashboard)/admin/agents/approvals/page.tsx` reviews pending approvals across agents.
- `src/app/(dashboard)/admin/health/page.tsx` consumes cross-agent observability data.

Shared operational UI should keep using admin pagination, in-app modals, inline save/error feedback, and redacted previews rather than native browser dialogs.

## Run Records And Timeline

`convex/agentRuns.ts` owns durable run state. Important public and internal surfaces include:

- `getForAgent` for paginated run listing.
- `getRunDetail` for steps, tool calls, approvals, eval fixtures, replay runs, and timeline evidence.
- `getAnalyticsForAgent` for agent-level run metrics and next-action signals.
- `getRunObservatory` for cross-agent observability.
- `decideApproval` for approval decisions.
- `replayRun` and `cancelRun` for run operations.
- internal creation and update helpers used by chat, schedules, workflows, webhooks, and events.

Internal run creation through `createRunInternal` attaches an agent version snapshot before inserting the queued run. Public trigger creation through `createPublicAgentRunInternal` does the same after trimming and validating the objective. The public target agent must exist, be active, and have `agent.companyId` equal to the supplied public trigger company id. A company id mismatch is intentionally reported as the same "not found or inactive" failure as inactive or missing agents so public callers cannot distinguish cross-tenant records.

Run statuses are `QUEUED`, `RUNNING`, `PENDING_APPROVAL`, `SUCCESS`, `FAILED`, and `CANCELLED`. Step kinds include observe, plan, model, tool call, tool result, approval request, replan, and final.

`buildRunTimeline` joins steps, tool calls, and approvals into a UI-safe timeline. `buildToolCallDetail` exposes raw arguments only to super admins; non-super-admin users receive redacted previews where available. Preserve that boundary when adding fields.

`updateRunStatusInternal` treats cancellation as terminal precedence. Once a run is `CANCELLED`, later attempts to write another status are ignored unless they also write `CANCELLED`. Terminal status updates patch related `agentMemoryUsage` rows with the final outcome, so memory-quality and learning views can tell whether retrieved memories appeared in successful, failed, or cancelled executions.

## Runtime Budgets

`convex/agentRuntimeService.ts` defines default runtime limits:

- max steps
- max tool calls
- max runtime
- max input tokens
- max output tokens
- max cost

It also centralizes stop checks and stop messages for tool-call, runtime, token, and cost budgets. Runtime changes should keep budget checks deterministic and testable.

`runAgentObjective` can receive chat attachment `fileIds` from `api.chat.sendMessage`. The chat mutation validates stored upload metadata before scheduling the agent runtime. The runtime then parses supported document blobs through `convex/utils/fileParser.ts`, appends extracted text as untrusted context for the current prompt, caps each parsed document to 50,000 characters, and caps the final prompt plus attachment context to 10,000 characters before provider execution. Do not treat attached document text as system instructions or bypass chat upload validation when adding new agent entry points.

## Model Resolution Caveat

Agent runtime paths resolve model configuration from stored `aiModels` and `aiModelDefaults`, but the active execution calls still require Google Vertex-compatible models before provider execution. `runAgentObjective`, `runTriggeredAgentObjective`, and `executeAgentNode` call `getGoogleVertexProviderModelId` after model resolution and then use Vertex generation helpers. This means provider-neutral catalog entries can be configured and recorded, but these runtime paths will fail if the resolved agent or workflow model is not backed by Google Vertex until provider-adapter execution is extended for agent runtime.

Keep this distinction visible when changing model defaults, replay behavior, workflow agent nodes, or provider support. Do not document agent runtime as fully provider-agnostic until these paths use the shared provider registry or equivalent adapter layer.

## Tool Calls And Approvals

Tool execution policy is defined in `convex/aiToolExecutionService.ts`, while run-level evidence lives in `agentToolCalls` and `agentRunApprovals`.

When a tool needs confirmation, the run moves to `PENDING_APPROVAL`. `decideApproval` checks admin access to the run company, records reviewer metadata, updates the approval and tool-call rows, and moves the run according to the decision.

Approving an approval moves the linked tool call back to `PENDING`, records `confirmationGrantedAt`, returns the run to `RUNNING`, and schedules `internal.agentRuntime.resumeApprovedToolCall`. Rejecting an approval marks the tool call `DENIED`, inserts a failed final step, marks the run `FAILED`, and records the final output and error. Cancelling an approval marks the tool call `CANCELLED`, inserts a skipped final step, marks the run `CANCELLED`, and sets `cancelledAt`. Rejection and cancellation also update memory-usage outcomes for the run.

Approval decisions are not just UI actions. They are part of the durable run record and may become eval evidence, reflection context, or release readiness evidence.

Replay and cancellation are also audited run operations. Failed or cancelled runs can be replayed in `CURRENT_ACTIVE` mode, which creates or uses a current version snapshot, or `SAME_VERSION` mode when the source run already has a version snapshot. Cancellation is available only for queued, running, or pending-approval runs; it cancels pending approvals, cancels pending or approval-required tool calls, appends a skipped final step, marks the run `CANCELLED`, sets `cancelledAt`, updates memory usage, and records a `CANCEL_AGENT_RUN` audit log. Replay records `REPLAY_AGENT_RUN` with source run id, source status, and replay mode.

## Feedback And Learning Artifacts

Feedback, reflections, memory candidates, and improvement suggestions are intentionally separate records:

- `convex/agentRunFeedback.ts` stores user-authored feedback labels and comments.
- `convex/agentRunReflections.ts` stores generated root-cause and evaluation context.
- `convex/agentMemoryCandidates.ts` proposes memories from run evidence.
- `convex/agentMemories.ts` stores active memories and memory quality/usage signals.
- `convex/agentImprovementSuggestions.ts` proposes reviewed improvements.

Generated artifacts should stay reviewable. Do not silently apply prompt, rule, memory, tool-schema, routing, approval-policy, or skill changes from generated suggestions.

The memory review inbox combines memory candidates, improvement suggestions, and reflections. It supports open, reviewed, high-risk, and all modes, plus reviewer filtering. Keep review decisions company-scoped.

## Evals

`convex/agentEvalFixtures.ts` owns eval fixtures, smoke evals, eval suites, release gate comparisons, and suite presets.

Fixtures can be created from runs or manually. Implemented fixture types include happy path, tool plan, approval pause, rejected action, prompt injection, tenant boundary, bad tool arguments, cancellation, replayed failure, and cost/latency budget.

Run-derived fixtures collect run status, error, final output, tool plan, blocked actions, approval evidence, memory usage, feedback, reflection, and version snapshot context. This makes production failures reusable as regression tests.

Smoke evals can be contract-based or model-graded. Model grading is queued through `convex/agentEvalGradingActions.ts` when required. Suite presets group fixtures by release gate, skill coverage, or other operational tags.

## Version Snapshots

`convex/agentVersioningService.ts` and `convex/agentVersions.ts` create and read version snapshots. Snapshots hash prompt, tools, skills, memories, rules, model config, and policy state, so a check result can be tied to the exact agent that produced it.

Activation logic in `convex/agents.ts` must stay aligned with must-pass check evidence, smoke eval status, and high-risk skill readiness.

## Authorization And Tenant Scope

Operational modules usually require `requireAdmin` and then enforce company access with `assertAdminCanAccessCompany`. Super admins can inspect broader platform records where the query supports it. Company admins must not see cross-tenant runs, tool calls, approvals, memories, evals, logs, or improvement artifacts.

Do not authorize by agent id alone. Agent records may be global or company-scoped, and run and review artifacts often carry company scope. Use the record's company id for access checks, and preserve company-id equality checks for public trigger paths.

Raw tool arguments are sensitive. Keep raw argument access super-admin-only unless there is a deliberate product and security change.

## Observability

Agent-level analytics and run observatory combine recent run status, tool calls, approval counts, failure reasons, model/provider data, token usage, cost, runtime, and next-action labels.

Use observability for operations, not billing. Cost values depend on recorded tokens and model pricing configuration.

## Tests And Verification

Focused tests include:

- `convex/agentRuns.test.ts`
- `convex/agentRuntimeService.test.ts`
- `convex/agentRunFeedback.test.ts`
- `convex/agentRunReflections.test.ts`
- `convex/agentMemoryCandidates.test.ts`
- `convex/agentMemories.test.ts`
- `convex/agentImprovementSuggestions.test.ts`
- `convex/agentEvalFixtures.test.ts`
- `convex/agentVersions.test.ts`
- release tests where release behavior is changed
- UI tests under `src/app/(dashboard)/admin/agents/[id]/runs`, `evals`, `memory`, and `settings`

When changing visible strings, keep `messages/en.json` and `messages/it.json` in parity. Documentation-only changes should run `git diff --check`; runtime changes should run the full verification gate in `AGENTS.md`.
