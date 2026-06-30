# Sonae Product Overview

## What Sonae Is

Sonae is a multi-tenant AI operations platform for organizations that need controlled, configurable, and auditable AI assistance across teams, companies, workflows, and embedded customer-facing experiences.

At its core, Sonae combines an AI assistant, admin governance, agent configuration, knowledge management, workflow automation, analytics, and tenant management into one platform. It is designed so each company can have its own users, rules, knowledge, prompts, AI settings, and reporting while still being managed from a central super-admin layer.

The platform is built around three main ideas:

- Give users an AI assistant that can answer questions, process files, and work with company-specific context.
- Give admins strong control over users, companies, models, prompts, rules, knowledge, widgets, and usage.
- Give platform operators visibility into costs, activity, health, audit history, and workflow execution.

## Primary Audiences

### End Users

End users access the main app workspace. They can use the Sonae assistant, upload files, view reports, use property tools, and access organization-level features depending on their role.

### Company Admins

Company admins manage their own organization workspace. They can manage team members, review organization settings, inspect diagnostics, and work inside their company boundary.

### Super Admins

Super admins manage the whole platform. They can manage companies, users, super-admin access, AI settings, agents, workflows, system settings, plans, analytics, maintenance scripts, and platform health.

## Main User Features

### Dashboard

The user dashboard at `/app` acts as the main entry point after login. It is an authenticated product overview rather than an operational report. It introduces Sonae's platform depth, highlights core capabilities, and routes users toward the assistant or relevant reporting/cost surfaces.

The current dashboard includes:

- a primary call to open the assistant
- feature cards for model choice, private knowledge, workflows, widget governance, visibility, and cost control
- platform-depth sections covering model catalogues, AI safety, tenant privacy, automated checks, observability, costs, workflows, and widgets
- hosting-positioning cards for Google Cloud, AWS, and Azure customer conversations
- assurance and governance sections explaining automated checks, tenant separation, roles, sensitive data handling, approved AI actions, audit history, and platform health
- use-case cards for SaaS portals, internal AI workspaces, and AI automation products
- an explanatory modal behind the "See what is included" action

For signed-in super admins, the app dashboard is also a convenience handoff point: the frontend redirects them to `/admin` once per browser session. This redirect is not an authorization boundary; admin access is still enforced by the admin layout and backend checks.

### Ask Sonae Assistant

The assistant is the main AI interaction surface. Users can start chat threads, ask questions, upload files, select available AI models, and choose different thinking levels.

Current assistant capabilities include:

- Chat-based AI conversations.
- Thread creation and continuation.
- File upload support for chat context.
- Voice-to-text input.
- Model selection from configured active models.
- Thinking-level selection for different response modes.
- Company-aware context through the backend knowledge system.

### Reports

Sonae includes a reports area. The currently visible report surface is a sales report section.

### Property Tools

The app includes property-related tools, including:

- Property search.
- Scraped property data.
- Scraped data detail pages.
- Property logs.

These appear to support workflows around collecting, reviewing, and analyzing property information.

### Organization Settings

For company admins, the app includes organization-level settings such as:

- Organization dashboard.
- Team member management.
- Auth diagnostics.

### Profile

Users have a profile area for account-level information and settings.

## Admin Features

### Admin Dashboard

The admin dashboard gives platform-level visibility into usage and performance. It includes analytics charts and metrics for activity, AI costs, users, companies, provider distribution, and other operational data. Provider distribution is currently strongest for live raw-data attribution; longer historical analytics windows rely more heavily on model distribution, costs, usage, and leaderboard snapshots.

### Company Management

Super admins can manage tenant companies. Company records are the foundation for tenant isolation and company-specific configuration.

Company-level admin areas include:

- Company overview.
- Company users.
- Invites.
- Company knowledge.
- Company AI models.
- Company AI rules.
- Company system prompt.
- Company chat logs.
- Company widget configuration.

### User Management

Admins can manage users and invitations. The platform supports role-based access across:

- Super admins.
- Admins.
- Users.

The backend is expected to prevent privilege escalation, especially around super-admin permissions.

### Super Admin Management

Super admins can manage other super admins and invite new system administrators.

### Company Impersonation

Super admins can impersonate a company workspace. This allows platform operators to inspect or troubleshoot a tenant experience while still retaining central admin control.

### Audit Logs

Administrative actions are recorded in an audit ledger. This gives the platform traceability for sensitive changes such as users, companies, agents, rules, and settings.

### Auth Diagnostics

Sonae includes auth diagnostics for troubleshooting login, invite, and authentication state issues.

## AI Platform Features

### AI Model Management

Sonae supports model configuration through stored model records rather than hardcoded runtime choices. The codebase includes provider support for model systems such as:

- Google Vertex AI.
- OpenAI.
- Anthropic.

Admins can manage available models, defaults, and provider-related configuration.

