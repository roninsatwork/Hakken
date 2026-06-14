# Agentic App Foundation Build Plan

This plan is the reference point for turning Sonae from a strong internal agentic platform into a reusable starter framework for building production agentic apps.

Use this plan when deciding what to build next, what already exists, and where new work should land. It complements:

- `docs/true-agentic-platform-plan.md` for the core durable agent runtime.
- `docs/agent-learning-improvement-plan.md` for memory, feedback, reflections, and governed improvement.
- `docs/product-extension-guide.md` for extension patterns and code ownership boundaries.
- `docs/future-agent-maintenance-plan.md` for repo guardrails, quality gates, and frozen demo scope.

## Goal

Sonae should become a reusable foundation where a developer or product team can create a governed agentic app quickly:

1. Pick an app template.
2. Configure a tenant, model defaults, knowledge, and tools.
3. Create one or more agents through a guided builder.
4. Test the agent against evals before release.
5. Deploy chat, workflows, widgets, webhooks, and scheduled automations.
6. Observe every run, approval, tool call, cost, memory, and failure.
7. Improve safely through reviewed memories, prompt versions, tool contracts, and eval fixtures.

The target product claim is:

> Sonae is a reusable framework for building governed agentic applications with tenant-scoped context, approved tool execution, durable runs, workflow orchestration, observability, and deployment-ready admin controls.

## Current Code Position

### Already Present

These are real foundations in the codebase and should be extended rather than rebuilt.

- Multi-tenant Convex data model with companies, users, roles, plans, audit logs, model configuration, knowledge, agents, workflows, widgets, and telemetry.
- Durable agent run schema: `agentRuns`, `agentRunSteps`, `agentToolCalls`, `agentRunApprovals`, feedback, reflections, memory candidates, eval fixtures, suggestions, versions, and memories.
- Bounded agent runtime loop in `convex/agentRuntime.ts` with model resolution, conversation context, file context, memory retrieval, RAG, tool declarations, tool-call handling, budgets, telemetry, and approval pause.
- Tool metadata, schemas, side-effect levels, role requirements, policy normalization, argument validation, and access checks in `convex/aiToolExecutionService.ts`.
- Workflow runtime in `convex/workflowRuntime.ts` and `convex/workflowRuntimeService.ts` with agent, API, code, database, logic, wait, approval, iterator, merge, and email nodes.
- Admin surfaces for agents, tools/connectors, workflows, schedules, approvals, runs, memory, knowledge, models, widgets, reports, companies, users, settings, scripts, and logs.
- Tenant-scoped knowledge and chat document upload paths.
- Model provider configuration and provider-specific adapter boundaries.
- Localization parity tests, no-native-dialog checks, admin pagination standards, and broad backend test coverage.

### Partial Or Product-Incomplete

These areas exist structurally but are not yet complete enough to feel like a polished framework.

- Connector SDK: tools exist, but there is not yet a finished connector marketplace with OAuth, secrets, scopes, connection tests, install flows, and reusable handler packages.
- Tool dispatcher: tool schemas and policy exist, but runtime execution still contains special-cased handler branches. The generic dispatcher placeholder should become an allowlisted handler registry.
- Agent builder: agents can be created/configured, but there is no guided purpose-first setup flow that produces a tested, ready-to-run agent.
- App templates: the platform has many primitives, but no one-click templates for common agentic app shapes.
- Eval runner: eval fixture tables exist, but there is not yet a full admin flow for running suites before publishing agent changes.
- Run replay/debugging: durable run data exists, but the UI should become a richer execution timeline with replay and comparison tools.
- Memory review: memory candidates/reflections exist, but the review workflow should become a first-class inbox.
- Knowledge QA: ingestion and retrieval exist, but chunk inspection, retrieval tests, stale detection, and re-embedding controls are not complete product surfaces.
- Public API: widgets exist, but signed API keys, webhook triggers, status polling, and callbacks need a more complete framework story.
- Deployment/customer setup: scripts and docs exist, but a polished "new app/customer" initializer is missing.

### Mostly New

These are new product/framework layers to add on top of the existing foundation.

