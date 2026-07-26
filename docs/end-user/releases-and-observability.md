# Releases And Observability

Sonae has a release operations area for taking reviewed agents live and watching how they behave afterwards. It is built for super admins and internal operators who ship governed AI products.

This guide describes the implemented screens and workflows. Releasing an agent is a deliberate, evidence-backed step: readiness, eval results, rollback plan, and operator ownership are all checked before activation, and run evidence is reviewed after it.

For release sign-off and post-launch run review, see [Release Review And Run Observatory](./release-review-and-run-observatory.md).

## Where To Find It

- `/admin/releases` shows agent release readiness and recent release candidates.
- `/admin/run-observatory` shows recent agent run health, cost, model, failure, and tool evidence.
- `/admin/agents/[id]/settings` shows the latest release state and release actions for one agent.
- `/admin/agents/[id]/evals` shows release-gate fixtures, eval suites, and release candidate comparison for one agent.

These are platform administration screens. They are not normal end-user workspace screens.

## Releases

The releases page focuses on global agents. It summarizes each agent as draft blocked, ready for review, live needs attention, or live. The status is derived from readiness evidence such as activation risk, tool bindings, knowledge documents, active eval fixtures, successful smoke evals, release gate policy, and model readiness.

Recent release candidates move through pending sign-off, approved, activated, rolled back, or cancelled states. A release candidate stores release notes, rollback plan, owner email, optional activation window, readiness snapshot, agent version snapshot, approval or cancellation comments, and rollback reason where applicable.

Release candidates can only be created for global agents that pass readiness. Activation rechecks readiness and the activation window. Rollback restores the previous live snapshot when one exists; otherwise the agent is deactivated and should be reviewed before another candidate is created.

Operators can also review release state from an individual agent's settings page and inspect release-gate evidence from the agent's evals page. The agent settings page is useful for single-agent work, while the release page remains the cross-agent ship-check surface.

## Run Observatory

The run observatory reviews recent agent execution evidence. Super admins see a platform view; company admins with a company context see their company scope where backend access allows it.

The current observatory window defaults to the last 7 days. It summarizes sampled runs and tool calls, success rate, failed and active runs, cost, token totals, average latency, status mix, trigger counts, model statistics, agent statistics, tool statistics, failure reasons, and recent run evidence with links back to agent run timelines.

Use the run observatory after activating an agent, changing model defaults, enabling new tools, or editing prompts or rules. It is the fastest place to see whether recent runs are succeeding, failing, waiting for approvals, costing more than expected, or calling risky tools.

## Practical Release Flow

A typical internal release flow is:

1. Build the agent in the agent builder, starting from the archetype that matches the use case.
2. Configure model defaults, knowledge, connectors, tools, prompts, rules, widgets, and workflows.
3. Run evals and smoke tests.
4. Create an agent release candidate when readiness passes.
5. Approve and activate during the intended window.
6. Watch the run observatory and release page after activation.

Readiness, release review, and post-launch observation are all required. Passing one of them is not approval to skip the others.
