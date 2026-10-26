---
product: Hakken
documentation_type: Developer guide
feature_area: AI models providers costs and Decisions
audience: developer
source_repository: roninsatwork/Hakken
source_path: docs/developer/ai-models-providers-and-costs.md
last_reviewed: '2026-10-26T14:30:19+00:00'
reviewed_against: current implementation
status: Current
---
# AI Models, Providers, And Costs Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** AI models providers costs and Decisions
> **Reviewed:** 26 October 2026, 14:30:19 GMT (Europe/London)
> **Source path:** `docs/developer/ai-models-providers-and-costs.md` · **Status:** Current


Core routing, use-case restrictions, embedding fallback and pricing were refreshed. Provider operations and full historical analytics remain separate review work.

Hakken's model administration implementation covers provider health, provider catalog sync, model enablement, use-case defaults, company overrides, runtime model resolution, model pricing metadata, and AI cost analytics. This guide documents the implementation surface so future work can preserve configuration-driven model behavior.

Read this with `docs/developer/ai-administration.md`, `docs/developer/assistant-chat.md`, `docs/developer/agents.md`, and `docs/developer/ai-provider-tool-extension.md` before changing runtime model selection or provider integration code.

## Route Map

Global routes:

- `src/app/(dashboard)/admin/ai/models/page.tsx` renders provider cards, model search/filtering, model enablement, provider sync/test controls, and global defaults.
- `src/app/(dashboard)/admin/ai/models/[id]/page.tsx` edits a model's friendly name and pricing configuration.
- `src/app/(dashboard)/admin/ai/costs/page.tsx` renders global analytics from `api.analytics.getGlobalAnalytics`.

Company routes:

- `src/app/(dashboard)/admin/companies/[id]/ai/models/page.tsx` renders the company model-default implementation and passes company context.
- Older direct company model routes have been removed; keep future company model links under `/admin/companies/[id]/ai/models`.

Cost components live under `src/app/(dashboard)/admin/ai/costs/_components/`:

- `src/app/(dashboard)/admin/ai/costs/_components/AICostsHeader.tsx`: timeframe controls and route header actions.
- `src/app/(dashboard)/admin/ai/costs/_components/AICostsMetricGrid.tsx`: top-level cost and usage metric blocks.
- `src/app/(dashboard)/admin/ai/costs/_components/AICostTimelineChart.tsx`: timeline chart wrapper.
- `src/app/(dashboard)/admin/ai/costs/_components/AICostDistributionCharts.tsx`: model, provider, and token distribution charts.
- `src/app/(dashboard)/admin/ai/costs/_components/AICostLeaderboards.tsx`: company, user, and agent leaderboards.
- `src/app/(dashboard)/admin/ai/costs/_components/MetricBlock.tsx`: compact metric display primitive.
- `src/app/(dashboard)/admin/ai/costs/_components/costFormatters.ts`: display formatting helpers for cost values.
- `src/app/(dashboard)/admin/ai/costs/_components/types.ts`: shared analytics component prop types.

## Backend Modules

`convex/aiModels.ts` is the central model catalog and default module:

- `getModels` and `getActiveModels` are authenticated queries used by model selectors.
- `getModelPickerOptions` is the lightweight authenticated picker query; it returns only the display, provider, use-case, capability, enabled, and headline pricing fields the browser needs.
- `getPaginatedModels` is the super-admin model catalog query. Search, status, and provider filters are applied through database search/index paths so the OpenRouter-scale catalogue is not scanned and sliced in memory.
- `getProviders` returns stored providers plus inferred platform providers for Google Vertex AI, OpenAI, Anthropic, OpenRouter, and TypeSafe.
- `setProviderEnabled` upserts provider status and writes audit metadata.
- `getGlobalModelDefaults`, `setGlobalModelDefault`, and `clearGlobalModelDefault` manage platform defaults.
- `getCompanyModelDefaults`, `setCompanyModelDefault`, and `clearCompanyModelDefault` manage tenant overrides.
- `resolveModelConfigForExecution` and `resolveModelForExecution` are internal runtime resolution paths.
- `resolveEmbeddingModelConfigForExecution` handles embedding-specific resolution and enforces the current Google Vertex 768-dimension vector expectation.
- `toggleModelEnforcement`, `setDefaultModel`, `getModel`, and `updatePricingConfig` support admin catalog and detail workflows.

`convex/aiModelsActions.ts` contains provider actions:

- provider catalog sync for Google, OpenAI, Anthropic, OpenRouter, and TypeSafe
- provider connection tests
- internal health updates through model/provider services

`convex/aiModelService.ts` contains runtime model resolution helpers, provider constants, default use cases, provider-qualified model ids, and cost context helpers. `convex/utils/modelPricing.ts` exposes `isModelCostMeasurable`, the shared rule used by runtime and catalogue UI to decide whether a model has enough pricing metadata for cost budgets or cost labels to mean anything.

