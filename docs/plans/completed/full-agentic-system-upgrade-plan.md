> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Full Agentic System Upgrade Plan

Last updated: 2026-07-08.

This plan upgrades Hakken from governed individual agents, workflows, and a legacy swarm path into a full agentic team system: a powerful boss agent plans work, delegates to specialist worker agents, asks QA agents to review results, arbitrates the findings, and repeats bounded repair rounds until the objective passes quality gates or cleanly fails.

Use this as the source of truth for the boss/worker/QA orchestration layer. It complements:

- `docs/plans/active/true-agentic-platform-plan.md` for the durable single-agent runtime.
- `docs/plans/active/agentic-app-foundation-build-plan.md` for the reusable platform/app framework.
- `docs/plans/active/model-provider-agnostic-plan.md` for provider-neutral model execution.
- `docs/plans/active/agent-learning-improvement-plan.md` for feedback, reflections, memory, and governed improvement.
- `docs/developer/agents.md` and `docs/developer/workflow-runtime-internals.md` for current runtime boundaries.

## Goal

Hakken should support governed agent teams where each team has:

- a boss agent for planning, delegation, arbitration, and final synthesis,
- one or more worker agents for specialist task execution,
- one or more QA agents for evidence checks, safety checks, brand checks, compliance checks, and output review,
- explicit model policy per role and per agent,
- bounded repair loops,
- human approval for risky tool use,
- durable traces for every plan, task, worker output, QA review, boss decision, repair request, and final answer.

The target product claim is:

> Hakken lets teams create governed AI agent teams that plan, delegate, review, repair, and deliver complex work with tenant-scoped context, model controls, approvals, budgets, and a full audit trail.

## Current Position

Hakken already has most of the platform foundations:

- `agents` records store configurable worker agents with model selection mode, model id, reasoning effort, tools, skills, knowledge, rules, schemas, activation state, and release gates.
- `agentRuns`, `agentRunSteps`, `agentToolCalls`, and `agentRunApprovals` already persist durable single-agent execution evidence.
- `convex/agentRuntime.ts` has a bounded objective loop with model calls, tool calls, budget checks, approval pause, telemetry, and final output.
- `convex/workflowRuntime.ts` can run graph nodes for agents, API calls, logic, database operations, approvals, iterators, merges, waits, and email.
- Agent eval fixtures, model grading, reflections, memory candidates, improvement suggestions, release snapshots, and run replay already exist.
- The current swarm path chains named micro-agents and shows orchestration logs, but it is fixed/demo-like and not a governed boss/worker/QA runtime.

The missing layer is a durable team orchestrator that treats planning, delegation, QA, repair, arbitration, and synthesis as first-class runtime objects rather than prompt convention or manually drawn workflow steps.

## Non-Drift Rules

- Do not touch the frozen movement demo.
- Keep all model choices configuration-driven through stored model records and defaults.
- Preserve tenant isolation across team runs, child agent runs, QA outputs, tool calls, memory, knowledge, and workflow data.
- Treat the boss agent plan as a proposal, not permission. Backend policy still controls tool execution, scope, cost, and approvals.
- Treat boss-created agents as proposals or inactive drafts until backend policy and human/release gates approve them.
- Do not silently apply boss or QA suggestions to prompts, rules, tools, memories, skills, or release state.
- Human approval remains mandatory for configured destructive, external, high-risk, or write actions.
- Admin tables and feeds default to 15 rows per page.
- Keep `messages/en.json` and `messages/it.json` in parity for new UI.
- Avoid native browser dialogs.

## Product Shape

Add an admin surface called Agent Teams.

An Agent Team contains:

- team name, description, company/global scope, active state,
- boss agent id,
- worker membership with role labels, capabilities, allowed task types, and optional model override policy,
- QA membership with review type, severity policy, pass threshold, and optional model override policy,
- model policy for boss, worker default, QA default, and final synthesis,
- self-expansion policy for whether the boss can only use existing agents, propose missing agents, create inactive draft agents, or request activation,
- loop policy for max rounds, max child runs, max runtime, max tokens, max cost, and stopping rules,
- approval policy for high-risk work,
- output contract for final answer shape,
- release/eval gate before activation.

Example team:

```text
Sales Proposal Team
- Boss: Strategy Director, strongest reasoning model, HIGH reasoning
- Workers: Research Agent, Document Review Agent, Proposal Writer, CRM Agent
- QA: Evidence QA, Safety QA, Brand QA
- Max repair rounds: 3
- Human approval: required for email send, CRM writes, external commitments
- Final output: proposal, risk notes, source list, next actions
```

## Runtime Shape

A team run should behave like this:

```text
create team run
boss observes objective, context, team roster, budgets, and policies
boss produces structured plan
backend validates plan
for each ready task:
  create child agent run for selected worker
  persist worker output
  create QA review tasks for configured reviewers
  persist QA verdicts and issues
boss reviews worker output and QA verdicts
if QA passed:
  mark task accepted
if QA failed and repair budget remains:
  create repair task with explicit issues and constraints
if QA failed and repair budget exhausted:
  fail or escalate to human review
when all required tasks accepted:
  boss synthesizes final answer
persist final output, trace, cost, and release/eval evidence
```

The runtime must be resumable. A team run should not depend on one long action call staying alive for the whole process. Use scheduled Convex actions/mutations for each stage, as the workflow runtime already does.

## Boss-Created Agents

The boss agent should eventually be able to identify missing capabilities, propose worker and QA agents, and assign tasks to those agents after policy gates pass. The safe design is:

```text
boss proposes
Hakken validates
admin or release gate approves
Hakken creates or activates
boss assigns tasks
```

Do not let the boss silently create active agents with tools and permissions. The model can recommend structure; Hakken owns authorization, creation, activation, and audit.

Recommended capability levels:

1. Level 1: boss can assign tasks only to existing active team members.
2. Level 2: boss can propose missing worker and QA agents for admin review.
3. Level 3: boss can create inactive draft agents after backend validation.
4. Level 4: boss-created draft agents can join the team only after admin review and smoke eval success.
5. Level 5: tightly scoped auto-activation is allowed only for low-risk internal agents with no write/external/destructive tools, passing eval evidence, and explicit team policy.

Start with Level 2 or Level 3. This gives Hakken the "agent creates agents" product story without allowing unreviewed privilege expansion.

Boss-created agent proposals must include:

- role: worker or QA,
- purpose and task types,
- system prompt draft,
- model policy,
- reasoning effort,
- requested tools and knowledge scopes,
- requested permissions and side-effect levels,
- QA/release evidence required before activation,
- duplication check against existing agents,
- tenant/company scope.

Validation must check:

- requester/team can create or propose agents,
- requested model is approved for the company and use case,
- requested tools are installed and permitted,
- requested side-effect level is allowed by team policy,
- prompt does not request hidden prompt disclosure, tenant bypass, or approval bypass,
- proposed agent does not duplicate an existing suitable agent,
- new agent starts inactive unless policy explicitly allows a stricter path,
- activation is blocked until smoke evals and release gates pass.

## Data Model

Recommended new tables:

### `agentTeams`

- `name`
- `description`
- `companyId`, optional
- `isActive`
- `bossAgentId`
- `defaultWorkerModelSelectionMode`
- `defaultWorkerModelId`, optional
- `defaultQaModelSelectionMode`
- `defaultQaModelId`, optional
- `bossModelSelectionMode`
- `bossModelId`, optional
- `finalModelSelectionMode`
- `finalModelId`, optional
- `maxRounds`
- `maxChildRuns`
- `maxRuntimeMs`
- `maxCostGBP`
- `selfExpansionLevel`: `NONE`, `PROPOSE_ONLY`, `CREATE_DRAFT`, `ACTIVATE_AFTER_GATES`, `LOW_RISK_AUTO_ACTIVATE`
- `qaPolicyJson`
- `approvalPolicyJson`
- `agentCreationPolicyJson`
- `outputContractJson`
- `createdBy`
- `createdAt`
- `updatedAt`

### `agentTeamMembers`

- `teamId`
- `agentId`
- `role`: `BOSS`, `WORKER`, `QA`
- `roleLabel`
- `capabilitiesJson`
- `allowedTaskTypes`
- `reviewTypes`, optional for QA
- `modelSelectionMode`
- `modelId`, optional
- `reasoningEffort`, optional
- `isRequired`
- `isActive`
- `createdAt`
- `updatedAt`

