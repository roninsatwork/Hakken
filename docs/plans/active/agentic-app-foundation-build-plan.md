# Agentic App Foundation Build Plan

This plan is the reference point for turning Sonae from a strong internal agentic platform into a reusable starter framework for building production agentic apps.

Use this plan when deciding what to build next, what already exists, and where new work should land. It complements:

- `docs/plans/active/true-agentic-platform-plan.md` for the core durable agent runtime.
- `docs/plans/active/agent-learning-improvement-plan.md` for memory, feedback, reflections, and governed improvement.
- `docs/developer/product-extension-guide.md` for extension patterns and code ownership boundaries.
- `docs/developer/future-agent-maintenance-plan.md` for repo guardrails, quality gates, and frozen demo scope.

## Goal

Sonae should become a reusable foundation where a developer or product team can create a governed agentic app quickly:

1. Pick an app template.
2. Configure a tenant, model defaults, knowledge, and tools.
3. Create one or more agents through a guided builder.
4. Test the agent against evals before release.
5. Deploy chat, workflows, widgets, governed connector integrations, and scheduled automations.
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
- Allowlisted tool dispatcher path for registered runtime handlers, currently covering `knowledge.search` and `company.overview.update`.
- Agent template catalogue, admin template picker, draft template instantiation, seeded eval fixtures, and recommended tool auto-binding for installed tools.

### Partial Or Product-Incomplete

These areas exist structurally but are not yet complete enough to feel like a polished framework.

- Connector SDK: tools exist, but there is not yet a finished connector marketplace with OAuth, secrets, scopes, connection tests, install flows, and reusable handler packages.
- Tool dispatcher: the allowlisted handler registry exists for the first internal handlers, but the remaining framework-grade work is idempotency, richer audit metadata for write/external handlers, and broader denial/failure tests.
- Agent builder: agents can be created/configured, but there is no guided purpose-first setup flow that produces a tested, ready-to-run agent.
- App templates: draft agent templates exist, but full app setup templates should still create or recommend knowledge scopes, workflows, schedules, widgets, and connector bundles.
- Eval runner: eval fixture tables, suite execution, grouped suite selection, saved suite presets with edit/archive lifecycle, manual fixture authoring/edit/archive, explicit blocked-action policy assertions, configurable critical release-gate checks, release-candidate comparison views, and model-graded rollout controls exist. Remaining product work is optional release-candidate snapshots and deeper historical diffing.
- Run replay/debugging: durable run data exists, but the UI should become a richer execution timeline with replay and comparison tools.
- Memory review: memory candidates/reflections exist, but the review workflow should become a first-class inbox.
- Knowledge QA: ingestion and retrieval exist, but chunk inspection, retrieval tests, stale detection, and re-embedding controls are not complete product surfaces.
- Public API: intentionally deferred. Widgets and internal connectors remain the preferred external surface for now; broad inbound API keys, public run triggers, status polling, and callback URLs should not be built unless a concrete customer/product need appears.
- Deployment/customer setup: scripts and docs exist, but a polished "new app/customer" initializer is missing.

### Mostly New

These are new product/framework layers to add on top of the existing foundation.

- Full app template gallery for starter agentic apps beyond draft agent creation.
- Guided agent/app builder.
- Connector marketplace with install/test/configure flows.
- Generic allowlisted tool dispatcher and handler registry.
- Eval suite runner and release gate.
- Replayable run timeline with diffing.
- Setup wizard for tenants, default models, sample tools, sample agents, and first knowledge import.
- Broad inbound public API and generic webhook triggers are deferred by product decision; revisit only for a specific external-channel or customer integration need.
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

## Implementation Progress

Last updated: 2026-06-16.

