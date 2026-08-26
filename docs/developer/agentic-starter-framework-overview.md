# Agentic Starter Framework Overview

This is the practical starting point for building a new governed agentic app on Sonae.

**For what Sonae is and why it exists, read [PRODUCT.md](../../PRODUCT.md)** — the single source of truth for the product vision and the three strategic lanes it serves. This guide is the builder's view of the same thing: which parts of the repo are platform core, which parts are app-specific configuration, and where to add custom domain logic, data models, agents, tools, connectors, workflows, UI, or customer setup.

## What Sonae Provides

Sonae is a reusable foundation for agentic applications with:

- Tenant-scoped users, companies, roles, plans, audit logs, and knowledge.
- Configurable agents with model defaults, system prompts, tools, approval policy, knowledge, runs, versions, memory, eval fixtures, and improvement suggestions.
- A durable agent runtime that records steps, model calls, tool calls, approvals, final output, failures, cost, and latency.
- An allowlisted tool dispatcher for internal handlers and connector-backed handler stubs.
- Connector marketplace foundations for install state, secret references, OAuth lifecycle scaffolding, diagnostics, generated connector tools, and connection-test logs.
- Workflow orchestration for agent, API, code, database, logic, wait, approval, iterator, merge, and email nodes.
- Admin screens for agents, runs, approvals, tools/connectors, workflows, schedules, models, knowledge, companies, users, widgets, reports, and settings.
- English/Italian localization and test coverage for core backend contracts, auth-sensitive behavior, locale parity, and admin drift rules.

## Platform Core Vs App-Specific Work

Treat these as platform core:

- `convex/schema.ts`: database tables and indexes.
- `convex/agentRuntime.ts` and `convex/agentObjectiveLoop.ts`: the runtime's internal actions and the governed execution loop they hand off to.
- `convex/agentRuns.ts`: durable run, step, tool-call, approval, replay, cancel, and analytics APIs.
- `convex/agents.ts` and `convex/agentService.ts`: agent CRUD, builder flow, readiness, template creation, and agent record normalization.
- `convex/aiToolExecutionService.ts`: tool normalization, policy checks, registered handlers, and execution dispatch.
- `convex/aiTools.ts` and `convex/toolConnectorDefinitions.ts`: AI tool admin APIs and connector marketplace foundations.
- `src/app/(dashboard)/admin/**`: super-admin and tenant-admin surfaces.
- `messages/en.json` and `messages/it.json`: user-facing admin text.

Treat these as app-specific or customer-specific:

- Agent templates, starter prompts, recommended tools, starter eval fixtures, and default approval policy.
- Tenant/company records, initial users, model defaults, provider settings, and connector install/configuration.
- Knowledge documents, workflow graph definitions, schedules, widgets, and customer-facing copy.
- Custom tool handlers or external connector packages that are specific to a vertical domain.

When in doubt, keep product-specific behavior out of shared runtime paths. Add configuration, templates, or registered handlers instead.

## First Build Path

For a new agentic app or tenant:

1. Read `AGENTS.md` for branch, verification, and frozen-demo rules.
2. Run the local setup in `docs/developer/getting-started.md`.
3. Follow `docs/developer/new-agentic-app-setup-checklist.md`.
4. Choose or create an agent template in `convex/agentTemplates.ts`.
5. Configure model defaults in the AI Models admin surface.
6. Install or create the required tools/connectors in the AI Tools admin surface.
7. Create a draft agent from the guided builder.
8. Add tenant-scoped knowledge and bind tools.
9. Run contract smoke evals, then model-graded smoke evals if provider credentials are configured.
10. Inspect durable runs and eval history before activation.
11. Add product-specific code, data models, workflow, schedule, widget, webhook, or public API surface only after the agent behavior is tested.

For a quick local demo, use `npm run demo:local:seed` after enabling `LOCAL_DEMO_SEED_ENABLED=1` and configuring `LOCAL_DEMO_SEED_SECRET` in Convex. The seeded demo creates a tenant, users, model defaults, starter knowledge, a knowledge search tool, a draft agent, and starter eval fixtures without requiring production credentials.

## Main Extension Points

### Agents

Use:

- `convex/agentTemplates.ts` for reusable starter agents.
- `convex/agents.ts` for creation, update, readiness, and template instantiation.
- `src/app/(dashboard)/admin/agents/page.tsx` for the guided creation surface.
- `src/app/(dashboard)/admin/agents/[id]/settings/page.tsx` for readiness and activation controls.

Agents created from templates should start as drafts and should not activate until a successful smoke eval exists.

### Tools And Connectors

Use:

- `convex/aiTools.ts` for tool and connector admin APIs.
- `convex/aiToolExecutionService.ts` for runtime handler registration and execution.
- `convex/toolConnectorDefinitions.ts` for built-in connector definitions.
- `src/app/(dashboard)/admin/ai/tools/page.tsx` for the marketplace and installed connector list.
- `src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.tsx` for connector configuration and diagnostics.

Every runtime handler should be allowlisted, tenant-scoped, role-checked, and audited.

### Knowledge

Use:

- `knowledgeDocuments` and related knowledge tables in `convex/schema.ts`.
- Existing upload and knowledge policy in `docs/developer/upload-and-knowledge-policy.md`.
- Agent knowledge bindings through `knowledgeDocumentIds`.

Knowledge should be tenant-scoped unless it is explicitly global and safe to share.

### Evals And Readiness

Use:

- `convex/agentEvalFixtures.ts` for eval fixture creation, smoke evals, model grading, and smoke history.
- Agent settings readiness for draft status, model defaults, tools, knowledge, eval fixtures, smoke evals, and fixture-type coverage.
- Agent runs dashboard for smoke eval health and durable run drilldown.

Readiness is a release gate, not a replacement for review. A passing smoke eval confirms that the configured contracts are satisfied; it does not prove the agent is correct for every production case.

### Workflows, Schedules, And Widgets

Use:

- `convex/workflowRuntime.ts` and `convex/workflowRuntimeService.ts` for orchestration.
- `src/app/(dashboard)/admin/workflows/**` for workflow setup.
- `src/app/(dashboard)/admin/workflows/schedules/**` and scheduler APIs for recurring work.
- Widget tables and admin pages for customer-facing chat surfaces.

Build agent behavior first, then wire it into workflow or widget surfaces.

## Verification Before Handoff

Before asking someone to review, merge, or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For frontend changes, start the app and inspect the changed route with the in-app browser. For Convex schema or API changes, run `npx convex codegen`.
