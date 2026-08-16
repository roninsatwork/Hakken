# AI Provider And Tool Extension Guide

Read this before changing AI model provider selection, provider adapters, the AI tool catalog, connector installs, OAuth connector state, or runtime tool execution. The current implementation has a provider-neutral model catalog and shared provider adapter layer for some text-generation paths, but several production runtime paths still call Google Vertex-specific helpers after model resolution. Tool metadata is separated from tool execution.

This guide is grounded in:

- `convex/aiModelService.ts`
- `convex/aiModels.ts`
- `convex/aiModelsActions.ts`
- `convex/aiRuntimeTypes.ts`
- `convex/aiProviderRegistry.ts`
- `convex/googleProviderAdapter.ts`
- `convex/openaiProviderService.ts`
- `convex/anthropicProviderService.ts`
- `convex/vertexProviderService.ts`
- `convex/providerHttpService.ts`
- `convex/aiProviderRetryService.ts`
- `convex/aiTools.ts`
- `convex/toolConnectorDefinitions.ts`
- `convex/aiToolExecutionService.ts`
- `convex/aiToolReadTools.ts`
- `convex/aiToolWriteTools.ts`
- `src/app/(dashboard)/admin/ai/models/page.tsx`
- `src/app/(dashboard)/admin/ai/tools/page.tsx`
- `src/app/(dashboard)/admin/ai/tools/new/page.tsx`
- `src/app/(dashboard)/admin/ai/tools/[id]/page.tsx`
- `src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.tsx`

## Provider Boundary

Runtime paths should resolve a provider-neutral execution model before they call a provider adapter. Do not hardcode runtime model literals in feature code.

The model resolution flow is:

1. The caller passes an optional requested model id and the relevant use case.
2. `convex/aiModels.ts` loads enabled configured models and use-case defaults.
3. `resolveExecutionModel` in `convex/aiModelService.ts` prefers an enabled requested model, then an enabled configured default, then the failsafe Google Vertex model.
4. Runtime code receives `modelId`, `providerKey`, `providerModelId`, and a `source` value of `requested`, `default`, or `failsafe`.

`convex/aiModelService.ts` currently defines default use cases for chat, fast chat, reasoning, agents, workflows, reports, routing, title generation, transcription, and embeddings. Provider metadata is resolved through `providerKey` and `providerModelId`. The existing Google Vertex adapter still supports legacy Google model ids by defaulting missing provider metadata to the Google provider, but new code should preserve explicit provider metadata.

`convex/aiProviderRegistry.ts` is the shared text-generation adapter boundary for provider-neutral calls. It currently routes Google, OpenAI, and Anthropic generation requests through provider adapters. The shared request and response contracts live in `convex/aiRuntimeTypes.ts`.

`convex/googleProviderAdapter.ts` adapts the shared generation contract to Google Vertex. `convex/vertexProviderService.ts` remains the lower-level Google client and retry boundary: it builds the Google client from environment credentials, normalizes escaped private keys, and wraps generate and embedding calls with `withProviderRetry` from `convex/aiProviderRetryService.ts`.

`convex/openaiProviderService.ts` adapts shared text-generation calls to the OpenAI Responses API and lists OpenAI models from `/v1/models`. It accepts `OPENAI_API_KEY`, `OPEN_AI_API_KEY`, or `OPENAI_KEY`, but the error message names `OPENAI_API_KEY` as the expected credential. Its runtime adapter currently accepts text-only content.

`convex/anthropicProviderService.ts` adapts shared text-generation calls to Anthropic Messages and lists models from Anthropic's models endpoint. It requires `ANTHROPIC_API_KEY`. Its runtime adapter currently accepts text-only content.

Current runtime caveats:

- Assistant chat response generation and thread-title generation use `generateTextWithResolvedModel`.
- Assistant RAG search, knowledge ingestion, embeddings, voice transcription, workflow node-config generation, agent runtime, workflow agent nodes, swarm actions, report generation, router/orchestrator selection, and model-graded eval actions still use Google Vertex helpers directly or require `getGoogleVertexProviderModelId`. The Gmail mailbox watcher's answer decision uses `generateTextWithResolvedModel` with the `fast-chat` use case.
- Embedding paths intentionally require Google Vertex-compatible 768-dimensional embeddings until the vector schema and existing data expectations change.

When documenting provider support, distinguish "catalog/provider can be configured" from "this runtime path can execute through that provider today."

