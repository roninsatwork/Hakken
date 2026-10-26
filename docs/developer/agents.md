---
product: Hakken
documentation_type: developer guide
feature_area: agent configuration and core runtime
audience: platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/agents.md
last_reviewed: '2026-10-26T15:14:20+00:00'
reviewed_against: current implementation
status: Current
---
# Agents Developer Guide

> **Product:** Hakken · **Document type:** developer guide · **Feature area:** agent configuration and core runtime
> **Reviewed:** 26 October 2026, 15:14:20 GMT (Europe/London)
> **Source path:** `docs/developer/agents.md` · **Status:** Current


Core configuration/runtime and approval behavior were revalidated in this pass. Detailed skill, learning, eval and release sections remain separate review work; this document is not a claim that those whole subsystems are current.

Agents are Hakken's governed AI worker implementation. The current system covers global agent configuration, template-based creation, reusable skills, tool and knowledge bindings, run telemetry, approvals, eval fixtures, release gates, version snapshots, memories, reflections, improvement suggestions, logs, and a sandbox prompt surface. This document describes the implementation that exists now and should be reviewed before changing agent runtime, admin UI, skills, evals, approvals, or release behavior.

## Product Surface

The admin routes are under `src/app/(dashboard)/admin/agents/`:

- `src/app/(dashboard)/admin/agents/page.tsx` lists agents, searches with paginated Convex results, opens `/admin/agents/new` for creation and offers permitted deletion actions. The new page uses shared settings form sections; the backend retains separate template creation support.
- `src/app/(dashboard)/admin/agents/[id]/layout.tsx` renders the agent detail shell and tabs. It also exposes the `Run Agent`/`Stop Agent` action. `Run Agent` calls `api.scheduler.manualRunSchedule`; if the agent has no `standingObjective`, the UI asks for a one-off objective before starting.
- `src/app/(dashboard)/admin/agents/[id]/page.tsx` shows transaction summary metrics and recent transactions.
- `src/app/(dashboard)/admin/agents/[id]/runs/page.tsx` shows run analytics, run lists, run details, replay, cancellation, feedback, reflections, memory candidate generation, eval creation, eval suite execution, and improvement suggestions.
- `src/app/(dashboard)/admin/agents/[id]/evals/page.tsx` manages checks, smoke evals, suite presets, and release evidence and configured critical checks; these reports do not block activation.
- `src/app/(dashboard)/admin/agents/[id]/settings/page.tsx` manages name, description, avatar upload, model mode, reasoning effort, internet access, and the draft/live switch.
- `src/app/(dashboard)/admin/agents/[id]/skills/page.tsx` attaches, upgrades, enables, disables, and removes skills for one agent.
- `src/app/(dashboard)/admin/agents/[id]/knowledge/page.tsx`, `src/app/(dashboard)/admin/agents/[id]/system-prompt/page.tsx`, `src/app/(dashboard)/admin/agents/[id]/rules/page.tsx`, `src/app/(dashboard)/admin/agents/[id]/rules/new/page.tsx`, `src/app/(dashboard)/admin/agents/[id]/rules/[ruleId]/page.tsx`, and `src/app/(dashboard)/admin/agents/[id]/interfaces/page.tsx` configure the agent's context, standing job, behavior prompt, governance, tools, and answer shape.
- `src/app/(dashboard)/admin/agents/[id]/memory/page.tsx` reviews memories, memory quality, memory candidates, reflections, and improvement suggestions.
- `src/app/(dashboard)/admin/agents/[id]/logs/page.tsx` and `src/app/(dashboard)/admin/agents/[id]/logs/[logId]/page.tsx` show agent logs.
- `src/app/(dashboard)/admin/agents/skills/page.tsx` and `src/app/(dashboard)/admin/ai/skills/page.tsx` manage the reusable skill catalog. Skill detail and edit controls currently live inside the Skill Center surface rather than a separate skill-detail route.
- `src/app/(dashboard)/admin/governance/approvals/page.tsx` exposes pending `agentRunApprovals` from the Governance section.

