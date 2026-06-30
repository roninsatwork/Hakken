# System Architecture

Sonae is a multi-tenant AI application built with Next.js, React, Convex, and provider-backed AI services. This guide is the high-level map for coding agents before they choose a more specific implementation guide.

For local setup and verification, read [Getting Started](./getting-started.md). For route and UI conventions, read [Frontend](./frontend.md). For Convex schema, authorization, jobs, and runtime modules, read [Backend](./backend.md).

## Core Stack

- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, Framer Motion, Recharts, React Flow, and shared Sonae UI components.
- Backend: Convex queries, mutations, actions, internal actions, HTTP actions, scheduled jobs, storage, and search/vector indexes.
- Authentication: Convex Auth with invite-based provisioning, Google sign-in, email magic links, and local test-auth helpers.
- AI runtime: model catalog/defaults in Convex, provider services for Google Vertex, OpenAI, Anthropic, and shared provider retry helpers.
- Knowledge: Convex storage plus extracted text, chunks, embeddings, and vector search scoped by global, company, agent, or thread ownership.
- Integrations: tenant API keys, public run triggers, workflow webhooks, outbound webhook deliveries, Resend email, Apify property extraction, and tool/connector definitions.
- Specialized UI: authenticated dashboard, super-admin area, embedded public widget iframe, sandbox pages, and the frozen temporary movement demo.

## Application Boundaries

The app has three major route groups:

- `/app`: authenticated customer workspace for assistant chat, reports, properties, organization settings, profile, auxiliary tools, and tenant diagnostics.
- `/admin`: super-admin platform operations for companies, users, AI settings, agents, workflows, releases, analytics, API keys, maintenance scripts, audit logs, and system health.
- Public/supporting routes: `/login`, `/w/[widgetId]`, `/sandbox/[widgetId]`, `/local-test-auth`, Convex HTTP routes, and the root redirect.

Do not rely on route grouping alone for security. Sensitive Convex functions enforce authorization again with helpers from `convex/authz.ts`, `convex/actionAuth.ts`, or feature-specific access checks.

## Roles And Tenancy

Sonae uses three roles:

- `SUPER_ADMIN`: platform operator. Can access `/admin`, global configuration, and cross-company operational views where queries permit it.
- `ADMIN`: company administrator. Can manage tenant-scoped organization areas and company-scoped operational evidence.
- `USER`: standard workspace user. Can use customer-facing app features allowed for their company.

Tenant isolation is company-based. Most customer data carries `companyId`, while super admins can also operate in an impersonated company context through `impersonatingCompanyId`. Runtime code should use active company helpers rather than accepting untrusted company ids from the client unless the route is deliberately a super-admin company route.

## Data And Runtime Shape

`convex/schema.ts` is the source of truth for persistent tables. Important data families include:

- identity and tenancy: `users`, `companies`, `invitations`, `logins`
- AI catalog, governance, and helper throttles: `aiProviders`, `aiModels`, `aiModelDefaults`, `aiRules`, `systemConfig`, and `aiActionRequests`
- assistant and widgets: `threads`, `messages`, `widgets`, widget session credentials, attachment ids, and analytics dimensions
- knowledge: `knowledgeDocuments`, `knowledgeChunks`, storage ids, embedding metadata, and vector indexes
- agents and operations: `agents`, `agentRuns`, steps, tool calls, approvals, evals, memories, reflections, improvement suggestions, versions, transactions, logs, releases, skills, and skill bindings
- workflows and schedules: `workflows`, `workflowExecutions`, `workflowExecutionSteps`, `schedules`
- integrations and operations: `apiKeys`, `publicApiRequests`, `webhookDeliveries`, `toolConnectors`, connector secret refs, connector OAuth connection records, Apify runs, `maintenanceScriptRuns`, `auditLogs`, and purge history
- product features: properties, sales reports, plans, inventory rollups, analytics snapshots, app launch plans, app template catalog data, arcade scores, and movement demo data

Queries and mutations should stay fast and bounded. Provider calls, document extraction, webhook dispatch, email sending, Apify sync, and other external or expensive work belong in actions or scheduled internal actions.

## AI And Orchestration

Sonae has several AI execution paths:

- Assistant chat creates threads and messages, then schedules normal, agent, or swarm response generation.
- Agents run governed objectives with version snapshots, tools, approvals, eval evidence, memories, transactions, logs, and replay support.
- Workflows execute React Flow graphs with trigger, agent, API action, logic, iterator, merge, wait, approval, email, database, and mapping nodes.
- Provider-backed helper actions support voice transcription, workflow node configuration generation, and intent routing with input limits and action-specific rate reservations.
- Reports and knowledge ingestion use AI providers through configured model defaults, not hardcoded runtime literals.

AI output is not authorization. Tool execution, database nodes, public triggers, widget messages, and retrieval paths must validate scope and role before reading or mutating data.

## Audit And Operational Evidence

Audit logs are the durable ledger for many privileged actions, but coverage is broad rather than universal. New destructive, privilege-sensitive, cross-tenant, security, or configuration mutations should add audit evidence unless there is a documented reason not to.

Operational evidence also lives outside `auditLogs`: agent timelines, workflow execution steps, public API request rows, webhook deliveries, auth events, analytics snapshots, maintenance script runs, Apify run logs, and system health reports. Use the feature-specific developer guide before promising support teams that a particular action is audited.

## Documentation Routing

Use the audience-specific guides instead of overloading this overview:

- Product behavior belongs in `docs/end-user/`.
- Implementation details belong in `docs/developer/`.
- Human runbooks and launch procedures belong in `docs/operator/`.
- Roadmap, debt, and phased work belong in `docs/plans/`.

When adding or changing a durable feature, update the central index and the relevant audience index in the same change.
