# AI Tools And Connectors

Sonae tools and connectors let agents use governed capabilities beyond plain text responses. A tool describes an action the AI may request. A connector represents an installed integration or capability bundle that can create one or more tools.

This guide explains the implemented operator surface for connector marketplace installs, Sonae action tools, runtime safety labels, and practical governance.

## Where To Find It

AI tools and connectors are managed from:

- `/admin/ai/tools`: connector marketplace, installed connectors, and Sonae action tools.
- `/admin/ai/tools/new`: create a Sonae action tool.
- `/admin/ai/tools/[id]`: edit a Sonae action tool.
- `/admin/ai/tools/connectors/[id]`: manage an installed connector.

Agent-specific tool bindings are managed from agent administration screens. A tool must exist before it can be bound to an agent.

## Connectors

The connector marketplace lists built-in connector definitions. Each connector shows category, authentication mode, required scopes, description, install state, and test state.

Installed connectors can create or update their associated tools. The current connector categories include knowledge, profile, workflow, HTTP, email, and custom-style integrations. Authentication modes used by built-in connector definitions include no authentication, secret references, and OAuth. The implemented OAuth path is the Gmail mailbox connector; most other external connector definitions are still governed scaffolds unless their handler mapping is registered. A separate MCP tool creation page is not implemented in the current app.

Connector install and sync actions are super-admin controlled. Connector detail pages let authorized admins edit secret references, enabled tool mappings, active state, tenant assignment where allowed, and connection tests. Testing a connector records diagnostic state so operators can see whether the connector is untested, passing, or failing. Configuration changes reset test state, so retest a connector after changing refs, scopes, enabled tools, or active state.

Secret references are reference keys, not raw secrets. Do not paste API keys, OAuth tokens, private keys, or passwords into connector reference fields unless the field is explicitly designed to store a secret reference managed elsewhere.

## Sonae Action Tools

A Sonae action tool defines a model-callable capability. Each tool has:

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
- `EXTERNAL`: sends data or performs an action outside Sonae and requires confirmation.

The AI can request a tool call, but that request is not permission to run the tool. Sonae still checks role, tenant boundaries, schema validity, side-effect policy, and confirmation state before execution.

## Connector-Backed Tools

Some connector-backed tools are currently installed as governed stubs. They can appear in the catalog and runtime declarations, but the backend returns a clear "not implemented" result until a real integration handler is added.

This is intentional for connector scaffolding. The marketplace can show many external-system connector definitions, including common email, calendar, chat, document, CRM, ticketing, issue-tracking, repository, billing, database, and commerce systems. Installing one of those definitions may create tools, but only the mappings with registered backend handlers can actually execute. The Gmail mailbox is the current live external connector with registered `gmail.read` and `gmail.reply` handlers; its behavior is covered in [Gmail Mailbox](./gmail-mailbox.md). Some scaffolded mappings return a normalized "not implemented" result, while other generated mappings fail as unknown or unimplemented until engineering registers a handler.

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
