---
product: Hakken
documentation_type: Developer guide
feature_area: Agent configuration and skills
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/agent-configuration-and-catalogs.md
last_reviewed: '2026-10-26T14:18:05+00:00'
reviewed_against: current implementation
status: Current
---
# Agent Configuration And Catalogs Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Agent configuration and skills
> **Reviewed:** 26 October 2026, 14:18:05 GMT (Europe/London)
> **Source path:** `docs/developer/agent-configuration-and-catalogs.md` · **Status:** Current

This guide covers the implemented agent configuration surfaces that sit around the runtime: the agent builder, built-in templates, input/output schema editing, reusable skill catalog administration, agent logs, and transaction summaries. Read it with [Agents](./agents.md), [Agent Runtime Operations](./agent-runtime-operations.md), [Screen Kit](./screen-kit.md), [AI Tools And Connectors](./ai-tools-and-connectors.md), and [Knowledge Management](./knowledge-management.md).

## Route Map

Agent configuration routes live under `src/app/(dashboard)/admin/agents/`:

- `page.tsx`: agent catalog, search/filtering, Add navigation and delete confirmation. `new/page.tsx` creates a scratch agent using shared `AgentFormSections`; the old template wizard is absent.
- `[id]/page.tsx`: agent dashboard with transaction summary cards and paginated transaction history.
- `[id]/layout.tsx`: agent detail shell, tab navigation, and the manual `Run Agent`/`Stop Agent` action. `Run Agent` calls `api.scheduler.manualRunSchedule`; if the agent has no standing job, the UI asks for a one-off objective first.
- `[id]/settings/page.tsx`: agent identity, avatar upload, model mode, reasoning effort, internet access, and the draft/live switch and advisory readiness warnings.
- `[id]/knowledge/page.tsx`: per-agent knowledge library management through the shared knowledge admin surface.
- `[id]/system-prompt/page.tsx`: Instructions editing, including `standingObjective` for the job and `systemPrompt` for behavior.
- `[id]/rules/page.tsx`, `[id]/rules/new/page.tsx`, and `[id]/rules/[ruleId]/page.tsx`: agent rule list, creation, and editing.
- `[id]/interfaces/page.tsx`: which tools the agent may use, and the fixed answer shape it must return, edited through `JsonSchemaBuilder`.
- `[id]/runs/page.tsx`: run review, run detail, replay, cancellation, feedback, reflections, memory candidate generation/review, eval creation, eval-suite execution, and improvement suggestions.
- `[id]/evals/page.tsx`: checks, smoke evals, suite presets, skill coverage, and which checks must pass before an agent goes live.
- `[id]/memory/page.tsx`: active memories, memory quality, memory candidates, reflections, and improvement suggestions.
- `[id]/logs/page.tsx`: searchable agent trace list with offset pagination and delete confirmation.
- `[id]/logs/[logId]/page.tsx`: single trace detail.
- `skills/page.tsx`: reusable skill catalogue, analytics cards, starter seeding, manual creation, and bundle import.
- The implemented Skill Center pages handle skill detail, edit, archive, clone, export bundle, rollout, learning analytics, and bulk upgrade inside the Skill Center surface. There is no current `skills/[id]/page.tsx` route.
- `[id]/skills/page.tsx`: attach, enable/disable, upgrade, and remove skills for one agent.
- `approvals/page.tsx`: global pending approval queue for agent tool calls.

This guide focuses on configuration, catalogs, schemas, skills, logs, and transactions. Runtime review details for runs, evals, memory, approvals, version snapshots, and releases live in [Agent Runtime Operations](./agent-runtime-operations.md).

These screens are admin surfaces. Most global agent and skill catalogue writes are super-admin-only, while record evidence such as logs and transactions uses company scope for ordinary admins.

## Built-In Templates

Built-in templates are defined in `convex/agentTemplates.ts`. The implemented template ids are:

- `internal-knowledge-assistant`
- `support-triage-agent`
- `sales-research-agent`
- `document-review-agent`
- `reporting-analyst-agent`

