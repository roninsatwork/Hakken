# Agent Configuration And Catalogs Developer Guide

This guide covers the implemented agent configuration surfaces that sit around the runtime: the agent builder, built-in templates, input/output schema editing, reusable skill catalog administration, agent logs, and transaction summaries. Read it with [Agents](./agents.md), [Agent Runtime Operations](./agent-runtime-operations.md), [Shared Admin UI](./shared-admin-ui.md), [AI Tools And Connectors](./ai-tools-and-connectors.md), and [Knowledge Management](./knowledge-management.md).

## Route Map

Agent configuration routes live under `src/app/(dashboard)/admin/agents/`:

- `page.tsx`: agent catalogue, search, template builder, blank-agent creation, template-agent creation, and delete confirmation.
- `[id]/page.tsx`: agent dashboard with transaction summary cards and paginated transaction history.
- `[id]/layout.tsx`: agent detail shell, tab navigation, and the manual `Launch Run` action that calls `api.scheduler.manualRunSchedule`.
- `[id]/settings/page.tsx`: agent identity, avatar upload, model mode, reasoning effort, internet access, and the draft/live switch with the one reason an agent cannot go live.
- `[id]/knowledge/page.tsx`: per-agent knowledge library management through the shared knowledge admin surface.
- `[id]/system-prompt/page.tsx`: system prompt editing.
- `[id]/rules/page.tsx`, `[id]/rules/new/page.tsx`, and `[id]/rules/[ruleId]/page.tsx`: agent rule list, creation, and editing.
- `[id]/interfaces/page.tsx`: which tools the agent may use, and the fixed answer shape it must return, edited through `JsonSchemaBuilder`.
- `[id]/runs/page.tsx`: run review, run detail, replay, cancellation, feedback, reflections, memory candidate generation/review, eval creation, eval-suite execution, and improvement suggestions.
- `[id]/evals/page.tsx`: checks, smoke evals, suite presets, skill coverage, and which checks must pass before an agent goes live.
- `[id]/memory/page.tsx`: active memories, memory quality, memory candidates, reflections, and improvement suggestions.
- `[id]/logs/page.tsx`: searchable agent trace list with offset pagination and delete confirmation.
- `[id]/logs/[logId]/page.tsx`: single trace detail.
- `skills/page.tsx`: reusable skill catalogue, analytics cards, starter seeding, manual creation, and bundle import.
- `skills/[id]/page.tsx`: skill detail, edit, archive, clone, export bundle, rollout, learning analytics, and bulk upgrade.
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

## Agent Builder

The agent list page implements a four-step builder:

1. `template`: choose a built-in template or blank agent.
2. `mission`: set name, objective, audience, and blank-agent description.
3. `policy`: choose approval policy, model behavior, template knowledge usage, and template tool usage.
4. `readiness`: acknowledge draft, eval, approval, and template checks before creation.

The builder writes a `builderIntent` object with:

- `objective`
- `audience`
- `approvalPolicy`
- `modelBehavior`
- `knowledgePlan`
- `toolPlan`
- `smokeEvalRequired`
- `readinessAcknowledged`

For template agents, the page calls `api.agents.createAgentFromTemplate`. For blank agents, it calls `api.agents.createAgent`. Both routes navigate to `/admin/agents/[id]` after successful creation.

`createAgent` and `createAgentFromTemplate` resolve default model configuration through the stored AI model defaults for the `agent` use case. Runtime model choices must continue to flow through model configuration rather than hardcoded provider model literals.

## Schema Editing

The interfaces tab at `[id]/interfaces/page.tsx` edits `agents.outputSchema`. `agents.inputSchema` is no longer edited or read: it was stored and versioned, and nothing consumed it.

The UI uses `JsonSchemaBuilder` for both schemas:

- the input schema describes the structured context expected by the agent
- the output schema describes the expected response contract

`JsonSchemaBuilder` supports simple object schemas with string, number, and boolean properties. Empty builder state emits an empty string; the save mutation converts empty strings to `undefined` before calling `agents.updateAgent`.

Output schema editing includes a warning because strict response contracts can make agent behavior brittle. Preserve that warning when changing the schema surface.

Schema updates are normal agent updates, so the backend activation and readiness guardrails in `convex/agents.ts` still apply. Do not add a schema-specific write path that bypasses model, release-gate, smoke-eval, skill-readiness, or authorization checks.

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

Skill bundles use format marker `sonae.agentSkillBundle.v1`. Imports create a draft rather than silently activating a skill. Exports should remain portable JSON bundles, not references to local files or environment state.

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

Agent-to-skill assignments live in `agentSkillBindings`. A binding snapshots the skill version attached to an agent so catalogue edits do not silently rewrite existing agent behavior.

Important operations include:

- `getForAgent` for the skill list on one agent.
- `bindSkillToAgent` for attaching active skills.
- `upgradeSkillBindingToLatest` for a single agent binding.
- `upgradeSkillBindingsForSkill` for bulk rollout from a skill detail page.

High-risk skills need smoke evidence before activation readiness can pass. Required tool mappings must resolve before the agent can be treated as ready. Keep this relationship aligned with `agents.getAgentReadiness` and `agents.updateAgent`.

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
6. Use skill versions and binding upgrades for catalogue changes instead of silently rewriting agent behavior.
7. Keep logs and transactions company-scoped for ordinary admins.
8. Keep visible admin strings localized in `messages/en.json` and `messages/it.json` when touching UI.

## Verification

Focused tests include:

- `convex/agents.test.ts`
- `convex/agentSkills.test.ts`
- `convex/agentLogs.test.ts`
- `convex/agentTransactions.test.ts`
- `src/app/(dashboard)/admin/agents/skills/page.test.tsx`
- `src/app/(dashboard)/admin/agents/skills/[id]/page.test.tsx`
- `src/app/(dashboard)/admin/agents/[id]/skills/page.test.tsx`
- `src/app/(dashboard)/admin/agents/[id]/settings/page.test.tsx`
- `src/ui/components/settings/JsonSchemaBuilder.test.tsx`

For documentation-only edits, run `git diff --check`. Before merging implementation changes in this area, run the full local gate from `AGENTS.md`:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```
