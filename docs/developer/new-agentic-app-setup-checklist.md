# New Agentic App Setup Checklist

Use this checklist when creating a new customer setup, demo tenant, or vertical app on top of the Sonae foundation.

The goal is to get from empty tenant to tested draft agent without relying on production-only credentials or hidden manual steps.

Implementation references:

- `docs/developer/agentic-starter-framework-overview.md`
- `docs/developer/starter-app-template-checklist.md`
- `docs/developer/app-kit-launch-plan-implementation.md`
- `docs/operator/local-demo-seed-runbook.md`
- `convex/appTemplates.ts`
- `convex/agentTemplates.ts`
- `convex/localDemoSeed.ts`
- `scripts/local-demo-seed.mjs`

## 1. Repository And Environment

- Confirm the current branch is `dev`.
- Use Node `24.18.0`.
- Run `npm ci` when starting from a clean checkout.
- Run `npm run verify:env` before trusting local results.
- Start Convex with `npm run convex:dev`.
- Start the web app with `npm run dev`.

## 2. Tenant And Admin Access

- Create or identify the company record.
- Create the first super-admin or tenant admin.
- Confirm admin role assignment and company scope.
- Confirm the admin can access the dashboard.
- Keep super-admin-only setup actions separate from tenant-admin work.

For a local no-production-credentials demo seed, configure Convex with:

```bash
LOCAL_DEMO_SEED_ENABLED=1
LOCAL_DEMO_SEED_SECRET=replace-with-local-secret
```

Then run:

```bash
LOCAL_DEMO_SEED_SECRET=replace-with-local-secret npm run demo:local:seed
```

This seeds a demo company, super-admin, company admin, model defaults, starter knowledge, `knowledge.search` tool, a draft knowledge assistant, and starter eval fixtures.

The seed is local-only. `convex/localDemoSeed.ts` refuses to run unless `LOCAL_DEMO_SEED_ENABLED=1`, the passed secret matches `LOCAL_DEMO_SEED_SECRET`, and `LOCAL_DEMO_SEED_ENVIRONMENT` is not `production`. Use the operator runbook for the full safety and troubleshooting flow.

The local seed also syncs app template catalog rows and creates sample launch-plan state. It is useful for rehearsing the setup flow, but it is not a production onboarding or migration tool.

## 3. App Kit Or Agent Template Selection

Sonae has two starter paths:

- App kits in `convex/appTemplates.ts` for broader vertical workspaces with planned agents, workflows, knowledge scopes, connectors, readiness checks, publish targets, and implementation pointers.
- Agent templates in `convex/agentTemplates.ts` for individual governed agents with starter prompts, approval policy, tool recommendations, and eval fixtures.

Use an app kit when the new setup needs a workspace plan, connector bundle, knowledge import notes, draft workflows, launch-plan review, or follow-up implementation tasks. Use an agent template when the setup only needs a single draft agent.

For app-kit setups:

- Confirm the template exists in the static `APP_TEMPLATES` catalog.
- Sync or review the persistent `appTemplateCatalogItems` registry before relying on operator-facing lifecycle metadata.
- Create a launch plan from the template rather than manually copying setup notes.
- Review target company, workspace setup overrides, connector notes, knowledge import notes, safety defaults, readiness checks, extension points, and implementation pointers.
- Materialize only after review. `materializeLaunchPlan` creates inactive draft agents, inactive manual workflows, eval fixtures, and source run ids. It is idempotent at the launch-plan level and does not create a production-ready app automatically.
- Confirm the template is mapped in `APP_TEMPLATE_AGENT_ARCHETYPE` when the default internal-knowledge archetype is not appropriate.

## 4. AI Provider And Model Defaults

- Configure provider credentials outside the repo.
- Enable the provider in the AI provider admin surface or seed path.
- Sync or seed the model catalogue.
- Set model defaults for at least:
  - `agent`
  - `workflow`
  - `chat`
  - `report`, if reports are part of the app
  - `embedding`, if knowledge search is used
- Confirm the target agent readiness panel shows the model default check passing.
- Avoid hardcoding model literals in runtime code.

If app-kit resources were materialized, review model selection before activation. Materialized draft agents inherit model selection and use the system failsafe model id until defaults or overrides are intentionally configured.

## 5. Knowledge Sources

- Decide which knowledge is global and which is tenant-scoped.
- Upload or seed starter knowledge documents.
- Confirm document status is ready before binding it to an agent.
- Bind relevant documents to the draft agent.
- Add a retrieval smoke objective that proves the agent uses the intended knowledge.

For app kits, compare the template knowledge scopes with the actual imported documents. Do not treat the launch plan's knowledge import notes as proof that documents already exist.

## 6. Tools And Connectors

- Install the required built-in connector definitions.
- Add or create AI tools for internal handlers.
- Configure connector secret references without storing raw secrets in Convex rows.
- Configure OAuth connections only through the connector lifecycle.
- Run connector diagnostics.
- Bind the required tools to the draft agent.
- Confirm tool side-effect level and approval requirement match product risk.

For app kits, start from `recommendedConnectorKeys` and the launch-plan connector bundle. A connector being recommended by a template is not the same as being installed, authenticated, tested, or approved for side effects.

## 7. Agent Template And Draft Agent

- Pick an existing template or add a new template in `convex/agentTemplates.ts`.
- Define:
  - agent name and description
  - starter system prompt
  - recommended tools
  - recommended approval policy
  - starter eval fixtures
  - intended knowledge plan
- Create the agent through the guided builder.
- Keep it inactive while reviewing readiness.
- Review generated audit metadata for template id, builder intent, missing tools, and seeded fixtures.

For app-kit materialization, inspect every created draft agent and workflow. Generated draft resources are starting points: agents are inactive, workflows are manual and inactive, and human approval is required by default.

## 8. Evals And Activation Readiness

- Confirm readiness checks cover:
  - draft status
  - model default or override
  - tool bindings
  - linked knowledge
  - active eval fixtures
  - successful smoke eval
  - fixture-type coverage
- Run a contract smoke eval.
- If provider credentials are configured, run model-graded smoke eval.
- Inspect smoke eval history in the runs dashboard.
- Inspect the durable run detail timeline for steps, tool calls, and approvals.
- Activate only after the successful smoke eval gate passes.

For app kits, reconcile the template readiness checks with actual eval coverage. A template can describe intended checks, but release readiness comes from the configured agent, bound tools, linked knowledge, and passing eval evidence.

## 9. Workflow, Schedule, Widget, Or API Surface

- Add workflow nodes only after the agent behavior is tested.
- Add schedules only after manual workflow runs are reliable.
- Add widgets only after tenant scoping and knowledge behavior are verified.
- Add webhook/public API surfaces only with signed access, rate limits, and audit records.
- Keep external side effects behind explicit authorization and approval policy.

For app-kit launch plans, treat publish targets as implementation intent. Verify each actual surface separately before handoff.

## 10. Handoff Verification

Run:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For UI changes, inspect changed routes in the browser. For backend API changes, run `npx convex codegen`.

Record:

- Tenant/company used for setup.
- Model defaults configured.
- Connectors installed and diagnostics status.
- App kit and launch plan used, if applicable.
- Agent template or app-kit archetype used.
- Agent id and activation status.
- Materialized workflow ids and activation status, if applicable.
- Smoke eval run ids.
- Known gaps or intentionally deferred production credentials.