Each template stores an admin-facing name, default agent name, description, system prompt, temperature, human approval requirement, reasoning effort, trigger type, recommended tool mappings, and suggested eval fixtures.

Template suggested fixtures currently support:

- `HAPPY_PATH`
- `APPROVAL_PAUSE`
- `PROMPT_INJECTION`
- `TOOL_PLAN`

The `agents.getAgentTemplatesForCreation` query returns these definitions to the builder. `agents.createAgentFromTemplate` resolves the selected template, creates the agent, seeds template eval fixtures through `seedFixturesForTemplate`, binds recommended tools when mappings exist, and records audit metadata that includes builder intent and missing mappings.

Do not treat templates as only UI copy. They are operational defaults that shape prompts, approval policy, tool readiness, and initial eval coverage.

## Add Page And Legacy Template API

`admin/agents/new/page.tsx` uses shared `AgentFormSections` from the Settings surface. It calls `agents.createAgent` and redirects into the created agent. Name/description, owner/risk, inherited or overridden model, reasoning, internet access, approval policy, limits, active state, and optional role are submitted. Runtime minutes are converted to milliseconds. Invalid/cleared numeric limits are submitted as zero so backend default resolution applies consistently with update behavior.

The earlier template, mission, policy, and readiness-checklist wizard is not the current Add page. Objective/audience builder intent fields and template backend functions remain compatibility/API artifacts; do not use their existence as evidence of routed UI. `createAgentFromTemplate` still seeds template defaults and suggested fixtures for authorized callers. Model configuration resolves the stored agent use case rather than a hardcoded runtime model.

`agents.createAgent` defaults inactive but accepts an explicit active state. `updateAgent` validates supplied configuration and computes readiness separately. Passed evals, release gates, and smoke evidence are advisory rather than universal activation refusals. Tool approvals, credential resolution, and per-run limits remain runtime boundaries. Documentation should distinguish a recommended release process from backend enforcement.

## Schema Editing

The Interfaces page edits `agents.outputSchema` through `JsonSchemaBuilder`, with simple object properties such as string, number, and boolean. An empty builder result is saved as undefined. The legacy `agents.inputSchema` field is stored/versioned compatibility data and is not the current input-editing workflow. Avoid describing two active schema tabs or claiming arbitrary JSON Schema coverage from the simple builder.

Strict output contracts can make model responses fail the consuming path's validation. Review actual runtime and workflow consumers before relying on a format universally. Schema updates use the normal authorized agent update mutation; readiness advice is not an additional schema-specific activation gate.

## Skill Catalog

Reusable skills are implemented in `convex/agentSkills.ts`. A skill stores:

- name
- description
- category
- status: `DRAFT`, `ACTIVE`, or `ARCHIVED`
- risk level: `LOW`, `MEDIUM`, or `HIGH`
- instruction text
- required tool mappings JSON
- recommended tool mappings JSON
- recommended knowledge JSON
- default rules JSON
- suggested eval fixtures JSON

Skill text is capped by `SKILL_TEXT_LIMIT` and JSON fields by `SKILL_JSON_LIMIT`. JSON fields are parsed and normalized by backend helpers; keep validation server-side even when the UI provides textarea affordances.

The catalogue page uses:

- `getPaginatedSkills`
- `getSkillCatalogAnalytics`
- `createSkill`
- `seedStarterSkills`
- `importSkillBundle`

The detail page uses:

- `getSkill`
- `getBindingsForSkill`
- `getSkillLearningAnalytics`
- `exportSkillBundle`
- `updateSkill`
- `archiveSkill`
- `cloneSkill`
- `upgradeSkillBindingsForSkill`

Skill bundles use format marker `hakken.agentSkillBundle.v1`. Imports create a draft rather than silently activating a skill. Exports should remain portable JSON bundles, not references to local files or environment state.

## Starter Skills

`seedStarterSkills` creates starter catalogue entries when they do not already exist. Implemented starter definitions include:

