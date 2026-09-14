# New Agentic App Setup Checklist

Use this checklist when creating a new customer setup, demo tenant, or vertical app on top of the Sonae foundation.

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
