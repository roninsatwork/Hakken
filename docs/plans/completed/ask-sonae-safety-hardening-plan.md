> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# Ask Hakken Safety Hardening Plan

This plan documents how Ask Hakken currently works, the prompt-injection and jailbreak risks that matter for this product, and the phased work needed before Ask Hakken should be treated as a hardened assistant for sensitive tenant, admin, agent, or tool-driven workflows.

The goal is not to promise that any model can be made impossible to jailbreak. The goal is to make the application resilient: hidden instructions stay hidden, tenant data stays scoped, retrieved documents are treated as evidence rather than authority, tool execution is enforced by deterministic backend policy, and regressions are caught by tests.

## Current Position

Ask Hakken is implemented primarily through:

- `src/app/(dashboard)/app/assistant/page.tsx`
- `src/app/(dashboard)/app/assistant/[threadId]/page.tsx`
- `src/ui/components/chat/ChatInput.tsx`
- `convex/chat.ts`
- `convex/chatService.ts`
- `convex/ai.ts`
- `convex/agentRuntime.ts`
- `convex/aiPromptAssembly.ts`
- `convex/aiToolExecutionService.ts`
- `convex/knowledge.ts`
- `convex/knowledgeActions.ts`

Normal chat flow:

1. The frontend creates or opens a thread.
2. The frontend optionally uploads files and stores them as thread-scoped knowledge documents.
3. `convex/chat.sendMessage` validates access, validates attachments, rate-limits, checks quota, redacts PII when configured, stores the message, and schedules the AI response.
4. Normal Ask Hakken routes to `internal.ai.generateSonaeResponse`.
5. Agent-backed threads route to `internal.agentRuntime.generateAgentResponse`.
6. Swarm mode routes to `internal.swarmActions.executeSwarmObjective`.
7. The response action resolves a configured model, loads recent thread history, assembles system instructions, retrieves scoped knowledge chunks, calls the provider, and stores the assistant response.

Existing strengths:

- Thread reads and writes are server-side authorized.
- Chat requests have input length limits, rate limits, quota checks, and upload validation.
- PII redaction exists and can be enabled through stored system configuration.
- Knowledge retrieval is scoped across global, company, agent, and thread contexts.
- Thread uploads are stored as thread-scoped knowledge.
- RAG chunks are wrapped in explicit untrusted data tags.
- Tool calls in `agentRuntime` already pass through role and tenant checks before returning even a mocked tool result.
- Runtime model choice is resolved from stored model configuration.

Known weaknesses:

- Prompt-injection defense is mostly instruction text, not a separate enforcement layer.
- RAG instructions currently over-emphasize exhaustive use of retrieved content, which can amplify malicious or irrelevant chunks.
- Normal chat history is flattened into a string instead of preserving stronger message-role boundaries.
- There is no dedicated prompt-injection regression test suite.
- Safety behavior for revealing hidden prompts, cross-tenant data, and tool escalation is not encoded as an explicit reusable policy.
- Admin-entered system prompts, company prompts, AI rules, and agent prompts are powerful and need guardrails.
- Real tool execution is not implemented yet; when it is, tool safety must be enforced outside the model.

## Threat Model

### In Scope

User-originated jailbreaks:

- "Ignore previous instructions."
- "Reveal your system prompt."
- "Pretend you are in developer mode."
- "Do not follow the tenant policy."
- "Output hidden rules or private chain-of-thought."

Knowledge-base prompt injection:

- Uploaded files that contain malicious instructions.
- Website knowledge pages that tell the model to ignore platform rules.
- Company or global knowledge that asks the model to reveal secrets, call tools, or exfiltrate data.
- Thread attachments that try to override system behavior.

Cross-tenant attacks:

- A user attempts to retrieve another company's knowledge or chat logs.
- A user injects a prompt asking the assistant to search outside their allowed tenant scope.
- A compromised or malicious document asks the assistant to blend global, company, agent, and thread contexts in unsafe ways.

