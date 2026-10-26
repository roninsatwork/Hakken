---
product: Hakken
documentation_type: End-user guide
feature_area: Platform operations settings
audience: platform administrators
source_repository: roninsatwork/Hakken
source_path: docs/end-user/platform-operations-settings.md
last_reviewed: '2026-10-26T14:33:53+00:00'
reviewed_against: current implementation
status: Current
---
# Platform Operations Settings

> **Product:** Hakken · **Document type:** End-user guide · **Feature area:** Platform operations settings
> **Reviewed:** 26 October 2026, 14:33:53 GMT (Europe/London)
> **Source path:** `docs/end-user/platform-operations-settings.md` · **Status:** Current


## Inherited Collection And Display Limits

This section covers the current Limits screens for super admins. The broader operational topics retained below still need separate revalidation. A company's Limits screen is an operator view inside platform Admin; its company-specific name does not grant company admins access. Subscription plans and quotas have a separate purpose and guide: [Platform Plans And Quotas](./platform-plans-and-quotas.md).

Open `/admin/settings/limits` to change the platform defaults. From a company's Websites section, open `/admin/companies/[id]/websites/limits` to inspect that company's values. An individual holding has `/admin/companies/[id]/websites/site/[companyWebsiteId]/limits`. Use the company and website selected in Admin rather than substituting another company's identifiers in a copied address. Missing company or holding records produce a not-found message. The read queries also admit read-only platform accounts; saving is restricted to super admins. Company admins do not gain access to these controls.

Each limit follows its own chain. A website uses its explicit value if it has one; otherwise it follows its company. A company without its own value follows the platform. The platform uses a saved setting or the built-in starting value. Inheritance is per field: one website can keep its own keyword count while following the company for backlinks. Choosing the same number as the parent explicitly still creates an override; choose the inherited option when the intention is to follow future parent changes.

Company dropdowns identify the platform default and its number. Website dropdowns identify the company setting and its number. The platform has no inherited option. Pick an available number, then save the relevant topic card. Each topic has its own save controls: changes left in another topic are not included. A successful save clears the local edits for that card and shows saved feedback. If saving fails, read the inline error and check the saved value before retrying. The screen uses guarded admin actions to prevent overlapping duplicate saves; that is not evidence that downstream collection has already completed.

The topics cover personal Hakken task counts, Google keywords and backlinks, local offices and map research, brand radar, AI questions, matching pages to topics, Search Console tracked lists and reports, page classifications, keyword research, whole-company limits, and shared platform processing. Only applicable topics appear. A competitor holding has the data limits the backend permits for competitors, rather than the full own-website research configuration. A limit about the whole company cannot be set on an individual website.

Some numbers belong only to the platform because the underlying work is shared. They include sources and businesses kept from an AI answer, discoveries from a shared purchase, and maximum rows in a download. Company pages show these values with a link to the platform setting. Website pages do not offer them as overrides. Raising a company setting cannot bypass a platform-only limit.

Treat the setting's description and units as part of the decision. A number of rows shown, a number of days read, and a number of purchased searches constrain different work. Setting a larger report window is not a guarantee of older data availability. Increasing a collection allowance does not prove that a provider purchase has run or that its quota permits it. Decreasing a setting does not by itself establish that previously stored rows were erased. These mutations save configuration and audit evidence; retention and collection consumers must be checked for their particular effect.

The screen lists lower-level overrides and links to their owners. Use that information when a platform change seems to leave one company or website unaffected. The platform summary reads bounded override tables, so absence from that summary is not an unlimited census of every override in a very large deployment. Inspect the specific company or holding when investigating a discrepancy.

Before raising an allowance, identify whether the relevant workflow buys external data, asks an AI provider, or only reads existing data. More capacity can increase cost when that consumer next runs. Google quotas and provider balances remain independent constraints. No live supplier checks or collection runs were performed for this documentation review. The verified evidence is the Limits pages, their shared screen, and `convex/platformLimits.ts`, `companyDataLimits.ts`, `fanOutLimits.ts`, and `sharedLimits.ts`.

Platform operations settings are the internal controls for API keys, maintenance scripts, system health, connection checks, auth diagnostics, and audit review. These screens help operators run Hakken safely after launch. They are not everyday customer-user workflows.

