# AI Models, Providers, And Costs

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

The model admin page shows platform providers for Google Vertex AI, OpenAI, Anthropic, and OpenRouter. Operators can enable or disable providers, test provider connectivity, and sync model catalogs for supported providers.

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

The defaults tab maps AI use cases to default models. The implemented default slots are chat, fast chat, reasoning, agent, workflow, report, router, title, transcription, embedding, and vision. Catalog filters can still show capabilities such as tool calling, but tool calling is a model capability or catalog use-case tag rather than a separate default slot in the current defaults UI. The vision default is used when a message carries a photo.

Global defaults apply platform-wide. Company defaults override global defaults for a tenant. Clearing a company default falls back to the global default for that use case.

Before changing a default:

1. Confirm the provider is enabled.
2. Confirm the model is enabled.
3. Confirm the model supports the intended use case.
4. Save the default.
5. Test the affected assistant, agent, workflow, or ingestion path.

Embedding defaults need special care because the current vector index expects Google Vertex embedding behavior and 768-dimensional vectors. If no compatible embedding default is configured, Hakken falls back to the Google Vertex `text-embedding-004` failsafe for embedding execution.

## Model Details And Pricing

The model detail page shows read-only provider metadata and editable operational pricing fields. Operators can set a friendly name and pricing values for standard input, cached input, response output, and reasoning output.

Friendly names appear in user-facing selectors and toolbars. The current cost analytics calculation uses the standard input and response output pricing fields. Cached input and reasoning output prices are stored as model metadata for operator visibility and future reporting work, but they are not part of the implemented dashboard cost calculation yet. If a model has no positive standard-input or response-output price, Hakken treats its cost as not measurable rather than assuming it is free. Treat all pricing values as operational reporting inputs unless a separate billing process validates them.

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
