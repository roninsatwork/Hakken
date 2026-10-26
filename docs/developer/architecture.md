---
product: Hakken
documentation_type: Developer guide
feature_area: System architecture
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/architecture.md
last_reviewed: '2026-10-26T14:48:56+00:00'
reviewed_against: current implementation
status: Current
---
# System Architecture

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** System architecture
> **Reviewed:** 26 October 2026, 14:48:56 GMT (Europe/London)
> **Source path:** `docs/developer/architecture.md` · **Status:** Current

Hakken is a multi-tenant AI application built with Next.js, React, Convex, and provider-backed AI services. This guide is the high-level map for coding agents before they choose a more specific implementation guide.

For the product vision and what the platform is for, read [PRODUCT.md](../../PRODUCT.md). This guide covers how it is put together, not why it exists.

For local setup and verification, read [Getting Started](./getting-started.md). For route and UI conventions, read [Frontend](./frontend.md). For Convex schema, authorization, jobs, and runtime modules, read [Backend](./backend.md).

## Core Stack

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, Framer Motion, Recharts, React Flow, and shared Hakken UI components.
- Backend: Convex queries, mutations, actions, internal actions, HTTP actions, scheduled jobs, storage, and search/vector indexes.
- Authentication: Convex Auth with invite-based provisioning, Google sign-in, email magic links, and local test-auth helpers.
- AI runtime: model catalog/defaults in Convex, provider services for Google Vertex, OpenAI, Anthropic, OpenRouter, Decision-specific TypeSafe integration, and shared retry helpers.
- Knowledge: Convex storage plus extracted text, chunks, embeddings, and vector search scoped by global, company, agent, or thread ownership.
- Integrations: tenant API keys, public run triggers, workflow webhooks, outbound webhook deliveries, Resend email, retained Apify callback integration, and tool/connector definitions.
- Specialized UI: authenticated dashboard, super-admin area, embedded public widget iframe, sandbox pages, and optional arcade/sandbox experiences.

## Application Boundaries

The app has three major route groups:

- `/app`: authenticated customer workspace for assistant chat, tasks, calls, reception, governance, website measurements/Insights, organization settings, profile, auxiliary tools, and tenant diagnostics.
- `/admin`: platform operations for companies, users, AI settings, agents, workflows, governance, analytics, API keys, connection checks, maintenance scripts, audit logs, and system health.
- Public/supporting routes: `/login`, `/w/[widgetId]`, `/sandbox/[widgetId]`, `/local-test-auth`, Convex HTTP routes, and public landing/redirect behavior.

Do not rely on route grouping alone for security. Sensitive Convex functions enforce authorization again with helpers from `convex/authz.ts`, `convex/actionAuth.ts`, or feature-specific access checks.

## Roles And Tenancy

Hakken uses workspace, platform, and evidence-review roles:

- `SUPER_ADMIN`: platform operator. Can access `/admin`, global configuration, and cross-company operational views where queries permit it.
- `ADMIN`: company administrator. Can manage tenant-scoped organization areas and company-scoped operational evidence.
- `USER`: standard workspace user. Can use customer-facing app features allowed for their company.
- `READ_ONLY`: platform console reader for selected admin evidence surfaces without normal write affordances.
- `AUDITOR`: governance-focused evidence reviewer with access to the governance section rather than general platform administration.

Tenant isolation is company-based. Most customer data carries `companyId`, while super admins can also operate in an impersonated company context through `impersonatingCompanyId`. Runtime code should use active company helpers rather than accepting untrusted company ids from the client unless the route is deliberately a super-admin company route.

## Data And Runtime Shape

`convex/schema.ts` is the source of truth for persistent tables. Important data families include:

- identity and tenancy: `users`, `companies`, `invitations`, `logins`
- AI catalog, governance, and helper throttles: `aiProviders`, `aiModels`, `aiModelDefaults`, `aiRules`, `systemConfig`, and `aiActionRequests`
- assistant and widgets: `threads`, `messages`, `widgets`, widget session credentials, attachment ids, and analytics dimensions
- knowledge and wiki: `knowledgeDocuments`, `knowledgeChunks`, `wikiPages`, source receipts, open questions, unanswered demand, storage ids, embedding metadata, and vector indexes
- agents and operations: `agents`, `agentRuns`, steps, tool calls, approvals, evals, memories, reflections, improvement suggestions, versions, transactions, logs, releases, skills, and skill bindings
- workflows and schedules: `workflows`, `workflowExecutions`, `workflowExecutionSteps`, `schedules`
- integrations and operations: `apiKeys`, `publicApiRequests`, `webhookDeliveries`, `toolConnectors`, connector secret refs, connector OAuth connection records, Apify runs, `maintenanceScriptRuns`, `jobRuns`, `auditLogs`, and purge history
- product/support families: company website holdings, private tracking lists, supplier reports, Analytics/Search Console/Bing/Clarity measurements, Insights findings/drafts/changes, plans, credits, inventory, analytics snapshots and arcade receipts

Queries and mutations should stay fast and bounded. Provider calls, document extraction, webhook dispatch, email sending, Apify sync, and other external or expensive work belong in actions or scheduled internal actions.

## AI And Orchestration

Hakken has several AI execution paths:

- Assistant chat creates threads and messages, then schedules the current Assistant/agent response path; Swarm mode is not a current routed feature.
- Agents run governed objectives with version snapshots, tools, approvals, eval evidence, memories, transactions, logs, and replay support.
- Workflows execute React Flow graphs with trigger, agent, API action, logic, iterator, merge, wait, approval, email, database, and mapping nodes.
- Provider-backed helper actions support voice transcription, workflow node configuration generation, and intent routing with input limits and action-specific rate reservations.
- Reports and knowledge ingestion use AI providers through configured model defaults, not hardcoded runtime literals.
- Model resolution degrades safely: if an agent's configured model is inactive or invalid, execution falls back to the active default, and finally to the system failsafe model (`SYSTEM_FAILSAFE_MODEL_ID` in `convex/aiModels.ts`).

AI output is not authorization. Tool execution, database nodes, public triggers, widget messages, and retrieval paths must validate scope and role before reading or mutating data.

## Audit And Operational Evidence

Audit logs are the durable ledger for many privileged actions, but coverage is broad rather than universal. New destructive, privilege-sensitive, cross-tenant, security, or configuration mutations should add audit evidence unless there is a documented reason not to.

Operational evidence also lives outside `auditLogs`: agent timelines, workflow execution steps, public API request rows, webhook deliveries, auth events, analytics snapshots, maintenance script runs, Apify run logs, and system health reports. Use the feature-specific developer guide before promising support teams that a particular action is audited.

## Deployment Shape

The Next.js app is containerized and hosted on Google Cloud Run; the backend and database are managed by Convex. Never deploy to Vercel. `dev` is the daily working branch; `main` is production, and a push to `main` triggers the production deployment through GitHub Actions after its own gate passes. See [Infrastructure And Deployment](./deployment.md) for the workflows, gates, and secrets.

## Documentation Routing

Use the audience-specific guides instead of overloading this overview:

- Product behavior belongs in `docs/end-user/`.
- Implementation details belong in `docs/developer/`.
- Human runbooks and launch procedures belong in `docs/operator/`.
- Roadmap, debt, and phased work belong in `docs/plans/`.

When adding or changing a durable feature, update the central index and the relevant audience index in the same change.

## Current Website Product Implementation And Intent

The repository now contains substantial website measurement, visibility, Insights, content/editorial and task implementation beyond the older framework map. PRODUCT.md still labels the Hakken product surface planned and says its foundation descriptions were verified earlier. Treat that as a product-document discrepancy requiring owner reconciliation. Describe the specific code found, never infer all of Part Three is delivered, and leave the product roadmap/research records untouched during documentation maintenance.