`convex/analytics.ts` and `convex/analyticsService.ts` compute global and company cost analytics from messages, daily snapshots, model metadata, provider metadata, token counts, and model pricing fields.

## Data Model

Relevant schema areas in `convex/schema.ts` include:

- `aiProviders`: provider key, display name, enabled state, auth mode, status, sync status, health metadata, settings, and timestamps.
- `aiModels`: model id, provider key, provider model id, display metadata, enabled/default state, capabilities, supported use cases, token limits, pricing fields, pricing source, currency, and sync metadata.
- `aiModelDefaults`: global and company defaults keyed by use case, including model id, provider key, fallback model id, company id, and update metadata.
- `messages`: assistant message token counts, model-used metadata, provider metadata, company/user/thread/agent/widget dimensions.
- `analyticsDailySnapshots`: precomputed usage, leaderboards, and distribution data for historical analytics windows.

Do not add runtime hardcoded model literals. Use the stored model catalog and default resolution paths unless a fallback constant is explicitly part of the service contract.

## Provider Handling

The platform provider keys are Google Vertex AI, OpenAI, Anthropic, OpenRouter, and TypeSafe. TypeSafe is a judgment-only provider: `canProviderServeUseCase` lets it serve the `decision` job and nothing else, and allows other providers for the decision job through text-based judgments (`docs/plans/active/decisions-typesafe-plan.md`). `getProviders` returns inferred provider rows when a provider has not yet been stored so the admin UI can still show the expected platform controls.

Provider enablement is independent from model enablement. A model can be enabled but hidden from active selectors if its provider is disabled. `getActiveModels` filters disabled providers before returning selectable models.

The model catalogue is built for gateway-provider scale. `MODEL_CATALOG_LIMIT`
is currently 2,000 for full-catalogue reads that genuinely need every row, while
the visible catalogue uses `getPaginatedModels` and indexed pagination. If a
rollup reaches the full-catalogue limit it reports `isPartial` rather than
presenting a truncated count as complete.

Provider sync and test actions should keep provider-specific API details in provider services and actions. Runtime callers should consume normalized model metadata and resolved model config.

## Model Defaults And Resolution

Defaults are use-case based. Supported default slots come from `DEFAULT_MODEL_USE_CASES` in `convex/aiModelService.ts`: `chat`, `fast-chat`, `agent`, `workflow`, `report`, `router`, `title`, `transcription`, `speech`, `vision`, `realtime`, `embedding`, and `decision`.

Do not confuse default slots with catalog capabilities or catalog use-case filters. The model catalog UI can filter models by capabilities such as `vision` and `tool-calling`, and provider sync can store those capability tags on model rows. `vision` is a default slot because image-bearing assistant turns use it; `tool-calling` is still a capability/use-case tag rather than a standalone default slot.

Default mutations validate that:

- the use case is supported
- the selected model exists
- the selected model is enabled
- the model supports the requested use case
- the provider is not disabled

Company defaults override global defaults. If a company default is missing or invalid, resolution falls back to the global default for the same use case. If configured defaults are unavailable, runtime resolution falls back to legacy default model rows through the shared model service.

Embedding resolution is stricter. The current vector index expects 768 dimensions, so `resolveEmbeddingModelConfigForExecution` requires a compatible Google Vertex embedding model and returns explicit embedding dimension metadata. When no configured embedding default is available, it falls back to the Google Vertex `text-embedding-005` failsafe with 768 dimensions.

## Pricing And Cost Computation

The model detail page writes pricing fields through `updatePricingConfig`. The editable fields include:

- friendly name
- standard input cost below and above 200k tokens
- cached input cost below and above 200k tokens
- output response cost
- output reasoning cost

Pricing metadata is used by analytics cost estimates through `buildModelCostContext` and `computeCostFromMap`. The implemented calculation currently reads `standardInputCostBelow200k`, `standardInputCostAbove200k`, and `outputResponseCost`; the shared runtime calculator also consumes cached-input rates when a caller provides cached-token counts. `computeCostFromMap` passes only input/output counts, so aggregate message analytics do not apply that cache split. The separate reasoning-output field is not independently consumed by this calculator. Analytics and cost formatters currently report USD without the former hardcoded GBP conversion.

OpenRouter provider sync can populate provider-supplied prices. Other providers
may leave prices unset, and `isModelCostMeasurable` treats a model with no
positive standard-input or response-output price as not measurable. A missing
price should not be interpreted as a free model.

Treat these values as operational analytics inputs. Do not reuse them for customer billing unless billing-specific validation, currency, exchange-rate, and reconciliation controls are added.

## Analytics Implementation

Global analytics:

- `getGlobalAnalytics` requires super-admin access.
- It combines historical `analyticsDailySnapshots` with recent raw assistant messages.
- Historical snapshots store model metrics but not provider distribution, so provider distribution is populated from the live raw overlay rather than from full historical provider totals.
- It returns timeline, aggregate totals, provider distribution, model distribution, company leaderboard, user leaderboard, and agent leaderboard.

Company metrics:

- `getCompanyMetrics` requires admin access to the target company.
- It combines company snapshots with recent company-scoped messages and agent transactions.
- Company snapshots also lack provider distribution, so long-window provider charts should be treated as partial until provider metrics are added to snapshot rows.
- It returns tenant-level timeline, aggregates, distributions, and leaderboards.

The admin AI costs route uses `getGlobalAnalytics` with fixed or custom timeframe arguments. The UI chooses daily, weekly, or monthly labels based on backend aggregation type.

## Authorization And Audit

Preserve these boundaries:

- Model catalog administration, provider state, global defaults, company defaults, and pricing edits require super-admin access in the current implementation.
- Public selector queries require authentication but not super-admin access because assistant, agent, and workflow UIs need active model choices.
- Global analytics require super-admin access.
- Company analytics require admin access to the company.

Audit action types include provider enablement, global default changes, company default changes, model enforcement changes, legacy default changes, and pricing updates. Check the target mutation before promising audit coverage for a new operation.

## Tests And Verification

Focused tests include:

- `convex/aiModels.test.ts`
- `convex/aiModelsActions.test.ts`
- `convex/aiModelService.test.ts`
- provider service tests such as `convex/openaiProviderService.test.ts`
- `convex/analytics.test.ts`
- `convex/analyticsService.test.ts`
- cost component tests under `src/app/(dashboard)/admin/ai/costs/_components/`
- model page tests under `src/app/(dashboard)/admin/ai/models/`

When changing UI labels, keep `messages/en.json` and `messages/it.json` in parity. When changing runtime resolution, run the full repository verification gate from `AGENTS.md`; documentation-only changes should at least run `git diff --check`.

## Current Routing And Pricing Details

`DEFAULT_MODEL_USE_CASES` is the authoritative default-slot list. Reasoning and tool-calling catalog tags are not standalone default slots. `canProviderServeUseCase` restricts TypeSafe to decision while allowing text providers to serve decision, restricts embedding/transcription/speech/vision to Google, realtime to Google or OpenAI, and agent/workflow to the four supported agent providers. Individual model capabilities and enabled state still matter. The provider registry for text generation is separate from the agent adapter contract.

`getUseCaseDefaultModel` tries company primary, company fallback, global primary and global fallback using model servability and the use-case policy. `resolveModelConfig` combines that choice with an explicitly requested servable model or the legacy default rows, then the shared resolver's failsafe. A model request and a configured use-case default are distinct branches: do not assume this helper independently validates every requested model's capability for every caller. Agent override setters and other entry points perform their own restrictions.

`getDisabledProviderKeys` reads disabled rows through `by_enabled`. Legacy model rows without provider identity are inferred as Google; source checks are needed before asserting a legacy row follows every disabled-provider case identically. Model/default mutations validate supported use case, model existence, enabled state, provider policy and capability. Global defaults use `by_scope_use_case`; company defaults use `by_company_use_case`. Reads of defaults/catalog use platform read builders, including read-only accounts; writes and sync/test actions remain super-admin-only. Lightweight authenticated pickers intentionally return a narrower shape.

`resolveEmbeddingModelConfigForExecution` uses the configured default path but enforces Google and embedding support, returning dimension metadata of 768. Its compiled fallback is `GOOGLE_VERTEX_EMBEDDING_MODEL_ID`, currently `text-embedding-005`, with a separate embedding location constant of `europe-west2`. A fallback constant is implementation evidence, not a guarantee that a provider still serves it in a deployed environment. No external provider check was performed for this pass.

`calculateModelCostUsd` prices uncached and cached input separately, clamping the cached count within total input. Rates are per million tokens. Above two hundred thousand input tokens it uses the positive high-tier standard rate or falls back to the standard lower-tier rate; positive cached pricing is used when available, otherwise standard applies. Output uses `outputResponseCost`. Negative token totals are clamped in the calculation. No separate reasoning-output addend appears in this function.

`modelSpend.ts` writes common model-call accounting to `agentTransactions`, resolving the owning agent, system role or lazily created Platform AI agent. `generationSpend` carries model/provider identifiers and input/output/cached usage. Decisions keep cost on `decisionRuns`. The analytics message helper separately calls the calculator without cached usage, and historical snapshots retain their own stored metrics. Do not present every analytics screen as an exhaustive sum of all ledgers or infer customer revenue from supplier spend. Current cost formatters emit dollars; no runtime FX lookup was added or performed.

