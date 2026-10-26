---
product: Hakken
documentation_type: End-user guide
feature_area: AI models providers costs and Decisions
audience: end-user
source_repository: roninsatwork/Hakken
source_path: docs/end-user/ai-models-providers-and-costs.md
last_reviewed: '2026-10-26T14:30:19+00:00'
reviewed_against: current implementation
status: Current
---
# AI Models, Providers, And Costs

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** AI models providers costs and Decisions
> **Reviewed:** 26 October 2026, 14:30:19 GMT (Europe/London)
> **Source path:** `docs/end-user/ai-models-providers-and-costs.md` · **Status:** Current


Core routing, use-case restrictions, embedding fallback and pricing were refreshed. Provider operations and full historical analytics remain separate review work.

Hakken lets platform operators control which AI providers and models are available, which models are used by default for different AI use cases, and how AI usage cost is monitored. These controls affect live assistant, agent, workflow, report, embedding, transcription, widget, and analytics behavior.

This guide is for operators, customer-success teams, support teams, and sales engineers who need to understand the implemented product surface.

## Where To Find It

Global model and cost controls:

- `/admin/ai/models` manages providers, model catalog rows, global model defaults, sync, testing, filtering, and enabled state.
- `/admin/ai/models/[id]` edits a model's friendly display name and pricing values.
- `/admin/ai/costs` shows global AI usage and cost analytics.

Company model controls:

- `/admin/companies/[id]/ai/models` manages model defaults for a specific company.
Older direct company model routes have been retired; use the `/ai/models`
company route.

Related monitoring:

- `/admin/health` shows recent agent run health, cost, model, and tool signals.
- `/admin/ai/chat-logs` helps investigate conversations behind cost or behavior changes.

## Providers

The model admin page shows platform providers for Google Vertex AI, OpenAI, Anthropic, OpenRouter and TypeSafe. TypeSafe is restricted to the Decisions job; ordinary text providers can also serve Decisions, so that job does not require TypeSafe. Operators can enable or disable providers, test provider connectivity, and sync model catalogs for supported providers.

Provider status matters. If a provider is disabled, its models are hidden from active model selectors and cannot be selected as valid defaults. If a provider test fails, treat that as an operational warning before enabling new models or changing defaults.

Provider sync updates model metadata such as provider model id, display name, capabilities, supported use cases, context limits, output limits, and pricing metadata where available. OpenRouter can supply prices during sync; other providers may still need prices entered manually for cost reporting.

## Model Catalog

The models tab lists catalog entries. Operators can search models and filter by:

- active or inactive status
- provider
- capability
- supported use case

Capabilities include text, reasoning, vision, audio, tool calling, JSON mode, streaming, embeddings, and transcription. Use cases include chat, agent, workflow, report, router, title, embedding, transcription, vision, and tool calling.

Enabling a model makes it available to compatible selectors and defaults, as long as its provider is also enabled. Disabling a model hides it from active selectors and prevents it from being chosen as a new default.

## Defaults

The defaults tab maps AI use cases to default models. The implemented default slots are chat, fast chat, agent, workflow, report, router, title, transcription, speech, vision, realtime, embedding and decision. Reasoning remains model capability/configuration rather than a separate current default slot. Catalog filters can still show capabilities such as tool calling, but tool calling is a model capability or catalog use-case tag rather than a separate default slot in the current defaults UI. The vision default is used when a message carries a photo.

Global defaults apply platform-wide. Company defaults override global defaults for a tenant. Clearing a company default falls back to the global default for that use case.

Before changing a default:

1. Confirm the provider is enabled.
2. Confirm the model is enabled.
3. Confirm the model supports the intended use case.
4. Save the default.
5. Test the affected assistant, agent, workflow, or ingestion path.

Embedding defaults need special care because the current vector index expects Google Vertex embedding behavior and 768-dimensional vectors. If no compatible embedding default is configured, Hakken falls back to the Google Vertex `text-embedding-005` failsafe for embedding execution.

## Model Details And Pricing

The model detail page shows read-only provider metadata and editable operational pricing fields. Operators can set a friendly name and pricing values for standard input, cached input, response output, and reasoning output.

