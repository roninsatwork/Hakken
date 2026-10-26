---
product: Hakken
documentation_type: End-user guide
feature_area: Agent operations learning and evaluation
audience: authorized administrators and operators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/agent-operations-and-review.md
last_reviewed: '2026-10-26T14:20:25+00:00'
reviewed_against: current implementation
status: Current
---
# Agent Operations And Review

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Agent operations learning and evaluation
> **Reviewed:** 26 October 2026, 14:20:25 GMT (Europe/London)
> **Source path:** `docs/end-user/agent-operations-and-review.md` · **Status:** Current

Agent operations is the day-to-day review layer for Hakken agents after they have been created. It covers run history, approval decisions, feedback, evals, memory review, improvement suggestions, and release readiness evidence.

This guide is for operators, support teams, customer-success teams, and admins who need to understand what an agent did, whether it is safe to activate, and how to turn run evidence into better governance.

## Where To Find It

Agent review surfaces live under an agent detail page:

- `/admin/agents/[id]/runs`: run list, run detail, feedback, replay, cancellation, memory candidate generation, reflections, eval creation, and improvement suggestions.
- `/admin/agents/[id]/evals`: eval fixtures, smoke eval history, suite presets, skill coverage, and release gate comparison.
- `/admin/agents/[id]/memory`: active memories, memory quality, memory candidates, reflections, and improvement suggestions.
- `/admin/agents/[id]/settings`: the draft/live switch and advisory readiness warnings.
- `/admin/governance/approvals`: pending approval queue for tool calls that need human review.
- `/admin/health`: cross-agent run health, failure, cost, model, and tool evidence.

## Run Statuses

Agent runs move through these implemented statuses:

- `QUEUED`: the run has been created but has not started.
- `RUNNING`: the runtime is actively processing the objective.
- `PENDING_APPROVAL`: a tool call or action is waiting for human review.
- `SUCCESS`: the run completed with a final output.
- `FAILED`: the run stopped with an error.
- `CANCELLED`: an operator or policy cancelled the run.

Runs that are queued, running, or pending approval can be cancelled. Failed or cancelled runs can be replayed.

## Run Detail

The run detail view shows a timeline of steps such as observation, planning, model calls, tool calls, tool results, approval requests, replanning, and final output. It also summarizes model, provider, token, cost, latency, tool, approval, replay, and eval fixture evidence.

Tool-call arguments are sensitive. Super admins can inspect raw arguments where available. Other company-scoped admins see redacted previews when the backend restricts raw details.

Use run detail when investigating:

- unexpected answer quality
- tool failures or wrong tool choice
- approval pauses or rejected actions
- high cost or high token usage
- failed, cancelled, or replayed runs
- whether a run should become an eval fixture

## Feedback, Reflections, And Improvement Suggestions

Operators can label runs with feedback such as good answer, incorrect, missed context, wrong tool, bad arguments, unsafe, too expensive, too slow, approval policy issue, or should become eval.

Run evidence can generate reflections, memory candidates, eval fixtures, and improvement suggestions. Failed and cancelled runs are reflected automatically when the platform switch is on. Prompt, tool, routing, approval-policy, skill, and eval changes remain review decisions. Memory is different: when Autonomous memory is on, candidates that pass the content safety checks are saved immediately, labelled as saved by the AI, audited, and remain removable; when it is off, candidates normally wait for an operator; a separately requested low-risk auto-apply option can still apply eligible fact/summary candidates.

Improvement suggestions may propose prompt, tool, eval, memory, routing, approval policy, or skill changes. Review the source run and risk level before applying anything, especially high-risk suggestions.

## Memory Review

Agent memory is controlled learning. The memory page shows active retained memories and a review inbox for proposed memories, reflections, and improvement suggestions.

Memory candidates can be approved or rejected when Autonomous memory is off. When it is on, candidates passing content validation become active memories immediately, without an additional low-risk-only filter and are marked so reviewers can distinguish them from human-approved memory. Rejected fingerprints are retained to stop the same suggestion being proposed repeatedly. Active memories can still be removed and quality-reviewed.

The memory quality view can flag low-quality, unused, stale, risky, or questionable memories. Review memory quality after major prompt, skill, knowledge, or customer policy changes.

## Evals And Smoke Tests

Eval fixtures are repeatable checks for agent behavior. They can be created manually or from real run evidence.

Implemented fixture types include:

- happy path
- tool plan
- approval pause
- rejected action
- prompt injection
- tenant boundary
- bad tool arguments
- cancellation
- replayed failure
- cost or latency budget

Smoke evals and eval suites produce readiness evidence. Some suites can require model grading. Skill-related fixtures help show whether a bound skill has enough coverage.

Each fixture detail also offers **Rehearse**. A rehearsal runs the real agent loop against the configured model and performs real read-only tools, but records write, external, or destructive tool calls as `REHEARSED` instead of carrying them out. Hakken grades whether the run completed and called every tool handler required by the fixture. Rehearsal runs and drill results are labelled in run history so they are not mistaken for customer traffic.

Use rehearsal when a configuration-only smoke check is not enough and you need evidence of the tool plan the agent would actually choose. It is not a production side-effect test: a recorded write proves the agent selected the action, not that the external system accepted it.

