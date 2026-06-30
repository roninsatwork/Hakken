# Release Review And Run Observatory

Release review and the run observatory help operators decide whether an agent is ready to go live and whether recent agent runs are healthy after launch. Use these screens after configuring agents, changing tools or model defaults, materializing launch-plan resources, approving a release candidate, or investigating production behavior.

For app kit preparation work, see [App Kit Launch Plans](./app-kit-launch-plans.md). For agent setup tasks, see [Agent Setup And Configuration](./agent-setup-and-configuration.md). For run-level investigation, see [Agent Operations And Review](./agent-operations-and-review.md).

## Where To Find It

- `/admin/releases`: release readiness, agents needing attention, and recent release candidates.
- `/admin/run-observatory`: recent cross-agent execution health, cost, model, failure, and tool evidence.
- `/admin/agents/[id]/settings`: latest release state and release actions for one agent.
- `/admin/agents/[id]/evals`: release-gate fixtures, eval suites, and release candidate comparison.
- `/admin/agents/[id]/runs`: detailed run timelines linked from the observatory.

Release actions are super-admin controlled. The run observatory can show a platform view for super admins or a company-scoped workspace view for admins with a company context.

## Release Readiness

The release page summarizes global agents into four states:

- Draft blocked: readiness evidence is missing or failing.
- Ready for review: readiness checks allow a release candidate.
- Live needs attention: an active agent has warning evidence.
- Live: the active agent has passing readiness evidence.

Readiness is based on implemented agent evidence, including activation risk, tool bindings, knowledge documents, active eval fixtures, smoke eval runs, release gate policy, and model readiness.

Use the readiness overview to decide which agents need configuration work before release and which agents are ready for sign-off.

## Release Candidates

A release candidate captures a reviewed agent version snapshot and release evidence. Candidates can move through these states:

- Pending sign-off
- Approved
- Activated
- Rolled back
- Cancelled

A candidate stores release notes, rollback plan, owner email, optional activation window, readiness evidence, snapshot comparison, approval comments, cancellation reasons, and rollback reasons where applicable.

Create a candidate only after readiness passes. If readiness is blocked, fix the agent configuration, tools, knowledge, evals, or release gate before trying again.

## Snapshot Comparison

Release review includes a snapshot comparison against the previous live release where one exists. The current comparison highlights changed and unchanged areas such as prompt and schemas, tools, memory, rules, model configuration, and policy. Skill snapshot data is stored with agent versions, but skill changes are not yet shown as a dedicated comparison area in the release diff, so inspect skill bindings directly when a candidate changes enabled skills.

Use snapshot comparison to focus review. A release with prompt, tool, or policy changes deserves more scrutiny than a candidate where only release notes changed.

If there is no previous live snapshot, treat the candidate as an initial release and review the full configuration.

## Approval, Activation, And Windows

Approving a candidate records sign-off but does not necessarily make the agent live. Activation moves the release into production and rechecks readiness.

Activation windows can restrict when a candidate may be activated. If the window has not opened, wait. If the window has expired, cancel or create a replacement candidate after reviewing scope.

Do not approve or activate just because a launch plan materialized resources. Release review is the point where eval evidence, readiness, rollback plan, and operator ownership are checked.

## Rollback

Rollback applies to activated releases. If a previous live snapshot exists, rollback restores it. If there is no previous live snapshot, the agent is deactivated and should be reviewed before another release candidate is created.

Use rollback when recent evidence shows a release introduced unacceptable failures, unsafe behavior, cost spikes, tool problems, or customer-impacting regressions.

After rollback, review recent runs, failure reasons, and snapshot differences before creating a replacement candidate.

## Run Observatory

The run observatory is a recent-health dashboard for agent execution. It is a triage surface, not a full historical analytics report.

The current page uses a 7-day view and shows:

- sampled runs
- success rate
- failed runs
- active runs
- sampled cost
- average latency
- recent run evidence
- status mix
- failure reasons
- agents needing attention
- tool risk
- model usage
- trigger counts
- token sample notes

Each recent run links to its agent run timeline for exact details.

## How To Use Observatory Evidence

Use the observatory after:

- activating a release
- changing model defaults
- enabling or editing tools
- changing prompts, rules, schemas, or skills
- materializing launch plan resources
- resolving an incident
- noticing cost or latency changes

Start with failures, active runs, and pending approvals. Open run timelines for failed, cancelled, or expensive runs. Convert repeatable failures into eval fixtures where appropriate. Review tool risk when failures involve write, destructive, external, approval-required, or denied tool calls.

Use model and trigger breakdowns to spot whether a regression is tied to a model change, schedule, workflow, webhook, or manual launch pattern.

## Scope And Privacy

Super admins can use the platform observatory view. Company admins with a company context receive a workspace-scoped view where supported by backend access.

Run evidence can include sensitive operational context. Treat observatory data, run timelines, tool previews, failure reasons, and cost signals as operational records. Do not copy them into external support notes unless that destination is approved for customer data.

## Practical Review Flow

For a planned release:

1. Open `/admin/releases`.
2. Confirm the agent is ready for review.
3. Review readiness warnings, smoke eval status, release gate evidence, and owner.
4. Create a release candidate with release notes and rollback plan.
5. Review snapshot changes.
6. Approve the candidate when evidence is acceptable.
7. Activate inside the intended window.
8. Watch `/admin/run-observatory` after activation.

For an incident:

1. Open `/admin/run-observatory`.
2. Check failures, active runs, high-cost agents, risky tools, and failure reasons.
3. Open affected run timelines.
4. Review tool calls, approvals, errors, and replay options.
5. Add feedback or create eval fixtures from repeatable failures.
6. Roll back the release if the live candidate introduced unacceptable behavior.
7. Keep the replacement candidate blocked until new evidence passes.

Release review and observability are connected. A release should not be considered complete until operators have watched recent run evidence and confirmed that the agent behaves as expected under real usage.