`isModelCostMeasurable` checks whether standard input or response output has a positive price. The predicate does not validate invoice completeness. Unpriced agent models receive conservative budgets, as documented in [Agents](./agents.md). Current prices from a sync or manual entry remain operational metadata; provider bills and Stripe customer billing need separate reconciliation.


## Decisions Policy And Call Flow

`decisions.ts` implements platform/company list/detail and audited mode mutations. Platform reads/writes are super-admin; company operations use admin wrappers plus tenant access. `decisionSettings` resolves company row, global row, then the static registry default. The registered question and stakes come from `decisionRegistry.ts`; mode editing does not add arbitrary executable Decision definitions.

`decisionActions.runDecisions` validates keys and unique request IDs, resolves modes once or accepts matching prepared context, and batches enabled questions over shared state. `prepareDecisions` avoids model resolution when all keys are off. The stored `decision` use case can resolve TypeSafe or any supported text adapter; a failsafe source records `NO_MODEL` and uses caller fallback. TypeSafe gets a bounded two-attempt request; provider failures or missing answers record rule fallback. Caller mistakes such as unknown keys or duplicate request IDs still throw, so provider fallback must not be described as swallowing all errors.

`decisionService.ts` maps yes/no probability to distance from 0.5, doubled, and maps other confidence directly into a band. TypeSafe sure/fairly-sure boundaries are 0.7/0.4; text-model boundaries are 0.85/0.6. These are decision-policy thresholds, not calibrated correctness promises for ordinary model self-estimates. Off, rule source, or no certainty yields `RULES`. Ask mode yields `ASK_A_PERSON`; Act yields `ACT` at sure certainty, or fairly sure for low stakes only. An answer with no actionable effect is recorded rather than reported as acted/handed over. The caller remains responsible for applying a result and implementing any real handoff.

`recordRunsInternal` stores per-question evidence in `decisionRuns`. Model-call usage is carried on the first relevant row, with cost shares attributed across model-answered questions. `decisionLedger.callsOf` recognizes the model-bearing rows so aggregate call counts do not count every question as a separate model request. There is no duplicate ordinary agent transaction for each Decision call. Decision Maker is the ledger owner label, not an agent to launch manually. Derived ledger rows can use a success status for recorded model calls; that display is not provider-side execution acceptance.

Weekly counts query 501 rows per Decision and expose at most 500 with an at-least/capped indication. Detail returns 50 recent rows. Company/global indexes and bounded ledger reads must retain their scope and truncation semantics. `keepRules.ts` gives Decision run history a separate retention policy; do not infer permanent item-level history from permanent daily snapshots. `decisions.test.ts`, `decisionActions.test.ts`, `decisionService.test.ts`, and `decisionLedger.test.ts` demonstrate local mode, fallback, band, and accounting contracts.

## Provider Discovery, Health, And Upsert Effects

`aiModelsActions.ts` exposes super-admin catalog syncs and connection checks. Vertex lists its live account/location catalog and walks provider pages; it no longer seeds a curated substitute. OpenAI lists models through the configured API key and refuses an empty result. Anthropic reads its models endpoint, OpenRouter supplies catalog modality/context/pricing metadata, and TypeSafe rows are stamped solely for the Decision use case with namespaced catalog identifiers. TypeSafe cannot generate ordinary text through `aiProviderRegistry`.

`internalBatchUpsert` creates or updates provider/model metadata. It enables the provider record, creates new model rows disabled, preserves existing model enablement, and conditionally updates optional metadata so an omitted provider price/token limit does not erase saved values. Sync is therefore a configuration mutation, not a purely observational health probe. It does not remove every historical row missing from a new listing. Catalog visibility and classification are not proof of generation, grounding, or tool-call compatibility.

`probeProviderInternal` lists models for Google Vertex, OpenAI, Anthropic, OpenRouter, or TypeSafe. It updates healthy/error status and a readable connection message without enabling the provider. `testProviderConnection` delegates to that same body; scheduled probes use the same listing contract. No generation is intentionally purchased for this check. A provider can list successfully while a particular generation feature still fails. Errors are recorded as health information; the configuration-selected runtime separately resolves enabled state and supported use case.

Backend variable names include `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `OPENAI_API_KEY` (with retained OpenAI aliases), `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, and `TYPESAFE_API_KEY`. Values must remain outside docs and frontend payloads. Configuration presence is weaker evidence than a live list, and a live list is weaker than an accepted real feature workflow.

Provider tests exercise injected fetch/configuration paths; no sync, probe, paid generation, or provider-side diagnostic was executed for this maintenance pass. The reviewed behavior is local implementation. Live deployments and rename cutover remain separate. The extension guide links the registry/adapter/tool responsibilities without treating a provider-card health badge as universal runtime acceptance.
