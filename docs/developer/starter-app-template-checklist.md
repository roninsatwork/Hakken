# Starter App Template Checklist

Use this checklist when designing or reviewing a reusable Sonae app kit template. It is for a vertical or functional starter application, not just a single agent prompt.

For the implementation details behind catalog sync, launch plans, workspace linking, and draft resource materialization, read [App Kit And Launch Plan Implementation](./app-kit-launch-plan-implementation.md).

## Implementation Source Of Truth

Code-backed app kits live in `convex/appTemplates.ts`.

Every durable template should be represented in `APP_TEMPLATES` with:

- stable `id`
- `category`
- `name`
- `tagline`
- `description`
- `riskProfile`
- `primaryUsers`
- `recommendedConnectorKeys`
- planned `agents`
- planned `knowledgeScopes`
- planned `workflows`
- planned `evalFixtures`
- planned `dashboardCards`
- `publishTargets`
- `readinessChecks`

`withDeveloperGuidance` enriches templates with `developerFollowUps`, `extensionPoints`, and `implementationPointers`. Add template-specific guidance when the default follow-ups are too generic. Implementation pointers must name real repo paths, not aspirational files.

## Catalog And Lifecycle

The static template list is not the only operator-facing state. The persistent registry in `appTemplateCatalogItems` stores lifecycle status, owner, editorial notes, source JSON, sync timestamps, and updater metadata.

When adding or changing a template:

- keep the template id stable after it is exposed
- run or use the catalog sync flow so registry source snapshots can update
- do not overwrite editorial owner, notes, or lifecycle status during sync
- use lifecycle `NEEDS_REVIEW` when a template's source changed but the operating owner has not reviewed it
- archive a template instead of deleting it when operators may still need historical launch-plan context

## Tenant Setup

A complete app kit should describe the tenant setup needed before it can be useful:

- target company or workspace assumptions
- expected first admin or operating owner
- required plan, quota, or billing posture
- company model defaults or use-case defaults to review
- branding, navigation, widget, or publish-surface expectations
- invite policy notes
- production credential and secret ownership

Launch plans may create or link a company workspace, but that only creates the tenant shell. It does not invite users, assign a billing plan, upload knowledge, configure model defaults, activate agents, publish widgets, or complete release review.

## Agents

For each planned agent, define:

- name and purpose
- starter system prompt or archetype
- model behavior: inherit default, override, reasoning effort, and temperature
- human approval policy
- internet access policy
- required and recommended knowledge
- required and recommended tools
- schedules, webhooks, workflow entry points, or manual launch expectations
- activation readiness expectations

Map each template to an agent archetype in `APP_TEMPLATE_AGENT_ARCHETYPE` when the default internal-knowledge archetype is not correct. Materialized launch-plan agents intentionally start inactive, inherit model selection, use the selected archetype prompt, require human approval, and use manual trigger mode.

## Knowledge

For each knowledge scope, define:

- source owner
- starter documents
- tenant-scoped documents
- reusable global documents, if any
- refresh cadence
- sensitive-data constraints
- retrieval objectives to test
- stale-data warning criteria

Prefer company or agent scope for customer-specific facts. Do not put tenant facts into reusable template metadata or global knowledge guidance.

## Tools And Connectors

For each recommended connector or tool, define:

- connector key or handler mapping
- auth mode and secret reference expectations
- required OAuth scopes when applicable
- input schema and output shape
- side-effect level
- required role
- approval requirement
- tenant target resolver
- audit metadata
- failure behavior

Recommended connectors are readiness signals, not automatic execution authority. Tool execution still depends on installed connector state, active tool definitions, role checks, tenant checks, side-effect policy, and approval handling.

## Workflows And Schedules

For each planned workflow, define:

- trigger type
- agent nodes
- API, database, logic, iterator, merge, wait, approval, or email nodes
- retry expectations
- runtime and cost budgets
- failure notification path
- schedule cadence when recurring
- whether the workflow should ever be exposed by webhook

Launch-plan materialization creates inactive manual workflows with empty graph arrays and a review-oriented description. It does not create active workflow graphs, connector actions, or customer-facing workflow surfaces automatically.

## Evals And Release Evidence

Include fixture coverage across relevant categories:

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

Each fixture should include:

- objective
- expected tool plan
- blocked actions, if any
- expected memory behavior, if any
- final output rubric
- source evidence
- tags

High-risk templates should include model-graded or release-gate evidence before activation. Materialized fixtures are smoke evidence for draft resources, not proof that the final customer workflow is ready.

## Publish Targets And Surfaces

Publish targets such as internal app, scheduled digest, webhook trigger, support widget, website widget, developer widget, or dashboard card ideas are intent metadata. They do not mean a product surface exists.

Before marking a template ready for a target surface:

- confirm the route or component exists, or create a developer follow-up
- define the audience and role boundary
- confirm tenant isolation
- confirm branding and white-label expectations
- confirm widget/domain readiness when a widget is involved
- add implementation pointers to the most likely code areas

## Release Gate

Before activating a template-created agent or workflow:

- required model default or override passes readiness
- required tools are installed and bound
- required knowledge is linked and ready
- connector readiness has been reviewed
- smoke eval passes
- model-graded smoke eval passes when required and provider credentials are available
- run history has durable evidence for the smoke eval
- admin has inspected failures and missing mappings
- production secrets are configured outside the repo
- release candidate, approval, activation window, and rollback path are clear

## Documentation To Ship With A Template

Every durable app kit should have enough documentation for the next operator or developer to understand:

- what the template does
- what it intentionally does not do
- required setup steps
- required data and credentials
- agent behavior summary
- tool and connector summary
- workflow and schedule summary
- eval coverage summary
- known production gaps
- rollback, deactivation, or archive instructions

If the template represents a new customer-facing feature or implementation area, update the relevant end-user, developer, operator, and index docs in the same change.
