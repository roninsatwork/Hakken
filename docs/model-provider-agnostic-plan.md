# Model Provider Agnostic Platform Plan

This plan turns Sonae from a mostly Vertex/Gemini-backed model catalogue into a provider-agnostic AI platform that can support Gemini, OpenAI, Anthropic, and future providers without leaking provider-specific logic through the app.

Use this as the locked source of truth for model/provider work. Follow the phases in order unless the user explicitly changes scope.

## Goal

Sonae should let admins manage models across multiple providers while the rest of the app asks for provider-neutral capabilities and use cases.

The platform should support:

- Google Vertex AI as the current Google provider, with Gemini as the model family currently exposed through Vertex.
- OpenAI models.
- Anthropic models.
- Provider-specific sync, health checks, credentials, and advanced settings.
- Provider-neutral runtime selection for chat, agents, workflows, reports, transcription, embeddings, and tool calling.
- Analytics dashboards that can report usage and cost by provider, model, capability, tenant, agent, user, and time period.

## Current Findings

The current codebase is already partially prepared for provider-neutral work, but the implementation is still mostly single-provider in important places:

- `convex/aiModels.ts` stores model catalogue rows and supports enable/default/pricing, but rows are still centered on `modelId` rather than provider + provider model ID + capabilities.
- `convex/aiModelService.ts` resolves a string model ID and still has a Gemini failsafe literal.
- `convex/aiModelsActions.ts` exposes `syncVertexModels` and upserts a curated Google Vertex AI catalogue of Gemini models only.
- `convex/vertexProviderService.ts` is the only concrete generation provider adapter.
- `convex/ai.ts`, `convex/agentRuntime.ts`, `convex/orchestrator.ts`, and `convex/salesReportActions.ts` construct or use Google/Vertex request/response shapes directly.
- RAG embeddings now resolve through the dedicated embedding resolver, with `"text-embedding-004"` retained as the explicit Google Vertex 768-dimension fallback.
- `messages` and `agentTransactions` store `modelUsed`, but not provider, capability, use case, or normalized model identity.
- `analyticsDailySnapshots.modelMetrics` stores `{ model, cost, calls }`, but not provider or capability dimensions.
- AI running-cost dashboards show model distribution but not provider distribution.
- `src/app/(dashboard)/admin/ai/models/page.tsx` has a single sync action and no provider filter, capability columns, or default-by-use-case controls.
- `src/app/(dashboard)/admin/ai/models/[id]/page.tsx` edits pricing but does not expose provider metadata, capabilities, context window, health status, or provider-specific advanced fields.
- Drift tests already guard accidental Gemini-era language, so this work should extend that guard rather than weaken it.

## Non-Drift Rules

- Generic app/runtime code must not import provider SDKs.
- Provider names belong only in:
  - provider adapters,
  - provider sync actions,
  - provider settings UI,
  - provider-specific docs/tests,
  - real provider model IDs.
- Runtime code should ask for a use case or capability, not a provider literal.
- Existing tenant isolation and super-admin-only model management must remain intact.
- Model cost analytics must preserve historical accuracy when model pricing changes.
- Admin dashboards must keep bounded reads and existing analytics snapshot behavior.
- Model defaults must be explicit and testable; avoid a single ambiguous `isDefault` once multiple use cases exist.
- Embeddings must remain dimension-compatible with the current vector index unless a separate vector migration is planned.

## Target Architecture

### Provider Records

Add a first-class provider configuration layer.

Recommended table: `aiProviders`

Fields:

- `providerKey`: `"google"` | `"openai"` | `"anthropic"` | future string.
- `displayName`.
- `isEnabled`.
- `authMode`: environment secret, managed key, OAuth, or future mode.
- `status`: unknown, healthy, degraded, disabled, error.
- `lastHealthCheckAt`.
- `lastSyncedAt`.
- `syncStatus`.
- `settings`: provider-specific JSON string or typed object for safe non-secret settings.
- `createdAt`, `updatedAt`.

Secrets should stay in environment variables or a secure secret manager, not in ordinary Convex rows.

### Model Records

Extend `aiModels` into a normalized catalogue.