For task-level incident health checks and maintenance scripts, see [System Health And Maintenance](./system-health-and-maintenance.md). For auth diagnostics, audit evidence, analytics health, and retention purges, see [Operational Diagnostics And Retention](./operational-diagnostics-and-retention.md).

## Where To Find It

- `/admin/settings` opens system settings, which groups its screens under four menus: Identity, Security, White Label, and System Options. Old `?tab=` links forward to the screen that replaced them.
- `/admin/settings/api-keys` creates and revokes tenant-scoped API keys.
- `/admin/settings/analytics` manages the platform analytics tracking id and shows analytics data-health checks.
- `/admin/settings/scripts` lists allowlisted maintenance scripts.
- `/admin/settings/scripts/[scriptId]` opens one maintenance script and its run history.
- `/admin/health` shows platform health, budget pressure, analytics health, and operational risk signals.
- `/admin/connections` shows whether external dependencies and scheduled jobs have been checked recently and whether any need attention.
- `/admin/auth-diagnostics` opens the admin auth diagnostics surface.
- `/app/settings/auth-diagnostics` opens the company-admin diagnostics surface.
- `/admin/audit-logs/[id]` opens an audit log detail view from the settings audit feed.

Access depends on role and scope. Super admins can review platform-wide data where the backend allows it. Company admins can only see company-scoped diagnostics and operations where the product exposes them.

## Main System Settings

System settings groups its screens under four menus, each opening the screens that belong to it.

- **Identity** — Core Identity (platform name, logos, pricing display values, email sender presentation) and Global Aesthetics (fonts, colours, radius).
- **Security** — System Security (PII handling) and Logs & Retention (the retention pipelines, and the only place that decides how long any record is kept).
- **White Label** — Readiness, Brand Handoff, Module Presets, Navigation Profiles, Custom Domain, and Packaging. These are read-only evidence views for preparing a branded customer environment; use them to check that identity, widget, email, diagnostic routing, and production-readiness requirements are complete before handing a deployment over.
- **System Options** — Developer Diagnostics, Self-Improvement (how the AI learns), and Agent Approval Window (how long a paused agent run waits for a person).

Each screen saves only itself, so a save on one screen never commits changes left on another.

Logo uploads use the admin image upload policy. Settings changes can affect every tenant, so confirm whether the change is global branding, a customer package requirement, or only a local test before saving.

The Self-Improvement screen has five platform-wide switches: automatic reflection on failed runs, outcome-weighted memory ranking, chat feedback buttons, rated-answer influence on knowledge retrieval, and Autonomous memory. All default on when no saved configuration exists. Autonomous memory is the consequential switch: when enabled, safe memory suggestions are saved immediately, labelled as saved by the AI, audited, and remain removable; when disabled, new memory suggestions wait for a person. The other switches affect collection or ranking and do not authorize prompt, tool, skill, routing, approval-policy, or eval changes.

## API Keys

API keys are tenant-scoped secrets for public API and webhook surfaces. The current scopes are:

- `agent:run`: trigger governed agent runs.
- `workflow:run`: trigger governed workflows.
- `run:read`: read run status and evidence.

When an API key is created, Hakken returns the raw secret once. After that, the system stores only a digest and a prefix. Operators should record the secret in the approved customer secret store immediately; it cannot be recovered from Hakken later.

Each key has a company, name, scopes, status, rate limit per minute, optional expiry, creator, and revocation metadata. Revoke a key when ownership changes, a secret is exposed, a customer no longer needs integration access, or a launch test key is no longer required.

## Webhook Deliveries

Webhook deliveries have no listing screen. The delivery engine — queueing, dispatch, retry backoff and per-attempt recording — is built and works, but nothing queues a delivery and there is nowhere in the product to register a destination URL, so the log could never contain anything. The screen was removed rather than left showing an empty log of an event that cannot happen. To make webhooks real: give a company somewhere to store a destination, and call `recordQueuedInternal` when a run finishes.

## Analytics Settings

Analytics settings manage the global Google Tag Manager or Google Analytics tracking id. Operators can commit a new id, remove the id by saving a blank value, or revert unsaved edits before saving.

The same page shows analytics data health over the last seven days, including daily snapshot coverage, duplicate snapshot groups, message dimension drift, missing threads, live assistant message counts, and live agent transaction counts. Use this page when dashboard metrics look stale or inconsistent, and follow the documented analytics health or backfill path before trusting trend charts again.

