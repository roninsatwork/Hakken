---
product: Hakken
documentation_type: developer guide
feature_area: AI tools and connector configuration
audience: company admins, platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/ai-tools-and-connectors.md
last_reviewed: '2026-10-26T10:05:24+00:00'
reviewed_against: current implementation
status: Current
---
# AI Tools And Connectors Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** AI tools and connector configuration
> **Reviewed:** 26 October 2026, 10:05:24 GMT (Europe/London)
> **Source path:** `docs/developer/ai-tools-and-connectors.md` · **Status:** Current

AI tools and connectors are Hakken's governed action layer for agent runs. The implementation separates admin catalog records, connector install state, model-facing declarations, deterministic authorization, argument validation, and registered backend handlers.

Read this with `docs/developer/agents.md`, `docs/developer/ai-administration.md`, `docs/developer/ai-provider-tool-extension.md`, and `docs/developer/ai-rules-and-prompts.md` before changing runtime tool behavior.

## Route Map

Admin routes:

- `src/app/(dashboard)/admin/ai/tools/page.tsx` renders the connector marketplace, installed connector controls, and paginated tool catalog.
- `src/app/(dashboard)/admin/ai/tools/new/page.tsx` creates Hakken action tools.
- `src/app/(dashboard)/admin/ai/tools/[id]/page.tsx` edits tool contracts.
- `src/app/(dashboard)/admin/ai/tools/connectors/[id]/page.tsx` manages connector install details, secret references, enabled tool mappings, OAuth state, and test logs.

Agent tool binding UI is part of agent administration and consumes the same `aiTools` and `agentTools` backend contracts.

## Backend Modules

`convex/aiTools.ts` owns admin-facing tool and connector state:

- `getConnectorMarketplace` merges built-in connector definitions with visible install records.
- `installConnector` installs or syncs a built-in connector and its generated tools.
- `getConnectorInstallDetails`, `updateConnectorInstall`, and `validateConnectorConfiguration` manage connector state. OAuth functions are guarded by provider credential availability; no connector in the catalogue uses them since Gmail went on 2026-10-09.
- `getPaginatedTools`, `getToolById`, `createTool`, `updateTool`, and `deleteTool` manage Hakken action tools.
- `getAgentTools` supports agent tool binding reads.

`convex/toolConnectorDefinitions.ts` contains built-in connector definitions, categories, auth modes, required scopes, required secret reference keys, and generated tool definitions.

`convex/aiToolExecutionService.ts` owns runtime contracts:

- schema parsing and validation
- provider function-name normalization
- model-facing tool declaration construction
- model tool-call payload parsing
- normalized result payloads
- tool execution policy normalization
- role, tenant, and confirmation access decisions
- registered handler dispatch

`convex/aiToolReadTools.ts` and `convex/aiToolWriteTools.ts` contain concrete backend handlers for implemented read/write actions.

## Data Model

Relevant schema areas include:

- `toolConnectors`: connector key, name, description, category, auth mode, scopes, secret refs, enabled mappings, company scope, availability, install status, test status, OAuth status, active state, and timestamps.
- `toolConnectorSecretRefs`: required/configured secret-reference status per connector.
- `toolConnectorTestLogs`: recent connector diagnostics.
- `toolConnectorOAuthConnections`: OAuth connection metadata.
- `connectorOAuthTokens`: OAuth token ciphertext, expiry, scopes, and connector ownership.
- `aiTools`: tool name, description, handler mapping, connector linkage, secret ref keys, required role, input/output schemas, side-effect level, confirmation requirement, active state, version, and audit metadata.
- `agentTools`: agent-to-tool bindings.
- `agentToolCalls`: run-time tool call evidence for agent executions.

Connector installs can be global or tenant-restricted. Tenant-restricted connector installs carry a company id. Global connector installs must not carry a company id.

MCP servers use the separate `/admin/ai/tool-servers` surface and discovery/promotion/runtime modules documented in [Tool Servers](./tool-servers.md). They are not created by inventing a general tool mapping.

