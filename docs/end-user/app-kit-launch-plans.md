# App Kit Launch Plans

App kit launch plans help internal operators turn a reusable Sonae starter pattern into a reviewed workspace preparation record. They are designed for super admins preparing customer or vertical builds, not for everyday end users.

Use this guide when selecting an app kit, syncing the catalog registry, creating a launch plan, creating or linking a workspace, materializing draft resources, or deciding what still needs human review before release.

## Where To Find It

- `/admin/launch`: app kit gallery, catalog registry controls, setup form, and recent launch plans.
- `/admin/app-kits`: alias for the same app kit gallery.
- `/admin/launch/plans/[id]`: launch plan detail page.
- `/admin/app-kits/plans/[id]`: alias for the same launch plan detail page.

These screens are platform administration surfaces. If a user cannot open them, check that they have super-admin access.

## What App Kits Are

An app kit is a reusable starter pattern for a vertical or functional AI application. Current kits include patterns for customer support, customer success QBRs, sales research, proposals and RFPs, internal knowledge portals, meeting briefs, compliance reviews, invoice and billing analysis, product feedback triage, release notes, property or lead research, and API support.

Each kit describes:

- category, name, tagline, and description
- risk profile
- primary users
- recommended connectors
- planned agents
- knowledge scopes
- planned workflows
- eval fixtures
- dashboard card ideas
- publish targets
- readiness checks
- developer follow-ups
- extension points
- implementation pointers

App kits are not automatically deployed products. They are structured starting points for setup, review, and handoff.

## Review The Catalog

The launch gallery lets a super admin search and filter kits by use case, category, connector, planned resource, or code pointer. Selecting a kit shows its planned agents, workflows, knowledge scopes, eval fixtures, readiness checks, and implementation notes.

The catalog registry adds durable editorial state on top of the code-backed kit definitions. Operators can sync the registry, mark a kit active, mark it needs review, archive it from normal use, assign an owner email, and add editorial notes.

Sync the registry after app kit definitions change in code. Syncing updates stored source snapshots but preserves editorial lifecycle state, owner, and notes.

## Create A Launch Plan

Create a launch plan from a selected app kit when there is a real customer, internal workspace, or product package to prepare.

The setup form can capture:

- target company name
- product or brand name
- brand accent
- first admin email
- invite policy notes
- model default use cases
- target plan name
- connector owner
- selected connectors
- connector notes
- knowledge owner
- starter knowledge sources
- knowledge notes
- surface owner
- selected publish targets
- publish notes
- general operator notes

The resulting plan is durable. It stores the selected template, target setup inputs, planned resources, safety defaults, developer follow-ups, and implementation pointers.

## Work A Launch Plan

The launch plan detail page turns the kit into a checklist. It shows readiness status, blockers, next actions, workspace setup, connector readiness, draft resources, developer tasks, planned knowledge, planned workflows, publish targets, and code pointers.

Use the plan detail page to answer:

- has a workspace been created or linked?
- have planned agents or workflows been materialized?
- are recommended connectors installed, active, tested, and connected?
- what setup work is blocked?
- what developer or operator task is next?
- which resources still need review before release?

Readiness states are preparation states. A launch plan marked ready for review does not mean a customer-facing deployment is live.

## Create Or Link A Workspace

A launch plan can create a company workspace from the target company name. It can also link an existing company workspace.

Creating or linking a workspace only establishes the tenant shell and records the relationship to the launch plan. Operators still need to review users, invitations, plan assignment, model defaults, branding, knowledge, tools, widgets, agents, workflows, and release evidence.

If the plan already points to a workspace, review that workspace before creating another one. Avoid duplicate tenant records for the same launch.

## Materialize Draft Resources

Materialization creates draft resources from the plan:

- inactive global agents
- inactive manual workflows
- smoke eval fixtures for created agents
- stored ids for created resources

Materialization is idempotent for a plan. If resources were already created, running the action again returns the existing resource ids instead of creating duplicates.

Materialized agents and workflows deliberately start inactive. They are not production-ready until an operator reviews configuration, knowledge, connectors, tools, rules, evals, release gates, workflows, widgets, and launch evidence.

## Connector Readiness

Launch plans compare recommended connector keys with installed connector records. A connector is only treated as ready when it is installed, active, successfully tested, and connected where OAuth is required.

Connector readiness is a setup signal, not a guarantee that every customer action is safe. Review tool permissions, side-effect levels, approval requirements, and tenant data boundaries before activating agents or workflows that depend on connectors.

## Developer Tasks And Handoff

The plan detail page groups follow-up work into practical categories such as workspace, brand, access, models, plan, resources, connectors, knowledge, surfaces, code, and release.

Blocked tasks usually mean a required setup dependency is missing, such as no workspace or unready connectors. Pending tasks usually mean the resource exists but still needs human review or implementation work. Ready tasks are prepared enough for the next review step.

Use implementation pointers as handoff notes for developers. They identify likely repo areas to inspect, but they do not replace code review or release gates.

## Archive A Plan

Archiving a launch plan removes it from active preparation. It does not delete companies, agents, workflows, eval fixtures, release candidates, widgets, connectors, or knowledge that may already exist.

Before archiving a materialized plan, review created resources and decide whether they should remain draft, be deleted through their own admin flows, or be documented as intentionally retained.

## Practical Launch Checklist

Before treating a launch plan as ready for release review:

1. Confirm the app kit still matches the customer use case.
2. Sync or review the catalog registry.
3. Create or link the correct workspace.
4. Record brand, invite, model, connector, knowledge, and publish-surface notes.
5. Materialize draft resources only when the plan should seed agents and workflows.
6. Review connector readiness.
7. Open created agents and workflows and review their configuration directly.
8. Add or verify knowledge, rules, tools, schemas, and evals.
9. Keep draft resources inactive until release checks pass.
10. Move to release review only after blockers are resolved.

Launch plans are preparation records. Activation still happens through the relevant agent, workflow, widget, release, and operations screens.