- Template gallery for starter agentic apps.
- Guided agent/app builder.
- Connector marketplace with install/test/configure flows.
- Generic allowlisted tool dispatcher and handler registry.
- Eval suite runner and release gate.
- Replayable run timeline with diffing.
- Setup wizard for tenants, default models, sample tools, sample agents, and first knowledge import.
- Public agent API with signed keys, webhook triggers, callback URLs, and rate limits.
- Knowledge quality dashboard.
- Framework packaging docs for forking, white-labeling, and building vertical apps.

## Non-Drift Rules

- Do not touch the frozen movement demo unless the user explicitly asks or a required quality gate is broken.
- Keep runtime model selection configuration-driven. Do not hardcode provider or model literals in generic runtime paths.
- Preserve tenant isolation in every query, mutation, action, tool handler, workflow node, memory read/write, and public endpoint.
- Treat model tool calls as requests, never permissions.
- Every real-world side effect must have deterministic backend authorization and an audit record.
- Destructive, external, or high-risk actions must support explicit approval.
- Keep English and Italian locale dictionaries in parity.
- Admin tables and feeds should default to 15 rows per page.
- Use existing admin UI primitives and Sonae modal patterns. Do not use native browser dialogs.

## Recommended Build Order

### Phase 1: Framework Orientation And Starter Kit

Give future builders a clear "start here" path.

Build:

- Create a starter framework overview page in docs that links architecture, setup, agent runtime, tools, workflows, templates, and deployment.
- Add a "new app/customer setup" checklist covering tenant creation, first super-admin, model defaults, provider setup, sample tools, sample agents, and seed knowledge.
- Add a seeded demo dataset or sample tenant that does not depend on production credentials.
- Add a `docs/starter-app-template-checklist.md` or equivalent template spec for future vertical apps.

Acceptance:

- A new developer can understand which files own agents, tools, workflows, knowledge, UI, auth, and deployment in under 30 minutes.
- The docs clearly separate platform core, sample app code, and customer-specific configuration.
- No runtime behavior changes are needed for this phase unless documentation reveals a broken setup path.

Primary files:

- `README.md`
- `docs/index.md`
- `docs/getting-started.md`
- `docs/product-extension-guide.md`
- `scripts/local-test-auth.mjs`
- `convex/seedUsers.ts`

### Phase 2: Agent App Templates

Make the platform feel useful immediately.

Build:

- Add a template catalogue data structure for reusable agentic app templates.
- Start with five templates:
  - Internal knowledge assistant.
  - Support triage agent.
  - Sales research and qualification agent.
  - Document extraction and review agent.
  - Reporting analyst agent.
- Each template should define recommended agents, system prompt starter, tools, knowledge scopes, approval policy, eval fixtures, and suggested workflows.
- Add an admin template picker that can create a draft agent or app setup from a template.

Acceptance:

- A super-admin can instantiate a template without manually writing a system prompt from scratch.
- Created resources are drafts by default and must be reviewed before activation.
- Template-created agents use configured model defaults.
- Locale keys are added in English and Italian.
- Tests cover template parsing and at least one template instantiation path.

Primary files:

- `convex/agents.ts`
- `convex/agentService.ts`
- `convex/aiTools.ts`
- `convex/workflows.ts`
- `src/app/(dashboard)/admin/agents/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/settings/page.tsx`
- `messages/en.json`
- `messages/it.json`

### Phase 3: Tool Dispatcher And Handler Registry

Move from special-cased tool execution to a framework-grade dispatcher.

Build:

- Replace the placeholder dispatcher in `convex/aiToolExecutionService.ts` with an allowlisted handler registry.
- Define a typed handler contract:
  - handler mapping
  - input schema
  - output shape
  - required role
  - side-effect level
  - confirmation requirement
  - tenant target resolver
  - audit metadata builder
- Move existing special-cased handlers into registered handlers:
  - `knowledge.search`
  - `company.overview.update`
- Add idempotency support for write/external handlers.
- Persist tool call IDs before execution and pass them into handlers for audit linkage.

Acceptance:

- Adding a new tool no longer requires editing the main agent runtime loop.
- Unknown handler mappings fail closed.
- Tool execution re-checks role, tenant scope, confirmation, and schema at execution time.
- Every write/external/destructive handler writes audit metadata.
- Tests cover success, schema failure, tenant denial, role denial, approval required, unknown handler, and handler failure.

