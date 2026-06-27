# Agents Developer Guide

Agents are Sonae's governed AI worker implementation. The current system covers global agent configuration, template-based creation, reusable skills, tool and knowledge bindings, run telemetry, approvals, eval fixtures, release gates, version snapshots, memories, reflections, improvement suggestions, logs, and a sandbox prompt surface. This document describes the implementation that exists now and should be reviewed before changing agent runtime, admin UI, skills, evals, approvals, or release behavior.

## Product Surface

The admin routes are under `src/app/(dashboard)/admin/agents/`:

- `page.tsx` lists agents, searches with paginated Convex results, starts the builder, creates agents from templates, creates custom agents, and deletes agents.
- `[id]/layout.tsx` renders the agent detail shell and tabs. It also exposes a `Launch Run` action that calls `api.scheduler.manualRunSchedule` with the agent id.
- `[id]/page.tsx` shows transaction summary metrics and recent transactions.
- `[id]/runs/page.tsx` shows run analytics, run lists, run details, replay, cancellation, feedback, reflections, memory candidate generation, eval creation, eval suite execution, and improvement suggestions.
- `[id]/evals/page.tsx` manages eval fixtures, smoke evals, suite presets, release candidate comparison, and release gate settings.
- `[id]/settings/page.tsx` manages name, description, avatar upload, model mode, reasoning effort, internet access, activation, smoke eval checks, and release candidate actions.
- `[id]/skills/page.tsx` attaches, upgrades, enables, disables, and removes skills for one agent.
- `[id]/knowledge/page.tsx`, `[id]/system-prompt/page.tsx`, `[id]/rules/**`, `[id]/integrations/page.tsx`, and `[id]/schemas/page.tsx` configure the agent's context, governance, tools, and IO contracts.
- `[id]/memory/page.tsx` reviews memories, memory quality, memory candidates, reflections, and improvement suggestions.
- `[id]/logs/page.tsx` and `[id]/logs/[logId]/page.tsx` show agent logs.
- `skills/page.tsx` and `skills/[id]/page.tsx` manage the reusable skill catalog.
- `approvals/page.tsx` exposes pending `agentRunApprovals`.

The prompt sandbox lives at `src/app/(dashboard)/app/agentic-testing/page.tsx`. It selects an agent or auto-routes through `api.orchestrator.routeAgentIntent`, creates a chat thread, and sends a message with `dynamicAgentId` when an agent is selected or routed.

## Core Convex Modules

The agent implementation is split across several Convex modules:

- `convex/agents.ts` owns agent list/get/create/update/delete, template creation, readiness checks, activation guards, and internal agent lookup.
- `convex/agentRuntime.ts` and `convex/agentService.ts` execute agent objectives and build the runtime prompt/tool flow.
- `convex/agentRuns.ts` owns run listing, run detail, analytics, run observatory, pending approvals, approval decisions, replay, cancellation, and internal run creation/status updates.
- `convex/agentRunFeedback.ts`, `convex/agentRunReflections.ts`, `convex/agentMemoryCandidates.ts`, `convex/agentMemories.ts`, and `convex/agentImprovementSuggestions.ts` implement learning and review loops.
- `convex/agentEvalFixtures.ts` implements eval fixture CRUD, smoke evals, eval suites, release candidate comparisons, suite presets, and grading context.
- `convex/agentSkills.ts` implements the reusable skill catalog, skill versions, import/export, starter seeding, bindings, rollout analytics, and runtime skill lookup.
- `convex/agentVersions.ts` creates and reads version snapshots.
- `convex/agentTransactions.ts` and `convex/agentLogs.ts` provide dashboard telemetry and log detail.
- `convex/releases.ts` manages release candidates for agents and is surfaced in the agent settings page.

Related systems include `convex/aiModels.ts`, `convex/aiModelService.ts`, `convex/aiTools.ts`, `convex/knowledge.ts`, `convex/knowledgeActions.ts`, `convex/aiRules.ts`, `convex/scheduler.ts`, `convex/workflowRuntime.ts`, and `convex/orchestrator.ts`.

## Data Model

Agent-related schema lives in `convex/schema.ts`.

`agents` stores the configurable worker record. Important fields include name, description, avatar, model id, model selection mode, thinking mode, reasoning effort, internet access, active state, temperature, human approval flag, trigger type, prompt/rule/knowledge ids, schemas, workflow linkage, and release-gate configuration.