| Roadmap item | Status | Notes |
| --- | --- | --- |
| Phase 1: Framework Orientation And Starter Kit | Complete foundation | Start-here framework overview, new app/customer setup checklist, vertical starter app template checklist, and local demo seed path are implemented and linked from README/docs index. The demo seed creates a local tenant, demo users, model defaults, starter knowledge, knowledge tool, draft template agent, and starter eval fixtures without production credentials. |
| Phase 2: Agent App Templates | Complete for draft agent templates | Five templates, admin picker, draft creation, model-default usage, locale keys, seeded eval fixtures, and recommended tool binding are implemented. |
| Phase 3: Tool Dispatcher And Handler Registry | First pass complete | Runtime tool execution now uses an allowlisted dispatcher for the first internal read/write handlers. Remaining work: idempotency, expanded write/external audit metadata, and broader access-denial tests. |
| Phase 4: Connector Marketplace | Foundation complete | Connector install state, built-in definitions, install/test/update APIs, safe secret-reference handling, secret-reference registry records, OAuth connection lifecycle scaffolding, generated connector tools, safe external handler stubs, tenant scope controls, a marketplace panel, installed connector configuration page, structured connection diagnostics, admin diagnostics UI, and connection-test logs are implemented. Later production work: real secret-provider vault integration, live external connector execution, and OAuth callback routes. |
| Phase 5: Guided Agent Builder | Complete foundation | The admin new-agent flow is now a draft-only guided builder that captures template, objective, audience, approval policy, model behavior, knowledge/tool intent, and readiness acknowledgement. Builder intent is persisted in creation audit metadata. Agent settings now include a backend-backed activation readiness checklist for draft status, model defaults/overrides, tools, knowledge, eval fixtures, smoke eval coverage, and fixture-type coverage. A governed smoke-eval runner validates active fixture contracts against bound tools, can optionally queue provider-backed model/rubric grading, persists fixture and grading metadata into durable run steps, surfaces the latest smoke result including queued/failed states, blocks draft activation until a successful smoke eval exists, exposes recent smoke-eval history on the agent runs dashboard, and lets admins inspect durable run details from eval cards or run rows. |
| Phase 6: Eval Runner And Release Gate | Complete foundation | Admins can run all active eval fixtures for an agent as a contract-only or model-graded suite from a dedicated Evals tab, create and edit manual eval fixtures with scoped source runs and audit logs, archive fixtures out of active suite runs, run tag-filtered suite groups, save/edit/archive suite presets, mark presets as requiring model grading, run presets, set or clear a preset as the release gate, see release-gate fixture counts, compare current release-candidate fixture results against previous eval checkpoints, persist suite results as durable eval runs, enforce tenant scoping, prove suite execution does not create real tool calls, validate expected blocked-action contracts, support explicit blocked-action policy assertions for approval-required, deny-tool, do-not-call, and tenant-boundary expectations, and block draft activation until the configured release gate passes with model grading when required. Next: Phase 7 run replay/debugging or optional release-candidate snapshots. |
| Phase 7: Run Timeline, Replay, And Debugging | Complete foundation | First run-detail timeline slice is implemented: the backend derives readable timeline entries from durable run steps, attaches linked tool calls and approval requests, summarizes inputs/outputs/errors with bounded previews, calculates step latency, and exposes model/token/cost metadata. Replay lineage now persists source run and replay mode, run detail exposes source/replay summaries plus comparison deltas, and the admin modal shows replay context for both original runs and replay runs. Replay details now include a timeline-level diff aligned by step index so admins can see added, removed, changed, and unchanged steps with source/replay summaries. Tool arguments now default to sanitized previews from the run-detail query itself: admins receive redacted arguments, super-admins receive raw previews, and raw persisted argument fields are not exposed directly to the frontend. Run detail now exposes eval fixture coverage and a learning-action panel so terminal runs can become or update eval fixtures from the same evidence view. Replay controls now support current-active replay and same-version replay that pins the replay run to the source agent version snapshot. Triggered same-version replays now hydrate prompt, model choice, temperature, historical rules, bounded historical memory contents, and historical tool declarations from `agentVersions.snapshotJson`, start after queued seed steps, and record version-hydration plus historical tool dry-run policy trace steps. Future snapshots now include bounded memory items and tool schemas/descriptions for replay fidelity. Write/destructive/external historical tool execution remains blocked unless a future sandbox executor is explicitly added. Next: Phase 8 operational hardening or optional historical tool sandbox execution. |
| Phase 8: Memory And Improvement Review Inbox | Complete foundation | First unified review inbox slice is implemented on the agent Memory tab. Backend `getReviewInboxForAgent` returns tenant-scoped memory candidates, improvement suggestions, reflections, source run summaries, reviewer attribution, risk counts, semantic patch operations, applied suggestion effects, and filtered totals across open, reviewed, high-risk, and all modes. The Memory UI now shows a learning review inbox with approve/reject memory actions, apply/dismiss improvement suggestions, dismissible reflection evidence, reviewer filters, reviewer metadata, status labels, reviewed history, risk labels, richer source evidence summaries, semantic patch previews for prompt/rule/policy changes, applied version/effect summaries, per-column show-more pagination through the review batch, source-run deep links into the run detail modal, and reflection-to-eval fixture shortcuts that convert reflection evidence into reviewed history. Next: Phase 9 production hardening or optional full backend cursor pagination for very large review queues. |
| Phase 9: Knowledge Quality Operations | Complete foundation | Shared quality-ops slices are implemented for global/company knowledge surfaces and the agent-specific Knowledge tab. Backend `getQualitySummary` returns tenant-scoped document status metrics, sampled chunk counts, ready coverage, embedding drift counts, and flagged failed/stale/ready-without-chunks/drift documents with source freshness and failure metadata. Backend `inspectDocument` returns bounded chunk previews, active embedding model comparison, recent ingestion/repair audit history, source freshness timestamps, crawl/ingestion failure reason, and embedding metadata with an explicit untrusted-reference safety notice. Backend `testRetrieval` lets admins run bounded, tenant-scoped lexical retrieval diagnostics across stored chunks. Backend `retryDocumentIngestion` and `repairFlaggedDocuments` requeue failed, stale, empty-ready, or drifted documents through the existing ingestion paths with audit logs. Agent-scoped knowledge writes now inherit the admin's active company for tenant visibility and inspection. The shared Knowledge Manager now shows quality tiles, drift metrics, flagged document cards, document inspection buttons, a retrieval test panel, single/bulk repair and re-embed controls, an inspection modal for sampled chunks, source freshness, failure reasons, and recent ingestion history; it is reused by the agent Knowledge tab. |
| Phase 10: Public Agent API And Webhook Framework | Skipped / deferred | Product decision: do not build a broad inbound public API, Telegram channel, or generic external run-trigger surface as part of this foundation work. Sonae should continue to talk out to other apps through governed connectors/workflows. Revisit only if a specific customer or channel requirement makes inbound external access necessary. |
| Phase 11: Observability, Billing, And Operations | Complete foundation | System Health now combines analytics drift, agent errors, failed transactions, stale queued/running runs, stale approvals, failed tool calls, provider failure clusters, schedule failures, stale scheduled executions, overdue schedules, and high-cost agents. Backend health is role-aware: super-admins see platform scope, tenant admins see only their active company. Existing plan quotas and run `maxCostGBP` values now produce budget-pressure signals for tenant message limits and agent run cost budgets. Derived alert rules cover stuck runs, stale approvals, repeated provider failures, cost/budget pressure, and tool failures with thresholds, concrete examples, and next actions. Platform alert emails include budget signals, and the System Health UI shows scope, budget controls, alert-rule status, investigation links, and an exportable JSON operational report. Next: Phase 12 framework packaging and white-label readiness. |
| Phase 12: Framework Packaging And White-Label Readiness | Complete foundation | Added a dependency-free `npm run setup:validate` script for local and production profiles. The validator checks Convex URL/deployment, production public URL, bootstrap admin fallback, auth provider readiness, AI provider credential groups, and optional ingestion providers without printing secrets. Added `.env.example` guidance, a vertical app packaging checklist, fresh deployment smoke checks, and updated README/getting-started/deployment/product-extension docs so a new product build has a clear rebrand, validation, and handoff path. System Settings now includes a white-label readiness panel that automatically checks product identity, logo variants, brand color, diagnostic routing, and stored email sender configuration, and links/manual-flags widget branding and production setup validation. Runtime invite, workflow, auth fallback, and platform-alert email paths now resolve sender branding through stored settings when no deployment-level sender override is set. Public widget config now falls back to system platform name, brand color, logo, greeting, and placeholder when widget-specific theme values are unset. System Options now includes module presets for knowledge assistant, support widget, and operator workspace starter shapes so builders can choose visible modules, owner surfaces, and handoff checks without risky automatic route hiding. |