## Provider Catalog Sync And Health

Provider administration actions live in `convex/aiModelsActions.ts` and require super-admin access.

Google Vertex catalog sync currently seeds a curated production model list instead of relying on a live Vertex model index. The curated list includes Google text and multimodal model rows plus the `text-embedding-004` embedding row. Sync also backfills legacy Google model rows so provider metadata is explicit.

OpenAI catalog sync first tries to read the live `/v1/models` catalogue. If live sync fails, it can seed a curated text-generation catalogue and mark provider health as degraded or error depending on the failure. The curated OpenAI model list is a model-administration convenience; it does not prove every seeded model can execute under the current API key until the provider connection and selected runtime path are tested.

Anthropic catalog sync reads the live model catalogue and stores text-generation rows from the response. No provider carries a fallback catalogue: a hardcoded list decides what exists, goes stale without saying so, and turns a failed sync into one that looks successful. A sync that cannot reach its provider throws and marks the provider unhealthy.

Provider connection tests update provider health through `internalUpdateProviderHealth`. A successful test marks the provider healthy and sets `syncStatus` to `connection-ok`. It does **not** enable the provider: a button that reads as a read-only check must not change what the platform runs, and enabling is one click away on the same screen. A failed test records an error status and `connection-error` message without proving any model default is safe to use.

When adding another provider:

This list was rewritten from what adding OpenRouter actually required. The
previous version described the shape of the work but not where it lives, so
following it would have missed the two registry switches and the four
display-name chains in the front end — each of which fails quietly rather than
loudly.

**Backend**

1. `convex/aiModelService.ts` — add the provider key constant.
2. **New** `convex/<provider>ProviderService.ts` — env type, config builder that
   throws on missing credentials, response extractor, adapter factory, and a
   catalogue listing function. Build it on `requestProviderJson`, which is
   provider-neutral. Accept `env` and `fetchImpl` as arguments so tests can drive
   it without a network.
3. `convex/aiProviderRegistry.ts` — add the case to `getProviderAdapter`.
4. `convex/aiModels.ts` — add to `PROVIDER_DISPLAY_NAMES` **and**
   `PLATFORM_PROVIDER_KEYS`.
5. `convex/aiModelsActions.ts` — display name, a `sync<Provider>Models` action,
   and a branch in `testProviderConnection`.
6. `.env.example` and `scripts/validate-setup.mjs` — declare and validate the
   credential.

**Front end**

7. `modelAdminUtils.tsx` — extend `SyncProviderKey` and `isSyncProviderKey`. The
   sync dispatch map on the Providers screen is typed against that union, so the
   compiler will refuse to build until the sync action is wired up. That is
   deliberate: it used to be an if/else chain whose final `else` silently synced
   Anthropic.
8. Four display-name chains: `admin/page.tsx`, `app/settings/page.tsx`,
   `admin/companies/[id]/page.tsx`, and `AICostDistributionCharts.tsx`.

**To run agents, not just chat**

9. **New** `convex/<provider>AgentProvider.ts` implementing
   `AgentProviderAdapter` — streaming, tool calls, and the normalised outcome the
   objective loop switches on. Keep the transcript translation and stream
   accumulation in a separate service of pure functions so they can be tested
   without a network call.
10. `convex/agentProviderRegistry.ts` — the case **and**
    `isAgentCapableProvider`.
11. `convex/aiModelService.ts` — add the provider to `AGENT_CAPABLE_PROVIDER_KEYS`,
    or the model pickers will not offer it for agent and workflow jobs.

**Throughout**

- Keep runtime actions provider-neutral until they cross into the adapter, and
  pass neutral prompts, content, generation config and tool declarations in.
- Structured output travels as `jsonSchema` on the request, in plain JSON Schema.
  Every adapter maps it to its own vocabulary; a provider that cannot do it must
  say so rather than silently returning prose.
- Preserve `providerKey` in analytics and cost attribution so dashboards can
  distinguish configured providers from legacy or unknown calls.
- Prices are stored **per million tokens**. A provider quoting per token converts
  once, in its sync, with a test pinning the result against
  `calculateModelCostGBP`.

New runtime work should avoid constructing provider SDK clients directly inside product features, agent runtime code, workflow runtime code, or one-off actions. Existing Vertex-specific paths are documented implementation debt; when they are touched, prefer moving them toward model resolution plus adapter helpers instead of spreading more direct SDK calls.

