# AI Tools And Connectors Developer Guide

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
- `getConnectorInstallDetails`, `updateConnectorInstall`, and `testConnectorConnection` manage connector state. OAuth functions now back the Gmail mailbox connector and are guarded by provider credential availability.
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
- `mailboxMessages`: Gmail watcher ledger and reply-rail counters.
- `aiTools`: tool name, description, handler mapping, connector linkage, secret ref keys, required role, input/output schemas, side-effect level, confirmation requirement, active state, version, and audit metadata.
- `agentTools`: agent-to-tool bindings.
- `agentToolCalls`: run-time tool call evidence for agent executions.

Connector installs can be global or tenant-restricted. Tenant-restricted connector installs carry a company id. Global connector installs must not carry a company id.

There is no implemented dedicated MCP tool creation route in the current app. Custom or connector-style behavior must go through the implemented tool creation route, connector detail pages, and the registered runtime handler system. Do not document MCP proxy creation as live behavior unless a concrete route and runtime handler are added.

The built-in connector catalog is broader than the runtime handler registry. `convex/toolConnectorDefinitions.ts` currently includes scaffold definitions for Hakken-native tools plus external systems such as Slack, Google Drive, Gmail, Google Calendar, Microsoft Outlook, Microsoft Teams, Notion, HubSpot, Salesforce, Zendesk, Jira, Linear, GitHub, Stripe, Airtable, and Shopify. Installing one of these connectors can create generated `aiTools` rows, but generated rows are not proof that a runtime handler is registered. Gmail is the live exception: `google-gmail` has registered `gmail.read` and `gmail.reply` handlers and dedicated behavior in [Gmail Mailbox](./gmail-mailbox.md). Runtime execution still depends on `REGISTERED_TOOL_HANDLERS` in `convex/aiToolExecutionService.ts`.

## Tool Contract Validation

Tool input and output schemas are stored as JSON strings. `validateToolJsonSchemaString` requires a JSON object schema and validates root `type`, `properties`, and `required` shape. Runtime argument validation checks required fields and simple property types, including integer handling.

`normalizeToolExecutionPolicy` forces confirmation for `WRITE`, `DESTRUCTIVE`, and `EXTERNAL` tools. `READ` tools can opt into confirmation but do not require it by default.

Provider-facing function names are normalized from handler mappings, so keep handler mappings stable and explicit. Changing a mapping can break model-call resolution and registered handler dispatch.

## Authorization And Runtime Safety

The central runtime rule is that model tool calls are requests, not authority. `canExecuteTool` and `assertCanExecuteTool` enforce:

- authenticated user requirement
- administrator role requirement
- super-admin requirement for super-admin tools
- company boundary checks for non-super-admin users
- explicit confirmation when required

Super admins may execute across companies, but confirmation is still required when policy requires it. Standard users cannot execute tools. Admin users cannot execute tools across tenant boundaries.

Preserve these checks even when adding provider-specific tool-call formats. Provider adapters may format declarations differently, but execution must pass through the deterministic policy path.

## Registered Handlers

Current registered handler mappings include:

- `knowledge.search`: queries scoped knowledge through `internal.aiToolReadTools.searchKnowledge`.
- `company.overview.update`: updates company overview state through `internal.aiToolWriteTools.updateCompanyOverview`.
- `gmail.read`: reads the connected tenant Gmail mailbox through `internal.gmailConnector.readMailbox`.
- `gmail.reply`: replies in the original Gmail thread through `internal.gmailConnector.replyToMessage`, with recipient and reply rails enforced server-side.
- `workflow.task.create`: connector stub.
- `http.request`: connector stub.
- `notification.send`: connector stub.
- `slack.message.send`: connector stub.
- `google_drive.search`: connector stub.

Stub handlers return a normalized not-implemented result. Other generated built-in connector mappings, including Calendar, Outlook, Teams, Notion, HubSpot, Salesforce, Zendesk, Jira, Linear, GitHub, Stripe, Airtable, and Shopify mappings, currently have connector definitions but no registered runtime handler. Those mappings fail through `Unknown or unimplemented tool handler mapping.` if an agent run reaches execution. Do not document a catalog scaffold as a live external integration. When implementing a connector for real, add a concrete handler, register it in `REGISTERED_TOOL_HANDLERS`, preserve tenant checks, validate arguments, and add tests.

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

OAuth connector state is implemented for Google Gmail. `beginConnectorOAuth` creates a pending connection and authorize URL, the Convex HTTP authorize/callback routes exchange the provider code server-side, token ciphertext is stored in `connectorOAuthTokens`, `getConnectorAccessToken` refreshes near expiry, and disconnect revokes at the provider before deleting token rows. Availability still depends on deployment configuration: `CONNECTOR_GOOGLE_CLIENT_ID`, `CONNECTOR_GOOGLE_CLIENT_SECRET`, and `CONNECTOR_TOKEN_ENCRYPTION_KEY` must all be present.

## Audit And Diagnostics

Tool and connector mutations write operational metadata and version increments where appropriate. Connector testing stores recent diagnostic logs in `toolConnectorTestLogs`; connector detail pages should use those logs for operator-facing evidence.

For new runtime handlers, ensure agent run timelines and tool-call rows record enough context to debug authorization, validation, downstream errors, and result payloads without storing raw secrets.

## Tests And Verification

Focused tests include:

- `convex/aiTools.test.ts`
- `convex/aiToolExecutionService.test.ts`
- `convex/aiToolReadTools.test.ts`
- `convex/aiToolWriteTools.test.ts`
- `convex/gmailConnector.test.ts`
- `convex/gmailWatcher.test.ts`
- agent runtime and run tests that exercise tool calls
- `src/app/(dashboard)/admin/ai/tools/page.test.tsx`

When changing tool UI labels, keep `messages/en.json` and `messages/it.json` in parity. When changing execution policy or handler dispatch, run the full repository verification gate from `AGENTS.md`; documentation-only edits should at least run `git diff --check`.