Primary files:

- `convex/aiToolExecutionService.ts`
- `convex/aiToolReadTools.ts`
- `convex/aiToolWriteTools.ts`
- `convex/agentRuntime.ts`
- `convex/agentRuns.ts`
- `convex/aiToolExecutionService.test.ts`
- `convex/aiToolReadTools.test.ts`
- `convex/aiToolWriteTools.test.ts`

### Phase 4: Connector Marketplace

Turn tools into installable, configurable connectors.

Build:

- Add connector definitions separate from individual tool records.
- Add connector install/config screens:
  - install status
  - auth mode
  - required secrets/scopes
  - test connection
  - enabled tools
  - tenant availability
- Add secure secret reference fields. Do not store raw secrets in tool schemas or prompts.
- Start with internal/basic connectors:
  - Sonae Knowledge.
  - Sonae Company/Profile.
  - Sonae Workflow/Task.
  - HTTP REST connector.
  - Email/notification connector.
- Later external connectors:
  - Slack.
  - Google Drive.
  - Gmail/Outlook.
  - Notion.
  - HubSpot/Salesforce.
  - Linear/Jira.

Acceptance:

- Super-admins can install and test connectors.
- Admins can only configure tenant-allowed connectors.
- Agents only see bound tools from active connectors.
- Connection test failures are visible and logged.
- Secrets are never sent to the model or rendered in the UI.

Primary files:

- `convex/schema.ts`
- `convex/aiTools.ts`
- `convex/aiToolExecutionService.ts`
- `src/app/(dashboard)/admin/ai/tools/page.tsx`
- `src/app/(dashboard)/admin/ai/tools/new/page.tsx`
- `src/app/(dashboard)/admin/ai/tools/[id]/page.tsx`
- `src/app/(dashboard)/admin/ai/tools/mcp/new/page.tsx`

### Phase 5: Guided Agent Builder

Create a wizard that makes a working agent without requiring platform expertise.

Build:

- Add a guided creation flow:
  - choose template or blank
  - define objective
  - select audience
  - choose knowledge sources
  - choose tools/connectors
  - set approval policy
  - set model behavior
  - generate/edit system prompt
  - run smoke eval
  - save as draft or activate
- Add "readiness checklist" state to agent settings.
- Add warnings for missing model defaults, no knowledge, no tools, or untested active agents.

Acceptance:

- A non-engineering admin can create a draft agent using a template.
- Risky tools default to approval required.
- Activation is blocked or strongly warned if no smoke eval has run.
- Generated prompts are editable and versioned.
- The wizard does not bypass existing `agents.createAgent` and `agents.updateAgent` authorization.

Primary files:

- `src/app/(dashboard)/admin/agents/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/settings/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/system-prompt/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/knowledge/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/integrations/page.tsx`
- `convex/agents.ts`
- `convex/agentVersions.ts`

### Phase 6: Eval Runner And Release Gate

Make agent changes testable before they reach users.

Build:

- Add an eval suite page per agent.
- Let admins create eval fixtures from scratch or from failed runs/reflections.
- Support fixture types:
  - happy path
  - approval pause
  - rejected action
  - prompt injection
  - tenant boundary
  - bad tool args
  - cancellation
  - replayed failure
  - tool plan
  - cost/latency budget
- Add an eval run table with status, model, agent version, cost, latency, and result summary.
- Add a release gate that warns before activating an agent version with failing critical evals.

Acceptance:

- Admins can run at least one fixture against an agent version.
- Evals do not execute real destructive/external side effects.
- Evals can assert expected blocked actions and expected tool plans.
- Results are stored and visible by agent/version.
- Tests cover fixture creation, tenant scoping, and safe tool mocking.

Primary files:

- `convex/agentEvalFixtures.ts`
- `convex/agentVersions.ts`
- `convex/agentRuns.ts`
- `src/app/(dashboard)/admin/agents/[id]/runs/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/schemas/page.tsx`

### Phase 7: Run Timeline, Replay, And Debugging

Make durable runs useful for support, debugging, and sales demos.

Build:

- Upgrade run detail UI into a chronological timeline:
  - objective
  - trigger
  - model calls
  - memory used
  - knowledge retrieved
  - tool calls
  - redacted args
  - approval request/result
  - tool result
  - final answer
  - cost
  - latency
  - failure category
