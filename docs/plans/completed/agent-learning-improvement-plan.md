> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Agent Learning And Improvement Plan

This document defines how Hakken agents should improve over time after the true agentic runtime foundation is in place.

It is a follow-on plan to `docs/plans/active/true-agentic-platform-plan.md`. The goal is not to silently retrain model weights. The goal is to make agents improve operationally through governed memory, measured feedback, replayed failures, evaluation fixtures, and approved configuration updates.

## Target Claim

The stronger and safer product claim is:

> Hakken agents improve over time through approved retained context, measured feedback, replay, evaluation, and governed behavior updates.

Avoid saying:

> Agents train themselves.

That implies autonomous model-weight training. Hakken should instead support a controlled learning loop where every retained fact, instruction, prompt change, rule change, tool contract change, and evaluator fixture is inspectable, reversible, tenant-scoped, and auditable.

## What "Learning" Means Here

Agents can improve by changing the context and controls around the model:

- approved memories
- better retrieved context
- run feedback
- failure reflections
- evaluator fixtures
- prompt versions
- rules
- tool schemas
- routing policies
- model configuration
- approval policies

Agents should not improve by:

- silently storing sensitive or hidden information
- learning across tenants
- bypassing approval because a previous run was approved
- modifying their own system prompt without review
- changing tool permissions without admin action
- fine-tuning or retraining a provider model implicitly

## Learning Loop Architecture

The platform should close the loop after every meaningful agent run:

```text
agent run completes or fails
record outcome, steps, tools, approvals, cost, latency
collect explicit feedback when available
generate a structured reflection
propose candidate improvements
policy-check each candidate
require approval for high-impact changes
apply approved changes as versioned configuration
turn important failures into evaluator fixtures
measure whether future versions perform better
```

The core principle is: agents may propose improvements, but the platform decides what can be retained or changed.

## Improvement Inputs

### Run Outcomes

Use durable `agentRuns`, `agentRunSteps`, `agentToolCalls`, and `agentRunApprovals` as the base evidence.

Useful signals:

- run status: success, failed, cancelled, pending approval
- final output quality
- tool success or failure
- schema validation failures
- approval rejection reasons
- cancellation reasons
- latency
- cost
- token usage
- retry count
- model/provider used
- trigger type

### Human Feedback

Add feedback directly to runs.

Recommended fields:

- `runId`
- `agentId`
- `companyId`
- `userId`
- `rating`: `POSITIVE`, `NEGATIVE`, `NEUTRAL`
- `labels`: array of controlled labels
- `comment`, optional
- `createdAt`

Initial feedback labels:

- `GOOD_ANSWER`
- `INCORRECT`
- `MISSED_CONTEXT`
- `WRONG_TOOL`
- `BAD_TOOL_ARGS`
- `UNSAFE_SUGGESTION`
- `TOO_EXPENSIVE`
- `TOO_SLOW`
- `NEEDS_APPROVAL_POLICY_CHANGE`
- `SHOULD_BECOME_EVAL`

Feedback should be tenant-scoped and visible in the run detail page.

### Approval Decisions

Approval outcomes are learning signals.

Examples:

- many rejected calls for one tool may mean the agent is overusing it
- repeated rejected arguments may mean the tool schema or prompt is unclear
- repeated approvals for low-risk calls may justify a narrower auto-approval rule
- cancellation during pending approval may signal duplicate work or bad trigger routing

Approval learning must never weaken policy automatically. The system can propose policy changes, but an admin must approve them.

### Replay And Failure Reflection

After a failed or cancelled run, the platform should generate a structured reflection.

Recommended reflection fields:

- objective summary
- failure step
- failure category
- suspected root cause
- missing context
- wrong assumption
- tool/schema issue
- proposed memory
- proposed prompt/rule change
- proposed evaluator fixture
- confidence

Failure categories:

- `MISSING_CONTEXT`
- `BAD_TOOL_PLAN`
- `BAD_TOOL_ARGUMENTS`
- `TOOL_FAILURE`
- `PROVIDER_FAILURE`
- `POLICY_BLOCKED`
- `APPROVAL_REJECTED`
- `TENANT_SCOPE_BLOCKED`
- `PROMPT_INJECTION_BLOCKED`
- `USER_CANCELLED`
- `UNKNOWN`

## Improvement Outputs

### Candidate Memories

Agents should be allowed to propose memories after runs, but not write them directly in all cases.

Memory candidate fields:

- `agentId`
- `companyId`
- `sourceRunId`
- `kind`: `FACT`, `PREFERENCE`, `SUMMARY`, `INSTRUCTION`
- `content`
- `confidence`
- `riskLevel`: `LOW`, `MEDIUM`, `HIGH`
- `status`: `PROPOSED`, `APPROVED`, `REJECTED`, `APPLIED`
- `proposedBy`: `AGENT`, `USER`, `ADMIN`, `SYSTEM_REFLECTION`
- `reviewedBy`, optional
- `reviewedAt`, optional
- `createdAt`

Suggested policy:

- `FACT`: auto-approve only when low-risk and backed by trusted tenant data.
- `PREFERENCE`: require user/admin approval unless explicitly stated by the user.
- `SUMMARY`: allow low-risk auto-write with source run and expiry.
- `INSTRUCTION`: require admin approval.

Never store:

- hidden prompts
- credentials
- secrets
- API keys
- raw sensitive personal data
- instructions to bypass policy
- cross-tenant facts
- untrusted RAG instructions as memory

### Prompt Improvement Suggestions

The system can suggest prompt changes, but changes must be versioned and reviewed.

Example suggestion:

> Add: "When summarizing pipeline risk, include owner, revenue impact, blocker, and next action."

Required controls:

- show source runs
- show expected benefit
- show risk classification
- require admin approval
- create a new prompt version
- preserve rollback to prior version

### Tool Contract Suggestions

Repeated tool failures should create suggestions.

Examples:

- tighten a JSON schema enum
- add a required field
- clarify a tool description
- add a safer default limit
- split a broad tool into two narrower tools
- require approval for a tool that causes repeated rejections

Tool suggestions must never change runtime handler mappings automatically.

### Evaluation Fixtures

Important runs should become evals.

Fixture fields:

- objective
- agentId
- company scope or synthetic tenant fixture
- expected tool plan
- expected blocked actions
- expected final output rubric
- expected memory usage
- source run
- tags

Useful eval types:

- happy path
- approval pause/resume
- rejected action
- prompt injection through RAG
- tenant boundary attempt
- bad tool args
- cancellation
- replayed failure
- cost/latency budget stop

### Routing And Trigger Improvements

If repeated failures come from the wrong trigger or route, the platform should suggest changes:

- change scheduled objective text
- route a workflow node to a different agent
- add a prerequisite knowledge search
- add a human approval node before a risky agent node
- disable a trigger until configuration is fixed

These suggestions should be reviewed like other configuration changes.

## Agent Versioning

Learning is not measurable unless versions are explicit.

Each run should be attributable to:

- agent prompt version
- tool set version
- memory snapshot or memory revision
- rule set version
- model configuration version
- approval policy version
- runtime version

This allows the platform to answer:

- did version N outperform version N-1?
- did failures decrease?
- did cost increase?
- did approval rejections decrease?
- did tool schema errors decrease?
- did latency improve?

## Memory Quality And Decay

Memory should be actively maintained.

Add signals:

- usage count
- successful usage count
- failed usage count
- last used at
- source confidence
- contradiction count
- expiry date
- stale flag

Recommended behavior:

- downrank memories associated with failed runs
- up-rank memories repeatedly used in successful runs
- detect duplicate memories
- detect contradictory memories
- require review for stale high-impact instructions
- expire low-confidence summaries
- allow admins to delete or merge memory

## Feedback-Driven Retrieval

The memory retriever should learn which context helps.

Retrieval scoring can consider:

- semantic similarity
- recency
- importance
- approval status
- source trust
- successful prior use
- tenant scope
- user scope if user memory is later enabled

Bad feedback should not delete memory automatically. It should lower confidence or create a review task.

## Safety Rules

The learning loop must preserve the same safety model as the runtime.

Hard rules:

- tenant isolation is mandatory
- hidden prompts are never stored as memory
- tool approval cannot be bypassed by memory
- agent-proposed prompt changes require review
- destructive/external policy changes require review
- rejected memories and rejected prompt changes remain auditable
- learning suggestions must cite source runs
- every applied change must be reversible

## Admin UI Requirements

Add learning surfaces to the existing agent admin workspace:

- Run feedback controls on run detail.
- Candidate memory review queue.
- Failure reflection view.
- Suggested prompt/rule/tool improvements.
- Eval fixture creation from a run.
- Agent version history.
- Memory quality dashboard.
- Comparison view for version performance.

Avoid hiding learning in logs only. The operator should be able to see what changed and why.

## Data Model Candidates

Recommended new tables:

- `agentRunFeedback`
- `agentRunReflections`
- `agentMemoryCandidates`
- `agentImprovementSuggestions`
- `agentEvalFixtures`
- `agentVersions`
- `agentMemoryUsage`

These can be added incrementally. Do not block the first learning slice on the full schema.

