# Agent Runtime Operations Developer Guide

Agent runtime operations cover durable run execution, run detail evidence, approval decisions, feedback, eval fixtures, memory candidates, reflections, improvement suggestions, version snapshots, and release readiness. This guide splits those implementation details out of the broad Agents guide.

Read this with `docs/developer/agents.md`, `docs/developer/ai-tools-and-connectors.md`, `docs/developer/ai-rules-and-prompts.md`, and `docs/developer/knowledge-management.md` before changing agent runtime or review behavior.

## Route Map

Operational routes:

- `src/app/(dashboard)/admin/agents/[id]/runs/page.tsx` reads analytics, paginated runs, run detail, feedback, reflections, memory candidates, eval fixtures, smoke history, versions, and improvement suggestions. It also triggers replay, cancellation, feedback writes, reflection creation, memory candidate generation/review, eval creation, eval suite execution, and improvement suggestion review.
- `src/app/(dashboard)/admin/agents/[id]/evals/page.tsx` manages fixtures, smoke evals, suite presets, skill coverage, and release candidate comparison.
- `src/app/(dashboard)/admin/agents/[id]/memory/page.tsx` reviews active memories, quality signals, memory candidates, reflections, and improvement suggestions.
- `src/app/(dashboard)/admin/agents/approvals/page.tsx` reviews pending approvals across agents.
- `src/app/(dashboard)/admin/run-observatory/page.tsx` consumes cross-agent observability data.

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

Run statuses are `QUEUED`, `RUNNING`, `PENDING_APPROVAL`, `SUCCESS`, `FAILED`, and `CANCELLED`. Step kinds include observe, plan, model, tool call, tool result, approval request, replan, and final.

`buildRunTimeline` joins steps, tool calls, and approvals into a UI-safe timeline. `buildToolCallDetail` exposes raw arguments only to super admins; non-super-admin users receive redacted previews where available. Preserve that boundary when adding fields.

## Runtime Budgets

`convex/agentRuntimeService.ts` defines default runtime limits:

- max steps
- max tool calls
- max runtime
- max input tokens
- max output tokens
- max cost

It also centralizes stop checks and stop messages for tool-call, runtime, token, and cost budgets. Runtime changes should keep budget checks deterministic and testable.

## Tool Calls And Approvals

Tool execution policy is defined in `convex/aiToolExecutionService.ts`, while run-level evidence lives in `agentToolCalls` and `agentRunApprovals`.

When a tool needs confirmation, the run moves to `PENDING_APPROVAL`. `decideApproval` checks admin access to the run company, records reviewer metadata, updates the approval and tool-call rows, and moves the run according to the decision.

Approval decisions are not just UI actions. They are part of the durable run record and may become eval evidence, reflection context, or release readiness evidence.

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

## Versions And Releases

`convex/agentVersioningService.ts` and `convex/agentVersions.ts` create and read version snapshots. Snapshots hash prompt, tools, skills, memories, rules, model config, and policy state.

Release actions live in `convex/releases.ts`:

- `createReleaseCandidate`
- `approveReleaseCandidate`
- `activateReleaseCandidate`
- `rollbackRelease`

Release candidate comparison in `agentEvalFixtures.ts` checks fixture freshness and release-gate evidence. Activation logic in `convex/agents.ts` must stay aligned with release evidence, smoke eval status, and high-risk skill readiness.

## Authorization And Tenant Scope

Operational modules usually require `requireAdmin` and then enforce company access with `assertAdminCanAccessCompany`. Super admins can inspect broader platform records where the query supports it. Company admins must not see cross-tenant runs, tool calls, approvals, memories, evals, logs, or improvement artifacts.

Do not authorize by agent id alone. Agent records are global, but run and review artifacts often carry company scope. Use the record's company id for access checks.

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