## Recommended Build Order

### Phase 1: Framework Orientation And Starter Kit

Give future builders a clear "start here" path.

Build:

- Create a starter framework overview page in docs that links architecture, setup, agent runtime, tools, workflows, templates, and deployment. Implemented in `docs/developer/agentic-starter-framework-overview.md`.
- Add a "new app/customer setup" checklist covering tenant creation, first super-admin, model defaults, provider setup, sample tools, sample agents, and seed knowledge. Implemented in `docs/developer/new-agentic-app-setup-checklist.md`.
- Add a seeded demo dataset or sample tenant that does not depend on production credentials. Implemented with `npm run demo:local:seed` and `convex/localDemoSeed.ts`.
- Add a `docs/developer/starter-app-template-checklist.md` or equivalent template spec for future vertical apps. Implemented in `docs/developer/starter-app-template-checklist.md`.

Acceptance:

- A new developer can understand which files own agents, tools, workflows, knowledge, UI, auth, and deployment in under 30 minutes.
- The docs clearly separate platform core, sample app code, and customer-specific configuration.
- No runtime behavior changes are needed for this phase unless documentation reveals a broken setup path.

Primary files:

- `README.md`
- `docs/index.md`
- `docs/developer/getting-started.md`
- `docs/developer/product-extension-guide.md`
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
- Add "readiness checklist" state to agent settings. Foundation added for draft status, tool bindings, linked knowledge, active eval fixtures, smoke eval runs, and latest smoke eval history.
- Add warnings for missing model defaults, no knowledge, no tools, or untested active agents. Current warnings cover missing agent-capable model defaults/overrides, missing tools, missing linked knowledge, missing eval fixtures, and missing successful smoke evals. Draft activation is blocked until a successful smoke eval exists.
- Add controlled smoke-eval contract execution. Current runner validates expected tool mappings and rubric presence without live model credentials; optional model-backed grading is queued through a provider action and records pass/fail output against the stored rubric when credentials are available.
- Add a compact eval-results surface. Current runs dashboard now shows recent smoke eval totals, pass/fail/active state, grading mode, fixture context, model/version metadata, and missing tool mappings.
- Add run detail drilldown from eval and run history. Current runs dashboard opens a durable run detail modal with status, objective, output/error, timeline steps, tool calls, and approval records.
- Add fixture coverage visibility. Current settings readiness shows active coverage and smoke-passed coverage across all core eval fixture categories.

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

