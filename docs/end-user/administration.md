# Administration User Guide

## What Administration Is

The administration area is the control centre for running Sonae. It is where authorized operators manage companies, users, invitations, AI settings, models, knowledge, agents, workflows, plans, analytics, maintenance tools, and platform settings. The main admin area is reached at `/admin`, and the sidebar changes to an admin navigation structure when you are in that area.

This guide describes the administration experience that is currently implemented at a high level. Specialized admin areas such as AI administration, agents, workflow automation, releases and observability, and platform operations settings now have dedicated guides. Treat this page as the starting point for understanding who can access admin, what the main groups are, and what happens when administrators manage users, companies, invitations, impersonation, and platform settings.

## Who Can Access It

The `/admin` area is for super administrators. If a signed-in user is not a super admin, the admin layout redirects them back to `/app` and does not show the admin screen while that decision is loading. Normal company administrators use the organization tools in the main app area instead, including `/app/settings`, `/app/settings/team`, and `/app/settings/auth-diagnostics`. Those screens let a company admin work inside their own tenant without exposing global platform controls.

Sonae uses three roles: `USER`, `ADMIN`, and `SUPER_ADMIN`. A standard user can use the normal dashboard features available to their company. A company admin can manage tenant-scoped organization areas and team members, subject to backend limits. A super admin can manage the platform globally, create and configure companies, inspect global analytics, configure AI and maintenance systems, and impersonate a company workspace for support and setup.

## Admin Navigation

When a super admin opens `/admin`, the sidebar shows platform administration groups. The dashboard item opens the global admin overview. Companies opens company management and company detail screens. AI contains costs, chat logs, rules, system prompt, global knowledge, widget, and model configuration. Agents contains approvals, skills, agent management, connectors, workflows, and schedules. Maintenance contains release checks, run observatory, system health, scripts, and auth diagnostics. Settings contains system settings, plans, API keys, webhook deliveries, and analytics. System admins contains super-admin management and super-admin invitations.

The normal application sidebar remains different. In `/app`, users see dashboard, assistant, reports, properties, the temporary posture demo, and for company admins an organization section. Diagnostic arcade routes only appear when diagnostic routing is enabled. This distinction matters because customers should not expect every admin function to be available from the regular user dashboard.

## Admin Dashboard

The admin dashboard provides a global view of platform activity. It includes a timeframe selector with preset and custom ranges, metrics for monthly recurring revenue, registered companies, active users, active context, messages, tokens, and estimated AI cost, plus charts for activity over time and provider or model distribution. Model distribution is backed by daily analytics snapshots for historical windows; provider distribution is strongest for the live raw-data overlay because historical snapshots do not yet store provider totals. Chart areas are wrapped so they can be exported where supported. Empty chart states show when no data is available for the chosen range.

Use the dashboard to understand system-wide adoption, cost movement, message volume, active usage, and company inventory. It is not a billing system by itself and should not be treated as the only source for invoice-grade financial reporting. It is an operational overview for platform administrators.

## Companies and Tenant Workspaces

Company management is a super-admin function. A company represents a tenant workspace. Companies can have a name, description, overview, system prompt, assigned plan, message usage, and related users, invites, knowledge, rules, models, widgets, chat logs, and settings. The company list supports search and paginated browsing. Company rows are enriched with user counts so admins can quickly understand tenant size.

From company detail screens, a super admin can review and configure the tenant. Current routes include overview, profile or detail views, users, invitations, directory views, AI prompt and rules, models, knowledge, chat logs, and widget configuration. Company prompts and rules influence how the assistant behaves for that tenant, but they do not override platform safety or tenant isolation.

Deleting a company is destructive. The implementation deletes the company record, adjusts global inventory, writes an audit entry, and starts asynchronous cleanup of related users and invitations in batches. Because cleanup can continue in the background, administrators should treat company deletion as a serious irreversible operation and confirm they have selected the correct tenant before proceeding.

## Impersonation

Super admins can impersonate a company workspace. While impersonating, the sidebar shows an impersonation notice with the company name and an option to exit the workspace. Impersonation changes the active company context for company-scoped behavior. This is useful for support, setup, checking tenant-specific configuration, and seeing what scoped workflows do inside a company.

Impersonation is intentionally constrained. While a super admin is impersonating a company, user-management writes behave like scoped admin actions rather than unlimited global actions. That means the operator should not expect to create or edit super-admin privileges from inside an impersonated tenant context. Exiting impersonation returns the operator to normal global super-admin context.

## Users and Invitations

The global user management screen is available under `/admin/users`. It lists users and pending invitations together, supports search, shows user identity, role, workspace, joined date, and row actions, and uses pagination. Hover actions let admins open detail, edit a user, or delete a user. Pending invitation rows show that the invite is awaiting acceptance and include a revoke action.

The add/edit modal collects full name, email, role, optional workspace, and avatar URL. Super admins can choose the workspace and can create super admins from global context. Tenant-scoped admins and impersonated super admins are limited to their active company and cannot create, edit, or delete super-admin privileges. Errors appear inside the modal or confirmation dialog.