The prompt sandbox lives at `src/app/(dashboard)/app/agentic-testing/page.tsx`. It selects an agent or auto-routes through `api.orchestrator.routeAgentIntent`, creates a chat thread, and sends a message with `dynamicAgentId` when an agent is selected or routed.

## Core Convex Modules

The agent implementation is split across several Convex modules:

- `convex/agents.ts` owns agent list/get/create/update/delete, template creation, readiness reports, model/risk policy, and internal agent lookup, with the record-building and audit-metadata helpers behind it in `convex/agentService.ts`.
- `convex/agentRuntime.ts` holds the internal actions that start and resume a run: objectives, triggered objectives, chat responses, approval resume and refusal, and the workflow agent node. Each hands off to `convex/agentObjectiveLoop.ts`, which builds the run's tools and knowledge, walks the model/tool conversation, settles parallel tool batches, and finalizes failures. Per-turn helpers — tool argument and result parsing, the autonomy and confirmation rules, cost, and approval messages — live in `convex/agentRuntimeTurnService.ts`.
- `convex/agentRuns.ts` owns run listing, run detail, analytics, run observatory, replay, cancellation, and internal run creation/status updates.
- `convex/agentRunApprovals.ts` owns pending approval reads, decisions, expiry, result settlement and continuation handoff.
- `convex/agentRunFeedback.ts`, `convex/agentRunReflections.ts`, `convex/agentMemoryCandidates.ts`, `convex/agentMemories.ts`, and `convex/agentImprovementSuggestions.ts` implement learning and review loops.
- `convex/agentEvalFixtures.ts` implements check CRUD, smoke evals, eval suites, suite presets, and grading context.
- `convex/agentSkills.ts` implements the reusable skill catalog, skill versions, import/export, starter seeding, bindings, rollout analytics, and runtime skill lookup.
- `convex/agentVersions.ts` creates and reads version snapshots.
- `convex/agentTransactions.ts` and `convex/agentLogs.ts` provide dashboard telemetry and log detail.
- `convex/modelSpend.ts` is how every AI model call writes its cost row (2026-10-09): priced from the model catalogue, charged to the agent the call worked for, else its system agent by key, else the **Platform AI** agent (made on first use) — never dropped. A new model call records through `recordModelSpend` (actions) or `writeModelSpend` (mutations); `generationSpend` takes a resolved model and a response's tokens. An agent run writes one row when it ends: the loop's close, a stop, or `chargeEndedRun` for a run that failed, or was cancelled or expired while waiting for approval. Live voice is charged to the Assistant: the relay sends Google's token counts with its close signal, and the browser's direct OpenAI session reports each reply's. Decisions keep their cost on `decisionRuns`.

Related systems include `convex/aiModels.ts`, `convex/aiModelService.ts`, `convex/aiTools.ts`, `convex/knowledge.ts`, `convex/knowledgeActions.ts`, `convex/aiRules.ts`, `convex/scheduler.ts`, `convex/workflowRuntime.ts`, and `convex/orchestrator.ts`.

## Data Model

Agent-related schema lives in `convex/schema.ts`.

`agents` stores the configurable worker record. Important fields include name, description, optional company scope, avatar, model id, model selection mode, thinking mode, reasoning effort, internet access, active state, temperature, human approval flag, autonomous tool flag, run limits, trigger type, `systemPrompt`, optional `standingObjective`, rule/knowledge ids, schemas, workflow linkage, and release-gate configuration.

`agentRuns` stores each durable run. It records the agent, optional agent version, thread, workflow, schedule, trigger type, objective, status, company/user scope, resolved provider/model data, budgets, token and cost totals, timing, errors, final output, and replay metadata.