- Add an eval suite page per agent. Implemented as a dedicated agent Evals tab with active fixture library, full-suite run action, single-fixture run actions, release-gate status, and recent eval history.
- Let admins create eval fixtures from scratch or from failed runs/reflections. First slice implemented: the Evals tab can create manual fixtures with type, objective, rubric, expected tool mappings, expected blocked-action JSON, tags, scoped source run, and audit log.
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
- Add an eval run table with status, model, agent version, cost, latency, and result summary. Recent suite/smoke eval runs are currently visible in the Eval health panel and durable run detail modal.
- Add a release gate that warns before activating an agent version with failing critical evals. First slices implemented: readiness now includes a release gate check, settings shows a release-blocked warning, activation is blocked when the latest eval checkpoint is not passing, and active fixtures selected by configured tags or by a configured suite preset must each have a current passing eval before activation.

Acceptance:

- Admins can run at least one fixture against an agent version.
- Evals do not execute real destructive/external side effects.
- Evals can assert expected blocked actions and expected tool plans. Tool-plan mappings and blocked-action evidence are validated in the contract runner; malformed or empty blocked-action expectations fail the eval without executing tools.
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
  - Implemented first slice with derived step summaries, bounded input/output/error previews, linked tool/approval chips, token/cost metadata, and per-step duration.
