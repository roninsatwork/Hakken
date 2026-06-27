# AI Provider And Tool Extension Guide

Read this before changing AI model provider selection, provider adapters, the AI tool catalog, connector installs, OAuth connector state, or runtime tool execution. The current implementation deliberately separates provider-neutral runtime code from provider-specific clients and separates tool metadata from tool execution.

This guide is grounded in:

- `convex/aiModelService.ts`
- `convex/aiModels.ts`
- `convex/vertexProviderService.ts`
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
- `src/app/(dashboard)/admin/ai/tools/mcp/new/page.tsx`
- `src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.tsx`

## Provider Boundary

Runtime paths should resolve a provider-neutral execution model before they call a provider adapter. Do not hardcode runtime model literals in feature code.

The model resolution flow is:

1. The caller passes an optional requested model id and the relevant use case.
2. `convex/aiModels.ts` loads enabled configured models and use-case defaults.
3. `resolveExecutionModel` in `convex/aiModelService.ts` prefers an enabled requested model, then an enabled configured default, then the failsafe Google Vertex model.
4. Runtime code receives `modelId`, `providerKey`, `providerModelId`, and a `source` value of `requested`, `default`, or `failsafe`.

`convex/aiModelService.ts` currently defines default use cases for chat, fast chat, reasoning, agents, workflows, reports, routing, title generation, transcription, and embeddings. Provider metadata is resolved through `providerKey` and `providerModelId`. The existing Google Vertex adapter still supports legacy Google model ids by defaulting missing provider metadata to the Google provider, but new code should preserve explicit provider metadata.

`convex/vertexProviderService.ts` is the provider-specific boundary for Google Vertex. It builds the Google client from environment credentials, normalizes escaped private keys, and wraps generate and embedding calls with `withProviderRetry` from `convex/aiProviderRetryService.ts`.

When adding another provider:

1. Add provider metadata and sync behavior in the model administration path.
2. Add an adapter service for the provider client and retry/logging behavior.
3. Keep runtime actions provider-neutral until they cross into the adapter.
4. Pass provider-neutral prompts, content, generation config, and tool declarations into the adapter.
5. Preserve `providerKey` in analytics and cost attribution so dashboards can distinguish configured providers from legacy or unknown calls.

Do not construct provider SDK clients directly inside product features, agent runtime code, workflow runtime code, or one-off actions. Those paths should depend on model resolution and adapter helpers.

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

The implemented categories are knowledge, profile, workflow, HTTP, email, and custom. The implemented auth modes are no auth, secret references, and OAuth. Built-in connector definitions include Sonae-native capabilities and external integration scaffolds such as HTTP REST, email/notification, Slack, Google Drive, Gmail, Google Calendar, Microsoft Outlook, Microsoft Teams, Notion, HubSpot, Salesforce, and Zendesk.

Most external connector definitions are scaffolds. They can be installed, tested for configuration shape, exposed in the tool catalog, and bound to agents, but most real downstream API execution is intentionally not implemented yet. The handler should return a clear not-implemented result instead of pretending an external action was completed.

## Connector Installs

Connector install state is managed by `convex/aiTools.ts`.

`getConnectorMarketplace` returns every built-in connector definition plus the visible install for the active tenant. Super admins can see all connector installs. Company admins only see global installs and installs for their active company.

`installConnector` is super-admin-only. It validates the definition key, normalizes configured secret reference keys, rejects raw-looking secret values, resolves tenant availability, creates or updates the connector install, syncs required/configured secret reference rows, and syncs catalog tools for enabled mappings.

`updateConnectorInstall` can update configured secret references, enabled tool mappings, active state, and tenant scope. Company admins can manage accessible connectors, but tenant scope movement remains guarded by role and company-access checks. When a mapping is disabled, the synced `aiTools` row is deactivated rather than deleted.

`getConnectorInstallDetails` returns the connector, definition, company, synced tools, secret-reference rows, OAuth connection records, and recent test logs for the connector detail page.

Secret reference fields are reference keys, not raw secrets. `assertSafeSecretRefs` and `assertSafeReferenceValue` reject values that look like raw API keys, OAuth tokens, GitHub tokens, or private keys. Store real secret material in the external secret system and put only opaque references in Sonae.

## OAuth Connector State

OAuth-backed connectors use `beginConnectorOAuth`, `completeConnectorOAuth`, and `disconnectConnectorOAuth`.

`beginConnectorOAuth` verifies the connector, checks tenant access, confirms the connector definition uses OAuth, creates a pending `toolConnectorOAuthConnections` row, stores a generated state value, and returns a local authorization URL. The current URL is an internal placeholder route shaped as `/api/connectors/oauth/authorize?...`.

`completeConnectorOAuth` validates the pending state, verifies the connector id, rejects non-pending sessions, checks required scopes, and stores only `accountRef` and `tokenRef` reference keys. It updates the connector install to `CONNECTED`, clears stale test status, and records granted scopes.

`disconnectConnectorOAuth` marks pending or connected OAuth rows as disconnected and clears token/account fields from the connector install. Disconnecting also resets test status because a previously passing connector test no longer proves the current connection works.

Do not store OAuth access tokens directly in connector rows. Use reference keys that point to an external vault or token store.

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
- `src/app/(dashboard)/admin/ai/tools/[id]/page.test.tsx`
- `src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.test.tsx`
- `src/app/(dashboard)/admin/ai/models/page.test.tsx`

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
