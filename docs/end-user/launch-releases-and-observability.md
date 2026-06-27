# Launch, Releases, And Observability

Sonae has a launch operations area for turning reusable app kits into reviewed customer workspaces, draft agents, workflows, release candidates, and run evidence. It is built for super admins and internal operators who prepare governed AI products before a customer-facing rollout.

This guide describes the implemented screens and workflows. It does not mean app kits automatically create a complete production app. The launch plan creates structured preparation work, draft resources, readiness evidence, and links into the admin areas where a human still reviews configuration before activation.

For task-level launch plan work, see [App Kit Launch Plans](./app-kit-launch-plans.md). For release sign-off and post-launch run review, see [Release Review And Run Observatory](./release-review-and-run-observatory.md).

## Where To Find It

- `/admin/launch` shows the app kit gallery, app kit registry controls, and recent launch plans.
- `/admin/app-kits` is an alias for the launch gallery.
- `/admin/launch/plans/[id]` opens one launch plan.
- `/admin/app-kits/plans/[id]` is an alias for the same launch plan detail page.
- `/admin/releases` shows agent release readiness and recent release candidates.
- `/admin/run-observatory` shows recent agent run health, cost, model, failure, and tool evidence.

These are platform administration screens. They are not normal end-user workspace screens.

## App Kits

App kits are reusable starter patterns for vertical or functional AI applications. The current catalog includes kits for customer support, customer success QBRs, sales research, proposals and RFPs, internal knowledge portals, meeting briefs, compliance reviews, invoice and billing analysis, product feedback triage, release notes, property or lead research, and API support.

Each kit includes category, name, tagline, description, risk profile, primary users, recommended connectors, planned agents, knowledge scopes, planned workflows, suggested eval fixtures, dashboard card ideas, publish targets, readiness checks, developer follow-ups, extension points, and implementation pointers.

The launch gallery lets a super admin search and filter templates, inspect the selected kit, sync the persistent app kit registry, set registry lifecycle status, assign an owner email, add editorial notes, and create a launch plan from the selected kit.

## Launch Plans

A launch plan is a durable preparation record created from an app kit. It stores the chosen template, risk profile, target company name, operator notes, setup inputs, planned resources, and developer handoff information.

When creating a launch plan, an operator can capture target company and product name, brand accent, first admin email, invite policy notes, model default use cases, target plan name, connector owner, selected connector keys, knowledge owner, starter knowledge sources, surface owner, publish targets, and operational notes.

The plan detail page turns that information into a practical checklist. It shows planned agents, workflows, eval fixtures, knowledge scopes, connectors, dashboard cards, publish targets, readiness checks, developer follow-ups, extension points, and code pointers. It also summarizes blockers, pending tasks, and ready tasks so an operator can see what needs attention next.

## Workspace And Draft Resources

Launch plans can create or link a company workspace. Creating a workspace uses the launch plan target company name and records audit evidence linking the workspace back to the launch plan. Linking an existing workspace updates the plan and records the link.

Launch plans can also materialize draft resources. Materialization creates inactive global agents and inactive manual workflows based on the selected app kit. It also seeds eval fixtures from the selected agent archetype. These resources are deliberately not live by default. The operator must review model defaults, knowledge, tools, evals, rules, prompts, workflows, and release evidence before activation.

If a launch plan has already materialized resources, running the materialization action again returns the existing resource ids instead of creating duplicates.

## Releases

The releases page focuses on global agents. It summarizes each agent as draft blocked, ready for review, live needs attention, or live. The status is derived from readiness evidence such as activation risk, tool bindings, knowledge documents, active eval fixtures, successful smoke evals, release gate policy, and model readiness.

Recent release candidates move through pending sign-off, approved, activated, rolled back, or cancelled states. A release candidate stores release notes, rollback plan, owner email, optional activation window, readiness snapshot, agent version snapshot, approval or cancellation comments, and rollback reason where applicable.

Release candidates can only be created for global agents that pass readiness. Activation rechecks readiness and the activation window. Rollback restores the previous live snapshot when one exists; otherwise the agent is deactivated and should be reviewed before another candidate is created.

## Run Observatory

The run observatory reviews recent agent execution evidence. Super admins see a platform view; company admins with a company context see their company scope where backend access allows it.

The current observatory window defaults to the last 7 days. It summarizes sampled runs and tool calls, success rate, failed and active runs, cost, token totals, average latency, status mix, trigger counts, model statistics, agent statistics, tool statistics, failure reasons, and recent run evidence with links back to agent run timelines.

Use the run observatory after activating an agent, changing model defaults, enabling new tools, editing prompts or rules, or rolling out a launch plan. It is the fastest place to see whether recent runs are succeeding, failing, waiting for approvals, costing more than expected, or calling risky tools.

## Practical Launch Flow

A typical internal launch flow is:

1. Pick an app kit that matches the customer's use case.
2. Sync or review the app kit registry and assign an owner.
3. Create a launch plan with target company, connector, knowledge, model, and publish-surface inputs.
4. Create or link the company workspace.
5. Materialize draft agents, workflows, and eval fixtures if the kit should seed resources.
6. Configure model defaults, knowledge, connectors, tools, prompts, rules, widgets, and workflows.
7. Run evals and smoke tests.
8. Create an agent release candidate when readiness passes.
9. Approve and activate during the intended window.
10. Watch the run observatory and release page after launch.

Do not treat launch plan materialization as approval to go live. The launch area creates the structured starting point; readiness, release review, and post-launch observation are still required.