## Implementation Phases

### Progress Tracker

Current overall completion: **100%**

Progress is weighted by production value, not by number of files changed.

| Phase | Weight | Status | Contribution Complete |
| --- | ---: | --- | ---: |
| Phase 1: Run Feedback | 14% | Complete | 14% |
| Phase 2: Failure Reflection | 14% | Complete | 14% |
| Phase 3: Candidate Memory Automation | 16% | Complete | 16% |
| Phase 4: Eval Fixtures From Runs | 14% | Complete | 14% |
| Phase 5: Agent Versioning | 14% | Complete | 14% |
| Phase 6: Suggested Config Changes | 14% | Complete | 14% |
| Phase 7: Memory Quality Loop | 14% | Complete | 14% |

### Phase 1: Run Feedback

Progress weight: 14%
Status: Complete as of June 14, 2026. Added tenant-scoped `agentRunFeedback`, admin upsert/read APIs, audit logs for feedback create/update, feedback summary dimensions in run analytics, Runs dashboard feedback controls, and regression tests for tenant boundaries, audit records, upsert behavior, and analytics aggregation.

Goal: collect explicit human quality signals.

Tasks:

- Add `agentRunFeedback`.
- Add feedback controls on run detail or Runs dashboard.
- Add labels for correctness, context, tool use, safety, speed, and cost.
- Add tenant-scoped feedback queries.
- Add tests for tenant boundaries.

Acceptance:

- Admins can rate and label runs.
- Feedback is tenant-scoped and auditable.
- Analytics can show positive/negative feedback by agent.

What Is Next:

- Phase 2 is next: generate structured failure reflections for failed/cancelled runs so feedback and run traces can become candidate memories or eval fixtures.

### Phase 2: Failure Reflection

Progress weight: 14%
Status: Complete as of June 14, 2026. Added tenant-scoped `agentRunReflections`, deterministic category classification for failed/cancelled runs, bounded evidence capture from steps/tools/approvals/feedback, proposed next artifacts for memory/prompt/tool/eval work, audit logs for reflection create/update, Runs dashboard reflection generation and category badges, and regression tests for tenant boundaries, category output, evidence links, upsert behavior, and audit records.

Goal: turn failures into structured learning signals.

Tasks:

- Add `agentRunReflections`.
- Generate reflection candidates for failed/cancelled runs.
- Classify failure category.
- Link reflection to source steps/tool calls.
- Show reflection in the Runs UI.

Acceptance:

- Failed runs have inspectable reflection records.
- Reflection does not apply changes automatically.
- Reflection includes source evidence.

What Is Next:

- Phase 3 is next: candidate memory automation, using feedback and reflections to propose retained memory without silently applying high-impact changes.

### Phase 3: Candidate Memory Automation

Progress weight: 16%
Status: Complete as of June 14, 2026. Added tenant-scoped `agentMemoryCandidates`, safe candidate generation from positive feedback and failure reflections, existing memory safety-policy validation, duplicate suppression per run, optional low-risk summary/fact auto-apply, approval/rejection APIs for high-impact or medium-risk candidates, applied-memory source links, audit logs for candidate creation/application/rejection, Runs dashboard candidate generation and review controls, and regression tests for tenant boundaries, low-risk auto-apply, approval-gated memory application, rejection, dedupe, and audit records.

Goal: let agents propose retained context safely.

Tasks:

- Add `agentMemoryCandidates`.
- Generate memory candidates after successful and failed runs.
- Reuse existing memory safety policy.
- Auto-apply only low-risk summary/fact candidates when policy allows.
- Require approval for instructions and preferences.

Acceptance:

- Agents can propose memory without silently storing unsafe data.
- Admins can approve/reject candidate memories.
- Applied memories cite source run and review state.

What Is Next:

- Phase 4 is next: convert important runs, feedback, and reflections into evaluator fixtures so improvements become regression-testable.

### Phase 4: Eval Fixtures From Runs

Progress weight: 14%
Status: Complete as of June 14, 2026. Added tenant-scoped `agentEvalFixtures`, conversion from run traces into active evaluator fixtures, inferred fixture types for happy path, approval pause, rejected action, prompt injection, tenant boundary, bad tool args, cancellation, replayed failure, and tool plan cases, source evidence capture from steps/tools/approvals/feedback/reflections/memory candidates, repeat-update behavior per run/type, Runs dashboard fixture creation and badges, and regression tests for tenant boundaries, fixture inference, tool-plan evidence, memory-usage evidence, update behavior, and audit records.

Goal: make improvement regression-testable.

Tasks:

- Add `agentEvalFixtures`.
- Convert selected runs into fixtures.
- Add fixture types for tool plan, approval, tenant boundary, prompt injection, and replayed failure.
- Add a local eval runner or deterministic test harness.

Acceptance:

- Important failures become repeatable tests.
- Prompt/tool/rule changes can be checked before rollout.

What Is Next:

- Phase 5 is next: agent versioning, so every run and fixture can be compared against the prompt, tools, memory, rules, model config, and policy version that produced it.

### Phase 5: Agent Versioning

Progress weight: 14%
Status: Complete as of June 14, 2026. Added tenant/company-scoped `agentVersions`, deterministic snapshots for prompt, tools, memory revision, rules, model config, and policy, version reuse by snapshot hash, new version numbers when config changes, run stamping through the durable run creation path, replay version preservation, eval-fixture version stamping, version detail analytics for runs/fixtures/success/cost, Runs dashboard latest-version visibility, and regression tests for snapshot reuse, version increments, tenant boundaries, run stamping, fixture stamping, and version detail stats.

Goal: make improvement measurable.

Tasks:

- Add `agentVersions`.
- Capture prompt, tools, memory revision, rules, model config, and approval policy.
- Stamp each run with version IDs.
- Add comparison analytics by version.

Acceptance:

- Operators can compare agent versions.
- Rollback is possible.
- Improvement claims are backed by metrics.

What Is Next:

- Phase 6 is next: suggested config changes, so reflections and eval failures can propose prompt, rule, tool-schema, routing, or approval-policy changes while still requiring review.

### Phase 6: Suggested Config Changes

Progress weight: 14%
Status: Complete as of June 14, 2026. Added tenant-scoped `agentImprovementSuggestions`, suggestion generation from reflections and eval fixtures, prompt/rule/tool-schema/routing/approval-policy proposal types, duplicate suppression per run, review APIs for approval/rejection, explicit apply behavior for approved prompt notes, approval-policy changes, and rule-backed schema/routing/safety notes, version snapshots after applied suggestions, Runs dashboard generation/review controls, and regression tests for tenant boundaries, suggestion generation, dedupe, prompt application, rejection, version stamping, and audit records.

Goal: let the platform propose changes while keeping humans in control.

Tasks:

- Add `agentImprovementSuggestions`.
- Suggest prompt, rule, tool schema, routing, and approval policy changes.
- Require review and versioned application.
- Add audit logs for accepted/rejected suggestions.

Acceptance:

- Suggestions are inspectable, source-linked, and reversible.
- The system never self-modifies high-impact behavior without approval.

What Is Next:

- The learning loop plan is complete. The next sensible work is production-hardening: run the full local gate, review the complete diff, then decide whether to batch these changes into a commit/PR.

### Phase 7: Memory Quality Loop

Progress weight: 14%
Status: Complete as of June 14, 2026. Added tenant-scoped `agentMemoryUsage`, runtime memory retrieval tracking, terminal outcome updates from successful/failed/cancelled runs, quality scoring from usage/outcomes/staleness, review flags for unused/stale/negative-outcome/instruction memories, Memory dashboard quality metrics, and regression tests for outcome propagation and tenant boundaries.

Goal: keep retained context useful over time.

Tasks:

- Track memory retrieval and usage.
- Score memories by successful/failed usage.
- Downrank stale or harmful memory.
- Add duplicate and contradiction review.
- Add memory expiry for low-confidence summaries.

Acceptance:

- Agents retrieve better context over time.
- Bad or stale memory is surfaced for review.
- Memory quality is measurable.

What Is Next:

- Run the full verification gate before merge/push: `npm run verify:env`, `npm run lint:all`, `npm run check`, `npm run build`, and `git diff --check`.
- Consider a production eval runner that replays `agentEvalFixtures` against candidate agent versions before applied suggestions go live.
- Add richer duplicate/contradiction detection for memories beyond the first quality-score pass.
- Add expiry policies for low-confidence summaries once operators have reviewed the initial quality signals.

## First Slice Recommendation

The safest first slice is:

1. Add `agentRunFeedback`.
2. Add feedback controls on the Runs page.
3. Add `agentRunReflections` for failed/cancelled runs.
4. Let admins convert a reflection into either a memory candidate or an eval fixture.
5. Keep all applied learning human-approved at first.

This gives Hakken a real learning loop without introducing unsafe self-modification.

## Verification Gates

Before merging learning-loop work, run:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Add focused tests for:

- tenant-scoped feedback reads/writes
- unsafe memory candidate rejection
- instruction memory approval
- reflection creation from failed runs
- eval fixture creation from runs
- version comparison analytics
- no cross-tenant learning leakage
