# AI Rules And Prompts Developer Guide

AI rules and prompts are the configurable instruction layer for Hakken's assistant, agents, workflows, widgets, and tenant-specific AI behavior. The implementation spans global admin routes, company admin routes, Convex prompt/rule modules, audit logging, and prompt assembly helpers.

This guide covers the implemented code paths as of the current documentation audit. It should be read with `docs/developer/ai-administration.md`, `docs/developer/assistant-chat.md`, `docs/developer/agents.md`, and `docs/developer/ai-provider-tool-extension.md` when changing AI runtime behavior.

## Route Map

Global routes:

- `src/app/(dashboard)/admin/ai/system-prompt/page.tsx` edits the global system prompt through `api.system.getSystemPrompt` and `api.system.updateSystemPrompt`.
- `src/app/(dashboard)/admin/ai/rules/page.tsx` lists global rules with `api.aiRules.getOffsetPaginatedRules`, search, pagination, toggle, edit, and delete actions.
- `src/app/(dashboard)/admin/ai/rules/new/page.tsx` creates global rules through `api.aiRules.createRule`.
- `src/app/(dashboard)/admin/ai/rules/[id]/page.tsx` edits existing rules through `api.aiRules.getRuleById` and `api.aiRules.updateRule`.

Company routes:

- `src/app/(dashboard)/admin/companies/[id]/ai/prompt/page.tsx` renders the company prompt implementation.
- `src/app/(dashboard)/admin/companies/[id]/ai/rules/page.tsx` renders the company rules list.
- `src/app/(dashboard)/admin/companies/[id]/ai/rules/new/page.tsx` and `rules/[ruleId]/page.tsx` use the same rule contracts with a company id.

Agent routes:

- `src/app/(dashboard)/admin/agents/[id]/rules/page.tsx` lists agent-scoped rules.
- `src/app/(dashboard)/admin/agents/[id]/rules/new/page.tsx` creates agent-scoped rules through the shared rule contract.
- `src/app/(dashboard)/admin/agents/[id]/rules/[ruleId]/page.tsx` edits agent-scoped rules through the shared rule contract.

Shared UI:

- `src/app/(dashboard)/admin/_components/AdminRulesTable.tsx` renders the reusable rule table.
- `src/app/(dashboard)/admin/_components/AiRuleSafetyWarning.tsx` detects risky rule or prompt wording client-side and displays warning categories.
- `src/ui/components/screens/pagination.ts` supplies the 15-row admin page size used by rule lists.

## Backend Modules

`convex/system.ts` owns global system configuration:

- `getSystemPrompt` reads the configured system prompt for authenticated admin UI usage.
- `getInternalSystemPrompt` reads the prompt for internal runtime assembly.
- `updateSystemPrompt` requires `requireSuperAdmin`, upserts the `systemConfig` row keyed by the system prompt config key, and inserts an `UPDATE_SYSTEM_PROMPT` audit log.

`convex/aiRules.ts` owns rule CRUD and active rule resolution:

- `getRules` and `getOffsetPaginatedRules` support global, company, and agent scopes.
- `getRuleById` enforces super-admin access for global rules and company access for company-scoped rules.
- `createRule`, `updateRule`, `toggleRuleActive`, and `deleteRule` write audit logs.
- `getActiveRulesInternal` returns active global, company, and agent rules for prompt assembly, deduplicated by rule id.

Company prompt and rule routes now live under `/admin/companies/[id]/ai/...`.
Do not add links to the retired direct company prompt/rule routes unless those
files are reintroduced in implementation.

`convex/aiPromptAssembly.ts` owns instruction assembly and prompt-injection hardening:

- `ASK_SONAE_PLATFORM_SAFETY_CONTRACT` is prepended above configurable behavior.
- `buildAssistantSystemInstruction` layers platform safety, configured global prompt, optional company prompt, and active rules.
- `buildAgentSystemInstruction` layers platform safety, agent prompt, and enabled skill instructions.
- `buildUntrustedConversationHistory` and `buildUntrustedKnowledgeContext` wrap untrusted context and neutralize delimiter injection.

## Data Model

Rules are stored in `aiRules` with scope fields and operational fields:

- `companyId` for tenant-scoped rules.
- `agentId` for agent-scoped rules.
- `name`, `trigger`, `instruction`, `priority`, and `isActive`.
- `createdBy` and `createdAt` for operator traceability.

Global rules have no `companyId` and no `agentId`. Company rules carry `companyId`. Agent rules carry `agentId`; admin-visible agent rules should also carry company scope unless they are deliberately global and super-admin-only.

System prompts are stored in `systemConfig`. The global prompt uses a dedicated config key from `convex/systemService.ts`. Empty or missing global prompt values fall back to `FALLBACK_ASSISTANT_SYSTEM_PROMPT` during prompt assembly.

## Authorization Boundaries

Preserve these boundaries when changing the system:

- Global prompt updates require super-admin access.
- Global rule reads and writes require super-admin access.
- Company rule reads and writes require admin access to the relevant company.
- Non-super-admin access to agent rules must stay company-scoped.
- Runtime prompt assembly may read configuration internally, but user-facing queries and mutations must still enforce role and company boundaries.

Rules and prompts are untrusted configuration relative to platform safety. They must never be treated as authorization, tool execution permission, tenant access, or secret storage.

## Safety Warning Flow

The UI warning panel checks prompt and rule text for risky patterns such as:

- disclosing hidden prompts, policies, schemas, or private configuration
- weakening safety rules, tenant restrictions, permissions, or authorization
- allowing access to another tenant's private data

Backend audit metadata repeats safety categorization through `getAssistantSafetyWarnings` when rule records are created or updated. This makes warnings visible in audit context even if a client missed or ignored the UI warning.

Warnings are review signals, not hard validation. If a product decision requires hard blocking, implement it deliberately in Convex mutations and add tests.

## Runtime Assembly Order

Assistant instruction assembly is intentionally ordered:

1. Platform safety contract.
2. Configured global system prompt, or fallback prompt.
3. Company prompt, when present.
4. Active rules, including priority, trigger, and instruction.
5. Untrusted knowledge and conversation context in separate helpers.
6. Latest user request outside this module.

Do not move tenant isolation or tool-execution policy below configurable prompt text. If a future model provider requires a different message format, preserve this ordering semantically.

## Audit Logging

Relevant audit action types include:

- `UPDATE_SYSTEM_PROMPT`
- `CREATE_AI_RULE`
- `UPDATE_AI_RULE`
- `TOGGLE_AI_RULE`
- `DELETE_AI_RULE`

Rule audit metadata includes trigger, scope or priority context, and safety warning categories when detected. System prompt audit metadata is generated through `buildSystemPromptAuditMetadata`.

## Tests And Verification

Focused test areas include:

- `convex/aiRules.test.ts` for rule scope, CRUD, and authorization behavior.
- `convex/aiPromptAssembly.test.ts` for prompt layering and untrusted context handling.
- `convex/aiSafetyPolicy.test.ts` for warning categorization.
- UI tests under `src/app/(dashboard)/admin/ai/rules/` and company AI routes where present.

When changing localized rule or prompt UI text, keep `messages/en.json` and `messages/it.json` in parity. Documentation-only changes should at least run `git diff --check`; code changes must follow the full repository verification gate in `AGENTS.md`.
