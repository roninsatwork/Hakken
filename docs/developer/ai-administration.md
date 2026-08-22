# AI Administration Developer Guide

AI administration is the implementation surface for Sonae's model catalog, provider controls, AI defaults, global and company prompts, rules, knowledge, widgets, tools/connectors, chat logs, and cost reporting. It is split across global admin routes under `src/app/(dashboard)/admin/ai/`, company-scoped routes under `src/app/(dashboard)/admin/companies/[id]/`, public widget routes under `src/app/w/[widgetId]/` and `src/app/sandbox/[widgetId]/`, and Convex modules that enforce authorization and runtime resolution.

This guide describes current behavior only. It should be read with `docs/developer/assistant-chat.md`, `docs/developer/spoken-channels.md`, `docs/developer/upload-and-knowledge-policy.md`, `docs/developer/ai-provider-tool-extension.md`, and `docs/developer/agents.md` before changing AI runtime or administration behavior.

## Product Surface

Global AI routes:

- `src/app/(dashboard)/admin/ai/costs/page.tsx` renders global AI cost analytics from `api.analytics.getGlobalAnalytics`.
- `src/app/(dashboard)/admin/ai/money/page.tsx` renders the global money view backed by the Wiki money feature.
- `src/app/(dashboard)/admin/ai/chat-logs/page.tsx` lists global chat threads and fetches selected messages through `api.chatAdmin`.
- `src/app/(dashboard)/admin/ai/diary/page.tsx` renders `WikiDiaryScreen` for platform-scope Wiki audit events.
- `src/app/(dashboard)/admin/ai/unanswered/page.tsx` renders `UnansweredScreen` for platform and company unanswered Wiki demand.
- `src/app/(dashboard)/admin/ai/evals/**` renders platform-level AI check list, creation, detail, and edit screens.
- `src/app/(dashboard)/admin/ai/rules/page.tsx`, `rules/new/page.tsx`, and `rules/[id]/page.tsx` manage global AI rules.
- `src/app/(dashboard)/admin/ai/system-prompt/page.tsx` edits the global system prompt.
- `src/app/(dashboard)/admin/ai/global-knowledge/page.tsx` redirects to the current global Wiki address.
- `src/app/(dashboard)/admin/ai/knowledge/**` renders platform-scope Wiki pages, page detail, and map.
- `src/app/(dashboard)/admin/ai/widget/page.tsx` manages the primary global widget.
- `src/app/(dashboard)/admin/ai/models/page.tsx` manages providers, model catalog rows, global defaults, sync, test, filtering, and enabled status.
- `src/app/(dashboard)/admin/ai/models/[id]/page.tsx` edits a model friendly name and pricing configuration.
- `src/app/(dashboard)/admin/ai/tools/page.tsx`, `tools/new/page.tsx`, `tools/[id]/page.tsx`, and `tools/connectors/[id]/page.tsx` manage tools and connectors. There is no implemented MCP tool creation route in the current app.
- `src/app/(dashboard)/admin/ai/voice/page.tsx` manages the workspace spoken voice and previews voices through the production live relay/model path.

Company AI routes use the same backend tables but pass a company id and apply company-scoped authorization:

- `src/app/(dashboard)/admin/companies/[id]/ai/layout.tsx` renders the company AI section shell.
- `src/app/(dashboard)/admin/companies/[id]/ai/page.tsx` is the company AI landing surface.
- `src/app/(dashboard)/admin/companies/[id]/ai/models/page.tsx` manages company model defaults.
- `src/app/(dashboard)/admin/companies/[id]/ai/prompt/page.tsx` edits the company prompt.
- `src/app/(dashboard)/admin/companies/[id]/ai/rules/page.tsx`, `src/app/(dashboard)/admin/companies/[id]/ai/rules/new/page.tsx`, and `src/app/(dashboard)/admin/companies/[id]/ai/rules/[ruleId]/page.tsx` manage company-scoped AI rules.
- `src/app/(dashboard)/admin/companies/[id]/ai/knowledge/page.tsx` renders company knowledge management.
- `src/app/(dashboard)/admin/companies/[id]/ai/pages/**` renders company Wiki pages, page detail, and map.
- `src/app/(dashboard)/admin/companies/[id]/ai/diary/page.tsx` renders company-scope Wiki diary entries.
- `src/app/(dashboard)/admin/companies/[id]/ai/unanswered/page.tsx` renders company unanswered Wiki demand.
- `src/app/(dashboard)/admin/companies/[id]/ai/saved-answers/page.tsx` redirects to the company Wiki pages route; saved answers were folded into Wiki pages with chat receipts.
- `src/app/(dashboard)/admin/companies/[id]/ai/money/page.tsx` renders company-scoped money view.
- `src/app/(dashboard)/admin/companies/[id]/ai/chat-logs/page.tsx` and `src/app/(dashboard)/admin/companies/[id]/chat-logs/page.tsx` expose company chat-log review paths.
- `src/app/(dashboard)/admin/companies/[id]/calls/**` and `src/app/(dashboard)/admin/companies/[id]/mailbox/page.tsx` expose company calls and mailbox operations to platform operators.
- `src/app/(dashboard)/admin/companies/[id]/widget/page.tsx` manages the company widget.