`agentRuns` stores each durable run. It records the agent, optional agent version, thread, workflow, schedule, trigger type, objective, status, company/user scope, resolved provider/model data, budgets, token and cost totals, timing, errors, final output, and replay metadata.

`agentRunSteps`, `agentToolCalls`, and `agentRunApprovals` record execution detail. Steps cover observe, plan, model, tool call, tool result, approval request, replan, and final phases. Tool calls carry normalized tool names, handler mappings, redacted arguments, results, required role, side-effect level, and status. Approvals link back to runs, steps, and tool calls and move through pending, approved, rejected, or cancelled states.

`agentRunFeedback`, `agentRunReflections`, `agentMemoryCandidates`, `agentMemories`, `agentMemoryUsage`, and `agentImprovementSuggestions` support the learning loop. Feedback is user-authored. Reflections and candidates capture generated explanations, proposed memories, proposed prompt/tool/eval changes, risk level, review status, and evidence. Active memories are searchable by normalized content and scoped by agent, company, and active state.

`agentEvalFixtures` and `agentEvalSuitePresets` store eval evidence. Fixtures cover happy path, approval pause, rejected action, prompt injection, tenant boundary, bad tool args, cancellation, replayed failure, tool plan, and cost/latency budget scenarios. Suite presets group fixtures and can require model grading.

`agentVersions`, `agentReleases`, `agentSkills`, `agentSkillVersions`, and `agentSkillBindings` support release and skill governance. Version snapshots hash prompt, tool set, skill set, memory revision, rule set, model config, and policy state. Skill bindings snapshot the skill version assigned to an agent so later catalog changes can be detected and upgraded intentionally.

## Authorization And Tenancy

Core agent CRUD in `convex/agents.ts` is super-admin-only through `requireSuperAdmin`. That includes list, paginated list, get, readiness, create, template creation, update, delete, and inline agent creation. This reflects the current product model: global agent configuration is a platform administration function.

Operational modules mix super-admin and company-scoped admin access. `agentRuns`, `agentEvalFixtures`, `agentMemories`, `agentMemoryCandidates`, `agentImprovementSuggestions`, `agentVersions`, `agentTransactions`, and `agentLogs` use `requireAdmin` plus `assertAdminCanAccessCompany` or role-specific filters where records carry a `companyId`. Standard admins without a company id are rejected. Super admins can inspect platform-wide records where the query permits it.

Be careful when adding new agent queries. If the result can include run, tool, approval, memory, eval, or log data, preserve the existing company scope pattern. Do not expose cross-company records through agent id alone. `agentRuns.buildToolCallDetail` only exposes raw arguments to super admins; keep that boundary when adding UI fields around tool call evidence.

## Creation, Templates, And Readiness

`createAgent` creates a global agent with the configured default model for use case `agent` through `resolveDefaultModelIdForUseCase`. `createAgentFromTemplate` loads a template from `convex/agentTemplates.ts`, seeds eval fixtures, binds recommended tools where mappings exist, and writes audit metadata about missing tool mappings and builder intent.

The agent builder in `admin/agents/page.tsx` collects objective, audience, approval policy, model behavior, knowledge plan, tool plan, smoke eval requirement, and readiness acknowledgement. These fields are written as audit metadata and help describe why the agent was created.

`getAgentReadiness` builds readiness evidence used by settings and eval pages. Activation is guarded in `updateAgent`: setting `isActive` to true is blocked unless there is at least one successful smoke eval, the latest smoke eval succeeded, critical release-gate fixtures are not blocking, release-gate policy is configured, and enabled skills are not missing required tool mappings or high-risk skill smoke evidence.

Model changes must go through stored model configuration. Inherit mode resolves the current default for the agent or workflow use case. Override mode calls `assertModelOverrideAllowed` before storing the target model. Avoid hardcoded provider model literals in runtime paths.

## Runtime, Approvals, And Observability

Agent runs can be triggered from chat, manual admin actions, schedules, workflows, webhooks, and events. Internal creation paths in `agentRuns.ts` insert queued runs with trigger metadata and company scope. The runtime records run steps, tool calls, approvals, costs, tokens, final output, and errors.

Approval-sensitive tool calls create `agentRunApprovals` and move the run to `PENDING_APPROVAL`. The approvals page calls `api.agentRuns.decideApproval` with approved, rejected, or cancelled decisions. The mutation checks admin access to the run company, records reviewer metadata, updates the linked tool call, and schedules or records the follow-up behavior for the run.