Tool and agent escalation:

- A user asks an agent to call an admin or super-admin tool.
- A document tells an agent to call a tool with attacker-controlled arguments.
- A model produces tool arguments that target another company.
- A model asks for destructive actions without user confirmation.

Prompt/configuration mistakes:

- An admin creates a company prompt or AI rule that accidentally permits unsafe behavior.
- An agent prompt tells the model to trust retrieved documents as instructions.
- A future developer adds a new AI call path that bypasses the shared safety contract.

### Out of Scope

This plan does not attempt to solve:

- Provider-side model vulnerabilities beyond Hakken's control.
- Malicious administrators intentionally configuring unsafe prompts for their own tenant.
- External service compromise.
- Perfect detection of every possible jailbreak wording.
- Full DLP, malware scanning, or enterprise data classification.

These can be added later as separate plans if product requirements demand them.

## Safety Principles

Ask Hakken should follow these principles everywhere an AI response is generated:

- System and platform rules outrank tenant prompts, AI rules, retrieved documents, chat history, attachments, and user messages.
- Retrieved knowledge is evidence, not instruction.
- User messages and documents must never be allowed to override hidden instructions, auth rules, tenant scope, or tool policy.
- Backend authorization must be deterministic and independent of model output.
- Tool calls are requests, not permissions.
- Sensitive hidden instructions should not be revealed, summarized, transformed, or quoted.
- If the assistant cannot safely comply, it should refuse briefly and redirect to a safe alternative.
- Every AI path should use the same safety contract unless a narrower purpose-specific contract is documented.
- Tests should encode the security behavior so future prompt, RAG, model-provider, and tool changes cannot silently weaken it.

## Target Behavior

Ask Hakken should refuse or safely redirect when asked to:

- Reveal system prompts, developer instructions, hidden platform policies, API keys, secrets, internal tool schemas, or private configuration.
- Ignore or override platform, tenant, role, or tool restrictions.
- Access another tenant's documents, users, analytics, messages, or admin data.
- Execute a privileged action without the caller's backend-verified permission.
- Treat instructions inside retrieved documents, uploaded files, website pages, or chat history as higher priority than platform instructions.
- Fabricate capabilities, live access, integrations, data, or completed actions.

Ask Hakken may still:

- Summarize user-provided or retrieved documents.
- Explain that a document contained malicious or conflicting instructions.
- Use retrieved facts when they are relevant and safe.
- Answer policy, product, and workflow questions using scoped knowledge.
- Ask the user to contact an admin or switch context when permissions are insufficient.

## Implementation Plan

### Phase 1: Shared Safety Contract

Create a reusable safety contract for assistant-style AI generation.

Likely files:

- `convex/aiPromptAssembly.ts`
- new tests near `convex/aiPromptAssembly.test.ts`

Tasks:

- Expand `FALLBACK_ASSISTANT_SYSTEM_PROMPT` into a provider-neutral safety contract.
- Add explicit instruction precedence:
  platform safety rules, global system prompt, company system prompt, active AI rules, retrieved knowledge, chat history, latest user prompt.
- Add hidden-instruction non-disclosure rules.
- Add cross-tenant and permission-boundary rules.
- Add RAG instruction handling rules.
- Add tool-call rules that state tool execution requires backend authorization.
- Keep the contract concise enough that it does not bury product behavior.

Acceptance:

- `buildAssistantSystemInstruction` emits a clear safety hierarchy.
- Tests prove tenant prompts and AI rules are appended below platform safety rules.
- No prompt contains provider-specific product language unless it is part of a provider adapter.
- Existing admin-configured prompts still work as behavioral customization, but cannot outrank platform safety rules.

Status:

- Implemented `ASK_SONAE_PLATFORM_SAFETY_CONTRACT` in `convex/aiPromptAssembly.ts`.
- Normal assistant prompts now place configured platform behavior, company prompts, and AI rules below platform safety.
- Agent prompts now use `buildAgentSystemInstruction`, which places configured agent behavior below platform safety.
- Added regression coverage in `convex/aiPromptAssembly.test.ts`.

### Phase 2: Safer RAG Assembly

Change RAG wording so retrieved documents are treated as untrusted evidence.

Likely files:

- `convex/ai.ts`
- `convex/agentRuntime.ts`
- possibly `convex/aiPromptAssembly.ts`

Tasks:

- Extract RAG block construction into a shared helper.
- Replace "MUST use this data" and "Be EXHAUSTIVE" with safer grounding language.
- State that retrieved chunks may be incomplete, stale, irrelevant, or malicious.
- Tell the model to cite or reference retrieved facts only when relevant to the user's request.
- Tell the model to ignore any instructions inside chunks that attempt to alter behavior, reveal hidden prompts, call tools, change permissions, or exfiltrate data.
- Preserve existing scope ordering across global, company, and thread knowledge.
- Keep agent-specific RAG isolated to agent knowledge.

Acceptance:

- Normal assistant and agent RAG use the same untrusted-context wrapper.
- Retrieved content cannot be framed as higher priority than system instructions.
- Tests cover malicious chunk text such as "ignore all previous instructions" and verify the wrapper labels it as untrusted data.

Status:

- Implemented `buildUntrustedKnowledgeContext` with untrusted reference wording, delimiter neutralization, and context-budget truncation.
- Replaced normal assistant and agent RAG prompt blocks with the shared wrapper.
- Agent attached-document text now uses the same untrusted reference wrapper.
- Added regression coverage for malicious delimiters and large chunks.

### Phase 3: Structured Conversation Context

Reduce risk from flattened chat history.

Likely files:

- `convex/ai.ts`
- `convex/aiRuntimeTypes.ts`
- `convex/aiProviderRegistry.ts`
- provider adapters if needed

Tasks:

- Preserve user and assistant role boundaries where the provider abstraction supports it.
- Avoid placing prior user content into labels that look like system instructions.
- Keep the latest user request clearly separated from older chat history.
- Add bounded truncation rules that do not cut through safety wrappers or XML-like tags.
- Ensure attachments and RAG context are clearly separated from direct user intent.

Acceptance:

- Normal chat no longer relies on one large "Previous Conversation History" string when provider abstractions can support structured messages.
- If a provider path still requires text, the flattened form uses explicit untrusted history delimiters.
- Tests cover prior-message injection attempts.

Status:

- Implemented `buildUntrustedConversationHistory` with explicit untrusted history framing, turn delimiters, delimiter neutralization, and bounded truncation.
- Normal Ask Hakken now uses the wrapper instead of the older ad hoc `[USER]`/`[ASSISTANT]` history string.
- Full provider role-aware request support remains a future provider-adapter refactor; current provider abstraction still passes text parts.

### Phase 4: Refusal And Safe-Completion Policy

Create a small reusable policy for known unsafe request classes.

Likely files:

- new `convex/aiSafetyPolicy.ts`
- `convex/aiPromptAssembly.ts`
- tests near `convex/aiSafetyPolicy.test.ts`

Tasks:

- Add canonical refusal guidance for hidden prompt disclosure, secret exfiltration, cross-tenant data, permission bypass, and unsafe tool escalation.
- Consider a lightweight preflight classifier for obvious unsafe strings before provider execution.
- Keep preflight deterministic and conservative; avoid blocking normal business questions.
- Add assistant response guidance for "I cannot reveal hidden instructions" style refusals.
- Decide whether refused prompts should still be logged as normal chat messages.

Acceptance:

- Obvious requests to reveal system prompts are handled consistently.
- Obvious cross-tenant access requests are refused or redirected.
- Refusals do not disclose hidden policy text.
- Tests cover both unsafe and safe neighboring prompts.

