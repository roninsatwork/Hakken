# Starter App Template Checklist

Use this checklist when designing a reusable vertical app template, not just a single agent.

A complete app template should describe the customer problem, the tenant setup, the agents, the knowledge, the tools, the workflows, the evals, and the release gate.

## Template Metadata

- Template id.
- Template name.
- Target audience.
- Business outcome.
- Primary admin user.
- Required customer data.
- Required provider credentials.
- Required connector credentials.
- Production readiness level:
  - demo
  - internal pilot
  - customer pilot
  - production

## Tenant Setup

- Required company properties.
- Required plans or quotas.
- Required admin roles.
- Optional company-specific model defaults.
- Optional branding, widget, or workspace navigation changes.

## Agents

For each agent:

- Name and description.
- System prompt starter.
- Model behavior:
  - inherit default
  - override model
  - reasoning effort
  - temperature, if needed
- Human approval policy.
- Internet access policy.
- Required knowledge documents.
- Required tools.
- Required schedules or triggers.
- Activation readiness expectations.

## Knowledge

- Starter documents.
- Tenant-scoped documents.
- Global reusable documents.
- Source owner.
- Refresh cadence.
- Sensitive-data constraints.
- Retrieval objectives to test.
- Stale-data warning criteria.

## Tools And Connectors

For each tool or connector:

- Handler mapping.
- Connector key, if applicable.
- Input schema.
- Output shape.
- Side-effect level.
- Required role.
- Approval requirement.
- Required secret refs.
- Required OAuth scopes.
- Tenant target resolver.
- Audit metadata.
- Failure behavior.

## Workflows And Schedules

For each workflow:

- Trigger type.
- Agent nodes.
- Tool/API/code/database nodes.
- Approval nodes.
- Retry expectations.
- Runtime and cost budgets.
- Failure notification path.
- Schedule cadence, if recurring.

## Evals

Include fixture coverage across relevant categories:

- Happy path.
- Tool plan.
- Approval pause.
- Rejected action.
- Prompt injection.
- Tenant boundary.
- Bad tool arguments.
- Cancellation.
- Replayed failure.
- Cost/latency budget.

Each fixture should include:

- Objective.
- Expected tool plan.
- Expected blocked actions, if any.
- Expected memory behavior, if any.
- Final output rubric.
- Source evidence.
- Tags.

## Release Gate

Before activating a template-created agent:

- Required model default or override passes readiness.
- Required tools are installed and bound.
- Required knowledge is linked and ready.
- Contract smoke eval passes.
- Model-graded smoke eval passes when provider credentials are available.
- Runs dashboard has a durable trace for the smoke eval.
- Admin has inspected failures and missing mappings.
- Production secrets are configured outside the repo.

## Documentation To Ship With A Template

- What the template does.
- What it intentionally does not do.
- Required setup steps.
- Required data and credentials.
- Agent behavior summary.
- Tool and connector summary.
- Eval coverage summary.
- Known production gaps.
- Rollback/deactivation instructions.