Adapter support is not identical across providers. Google generation accepts text and inline media parts through the Google adapter. OpenAI and Anthropic generation currently call `assertTextOnlyContents`, so they should not be used for multimodal content until their adapters explicitly support the required content shapes and tests cover them.

## Connector Catalog

Built-in connector definitions live in `convex/toolConnectorDefinitions.ts`. A definition includes:

- `key`
- `name`
- `description`
- `category`
- `authMode`
- optional `oauthProvider`
- `tenantAvailability`
- `requiredScopes`
- `requiredSecretRefs`
- one or more model-callable tool definitions

The implemented categories are knowledge, profile, workflow, HTTP, email, and custom. Built-in connector definitions use no auth, secret references, and OAuth. The first implemented OAuth connector is `google-gmail`, which uses provider authorization routes, callbacks, encrypted token storage, refresh, and revocation. Built-in connector definitions also include Sonae-native capabilities and external integration scaffolds such as HTTP REST, email/notification, Slack, Google Drive, Google Calendar, Microsoft Outlook, Microsoft Teams, Notion, HubSpot, Salesforce, and Zendesk.

Most external connector definitions are scaffolds. They can be installed, tested for configuration shape, exposed in the tool catalog, and bound to agents, but most real downstream API execution is intentionally not implemented yet. The Gmail mailbox is the implemented exception and is documented in [Gmail Mailbox](./gmail-mailbox.md). Scaffold handlers should return a clear not-implemented result instead of pretending an external action was completed.

## Connector Installs

Connector install state is managed by `convex/aiTools.ts`.

`getConnectorMarketplace` returns every built-in connector definition plus the visible install for the active tenant. Super admins can see all connector installs. Company admins only see global installs and installs for their active company.

`installConnector` is super-admin-only. It validates the definition key, normalizes configured secret reference keys, rejects raw-looking secret values, resolves tenant availability, creates or updates the connector install, syncs required/configured secret reference rows, and syncs catalog tools for enabled mappings.

`updateConnectorInstall` can update configured secret references, enabled tool mappings, active state, and tenant scope. Company admins can manage accessible connectors, but tenant scope movement remains guarded by role and company-access checks. When a mapping is disabled, the synced `aiTools` row is deactivated rather than deleted.

`getConnectorInstallDetails` returns the connector, definition, company, synced tools, secret-reference rows, OAuth connection records, and recent test logs for the connector detail page.

Secret reference fields are reference keys, not raw secrets. `assertSafeSecretRefs` and `assertSafeReferenceValue` reject values that look like raw API keys, OAuth tokens, GitHub tokens, or private keys. Store real secret material in the external secret system and put only opaque references in Sonae.

## OAuth Connector State

OAuth-backed connectors are currently implemented for Google Gmail.
`beginConnectorOAuth` creates a pending connection with a single-use state and
an authorize URL. The Convex HTTP routes `/api/connectors/oauth/authorize` and
`/api/connectors/oauth/callback` validate that state, redirect to the provider,
exchange the code server-side, store token ciphertext, and mark the connector
connected.

`isConnectorOAuthAvailable()` now depends on the connector provider and
deployment configuration. For Google, the deployment must provide
`CONNECTOR_GOOGLE_CLIENT_ID`, `CONNECTOR_GOOGLE_CLIENT_SECRET`, and
`CONNECTOR_TOKEN_ENCRYPTION_KEY`; otherwise an operator sees an explicit
configuration error instead of a broken consent flow.

`getConnectorAccessToken` refreshes expiring access tokens from the encrypted
refresh token, and the `connector-oauth-token-refresh` cron catches long-idle
connections. `disconnectConnectorOAuth` schedules provider revocation before
token rows are deleted and connector state is reset.

Do not store OAuth access tokens directly in connector rows. Token material
belongs in `connectorOAuthTokens` as ciphertext, and no client-callable function
should read that table.

## Tool Metadata

Global tool metadata is stored in `aiTools`. Agent-tool bindings are stored separately in `agentTools`.

Tool contract fields include:

- `handlerMapping`
- `requiredRole`
- input and output schemas
- side-effect level
- confirmation requirement
- connector id/key when the tool came from a connector
- secret reference keys for connector-backed tools
- active state and version