Recommended fields:

- `providerKey`.
- `providerModelId`.
- `modelId`: stable internal ID or provider-qualified ID such as `openai:gpt-4.1-mini`.
- `displayName`.
- `friendlyName`.
- `description`.
- `isEnabled`.
- `status`.
- `capabilities`: text, reasoning, vision, audio, tool-calling, json-mode, streaming, embeddings.
- `supportedUseCases`: chat, agent, workflow, report, router, transcription, embedding, title.
- `contextWindowTokens`.
- `maxOutputTokens`.
- `inputTokenUnit`.
- `outputTokenUnit`.
- `standardInputCostBelow200k`.
- `standardInputCostAbove200k`.
- `cachedInputCostBelow200k`.
- `cachedInputCostAbove200k`.
- `outputResponseCost`.
- `outputReasoningCost`.
- `currency`.
- `pricingSource`.
- `pricingEffectiveAt`.
- `lastSyncedAt`.

Keep old fields during migration, but treat provider-aware fields as the new source of truth.

### Defaults By Use Case

Replace one global default model with explicit defaults by purpose.

Recommended table: `aiModelDefaults`

Fields:

- `scope`: global or company.
- `companyId`: optional.
- `useCase`: chat, fast-chat, reasoning, agent, workflow, report, router, transcription, embedding, title, vision, tool-calling.
- `providerKey`.
- `modelId`.
- `fallbackModelId`: optional.
- `updatedAt`, `updatedBy`.

Default selection should support:

- global platform default,
- optional company override,
- requested model if enabled and permitted,
- fallback model by use case,
- final failsafe only as a provider-aware internal setting.

### Provider Adapter Interface

Create a provider-neutral adapter interface and keep provider SDK details behind adapter files.

Recommended internal request:

```ts
type AiGenerationRequest = {
  model: ResolvedAiModel;
  useCase: AiModelUseCase;
  systemInstruction?: string;
  messages?: AiMessage[];
  contents?: AiContentPart[];
  tools?: AiToolDeclaration[];
  responseFormat?: "text" | "json";
  jsonSchema?: unknown;
  temperature?: number;
  reasoningEffort?: "LOW" | "MEDIUM" | "HIGH";
};
```

Recommended normalized response:

```ts
type AiGenerationResponse = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  toolCalls?: AiToolCall[];
  rawProviderResponse?: unknown;
};
```

Provider files:

- `convex/googleProviderService.ts` or keep `vertexProviderService.ts` for the concrete Google adapter.
- `convex/openaiProviderService.ts`.
- `convex/anthropicProviderService.ts`.
- `convex/aiProviderRegistry.ts` for provider selection.
- `convex/aiRuntimeService.ts` for provider-neutral request/response construction.

## Phase 1: Schema And Catalogue Foundation

Goal: add provider-aware model/provider data without breaking existing runtime.

Tasks:

- Add `aiProviders` table.
- Extend `aiModels` with provider-aware fields.
- Add indexes for provider/status/default lookup.
- Add `aiModelDefaults` for use-case defaults.
- Add migration/backfill:
  - existing Gemini rows get `providerKey: "google"`,
  - existing `modelId` becomes provider-qualified or maps to `providerModelId`,
  - existing `isDefault` becomes default for current chat/agent/report use cases.
- Keep legacy `isDefault` temporarily for compatibility.
- Update seed/sync tests and drift checks.

Acceptance:

- Existing model rows remain readable.
- Existing agents keep working.
- Admin model list can show provider values for old and new rows.
- Tests cover model backfill/default compatibility.

Status:

- Started and foundation slice completed:
  - added `aiProviders` and `aiModelDefaults`,
  - extended `aiModels` with optional provider, provider model ID, capability, use-case, context, status, pricing metadata, and provider indexes,
  - kept existing runtime compatibility by leaving legacy `modelId` and `isDefault` behavior intact,
  - updated Vertex/Gemini sync to record provider key `google`, provider display name `Google Vertex AI`, provider model IDs, capabilities, and supported use cases,
  - setting the legacy default model now seeds global use-case defaults for the future resolver,
  - disabling a legacy default clears matching global use-case defaults,
  - added focused regression coverage for provider metadata and global use-case default seeding.