The shared knowledge UI lives in `src/app/(dashboard)/admin/_features/knowledge/KnowledgeManager.tsx`. It is reused for global, company, and agent knowledge.
The shared Wiki UI lives in `src/app/(dashboard)/admin/_features/wiki/`, including page lists/detail, map, import box, ask box, diary, unanswered questions, and money view. These components support both platform scope and company scope; keep their scope props explicit rather than inferring company access from the URL alone.

## Data Model

AI administration touches these schema areas in `convex/schema.ts`:

- `aiProviders` stores provider catalog state, enabled status, sync status, health metadata, and provider settings.
- `aiModels` stores provider model metadata, enabled state, legacy default state, capabilities, supported use cases, context/output limits, pricing metadata, friendly names, and token cost fields.
- `aiModelDefaults` stores global and company defaults by use case, including fallback model ids.
- `aiRules` stores global, company, and agent-scoped rules with trigger, instruction, priority, active state, creator, and indexes for global/company/agent lookup.
- `systemConfig` stores global config such as the system prompt, analytics id, and PII redaction configuration.
- `knowledgeDocuments` and `knowledgeChunks` store global, company, agent, and thread knowledge plus embedding metadata.
- `toolConnectors`, `toolConnectorTestLogs`, `toolConnectorSecretRefs`, and `toolConnectorOAuthConnections` store connector install state, diagnostics, secret references, and OAuth state.
- `aiTools` and `agentTools` store global tool definitions and agent bindings.
- `widgets` stores global and company embeddable widget configuration.
- `threads` and `messages` store chat, widget, and agent conversation messages with company/user/agent/widget analytics dimensions.
- `companies.spokenVoice` stores the voice used by Ask Sonae live voice, phone calls, and reception.
- `aiActionRequests` stores lightweight reservations for provider-backed helper actions such as voice transcription, real-time voice session creation, voice preview, and workflow node configuration generation. These rows support per-actor rate limits before provider calls are made.
- `analyticsDailySnapshots` and message metadata support cost and usage reporting.

Keep sparse scope fields meaningful. A global knowledge document has no company id, agent id, or thread id. A company knowledge document has a company id. Agent knowledge can have an agent id and, for admin-scoped writes, may also carry company scope. Thread knowledge has a thread id.

## Models And Providers

`convex/aiModels.ts` is the main model catalog module. Public selector queries such as `getModels` and `getActiveModels` are readable by authenticated users because normal chat, agent, and workflow screens need model choices. Administrative catalog queries and mutations such as `getOffsetPaginatedModels`, `getProviders`, provider enablement, global defaults, model enforcement, legacy default changes, model detail, and pricing updates require `requireSuperAdmin`.

`convex/aiModelsActions.ts` contains provider sync and test actions for Google, OpenAI, Anthropic, and Vertex aliases. Provider sync updates catalog metadata; provider testing records health status and messages. Keep provider-specific API details in provider services and actions, not scattered through runtime callers.

Defaults are use-case based. Global defaults are keyed by use case and scope. Company defaults override global defaults for the same use case. Runtime resolution should go through `convex/aiModelService.ts` and related internal query paths rather than reading model rows directly in feature code. This is a repo guardrail: runtime paths should not hardcode model literals. The `realtime` use case is the live spoken-channel default used by Ask Sonae voice, the phone line, and voice previews; it needs a compatible speech-to-speech model and the relay/provider configuration documented in [Spoken Channels](./spoken-channels.md).

The model admin page filters by status, provider, capability, use case, and search term. It uses `ADMIN_PAGE_SIZE`. The model detail page updates friendly name and pricing fields through `updatePricingConfig`; pricing powers cost estimates and analytics, not provider billing.

## Prompts And Rules