### `agentTeamRuns`

- `teamId`
- `objective`
- `status`: `QUEUED`, `PLANNING`, `RUNNING`, `QA_REVIEW`, `REPAIRING`, `PENDING_APPROVAL`, `SUCCESS`, `FAILED`, `CANCELLED`
- `companyId`
- `userId`, optional
- `triggerType`: `CHAT`, `MANUAL`, `SCHEDULE`, `WEBHOOK`, `WORKFLOW`, `EVENT`
- `threadId`, optional
- `workflowId`, optional
- `scheduleId`, optional
- `currentRound`
- `maxRounds`
- `inputTokens`, `outputTokens`, `costGBP`
- `startedAt`, `completedAt`, `cancelledAt`, `updatedAt`
- `finalOutput`, optional
- `error`, optional

### `agentTeamTasks`

- `teamRunId`
- `parentTaskId`, optional
- `round`
- `taskIndex`
- `taskType`
- `title`
- `instructions`
- `assignedAgentId`
- `status`: `PENDING`, `RUNNING`, `QA_PENDING`, `QA_FAILED`, `ACCEPTED`, `REPAIR_REQUESTED`, `FAILED`, `SKIPPED`, `CANCELLED`
- `dependsOnTaskIds`
- `agentRunId`, optional
- `inputJson`
- `outputJson`
- `acceptedAt`, optional
- `error`, optional
- `createdAt`
- `updatedAt`

### `agentTeamReviews`

- `teamRunId`
- `taskId`
- `qaAgentId`
- `reviewType`
- `status`: `PENDING`, `RUNNING`, `PASSED`, `FAILED`, `NEEDS_HUMAN`, `CANCELLED`
- `severity`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `score`, optional
- `issuesJson`
- `recommendedFixesJson`
- `agentRunId`, optional
- `createdAt`
- `updatedAt`

### `agentTeamDecisions`

- `teamRunId`
- `round`
- `decisionType`: `PLAN_CREATED`, `TASK_ASSIGNED`, `QA_REQUESTED`, `TASK_ACCEPTED`, `REPAIR_REQUESTED`, `ESCALATED`, `FINALIZED`, `FAILED`
- `bossAgentId`
- `inputJson`
- `outputJson`
- `rationale`
- `createdAt`

### `agentTeamAgentProposals`

- `teamRunId`
- `teamId`
- `proposedByBossAgentId`
- `role`: `WORKER`, `QA`
- `name`
- `purpose`
- `taskTypes`
- `systemPrompt`
- `modelSelectionMode`
- `modelId`, optional
- `reasoningEffort`, optional
- `requestedToolIds`
- `requestedKnowledgeScopeJson`
- `requestedPermissionsJson`
- `riskLevel`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `duplicationCheckJson`
- `validationStatus`: `PENDING`, `PASSED`, `FAILED`
- `reviewStatus`: `PENDING`, `APPROVED`, `REJECTED`, `AUTO_APPROVED`
- `createdAgentId`, optional
- `createdMemberId`, optional
- `status`: `PROPOSED`, `DRAFT_CREATED`, `READY_FOR_EVAL`, `ACTIVE_MEMBER`, `REJECTED`, `FAILED`
- `reviewedBy`, optional
- `reviewedAt`, optional
- `error`, optional
- `createdAt`
- `updatedAt`

## Structured Contracts

The boss and QA agents must return strict JSON. Free-form text can be included inside fields, but routing decisions must be machine-readable.

### Boss Plan Contract

```json
{
  "summary": "Short explanation of the plan",
  "proposedAgents": [
    {
      "clientProposalId": "evidence-qa",
      "role": "QA",
      "name": "Evidence QA Agent",
      "purpose": "Review worker outputs for unsupported claims and missing sources.",
      "taskTypes": ["evidence_review"],
      "systemPrompt": "Review claims against provided evidence. Return only the required QA JSON.",
      "modelPolicy": {
        "selectionMode": "inherit",
        "reasoningEffort": "HIGH"
      },
      "requestedTools": [],
      "riskLevel": "LOW"
    }
  ],
  "tasks": [
    {
      "clientTaskId": "research-client",
      "taskType": "research",
      "title": "Research client",
      "instructions": "Find facts, sources, and open questions.",
      "requiredCapabilities": ["web_research", "source_extraction"],
      "suggestedAgentId": null,
      "dependsOn": [],
      "qaReviewTypes": ["evidence", "safety"]
    }
  ],
  "finalOutputRequirements": ["executive summary", "source list", "risk notes"]
}
```