## Phase 2: Provider Sync And Settings

Goal: make model sync/provider status multi-provider.

Tasks:

- Replace single `syncVertexModels` UX with provider-specific sync actions:
  - `syncGoogleModels`,
  - `syncOpenAIModels`,
  - `syncAnthropicModels`.
- Add provider settings/status queries and mutations.
- Add connection test actions per provider.
- Store sync metadata and health status.
- Keep provider API keys out of ordinary DB records.
- Update admin UI:
  - provider filter,
  - provider status indicators,
  - sync selected provider,
  - sync all enabled providers,
  - connection test buttons.
- Keep English/Italian locale parity.

Acceptance:

- Super-admins can manage provider availability.
- Non-super-admins cannot sync or configure providers.
- Sync failures are visible but do not delete existing model rows.
- Provider-specific terms appear only in provider settings/sync areas.

Status:

- Started and first Google provider slice completed:
  - added `aiModels.getProviders`,
  - added provider-filtered model pagination,
  - added `aiModelsActions.syncGoogleModels`,
  - kept `syncVertexModels` as a compatibility alias,
  - updated existing Google/Vertex sync tests to assert provider metadata and super-admin access.
- Continued with multi-provider sync slice:
  - added `syncOpenAIModels`,
  - added `syncAnthropicModels`,
  - OpenAI sync uses the account's live `GET /v1/models` catalogue and filters to text-generation models,
  - Anthropic sync uses the account's live `GET /v1/models` catalogue,
  - provider sync keeps API keys in environment variables and fails clearly when keys are missing,
  - the model screen exposes provider-specific sync buttons for Google, OpenAI, and Anthropic.
- Continued with provider operations slice:
  - provider records for Google Vertex AI, OpenAI, and Anthropic now appear even before first sync,
  - added super-admin provider enable/disable controls,
  - added provider connection tests that update health status and sanitized readiness messages without storing secrets,
  - active model selectors now hide models from explicitly disabled providers,
  - added regression coverage for default provider rows and provider disable status.

## Phase 3: Model Selection Screen Redesign

Goal: turn the model screen into a true provider-agnostic control surface.

Tasks:

- Replace the current model table columns with:
  - provider,
  - display/friendly name,
  - provider model ID,
  - status,
  - capabilities,
  - supported use cases,
  - context window,
  - pricing summary,
  - last synced,
  - health/test status.
- Add filters:
  - provider,
  - enabled/disabled,
  - capability,
  - use case,
  - search.
- Add default assignment controls:
  - chat,
  - fast chat,
  - reasoning,
  - agent,
  - workflow,
  - report,
  - router/title,
  - embedding,
  - transcription/vision where supported.
- Move pricing and provider metadata into model detail.
- Add provider-specific advanced fields only inside a clearly scoped provider section.
- Keep admin pagination at 15 rows unless a product requirement changes it.

Acceptance:

- Admins can understand which provider/model powers each use case.
- The table is useful with Gemini, OpenAI, and Anthropic rows mixed together.
- No runtime provider assumptions are introduced in React pages.

Status:

- Started with model list provider visibility:
  - model list now reads providers,
  - added provider filter,
  - added provider column,
  - displays provider model ID where available,
  - updated e2e Convex mock and model page tests for provider-aware list queries.
- Continued with catalogue filter and metadata slice:
  - added capability and use-case filters to the bounded model catalogue query,
  - model search now also matches provider-native model IDs,
  - the admin model list now exposes capability and supported-use-case columns,
  - older rows without normalized metadata render as unclassified/inherited instead of disappearing,
  - added regression coverage for UI filter arguments and backend provider/capability/use-case filtering.
- Continued with model detail metadata slice:
  - renamed the detail page from pricing-only to model configuration,
  - added read-only provider, provider-native model ID, internal model ID, status, context window, output limit, sync, pricing source, token unit, currency, and effective-date metadata,
  - added capability/use-case chips so model selectors, defaults, and analytics fields can be audited from the detail page,
  - replaced provider-specific cached-input copy with neutral provider-caching language while keeping existing pricing controls intact.