`agentRunSteps`, `agentToolCalls`, and `agentRunApprovals` record execution detail. Steps cover observe, plan, model, tool call, tool result, approval request, replan, and final phases. Tool calls carry normalized tool names, handler mappings, redacted arguments, results, required role, side-effect level, and status. Approvals link back to runs, steps, and tool calls and move through pending, approved, rejected, cancelled or expired states.

`agentRunFeedback`, `agentRunReflections`, `agentMemoryCandidates`, `agentMemories`, `agentMemoryUsage`, and `agentImprovementSuggestions` support the learning loop. Feedback is user-authored. Reflections and candidates capture generated explanations, proposed memories, proposed prompt/tool/eval changes, risk level, review status, and evidence. Active memories are searchable by normalized content and scoped by agent, company, and active state.

`agentEvalFixtures` and `agentEvalSuitePresets` store eval evidence. Fixtures cover happy path, approval pause, rejected action, prompt injection, tenant boundary, bad tool args, cancellation, replayed failure, tool plan, and cost/latency budget scenarios. Suite presets group fixtures and can require model grading.

`agentVersions`, `agentSkills`, `agentSkillVersions`, and `agentSkillBindings` support version and skill governance. Version snapshots hash prompt, tool set, skill set, memory revision, rule set, model config, and policy state. Skill bindings snapshot the skill version assigned to an agent so later catalog changes can be detected and upgraded intentionally.

## Authorization And Tenancy

Core agent list/get and catalog reads use `superAdminQuery`, admitting `SUPER_ADMIN` and `READ_ONLY`; core writes use `superAdminMutation`, admitting only super admins. Readiness is an `adminQuery` with explicit company policy. Do not infer identical roles from the feature name or from page visibility.

Run detail, replay and cancellation enforce `assertAdminCanAccessCompany` on the run. Company-scoped readers and platform-wide readers are not interchangeable: a handler can narrow an oversight account to its attached company. Approval listing/count use `superAdminQuery`; `decideApproval` is a super-admin mutation. Company admins cannot decide it merely because the run belongs to their company. Related memory/eval/skill modules require their own boundary review, tracked separately from this core refresh.

Be careful when adding new agent queries. If the result can include run, tool, approval, memory, eval, or log data, preserve the existing company scope pattern. Do not expose cross-company records through agent id alone, and do not treat a company-scoped agent as callable from another tenant's public trigger path. `agentRuns.buildToolCallDetail` only exposes raw arguments to super admins; keep that boundary when adding UI fields around tool call evidence.

## Creation, Templates, And Readiness

`createAgent` creates a global agent with the configured default model for use case `agent` through `resolveDefaultModelIdForUseCase`. `createAgentFromTemplate` loads a template from `convex/agentTemplates.ts`, seeds eval fixtures, binds recommended tools where mappings exist, and writes audit metadata about missing tool mappings and builder intent.

The dedicated `admin/agents/new/page.tsx` submits name, description, owner, optional risk, model mode, autonomy, approval expiry, budgets, active state and assignable role. `assertPurposeAndOwner` requires purpose and an existing accountable owner for custom creation. Draft is the default, but explicit active creation is allowed. Avatar storage IDs require an owned upload reservation and image validation.

`getAgentReadiness` computes informational checks from bounded recent evidence. `BLOCKING_READINESS_CHECK_KEYS` classifies model, skill, model-graded smoke and release-gate warnings for reporting; `updateAgent` no longer uses them to refuse `isActive: true`. A successful contract-only check is not model evidence. Invalid model overrides, invalid presets and high-risk autonomous execution are still separately refused. Do not restore the old activation-gate description from the constant's name or historical comments.

Model changes must go through stored model configuration. Inherit mode resolves the current default for the agent or workflow use case. Override mode calls `assertModelOverrideAllowed` before storing the target model. Current agent runtime execution uses the provider adapter registry, with adapters for Google Vertex, Anthropic, OpenAI, and OpenRouter. The same provider-capability list is used by model-default validation so selectors should not offer agent or workflow models the runtime cannot call. Google Search grounding remains a narrower Vertex-only capability: a workflow agent with internet access still needs a compatible Vertex model. Avoid hardcoded provider model literals in runtime paths, and keep adapter support, model-picker filtering, and default validation in sync.

