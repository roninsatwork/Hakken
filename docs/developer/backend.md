---
product: Hakken
documentation_type: Developer guide
feature_area: Backend architecture
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/backend.md
last_reviewed: '2026-10-26T14:48:56+00:00'
reviewed_against: current implementation
status: Current
---
# Backend And Data Layer

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Backend architecture
> **Reviewed:** 26 October 2026, 14:48:56 GMT (Europe/London)
> **Source path:** `docs/developer/backend.md` · **Status:** Current

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
- Product and support data: website holdings and private lists, measurement/report rows, Insights, content, plans, credits, analytics snapshots, arcade receipts, audit logs, purge history, and `mockStorageMetadata` for upload-validation tests.

Do not add ad hoc string fields or JSON blobs when an existing typed schema path can represent the behavior. When JSON is necessary for graph or provider payloads, validate and bound it before execution.

## Authorization

Backend authorization is mandatory even when a route already has a layout guard. Common helpers include:

- `getCurrentUser`, `requireCurrentUser`, `requireAdmin`, `requireSuperAdmin`, `getActiveCompanyId`, and company access helpers in `convex/authz.ts`.
- Action-level auth helpers in `convex/actionAuth.ts`.
- Feature-specific checks in modules such as `userManagementService.ts`, `knowledge.ts`, `agentRuns.ts`, `workflows.ts`, `websites.ts`, and `apiKeys.ts`.

Preserve tenant scoping by company id. Non-super-admin access should be scoped to the user's active company. Super admins may have global access, but impersonation should make tenant-scoped workflows behave like company-admin work where the feature has that boundary.

## Provider And Integration Calls

Provider calls should go through centralized services rather than raw `fetch` scattered through feature modules:

- AI providers use provider adapters and retry helpers such as `aiProviderRetryService.ts`, provider services, and model resolution through `aiModelService.ts`.
- Resend email uses `resendEmailService.ts` for runtime email dispatch.
- Outbound webhooks use `webhookDeliveryActions.ts` with retry and delivery evidence.
- Public API authentication uses `apiKeys.ts` and records request rows.
- Retained Apify callback records do not establish a current Properties feature; inspect actual enabled paths before extending compatibility code.

Secrets belong in environment variables or secret references, not user-editable system settings. Public or customer-provided URLs should pass through safe URL validation where applicable.

## Background Work

Long-running or multi-step work should create durable state before scheduling follow-up work. Examples include:

- assistant and agent response generation after message insertion
- knowledge ingestion after upload or URL mapping
- workflow execution steps and approval pauses
- scheduled workflow and agent dispatch
- analytics rollup and platform health snapshots
- webhook retry scheduling
- provider collection continuations and compact result filing
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
- optional module (not included in this copy), `convex/apify.test.ts`, and `convex/webhooks.test.ts` for property extraction.

For implementation changes, follow the current complete gates in [AGENTS.md](../../AGENTS.md).

For documentation-only changes, this automation runs local Markdown link validation and `git diff --check`.

## Website Holdings And Reporting Data

The current backend includes shared website identities, company holdings, private keyword/AI tracking lists, supplier purchases, source connections, and materialized customer report projections. Company-private lists must use `holdLists.ts`; a website-wide read can cross the intended membership boundary even when the external measurement itself is shared. Queries should reuse the existing list summaries and report parts rather than fetch a row per question/engine or reconstruct entire supplier histories in a screen.

Google Analytics, Search Console, Bing, Clarity, local profiles, reviews, backlinks, paid search and technical audits differ in provider allowance, retention and result semantics. Their actions must keep provider work outside mutations and respect existing quotas/continuations. A source-specific zero, absent slot or partial read should not be recast as a confirmed business absence. The detailed guides identify table/index and side-effect ownership.

Insights uses held facts for bounded discovery, specialist calls, strategy, recommendations, draft workflows and later outcome checks. `insightsReads` exposes tenant projections; internal jobs write findings/change evidence. Natural-language advice, an approved draft, a queued task and externally applied work are separate states. The Track record aggregates have replay/correction limits, so do not infer universal causal attribution or immutable financial evidence from a saved outcome.

## Internal Visibility And Idempotency

Internal functions are callable only through the backend surface, but still need valid ownership associations from their callers. Public wrappers include intentional anonymous widget/session and signed-token routes, while tenant/admin/platform wrappers provide different enforcement. Reusing a broad internal query in a tenant context requires verifying its company assumptions. The documented rule-list and subject-access discrepancies demonstrate why a role-gated page is not sufficient evidence for every server function.

A transaction can protect a receipt/state update, but it cannot roll back a provider request already performed in an action. Keep effect-specific idempotency and retry policy explicit. Arcade completion stores its score on a receipt to make repeat taps safe; workflow email identity omits item index and can suppress repeated iterator effects; News X cursors can progress before summaries are saved. These are separate contracts, not one generic exactly-once promise.

Analytics snapshot generation is now an internal action reading 500-row pages, refusing a partial model catalog or a day above its interaction ceiling, then writing daily summaries. It has a date-check/insert separation that does not prove concurrent exactly-once generation. Inventory rebuilding reads one past 10,000 per source table and refuses overflow before replacement. Documentation must preserve those refusal and coverage semantics when describing maintenance.

## Configuration And Operational Limits

Model selection comes from stored defaults/provider policy, not feature-local model literals. Current text adapters include Google Vertex, OpenAI, Anthropic and OpenRouter; TypeSafe is restricted to Decisions. Grounding, media and embeddings have narrower paths. Secrets remain backend environment or secret references, while browser-intended identity/tracking projections are explicitly allowlisted. A configured provider row does not prove live credentials or permission for a particular job.

Use `keepRules.ts`, shared purge orchestration and each owning deletion path before promising retention. Message attachments, source archives, Wiki pages, candidate memories, raw events and permanent aggregates have different lifetimes. A bounded parent deletion may not remove every related historical row or provider-side copy. Preserve dated verification records rather than editing them to match a later implementation.

Relevant backend evidence spans auth/tenant tests, source-specific queue tests, Insights utility/projection tests, agent/workflow recovery tests and operational guards. This documentation review inspected those sources without running application gates or live operations. Code repairs, schema changes, migrations, provider tests, deployment and roadmap decisions remain separate authorized tasks. The central documentation index tracks library gaps; these backend conventions are a map to that evidence, not proof every function was executed or every deployed integration accepted.