- Continued with platform defaults control slice:
  - added global model-default query/mutations by use case,
  - the main model admin screen now exposes platform defaults for each runtime use case,
  - company, agent, and workflow override screens can now inherit from explicit platform use-case defaults rather than one broad legacy default.

## Phase 4: Runtime Resolver And Adapter Migration

Goal: remove direct provider coupling from generation paths.

Targets:

- `convex/aiModelService.ts`.
- `convex/ai.ts`.
- `convex/agentRuntime.ts`.
- `convex/orchestrator.ts`.
- `convex/salesReportActions.ts`.
- Workflow agent execution.
- Transcription/title generation.

Tasks:

- Change `resolveModelForExecution` to return a full `ResolvedAiModel`, not only a string.
- Add `resolveModelForUseCase`.
- Add company-aware defaults and fallback behavior.
- Add adapter registry by `providerKey`.
- Move Google request/response construction into Google adapter.
- Add OpenAI adapter.
- Add Anthropic adapter.
- Normalize:
  - messages,
  - multimodal parts,
  - JSON schema/structured output,
  - tool declarations/tool calls,
  - reasoning settings,
  - token usage.
- Make unsupported capability failures explicit:
  - no tool calling,
  - no vision,
  - no JSON mode,
  - no audio/transcription.
- Replace user-facing provider-specific errors with neutral errors.

Acceptance:

- Chat, agents, workflows, reports, title generation, and router paths use provider-neutral calls.
- Tests prove requested model, default use-case model, company override, disabled model, and fallback behavior.
- Provider-specific SDK imports are isolated to adapter files.

Status:

- Started with provider-aware resolver/runtime compatibility slice:
  - added `resolveModelConfigForExecution` returning stable Sonae `modelId`, `providerKey`, provider-native `providerModelId`, and source,
  - kept legacy `resolveModelForExecution` as a string-returning compatibility shim,
  - resolver now honors global use-case defaults without requiring the legacy `isDefault` flag,
  - chat, transcription, title generation, and workflow node configuration now resolve by use case and pass provider-native IDs to the current Google Vertex execution path,
  - current non-Google runtime selection fails explicitly instead of accidentally routing through Vertex,
  - added regression coverage for provider-aware resolver output and legacy shim behavior.
- Continued with adapter boundary slice:
  - added provider-neutral runtime request/response types,
  - added `aiProviderRegistry`,
  - added Google, OpenAI, and Anthropic text-generation adapters,
  - chat and title generation now call the provider registry instead of constructing the final generation request directly,
  - OpenAI uses the Responses API without adding an SDK dependency,
  - Anthropic uses the Messages API without adding an SDK dependency,
  - Google thinking-level behavior is preserved inside the Google adapter,
  - current OpenAI/Anthropic adapters intentionally support text-only runtime paths until multimodal/tool/structured-output adapters are added.

## Phase 5: Embeddings And RAG Provider Strategy

Goal: make embeddings provider-aware without breaking the vector index.

Tasks:

- Add an embedding use-case default.
- Store embedding provider/model metadata on knowledge chunks or documents.
- Keep current vector index dimension until a migration is explicitly planned.
- Add support for provider embedding adapters only when dimensions match or a new vector index is created.
- Update ingestion and RAG query paths to resolve embedding model by use case.
- Document whether the first version keeps Google embeddings as a stable default while generation providers become multi-provider.

Acceptance:

- RAG remains stable.
- Knowledge chunks record which embedding model produced vectors.
- No mixed-dimension vectors enter the current index.

Status:

- Started with stable Google Vertex embedding metadata slice:
  - added a dedicated embedding resolver that falls back to `text-embedding-004`,
  - kept the current 768-dimension vector index as the hard compatibility boundary,
  - embedding defaults must resolve to Google Vertex and support the `embedding` use case or fail explicitly,
  - document ingestion, assistant RAG, agent RAG, and swarm RAG now resolve the embedding model instead of using a hidden model literal,
  - knowledge documents and chunks now persist embedding provider, stable model ID, provider model ID, and vector dimensions,
  - added regression coverage for fallback embedding resolution, non-Google default rejection, and chunk/document embedding metadata persistence.