- Research Briefing
- Risk Monitoring
- Client Follow-up
- Document Extraction
- Approval Handoff
- Data Enrichment

Starter skills include risk levels, instruction text, and suggested eval fixtures. Seeding reports created and skipped counts so repeated runs are idempotent from the admin user's point of view.

Treat starter skills as catalogue content, not migration-only data. If starter behavior changes, update the seed definition, the export/import expectations, and tests that assert starter behavior.

## Skill Bindings

Agent-to-skill assignments live in `agentSkillBindings`. A binding records a skill-version ID for evidence and fixture currency. It does not fully freeze runtime content: `getRuntimeSkillsInternal` reads instruction and mapping fields from the current active `agentSkills` row, while returning version identifiers and snapshot hash from the attached version. A normal edit can therefore change runtime text even when a binding still identifies an older snapshot.

Important operations include:

- `getForAgent` for the skill list on one agent.
- `bindSkillToAgent` for attaching active skills.
- `upgradeSkillBindingToLatest` for a single agent binding.
- `upgradeSkillBindingsForSkill` for bulk rollout from the Skill Center.

High-risk smoke evidence and required tool mappings contribute to readiness advice. They are not a universal refusal in `agents.updateAgent`. Keep the distinction between warning, binding evidence, and runtime tool execution explicit.

## Logs

Agent trace records are implemented in `convex/agentLogs.ts` and stored in `agentLogs`.

Public surfaces:

- `getOffsetPaginated`
- `getLogById`
- `deleteLog`

Internal surfaces:

- `insertAgentLogInternal`
- `seedForAgent`

The log list supports search against `promptContent` through the `search_content` index and falls back to the `by_agent` index when no search term is present. Results are offset-paginated with the shared admin query helpers and should keep the 15-row admin page-size standard.

Company admins must have a company id and only receive logs where `log.companyId` matches their company. Super admins can inspect all logs for the selected agent. Preserve this boundary in list, detail, and delete operations.

The list page displays failure status by checking whether `interactionType` contains `ERROR` or `FAIL`. That is a UI classification, not a schema status field.

## Transactions

Agent transaction records are implemented in `convex/agentTransactions.ts` and stored in `agentTransactions`.

Public surfaces:

- `getForAgent`
- `getStatsForAgent`

Internal surfaces:

- `insertTransactionInternal`
- `seedForAgent`

`getForAgent` returns cursor-paginated transaction rows ordered newest first. `getStatsForAgent` reads up to `AGENT_TRANSACTION_STATS_LIMIT` rows and computes:

- total generations
- total tokens ingested
- total input tokens
- total output tokens
- total operational cost in GBP

The agent dashboard displays those totals above a paginated transaction table. Transaction rows include action context, model used, token counts, cost, and success/failure status.

Company admins only see transactions scoped to their company. Super admins can inspect all transactions for the selected agent. Do not add aggregate fields that mix company-scoped and global rows for ordinary admins.

## Authorization Boundaries

Global agent creation, update, delete, readiness, template creation, and global list operations are super-admin-only in `convex/agents.ts`.

Skill catalogue administration is also super-admin-oriented. Record evidence that carries company scope, such as logs and transactions, can be read by company admins only after company access checks.

Implementation rules:

1. Do not authorize operational records by `agentId` alone.
2. Check record `companyId` for ordinary admins.
3. Reject ordinary admins without a company id.
4. Keep global catalogue writes behind `requireSuperAdmin`.
5. Keep template, starter-skill, and bundle import paths auditable.

## Extension Rules

When extending agent configuration:

1. Add new built-in templates in `convex/agentTemplates.ts` with eval fixtures that exercise the template's risk profile.
2. Update `createAgentFromTemplate` behavior if a template needs new seeded artifacts.
3. Keep builder intent metadata stable enough for audit logs and support review.
4. Use `JsonSchemaBuilder` unless the schema requirement exceeds the implemented simple object builder.
5. Keep skill JSON validation server-side.
6. Preserve version/eval evidence and document that current runtime skill text is read from the active catalog record; do not claim that a version pointer alone pins instructions.
7. Keep logs and transactions company-scoped for ordinary admins.
8. Keep visible admin strings localized in `messages/en.json` and `messages/it.json` when touching UI.