## Runtime, Approvals, And Observability

Agent runs can be triggered from chat, manual admin actions, schedules, workflows, webhooks, and events. Internal creation paths in `agentRuns.ts` insert queued runs with trigger metadata and company scope. The runtime records run steps, tool calls, approvals, costs, tokens, final output, and errors.

Approval-sensitive tool calls create `agentRunApprovals` and move the run to `PENDING_APPROVAL`. The approvals page calls `api.agentRunApprovals.decideApproval` with approved, rejected, or cancelled decisions. The mutation requires a super admin, rejects missing/already-reviewed/expired requests, writes reviewer metadata and `AGENT_APPROVAL_*` audit evidence, and updates the linked tool call. Approval schedules `resumeApprovedToolCall`; other pending approvals keep the run parked. Rejection records a denied tool and refusal result, remembers the refused request and schedules continuation when settlement permits. Cancellation concludes the run and clears its parked position. A decision is not evidence that an external action succeeded.

Run detail and analytics are intentionally operational. `getRunDetail` returns steps, tool calls, approvals, replay runs, timeline, and eval fixtures. `getAnalyticsForAgent` aggregates recent runs, tool calls, approvals, feedback, status distribution, token/cost/runtime metrics, and observability next actions. `getRunObservatory` supplies platform or company-scoped run observatory data for the separate admin observability surface.

Replay is available for failed or cancelled runs. `replayRun` can run the current active agent configuration or the same version snapshot if the source run has one. This is important for regression review: same-version replay isolates provider/runtime variance, while current-active replay tests the latest agent configuration.

## Skills And Learning Loop

Skills are reusable capability packages. A skill has status, risk level, instruction text, required and recommended tool mappings, recommended knowledge, default rules, and suggested eval fixtures. Creating, updating, importing, seeding, cloning, and archiving skills are super-admin actions. Only active skills can be attached to agents.

Bindings store the skill version assigned to an agent. `getForAgent` can be read by company-scoped admins for accessible bindings, while binding changes are super-admin-only. Upgrade mutations create or use the latest skill version snapshot and can seed smoke eval fixtures for high-risk skills.

Learning flows start from runs, assistant-message feedback, and reflections. Feedback, failed runs, cancelled runs, approval decisions, tool errors, and missed context can generate reflections, memory candidates, eval fixtures, and improvement suggestions. Review mutations require admin access to the record's company scope. Applying a non-memory suggestion can create agent or skill version snapshots. Memory candidates auto-apply only when `SELF_IMPROVEMENT_CONFIG.autonomousMemory` is enabled and the safety, duplicate, and prior-rejection checks pass; those memories are labelled, audited, and removable. Otherwise the review inbox owns approval and rejection.

When changing this area, keep generated suggestions reviewable. Do not silently apply prompt, rule, tool-schema, routing, approval-policy, or skill-instruction changes without a review path.

## Version Snapshots And Readiness Reports

`agentVersions` records a snapshot per agent, hashing prompt, tools, skills, memories, rules, model config, and policy, so a check result can be tied to the exact agent that produced it.

The current `updateAgent` deliberately leaves readiness as warnings. Operators decide whether to activate an untested agent. Check fixtures selected by tags or preset still provide evidence, and high-risk skill tool/eval gaps still affect readiness reporting. Those reports must not be confused with runtime approval policy or model validation. Detailed version/release/learning workflows are recorded as follow-up coverage rather than fully revalidated here.

## UI And Validation Notes

Agent admin pages use shared admin components for tables, load-more footers, save controls, modals, and detail layouts. Keep the 15-row admin pagination standard by using `ADMIN_PAGE_SIZE` for agent tables and review queues unless there is a specific product requirement.