Tracking configuration and data-health checks are separate concerns. A valid tracking id does not prove analytics rollups are healthy, and a data-health warning does not necessarily mean the tracking id is wrong.

## Maintenance Scripts

Maintenance scripts are allowlisted operational actions. The current registry includes `inventory-rollup-rebuild`, which recalculates admin overview inventory and MRR metrics from current companies, users, and plans.

The maintenance scripts page shows script name, category, risk level, latest status, last run time, and last runner. Opening a script shows its description, when to run it, expected changes, repeatability, expected duration, history, and run action.

Scripts are permission-checked, confirmation-gated, and audited. They do not run arbitrary commands. Only run a script when the symptom matches the script description and the expected changes are acceptable.

## System Health

System health summarizes recent operational signals. It covers analytics snapshot coverage, live message and transaction counts, message analytics dimensions, agent failures, failed transactions, stale runs, pending approvals, failed tool calls, provider failures, high-cost agents, budget pressure, schedule issues, and alert-rule statuses.

The page presents runbook text for each signal and can download the current health report as JSON. Use it before and after launches, after provider incidents, before customer reviews, and whenever dashboard counts, scheduled jobs, approvals, or agent runs look wrong.

System health is evidence, not an automatic fix. A warning should lead to the relevant run timeline, approval queue, provider health check, schedule page, analytics job, or maintenance script.

## Connections

Connections is the maintenance view for live dependency checks. It has one table
for external dependencies and one table for scheduled jobs. Each row says
working, unknown, or needs attention in words, shows the last checked/heard
time, supports search, and paginates at 15 rows. The Check Now action asks the
backend to probe configured dependencies immediately.

Use Connections when the app seems healthy internally but an integration,
provider, or recurring job may have stopped responding. Use System Health when
the question is about Hakken's own stored data, alerts, budgets, stale runs, or
analytics.

## Unified Purges

Unified purges live under the `Purges` tab in `/admin/settings`. They control retention for agent logs, workflow logs, user logins, chat history, and audit logs. Each pipeline has a retention period, schedule interval, enabled state, manual run action, cancellation action for running purges, and recent history.

Purges permanently delete old operational data. The interface confirms manual runs and cancellation, but cancellation does not restore records already deleted. Use the dedicated diagnostics and retention guide before changing purge policy or starting a manual purge.

## Auth Diagnostics

Auth diagnostics help support sign-in and account issues. The admin route and app settings route share the same diagnostics feature. Use it when a user cannot sign in, appears in the wrong company, has a role mismatch, or is affected by invite or session state.

Diagnostics should be handled with care because auth data can be sensitive. Confirm the user, company, and role before changing account configuration.

## Audit Log Detail

Audit log detail shows the event signature, timestamp, actor, target object, and metadata payload for one audit event. It is useful for explaining who changed a privileged setting, when the change happened, and what metadata was captured.

Audit coverage is broad but not perfect. Some older surfaces may not have the same detail as newer privileged actions. When an operational decision depends on audit evidence, check both the audit detail and the feature-specific screen.

## Practical Operator Flow

For integration launches, create a tenant-scoped API key with only the scopes required, record the one-time secret securely, then review public API request and webhook delivery evidence after the first test.

For operational incidents, start with system health. Open the linked runbook target, inspect run timelines or schedule state, then use maintenance scripts only when the script matches the symptom. Record the reason for any key revocation, release rollback, or manual repair in the relevant operational notes.

## Identity And Global Aesthetics

The settings root redirects to `/admin/settings/identity`. Appearance lives at `/admin/settings/identity/aesthetics`; security, retention, and options each have their own route. Retained `?tab=` bookmarks redirect to supported current sections. Audit history belongs in Governance. A bookmark opening identity does not imply that an old tab or packaging panel still exists.

Platform identity and aesthetics affect every workspace consuming shared branding. Only super-admins can write these saved settings. The login page receives a limited public name/logo/theme projection; commercial fields and sender addresses use a separate privileged read. A normal company administrator's billing access does not grant global settings permission.

Use the current controls for typography and theme tokens rather than old descriptions of retired base-font-size/radius fields. The saved look and the repository's theme record have an explicit maintenance workflow; a successful identity save is not a deployment or external DNS change. Logo uploads and removal also have storage ownership and validation steps. No settings, theme, sender domain, or external integration were changed by this documentation pass.