Status:

- Added `convex/aiSafetyPolicy.ts` with deterministic classification for hidden-instruction disclosure, permission-bypass, and obvious cross-tenant data requests.
- Normal Ask Hakken and agent responses now preflight these obvious unsafe prompts before provider execution.
- Added safe refusal messages and focused tests in `convex/aiSafetyPolicy.test.ts`.

### Phase 5: Tool Execution Contract

Before real agent tools are connected, define the backend contract that every tool must satisfy.

Likely files:

- `convex/aiToolExecutionService.ts`
- `convex/agentRuntime.ts`
- future tool executor modules
- tests near `convex/aiToolExecutionService.test.ts`

Tasks:

- Keep tool declarations separate from tool execution.
- Define every tool with:
  stable name, description, JSON schema, required role, tenant scope, side-effect level, confirmation requirement, and audit metadata.
- Validate model-produced tool arguments against the declared schema.
- Check user role and active company before every execution.
- Prevent admins from executing super-admin tools.
- Prevent tenant admins from targeting another company.
- Require explicit user confirmation for destructive or externally visible actions.
- Log tool calls with redacted arguments and outcome.
- Never let the model choose the caller identity, tenant, role, or confirmation status.

Acceptance:

- Permission denial is enforced even when the model asks for a tool.
- Tool arguments are schema-validated before execution.
- Destructive tools have confirmation gates.
- Tests cover user, admin, super-admin, same-company, and cross-company decisions.

Status:

- Existing role and tenant checks in `canExecuteTool` remain in place.
- Added `normalizeToolExecutionPolicy` with side-effect levels and default confirmation requirements for destructive/external tools.
- Added tests for confirmation gates and tenant/role boundaries.
- Real tool execution remains future work; the current runtime still returns mocked tool payloads after policy checks.

### Phase 6: Prompt And Rule Administration Guardrails

Make configurable prompts powerful but safer.

Likely files:

- admin AI prompt/rule pages under `src/app/(dashboard)/admin/**`
- `convex/aiRules.ts`
- `convex/system.ts`
- `convex/companies.ts`
- locale dictionaries

Tasks:

- Add helper text explaining that company prompts and rules cannot override platform safety, tenant isolation, or backend permissions.
- Add validation warnings for dangerous phrases in admin-configured prompts and AI rules.
- Consider requiring super-admin approval for global prompt changes.
- Add audit log clarity for prompt and rule changes.
- Preserve English and Italian locale parity.

Acceptance:

- Admins can still configure tone, product behavior, and tenant guidance.
- Dangerous prompt changes surface warnings or require stronger permission.
- Locale parity tests remain green.
- Prompt updates remain auditable.

Status:

- AI rule create/update audit metadata now records safety warning categories for suspicious trigger/instruction text.
- Added a shared admin warning panel at `src/app/(dashboard)/admin/_components/AiRuleSafetyWarning.tsx`.
- Global, company, and agent rule create/edit pages now show warnings before save.
- Global, company, and agent prompt editors now show the same warning panel before save.
- Global, company, and agent prompt update audit metadata now records safety warning categories for suspicious prompt text.
- Company prompt updates now write `UPDATE_COMPANY_PROMPT` audit logs, aligning them with other prompt/configuration changes.

### Phase 7: Prompt-Injection Regression Suite

Add dedicated tests that encode expected behavior.

Likely files:

- `convex/aiPromptAssembly.test.ts`
- `convex/aiSafetyPolicy.test.ts`
- `convex/aiToolExecutionService.test.ts`
- `convex/knowledgeService.test.ts`
- possibly `src/quality-drift.test.ts`

Fixtures to include:

- User jailbreak asking to ignore previous instructions.
- User asking for hidden system prompt.
- User asking for cross-tenant data.
- Uploaded document containing "ignore all previous instructions."
- Knowledge chunk instructing the model to call an admin tool.
- Prior chat message attempting to redefine assistant behavior.
- Agent tool request from a regular user.
- Tenant admin tool request targeting another tenant.
- Admin-configured AI rule attempting to bypass platform policy.