Avoid native browser dialogs. Existing pages use `HakkenModal`, `AdminConfirmationModal`, inline feedback banners, and admin save controls. Keep locale parity for any user-visible text in `messages/en.json` and `messages/it.json`; some newer agent screens still contain inline English text, so prefer reducing drift when touching those files.

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

This documentation refresh inspected focused test sources for agents, provider registry, risk, roles, approvals and continuation; it did not run them or call a model. Use current AGENTS.md gates for implementation changes rather than a copied shortened list.

## Role Identity And Destructive Operations

`utils/agentRoles.ts` is the shared assignable-role vocabulary. `agentRoles.ts:applyAgentRole` stores `systemKey`, refuses a fixed built-in role change, checks `by_system_key` for another holder and audits `SET_AGENT_ROLE`. Role-holder summaries read at most one hundred indexed rows. Specialized workers resolve this key rather than agent names. DataForSEO, research, News/digest, Search Console, Analytics, Bing and Insights jobs are assignable; Wiki and Decisions keys are fixed. Review the relevant worker guide before treating a general runtime setting as applicable to its specialized path.

`deleteAgent` refuses any record with a system key, deletes at most 250 tool bindings, deletes the agent and writes `DELETE_AGENT`. It does not implement a full historical run/log/version purge. Do not describe deleting configuration as complete evidence erasure. Assignable roles can first be cleared to General agent; built-in keys cannot be cleared through the role setter.

`updateAgent` clamps budget overrides and expiry before storage. Clearing a positive-budget field removes its override; omitted fields preserve existing values. High-risk autonomy is refused when explicitly requested. Raising risk to high on an already autonomous record forces autonomy false and emits `UPDATE_AGENT_RISK` with the before/after rating and gate effect. Saving a DataForSEO Collector configuration also schedules `sendIfWaiting`, so configuration changes can have downstream job consequences.

## Durable Run And Budget Boundaries

`agentRuntime.ts` starts objectives and triggered runs, resumes active checkpoints, handles approval settlement and executes workflow agent nodes. Provider selection uses `agentProviderRegistry.ts`. Model identifiers come from resolved stored configuration. The provider adapter contract is distinct from the text-only assistant provider registry, and TypeSafe is explicitly rejected as an agent provider.

`agentRuntimeService.ts` defines priced-run defaults of twenty-five steps, twenty-five tool calls, thirty minutes, one million input tokens, one hundred thousand output tokens and ten US dollars of configured cost. Unpriced models use four steps, three tool calls, two minutes, two hundred thousand input tokens, twenty thousand output tokens and a one-dollar nominal cost bound. Hard ceilings limit overrides; these figures are runtime accounting controls rather than reconciled provider billing. Output-token totals are bounded even though the editable override list does not include an output-token field.

The continuation service checkpoints between model turns after a three-minute segment budget, with a thirty-segment backstop. The stall threshold is twelve minutes, deliberately beyond the ten-minute expected action lifetime, and permits at most three revivals. Checkpoints cap serialized transcripts at four hundred thousand characters, trimming oldest turns while avoiding leading orphan tool results. A single oversized turn can still be unstorable. Cancellation is observed at loop boundaries and cannot synchronously undo an in-flight provider call or completed external tool.

Approval expiry resolves an agent override, then platform config under `APPROVAL_EXPIRY_CONFIG`, then the twenty-four-hour default. Valid windows are one to seven hundred twenty hours. The expiry sweep cancels runs and clears parked checkpoints; it does not grant permission. None of these recovery controls is proof of exactly-once external effects. Inspect the tool's own idempotency contract when retries or replays can write externally.

## Detailed configuration and operations coverage

Use [Agent configuration and catalogs](./agent-configuration-and-catalogs.md) for skills/import/binding behavior and [Agent runtime operations](./agent-runtime-operations.md) for learning, evals, versions and release evidence. The detailed review found runtime-current skill text despite retained version pointers, bounded autonomous memory behavior and real model-graded evaluation effects; read those contracts before treating a readiness label as a safety guarantee.