`websites` represents shared host identity while `companyWebsites` represents a company's holding/relationship. Private Google search and AI question lists are reached through the company's holding/list helpers, including `holdLists.ts`. Shared purchased results and company-private tracking membership have different tenancy. Backend projections, list summaries and compact report parts keep customer screens from reading arbitrary full supplier tables. Access checks must follow the company's actual holding, not merely a known host or question ID.

Measurement connections persist source-specific data for Analytics, Search Console, Bing and Clarity. Disconnect, expiry, catch-up, quota and cleanup semantics differ. Insights uses these held facts to write findings, reviews, planning, checking clocks, page recommendations and draft attribution. Local output can be bounded, inferred or stale even when its screen renders. The feature guides record those limits rather than presenting every number as a real-time provider result.

## Runtime Boundaries And Durable Work

Queries read persisted state and mutations own transactional updates. Actions perform provider/network or multi-query work and schedule internal continuations. Long-running collection needs durable queue/receipt state, heartbeat/progress and refusal/recovery semantics. The SEO collector's continuation design does not imply every other role has the same mechanism: the News Collector currently stops and relies on a later run, a documented gap against the general no-babysitting rule.

Agent skill snapshots record evidence, but current runtime skill text can still come from the active catalog row. Autonomous memory can apply validated candidate content without an individual human decision. Evaluation modes differ: contract smoke checks inspect configuration; model-graded checks run the normal runtime; rehearsals deliberately record some effects without dispatch. A common run row or success label is not a universal exactly-once or no-side-effect contract.

Workflows store graph JSON and per-step state, claim pending work transactionally, and finalize downstream steps before scheduling. External effects and bookkeeping have separate failure possibilities. Repeated email nodes currently share execution/node queue identity across iterator items. Documentation records that limitation without silently changing application idempotency or proof contracts.

## Presentation, Configuration, And Evidence Ownership

The shared screen kit, hooks, theme tokens, fluid dashboard shell, and localized dictionaries govern frontend consistency. `settings.get` exposes an allowlisted public branding projection; `getForAdmin` is a separate privileged read. Stored settings override theme-backed defaults, while `hakken.theme.json` is the repository's approved look record. Navigation hiding is presentation, and server wrappers remain the access boundary.

Global/company/agent/personal context is assembled explicitly. Rule triggers are natural-language model instructions, not deterministic authorization. Known soft-list and internal agent-rule scope discrepancies are recorded for separate source work. Retrieved knowledge, uploaded files, website text and prior messages must not become higher-trust configuration merely because the model saw them. Current read/write ownership should be verified before extending any caller.

Operational evidence includes job ledger rows, queue records, provider costs, daily snapshots, audits, run timelines and retention history. Each has its own bounded read and lifetime. Daily AI costs are USD; plan inventory's price-based mrr is a separate GBP formula rather than collected Stripe revenue. Platform billing setup and company frontend billing stay distinct. Raw reading events can expire while permanent daily engagement totals remain.

## Verification Scope And Documentation Routing

This architecture review used route inventories, schema/module searches, navigation, configuration and the current subsystem guides. It did not execute provider calls, scripts that change data, deployments, captures or app sessions. Git history identifies review points, while uncommitted external source edits in a shared checkout require another targeted look where they affect documented behavior. A local test file is implementation evidence, not a live integration acceptance receipt.

Use [Backend](./backend.md) for function/tenancy/job conventions, [Frontend](./frontend.md) for routes/components, [collection operations](./collection-operations.md) for provider queue work, and [Insights findings](./insights-findings.md) for product evidence flow. The [central inventory](../index.md#documentation-coverage-inventory) remains the single coverage queue; architecture and audience indexes should link it rather than create a competing completion map. Retained Gmail notes and absent-vertical references are historical/possibly deprecated context, requiring manual review before deleting records or guides.