The current `toolConnectorDefinitions.ts` catalog contains native data, task, HTTP, notification, voice and Assistant-facing capability groups. It no longer contains the old broad list of generic SaaS scaffolds or the retired Gmail connector. `REGISTERED_TOOL_HANDLERS` includes concrete scrape, DataForSEO, Apify, knowledge, company-profile, generic-task, notification, MCP and HTTP paths plus Assistant handlers. Inspect `getRegisteredToolHandlerMappings` for the actual set rather than copying an older list as universal live support.

## Tool Contract Validation

Tool input and output schemas are stored as JSON strings. `validateToolJsonSchemaString` requires a JSON object schema and validates root `type`, `properties`, and `required` shape. Runtime argument validation checks required fields and simple property types, including integer handling.

`normalizeToolExecutionPolicy` forces confirmation for `WRITE`, `DESTRUCTIVE`, and `EXTERNAL` tools. `READ` tools can opt into confirmation but do not require it by default.

Provider-facing declarations use the tool model-name contract; handler mapping remains separate internal dispatch identity. Keep both stable and explicit. Changing a mapping can break model-call resolution and registered handler dispatch.

## Authorization And Runtime Safety

The central runtime rule is that model tool calls are requests, not authority. `canExecuteTool` and `assertCanExecuteTool` enforce:

- authenticated user requirement
- administrator role requirement
- super-admin requirement for super-admin tools
- company boundary checks for non-super-admin users
- explicit confirmation when required

Super admins pass the tool company branch; confirmation is required unless explicitly granted or the caller supplies the agent’s permitted autonomous result. The runtime computes MCP non-read autonomy separately in `autonomyAppliesToTool`; passing a raw autonomy flag can bypass the intended server-tool restriction. Standard users have an explicit `MEMBER_READABLE_HANDLERS` exception only for listed handler mappings with READ policy and no super-admin requirement. The set includes company-figure reads and personal task proposal/read/change entry points whose downstream contracts preserve their own confirmation semantics. Admin callers remain subject to tenant checks.

Preserve these checks even when adding provider-specific tool-call formats. Provider adapters may format declarations differently, but execution must pass through the deterministic policy path.

## Registered Handlers

The current registry includes these concrete paths, among the Assistant-facing handlers:

- `knowledge.search`: scoped knowledge reads.
- `company.overview.update`: company profile updates.
- `task.create`: generic company task creation through the task service.
- `notification.send`: checks tenant recipients and sender/provider configuration, then queues `AGENT_EMAIL` through the Outbox and records dispatch evidence. Queueing is not delivery.
- `http.request`: bounded requests under the configured base address.
- `web.scrape`, DataForSEO operations and Apify actor operations: feature-specific external work.
- `mcp.call`: imported server-tool dispatch through its separate ownership, credential and approval policy.

Gmail, Slack and Drive mappings listed in earlier guides are not registered active integrations here. Unknown mappings fail as unknown or unimplemented. New handlers need a concrete registry entry, tenant checks, argument validation and relevant tests; a catalog label cannot provide that implementation.

## Connector Secret References

Connector definitions can require secret refs. `assertSafeSecretRefs` and `assertSafeReferenceValue` reject values that look like raw secrets and require opaque reference-key shapes. This protects the database from becoming a secret store.

If a future connector needs real secret storage, add a proper secret-management integration instead of weakening reference validation.

## Connector Install And Sync

`installConnector`:

1. requires super-admin access
2. loads the built-in definition
3. validates configured secret refs
4. validates enabled tool mappings
5. resolves tenant availability
6. upserts the connector install
7. syncs connector secret ref rows
8. creates, updates, or deactivates generated `aiTools`

Generated connector tools inherit required role, side-effect level, confirmation policy, schemas, and secret ref keys from their definitions. If a generated mapping is disabled, the existing generated tool is deactivated rather than deleted.

`updateConnectorInstall` can change configured secret refs, enabled mappings, active state, and, for super admins, tenant assignment and tenant availability. It resets connector test status to `UNTESTED` and resyncs generated tool activity after changes.

OAuth connector state is implemented, and was used by Google Gmail until 2026-10-09; it is tested now with a stand-in connector. `beginConnectorOAuth` creates a pending connection and authorize URL, the Convex HTTP authorize/callback routes exchange the provider code server-side, token ciphertext is stored in `connectorOAuthTokens`, `getConnectorAccessToken` refreshes near expiry, and disconnect revokes at the provider before deleting token rows. Availability still depends on deployment configuration: `CONNECTOR_GOOGLE_CLIENT_ID`, `CONNECTOR_GOOGLE_CLIENT_SECRET`, and `CONNECTOR_TOKEN_ENCRYPTION_KEY` must all be present.