- Add replay controls:
  - rerun objective
  - rerun with same agent version
  - rerun with current draft
  - convert to eval fixture
  - generate reflection
- Add diff view between original run and replay.

Acceptance:

- Run details can be understood without reading raw JSON.
- Replays preserve tenant scope and do not replay write/external actions without explicit test mode or approval.
- Redacted args are shown by default; raw args require the correct role and should remain sensitive.
- Failed runs can become eval fixtures from the UI.

Primary files:

- `convex/agentRuns.ts`
- `convex/agentRunReflections.ts`
- `convex/agentEvalFixtures.ts`
- `src/app/(dashboard)/admin/agents/[id]/runs/page.tsx`
- `src/app/(dashboard)/admin/agents/[id]/logs/page.tsx`
- `src/app/(dashboard)/admin/agents/approvals/page.tsx`

### Phase 8: Memory And Improvement Review Inbox

Close the learning loop without letting agents silently change themselves.

Build:

- Add a unified review inbox for:
  - memory candidates
  - reflections
  - prompt suggestions
  - tool schema suggestions
  - eval fixture suggestions
  - approval policy suggestions
- Add actions:
  - approve memory
  - reject memory
  - convert reflection to eval
  - convert suggestion to draft prompt version
  - dismiss suggestion
- Add risk classification and source evidence display.

Acceptance:

- Agents can propose improvements, but high-impact changes require admin approval.
- Memory writes never store hidden prompts, secrets, credentials, or unsafe instructions.
- Every accepted change is audit logged and source-linked.
- Admins can see why a memory or suggestion was proposed.

Primary files:

- `convex/agentMemories.ts`
- `convex/agentMemoryCandidates.ts`
- `convex/agentRunReflections.ts`
- `convex/agentImprovementSuggestions.ts`
- `src/app/(dashboard)/admin/agents/[id]/memory/page.tsx`

### Phase 9: Knowledge Quality Operations

Make RAG manageable as a product surface.

Build:

- Add document/chunk inspection for admins.
- Add retrieval test queries per agent/company.
- Add re-embed controls with status and failure visibility.
- Add stale document detection.
- Add citation preview and source coverage metrics.
- Add ingestion queue health and failed-document repair controls.

Acceptance:

- Admins can test what an agent would retrieve before asking the model.
- Failed parsing/embedding states are visible and recoverable.
- Re-embedding is bounded and tenant-scoped.
- Chunk text is treated as untrusted and never promoted to system instructions.

Primary files:

- `convex/knowledge.ts`
- `convex/knowledgeActions.ts`
- `convex/knowledgeService.ts`
- `convex/utils/fileParser.ts`
- `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx`
- `src/app/(dashboard)/admin/agents/[id]/knowledge/page.tsx`
- `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx`

### Phase 10: Public Agent API And Webhook Framework

Make agents callable from outside the dashboard safely.

Build:

- Add tenant-scoped API keys or signed trigger tokens.
- Add public webhook trigger endpoint for agents and workflows.
- Add run status polling endpoint.
- Add optional callback URLs for terminal run states.
- Add per-key rate limits and payload caps.
- Add request logs with company, trigger, IP/user-agent metadata, status, latency, and cost.

Acceptance:

- Public triggers cannot access admin-only logic.
- Tenant scope is derived from the key/token, not client-provided company IDs.
- Payload size limits defend paid model/provider calls.
- Callback URLs are allowlisted or explicitly configured.
- API keys can be revoked without code changes.

Primary files:

- `convex/http.ts`
- `convex/webhooks.ts`
- `convex/agentRuntime.ts`
- `convex/workflowExecutions.ts`
- `convex/agentRuns.ts`
- `src/app/w/[widgetId]/page.tsx`
- `public/embed.js`

### Phase 11: Observability, Billing, And Operations

Make the framework operable in production.

Build:

- Add agent health dashboard:
  - failed runs
  - pending approvals
  - stale running runs
  - schedule failures
  - high-cost agents
  - tool failure rates
  - provider error rates
- Add per-agent and per-tenant budget controls.
- Add alert rules for stuck runs, stale approvals, repeated provider failures, and cost spikes.
- Add exportable operational reports.