Use evals before activating an agent, after changing prompts or tools, after adding high-risk skills, and after a production incident.

## Approvals

The approvals queue shows tool calls waiting for a human decision. Each approval includes the agent, objective, tool name, side-effect level, and preview data. An admin can approve, reject, or cancel.

Approving allows the run to continue with the reviewed action. Rejecting or cancelling records the decision and prevents that action from proceeding as originally requested.

Use approvals for write, external, destructive, or otherwise sensitive actions. Approval review does not replace tool permissions, tenant checks, or release readiness.

## Replay

Replay is available for failed or cancelled runs. A replay can use the current active agent configuration or the same version snapshot when available.

Use same-version replay to request the saved configuration evidence, while checking which runtime components actually honor it. A version label does not freeze external data, provider behavior, or every current skill/memory read. Use current-active replay when you want to test whether the latest agent configuration fixes an old failure.

## Release Readiness

The settings and eval pages show readiness evidence before activation or release. Readiness reports missing or failing smoke evidence, unconfigured release gates, stale/failing must-pass fixtures, and high-risk skill gaps. These are advisory findings in the current activation path. They do not universally block switching an agent active.

Before activating or releasing an agent, review:

- latest smoke eval result
- release gate comparison
- high-risk skill coverage
- recent failed and cancelled runs
- pending approvals
- memory review inbox
- cost and latency trend

## Practical Review Flow

For a production issue:

1. Open the affected agent's run history.
2. Filter to failed, cancelled, pending approval, or high-cost runs.
3. Open the run detail and inspect timeline, tool calls, approvals, and error previews.
4. Add feedback labels.
5. Create an eval fixture if the behavior should be regression-tested.
6. Generate memory candidates or improvement suggestions only when the evidence is clear.
7. Review suggestions from the memory page before applying them.
8. Run smoke evals or suites before reactivating or releasing changed behavior.

## Review What Learning Will Actually Change

A reflection is a deterministic interpretation of failed or cancelled run evidence. It does not call a model to discover an independently verified root cause. The categories use recorded errors, tool results, approval decisions, and feedback. Review the underlying timeline before accepting that interpretation. Automatic reflection failure is kept separate from the already finished run; turning reflection off does not also turn off the memory-candidate pass.

Candidates are generated from bounded run evidence and normalized for duplicate checks. A rehearsal run produces no candidates, including when a person asks, because its simulated effects are not real experience. The automatic pass stops proposing when ten candidates are already waiting for that agent; a human-requested pass can still run. This is backlog control, not a statement that the oldest suggestions have been reviewed or that all historic evidence was searched.

When Autonomous memory is on, content validation, duplicate checks, and rejected-wording checks still apply, but risk classification by itself is not an extra low-risk-only admission rule. The narrower low-risk fact/summary rule belongs to the optional manual auto-apply fallback. These controls should not be described as the same policy. A candidate can change future prompting without an individual human approval under the autonomous setting.

An automatic pass labels the memory as AI-applied and leaves the audit actor absent. If a person explicitly requested candidate generation and the autonomous setting applies it, that person can be recorded as the actor instead. Rejection stores normalized wording so the same wording is not repeatedly proposed; it is not a semantic guarantee against every paraphrase. Removing an active memory and rejecting an outstanding candidate are separate operations.

An improvement suggestion's title is not a guarantee of its mechanical effect. Prompt changes append an approved note. Approval-policy changes require review and disable autonomous execution. Shared skill instruction changes append text and require super-admin authority. Other supported suggestion categories can become active AI rules rather than directly rewriting a tool schema, deploying an integration, or installing a new routing system. Inspect the displayed patch and resulting artifact, especially for an approved suggestion that has not yet been applied.

## Distinguish The Three Kinds Of Evaluation

A contract-only smoke check evaluates saved configuration and source evidence. It can pass without making a model answer the objective or executing a fresh external workflow. A model-graded check runs the real agent loop and then asks a grader to judge the answer against the fixture rubric. Samples can be configured from one to five, and each sample incurs agent work plus grading. A different enabled model is preferred for grading, but the system can fall back to the model under test when no alternative is available.

Model-graded checks are distinct from the explicitly labeled rehearsal path. They create evaluation conversations and invoke normal runtime authorization and tool policies; do not assume every write is simulated simply because the purpose is evaluation. Rehearsal specifically marks side-effecting calls as rehearsed while allowing real reads. Neither type is authorized by a documentation maintenance run, and none was executed here.

Release comparison can report not run, stale, model grading required, passed, failed, or active. In that comparison, current evidence is primarily checked against the fixture's update time. It is not a universal assertion that every agent dependency, external record, or provider response exactly matches the original run. A passing configuration check and a passing rehearsal also prove different things. Read the mode with the status before reporting readiness to another team.

Candidates, improvement suggestions, approvals, and version histories have retained evidence beyond the 90-day log/transaction cleanup. Reflections follow their source runs' retention. Do not promise that old learning artifacts disappear with trace logs. Company administrators see authorized company evidence; shared catalog and platform configuration have separate super-admin controls. This guide describes local source behavior, with external rename cutover and deployment acceptance still separate under [PRODUCT.md](../../PRODUCT.md).
