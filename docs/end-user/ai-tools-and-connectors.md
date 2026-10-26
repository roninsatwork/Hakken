---
product: Hakken
documentation_type: user guide
feature_area: AI tools and connector configuration
audience: company admins, platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/end-user/ai-tools-and-connectors.md
last_reviewed: '2026-10-26T10:05:24+00:00'
reviewed_against: current implementation
status: Current
---
# AI Tools And Connectors

> **Product:** Hakken · **Document type:** User guide · **Feature area:** AI tools and connector configuration
> **Reviewed:** 26 October 2026, 10:05:24 GMT (Europe/London)
> **Source path:** `docs/end-user/ai-tools-and-connectors.md` · **Status:** Current

Hakken tools and connectors let agents use governed capabilities beyond plain text responses. A tool describes an action the AI may request. A connector represents an installed integration or capability bundle that can create one or more tools.

This guide explains the implemented operator surface for connector marketplace installs, Hakken action tools, runtime safety labels, and practical governance.

## Where To Find It

AI tools and connectors are managed from:

- `/admin/ai/tools`: connector marketplace, installed connectors, and Hakken action tools.
- `/admin/ai/tools/new`: create a Hakken action tool.
- `/admin/ai/tools/[id]`: edit a Hakken action tool.
- `/admin/ai/tools/connectors/[id]`: manage an installed connector.

Agent-specific tool bindings are managed from agent administration screens. A tool must exist before it can be bound to an agent.

## Connectors

The connector marketplace lists built-in connector definitions. Each connector shows category, authentication mode, required scopes, description, install state, and test state.

Installed connectors can create or update associated tools from the current built-in definitions. The reviewed catalog includes DataForSEO, Apify actors, Firecrawl, knowledge, company profile, generic tasks, HTTP REST, email notification, Twilio voice and Assistant-facing data/task capabilities. Catalog membership is configuration evidence, not proof that a particular external account is connected or that an action has succeeded.

Generic connector OAuth code remains, but the reviewed built-in catalog no longer advertises an OAuth connector since Gmail retirement. Google, Search Console, X and Bing provider adapters in a shared registry also serve other feature-specific flows; their presence does not recreate a mailbox or create a new marketplace offering. For discovery-based third-party tools, use the separate [Tool Servers](./tool-servers.md) guide.

Install and sync are super-admin writes. Authorized scoped admins can update permitted installs. The current diagnostic action is **Validate configuration**, not a provider connection test. It checks saved enablement, references and OAuth state locally and records diagnostics. A passing message explicitly says the provider has not been verified. Configuration changes reset that status; revalidation still does not contact or prove the remote system.

Secret references are reference keys, not raw secrets. Do not paste API keys, OAuth tokens, private keys, or passwords into connector reference fields unless the field is explicitly designed to store a secret reference managed elsewhere.

## Hakken Action Tools

A Hakken action tool defines a model-callable capability. Each tool has:

- Name: the tool identity shown in administration.
- Description: guidance for when the AI should request the tool.
- Handler mapping: the backend mapping that will execute or stub the action.
- Required role: `ADMIN` or `SUPER_ADMIN`.
- Side-effect level: `READ`, `WRITE`, `DESTRUCTIVE`, or `EXTERNAL`.
- Confirmation requirement: whether explicit user confirmation is required before execution.
- Active state: whether the tool is available.
- Input and output JSON schemas: the expected argument and result shape.

Tool names are normalized to safe identifier-style values. Input schemas must be JSON object schemas.

## Side-Effect Levels

Side-effect labels are part of operational safety:

- `READ`: retrieves information and usually does not require confirmation by default.
- `WRITE`: changes internal state and requires confirmation.
- `DESTRUCTIVE`: deletes or materially damages data and requires confirmation.
- `EXTERNAL`: sends data or performs an action outside Hakken and requires confirmation.

The AI can request a tool call, but that request is not permission to run the tool. Hakken still checks role, tenant boundaries, schema validity, side-effect policy, and confirmation state before execution.

## Connector-Backed Tools

A catalog row and a registered runtime handler are separate things. Current mappings include native knowledge/profile/task operations, website scraping and data collection, MCP dispatch, bounded HTTP requests and Assistant data reads/proposals. Older generic external-service scaffold lists and Gmail `read`/`reply` claims are not current catalog evidence. [Gmail Mailbox](./gmail-mailbox.md) records retirement; no inbox watcher was run or restored here.

