# Backend And Data Layer

Hakken's backend is implemented in `convex/`. Convex schema, generated types, queries, mutations, actions, HTTP actions, internal jobs, storage, and indexes form the authoritative server layer for the app.

Read this with [Architecture](./architecture.md), [Route Protection And Authentication](./route-protection-and-authentication.md), [Company And User Management](./company-user-management.md), and the feature-specific guide before changing backend behavior.

## Runtime Types

Use the runtime that matches the work:

- Queries read data for UI and should remain bounded, indexed, and authorization-checked.
- Mutations write data and should avoid external network calls or heavy CPU work.
- Actions call providers, parse files, dispatch webhooks, send email, call Apify, and do other external work.
- Internal queries, mutations, and actions connect scheduled or multi-step server workflows without exposing public client entry points.
- HTTP actions in `convex/http.ts` mount public API, workflow webhook, and Apify webhook routes.
- Cron jobs in `convex/crons.ts` schedule analytics snapshots, platform alerts, workflow dispatch, and other background work.

If a path needs external state, use an action and write durable evidence through internal mutations. If a path only changes local Convex data, prefer a mutation.

## Schema Families

`convex/schema.ts` is the source of truth for table fields and indexes. Major table families are:

- Tenant and identity: `companies`, `users`, `invitations`, `logins`.
- Auth and diagnostics: `authEvents`, invite provisioning state, login records, and local-test support helpers.
- AI catalog and helper throttles: `aiProviders`, `aiModels`, `aiModelDefaults`, `aiRules`, `systemConfig`, and `aiActionRequests`.
- Knowledge: `knowledgeDocuments`, `knowledgeChunks`, storage ids, embedding metadata, and vector indexes.
- Chat and widgets: `threads`, `messages`, `widgets`, widget session credentials, and analytics dimensions.
- Agents: agent definitions, tools, eval fixtures, run steps, tool calls, approvals, transactions, logs, reflections, memory candidates, memories, versions, releases, and improvement suggestions.
- Workflows: `workflows`, `workflowExecutions`, `workflowExecutionSteps`, `schedules`, and schedule service helpers.
- Integrations: `apiKeys`, `publicApiRequests`, `webhookDeliveries`, `toolConnectors`, connector secret refs, connector test logs, connector OAuth connection records, Apify runs, and maintenance script runs.
- Product and support data: properties, sales reports, plans, analytics snapshots, arcade scores, movement demo rows, audit logs, purge history, and `mockStorageMetadata` for upload-validation tests.

Do not add ad hoc string fields or JSON blobs when an existing typed schema path can represent the behavior. When JSON is necessary for graph or provider payloads, validate and bound it before execution.

## Authorization

Backend authorization is mandatory even when a route already has a layout guard. Common helpers include:

- `getCurrentUser`, `requireCurrentUser`, `requireAdmin`, `requireSuperAdmin`, `getActiveCompanyId`, and company access helpers in `convex/authz.ts`.
- Action-level auth helpers in `convex/actionAuth.ts`.
- Feature-specific checks in modules such as `userManagementService.ts`, `knowledge.ts`, `agentRuns.ts`, `workflows.ts`, `properties.ts`, and `apiKeys.ts`.

Preserve tenant scoping by company id. Non-super-admin access should be scoped to the user's active company. Super admins may have global access, but impersonation should make tenant-scoped workflows behave like company-admin work where the feature has that boundary.

## Provider And Integration Calls

Provider calls should go through centralized services rather than raw `fetch` scattered through feature modules:

- AI providers use provider adapters and retry helpers such as `aiProviderRetryService.ts`, provider services, and model resolution through `aiModelService.ts`.
- Resend email uses `resendEmailService.ts` for runtime email dispatch.
- Outbound webhooks use `webhookDeliveryActions.ts` with retry and delivery evidence.
- Public API authentication uses `apiKeys.ts` and records request rows.
- Property extraction uses `apify.ts`, `webhooks.ts`, and Apify run records.

Secrets belong in environment variables or secret references, not user-editable system settings. Public or customer-provided URLs should pass through safe URL validation where applicable.

## Background Work

Long-running or multi-step work should create durable state before scheduling follow-up work. Examples include:

- assistant and agent response generation after message insertion
- knowledge ingestion after upload or URL mapping
- workflow execution steps and approval pauses
- scheduled workflow and agent dispatch
- analytics rollup and platform health snapshots
- webhook retry scheduling
- Apify run polling and dataset import
- maintenance script history rows

Avoid assuming a scheduled internal action will always finish. The durable row should make retries, inspection, or failure states possible.

## Audit And Evidence

`auditLogs` record many privileged operations, but not every backend action is covered. Add audit logs for new actions that create, update, delete, revoke, impersonate, change permissions, alter tenant boundaries, change security settings, or run operational repair tasks.

Other evidence tables are equally important for support and operations: agent run timelines, workflow execution steps, auth events, public API request rows, webhook delivery rows, maintenance script runs, analytics health reports, and Apify runs. Use the right evidence store for the feature rather than forcing everything into audit logs.

## Testing And Verification

Backend tests use Vitest and `convex-test`. Keep tests close to the module being changed and include authorization and tenant-boundary cases for any sensitive path.

Focused examples:

- `convex/authz.test.ts`, `convex/users.test.ts`, `convex/userManagementService.test.ts`, and `convex/invites.test.ts` for identity and access.
- `convex/ai*.test.ts`, provider service tests, and knowledge tests for AI and retrieval.
- `convex/agent*.test.ts` for agent lifecycle, runtime evidence, evals, memories, logs, and releases.
- `convex/workflow*.test.ts` and `convex/scheduler.test.ts` for workflow graph execution and schedules.
- `convex/apiKeys.test.ts`, `convex/webhookDeliveries.test.ts`, and `convex/publicApi.ts` related tests for integrations.
- `convex/properties.test.ts`, `convex/apify.test.ts`, and `convex/webhooks.test.ts` for property extraction.

For implementation changes, run the repo gate from `AGENTS.md` before asking for merge or push:

```bash
npm run verify:env
npm run lint:all
npm run check
npm run build
git diff --check
```

For documentation-only changes, this automation runs local Markdown link validation and `git diff --check`.
