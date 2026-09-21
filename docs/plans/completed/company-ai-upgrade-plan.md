> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Company AI Upgrade Plan

This plan defines how Hakken should turn the company AI workspace into a first-class company intelligence layer with knowledge, memory, skills, evals, readiness gates, and observability.

This is a planning document only. Do not implement this work unless the user explicitly asks to move from planning into coding.

Related plan:

- [Company Workspace AI Navigation Plan](./company-workspace-ai-navigation-plan.md)

Index keywords: company AI, company brain, company memory, company skills, company evals, AI readiness, company knowledge, tenant-scoped AI, widget readiness, company runtime context.

## Goal

The company AI area currently acts mostly as configuration and knowledge management. It should become the shared intelligence layer that company chat, widgets, agents, workflows, and future app kits inherit from.

The target product claim is:

> Hakken can prove a company's AI is ready because its knowledge, memories, skills, rules, models, and public surfaces pass company-specific evals before they are used in production.

The upgraded workspace should answer five questions:

1. What does this company know?
2. What does this company remember?
3. What can this company's AI do?
4. What rules and models govern it?
5. How do we know it is ready?

## Product Definition

The company AI workspace should become the company's AI operating system.

Company-level AI is not a replacement for agents. Agents remain specialist workers. Company AI becomes the shared substrate they draw from:

- company knowledge,
- approved company memory,
- approved company skills,
- company prompts and rules,
- company model defaults,
- company eval suites,
- readiness and drift signals,
- company-scoped observability.

## Current Code Position

### Already Present

Build on these existing foundations instead of rebuilding them:

- `src/app/(dashboard)/admin/companies/[id]/ai/**`: company AI shell, landing page, knowledge, prompt, rules, models, and chat logs.
- `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx`: shared knowledge manager for global, company, and agent scopes.
- `convex/knowledge.ts` and `convex/knowledgeActions.ts`: knowledge document storage, chunking, retrieval tests, website ingestion, repairs, and tenant-scoped access.
- `convex/aiRules.ts`: global, company, and agent AI rules.
- `convex/aiModels.ts` and `convex/aiModelService.ts`: use-case model defaults and company overrides.
- `convex/chatAdmin.ts`, `convex/chat.ts`, and `convex/analytics.ts`: chat logs, messages, thread metadata, usage, and cost attribution.
- `convex/agentMemories.ts`, `convex/agentMemoryCandidates.ts`, `convex/agentEvalFixtures.ts`, and related agent modules: existing patterns for governed agent memory and evals.
- `docs/plans/active/agent-skills-development-plan.md`: planned reusable skill system for agents.

### Missing

These concepts are not yet first-class company AI objects:

- Company memory.
- Company memory candidates and approval workflow.
- Company skills or company skill bindings.
- Company eval suites and eval cases.
- Company AI readiness score.
- Drift detection when knowledge, memory, rules, models, or skills change.
- A context preview showing what the runtime would actually use.
- Readiness gates for widgets, company chat, workflow use, and agent inheritance.

## Non-Drift Rules

- Preserve tenant isolation in every query, mutation, action, eval run, memory read, skill binding, and readiness result.
- Non-super-admin access must remain scoped by company.
- Company memory is governed configuration, not untrusted retrieved knowledge.
- Company skills are governed capability packages, not loose prompt snippets.
- Runtime tool execution must still pass backend authorization checks; skill requirements do not grant permission.
- Resolve models from stored company/global configuration. Do not hardcode model literals in runtime paths.
- Keep English and Italian locale dictionaries in parity for any user-facing UI.
- Administrative tables and feeds should use 15 rows per page unless a specific product requirement says otherwise.
- Do not touch the frozen movement demo while implementing this plan.

## Proposed Workspace Navigation

This plan assumes the company AI navigation is or will be consolidated under a single `AI` parent tab.

Recommended submenu order:

1. `Overview`
2. `Knowledge`
3. `Memory`
4. `Skills`
5. `Instructions`
6. `Models`
7. `Evals`
8. `Activity`

Rationale:

- `Overview` answers whether the company AI is ready.
- `Knowledge` remains the source material layer.
- `Memory` stores approved durable facts and preferences.
- `Skills` stores reusable capability packages.
- `Instructions` groups company prompt and AI rules.
- `Models` controls configured model routing.
- `Evals` proves readiness.
- `Activity` provides evidence and audit trails.

## Company Memory

Company memory should be separate from agent memory. Agent memory is worker-specific. Company memory is shared context that can be used by company chat, widgets, workflows, and selected agents.

Examples:

- Company positioning.
- Preferred tone and terminology.
- Known customer objections.
- Product/service facts that should be used consistently.
- Sales qualification preferences.
- Support escalation preferences.
- Public widget answer boundaries.
- Things the company has explicitly rejected or wants avoided.

### Memory Lifecycle

Recommended statuses:

- `SUGGESTED`: AI or admin proposed the memory.
- `APPROVED`: memory is available to runtime.
- `ARCHIVED`: retained but no longer active.
- `REJECTED`: explicitly not to be learned or suggested again.

Memory should always preserve evidence:

- source type: chat, widget, knowledge, manual, eval, agent run, workflow run,
- source ids where available,
- proposed by,
- approved/rejected by,
- created and updated timestamps,
- usage count and last used timestamp.

### Memory Runtime Behavior

Approved company memory should be loaded after configured instructions and before untrusted retrieved knowledge.

Prompt assembly order should be:

1. Platform safety contract.
2. Company prompt and company rules.
3. Surface-specific behavior, such as widget or agent instructions.
4. Approved company memory.
5. Approved agent memory, when running an agent.
6. Retrieved knowledge and uploaded file context as untrusted reference data.
7. User request.

Memory should never grant data access or override tenant isolation.

## Company Skills

Company skills should be reusable capabilities available at company scope. Agents can inherit them, but skills can also power company chat, widgets, workflows, and app-kit experiences.

Examples:

- Website audit.
- Lead qualification.
- Proposal drafting.
- Support triage.
- Competitor comparison.
- Brand voice rewriting.
- CRM enrichment.
- Meeting follow-up.
- Compliance check.
- Knowledge gap analysis.

### Skill Definition

Each company skill should include:

- name,
- description,
- category,
- status,
- risk level,
- instructions,
- input contract,
- output contract,
- required tools/connectors,
- recommended knowledge scopes,
- required approval behavior,
- eval cases,
- assigned agents or surfaces,
- version metadata.

Company skills should reuse the eventual agent skill primitives where possible. Avoid building a parallel skill system unless the agent skill work cannot satisfy company scope.

## Company Evals

Company evals should be the proof layer for readiness. They should test the company AI against the behavior the business expects.

### Eval Categories

Required categories:

- `KNOWLEDGE_RETRIEVAL`: verifies correct source retrieval and grounded answers.
- `MEMORY_USAGE`: verifies approved memories are used correctly.
- `RULE_COMPLIANCE`: verifies company rules and refusals.
- `BRAND_TONE`: verifies preferred voice and format.
- `SKILL_ROUTING`: verifies expected skill/tool selection.
- `MODEL_ROUTING`: verifies configured use-case model resolution.
- `NO_HALLUCINATION`: verifies unknowns are handled honestly.
- `TENANT_ISOLATION`: verifies cross-company data is not exposed.
- `WIDGET_READINESS`: verifies public-facing answer behavior.
- `AGENT_INHERITANCE`: verifies selected agents use inherited company context correctly.

### Eval Case Shape

Each eval case should store:

- company id,
- name,
- category,
- severity: `BLOCKER | WARNING | ADVISORY`,
- target surface: `COMPANY_CHAT | WIDGET | AGENT | WORKFLOW | APP_KIT`,
- prompt,
- optional fixture context,
- expected behavior,
- required source ids or source patterns,
- required memory ids,
- forbidden claims,
- required skill ids,
- forbidden skill ids,
- expected model use case,
- expected output format,
- deterministic assertions,
- judge rubric,
- status,
- last run id,
- created and updated metadata.

### Eval Run Evidence

Each eval run should record:

- prompt,
- final answer,
- retrieved knowledge ids and chunk ids,
- memories considered and used,
- skills selected,
- tools requested and tools executed,
- resolved model and use case,
- rule ids applied,
- deterministic assertion results,
- judge score and notes,
- pass/fail status,
- token and cost metadata,
- run timestamp.

Pass/fail must not rely only on vibes. Use deterministic checks first, then an LLM judge where qualitative judgment is genuinely needed.

## Readiness Score

The company AI overview should show a readiness score composed from:

- knowledge health,
- memory health,
- skill readiness,
- eval pass rate,
- blocker eval status,
- model configuration completeness,
- rule/prompt completeness,
- widget readiness,
- drift status.

Suggested readiness states:

- `NOT_READY`: blocker gaps exist.
- `NEEDS_REVIEW`: warnings or stale evals exist.
- `READY`: blocker evals pass and no critical drift exists.
- `DRIFTED`: previously ready state is stale after relevant changes.

