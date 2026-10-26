---
product: Hakken
documentation_type: Developer checklist
feature_area: Product extension and setup
audience: developers and product operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/new-agentic-app-setup-checklist.md
last_reviewed: '2026-10-26T15:05:19+00:00'
reviewed_against: current implementation
status: Current
---
# New Agentic App Setup Checklist

> **Product:** Hakken · **Document type:** Developer checklist · **Feature area:** Product extension and setup
> **Reviewed:** 26 October 2026, 15:05:19 GMT (Europe/London)
> **Source path:** `docs/developer/new-agentic-app-setup-checklist.md` · **Status:** Current

Use this checklist when creating a new customer setup, demo tenant, or vertical app on top of the Hakken foundation.

The goal is to get from empty tenant to tested draft agent without relying on production-only credentials or hidden manual steps.

Implementation references:

- `docs/developer/agentic-starter-framework-overview.md`
- `docs/developer/starter-app-template-checklist.md`
- `docs/operator/local-demo-seed-runbook.md`
- `convex/agentTemplates.ts`
- `convex/localDemoSeed.ts`
- `scripts/local-demo-seed.mjs`

For a new product clone, start with [Product Setup](../operator/product-setup.md).
Product Setup previews identity and provider requirements before applying local file changes.
Use [Product Recipes](./product-recipes.md) for a complete starting workflow, or the
[Feature Generator](./feature-generator.md) for individual domain records and their
forms, relationships, tenant checks and navigation. Preserve the export baseline
and follow [Framework Updates](../operator/framework-updates.md) for later core changes.

## 1. Repository And Environment

- Confirm the current branch is `dev`.
- Use Node `24.22.1`.
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
LOCAL_DEMO_SEED_ENVIRONMENT=local
LOCAL_DEMO_SEED_SECRET=replace-with-local-secret
```

Then run:

```bash
LOCAL_DEMO_SEED_SECRET=replace-with-local-secret npm run demo:local:seed
```

This seeds a demo company, super-admin, company admin, model defaults, starter knowledge, `knowledge.search` tool, a draft knowledge assistant, and starter eval fixtures.

The seed is local-only. `convex/localDemoSeed.ts` refuses to run unless `LOCAL_DEMO_SEED_ENABLED=1`, the passed secret matches `LOCAL_DEMO_SEED_SECRET`, and `LOCAL_DEMO_SEED_ENVIRONMENT=local`. Use the operator runbook for the full safety and troubleshooting flow.

The local seed is useful for rehearsing the setup flow, but it is not a production onboarding or migration tool.

## 3. Agent Template Selection

Agent templates in `convex/agentTemplates.ts` are the starter path for individual governed agents. Each archetype supplies starter prompts, approval policy, tool recommendations, and eval fixtures.

- Confirm the archetype that best matches the intended agent behavior, or add a new one.
- Review the starter prompt, recommended tools, approval policy, and seeded fixtures before creating the agent.
- Anything the archetype does not cover — workspace setup, connector installation, knowledge import, workflows, publish surfaces — is configured explicitly in the sections below.

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

Review model selection before activation. A newly built draft agent inherits model selection and uses the system failsafe model id until defaults or overrides are intentionally configured.

## 5. Knowledge Sources

- Decide which knowledge is global and which is tenant-scoped.
- Upload or seed starter knowledge documents.
- Confirm document status is ready before binding it to an agent.
- Bind relevant documents to the draft agent.
- Add a retrieval smoke objective that proves the agent uses the intended knowledge.

Compare the intended knowledge plan with the actual imported documents. Do not treat a planned knowledge scope as proof that documents already exist.

## 6. Tools And Connectors

- Install the required built-in connector definitions.
- Add or create AI tools for internal handlers.
- Configure connector secret references without storing raw secrets in Convex rows.
- Configure OAuth connections only through the connector lifecycle.
- Run connector diagnostics.
- Bind the required tools to the draft agent.
- Confirm tool side-effect level and approval requirement match product risk.

Start from the agent template's recommended tools. A connector being recommended by a template is not the same as being installed, authenticated, tested, or approved for side effects.

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

Inspect every created draft agent and workflow. Generated draft resources are starting points: agents are inactive, workflows are manual and inactive, and human approval is required by default.

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

Reconcile the template's intended readiness checks with actual eval coverage. A template can describe intended checks, but release readiness comes from the configured agent, bound tools, linked knowledge, and passing eval evidence.

## 9. Workflow, Schedule, Widget, Or API Surface

- Add workflow nodes only after the agent behavior is tested.
- Add schedules only after manual workflow runs are reliable.
- Add widgets only after tenant scoping and knowledge behavior are verified.
- Add webhook/public API surfaces only with signed access, rate limits, and audit records.
- Keep external side effects behind explicit authorization and approval policy.

Treat any planned publish target as implementation intent. Verify each actual surface separately before handoff.

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
- Agent template archetype used.
- Agent id and activation status.
- Workflow ids and activation status, if applicable.
- Smoke eval run ids.
- Known gaps or intentionally deferred production credentials.

## Current Implementation And Review Boundaries

These procedures describe local creation tools for an explicitly requested new product or feature. They are not authorization to generate application files during Hakken documentation maintenance. This run inspected scripts only: it did not create a clone, apply a recipe, generate a schema, install dependencies, write product defaults, create tenants or deploy anything. The current Hakken repository and its separate upstream remain distinct identities.

`template.verticals.json` currently has no optional vertical definitions; base and Arcade are retained. Older instructions describing four opt-in application areas or restored Sales/Properties/movement routes do not match this checkout. Residual schema/callback compatibility must be inspected independently, and absence of a screen does not authorize deletion of historical records.

Agent setup uses the current scratch Add page sharing Settings sections. The retained template API and local demo seed are different entry points, not proof the old guided builder is available. Passed evals and release policy are readiness advice in the current activation path. A recommended review checklist should never be presented as backend refusal unless the source actually enforces it.

Stored configuration and catalog capability do not prove live integration acceptance. General text adapters include Google Vertex, OpenAI, Anthropic and OpenRouter; TypeSafe is Decision-only, and specific media/grounding/embedding jobs have narrower requirements. Live voice and phone paths must follow [Spoken channels](./spoken-channels.md), while Gmail mailbox polling is retired. Do not revive old features because a retained generic connector/configuration key still exists.

For a real implementation task, use current [AGENTS.md](../../AGENTS.md) gates including coverage and browser smoke where required, rather than an abbreviated gate list copied into an old checklist. Product intent/acceptance changes need their own agreement. Local source/tests, generated test files and a passing configuration validator are separate from a deployed provider/account accepting the actual customer workflow.