Run detail and analytics are intentionally operational. `getRunDetail` returns steps, tool calls, approvals, replay runs, timeline, and eval fixtures. `getAnalyticsForAgent` aggregates recent runs, tool calls, approvals, feedback, status distribution, token/cost/runtime metrics, and observability next actions. `getRunObservatory` supplies platform or company-scoped run observatory data for the separate admin observability surface.

Replay is available for failed or cancelled runs. `replayRun` can run the current active agent configuration or the same version snapshot if the source run has one. This is important for regression review: same-version replay isolates provider/runtime variance, while current-active replay tests the latest agent configuration.

## Skills And Learning Loop

Skills are reusable capability packages. A skill has status, risk level, instruction text, required and recommended tool mappings, recommended knowledge, default rules, and suggested eval fixtures. Creating, updating, importing, seeding, cloning, and archiving skills are super-admin actions. Only active skills can be attached to agents.

Bindings store the skill version assigned to an agent. `getForAgent` can be read by company-scoped admins for accessible bindings, while binding changes are super-admin-only. Upgrade mutations create or use the latest skill version snapshot and can seed smoke eval fixtures for high-risk skills.

Learning flows start from runs and reflections. Feedback, failed runs, cancelled runs, approval decisions, tool errors, and missed context can generate reflections, memory candidates, eval fixtures, and improvement suggestions. Review mutations require admin access to the record's company scope. Applying a suggestion can create agent or skill version snapshots, and the review inbox highlights high-risk learning before routine memory approval.

When changing this area, keep generated suggestions reviewable. Do not silently apply prompt, rule, tool-schema, routing, approval-policy, or skill-instruction changes without a review path.

## Releases And Version Snapshots

Agent settings surface release candidate actions through `convex/releases.ts`. Release candidates are backed by `agentVersions` snapshots and `agentReleases`. A snapshot records hashes for prompt, tools, skills, memories, rules, model config, and policy so reviewers can compare what changed.

The settings UI shows latest release state, evidence summaries, activation windows, snapshot comparisons, and actions such as create candidate, approve, activate, cancel, and rollback. Release gates can be configured by tags or eval suite presets, and suite presets may require model grading. Activation guard logic in `agents.ts` should stay aligned with release-gate evidence generated in `agentEvalFixtures.ts` and release summaries in `releases.ts`.

## UI And Validation Notes

Agent admin pages use shared admin components for tables, load-more footers, save controls, modals, and detail layouts. Keep the 15-row admin pagination standard by using `ADMIN_PAGE_SIZE` for agent tables and review queues unless there is a specific product requirement.

Avoid native browser dialogs. Existing pages use `SonaeModal`, `AdminConfirmationModal`, inline feedback banners, and admin save controls. Keep locale parity for any user-visible text in `messages/en.json` and `messages/it.json`; some newer agent screens still contain inline English text, so prefer reducing drift when touching those files.

Avatar uploads in the settings page use `api.users.generateUploadUrl`, `validateUploadFile`, `validateStoredUpload`, and image metadata validation before storing the resolved URL. Do not bypass upload policy when adding new agent media fields.

## Verification

Relevant focused tests include:

- `convex/agents.test.ts`, `convex/agentService.test.ts`, and `convex/agentRuntimeService.test.ts`.
- `convex/agentRuns.test.ts`, `convex/agentRunFeedback.test.ts`, `convex/agentRunReflections.test.ts`, and `convex/agentLogs.test.ts`.
- `convex/agentMemoryCandidates.test.ts`, `convex/agentMemories.test.ts`, and `convex/agentImprovementSuggestions.test.ts`.
- `convex/agentEvalFixtures.test.ts`, `convex/agentEvalGradingActions.ts`, and related runtime tests.
- `convex/agentSkills.test.ts`, `convex/agentVersions.test.ts`, and `convex/agentTransactions.test.ts`.
- UI tests under `src/app/(dashboard)/admin/agents/**`.
- `src/app/(dashboard)/app/agentic-testing/page.tsx` should be manually checked when changing sandbox routing or chat handoff.

For documentation-only changes, at minimum run `git diff --check`. Before merging code changes in this area, follow the full gate in `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

The movement demo freeze does not apply to the agent implementation, but it shares the dashboard shell. Do not touch frozen movement files while working on agents unless the user explicitly reopens that area.
