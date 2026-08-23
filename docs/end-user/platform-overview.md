# Sonae Platform Overview

> **What Sonae is, and why it exists, is defined in [PRODUCT.md](../../PRODUCT.md).**
> That document is the single source of truth. This page is the customer-facing
> tour of the platform: who uses it, what each area does, and where to find
> things. Where the two ever disagree, PRODUCT.md is right and this page needs
> correcting.

## In Short

Sonae is a multi-tenant AI platform for organisations that need controlled,
configurable, and auditable AI assistance — across teams, companies, workflows,
and customer-facing experiences.

It brings an AI assistant, admin governance, agent configuration, knowledge
management, workflow automation, analytics, and tenant management into one
system. Each company gets its own users, rules, knowledge, prompts, AI settings,
and reporting, while the whole platform is managed from a central super-admin
layer.

It is built around three ideas:

- Give users an AI assistant that answers questions, works with uploaded files,
  and understands company-specific context.
- Give admins real control over users, companies, models, prompts, rules,
  knowledge, widgets, and usage.
- Give platform operators visibility into cost, activity, health, audit history,
  and workflow execution.

Sonae is **model-agnostic**. It runs across Google Vertex, Anthropic, OpenAI,
and OpenRouter, so a product built on it is not tied to one AI vendor.

## Who Uses It

### End Users

End users work in the main app workspace. They can use the Sonae assistant,
upload files, view reports, use the tools their organisation has enabled, and
access organisation features according to their role.

### Company Admins

Company admins manage their own organisation workspace: team members,
organisation settings, diagnostics, and everything inside their company
boundary.

### Super Admins

Super admins manage the whole platform: companies, users, super-admin access,
AI settings, agents, workflows, system settings, plans, analytics, maintenance
scripts, and platform health.

## Main User Features

### Dashboard

The dashboard at `/app` is the main entry point after login. It is a product
overview rather than an operational report — it introduces what the platform
can do and routes users to the assistant or to the reporting and cost screens.

It includes a primary call to open the assistant, feature cards for model
choice, private knowledge, workflows, widget governance, visibility and cost
control, and sections covering AI safety, tenant privacy, automated checks,
observability, and audit history.

For signed-in super admins, the dashboard also redirects to `/admin` once per
browser session as a convenience. This is a handoff, not a security boundary —
admin access is enforced by the admin layout and by backend checks.

### Ask Sonae Assistant

The assistant is the main AI surface. Users can:

- hold chat conversations, and start or continue threads;
- upload files for the assistant to work with;
- use voice-to-text input;
- choose from the AI models an administrator has made available;
- choose a thinking level for quicker or deeper answers;
- draw on company knowledge automatically through the backend.

### Reports

Sonae includes a reports area, currently covering sales reporting.

### Property Tools

For organisations using the property vertical: property search, collected
property data, data detail pages, and collection logs.

### Organisation Settings

Company admins get an organisation dashboard, team member management, and auth
diagnostics.

### Profile

Every user has a profile area for their own account information and settings.

## Admin Features

### Admin Dashboard

The admin dashboard gives super admins a business and client-health overview:
projected monthly revenue against AI spend, seats in use, clients needing
attention, recent activity, sign-in bands, plan distribution, a client table,
and follow-up items such as pending invitations or clients without a plan.
Detailed provider, model, and usage analysis lives in the AI cost and usage
screens.

### Company Management

Super admins manage tenant companies. The company record is the foundation of
tenant isolation. Company-level areas cover overview, users, invites,
knowledge, AI models, AI rules, system prompt, chat logs, and widget
configuration.

### User Management

Admins manage users and invitations across three roles — super admins, admins,
and users. The backend prevents privilege escalation, particularly around
super-admin permissions.

### Super Admin Management

Super admins can manage other super admins and invite new system
administrators.

### Company Impersonation

Super admins can impersonate a company workspace to inspect or troubleshoot a
tenant's experience. Impersonation is recorded server-side and written to the
audit log.

### Audit Logs

Administrative actions are recorded in an audit ledger, giving the platform
traceability for sensitive changes to users, companies, agents, rules, and
settings.

### Auth Diagnostics

Diagnostics for troubleshooting login, invite, and authentication state issues.

## AI Platform Features

### AI Model Management

Models are configured through stored records rather than hardcoded runtime
choices, across four providers:

- Google Vertex AI
- Anthropic
- OpenAI
- OpenRouter