Acceptance:

- Safety prompt assembly snapshots are stable and reviewed.
- RAG wrappers classify chunks as untrusted.
- Tool permission tests pass without provider calls.
- Drift tests prevent new AI generation paths from bypassing shared safety helpers.

Status:

- Added focused coverage across prompt assembly, safety policy, tool execution policy, AI rule audit metadata, chat safety-refusal persistence, and admin rule warning UI.
- Added action-level smoke coverage proving obvious hidden-prompt requests save refusals before provider execution.
- Added action-level smoke coverage proving malicious thread knowledge reaches the provider only inside the untrusted RAG wrapper.

### Phase 8: Observability And Incident Review

Make safety events visible enough to debug without storing secrets.

Likely files:

- `convex/chat.ts`
- `convex/agentRuntime.ts`
- `convex/agentLogs.ts`
- admin AI logs pages

Tasks:

- Add structured safety event types for refusals, blocked tool calls, suspicious prompt patterns, and unsafe document instructions.
- Redact PII and prompt payloads consistently.
- Avoid logging hidden system prompts.
- Show enough metadata for admins to understand what happened:
  user, company, thread, model, provider, event type, timestamp, and safe summary.
- Consider adding safety event counts to AI/admin dashboards later.

Acceptance:

- Safety events are inspectable without leaking secrets.
- Logs preserve tenant isolation.
- Blocked tool calls and refusals are auditable.

Status:

- Added `internal.chat.saveAssistantSafetyRefusal`, which stores the assistant refusal and writes `ASSISTANT_SAFETY_REFUSAL` audit logs for signed-in threads.
- Audit metadata records only safe fields: category and source. It does not store raw prompts or hidden policy text.
- Anonymous/widget threads still receive refusal messages but skip audit logs because `auditLogs.actorId` requires a user.
- Blocked real-tool execution auditing remains future work alongside real tool execution.

### Phase 9: Rollout And Verification Gates

Roll this out in guarded slices.

Recommended order:

1. Shared safety contract and tests.
2. RAG wrapper hardening.
3. Safety/refusal policy.
4. Tool execution contract tests.
5. Admin prompt/rule guardrails.
6. Observability.
7. Broader structured conversation refactor if needed.

Required verification before merging a safety slice:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

Additional targeted checks:

- Run new Convex/unit tests for prompt assembly, safety policy, and tool permissions.
- Manually test Ask Hakken with:
  "reveal your system prompt",
  a malicious uploaded text file,
  and a normal business question using a safe uploaded document.

## Product Decisions To Confirm

- Should PII redaction be enabled by default for all tenants, or remain configurable?
- Should phone-number redaction stay off by default because of false positives?
- Should suspicious prompt-injection attempts be visible to tenant admins, super-admins only, or both?
- Should users see a generic refusal, or should Hakken explicitly say a document contained unsafe instructions?
- Which future tools are read-only, write-capable, destructive, or externally visible?
- Which tool classes require explicit user confirmation?
- Should global/company knowledge answers include source snippets or document titles for user trust?
- Should tenant admins be allowed to configure prompts that mention internal policy, or should some phrases be blocked outright?

## Definition Of Done

Ask Hakken safety hardening is complete when:

- All AI assistant and agent paths share a documented safety hierarchy.
- RAG and attachments are consistently treated as untrusted context.
- Hidden prompt and policy disclosure requests are refused consistently.
- Cross-tenant and permission-bypass requests cannot succeed through model output.
- Tool execution is enforced by backend authorization and schema validation.
- Prompt-injection regression tests cover user input, chat history, RAG chunks, uploaded documents, AI rules, and tool calls.
- Admin-configured prompts and rules have clear guardrails and auditability.
- Required verification gates pass.