Friendly names appear in user-facing selectors and toolbars. The current cost analytics calculation uses the standard input and response output pricing fields. Runtime cost accounting uses cached input rates when callers supply cached-token counts. The aggregate message-cost helper does not pass that count, so its estimate can differ from a run ledger that recorded cache usage. The separate reasoning-output field is not an extra charge in the reviewed shared calculator; avoid assuming every editable field contributes independently to a displayed total. If a model has no positive standard-input or response-output price, Hakken treats its cost as not measurable rather than assuming it is free. Treat all pricing values as operational reporting inputs unless a separate billing process validates them.

The detail page also shows capabilities, supported use cases, context window, max output, provider model id, internal model id, sync date, pricing source, units, currency, and pricing effective date where recorded.

## Cost Analytics

The AI costs page shows global usage and cost analytics for a selected timeframe. The implemented timeframe options include fixed recent windows and custom date ranges.

The dashboard includes:

- timeline chart with daily, weekly, or monthly aggregation
- aggregate cost, message, and token metrics
- provider distribution for the live raw-data overlay
- model distribution
- top agents
- top companies
- top users

Cost is computed from recorded message or snapshot usage and model pricing metadata. Analytics are useful for trend analysis, debugging expensive behavior, and finding unusual usage. They should not be treated as invoice-grade billing without an external billing control.

For longer historical windows, model distribution, costs, leaderboards, messages, and token totals are backed by daily snapshots. Provider distribution is currently more limited because historical snapshots do not store provider totals separately.

## Company Metrics

Company model defaults let a platform operator tune model behavior for one tenant. Company analytics use company-scoped access and show usage signals for that company. Use these together when investigating a tenant-specific cost spike or behavior change.

For example, if a company reports slow or expensive responses, check its model defaults, the selected model in chat or agent surfaces, cost analytics, and recent chat or run evidence.

## Safe Operating Practices

Change provider state and defaults one step at a time. Avoid enabling a provider, syncing new models, changing several defaults, and editing prices in the same operational change unless there is a clear rollback plan.

After any model default change, test the affected path:

- assistant chat for chat defaults
- agent run for agent defaults
- workflow execution for workflow defaults
- knowledge ingestion for embedding defaults
- report generation for report defaults
- transcription for transcription defaults
- the relevant media surface when changing model catalog capability or use-case metadata such as vision

If costs move unexpectedly, check whether the model default changed, whether a provider sync altered metadata, whether message volume increased, and whether the relevant model has complete pricing fields.

## Permissions And What A Default Means

Provider/catalog/default configuration and provider tests or synchronisation require super-admin writes or actions. Read-only platform accounts can inspect the platform model queries but cannot save changes or run provider actions. A company-specific models page is still in platform Admin: its name does not give company administrators authority to alter model routing. Ordinary signed-in users can receive the narrower catalog/picker data needed for their permitted runtime selectors.

A stored default is configuration, not a successful connection test. Resolution tries a valid company choice and its stored fallback, then the global choice and fallback, then legacy/default or failsafe behavior. Disabled providers are excluded from normal configured resolution. When a chosen company model stops being usable, another model may answer; check the model recorded on the actual run rather than assuming the most recently saved company value was used. Clearing an override deliberately follows platform routing again.

Some jobs have narrower provider requirements than chat. Embedding, transcription, speech and vision are currently Google-only in the shared use-case policy. Realtime supports Google and OpenAI, while agent/workflow adapters support the four text providers listed above. A provider can be healthy while a particular job or model is unsupported. A Decisions model chooses judgments; it is not automatically an agent or conversational model.

The built-in embedding fallback is a 768-dimensional Vertex model served from the configured embedding region, currently `europe-west2`. Changing it is not a routine cosmetic model rename: existing vectors must remain comparable, and ingestion/retrieval can refuse or skip incompatible vectors. A working text response does not establish that document search is healthy. No live embedding request or model sync was made in this review.

## Interpreting Spend

