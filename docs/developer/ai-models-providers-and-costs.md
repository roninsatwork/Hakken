# AI Models, Providers, And Costs Developer Guide

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
- `getProviders` returns stored providers plus inferred platform providers for Google Vertex AI, OpenAI, Anthropic, and OpenRouter.
- `setProviderEnabled` upserts provider status and writes audit metadata.
- `getGlobalModelDefaults`, `setGlobalModelDefault`, and `clearGlobalModelDefault` manage platform defaults.
- `getCompanyModelDefaults`, `setCompanyModelDefault`, and `clearCompanyModelDefault` manage tenant overrides.
- `resolveModelConfigForExecution` and `resolveModelForExecution` are internal runtime resolution paths.
- `resolveEmbeddingModelConfigForExecution` handles embedding-specific resolution and enforces the current Google Vertex 768-dimension vector expectation.
- `toggleModelEnforcement`, `setDefaultModel`, `getModel`, and `updatePricingConfig` support admin catalog and detail workflows.

`convex/aiModelsActions.ts` contains provider actions:

- provider catalog sync for Google, OpenAI, and Anthropic
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

The platform provider keys are Google Vertex AI, OpenAI, Anthropic, and OpenRouter. `getProviders` returns inferred provider rows when a provider has not yet been stored so the admin UI can still show the expected platform controls.

Provider enablement is independent from model enablement. A model can be enabled but hidden from active selectors if its provider is disabled. `getActiveModels` filters disabled providers before returning selectable models.

The model catalogue is built for gateway-provider scale. `MODEL_CATALOG_LIMIT`
is currently 2,000 for full-catalogue reads that genuinely need every row, while
the visible catalogue uses `getPaginatedModels` and indexed pagination. If a
rollup reaches the full-catalogue limit it reports `isPartial` rather than
presenting a truncated count as complete.

Provider sync and test actions should keep provider-specific API details in provider services and actions. Runtime callers should consume normalized model metadata and resolved model config.

## Model Defaults And Resolution

Defaults are use-case based. Supported default slots come from `DEFAULT_MODEL_USE_CASES` in `convex/aiModelService.ts`: `chat`, `fast-chat`, `reasoning`, `agent`, `workflow`, `report`, `router`, `title`, `transcription`, `embedding`, and `vision`.

Do not confuse default slots with catalog capabilities or catalog use-case filters. The model catalog UI can filter models by capabilities such as `vision` and `tool-calling`, and provider sync can store those capability tags on model rows. `vision` is a default slot because image-bearing assistant turns use it; `tool-calling` is still a capability/use-case tag rather than a standalone default slot.

Default mutations validate that:

- the use case is supported
- the selected model exists
- the selected model is enabled
- the model supports the requested use case
- the provider is not disabled

Company defaults override global defaults. If a company default is missing or invalid, resolution falls back to the global default for the same use case. If configured defaults are unavailable, runtime resolution falls back to legacy default model rows through the shared model service.

Embedding resolution is stricter. The current vector index expects 768 dimensions, so `resolveEmbeddingModelConfigForExecution` requires a compatible Google Vertex embedding model and returns explicit embedding dimension metadata. When no configured embedding default is available, it falls back to the Google Vertex `text-embedding-004` failsafe with 768 dimensions.

## Pricing And Cost Computation

The model detail page writes pricing fields through `updatePricingConfig`. The editable fields include:

- friendly name
- standard input cost below and above 200k tokens
- cached input cost below and above 200k tokens
- output response cost
- output reasoning cost

Pricing metadata is used by analytics cost estimates through `buildModelCostContext` and `computeCostFromMap`. The implemented calculation currently reads `standardInputCostBelow200k`, `standardInputCostAbove200k`, and `outputResponseCost`; cached-input and reasoning-output pricing fields are stored on the model row and shown in admin tooling but are not consumed by the dashboard cost calculation yet. Analytics currently convert computed USD cost to GBP with the implemented conversion used in `convex/analytics.ts`.

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