`buildToolContractPatch` validates JSON schema strings and normalizes execution policy. The backend accepts root object schemas with object `properties` and string-array `required` lists. Keep schemas small and explicit because model output is only loosely constrained until backend validation runs.

`syncConnectorTools` creates or updates `aiTools` rows from connector definitions. It increments versions on update, preserves connector metadata, and deactivates disabled mappings.

Manual Sonae action tools are managed through the AI tools pages. Connector-backed tools should stay aligned with their connector definition rather than being edited as unrelated manual records.

## Runtime Tool Declarations

`convex/aiToolExecutionService.ts` builds provider-facing declarations through `buildProviderToolDeclaration`. Handler mappings are normalized into provider-safe function names by replacing unsupported characters with underscores and ensuring the name starts with a letter or underscore.

`parseToolInputSchema` accepts stored JSON strings or objects and returns an object schema. `validateToolCallArgsAgainstSchema` checks required fields and simple primitive type matches before execution. This is intentionally modest validation, not a complete JSON Schema engine.

`parseToolCallPayload` rejects missing tool names and non-object argument payloads. Model-generated arguments must be treated as untrusted input even when the provider claims function-call conformance.

Tool results should use `buildToolResultPayload`:

- success: `{ status: "success", data }`
- failure: `{ status: "error", error }`

Use `buildToolFailureResult` or `normalizeAiRuntimeError` when converting thrown errors into run evidence.

## Execution Policy

Tool execution is allowed only after backend checks pass. Never execute a tool solely because a model requested it.

`normalizeToolExecutionPolicy` defaults side-effect level to `READ`. Non-read tools require confirmation by default. `canExecuteTool` and `assertCanExecuteTool` enforce:

- an authenticated actor is required
- ordinary users cannot execute admin tools
- super-admin tools require a super admin
- company admins cannot execute across tenant boundaries
- confirmation is required when the normalized policy requires it

Super admins can execute across tenants only after satisfying the tool policy, including confirmation when required. Company admins must match the target company.

## Registered Tool Handlers

Runtime handler implementations are registered in `REGISTERED_TOOL_HANDLERS`.

Implemented handlers include:

- `knowledge.search`, which calls `internal.aiToolReadTools.searchKnowledge`
- `company.overview.update`, which calls `internal.aiToolWriteTools.updateCompanyOverview`

Several connector-backed handlers intentionally return a not-implemented scaffold result:

- `workflow.task.create`
- `http.request`
- `notification.send`
- `slack.message.send`
- `google_drive.search`

Additional connector definitions may exist without registered handlers yet. If a connector is exposed to runtime declarations, add a registered handler or ensure the runtime path clearly reports that the handler mapping is unknown or not implemented.

## Tenant And Role Boundaries

Connector and tool management must preserve tenant isolation:

- super admins can install global or tenant-restricted connectors
- tenant-restricted connectors must carry a company id
- company admins can only inspect or manage connectors available to their active company
- synced tool rows inherit connector active state and metadata
- runtime execution must check target company against the executing user's company

Do not rely on frontend filtering as the authorization boundary. Query and mutation handlers must continue to call `requireAdmin`, `requireSuperAdmin`, `assertAdminCanAccessCompany`, and the runtime execution-policy helpers.

## Testing And Maintenance

Relevant tests include:

- `convex/aiToolExecutionService.test.ts`
- `convex/aiTools.test.ts`
- `convex/aiModels.test.ts`
- `src/app/(dashboard)/admin/ai/tools/page.test.tsx`
- `src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.test.tsx`
- `src/app/(dashboard)/admin/ai/models/page.test.tsx`

There is currently no dedicated tool-detail page test; add one if tool detail behavior changes beyond what the list and connector tests cover.

When extending this area, add or update tests for:

1. Provider model resolution and fallback behavior.
2. Provider adapter retry behavior when changing provider clients.
3. Connector tenant visibility and tenant-scope changes.
4. Secret-reference validation and raw-secret rejection.
5. OAuth begin, complete, scope validation, and disconnect flows.
6. Tool schema validation and provider declaration normalization.
7. Runtime execution policy for user, admin, super-admin, cross-tenant, and confirmation cases.
8. Registered handler behavior for real and scaffolded connector mappings.

Before shipping new provider or connector functionality, confirm the operator-facing docs describe what actually executes and what is still scaffolded. Do not present catalog scaffolds as live external integrations until their handlers perform the downstream action and the tests cover the real behavior.