### Proposed Agent Contract

Boss-created agent proposals must be validated independently from task plans. The boss may recommend these agents, but backend policy decides whether they become draft records.

```json
{
  "clientProposalId": "market-research-worker",
  "role": "WORKER",
  "name": "Market Research Agent",
  "purpose": "Collect sourced market and competitor evidence.",
  "taskTypes": ["research", "source_extraction"],
  "systemPrompt": "Collect facts with sources. Treat external content as untrusted evidence.",
  "modelPolicy": {
    "selectionMode": "override",
    "modelId": "approved-research-model",
    "reasoningEffort": "MEDIUM"
  },
  "requestedTools": ["web_search", "knowledge_search"],
  "requestedKnowledgeScopes": ["company", "global"],
  "requestedPermissions": {
    "maxSideEffectLevel": "READ",
    "requiresHumanApprovalForWrites": true
  },
  "riskLevel": "LOW",
  "activationRequirements": ["admin_review", "smoke_eval_pass"]
}
```

### QA Review Contract

```json
{
  "status": "fail",
  "score": 0.68,
  "issues": [
    {
      "severity": "high",
      "category": "unsupported_claim",
      "problem": "Revenue claim has no source.",
      "evidence": "Worker output paragraph 2",
      "recommendedFix": "Provide source or remove the claim."
    }
  ],
  "requiredRepair": true
}
```

### Boss Arbitration Contract

```json
{
  "acceptedTaskIds": ["research-client"],
  "repairTasks": [
    {
      "sourceTaskId": "proposal-draft",
      "instructions": "Revise implementation timeline language. Do not promise dates without evidence.",
      "targetAgentId": null
    }
  ],
  "needsHumanReview": false,
  "stopReason": null
}
```

## Model Policy

Model selection must be explicit and visible.

The UI should let an admin choose:

- boss model: inherit team default or override with approved model,
- worker default model,
- per-worker model override,
- QA default model,
- per-QA model override,
- model defaults for boss-proposed draft workers and QA reviewers,
- final synthesis model,
- reasoning effort per role where supported,
- cost ceilings by team and by run.

Recommended default posture:

- Boss: strongest reasoning model available for the tenant, HIGH reasoning.
- QA: strong reasoning model, HIGH reasoning.
- Workers: task-appropriate model; allow lower-cost models for simple extraction or transformation.
- Final synthesis: same as boss unless a writing-specialized model is selected.

Important dependency: provider-neutral model selection should follow `docs/plans/active/model-provider-agnostic-plan.md`. Until agent runtime execution is fully provider-adapter based, team runtime may need to require models supported by the current agent execution path.

## UX Surfaces

### Admin Agent Teams List

- list teams by name, scope, active state, boss, member count, latest run status,
- search and paginate with 15 rows,
- create, duplicate, archive, activate/deactivate.

### Team Builder

Tabs or sections:

- Overview: name, description, scope, activation.
- Boss: select boss agent, model, reasoning, prompt contract preview.
- Workers: add agents, role labels, capabilities, allowed task types, model override.
- QA: add reviewers, review type, pass threshold, severity policy, model override.
- Self Expansion: choose whether boss can propose agents, create inactive drafts, or request activation after gates.
- Policies: max rounds, budgets, approvals, output contract.
- Evals: smoke team run, release gate, fixture coverage.

### Team Run Detail

Show the run as an execution graph/timeline:

- boss plan,
- task cards,
- worker outputs,
- QA review verdicts,
- boss repair decisions,
- approvals,
- final answer,
- costs/tokens/model usage,
- replay/failure evidence.

This should reuse the existing agent run detail and workflow execution patterns where possible.

## Implementation Phases

### Phase 1: Product Spec And Contracts

Status: planned.

Build:

- Finalize tables and validators.
- Define boss, QA, and arbitration JSON schemas.
- Define proposed-agent JSON schemas and validation policy.
- Define team policy defaults.
- Document model policy and provider constraints.
- Add tests for contract parsing and rejection of unsafe malformed plans.

Acceptance:

- A malformed boss plan cannot create tasks.
- A task cannot target an agent outside the team unless policy explicitly allows it.
- A boss-proposed agent cannot become active without the configured review/eval gates.
- A QA result cannot silently approve high-severity findings.
- Tenant-scoped team records cannot read or write cross-company agent data.

### Phase 2: Schema, Services, And Admin CRUD

Status: planned.

Build:

- Add `agentTeams`, `agentTeamMembers`, `agentTeamRuns`, `agentTeamTasks`, `agentTeamReviews`, `agentTeamDecisions`, and `agentTeamAgentProposals`.
- Add service helpers for team authorization, membership lookup, model policy resolution, budget checks, and safe JSON parsing.
- Add admin CRUD for teams, members, and boss-created agent proposals.
- Add basic team list and builder UI.

Acceptance:

- Super-admins can create global teams.
- Company admins can only access company-scoped teams if product policy allows company team ownership.
- All reads are paginated or bounded.
- Locale parity is preserved.

### Phase 3: Boss Planning Runtime

Status: planned.

Build:

- Create `convex/agentTeamRuntime.ts`.
- Add manual run entry point.
- Create team run row.
- Ask boss agent for structured plan.
- Validate plan.
- Create initial `agentTeamTasks`.
- Persist valid boss-created agent proposals without activating them.
- Persist `PLAN_CREATED` decision.

Acceptance:

- A boss can plan without executing worker tasks.
- Invalid plans fail closed with a readable error.
- Proposed agents are stored separately from active members.
- Plan model choice is recorded on the team run or decision.
- Tests cover plan success, schema failure, inactive boss, inactive team, budget denial, and tenant denial.

### Phase 4: Boss-Proposed Agent Drafting

Status: planned.

Build:

- Validate proposed worker and QA agents against team policy.
- Run duplication checks against existing agents and team members.
- Create inactive draft agents only when `selfExpansionLevel` allows draft creation.
- Attach requested tools only when allowed and keep high-risk tools disabled until review.
- Create proposed team member rows only after approval or successful gates.
- Add admin review actions: approve draft creation, reject proposal, request edits, run smoke eval, approve team membership.

Acceptance:

- Boss-created agents are never active by default.
- Draft creation is audited and linked to the team run and proposal.
- Admins can inspect prompt, tools, model, risk level, and eval requirements before approval.
- Low-risk auto-activation is blocked unless team policy explicitly enables it and smoke evals pass.
- Tests cover proposal validation, duplicate detection, tool denial, draft creation, approval, rejection, and tenant isolation.

### Phase 5: Worker Delegation Runtime

Status: planned.

Build:

- Schedule ready tasks as child `agentRuns`.
- Pass task instructions and scoped context into selected worker agents.
- Link worker `agentRunId` back to `agentTeamTasks`.
- Mark task output as ready for QA.
- Support dependency ordering.

Acceptance:

- Worker tasks are durable and replayable through existing run detail.
- Worker selection respects team membership and capability policy.
- Child runs inherit tenant scope and budget context.
- Failed child runs fail or repair according to policy.

### Phase 6: QA Review Runtime

Status: planned.

Build:

- Schedule QA reviews after worker output.
- Run QA agents with strict review contracts.
- Persist `agentTeamReviews`.
- Aggregate verdicts by severity, score, and required repair.
- Support multiple QA types per task.

Acceptance:

- QA review cannot be skipped for required review types.
- High/critical issue policy is enforced by backend logic.
- QA agent output is durable, inspectable, and linked to child run evidence.

### Phase 7: Boss Arbitration And Repair Loop

Status: planned.

Build:

- Ask boss to review worker output and QA verdicts.
- Validate arbitration output.
- Accept tasks, create repair tasks, escalate to human review, or fail.
- Enforce max rounds and max child runs.
- Persist every boss decision.

Acceptance:

- QA failures can create targeted repair tasks.
- Repair loops stop at configured limits.
- Boss cannot override hard backend safety/tenant/tool policies.
- Human escalation creates a pending approval/review state rather than disappearing.