### AI Running Costs

The platform tracks AI usage and estimated running costs. Admins can review cost dashboards, usage over time, and cost/activity leaders such as top companies and top users.

### Global AI Rules

Super admins can create and manage global AI rules. These rules help define platform-wide boundaries and behavior for AI responses.

### System Prompts

The platform supports both global and company-specific system prompts. These prompts shape the behavior of the assistant and agents.

### Knowledge Management

Sonae includes a knowledge system for uploaded documents and retrieval-augmented generation.

Knowledge can exist at different scopes, including:

- Global knowledge.
- Company knowledge.
- Agent knowledge.
- Chat-specific uploaded documents.

The backend stores documents, parses content, creates knowledge chunks, and uses tenant-aware filtering to avoid cross-company data leakage.

### AI Tools And Connectors

Admins can define AI tools/connectors that agents may use. Tools have metadata, schemas, handler mappings, and access controls.

Tool execution is guarded so the platform validates the tool, checks permissions, validates inputs, and enforces tenant boundaries before running anything requested by an AI model.

### Agent Management

Sonae includes configurable AI agents. Agents are specialized AI entities with their own configuration.

Agent features include:

- Agent creation and deletion.
- Agent dashboard.
- Agent settings.
- Agent model configuration.
- Agent system prompt.
- Agent rules.
- Agent schemas.
- Agent knowledge.
- Agent integrations/tools.
- Agent logs.
- Individual log detail pages.

### Chat Logs

Admins can inspect chat logs globally and at the company level. This supports monitoring, debugging, auditability, and cost analysis.

## Workflow And Automation Features

### Workflow Management

Sonae includes workflow management for visual AI orchestration. Workflows appear to be graph-based, with nodes and edges used to define automated processes.

### Workflow Runtime

The backend includes workflow execution services, runtime helpers, config validation, and execution tracking.

### Workflow Scheduling

Admins can schedule workflows and view schedule details. This allows repeatable AI or operational tasks to run automatically.

### Workflow Logs

The platform includes workflow execution logs and detail pages for reviewing execution history, failures, and runtime behavior.

## Embedded Widget Features

Sonae supports embeddable AI widgets.

Widget-related surfaces include:

- Public widget route.
- Sandbox widget route.
- Admin widget configuration.
- Company widget configuration.
- Integration snippet support.

This suggests Sonae can expose AI chat or assistant functionality outside the main app, such as on a customer website or tenant-owned page.

## Platform Settings And Maintenance

### System Settings

Super admins can manage platform settings such as branding, routing flags, theme-related configuration, and platform-level behavior.

### Plans

The platform includes plan management for subscription tiers and monthly AI quotas.

### Analytics Settings

Admins can manage analytics-related settings and inspect analytics behavior.

### Maintenance Scripts

Sonae includes a maintenance scripts area for controlled operational scripts and repair tasks.

### System Health

The platform includes system health monitoring. This is intended to surface platform issues such as agent failures, schedule failures, stale runs, overdue schedules, and other operational risks.

## Security And Governance

Sonae is designed around strict role and tenant boundaries.

Key governance rules include:

- Super admins can manage the whole platform.
- Admins are scoped to their assigned company.
- Users are restricted from administrative routes.
- Convex queries and mutations must verify role and tenant access.
- Company data must not leak across tenant boundaries.
- Admin mutations must prevent privilege escalation.
- AI tools must be validated and authorized before execution.
- Configuration changes should be auditable.

## Technical Foundation

Sonae is built with:

- Next.js App Router for the frontend.
- React for the user interface.
- Tailwind CSS and Framer Motion for the design system and animation.
- Convex for backend queries, mutations, actions, storage, scheduling, and realtime data.
- Convex document storage for the database.
- Provider-backed AI execution through Convex actions.
- Google Cloud Run for production deployment.

The dashboard also presents Google Cloud, AWS, and Azure as customer-facing hosting-positioning options. Those cards are product positioning copy for handoff and sales conversations; the current repository deployment documentation still treats Google Cloud Run as the implemented production deployment path unless a separate hosting migration is built and documented.

## Temporary Or Diagnostic Areas

The codebase includes some routes that appear temporary, diagnostic, or restricted by settings.

These include:

- Movement demo routes.
- Movement capture and playback tools.
- Arcade route for Ronin's Run.
- Local test auth route.

The movement demo is currently marked as frozen in the repo handoff and should not be refactored or expanded unless explicitly requested.

## Short Positioning Statement

Sonae is a governed AI platform for companies that need more than a basic chatbot. It gives organizations a configurable assistant, tenant-aware knowledge, AI agents, workflow automation, embedded widgets, cost analytics, audit logs, and admin controls in one system.

## One-Sentence Summary

Sonae helps organizations deploy, manage, monitor, and govern AI assistants and agent workflows across multiple companies, users, knowledge sources, and embedded experiences.
