# New Agentic App Setup Checklist

Use this checklist when creating a new customer setup, demo tenant, or vertical app on top of the Sonae foundation.

The goal is to get from empty tenant to tested draft agent without relying on production-only credentials or hidden manual steps.

## 1. Repository And Environment

- Confirm the current branch is `dev`.
- Use Node `22.13.0`.
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

## 3. AI Provider And Model Defaults

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

## 4. Knowledge Sources

- Decide which knowledge is global and which is tenant-scoped.
- Upload or seed starter knowledge documents.
- Confirm document status is ready before binding it to an agent.
- Bind relevant documents to the draft agent.
- Add a retrieval smoke objective that proves the agent uses the intended knowledge.

## 5. Tools And Connectors

- Install the required built-in connector definitions.
- Add or create AI tools for internal handlers.
- Configure connector secret references without storing raw secrets in Convex rows.
- Configure OAuth connections only through the connector lifecycle.
- Run connector diagnostics.
- Bind the required tools to the draft agent.
- Confirm tool side-effect level and approval requirement match product risk.

## 6. Agent Template And Draft Agent

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

## 7. Evals And Activation Readiness

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

## 8. Workflow, Schedule, Widget, Or API Surface

- Add workflow nodes only after the agent behavior is tested.
- Add schedules only after manual workflow runs are reliable.
- Add widgets only after tenant scoping and knowledge behavior are verified.
- Add webhook/public API surfaces only with signed access, rate limits, and audit records.
- Keep external side effects behind explicit authorization and approval policy.

## 9. Handoff Verification

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
- Agent template used.
- Agent id and activation status.
- Smoke eval run ids.
- Known gaps or intentionally deferred production credentials.