## Phase 6: Telemetry, Transactions, And Analytics Dimensions

Goal: make analytics dashboards provider-aware and historically accurate.

Tasks:

- Extend message and transaction telemetry with:
  - `providerKey`,
  - `providerModelId`,
  - normalized `modelId`,
  - `modelDisplayName`,
  - `useCase`,
  - `capabilitiesUsed`,
  - `inputTokens`,
  - `outputTokens`,
  - optional `reasoningTokens`,
  - optional `cachedInputTokens`,
  - `pricingVersion` or pricing snapshot.
- Add provider/model metadata to `agentTransactions`.
- Update `analyticsDailySnapshots.modelMetrics` to include:
  - provider,
  - model,
  - display name,
  - cost,
  - calls,
  - input/output/reasoning/cached tokens.
- Update `buildModelCostContext` and cost calculation for provider-specific pricing units.
- Preserve existing `modelUsed` for backward compatibility during migration.
- Add a backfill for historical rows:
  - infer provider from model catalogue where possible,
  - mark unknown provider explicitly when not possible.

Acceptance:

- Historical analytics still render.
- New analytics can group by provider and by model.
- Cost calculation does not silently use the wrong provider pricing.

Status:

- Started with provider telemetry and cost lookup slice:
  - added optional `providerKey` and `providerModelId` telemetry to assistant messages and agent transactions,
  - added provider/time indexes for scalable future provider analytics reads,
  - assistant message persistence now stores provider metadata when runtime resolution provides it,
  - `buildModelCostContext` now aliases stable model IDs, provider model IDs, and provider-qualified IDs so legacy and future rows price consistently,
  - added tests for provider telemetry persistence and provider-aware cost lookup.

## Phase 7: Analytics Dashboard Updates

Goal: include model/provider selection and reporting in dashboards.

Targets:

- Global admin overview.
- AI running costs dashboard.
- Company dashboard.
- User cost views.
- Agent transaction views.

Tasks:

- Add provider distribution chart.
- Keep model distribution chart, but include provider label/chip.
- Add provider filter to AI costs where useful.
- Add use-case filter if telemetry supports it.
- Update top agents/users/companies to include provider/model breakdown when drilling in.
- Show unknown/legacy provider rows clearly.
- Keep chart empty/loading behavior stable.
- Add tests for provider/model chart rows and legacy fallback rows.

Acceptance:

- Admin can answer:
  - which provider is costing the most,
  - which models are used most,
  - which provider/model powers each company or agent,
  - whether unknown legacy rows remain.
- Existing charts do not regress when provider fields are absent.

Status:

- Started with backend dashboard payload support:
  - company analytics now returns `providerDistribution`,
  - global analytics now returns `providerDistribution`,
  - model distribution names resolve from provider-aware model cost metadata where available,
  - legacy rows without provider metadata remain supported through an explicit `unknown` provider bucket.
- Continued with AI costs dashboard provider visibility:
  - added provider distribution typing to the AI costs dashboard payload,
  - rendered a provider distribution chart alongside model invocations and token flux,
  - labels known providers clearly and keeps unknown/legacy rows visible,
  - added chart tests for empty and populated provider distribution states.
- Continued with global admin overview provider visibility:
  - rendered provider distribution on the main admin overview alongside model logistics and token flux,
  - reused provider labels for Google Vertex AI, OpenAI, Anthropic, and unknown/legacy rows,
  - added a focused overview regression test so the provider chart remains wired to the global analytics payload.
- Continued with tenant dashboard provider visibility:
  - added provider usage sections to the super-admin company overview and organization settings dashboard,
  - tenant views now show provider calls and cost without requiring the global AI costs dashboard,
  - added organization dashboard regression coverage for provider usage rows.

## Phase 8: Agent, Workflow, And Company-Level Controls

Goal: let the platform choose models globally while still allowing safe local overrides.

Tasks:

- Agents should store either:
  - explicit model override, or
  - use-case/default binding.