## Audit And Diagnostics

Tool and connector mutations write operational metadata and version increments where appropriate. Connector testing stores recent diagnostic logs in `toolConnectorTestLogs`; connector detail pages should use those logs for operator-facing evidence.

For new runtime handlers, ensure agent run timelines and tool-call rows record enough context to debug authorization, validation, downstream errors, and result payloads without storing raw secrets.

## Tests And Verification

Focused tests include:

- `convex/aiTools.test.ts`
- `convex/aiToolExecutionService.test.ts`
- `convex/aiToolReadTools.test.ts`
- `convex/aiToolWriteTools.test.ts`
- agent runtime and run tests that exercise tool calls
- `src/app/(dashboard)/admin/ai/tools/page.test.tsx`

When changing tool UI labels, keep `messages/en.json` and `messages/it.json` in parity. When changing execution policy or handler dispatch, run the full repository verification gate from `AGENTS.md`; documentation-only edits should at least run `git diff --check`.

## Configuration Validation Is Local

`validateConnectorConfiguration` replaces the former misleading connection-test name. It loads the current built-in definition, checks active/install state, required reference presence and OAuth connected state where applicable, then updates `testStatus`, `lastTestedAt`, install status and `toolConnectorTestLogs`. A successful message is “Configuration valid — not yet verified against the provider.” No provider request or secret decryption occurs in this mutation. Preserve that distinction in UI and acceptance records; the legacy table/field name does not establish a network test.

`getConnectorMarketplace` and install detail use admin read builders and handler company policy. Install is super-admin-only; connector update/validation use admin writes with explicit company checks. Tool list/detail reads use platform read builders, including READ_ONLY; tool CRUD and agent binding mutations remain super-admin-only. Company-scoped install data and global catalog data must not be treated as the same authorization scope.

## Residual OAuth And HTTP Boundaries

`beginConnectorOAuth` requires a current built-in definition with OAUTH mode, a supported configured provider and matching install access. The reviewed built-in catalog contains no such current offering following Gmail removal. The generic code remains useful infrastructure, not an active mailbox capability. It creates a PENDING connection and single-use state; `getPendingConnectionByState` rejects non-pending or more-than-fifteen-minute-old rows. Provider callback exchanges and finalization occur server-side; the old client-callable token-reference completion mutation is absent.

`connectorOAuthTokens` holds AES-256-GCM ciphertext under `CONNECTOR_TOKEN_ENCRYPTION_KEY`. Provider credentials are resolved by registry-specific environment names; Google's generic entry can fall back from `CONNECTOR_GOOGLE_CLIENT_ID`/`CONNECTOR_GOOGLE_CLIENT_SECRET` to the auth client pair. Search Console, X and Bing entries have their own configuration and consumers. An access token less than a minute from expiry is refreshed internally. Refresh omission preserves an existing refresh token. Failed renewal can mark the connection dead; no token values belong in diagnostic output or documentation.

The `http.request` handler resolves `base_url` and optional authorization from the configured tool's connector references. Model arguments supply method, relative path and optional JSON body. `resolveHttpConnectorTarget` rejects another host, full URL, backslash and base-path escape. `outboundHttp.request` invokes the checked Node transport. HTTP policy currently uses fifteen seconds, one hundred twenty-eight KiB response and sixty-four KiB request limits. The target response is returned with status and `ok`; non-2xx is not automatically a transport exception. No automatic exactly-once external write guarantee follows from this handler.

## Review Evidence And Remaining Work

This refresh read the current catalog, runtime policy and handler registry, install/configuration validation, residual OAuth state/token flow and bounded HTTP dispatch. Tests in these modules remain local source references; no integration was installed, token exchanged, provider reached or tool executed. Feature-specific DataForSEO, voice, scraping, notifications and personal tasks have their own guides and remaining review queue. A configured mapping is not proof of deployed reachability or completed external rename cutover.