Acceptance:

- Super-admins can identify the top failing/costly agents quickly.
- Tenant admins see only their company data.
- Alerts include concrete run IDs, agent names, dates, and next actions.
- Existing analytics scale rules remain respected.

Primary files:

- `convex/analytics.ts`
- `convex/analyticsService.ts`
- `convex/platformAlertService.ts`
- `convex/agentTransactions.ts`
- `convex/agentRuns.ts`
- `src/app/(dashboard)/admin/settings/system-health/page.tsx`
- `src/app/(dashboard)/admin/ai/costs/page.tsx`
- `src/app/(dashboard)/admin/settings/analytics/page.tsx`

### Phase 12: Framework Packaging And White-Label Readiness

Make Sonae reusable across new products.

Build:

- Document how to fork or rebrand Sonae safely.
- Add a "vertical app checklist" for replacing product copy, navigation, templates, seed data, providers, and default tools.
- Make demo/sample code clearly separable from platform core.
- Add smoke checklist for a fresh deployment.
- Add scripts for validating required env vars and model/provider setup.

Acceptance:

- A fresh product build can start from Sonae without editing core runtime files.
- White-label changes happen through settings, translations, templates, and config where possible.
- Setup validation fails with actionable messages.
- Generated/sample data is not confused with production data.

Primary files:

- `README.md`
- `docs/getting-started.md`
- `docs/deployment.md`
- `docs/product-extension-guide.md`
- `convex/settingsService.ts`
- `messages/en.json`
- `messages/it.json`

## Suggested First Three Build Slices

If we want momentum without opening the whole large build at once, start here.

### Slice A: Tool Dispatcher

Why first:

- It unlocks real connector work.
- It reduces risk inside the agent runtime loop.
- It turns tools from metadata into a true framework extension point.

Deliverables:

- Allowlisted handler registry.
- `knowledge.search` moved into registry.
- `company.overview.update` moved into registry.
- Tests for policy, schema, tenant boundaries, and unknown handlers.

### Slice B: Template Gallery

Why second:

- It makes the platform immediately understandable.
- It gives future sales/demo/development work concrete examples.
- It does not require broad external integrations.

Deliverables:

- Template definitions.
- Admin "create from template" flow.
- Five starter templates.
- Tests for template parsing and resource creation.

### Slice C: Run Timeline

Why third:

- It makes all agentic behavior visible.
- It helps debug every later connector/template/eval feature.
- It is valuable even before replay is implemented.

Deliverables:

- Timeline UI for model, tool, approval, memory, knowledge, and final steps.
- Redacted args by default.
- Failure summary.
- Convert failed run to eval fixture entry point.

## Release Gates

Before any phase is considered done:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For tool, auth, workflow, public API, connector, or tenant-sensitive changes, also add or update Convex tests that prove:

- unauthenticated access fails
- normal users cannot execute admin tools
- admins cannot cross tenant boundaries
- admins cannot escalate to super-admin capabilities
- side effects are audited
- approval-required actions pause instead of executing
- model/tool outputs are treated as untrusted

For UI-heavy phases, add focused component tests and Playwright smoke coverage for the highest-value route.

## Open Product Questions

These should be answered before the later phases.

- Should templates create only agents, or full app bundles with workflows, widgets, tools, evals, and knowledge placeholders?
- Should connector installs be global-only at first, or should tenant admins manage allowed tenant connectors?
- Should evals run against live provider models by default, or use deterministic mocked provider responses for CI?
- What is the first external connector worth building: Slack, Gmail/Outlook, Google Drive, HubSpot, Notion, Linear/Jira, or generic REST?
- Should public API keys be tenant-level, agent-level, or both?
- What is the intended first vertical app built on top of Sonae?

## Parking Lot

Useful ideas that should wait until the foundation above is stronger:

- Visual agent marketplace for third-party templates.
- Multi-agent organization chart with delegation policies.
- Natural language connector builder.
- Long-running browser automation tools.
- Paid tenant billing integration.
- Fine-tuning workflows.
- Cross-product plugin system.
- MCP proxy for arbitrary tools.

Do not start these until the dispatcher, templates, evals, observability, and connector governance are stable.