Inspect the actual mapping when diagnosing an installed tool. Unsupported mappings can report not implemented or fail as unavailable. Installing a definition does not turn an arbitrary mapping into executable code. MCP servers import discovered tools through their own page and policy, rather than pretending each is a built-in connector definition.

Operators should test connector behavior before telling a customer that a connector can complete live external actions. Connector marketplace presence and generated tool rows are not proof that a live external action can complete.

## Practical Operating Guidance

Before activating or binding a tool:

1. Confirm the tool description is precise enough for an AI model to choose it correctly.
2. Confirm the handler mapping is implemented or intentionally stubbed.
3. Confirm the required role is no broader than necessary.
4. Confirm the side-effect level matches the real-world effect.
5. Confirm writes, destructive actions, and external actions require confirmation.
6. Confirm input schema requires the fields needed for safe execution.
7. Test the relevant agent run path and review run evidence.

Do not use tool descriptions to grant access, store secrets, or bypass tenant boundaries. Tool descriptions help the model decide when to ask for the tool; backend checks decide whether execution is allowed.

## Troubleshooting

If a tool does not run:

- Check whether the tool is active.
- Check whether the agent has the tool bound.
- Check whether the user's role satisfies the required role.
- Check whether the run has the right company context.
- Check whether confirmation is required and was granted.
- Check whether the tool-call arguments match the input schema.
- Check whether the handler mapping is implemented.
- Check connector install, test, OAuth, and secret-reference status.

For failures during agent runs, inspect the agent run timeline and tool-call evidence. Tool results are normalized as success or error payloads so the run record should show whether the failure was authorization, schema validation, missing confirmation, missing handler, or downstream execution.

## Who Can Configure And Use Tools

The UI routes above belong to platform Admin. Read-only platform accounts can inspect catalog queries that allow their role, while tool CRUD, install and agent binding changes require super-admin writes. Some connector read/update operations also support company-scoped admins through backend checks; those permissions do not grant the entire platform console. Confirm active company and install ownership before changing a reference or enabling a mapping.

Ordinary users are not general-purpose tool administrators. The runtime does allow an explicit list of member-readable Assistant handlers, such as a company's website, Search Console, Analytics, Bing, Insights and personal task reads/proposals. That exception requires the allowed handler, a READ policy and no super-admin requirement. A tool being labelled READ is not enough to make every member eligible. Personal task proposals still use their own confirmation workflow before applying changes.

For ordinary built-in tools, an agent deliberately configured as autonomous can waive the human confirmation branch while preserving role and tenant checks. Connected-server non-read tools have a narrower policy and still require approval. Therefore the side-effect label alone is not a universal promise that every write always pauses every kind of agent. Inspect the agent's autonomy, the actual handler and the run evidence together.

## HTTP Connector Limits

A generic HTTP tool sends a method and a relative path under an operator-configured base URL. The base address and authorization header come from backend secret references, rather than a model-supplied destination. Full URLs, host changes and paths escaping the configured base are refused. HTTPS, private-address checks, DNS/socket protection and redirect refusal apply through the shared transport. This limits reach, but it does not establish that an allowed external request is harmless.

The current HTTP policy allows a fifteen-second request, a response body up to one hundred twenty-eight KiB and a request JSON body up to sixty-four KiB. A non-success HTTP status is returned as information with its status/ok fields rather than automatically being treated as a transport exception. A timeout or later error does not prove that a remote write failed to happen. Inspect external state before repeating a sensitive action through an authorized operational procedure.

## OAuth And Delivery Evidence

The residual connector OAuth flow uses a fresh pending state with a fifteen-minute completion window. The callback exchanges a provider code on the server and stores encrypted tokens; a browser cannot mark an arbitrary token reference connected. Access tokens near expiry can be refreshed internally, and disconnect attempts provider revocation before local cleanup. These are implementation paths, not proof that any current catalog entry or deployed account has completed consent.

Do not share secret values, OAuth tokens, callback credentials or approval URLs in troubleshooting notes. Record the connector identity, intended company, diagnostic code and stage that failed. A configuration-valid result is useful for finding missing setup; only an authorized feature-specific live verification can establish remote behavior. No such request was made during this documentation pass.