`convex/system.ts` stores and reads the global system prompt. `getSystemPrompt` is an admin query and `updateSystemPrompt` is super-admin-only. `getInternalSystemPrompt` is used by runtime assembly. System prompt updates write audit metadata.

`convex/aiRules.ts` stores rules. Rules can be global, company-scoped, or agent-scoped. Global rules are only visible and manageable by super admins. Company rules can be read and managed by admins with access to that company. Agent rules for standard admins must still be company-scoped; global agent rules are super-admin territory. `getActiveRulesInternal` combines active global, company, and agent rules and deduplicates them before runtime use.

When changing rule behavior, preserve the distinction between trigger matching, instruction content, priority, and scope. Rules are untrusted configuration relative to tenant isolation and system safety; they should shape AI behavior but never grant data access.

## Knowledge

`KnowledgeManager` calls `convex/knowledge.ts` for document listing, pagination, quality summary, upload URL generation, document save/delete, manual text save, website URL queueing, retry, repair, inspection, and retrieval tests. Website mapping runs through `convex/knowledgeActions.ts`.

`convex/knowledge.ts` enforces scope with helpers such as `assertCanAccessKnowledgeScope` and `getWritableKnowledgeScope`. Global knowledge requires super-admin access. Company knowledge requires super-admin or admin access to that active company. Agent knowledge supports company-scoped admin access where the agent knowledge record is tied to the active company. Thread knowledge follows chat thread ownership paths documented in the assistant guide.

Ingestion actions extract text, chunk it, resolve the active embedding model for company/global scope, and write vectors to `knowledgeChunks`. The current vector index is 768 dimensions. If changing embedding providers or dimensions, coordinate schema, ingestion, retrieval tests, and existing data expectations.

The upload policy is centralized in `src/lib/constants/uploads.ts` and documented in `docs/developer/upload-and-knowledge-policy.md`. Do not add new file paths that bypass validation or backend metadata checks.

## Tools And Connectors

`convex/aiTools.ts` implements connector marketplace, connector installation, connector details, connector update, connector testing, tool listing, tool CRUD, and agent tool binding. Connector marketplace and install details are admin-readable with company filtering. Installing connector definitions is super-admin-only. Updating and testing connector installs require admin access to the connector's company scope. Global tool CRUD is super-admin-only.

Tool definitions include handler mappings, optional connector ids/keys, secret reference keys, required role, input/output schemas, side-effect level, confirmation requirement, active state, and version. Connector definitions include category, auth mode, required scopes, secret refs, tenant availability, company id, install status, test status, OAuth status, and diagnostics.

The runtime guardrail is that model tool requests are not execution authority. Tool execution services must validate the tool, parse JSON args, enforce required role, enforce tenant boundaries, respect side-effect/confirmation behavior, and return normalized results. Keep provider-specific function declaration translation separate from internal tool authorization.

## Widgets

`convex/widgets.ts` implements global and company widgets. Global widget reads and writes require super-admin access. Company widget reads and writes require admin access to the company. `saveWidget` validates scope, stores appearance/gateway/integration settings, and writes audit logs. Logo uploads use the admin image upload policy.

The public route `src/app/w/[widgetId]/page.tsx` reads active widget configuration, validates referrer/allowed domains in the browser, optionally gates by visitor name/email, creates widget threads through `api.widgets.createWidgetThread`, and sends messages through normal chat mutation paths with the widget access token returned for that thread. It posts widget popup configuration to the parent only when the referrer is allowed. The sandbox route `src/app/sandbox/[widgetId]/page.tsx` injects `/embed.js` with the widget id into a simulated host page.

Client-side domain checks are helpful for the iframe experience, but sensitive widget behavior must remain backend-scoped by widget id, company id, and active state. Avoid adding public widget mutations that trust host page data without backend validation.

## Spoken Voice

`src/app/(dashboard)/admin/ai/voice/page.tsx` calls `api.voiceSettings.getSpokenVoice`, `api.voiceSettings.setSpokenVoice`, and `api.voicePreview.mintVoicePreviewTicket`. Voice choices are validated against the closed set in `convex/voiceSettings.ts`; writes are admin-only and audited with `UPDATE_SPOKEN_VOICE`.

Voice preview is intentionally not a separate text-to-speech shortcut. It mints a signed ticket for the same relay and configured real-time model used by production spoken channels. Keep this screen aligned with [Spoken Channels](./spoken-channels.md) when changing relay URLs, voice names, preview rate limits, model requirements, or company voice storage.

## Costs And Chat Logs