- Add replay controls:
  - rerun objective
  - rerun with same agent version
  - rerun with current draft
  - convert to eval fixture
  - generate reflection
  - Implemented current-active replay lineage with source run links, recent replay history, and status/latency/cost/token/step/output comparison summaries.
  - Implemented explicit current-active and same-version replay controls; same-version replay requires a source agent version snapshot and pins the replay run to that version id.
  - Implemented triggered same-version replay hydration for snapshot prompt, model id, and temperature, plus trace metadata for snapshot hashes and non-hydrated tool/rule/memory areas.
  - Implemented historical rule and bounded memory hydration for triggered same-version replays; future version snapshots now store bounded memory contents.
  - Implemented historical tool declaration hydration for triggered same-version replays; future snapshots store descriptions and input schemas, read-only tools are flagged replay-informational, and write/external execution remains blocked until an explicit test-mode executor exists.
  - Implemented historical tool dry-run policy tracing: same-version replays record skipped tool replay steps with read-only test-mode candidates and blocked write/destructive/external tools instead of making live calls.
- Add diff view between original run and replay.
  - Implemented first pass with step-index aligned timeline diff rows, aggregate change flags, duration deltas, and source/replay summaries.

Acceptance:

- Run details can be understood without reading raw JSON.
- Replays preserve tenant scope and do not replay write/external actions without explicit test mode or approval.
- Redacted args are shown by default; raw args require the correct role and should remain sensitive.
  - Implemented for tool-call argument display: `getRunDetail` returns role-aware previews and never returns persisted raw argument fields directly.
- Failed runs can become eval fixtures from the UI.
  - Implemented in run detail: terminal runs show create/update eval actions and existing fixture coverage.

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
  - Implemented first slice with tenant-scoped memory candidates, improvement suggestions, unresolved reflections, source run summaries, risk totals, and actionable cards on the Memory tab.
- Add actions:
  - approve memory
  - reject memory
  - convert reflection to eval
  - convert suggestion to draft prompt version
  - dismiss suggestion
  - Implemented approve/reject memory and apply/dismiss improvement suggestions from the unified inbox.
  - Implemented reflection-to-eval fixture shortcuts from the reflection evidence column.
- Add risk classification and source evidence display.
  - Implemented first patch preview for improvement suggestions and source run summaries for review items.
  - Implemented open/reviewed/high-risk/all filters, reviewed status metadata, richer source run evidence, and conversion of eval-backed reflections into reviewed history.
  - Implemented reflection dismissal with audit logs plus structured field/value patch previews for improvement suggestions.
  - Implemented reviewer attribution for reviewed memory candidates, suggestions, and reflections plus applied suggestion effect/version summaries.
  - Implemented semantic patch operation previews for prompt appends, approval policy changes, and rule-style suggestion changes.
  - Implemented per-column show-more/show-less pagination for memory candidates, improvement suggestions, and reflection evidence in the inbox.
  - Implemented reviewer filters and source-run deep links that open the existing run detail modal from inbox cards.

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
  - Implemented first slice for shared global/company knowledge surfaces with quality metrics, flagged documents, and bounded chunk inspection.
  - Implemented agent Knowledge tab parity by reusing the shared Knowledge Manager and tenant-scoping agent knowledge writes to the admin's active company.
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

Skipped / deferred by product decision.

Rationale:

- The current product direction does not need a broad inbound platform API.
- Sonae should talk to other apps through governed connectors, workflow nodes, and admin-configured integrations.
- Inbound external channels should be considered only for a specific, concrete channel or customer requirement.
- Telegram is explicitly not part of the current foundation work.

Do not build now:

- Tenant API keys for external callers.
- Generic public agent run trigger endpoints.
- Generic webhook callbacks for terminal run states.
- External status polling endpoints.
- Public developer API docs.

Revisit only if:

- A named customer needs to call Sonae from their own system.
- A specific channel integration becomes product-critical.
- The security, rate-limit, tenant-boundary, audit, and support requirements are explicitly budgeted.

Files to revisit only if reopened:

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
- `docs/developer/getting-started.md`
- `docs/developer/deployment.md`
- `docs/developer/product-extension-guide.md`
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

For tool, auth, workflow, connector, or tenant-sensitive changes, also add or update Convex tests that prove:

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
- Is there any named customer or channel requirement strong enough to reopen the deferred inbound public API work?
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