## Verification

Focused tests include:

- `convex/agents.test.ts`
- `convex/agentSkills.test.ts`
- `convex/agentLogs.test.ts`
- `convex/agentTransactions.test.ts`
- `src/app/(dashboard)/admin/agents/skills/page.test.tsx`
- `src/app/(dashboard)/admin/agents/[id]/skills/page.test.tsx`
- `src/app/(dashboard)/admin/agents/[id]/settings/page.test.tsx`
- `src/ui/components/settings/JsonSchemaBuilder.test.tsx`

This documentation review inspected source and relevant tests without running agent/provider operations or application gates. Implementation changes require the current verification gates in [AGENTS.md](../../AGENTS.md); do not rely on an abbreviated copied gate list. Local tests are not deployed acceptance or external integration cutover evidence.

## Markdown Upload And Replacement

The visible catalog is shared by `admin/ai/skills/page.tsx` and `admin/agents/skills/page.tsx`. Upload calls `previewSkillMarkdownImport`, then `importSkillMarkdown`, then `updateSkill` with active status. The entered name overrides parsed frontmatter. Activation is a second mutation, so partial success is possible. The retained backend bundle import creates draft records and is distinct from this screen's active-after-upload behavior.

`importSkillMarkdown` searches up to ten exact-name rows, skipping archived entries. A new match creates a draft. A supplied hash equal to the existing source hash returns unchanged without touching its update time. A changed match patches parsed fields while preserving existing status, snapshots the result, and calls `rollAgentsOntoLatestSkillVersion` for attached agents. This is an update/rollout path, not an always-create import. Preview warnings about name or tool mappings are advisory and use bounded catalog/tool reads.

General `updateSkill` creates a snapshot and audits pinned-binding count but does not perform that same automatic version rollout. Snapshot creation deduplicates by skill/hash through `agentSkillVersions.by_skill_hash` and allocates the next version from `by_skill_created`. Actual instruction execution still reads current skill text, as described above. Do not infer runtime pinning from audit names such as pinned bindings.

## Limits, Destructive Operations, And Scope

`utils/skillContracts.ts` sets instruction text to 8,000 characters, JSON and Markdown inputs to 24,000, catalog scans to 250, binding-page reads to 100, and active tool lookup to 500. Cursor catalog queries and `searchActiveSkills` provide scalable selection; the capped legacy active list must not substitute for the picker. `getSkillCatalogAnalytics` uses a maintained rollup with freshness/completeness evidence, and rebuilds must preserve partial-population reporting.

`readEverySkillBinding` reads one beyond a 2,000-binding ceiling and refuses before a whole-skill edit/delete/rollout would silently affect only part of the attachment set. `deleteSkill` removes all discovered bindings, then up to 250 version snapshots, then the skill, auditing detached-agent/deleted-version counts. A skill with more version history can leave older snapshots behind; the all-bindings safety contract does not make the version cleanup unbounded. Archive preserves records but active runtime resolution excludes archived skills.

`MAX_SKILLS_PER_AGENT` is two. `bindSkillToAgent` checks enabled attachments when inserting a new binding; existing-binding updates and `setBindingEnabled` do not repeat every insertion check. Do not claim an impossible global invariant solely from that insertion guard. Catalog writes and bind/upgrade/enable/remove are super-admin mutations. `getForAgent` is an admin query and checks binding company access; runtime resolution skips bindings assigned to a different company. Newly attached global bindings explicitly clear company scope.

Single and bulk upgrades can seed suggested eval fixtures unless disabled. Bulk upgrade reads every binding, optionally narrows requested IDs, and skips already-current references. These operations update evidence and configuration; they do not prove provider acceptance or a passed run. Logs and transaction boundaries described above remain separate from global catalog access. No provider credentials are stored in portable skill bundles by this contract.