Global AI costs use `api.analytics.getGlobalAnalytics`, which requires super-admin access. The cost screen displays timeline, aggregates, provider/model distribution, and leaderboards. Company metrics use company-scoped analytics access in `convex/analytics.ts`. Historical analytics snapshots store model metrics but not provider totals, so provider distribution is currently live-overlay attribution rather than a complete historical provider rollup.

Global chat logs use `convex/chatAdmin.ts`. Global paginated thread reads require super-admin access. Company thread reads allow super admins and admins who can read the company. `getAdminThreadMessages` requires admin access and enforces company access for non-super-admins before returning up to 500 messages.

Chat transcript copy is built in the browser through `src/lib/chatTranscript.ts`. Treat transcripts as sensitive data because they can include user prompts, assistant responses, uploaded-file references, and business context.

## Provider-Backed Helper Actions

Some AI actions are helper utilities rather than normal chat turns. Voice transcription calls `api.aiSpeech.transcribeAudio`; real-time voice calls `api.aiVoiceSession.createRealtimeVoiceSession`; voice preview calls `api.voicePreview.mintVoicePreviewTicket`; workflow node mapping calls `api.workflowNodeConfig.generateNodeConfig`. These actions validate payload shape and size where applicable, reserve an `aiActionRequests` row for the actor, and reject rapid repeated calls with a 429-style error.

`convex/aiActionRequests.ts` owns the reservation mutation. It queries the most recent rows by actor and action name, delegates the window check to `convex/aiActionRequestService.ts`, and inserts a new reservation only after the caller is still inside the allowed window. The current implementation does not prune old request rows during reservation, so cleanup or retention should be handled deliberately if request volume grows. The helper service is intentionally small and pure so rate-limit behavior can be tested without invoking provider actions.

Transcription is authenticated-user accessible, accepts only supported audio MIME types, rejects malformed base64, and caps decoded audio at 10MB. Real-time voice requires a compatible `realtime` model default and either the live relay configuration for Google Vertex or the OpenAI realtime configuration for supported OpenAI models. Node configuration generation requires an administrator, trims and bounds prompt, node type, and graph context, then resolves its model through the global workflow model configuration. Keep new provider-backed helper actions behind the same pattern: authenticate first, validate bounded input, reserve the action request, then call the provider through configured model services.

## Authorization And Audit Expectations

Global AI administration should stay super-admin-only unless there is a deliberate product change. Company-scoped AI routes should pass company ids and rely on backend `requireAdmin`, `assertAdminCanAccessCompany`, or feature-specific company checks. Do not use client route checks as the only boundary.

Audit coverage exists across many AI admin mutations: system prompt changes, rule changes, knowledge saves/deletes/repairs, model default and enforcement changes, provider changes, tool and connector changes, widget changes, and safety refusals where implemented. Coverage is not perfectly uniform across older surfaces, so check the target mutation before telling operators an action is audited.

## Verification

Focused tests include:

- `convex/aiModels.test.ts`, `convex/aiModelsActions.test.ts`, `convex/aiModelService.test.ts`, and provider service tests.
- `convex/aiRules.test.ts`, `convex/aiPromptAssembly.test.ts`, and `convex/aiSafetyPolicy.test.ts`.
- `convex/knowledge.test.ts`, `convex/knowledgeActions.test.ts`, `convex/knowledgeService.test.ts`, and `convex/utils/uploadPolicy.test.ts`.
- `convex/aiTools.test.ts`, `convex/aiToolReadTools.test.ts`, `convex/aiToolWriteTools.test.ts`, and `convex/aiToolExecutionService.test.ts`.
- `convex/widgets.test.ts`, `src/app/(dashboard)/admin/companies/[id]/widget/page.test.tsx`, and widget config component tests.
- `convex/analytics.test.ts`, cost component tests under `src/app/(dashboard)/admin/ai/costs/_components/`, and chat admin tests where present.
- `convex/ai.test.ts` for provider-backed helper action input guardrails and `convex/aiActionRequestService.ts` rate-limit behavior.
- `convex/voiceSettings.test.ts`, `convex/voiceRelay.test.ts`, `convex/telephony.test.ts`, and `convex/telephonyService.test.ts` for spoken channels.
- UI tests under `src/app/(dashboard)/admin/ai/**`.

For documentation-only changes, run `git diff --check`. Before merging code changes in this area, follow the full repo gate:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

When touching localized admin UI, keep `messages/en.json` and `messages/it.json` in parity. When touching widgets, manually verify the admin preview, sandbox page, iframe route, allowed-domain behavior, gateway fields, and a normal widget message path.