### Phase 8: Final Synthesis

Status: planned.

Build:

- Once required tasks pass, ask boss/final synthesis model for final answer.
- Include accepted worker outputs, QA pass summaries, and source constraints.
- Persist final answer, evidence summary, tokens, cost, and model metadata.
- Save response back to chat/workflow caller where applicable.

Acceptance:

- Final answer only uses accepted task outputs unless clearly marked as unresolved.
- Final output includes source/risk notes when policy requires them.
- Team run completion updates all linked surfaces.

### Phase 9: UI Run Observatory

Status: planned.

Build:

- Add team run list.
- Add team run detail timeline/graph.
- Deep link to child agent runs.
- Show model/cost/approval/QA summaries.
- Add cancel and replay where safe.

Acceptance:

- A reviewer can understand what happened without reading raw JSON.
- Failed runs show where the failure occurred and what would be retried.
- Raw tool arguments remain protected by existing super-admin boundaries.

### Phase 10: Evals, Release Gates, And Templates

Status: planned.

Build:

- Add team eval fixtures.
- Add smoke team runs.
- Add release gate checks for boss plan validity, worker coverage, QA coverage, repair loop behavior, approval pause, and tenant boundary.
- Add starter team templates:
  - research and proposal team,
  - document review team,
  - support triage team,
  - reporting analyst team,
  - compliance review team.

Acceptance:

- A team cannot be activated without passing smoke evidence.
- Templates create draft teams by default.
- Eval fixtures can be reused as regression tests.

### Phase 11: Migration From Swarm

Status: planned.

Build:

- Keep the current swarm path stable while Agent Teams matures.
- Add a migration note from fixed demo swarm agents to configurable teams.
- Optionally reimplement swarm mode as a predefined Agent Team.
- Remove or quarantine demo-only lookup behavior only after replacement is proven.

Acceptance:

- Existing chat behavior does not break.
- New team runtime provides a clearer, safer replacement path.
- Docs stop presenting swarm as the future architecture.

## Test Plan

Focused tests:

- `convex/agentTeams.test.ts` for CRUD, auth, tenant scope, membership, model policy.
- `convex/agentTeamRuntimeService.test.ts` for schema parsing, plan validation, proposed-agent validation, QA aggregation, arbitration decisions, budget checks.
- `convex/agentTeamRuntime.test.ts` for planning, worker scheduling, QA scheduling, repair loops, finalization, cancellation.
- `convex/agentTeamAgentProposals.test.ts` for draft creation, approval gates, duplicate detection, tool/model denial, and activation blocking.
- UI tests under `src/app/(dashboard)/admin/agent-teams/**`.
- Regression coverage for no native dialogs, locale parity, admin pagination, and tenant isolation.

Verification before merging implementation:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For this documentation-only plan, `git diff --check` is sufficient.

## Rollout Strategy

Recommended rollout:

1. Build the schema and read-only admin surfaces behind a feature flag.
2. Enable manual planning-only runs for super-admins.
3. Enable boss proposals for missing worker/QA agents without draft creation.
4. Enable inactive draft creation after admin approval.
5. Enable worker delegation with no write/external tools.
6. Enable QA review and repair loops.
7. Enable final synthesis.
8. Add approvals for risky tools.
9. Add smoke evals and activation gates for boss-created agents and teams.
10. Expose to company admins only after tenant scope and run observability are proven.

## Open Questions

- Should company admins be allowed to create teams, or should team authoring remain super-admin-only at first?
- Should company admins be allowed to approve boss-created draft agents, or should that stay super-admin-only initially?
- Should team runs use workflow execution rows, separate team run rows, or both?
- Should QA agents be normal agents with strict prompt/schema contracts, or a distinct reviewer type in the data model?
- Should boss-created agents always be new agent records, or can they begin as team-local ephemeral role definitions?
- How should team budget be split across boss, workers, QA, and final synthesis?
- Should a failed QA review always trigger repair, or should low-severity findings be allowed into final synthesis as caveats?
- Should team templates live beside agent templates or app templates?

## Progress

Overall roadmap progress: 0%.

Current planning slice progress: 100%.

No implementation has started. The next concrete engineering slice is Phase 1: Product Spec And Contracts.