Readiness should explain itself. A score without evidence will not create operator trust.

## Drift Detection

Relevant changes should mark affected evals and readiness areas stale:

- Knowledge document created, deleted, repaired, or reingested.
- Knowledge chunks changed.
- Company prompt changed.
- Company rules changed.
- Company model defaults changed.
- Company memory approved, edited, archived, or rejected.
- Company skill changed or rebound.
- Widget configuration changed.
- Agent inheritance configuration changed.

Drift should not block all work automatically. It should identify which evals need rerunning and which surfaces are now less trusted.

## Context Preview

Add an AI context preview panel for company AI and inherited agent surfaces.

The preview should show:

- resolved company prompt,
- active company rules,
- active company memories,
- retrieved knowledge for a test query,
- available skills,
- selected model use case and resolved model,
- expected widget/agent overrides,
- blocked or missing capabilities.

This is a trust feature. It lets admins understand what the AI will actually see before they expose it to users.

## Recommended Data Model

The final schema should be confirmed during implementation, but likely tables include:

### `companyMemories`

Stores approved and governed company memory.

Fields:

- `companyId`
- `title`
- `content`
- `category`
- `status`
- `confidence`
- `sourceType`
- `sourceIdsJson`
- `rejectedFingerprint`
- `createdBy`
- `approvedBy`
- `createdAt`
- `updatedAt`
- `lastUsedAt`
- `usageCount`

Indexes:

- `by_company_status_updated`
- `by_company_category_status`
- `by_company_rejected_fingerprint`

### `companyMemoryCandidates`

Stores proposed memories awaiting review.

Fields:

- `companyId`
- `content`
- `category`
- `sourceType`
- `sourceIdsJson`
- `reason`
- `confidence`
- `status`
- `createdAt`
- `reviewedBy`
- `reviewedAt`

Indexes:

- `by_company_status_created`
- `by_company_source`

### `companySkills`

Stores company-scoped skill catalog entries or company-specific overlays on reusable skills.

Fields:

- `companyId`
- `name`
- `description`
- `category`
- `status`
- `riskLevel`
- `instruction`
- `inputContractJson`
- `outputContractJson`
- `requiredToolsJson`
- `approvalPolicyJson`
- `createdBy`
- `createdAt`
- `updatedAt`

Indexes:

- `by_company_status_updated`
- `by_company_category_status`

### `companySkillBindings`

Stores skill availability by surface.

Fields:

- `companyId`
- `skillId`
- `surfaceType`
- `surfaceId`
- `isEnabled`
- `assignedBy`
- `assignedAt`
- `updatedAt`

Indexes:

- `by_company_surface_enabled`
- `by_company_skill_enabled`

### `companyEvalCases`

Stores editable eval cases.

Fields:

- `companyId`
- `name`
- `category`
- `severity`
- `targetSurface`
- `targetId`
- `prompt`
- `fixtureContextJson`
- `expectedBehavior`
- `requiredSourcesJson`
- `requiredMemoriesJson`
- `requiredSkillsJson`
- `forbiddenClaimsJson`
- `expectedModelUseCase`
- `judgeRubric`
- `status`
- `lastRunId`
- `createdBy`
- `createdAt`
- `updatedAt`

Indexes:

- `by_company_status_updated`
- `by_company_category_status`
- `by_company_surface`

### `companyEvalRuns`

Stores eval run evidence.

Fields:

- `companyId`
- `evalCaseId`
- `status`
- `score`
- `answer`
- `evidenceJson`
- `resolvedModelId`
- `resolvedUseCase`
- `tokenUsageJson`
- `costJson`
- `judgeNotes`
- `startedAt`
- `completedAt`

Indexes:

- `by_company_completed`
- `by_case_completed`
- `by_company_status_completed`

## Implementation Plan

### Phase 1: Company AI Overview And Readiness Skeleton

Build:

- Add an `Overview` page under company AI.
- Show current knowledge counts, prompt/rule/model completeness, widget status, and chat-log activity.
- Add placeholder readiness cards for memory, skills, evals, and drift.
- Link to existing knowledge, prompt, rules, models, widget, and chat logs.

Acceptance:

- Existing AI pages remain reachable.
- The overview explains current company AI health without requiring new runtime behavior.
- No tenant boundary changes.

### Phase 2: Company Memory Foundation

Build:

- Add `companyMemories` and `companyMemoryCandidates`.
- Add Convex CRUD/review APIs with company-scoped authorization.
- Add memory list, review, create, edit, archive, and reject UI.
- Add audit logs for approvals, edits, archive, and rejection.
- Add deterministic tests for tenant isolation, status transitions, rejected fingerprint behavior, and pagination.