Admins manage which models are available, which are default, and their
provider configuration. The OpenRouter catalogue can be synced into the
platform, which is what turns a handful of configured models into a large
library.

### AI Running Costs

The platform tracks AI usage and estimated running costs. Admins can review
cost dashboards, usage over time, and cost and activity leaders such as top
companies and top users.

### Global AI Rules

Super admins create and manage platform-wide rules that define boundaries and
behaviour for AI responses.

### System Prompts

Both global and company-specific system prompts are supported, shaping how the
assistant and agents behave.

### Knowledge Management

Sonae includes a knowledge system for uploaded documents and retrieval. Knowledge
exists at four scopes:

- global knowledge, available to every tenant;
- company knowledge, restricted to one workspace;
- agent knowledge, bound to a specific agent;
- chat knowledge, belonging to a single conversation.

The backend stores documents, extracts their content, creates knowledge chunks,
and applies tenant-aware filtering so knowledge cannot leak across company
boundaries.

### AI Tools And Connectors

Admins define the tools and connectors agents may use. Tools carry metadata,
schemas, handler mappings, and access controls.

Tool execution is guarded: the platform validates the tool, checks permissions,
validates the inputs, and enforces the tenant boundary before anything an AI
model requested is allowed to run.

### Agent Management

Agents are configurable AI entities with their own setup — creation and
deletion, dashboard, settings, model, system prompt, rules, schemas, knowledge,
tools, run limits, and logs, including individual log detail pages.

### Chat Logs

Admins can inspect chat logs globally and per company, for monitoring,
debugging, auditability, and cost analysis.

## Workflow And Automation

### Workflow Management

A visual, graph-based editor for AI orchestration, using nodes and connections
to define an automated process.

### Workflow Runtime

Each node runs as its own scheduled step, with state saved between steps. That
means a workflow is not limited by any single function's execution time and
survives a restart. Approval nodes genuinely pause a run until an administrator
decides.

### Workflow Scheduling

Admins can schedule workflows and review schedule detail, so repeatable AI or
operational tasks run automatically.

## Embedded Widgets

Sonae supports embeddable AI chat widgets for use outside the main app — on a
customer website or a tenant-owned page.

Widget surfaces include the public widget route, a sandbox route, admin widget
configuration, company widget configuration, and the embed snippet.

Each widget only loads on domains its owner has approved; a widget with no
domains configured cannot be embedded anywhere, and blocked attempts are
audit-logged.

## Platform Settings And Maintenance

- **System settings** — branding, routing flags, theme configuration, and
  platform behaviour.
- **Plans** — subscription tiers and monthly AI quotas.
- **Analytics settings** — analytics configuration and behaviour.
- **Maintenance scripts** — controlled operational and repair tasks.
- **System health** — surfaces agent failures, schedule failures, stale runs,
  overdue schedules, and other operational risks.

## Security And Governance

Sonae is built around strict role and tenant boundaries:

- Super admins manage the whole platform.
- Admins are scoped to their assigned company.
- Users cannot reach administrative routes.
- Convex queries and mutations verify role and tenant access.
- Company data does not cross tenant boundaries.
- Admin mutations prevent privilege escalation.
- AI tools are validated and authorised before execution.
- Configuration changes are auditable.

The platform also carries personal-data rights handling, retention and purge
controls, an AI register with risk classification, and exportable evidence
packs. For the full governance picture, see
[Governance And Trust](./governance-and-trust.md) and §11 of
[PRODUCT.md](../../PRODUCT.md).

## Technical Foundation

Sonae is built with:

- Next.js App Router for the frontend;
- React for the user interface;
- Tailwind CSS and Framer Motion for the design system and animation;
- Convex for queries, mutations, actions, storage, scheduling, and realtime
  data;
- Convex document storage for the database;
- provider-backed AI execution through Convex actions;
- Google Cloud Run for production deployment.

The dashboard presents Google Cloud, AWS, and Azure as hosting-positioning
options for customer conversations. Those cards are positioning copy — Google
Cloud Run is the implemented production deployment path unless a separate
hosting migration is built and documented.

## Temporary And Diagnostic Areas

Some routes are temporary, diagnostic, or gated by settings:

- movement demo routes;
- movement capture and playback tools;
- the arcade route for Ronin's Run;
- the local test auth route.

The movement demo is frozen. Do not refactor or expand it unless explicitly
asked.