Invitations can be sent from invite routes. Invitation email content comes from the active invite email template or a default template. The user invite, company invite, and super-admin invite screens share one global invite template; saving that template is a super-admin action, so tenant admins should treat the visible copy as platform-managed unless a super admin has approved a change. In production, Sonae sends through the configured email provider. In a local or unconfigured environment where the email API key is missing, the system can simulate success and still create the pending invite record. The current invitation link sends the recipient to the login page, and access depends on signing in with the invited email address.

Revoking an invitation deletes the pending invite record and records an audit event. Deleting a user is more destructive: the system removes the user row, adjusts inventory totals, writes an audit event, and starts cleanup of related login records, rules, and threads. Administrators should confirm user deletion carefully, especially when the user has created chat history or AI rules.

## System Admins

The system-admin area is for managing super-admin identities and invitations. Super admins can be assigned to or detached from companies for support and ownership flows. These actions are audited. Because super admins have global access when not impersonating a company, only trusted operators should receive this role.

Do not use a super-admin account for everyday tenant work unless the task requires global access. Use impersonation or tenant-scoped admin workflows when the job is to support one company. This reduces the chance of changing the wrong workspace.

## AI Administration

The AI section centralizes governance of Sonae’s AI behavior. The costs screen shows AI cost and usage reporting. Chat logs provide administrative visibility into conversations where supported by the current screen. Rules, system prompts, global knowledge, company knowledge, model defaults, and widget settings determine how the assistant behaves, what it can reference, and which engines are available.

Admins should understand that these controls are layered. The global system prompt gives platform-wide behavior. Company prompts tailor behavior for a specific tenant. Rules add targeted instructions. Knowledge gives reference material. Model settings control available engines and defaults. Safety and tenancy controls still sit above all of these; a rule or document cannot authorize cross-tenant access or hidden prompt disclosure.

Changes to model and prompt configuration can affect users immediately. Test with a normal assistant conversation after changing models, global prompts, company prompts, or active rules. If a tenant reports surprising assistant behavior, check company prompt, active rules, global knowledge, company knowledge, selected model, and usage limits before assuming the chat UI itself is broken.

## Agents, Workflows, Releases, and Connectors

The agents group contains advanced operational tools: approvals, skills, agent management, connectors, workflows, and schedules. Maintenance contains release checks and run observatory. These areas are for configuring and observing automated or agentic behavior. They are more powerful than normal assistant chat because they can involve tools, approvals, schedules, logs, releases, and runtime steps.

Use approvals and logs to understand what automated systems have done or are waiting to do. Use workflow schedules when a workflow should run on a recurring timetable. Use connectors to define external tool access. These areas should be handled by operators who understand the customer workflow and the consequences of automation. See the dedicated agent, AI administration, workflow automation, and release operations guides before handing these controls to non-technical customer admins.

## Settings and Maintenance

System settings include platform branding, plans, API keys, webhook deliveries, and analytics. Branding settings can affect platform name, logos, colours, email sender details, fonts, and related white-label presentation. Plans control tenant allocation and commercial packaging. API keys and webhooks support external integrations and should be treated like sensitive operational credentials. Analytics settings and pages support platform monitoring and reporting.

Maintenance includes system health, scripts, and auth diagnostics. System health helps operators identify platform status. Scripts are maintenance tools and should be run only when the operator understands the script’s purpose and effect. Auth diagnostics support troubleshooting sign-in and account issues. Maintenance tools are not customer-facing everyday workflows; they are operational controls.

## Audit and Login Tracking

Sonae records audit events for many privileged actions, including company create/update/delete, company prompt updates, user create/update/delete, invitation creation and revocation, email template changes, admin login and logout, impersonation changes, super-admin assignment or detachment, and assistant safety refusals. Audit logs help explain who changed what and when.

The header records successful login metadata for signed-in users, including device information and a best-effort IP/location lookup. If the IP lookup fails, Sonae stores a concealed or unknown fallback. Repeated identical login records are throttled to reduce noise. Administrators should use audit and login records as operational evidence, but they should also recognize that location data can be approximate or unavailable.

## Practical Guidance for Admins

Before making a change, confirm the current context: global super-admin mode, impersonated company mode, or tenant-admin organization mode. Check the company name before changing company prompts, users, knowledge, or plans. Use search and pagination to avoid editing the wrong record. For destructive actions, read the confirmation text and verify the target identity or company.

When inviting users, choose the least privileged role that lets the person do their work. Use `USER` for normal product users, `ADMIN` for people who manage a company workspace, and `SUPER_ADMIN` only for trusted platform operators. When troubleshooting assistant behavior, review AI rules and prompts before changing models. When troubleshooting access, review the user’s role, company assignment, invitation status, and whether a super admin is currently impersonating a company.

Administration is powerful because it connects to every major Sonae subsystem. Treat changes as operational changes, not cosmetic edits. When in doubt, make the smallest change that solves the problem, verify it with a normal user journey, and leave enough context in audit notes or support records for the next operator to understand what happened.