Acceptance:

- Admins can manually create approved company memories.
- Admins can approve/reject memory candidates.
- Rejected memories are not suggested again when they match the rejected fingerprint.
- Company memory is not yet injected into runtime until Phase 3.

### Phase 3: Company Memory Runtime Integration

Build:

- Add company memory retrieval to company chat and widget runtime.
- Add opt-in company memory inheritance for agents.
- Add evidence metadata showing which memories were used.
- Add a context preview panel for memory and rules.
- Add memory usage counters.

Acceptance:

- Approved memory influences answers.
- Archived and rejected memory does not influence answers.
- Runtime evidence can show memories used.
- Agent inheritance is explicit, not automatic for every agent.

### Phase 4: Company Skills Foundation

Build:

- Decide whether company skills reuse the agent skills data model directly or use company-specific overlays.
- Add company skill catalog UI.
- Add skill detail, version/evidence, required tools, approval policy, and target surfaces.
- Add skill bindings for widget, company chat, workflows, app kits, and agents.

Acceptance:

- Admins can define a company skill and bind it to a surface.
- Skill binding does not grant tool permissions by itself.
- Missing tool requirements appear in readiness.

### Phase 5: Company Evals Foundation

Build:

- Add eval case and eval run tables.
- Add CRUD UI for eval cases.
- Add run single eval and run all evals.
- Add deterministic checks for required sources, required memories, forbidden claims, required skills, and expected model use case.
- Add LLM judge for qualitative rubric checks.
- Add run evidence drawer.

Acceptance:

- Admins can create and run company evals.
- Eval evidence shows retrieved knowledge, memory, skills, model, and rules.
- Blocker eval failures appear on the overview.

### Phase 6: Readiness Gates And Drift

Build:

- Add readiness score calculation.
- Mark evals stale when knowledge, memory, rules, models, widget config, or skills change.
- Add gate checks for widget readiness and agent company-skill inheritance.
- Add `Run changed only`.
- Add readiness history.

Acceptance:

- Company readiness changes from evidence, not manual optimism.
- Widget readiness can be blocked by public-facing blocker evals.
- Agent inheritance can be blocked by failed skill evals.
- Operators can see why readiness changed.

### Phase 7: Learning Loop From Evidence

Build:

- Add `Create memory candidate from chat`.
- Add `Create eval from chat`.
- Add `Create eval from failed answer`.
- Add suggestions for missing knowledge, weak memories, weak rules, and failing skill coverage.
- Add admin review flow for AI-generated suggestions.

Acceptance:

- Chat and widget failures can become durable evals.
- Repeated good answers can become candidate memories.
- Suggestions require admin approval before changing runtime behavior.

## MVP Recommendation

The smallest valuable implementation slice is:

1. Company AI overview.
2. Manual company memory.
3. Memory runtime evidence in company chat/widget.
4. Manual eval creation.
5. Run single eval / run all.
6. Readiness score based on blocker evals and stale status.

Do not start with automatic memory extraction. Manual memory plus evals gives operators control and creates the evidence loop without over-automating too early.

## Verification Strategy

For documentation-only changes:

```bash
git diff --check
```

For implementation phases, run the repo gate from `AGENTS.md` before asking to merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

Add focused tests for each phase:

- Convex authorization and tenant isolation tests.
- Memory status transition tests.
- Runtime prompt assembly tests.
- Skill binding and missing requirement tests.
- Eval deterministic assertion tests.
- Readiness calculation tests.
- UI tests for 15-row pagination, filtering, evidence drawers, and stale status.
- Locale parity tests for new admin UI strings.

## Open Questions

- Should company skills be implemented as first-class company tables or as scoped bindings on a shared skill catalog?
- Should company memory be globally available to all company chat surfaces by default, or opt-in per surface?
- Which surfaces get hard readiness gates first: widget, agents, workflows, or app kits?
- Should readiness use a numeric score, state labels, or both?
- Should eval judging use the company's configured model, a global eval model, or a dedicated judge model default?
- How much eval evidence should be retained before pruning or summarization?

## Success Criteria

This upgrade is successful when:

- Admins can explain what the company AI knows, remembers, can do, and is allowed to do.
- Company chat and widgets can cite which knowledge and memories shaped an answer.
- Agents can inherit approved company context and skills without losing agent-specific behavior.
- Evals can prove readiness before public widget or agent changes go live.
- Readiness changes when underlying company AI configuration drifts.
- Company-specific AI behavior is governed, testable, and auditable.