The AI cost screen formats cost in US dollars; it does not apply a live GBP conversion. Standard and cached input rates are quoted per million tokens, with a larger-context tier above two hundred thousand input tokens. Missing or zero high-tier rates fall back to standard input pricing. Missing cached pricing falls back to standard pricing rather than declaring cached tokens free. A model is marked measurable when either standard-input or response-output pricing is positive; this does not establish that every price field is complete.

AI supplier spend, customer credits and subscription billing measure different things. The model-spend ledger attributes work to its agent or system role, or Platform AI when it has no specific worker. Decisions have their own ledger. The broader analytics view also uses messages and historical snapshots; it is not necessarily a complete reconciled total of every model ledger. Observe incomplete-figures notices and the specific report's date range before comparing totals. Neither local metadata nor a provider test establishes a paid customer's revenue or a Stripe settlement.

This refresh verified current default slots, provider capability restrictions, runtime/default fallback, embedding fallback, pricing calculation and screen currency. Detailed provider synchronization internals, all historical analytics rollups, rule/prompt policy and Decisions certainty behavior remain separate review work. The guidance above describes code, not deployment acceptance or a current provider price quotation.

## Decisions: Modes And Evidence

Decisions are registered questions used by particular implementation paths, such as judging a Wiki claim or classifying collected evidence. Open `/admin/ai/decisions` for platform policy or `/admin/companies/[id]/ai/decisions` for an authorized company's overrides. A detail page explains the registered question, possible answers, stakes, recent outcomes, and effective mode. This is not a general prompt editor for inventing new application capabilities.

The modes are Off, Ask a person, and Act. Off keeps the existing rule behavior and avoids the Decision model request. Ask a person records an actionable model judgement for handoff. Act permits sufficiently certain judgements according to the registered stakes; low-stakes questions can act at fairly-sure confidence, while high-stakes questions require sure confidence. The calling feature still owns what acting or handing off actually does. A row saying handed to a person is not proof that an email was delivered or that a human completed a task.

A company's explicit mode overrides platform mode, which otherwise follows the registered default. Clearing a company override returns it to inheritance. Changing the platform mode can therefore affect companies that have not chosen an override. Company mode writes require admin/company authority; platform mode writes require super-admin authority. Review the actual feature and scope before changing either.

TypeSafe supplies probability-based judgements; ordinary supported text models can also answer Decisions, with stricter confidence bands because their reported probabilities are their own estimates. Confidence in either path is not measured business correctness. A strongly negative yes/no answer can be as certain as a strongly positive one. Provider failure, missing configured models, or unusable answers can fall back to the original rule and record that reason rather than stopping the entire feature.

The screen's provider-usable indicator means configured resolution did not reach the failsafe; it is not a live credential test. Weekly figures stop at a bounded population and indicate when they are capped. Recent detail history is also bounded. Decision cost is supplier model usage, not customer billing, paid-company counts, revenue, or proof that an action succeeded externally. An Acted record describes the caller's action interpretation; inspect its underlying record when outcome matters.

## Catalog Sync And Connection Checks

Provider sync reads the provider's current model catalog into Hakken. Google Vertex, OpenAI, Anthropic, OpenRouter, and TypeSafe have implemented listing paths. A failed provider request is not replaced by an invented successful catalog. Sync does not prove that every listed model supports every runtime feature or that the account can generate with each model.

New model rows are disabled initially, while existing model enablement is preserved on update. The batch sync path can enable the provider record itself, which differs from a connection test. Check the provider toggle after a sync when rollout scope matters. Metadata such as context size and prices is only overwritten when the sync supplies it, preserving manually entered information where listings omit fields. Models absent from a later listing are not automatically a verified deletion of every old catalog row.

A connection check lists models and updates saved health information. It does not generate an answer, prove tool/vision support, or enable a disabled provider. These checks still contact external services; documentation housekeeping did not run them. Credentials belong in backend configuration: provider cards and model rows are not a place to paste secret values.

Catalog search, capability filtering, current defaults, and actual runtime adapters are related but different views. OpenRouter can report detailed pricing/modalities; other listings can leave gaps or use identifier-derived capability rules. A synced price is operational metadata rather than an invoice agreement. If a model appears but is unavailable for a job, check its enabled state, provider toggle, supported use case, actual adapter, and any job-specific Google capability requirement before changing global defaults.