- Workflows should support model use-case selection for AI nodes.
- Companies may optionally override model defaults by use case.
- Validate that selected models support the required capabilities.
- Prevent admins from selecting disabled models or providers outside their allowed scope.
- Add UI indicators showing inherited versus overridden model choices.

Acceptance:

- Model choice is clear at global, company, agent, and workflow levels.
- Disabled providers/models cannot be selected accidentally.
- Runtime selection is predictable and auditable.

Status:

- Started with agent/workflow inherited-vs-override selection slice:
  - added optional `modelSelectionMode` on agents while preserving legacy `modelId` compatibility,
  - new global agents inherit the platform agent default by default,
  - new inline workflow agents inherit the workflow default by default,
  - explicit overrides are validated against enabled models, enabled providers, and required use-case support,
  - inherited agent/runtime paths resolve through use-case defaults instead of forcing the stored compatibility `modelId`,
  - agent settings and workflow agent editor now expose inherited versus override model selection,
  - added regression coverage for inherited creation, valid overrides, disabled model rejection, unsupported use-case rejection, and returning from override to inherited defaults.
- Continued with company-level defaults slice:
  - added super-admin query/mutations for company model defaults by use case,
  - company overrides reuse the existing `aiModelDefaults` table with `scope: "company"`,
  - overrides are validated against supported use cases, enabled models, and enabled providers,
  - clearing an override returns that company/use case to the platform default,
  - added a company `AI Models` tab for managing inherited versus overridden defaults,
  - added backend regression coverage for set, clear, company resolver behavior, unauthorized access rejection, disabled model rejection, disabled provider rejection, and unsupported use-case rejection.

## Phase 9: Tests, Drift, And Rollout

Goal: make multi-provider behavior hard to regress.

Tasks:

- Add provider-neutral drift tests:
  - no provider SDK imports outside adapter files,
  - no hardcoded provider model IDs in generic runtime,
  - generic UI labels stay provider-neutral,
  - provider-specific copy remains allowlisted.
- Add resolver tests for:
  - requested model,
  - default use case,
  - company override,
  - disabled provider,
  - missing capability,
  - final fallback.
- Add adapter contract tests with mocked provider responses.
- Add analytics tests for provider/model breakdown.
- Add UI tests for model screen filters/defaults.
- Add migration/backfill tests.

Acceptance:

- `npm run check`, `npm run lint:all`, `npm run build`, and `git diff --check` pass.
- Generic runtime paths remain provider-neutral.
- Multi-provider analytics work with new and legacy telemetry.

Status:

- Started with provider drift guard slice:
  - added a quality drift guard that keeps provider SDK imports in classified adapter/transitional runtime files,
  - added a quality drift guard that blocks unclassified provider model ID literals from leaking into generic app/runtime files,
  - kept current Google-specific schema/tool/search runtime files explicitly classified until those flows are migrated to fully provider-neutral adapters,
  - the drift suite now covers 30 guardrail tests and catches future unclassified model/provider coupling.

## Recommended Execution Order

1. Phase 1: schema/catalogue/default foundation.
2. Phase 2: provider sync/settings.
3. Phase 3: model selection screen redesign.
4. Phase 4: runtime resolver and adapters.
5. Phase 5: embeddings/RAG provider strategy.
6. Phase 6: telemetry and analytics dimensions.
7. Phase 7: analytics dashboard updates.
8. Phase 8: agent/workflow/company model controls.
9. Phase 9: tests, drift, and rollout.

## Open Product Decisions

Decide these before implementation:

- Should company admins be allowed to set company-level model defaults, or only super-admins?
- Should provider API keys be global only, or can companies bring their own keys later?
- Should OpenAI/Anthropic be enabled initially for generation only while embeddings stay on the current Google embedding model?
- Which use cases need separate defaults at launch: chat, agent, workflow, report, router/title, embedding, transcription?
- Should pricing be stored in USD and converted to GBP, or stored directly in GBP per model?
- Should model IDs be displayed as provider-qualified IDs everywhere, or only inside admin screens?

## Verification Checklist

Before merging any implementation phase:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

Before promoting to `main`, also run:

```bash
npm audit --audit-level=high
npm run lint
npm run typecheck
npm run test:run
npm run build
```
