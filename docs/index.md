---
product: Hakken
documentation_type: documentation index
feature_area: coverage inventory and prioritized queue
audience: all documentation audiences
source_repository: roninsatwork/Hakken
source_path: docs/index.md
last_reviewed: '2026-10-26T15:24:20+00:00'
reviewed_against: current implementation
status: Current
---
# Hakken Documentation

> **Product:** Hakken · **Document type:** documentation index · **Feature area:** coverage inventory and prioritized queue
> **Reviewed:** 26 October 2026, 15:24:20 GMT (Europe/London)
> **Source path:** `docs/index.md` · **Status:** Current









This is the front door for Hakken documentation. Use the audience sections below to decide where a document belongs and where to start reading.

## Structure

- [Product](./product/index.md): the dated research set behind PRODUCT.md — vision, competitive landscape, data sources, closed research gaps. Evidence, not specification; do not edit to match later decisions.
- [Plans](./plans/index.md): active, completed, and historical plans created during product and engineering work.
- [Developer](./developer/index.md): technical setup, architecture, implementation guides, platform extension notes, and agent handoff material.
- [Operator](./operator/index.md): internal runbooks for release review, packaging, demos, and platform operations.
- [End User](./end-user/index.md): customer-friendly documentation about the platform, features, and workflows.

## Start Here

- New coding agents: read [AGENTS.md](../AGENTS.md), then [historical maintenance plan](./developer/future-agent-maintenance-plan.md) for context; current AGENTS.md takes precedence and its absent movement paths are not current feature evidence.
- Local development: read [Getting Started](./developer/getting-started.md), then [Deployment](./developer/deployment.md).
- Product vision and strategy: read [PRODUCT.md](../PRODUCT.md). It is the single source of truth for what Hakken is. The evidence behind it is in [Product Research](./product/index.md).
- Customer-facing product tour: read [Platform Overview](./end-user/platform-overview.md).
- Planning work: add new plans under [Plans](./plans/index.md), usually in `docs/plans/active/`.

## Placement Rules

- Put dated product research, market evidence, and strategy source documents in `docs/product/`. These are records, not living docs: supersede them with a new dated document rather than editing them.
- Put work plans, roadmaps, phased refactors, and cleanup checklists in `docs/plans/`.
- Put implementation details, architecture, tests, backend/frontend rules, and future-agent guidance in `docs/developer/`.
- Put internal human runbooks and launch/demo procedures in `docs/operator/`.
- Put customer-facing explanations in `docs/end-user/`.
- Move completed execution checklists from `docs/plans/active/` to `docs/plans/completed/` when they are no longer current work.

## Documentation Map

## Coverage Note

The August 2026 audit below is historical context, not evidence that the current
library is complete. The weekly baseline now lives in the
[Documentation coverage inventory](#documentation-coverage-inventory) and its
[prioritized queue](#prioritized-documentation-queue). Audience indexes remain
the guide directories; this inventory records verification depth and gaps.
Current source contains newer Analytics, Insights, Bing, Clarity, website,
content and task capabilities absent from the old guide map. Existing guides
require revalidation; presence alone does not make them current.

### Product

- [Product Research Index](./product/index.md)
- [App Vision v2.3](./product/app-vision-v2.md) — dated September 2026 research and planning record; current intent is in PRODUCT.md.
- [AI Visibility Landscape](./product/ai-visibility-landscape-sept-2026.md) — forty competitors by tier, funding, pricing, feature matrix, unit economics.
- [Data Sources And Integrations](./product/data-sources-and-integrations-sept-2026.md) — every source by layer with read/write access, cost, priority, legal exposure, and build order.
- [Research Gaps Closed](./product/research-gaps-closed-sept-2026.md) — market size, platform risk, incumbent roadmaps, the legal position, and the two phase-0 test protocols.
- [Research Note: Dooley's Search Stack](./product/research-note-dooley-search-stack-sept-2026.md) — the six-layer SEO/SMO/AEO/GEO/DEO/SXO frame and where it stops.

### Newly Reviewed Feature Guides

- [Google Analytics — user](./end-user/google-analytics.md) / [developer](./developer/google-analytics.md)
- [Search Console — user](./end-user/search-console.md) / [developer](./developer/search-console.md)
- [Bing Webmaster — user](./end-user/bing-webmaster.md) / [developer](./developer/bing-webmaster.md)
- [Websites And Visibility — user](./end-user/websites-and-visibility.md) / [developer](./developer/websites-and-visibility.md)
- [Keyword Research — user](./end-user/keyword-research.md) / [developer](./developer/keyword-research.md)
- [Insights Findings — user](./end-user/insights-findings.md) / [developer](./developer/insights-findings.md)
- [Microsoft Clarity — user](./end-user/microsoft-clarity.md) / [developer](./developer/microsoft-clarity.md)
- [Hakken Tasks — user](./end-user/hakken-tasks.md) / [developer](./developer/hakken-tasks.md)
- [Telegram — user](./end-user/telegram.md) / [developer](./developer/telegram.md)
- [Reading Room — user](./end-user/reading-room.md) / [developer](./developer/reading-room.md)
- [Content translation — developer](./developer/content-translation.md) — internal process; reader behavior is covered in Reading room and email guides.
- [Collection operations — operator](./operator/collection-operations.md) / [developer](./developer/collection-operations.md)

### Plans

- [Product-building foundations after cloning](./plans/active/product-building-foundations-plan.md)
- [Optional Billing Starter and Current Handoff](./plans/active/optional-billing-starter-proposal.md) — approved company frontend, private super-admin billing and dated verification; see the operator guide for setup.

- [Plans Index](./plans/index.md)
- [Ronin's Run — Night Heist Plan](./plans/active/ronins-run-night-heist-plan.md) — four playable maps, saved campaign unlocks, Spirit Power takedowns, preserved visual reference, asset provenance and remaining play/quality acceptance checks.
- [Admin Clone-Readiness Plan](./plans/completed/admin-clone-readiness-plan.md) — approved plan for the admin section's last hand-drawn debts: button migration onto the screen kit, collapsing mirrored screens, de-branding via `platformName`, and full admin copy externalisation into the message catalogues.
- [Foundation Quality Plan](./plans/completed/foundation-quality-plan.md) — approved pre-clone plan for wiki/AI-runtime test coverage, `appError` conversion, splitting the `ai.ts` and `analyticsCron.ts` grab-bags, and the docs tidy-up.
- Movement Definitive Plan (not included in this copy) — the single source of truth for current movement work.
- Movement Studio Reward Presentation Fix Plan (not included in this copy) — active movement presentation fix plan for clearer reward and scoring feedback without reopening frozen motion implementation work.
- [Platform Hardening Plan](./plans/active/platform-hardening-plan.md) — the platform hardening record for non-movement platform correctness, security, operational envelope, agent runtime, and reusability.
- [Admin UI/UX Plan](./plans/active/admin-ux-plan.md) — active admin usability plan for the model catalogue, Skill Center, skill detail, model defaults, system options, API keys, and related admin screens.
- [OpenRouter And Model Scale Plan](./plans/active/openrouter-and-model-scale-plan.md) — active AI provider/model catalogue scale plan for OpenRouter, provider resolution, paging, search indexes, and rollups.
- [AI Checks Plan](./plans/active/ai-checks-plan.md) — active AI testing plan for company evals, agent evals, shared check vocabulary, and readiness gates.
- [Agent Observability Plan](./plans/active/agent-observability-plan.md) — active observability plan for agent overview, job detail, raw logs, and linked run evidence.
- [Agent Autonomy And Approvals Plan](./plans/active/agent-autonomy-and-approvals-plan.md) — active plan for autonomous tool execution, approval queues, and approval expiry behaviour.
- [Company AI Readiness Rebuild Plan](./plans/active/company-ai-readiness-rebuild-plan.md) — active plan for replacing the company AI readiness screen and its score/signal model.
- [Company And Agent Model Defaults Plan](./plans/active/company-and-agent-model-defaults-plan.md) — active plan for aligning company and agent model-default controls with the platform model-defaults screen.
- [Public Website Plan](./plans/active/public-website-plan.md) — active plan for the pre-login public website, including home, platform, showcase, trust, and contact work.
- [User Directory Plan](./plans/active/user-directory-plan.md) — active plan for the platform-wide user directory, login recording, and user activity aggregation.
- [Email Design System Plan](./plans/active/email-design-system-plan.md) — active plan for the shared outbound email shell, plain-text parity, sender identity, and accessible colour contract.
- Workspace Sales Data Plan (not included in this copy) — active plan for the optional workspace spreadsheet-import vertical and module gating.
- Workspace Customer CRM Plan (not included in this copy) — active plan for customer records, profiles, typed-in details, and sales history inside workspace sections.
- Workspace Customer Research Agent Plan (not included in this copy) — active plan for internet backfill, prospect discovery, researched-field provenance, and customer/prospect write boundaries.
- [Market Discovery Agent Plan](./plans/completed/market-discovery-agent-plan.md) — retired 2026-10-10: the plan for finding new parent companies outside imported groups, about 70% built before the Sales Data module it belonged to was stripped on 2026-09-21. History only.
- Comax Opportunity Report Plan (not included in this copy) — active plan for prospect valuation, chain gap analysis, opportunity-report tools, and the workspace opportunity report screen.
- [Research Agent Autopilot Plan](./plans/completed/research-agent-autopilot-plan.md) — retired 2026-10-10: the queue-backed job for customer research and prospecting sweeps, built 2026-08-03 and stripped with the Sales Data module on 2026-09-21. History only.
- [Governance And Trust Plan](./plans/active/governance-and-trust-plan.md) — delivered 2026-08-06; kept active for its framework test and recorded decisions. Covers the AI register, risk classification, evidence export, the Governance section, and the roles, one-time-code sign-in and personal-data-rights work behind it.
- [Governance Screens Read A Summary Plan](./plans/active/governance-screens-read-a-summary-plan.md) — active plan for replacing expensive governance overview reads with maintained rollups and snapshots.
- [Audit Trail Plan](./plans/active/audit-trail-plan.md) — active plan for the real audit-trail screen, filters, detail view, event export, and trust-report path.
- [Knowledge Markdown And Bulk Upload Plan](./plans/active/knowledge-markdown-and-bulk-upload-plan.md) — implemented Markdown, OKF bundle, folder-upload, and pending-file queue contract.
- [Two Brains Architecture](./plans/active/two-brains-architecture.md) — active architecture note for the platform/company wiki split and how global and company knowledge stay separate.
- [Personal Layer And Goals Plan](./plans/active/personal-layer-and-goals-plan.md) — active plan for the user's personal assistant layer, goals, and memory surfaces.
- [Wiki Scaling Note](./plans/active/wiki-scaling-note.md) — active note for wiki scale limits, route ownership, and follow-up areas as the wiki grows.
- [Self-Improvement Plan](./plans/active/self-improvement-plan.md) — implemented reflection, memory-ranking, chat-feedback, retrieval-prior, and autonomous-memory control plan.
- [Retention And Purge Plan](./plans/active/retention-and-purge-plan.md) — current retention pipeline, purge cascade, stuck-run, and enablement decision record.
- [Theme Compliance Plan](./plans/active/theme-compliance-plan.md) — dashboard theme-token, status-tone, settings, and hardcoded-colour ratchet contract.
- [Assistant Streaming All Providers Plan](./plans/active/assistant-streaming-all-providers-plan.md) — current provider adapter streaming contract for plain assistant replies.
- [Tasks And Notifications Plan](./plans/active/tasks-and-notifications-plan.md) — active plan for assigned work, in-app notifications, task tools, and task workflow nodes.
- [Seven Gaps Plan](./plans/active/seven-gaps-plan.md) — active product gap map covering the last major experience areas around channels, tasks, and personal assistance.
- [Showcase Channels Plan](./plans/active/showcase-channels-plan.md) — active umbrella plan for voice, phone, language, photo, Gmail, and receptionist-channel work.
- [Voice Session Plan](./plans/active/voice-session-plan.md) — active spoken-session plan for speech input, spoken replies, and the sound-shape presentation.
- [Voice Languages Plan](./plans/active/voice-languages-plan.md) — active plan for detecting spoken language and answering in kind.
- [Photo Actions Plan](./plans/active/photo-actions-plan.md) — active plan for image attachments, vision-aware routing, and task creation from photos.
- [Gmail Inbox Plan](./plans/completed/gmail-inbox-plan.md) — retired 2026-10-10: the dedicated Gmail connector, mailbox watcher and reply/task handling, built 2026-08-14; Gmail was removed from the app on 2026-10-09. History only.
- [Receptionist Kiosk Plan](./plans/active/receptionist-kiosk-plan.md) — active plan for the walk-up kiosk surface and visitor-session handling.
- [Documentation Coverage Audit](./plans/active/documentation-coverage-audit.md) — current documentation audit map, work queue, and validation notes.
- [Hakken Speaks The Standard Tool Plug](./plans/active/tool-server-plan.md) — active plan for connecting Hakken to a service's own published tool server, so its tools arrive without an integration being written.
- [Knowing When It Breaks — PARKED](./plans/active/monitoring-plan.md) — parked plan for real error monitoring across both halves of the product.
- [The Clean Cut — Turning A Clone Into A Client's Own Product](./plans/active/client-product-cut-plan.md) — delivered locally 2026-09-13: verified framework + Arcade exports with four optional areas, folders and dependencies included.
- [Outstanding Tasks](./plans/active/OUTSTANDING-TASKS.md) — current queue of remaining work outside the platform hardening plan.
- Retired and completed plans live in [docs/plans/completed/](./plans/index.md#retired-and-completed-plans). Historical plans are background only unless an active document explicitly reopens them.

### Developer

- [Developer Index](./developer/index.md)
- [Getting Started](./developer/getting-started.md)
- [Architecture](./developer/architecture.md)
- [Frontend](./developer/frontend.md)
- [Backend](./developer/backend.md)
- [Deployment](./developer/deployment.md)
- [Future Agent Maintenance Plan](./developer/future-agent-maintenance-plan.md)
- [Function And Feature Coverage Matrix](./developer/function-and-feature-coverage-matrix.md)
- [Route Reference](./developer/route-reference.md)
- [Convex API And Schema Reference](./developer/convex-api-and-schema-reference.md)
- [Operational Scripts Reference](./developer/operational-scripts-reference.md)
- [Assistant Chat](./developer/assistant-chat.md)
- [Spoken Channels](./developer/spoken-channels.md)
- [Photo Actions](./developer/photo-actions.md)
- [Receptionist Screen](./developer/receptionist-screen.md)
- [Tasks And Notifications](./developer/tasks-and-notifications.md)
- [Public Website](./developer/public-website.md)
- [Governance And Trust](./developer/governance-and-trust.md)
- [Screen Kit](./developer/screen-kit.md)
- Sales Data Workspace (not included in this copy)
- [Administration](./developer/administration.md)
- [Company And User Management](./developer/company-user-management.md)
- [Company AI Readiness And Checks](./developer/company-ai-readiness-and-checks.md)
- [Data Retention And Purges](./developer/data-retention-and-purges.md)
- [Email Branding](./developer/email-branding.md)
- [Email System](./developer/email-system.md)
- [Gmail Mailbox — retired](./developer/gmail-mailbox.md)
- [Route Protection And Authentication](./developer/route-protection-and-authentication.md)
- [Tenancy Enforcement](./developer/tenancy-enforcement.md)
- [AI Administration](./developer/ai-administration.md)
- [AI Rules And Prompts](./developer/ai-rules-and-prompts.md)
- [AI Models, Providers, And Costs](./developer/ai-models-providers-and-costs.md)
- [AI Tools And Connectors](./developer/ai-tools-and-connectors.md)
- [Tool Servers](./developer/tool-servers.md)
- [Analytics Rollups](./developer/analytics-rollups.md)
- [Audit Log Service](./developer/audit-log-service.md)
- [Agents](./developer/agents.md)
- [Manage Agents Secondary Tabs UX Plan](./developer/manage-agents-secondary-tabs-plan.md)
- [Agent Configuration And Catalogs](./developer/agent-configuration-and-catalogs.md)
- [Agent Runtime Operations](./developer/agent-runtime-operations.md)
- [Auth Diagnostics](./developer/auth-diagnostics.md)
- [Auxiliary App Experiences](./developer/auxiliary-app-experiences.md)
- [Embedded Widgets](./developer/embedded-widgets.md)
- [Knowledge Management](./developer/knowledge-management.md)
- [Company Wiki](./developer/company-wiki.md)
- [Maintenance Scripts](./developer/maintenance-scripts.md)
- [Organization And Company Workspaces](./developer/organization-and-company-workspaces.md)
- [Platform Operations Settings](./developer/platform-operations-settings.md)
- [Platform Plans And Quotas](./developer/platform-plans-and-quotas.md)
- [Public API And Webhooks](./developer/public-api-and-webhooks.md)
- [Run Observatory](./developer/run-observatory.md)
- [System Health And Platform Alerts](./developer/system-health-and-platform-alerts.md)
- [System Settings And Branding](./developer/system-settings-and-branding.md)
- Temporary Posture Studio Demo (not included in this copy)
- [Workflow Automation](./developer/workflow-automation.md)
- [Workflow Runtime Internals](./developer/workflow-runtime-internals.md)
- Property Research And Board Reports (not included in this copy)
- Sales And Board Reports (not included in this copy)
- [Product Extension Guide](./developer/product-extension-guide.md)
- [Upload And Knowledge Policy](./developer/upload-and-knowledge-policy.md)
- [AI Provider Tool Extension](./developer/ai-provider-tool-extension.md)
- [Agent Skill Authoring Guide](./developer/agent-skill-authoring-guide.md)
- [Agentic Starter Framework Overview](./developer/agentic-starter-framework-overview.md)
- [New Agentic App Setup Checklist](./developer/new-agentic-app-setup-checklist.md)
- [Starter App Template Checklist](./developer/starter-app-template-checklist.md)

#### Required Movement Mirror Methodology

Before changing movement-side behaviour, read **Movement Mirror And Side-Ownership Contract (not included in this copy)**. Instructor motion is anatomical identity; player-avatar motion is anatomical opposite; the instructor and player avatar must finish on the same anatomical movement. Preview mirroring, coordinate reflection, side ownership, and scoring correspondence are separate decisions.

- Movement Tracking (not included in this copy)
- Movement Demo Client Recovery Plan (not included in this copy)
- Movement Demo Game And Replay Parity Plan (not included in this copy)
- Movement Demo Replay Lab Plan (not included in this copy)
- **Movement Mirror And Side-Ownership Contract — required (not included in this copy)**
- Movement Demo Retargeting Approach (not included in this copy)
- Movement Studio And Replay Unification Plan (not included in this copy)
- Movement Studio Reward Presentation Fix Plan (not included in this copy)
- Movement Studio VrmAvatar Inventory (not included in this copy)

### Operator

- [Operator Index](./operator/index.md)
- [Local Demo Seed Runbook](./operator/local-demo-seed-runbook.md)
- [Local Test Auth Runbook](./operator/local-test-auth-runbook.md)
- [Vertical App Packaging Checklist](./operator/vertical-app-packaging-checklist.md)
- [Build a new application from Hakken](./operator/cloning-hakken.md)
- [Product Setup After Cloning](./operator/product-setup.md)
- [Optional Stripe Billing](./operator/stripe-billing.md)
- [Generate a Product Feature](./developer/feature-generator.md)
- [Product Recipes](./developer/product-recipes.md)
- [Reviewed Framework Updates](./operator/framework-updates.md)
- Movement Demo Pitch Runbook (not included in this copy)
- Movement Demo Manual Smoke Checklist (not included in this copy)
- Movement Demo Live Rehearsal Notes Template (not included in this copy)
- Movement Demo Presenter Card (not included in this copy)

### End User

- [End User Index](./end-user/index.md)
- [Platform Overview](./end-user/platform-overview.md)
- [Public Website](./end-user/public-website.md)
- [Governance And Trust](./end-user/governance-and-trust.md)
- Sales Data Workspace (not included in this copy)
- [Login, Access, And Authentication](./end-user/login-access-and-authentication.md)
- [Assistant Chat](./end-user/assistant-chat.md)
- [Spoken Channels](./end-user/spoken-channels.md)
- [Photo Actions](./end-user/photo-actions.md)
- [Receptionist Screen](./end-user/receptionist-screen.md)
- [Tasks And Notifications](./end-user/tasks-and-notifications.md)
- [Administration](./end-user/administration.md)
- [AI Administration](./end-user/ai-administration.md)
- [AI Rules And Prompts](./end-user/ai-rules-and-prompts.md)
- [AI Models, Providers, And Costs](./end-user/ai-models-providers-and-costs.md)
- [AI Tools And Connectors](./end-user/ai-tools-and-connectors.md)
- [Tool Servers](./end-user/tool-servers.md)
- [Agents](./end-user/agents.md)
- [Agent Setup And Configuration](./end-user/agent-setup-and-configuration.md)
- [Agent Operations And Review](./end-user/agent-operations-and-review.md)
- [Auxiliary App Experiences](./end-user/auxiliary-app-experiences.md)
- [Embedded Widgets](./end-user/embedded-widgets.md)
- [Emails From Hakken](./end-user/emails.md)
- [Gmail Mailbox — retired](./end-user/gmail-mailbox.md)
- [Knowledge Management](./end-user/knowledge-management.md)
- [Company Wiki](./end-user/company-wiki.md)
- [Health](./end-user/health.md)
- [Organization And Company Workspaces](./end-user/organization-and-company-workspaces.md)
- [Company Workspace Administration](./end-user/company-workspace-administration.md)
- [Company AI Readiness And Checks](./end-user/company-ai-readiness-and-checks.md)
- [Platform Plans And Quotas](./end-user/platform-plans-and-quotas.md)
- [Platform Operations Settings](./end-user/platform-operations-settings.md)
- [System Health And Maintenance](./end-user/system-health-and-maintenance.md)
- [Operational Diagnostics And Retention](./end-user/operational-diagnostics-and-retention.md)
- [Public API And Webhooks](./end-user/public-api-and-webhooks.md)
- [Widget Handoff And Troubleshooting](./end-user/widget-handoff-and-troubleshooting.md)
- Temporary Posture Studio Demo (not included in this copy)
- [Workflow Automation](./end-user/workflow-automation.md)
- Property Research And Board Reports (not included in this copy)
- Sales And Board Reports (not included in this copy)


## Documentation Coverage Inventory

Repository root resolved by Git: `/Users/ants/Projects/Kakken`. Branch: `dev`.
Origin: `https://github.com/roninsatwork/Hakken.git`. Baseline local HEAD:
`d3c105f8ad0fe75660d8b32a372d65be35cd77b1`. No fetch or pull. Initial discovery began at
2026-10-26T08:43:26+00:00; each row and guide records its actual subsequent review.
Final inventory reconciliation: **2026-10-26T15:20:24+00:00**, Europe/London.

This first run began with **41 queued work units** and expanded to **89** through
implementation-led discovery and subdivision. All **89/89 known units have received
the scoped source/documentation review recorded below (100%)**. No identified missing,
stale or thin guide remains in the executable documentation queue after validation.
This means completion of this discovered inventory, not a proof that every behavior
of every source file is exhaustively audited or that no undiscovered capability exists.
Current source and future changes can reveal additional work.

Discovery enumerated **419 page files, five Next route handlers, 2099 recognized
registered exports across 430 top-level Convex modules, 300 table declarations and
84 directly referenced environment names**. Route families, navigation, backend families,
roles/tenancy, jobs, integrations, storage, scripts and relevant test sources were compared
with the capability rows. These are static-pattern/file counts, not feature or live-acceptance
counts. Detailed behavior depth is stated per row. Concurrent uncommitted Insights source
changes were reinspected and documented under Q89; the baseline commit alone does not
identify that working-tree implementation.

Documentation discovery classes are **39 new, 45 changed,
3 existing and 2 possibly removed**.
These describe documentation discovery, not newly delivered or deleted products.
Implemented foundations, product intent and dated plans remain distinct. A missing file
is never a link target; internal-only areas have no artificial customer guide.

| ID | Capability and implementation status | Classification | Evidence paths and symbols (repository relative; a shared directory prefix may be omitted after semicolons) | Audience guide coverage | Reviewed work, limits and remaining decision |
| --- | --- | --- | --- | --- | --- |
| 01 | **Google Analytics** — Private property connection, conversion definitions, retained reporting, Live and tracking checks. Implemented; reviewed. | changed | `convex/googleAnalyticsConnect.ts:saveWhatCounts; googleAnalyticsAgentRun.ts; src/app/(dashboard)/app/analytics/` | [User](./end-user/google-analytics.md) / [Developer](./developer/google-analytics.md) | Review priority P1; complete. Q01. Complete reviewed pair; deeper screen-specific coverage may still emerge. Reviewed 2026-10-26T08:30:17+00:00. |
| 02 | **Outbound email and personal communication choices** — Outbox lifecycle, sender, digest delivery, opt-out and suppression. Implemented; reviewed. | changed | `convex/outbox.ts:queueOutboxMessage; emailSenderRun.ts:sendOutbox; readerPreferences.ts; src/app/(dashboard)/app/profile/CommunicationTab.tsx` | [User](./end-user/emails.md) / [Developer](./developer/email-system.md) | Review priority P1; complete. Q02. Complete refreshed pair; no live delivery verification. Final shell/palette cross-check is dated in the developer guide metadata. Reviewed 2026-10-26T14:38:35+00:00. |
| 03 | **Plans, quotas and optional Stripe billing** — Plan catalog, company entitlement, checkout and recovery. Implemented; reviewed. | changed | `convex/plans.ts:getMyCompanyPlanStatus; billing.ts:getStatus; billingPolicy.ts; src/app/(dashboard)/app/settings/billing/` | [User](./end-user/platform-plans-and-quotas.md) / [Developer](./developer/platform-plans-and-quotas.md) | Review priority P0; complete. Q03. Complete refreshed pair: paid-access precedence, own-company billing, source prices and deletion guards. Operator version note corrected. Reviewed 2026-10-26T08:59:28+00:00. |
| 04 | **Ask Hakken and shared assistant knowledge** — Agent-backed conversations and authorized company lookups. Implemented; reviewed. | changed | `convex/hakkenAssistant.ts:answerInternal; assistantKnowledge.ts; src/app/(dashboard)/app/assistant/` | [User](./end-user/assistant-chat.md) / [Developer](./developer/assistant-chat.md) | Review priority P1; complete. Q04. Complete refreshed pair: server history paging, website focus, safe projections, feedback proposals and USD telemetry. Bounded deletion caveat remains. Reviewed 2026-10-26T08:59:28+00:00. |
| 05 | **Search Console** — Private search performance connection and collected results. Implemented; reviewed. | new | `convex/searchConsoleConnect.ts:beginSearchConsoleConnect; searchConsoleSync.ts; src/app/(dashboard)/app/search-console/` | [User](./end-user/search-console.md) / [Developer](./developer/search-console.md) | Review priority P1; complete. Q05. Complete new pair: connection, countries, stored/live reads, 60-day detail retention, paced fill and cleanup. Reviewed 2026-10-26T08:59:28+00:00. |
| 06 | **Bing Webmaster** — Owned-site Bing connection and performance reads. Implemented; reviewed. | new | `convex/bingWebmasterConnect.ts:beginBingConnect; bingWebmasterReads.ts; src/app/(dashboard)/app/bing-webmaster/` | [User](./end-user/bing-webmaster.md) / [Developer](./developer/bing-webmaster.md) | Review priority P1; complete. Q06. Complete new pair: verified-site selection, weekly retention, live details, unequal Google country scope and local-only token removal. Reviewed 2026-10-26T08:59:28+00:00. |
| 07 | **Website holdings and Visibility** — Company-owned and tracked relationships, shared website records and private lists. Implemented; reviewed. | new | `convex/siteAccess.ts:requireMySite; siteRecords.ts; holdLists.ts; src/app/(dashboard)/app/sites/` | [User](./end-user/websites-and-visibility.md) / [Developer](./developer/websites-and-visibility.md) | Review priority P1; complete. Q07. Complete new foundation pair: identity, relationships, pairing, private lists, controls and removal. Detailed report subareas remain Q39. Reviewed 2026-10-26T08:59:28+00:00. |
| 08 | **Data collection and cost operations** — Collector steps, progress, watches and supplier data retention. Implemented; reviewed. | new | `convex/seoCollectorRun.ts:collectStep; collectionSteps.ts; roleRuns.ts; src/app/(dashboard)/admin/websites/` | [Operator](./operator/collection-operations.md) / [Developer](./developer/collection-operations.md) | Review priority P2; complete. Q08. Complete internal developer guide and operator runbook; customer pairing is not applicable. Supplier retention remains in its existing runbook. Reviewed 2026-10-26T09:02:17+00:00. |
| 09 | **Keyword research** — Company lookups, result lists and purchased data. Implemented; reviewed. | new | `convex/keywordResearch.ts:lookUp; src/app/(dashboard)/app/keyword-research/` | [User](./end-user/keyword-research.md) / [Developer](./developer/keyword-research.md) | Review priority P1; complete. Q09. Complete new pair: private lookups/lists, fresh versus reused purchases, additional paid parts, credits and tracking. Reviewed 2026-10-26T09:05:30+00:00. |
| 10 | **Insights findings and analysis foundation** — Per-website analysis runs and reader findings. Implemented; reviewed. | new | `convex/insightsRun.ts:runInsightsTeamNow; insightsReading.ts; src/app/(dashboard)/app/insights/` | [User](./end-user/insights-findings.md) / [Developer](./developer/insights-findings.md) | Review priority P1; complete. Q10. Complete core findings pair: saved facts, publication checks, action handoff and outcome timing. Advanced subareas moved to Q48; no blanket Insights completion claim. Initial scoped review 2026-10-26T09:10:21+00:00.  Final source/reference reconciliation 2026-10-26T15:22:30+00:00. |
| 11 | **Microsoft Clarity** — Behavior data collection and retained page observations. Implemented; reviewed. | new | `convex/clarity.ts:askClarity; claritySchema.ts; clarityAgentRun.ts` | [User](./end-user/microsoft-clarity.md) / [Developer](./developer/microsoft-clarity.md) | Review priority P1; complete. Q11. Complete new pair: token setup, daily request budget, stored metrics, source cuts and retention. Complete hold-removal cleanup remains unresolved. Reviewed 2026-10-26T09:13:34+00:00. |
| 12 | **Hakken tasks** — Personal recurring work, channels and proposals. Implemented; reviewed. | new | `convex/hakkenTasks.ts:listMine; hakkenTaskSchema.ts; src/app/(dashboard)/app/hakken-tasks/` | [User](./end-user/hakken-tasks.md) / [Developer](./developer/hakken-tasks.md) | Review priority P1; complete. Q12. Complete new pair: personal monitors/reports, confirmation, timing, channels, limits and soft deletion; distinct from generic workspace tasks. Reviewed 2026-10-26T09:16:33+00:00. |
| 13 | **Telegram assistant channel** — Account linking and webhook messages. Implemented; reviewed. | new | `convex/telegram.ts:newTelegramCode; telegramHttp.ts; src/app/(dashboard)/app/profile/integrations/telegram/` | [User](./end-user/telegram.md) / [Developer](./developer/telegram.md) | Review priority P1; complete. Q13. Complete new pair: ten-minute linking, private-text transport, proposal buttons, replay receipts and unlink limits; existing operator setup guide reused. Reviewed 2026-10-26T09:19:03+00:00. |
| 14 | **Reading room content and news** — News, knowledge articles, Helpful content, recommendations and reading analytics. Implemented; reviewed. | new | `convex/news.ts:getFrontPage; knowledgeArticles.ts; src/app/(dashboard)/app/news/; src/app/(dashboard)/admin/content/` | [User](./end-user/reading-room.md) / [Developer](./developer/reading-room.md) | Review priority P1; complete. Q14. Complete core reader/publication pair. Digest/translation follow-up is now covered in Q15–Q16; full collector and per-person analytics remain Q48. Reviewed 2026-10-26T09:24:46+00:00. |
| 15 | **Weekly digest production** — Weekly issue selection, test/live recipients, translation and outbox handoff. Implemented; reviewed. | changed | `convex/weeklyDigestRun.ts:writeWeeklyDigest; outboxSchema.ts:weeklyDigestIssues` | [User](./end-user/emails.md) / [Developer](./developer/email-system.md) | Review priority P1; complete. Q15. Complete production extension to existing email pair; issue persistence precedes recipient queueing, so interrupted runs can miss recipients. Reviewed 2026-10-26T09:40:34+00:00. |
| 16 | **Content translation and languages** — English source content and translated reader fields. Implemented; reviewed. | new | `convex/contentTranslation.ts:sourceFields; utils/contentLanguages.ts; messages/en.json; messages/it.json` | N/A / [Developer](./developer/content-translation.md) | Review priority P2; complete. Q16. Complete internal coverage; fixed newest-row sweep has no full-backlog cursor. Reader coverage remains in Reading room/email guides. Reviewed 2026-10-26T09:40:34+00:00. |
| 17 | **Platform/company/site limits** — Inherited collection and display limits. Implemented; reviewed. | new | `convex/platformLimits.ts:getSiteLimits; src/app/(dashboard)/admin/settings/(system)/limits/` | [User](./end-user/platform-operations-settings.md) / [Developer](./developer/platform-operations-settings.md) | Review priority P1; complete. Q17. Complete Limits sections in existing pair; broader settings/health/rollup sections now reconciled under Q42–Q47 and Q88. Super-admin-only controls; parent inheritance and bounded override summaries verified. Reviewed 2026-10-26T09:40:34+00:00. |
| 18 | **Authentication and route protection** — Signed-in access and public exceptions. Implemented; reviewed. | existing | `convex/tenantFunctions.ts; auth.ts; src/lib/authRedirect.ts` | [User](./end-user/login-access-and-authentication.md) / [Developer](./developer/route-protection-and-authentication.md) | Review priority P0; complete. Q18. Complete pair refresh: request proxy, safe redirects, canonical identities, actual role reads/writes and telemetry. No full security audit or live acceptance claimed. Reviewed 2026-10-26T09:47:13+00:00. |
| 19 | **Company and user administration** — Workspace membership, role assignment and company lifecycle. Implemented; reviewed. | changed | `convex/schema.ts:companies; companies.ts; users.ts; src/app/(dashboard)/admin/companies/` | [User](./end-user/company-workspace-administration.md) / [Developer](./developer/company-user-management.md) | Review priority P0; complete. Q19. Complete core pair refresh: Add company page, direct team creation versus emailed invites, platform-role policy, billing blockers and separate deletion paths. Broader company-owned data cleanup is not audited. Reviewed 2026-10-26T09:47:13+00:00. |
| 20 | **Tenant boundaries and private tracking** — Builder auth, company holds and per-company tracking lists. Implemented; common boundary review complete. | changed | `convex/tenantFunctions.ts:assertTenantAccess; siteAccess.ts; holdLists.ts; websiteTenancyGuard.test.ts` | — / [Developer](./developer/tenancy-enforcement.md) | Review priority P0; complete. Q20. Complete developer guide for common boundaries and private-list read paths; no customer-only guide applies. Every backend handler has not been audited; full enforcement assurance remains outside this documentation claim. Reviewed 2026-10-26T09:47:13+00:00. |
| 21 | **Agents configuration and runtime** — Core configuration, roles, approvals, limits and durable-run boundaries. Implemented; core reviewed. | changed | `convex/agents.ts:buildAgentReadiness; agentRuntime.ts; agentRunApprovals.ts` | [User](./end-user/agents.md) / [Developer](./developer/agents.md) | Review priority P1; complete. Q21. Core pair refreshed; activation is advisory, provider adapters and super-admin approval decisions corrected. Detailed catalog, learning, evaluation and version coverage completed under Q49–Q51; specialist links retain distinct scope. Reviewed 2026-10-26T09:55:35+00:00. |
| 22 | **Workflows and schedules** — Graph entry points, triggers, retry and approval scheduling. Implemented; core reviewed. | changed | `convex/workflows.ts:triggerManualRun; workflowRuntime.ts; crons.ts` | [User](./end-user/workflow-automation.md) / [Developer](./developer/workflow-automation.md) | Review priority P1; complete. Q22. Core pair refreshed: read/write roles, Outbox, graph versus simulated runs, expiry and rejection. Detailed designer/node internals reviewed under Q52; both established guides reconciled. Reviewed 2026-10-26T09:55:35+00:00. |
| 23 | **Knowledge uploads and retrieval** — Authenticated upload gateway, bounded ingestion and retrieval. Implemented; reviewed. | changed | `convex/knowledge.ts:generateUploadUrl; knowledgeRetrieval.ts; uploadReservations.ts; uploadSchema.ts` | [User](./end-user/knowledge-management.md) / [Developer](./developer/knowledge-management.md) | Review priority P1; complete. Q23. Complete source-management pair refresh: ownership, reserved ingress quotas, import caps, queues, derived-page retention and ready-only thread GC. Detailed Wiki review remains Q24. Reviewed 2026-10-26T09:55:35+00:00. |
| 24 | **Company Wiki** — Core pages, source review and whole-page answer selection. Implemented; core reviewed. | changed | `convex/wikiActions.ts:selectWikiContextForQuery; wikiPages.ts; wikiReviews.ts` | [User](./end-user/company-wiki.md) / [Developer](./developer/company-wiki.md) | Review priority P1; complete. Q24. Core pair refreshed; Reviewer-off bypass, bounded text, three attempts, page deletion and map/index limits verified. Detailed staff/exam/feedback remains Q53–Q54. Reviewed 2026-10-26T10:07:20+00:00. |
| 25 | **Models, providers, rules and decisions** — Core configured jobs, provider routing and cost estimates. Implemented; core reviewed. | changed | `convex/aiModels.ts:getModels; aiRules.ts:getRules; selfImprovementConfig.ts` | [User](./end-user/ai-models-providers-and-costs.md) / [Developer](./developer/ai-models-providers-and-costs.md) | Review priority P1; complete. Q25. Core model/cost pair refreshed; current slots, embedding fallback, cache pricing and USD corrected. Rules, Decisions and provider operations remain Q55–Q57. Reviewed 2026-10-26T10:07:20+00:00. |
| 26 | **Connectors and tool servers** — MCP discovery/import, generic connector configuration, residual OAuth and HTTP execution. Implemented; reviewed. | changed | `convex/connectorOAuth.ts; mcpServers.ts:listServers; mcpToolPolicy.ts` | [MCP user](./end-user/tool-servers.md) / [MCP developer](./developer/tool-servers.md); [Connectors user](./end-user/ai-tools-and-connectors.md) / [Connectors developer](./developer/ai-tools-and-connectors.md) | Review priority P0; complete. Q26. Both Tool Servers and AI Tools/Connectors pairs refreshed. Configuration validation is local; Gmail retired; per-handler member permissions and bounded cleanup verified. Reviewed 2026-10-26T10:07:20+00:00. |
| 27 | **Notifications and generic task routing** — Personal bell reads and generic workspace tasks. Implemented; reviewed. | changed | `convex/notifications.ts:listMine,markRead; aiToolNotificationTools.ts; src/app/(dashboard)/app/tasks/` | [User](./end-user/tasks-and-notifications.md) / [Developer](./developer/tasks-and-notifications.md) | Review priority P1; complete. Q27. Pair refreshed: per-user read ownership, module-based task writes, loaded-page grouping, capped mark-all and no universal erasure promise. Generic tasks differ from recurring Hakken tasks. Reviewed 2026-10-26T10:19:07+00:00. |
| 28 | **Spoken channels and reception** — Browser voice, phone admission and public kiosk. Implemented; reviewed. | changed | `convex/aiVoiceSession.ts; voiceRelay.ts; telephony.ts; telephonyActions.ts; kiosk.ts; kioskActions.ts; services/voice-relay/` | [Voice user](./end-user/spoken-channels.md) / [Voice developer](./developer/spoken-channels.md); [Reception user](./end-user/receptionist-screen.md) / [Reception developer](./developer/receptionist-screen.md) | Review priority P1; complete. Q28. Both pairs refreshed. Admission counts, transport differences, quota reservation, transcript caps and incomplete CRM lookup verified. Reviewed 2026-10-26T10:22:32+00:00. |
| 29 | **Gmail mailbox retirement and residual OAuth** — Inherited mailbox no longer offered; automatic polling removed. Possibly deprecated / not found as an active mailbox. | possibly removed | `convex/crons.ts` explicitly disables the Gmail watcher; `docs/end-user/gmail-mailbox.md` and `docs/developer/gmail-mailbox.md` already record 2026-10-09 removal; generic `connectorOAuth.ts` remains. | [User retirement note](./end-user/gmail-mailbox.md) / [Developer retirement note](./developer/gmail-mailbox.md) | Review priority P2; complete. Q29. Keep concise retirement notes. Retirement notes checked unchanged; residual generic OAuth reviewed in Q26; do not revive polling or delete guides. Corrected stale mailbox wording in updated email guides and indexes. Reviewed 2026-10-26T10:29:38+00:00. |
| 30 | **Embedded widgets** — Public embed, browser credential, domain policy and customer handoff. Implemented; reviewed. | changed | `convex/widgets.ts:createWidgetThread,generateWidgetUploadUrl; chatService.ts:canAccessThread; src/proxy.ts; public/embed.js` | [User](./end-user/embedded-widgets.md) / [Developer](./developer/embedded-widgets.md); [Handoff](./end-user/widget-handoff-and-troubleshooting.md) | Review priority P0; complete. Q30. Pair and handoff refreshed: signed pass versus frame policy, ten upload issuances, one MiB images, inactive-session refusal, local reset versus retained records. Reviewed 2026-10-26T10:29:38+00:00. |
| 31 | **Governance, audit and personal data** — Governance views, bounded exports and manifest-based erasure. Implemented; reviewed. | changed | `convex/governanceDashboard.ts; governanceRegister.ts; evidencePack.ts; auditLogs.ts; personalData.ts; personalDataService.ts` | [User](./end-user/governance-and-trust.md) / [Developer](./developer/governance-and-trust.md) | Review priority P0; complete. Q31. Pair refreshed; caller-company check is absent from subject-access action. Rollup/export bounds, audit role differences and durable erasure limits documented. Reviewed 2026-10-26T10:31:26+00:00. |
| 32 | **Retention, purges and storage measurement** — Eighteen pipelines, scheduled deletion and internal measurement. Implemented; reviewed. | changed | `convex/purges.ts:executePurgeRecursive,reapStalePurges; purgeScheduleService.ts; storageMeasure.ts` | [User](./end-user/operational-diagnostics-and-retention.md) / [Developer](./developer/data-retention-and-purges.md) | Review priority P0; complete. Q32. Retention pair refreshed; broader diagnostics completed under Q44/Q47/Q85. Legacy audit scheduler not found as active; manual review before deleting residual helpers. Reviewed 2026-10-26T10:34:20+00:00. |
| 33 | **Migration and maintenance tooling** — Typed maintenance registry, generic migration runner and package command map. Implemented; orchestration reviewed. | changed | `convex/maintenanceScripts.ts:startPendingDataMigrations; dataMigrations.ts:run,processBatch; scripts/local-test-auth.mjs; package.json` | N/A / [Maintenance developer](./developer/maintenance-scripts.md); [Command reference](./developer/operational-scripts-reference.md) | Review priority P2; complete. Q33. Internal-only: no artificial customer pair. Guide and package reference refreshed. Named migration business semantics remain with owning feature guides; deployment, generator and packaging procedures reviewed under Q36/Q84/Q88. Reviewed 2026-10-26T10:37:38+00:00. |
| 34 | **Public API and webhook surfaces** — Tenant keys, run admission, direct workflow webhook and unconnected outbound delivery engine. Implemented; reviewed. | changed | `convex/publicApi.ts; apiKeys.ts:authenticatePublicRequest; workflows.ts:handleWebhook; webhookDeliveryActions.ts; http.ts` | [User](./end-user/public-api-and-webhooks.md) / [Developer](./developer/public-api-and-webhooks.md) | Review priority P0; complete. Q34. Pair refreshed: body caps, auth-before-business logging, no trigger dedupe, agent-only status, removed outbound monitor and residual Apify route distinguished. Other supplier routes owned by their feature guides. Reviewed 2026-10-26T10:39:47+00:00. |
| 35 | **Screen kit, hooks and theme** — Shared UI contracts, drawing and outline checks. Implemented; reviewed. | changed | `src/ui/components/screens/; src/hooks/useServerPagedTable.ts,useAdminAction.ts; scripts/drawing-kit.mjs; src/test/lookOutline.ts` | N/A / [Screen kit](./developer/screen-kit.md); [Drawing guide](./developer/drawing-guide.md) | Review priority P2; complete. Q35. Core contracts and remaining documented chart/schema/rule/drawing/look-test sections reviewed. Not an every-consuming-screen visual audit. Reviewed 2026-10-26T10:48:18+00:00. |
| 36 | **Build, deployment and dependency verification** — Workflow triggers, gates, images and health. Implemented; reviewed. | changed | `.github/workflows/ci.yml,deploy.yml,security-audit.yml; Dockerfile; scripts/validate-setup.mjs; src/app/api/health/route.ts` | N/A / [Developer](./developer/deployment.md) | Review priority P2; complete. Q36. Guide refreshed: Socket dev-push scan, real-auth/mock flags, network-only readiness, CI reuse, backend-before-image failure and retired Gmail. No live release or audit. Reviewed 2026-10-26T10:49:59+00:00. |
| 37 | **Public website** — One-screen home page in the app's dark look, with the rain symbol. Rebuilt 2026-10-29. | changed | `src/app/(public)/page.tsx; _components/home/HomeScreen.tsx,RainField.tsx; home.css` | [User](./end-user/public-website.md) / [Developer](./developer/public-website.md) | Review priority P1; complete. Q37. Pair refreshed. Removed panels, absent routes and public preparedness/framework copy versus PRODUCT.md discovery intent recorded. Auxiliary experiences remain Q40–Q41. Reviewed 2026-10-26T10:52:01+00:00. |
| 38 | **Credits, pricing and Usage** — Batch accounting, statement, forecasts and internal price audit. Implemented; reviewed. | new | `convex/creditLedger.ts; creditUsage.ts; creditPricesAdmin.ts; creditKinds.ts; creditHooks.ts; src/app/(dashboard)/app/usage/` | [User](./end-user/credits-and-usage.md) / [Developer](./developer/credit-ledger-and-usage.md) | Review priority P1; complete. Q38. New pair complete. Negative balance records owed without refusal; topup purchase not found; zero saved price still minimum-one positive charge; no live charging proof. Reviewed 2026-10-26T10:55:35+00:00. |
| 39 | **Organic keyword and page reports** — Held rankings, movement/position bands, pages and record evidence. Implemented; reviewed. | new | `convex/siteKeywords.ts:listKeywords,listPages; siteRecords.ts:keywordRecord,pageRecord; siteBands.ts; siteKeywordCopy.ts` | [User](./end-user/organic-keywords-and-pages.md) / [Developer](./developer/organic-keywords-and-pages.md) | Review priority P1; complete. Q39. New pair complete. Older versus lost, held-list totals, comparison conventions, private citation filtering and bounded detail/filing reviewed. Other Visibility capabilities remain Q58–Q70. Reviewed 2026-10-26T11:00:56+00:00. |
| 40 | **Ronin’s Run arcade and sandbox** — Implemented; scoped review complete. | new | `src/app/(dashboard)/app/arcade/ronins-run/; ronins-run-3d/; agentic-testing/; convex/arcade.ts; orchestrator.ts` | [User](./end-user/auxiliary-app-experiences.md) / [Developer](./developer/auxiliary-app-experiences.md) | Review priority P1; complete. Q40. Existing pair refreshed; persisted workspace campaign versus local 3D results, receipt/idempotency bounds, loaded-row search and real sandbox effects documented. Reviewed 2026-10-26T14:44:07+00:00. |
| 41 | **Removed-copy vertical references** — Possibly deprecated / not found in current implementation. | possibly removed | `src/app route inventory; SidebarNavTrees.tsx; convex filenames; utils/companyModules.ts; utils/coreModules.ts; schema.ts:swarmLogs` | [User](./end-user/auxiliary-app-experiences.md) / [Developer](./developer/auxiliary-app-experiences.md) | Review priority P2; complete. Q41. Checked current page routes, optional-module registry, backend filenames, navigation and retained schema/purge/allowlist references for Sales, Properties, movement/Posture and Swarm. No current routed capability found; residual identifiers remain. Manual review required before deleting records or guides. Reviewed 2026-10-26T15:20:24+00:00. |
| 42 | **Photo actions** — Implemented; scoped review complete. | existing | `convex/photoActionService.ts:extractPhotoActionProposal; tasks.ts:confirmPhotoAction; widgets.ts; agentRuntime.ts` | [User](./end-user/photo-actions.md) / [Developer](./developer/photo-actions.md) | Review priority P1; complete. Q42. Pair refreshed; exact parser limits, closed/unterminated blocks, repeat taps, optional widget owner and issuance quota corrected. Reviewed 2026-10-26T14:32:14+00:00. |
| 43 | **System settings and branding** — Implemented; scoped review complete. | changed | `convex/settings.ts:get/getForAdmin/update; settingsService.ts; src/context/SystemSettingsContext.tsx; settingsTabs.ts` | [User](./end-user/platform-operations-settings.md) / [Developer](./developer/system-settings-and-branding.md) | Review priority P1; complete. Q43. Existing user guide extended and branding developer guide refreshed; public/privileged split, current routes, retired fields, theme and storage limits corrected. Reviewed 2026-10-26T14:33:53+00:00. |
| 44 | **System health and connection diagnostics** — Implemented; scoped review complete. | existing | `convex/systemHealth.ts:getSystemHealthForAdmin; platformAlerts.ts; platformAlertRecipients.ts; src/instrumentation.ts` | [User](./end-user/system-health-and-maintenance.md) / [Developer](./developer/system-health-and-platform-alerts.md) | Review priority P1; complete. Q44. Pair refreshed; scoped/bounded reports, USD model budgets, current daily Outbox alert path, fallback recipients and optional Sentry boundaries corrected. Reviewed 2026-10-26T14:35:25+00:00. |
| 45 | **Company AI readiness and checks** — Implemented; scoped review complete. | changed | `convex/companyReadiness.ts; companyEvals.ts; companyEvalRuns.ts; companyEvalRunActions.ts; companySkills.ts; companyMemories.ts` | [User](./end-user/company-ai-readiness-and-checks.md) / [Developer](./developer/company-ai-readiness-and-checks.md) | Review priority P1; complete. Q45. Pair refreshed; eight area states, bounded evidence, actual eval path/costs, explicit drift resolution and central skill/memory policies verified. Reviewed 2026-10-26T14:37:23+00:00. |
| 46 | **Email branding and sender resolution** — Implemented; scoped review complete. | changed | `convex/emailBrandingService.ts:resolveEnvFromAddress/outboxFromAddress; auth.ts; invites.ts; resendEmailService.ts` | [User](./end-user/emails.md) / [Developer](./developer/email-branding.md) | Review priority P1; complete. Q46. Existing email pair extended and branding developer guide refreshed; precedence differences, invalid sentinel, queue versus invite simulation and transport limits verified. Reviewed 2026-10-26T14:38:35+00:00. |
| 47 | **Inventory and operational analytics rollups** — Implemented; scoped review complete. | changed | `convex/inventoryRollups.ts; utils/inventoryRollupService.ts; analyticsSnapshots.ts; analyticsSnapshotAggregation.ts; analyticsService.ts` | Not applicable: internal process / [Developer](./developer/analytics-rollups.md) | Review priority P2; complete. Q47. Internal guide refreshed; inventory refusal, plan-value versus revenue, paged snapshot action, USD, derived providers and coverage-aware reads corrected. Reviewed 2026-10-26T14:40:17+00:00. |
| 48 | **Insights summaries, reports and exports** — Implemented; scoped review complete. | new | `convex/insightsReads.ts; insightsTeam.ts:reportsDue/saveReport; insightsRunAfter.ts; src/app/(dashboard)/app/insights/_components/ReportDownload.tsx` | [User](./end-user/insights-reports-and-exports.md) / [Developer](./developer/insights-reports-and-exports.md) | Review priority P1; complete. Q48. Company read status, same-period replacement, due/trailing dates, bounded retention and browser-only monthly/board PDF contracts reviewed. Initial scoped review 2026-10-26T12:02:38+00:00.  Final source/reference reconciliation 2026-10-26T15:22:30+00:00. |
| 49 | **Agent skill catalog and binding lifecycle** — Implemented; scoped review complete. | changed | `convex/agentSkills.ts; agentSkillsService.ts; utils/skillContracts.ts; admin/agents/new/page.tsx` | [User](./end-user/agent-setup-and-configuration.md) / [Developer](./developer/agent-configuration-and-catalogs.md) | Review priority P1; complete. Q49. Pair refreshed; current Add/upload UI, runtime text versus snapshot evidence, rollout, limits and destructive behavior corrected. Reviewed 2026-10-26T14:18:05+00:00. |
| 50 | **Agent learning and memory review** — Implemented; scoped review complete. | changed | `convex/agentMemoryCandidates.ts; agentImprovementSuggestions.ts; agentRunReflections.ts; agentRunReflectionService.ts` | [User](./end-user/agent-operations-and-review.md) / [Developer](./developer/agent-runtime-operations.md) | Review priority P1; complete. Q50. Shared operations pair refreshed: automatic versus requested memory application, backpressure, rejected wording, identifying evidence and actual suggestion effects verified. Reviewed 2026-10-26T14:20:25+00:00. |
| 51 | **Agent evals, versions and release evidence** — Implemented; scoped review complete. | changed | `convex/agentEvalFixtures.ts; agentEvalGradingActions.ts; agentVersions.ts; agentVersioningService.ts` | [User](./end-user/agent-operations-and-review.md) / [Developer](./developer/agent-runtime-operations.md) | Review priority P1; complete. Q51. Shared operations pair refreshed once for Q50/Q51; advisory activation, contract/model/rehearsal distinction, real runtime effects, bounded snapshots and fixture-time currency corrected. Reviewed 2026-10-26T14:20:25+00:00. |
| 52 | **Workflow designer and detailed node contracts** — Implemented; scoped review complete. | changed | `src/ui/components/workflows/ConfigDrawer.tsx; convex/workflowRuntime.ts; workflowEngine.ts; workflowNodeConfig.ts` | [User](./end-user/workflow-automation.md) / [Developer](./developer/workflow-automation.md) | Review priority P1; complete. Q52. Existing user guide extended and runtime internals refreshed; save/run separation, mappings, fan-out and repeated-email idempotency collision documented. Reviewed 2026-10-26T14:22:10+00:00. |
| 53 | **Wiki staff maintenance and questions** — Implemented; scoped review complete. | changed | `convex/wikiTendingActions.ts; wikiTending.ts; wikiFreshnessActions.ts; wikiContradictionActions.ts; wikiStaffRunActions.ts` | [User](./end-user/company-wiki.md) / [Developer](./developer/company-wiki.md) | Review priority P1; complete. Q53. Existing pair extended; bounded scope discovery, progress linking, source/goal checks, advisory timestamps and staff dispatch verified. Reviewed 2026-10-26T14:25:23+00:00. |
| 54 | **Wiki exams, feedback, diary and reports** — Implemented; scoped review complete. | changed | `convex/wikiExamActions.ts; wikiExamGrowthActions.ts; wikiFeedback.ts; wikiDiary.ts; wikiReport.ts` | [User](./end-user/company-wiki.md) / [Developer](./developer/company-wiki.md) | Review priority P1; complete. Q54. Existing pair extended; platform gap routing, draft-only growth, model comparison, filtered audit paging and bounded notification counts verified. Reviewed 2026-10-26T14:25:23+00:00. |
| 55 | **AI rules and prompt policy** — Implemented; scoped review complete. | changed | `convex/aiRules.ts; aiPromptAssembly.ts; aiSafetyPolicy.ts; system.ts; companies.ts:updateCompanyPrompt` | [User](./end-user/ai-rules-and-prompts.md) / [Developer](./developer/ai-rules-and-prompts.md) | Review priority P1; complete. Q55. Pair refreshed; current assembly, textual priorities, scope bounds, prompt authority and list/internal-agent read discrepancies documented. Reviewed 2026-10-26T14:26:52+00:00. |
| 56 | **Decisions configuration and evidence** — Implemented; scoped review complete. | changed | `convex/decisions.ts; decisionActions.ts; decisionService.ts; decisionRuns.ts; decisionLedger.ts` | [User](./end-user/ai-models-providers-and-costs.md) / [Developer](./developer/ai-models-providers-and-costs.md) | Review priority P1; complete. Q56. Existing model pair extended; modes, stakes, confidence bands, scoped inheritance, caller handoff, fallbacks and single-call accounting verified. Reviewed 2026-10-26T14:30:19+00:00. |
| 57 | **Provider catalog operations** — Implemented; scoped review complete. | changed | `convex/aiModelsActions.ts; aiModels.ts:internalBatchUpsert; aiProviderRegistry.ts; provider services` | [User](./end-user/ai-models-providers-and-costs.md) / [Developer](./developer/ai-models-providers-and-costs.md) | Review priority P1; complete. Q57. Existing model pair and extension guide refreshed; live listing, sync enablement, disabled new models, probe semantics, metadata and credential names verified without external calls. Reviewed 2026-10-26T14:30:19+00:00. |
| 58 | **Tracked Google searches and fan-out queries** — Private list choices, recurring opt-in, first checks and SERP summaries. Implemented; reviewed. | new | `convex/siteGoogle.ts; siteGoogleSerp.ts; siteFanOutTracking.ts; promptFanOut.ts; websiteCanonical.ts; holdLists.ts; seoKeywordChecks.ts` | [User](./end-user/google-search-tracking.md) / [Developer](./developer/google-search-tracking.md) | Review priority P1; complete. Q58. New pair complete: tenant-owned choices versus shared facts, owned-site customer opt-in, super-admin manual edits, no automatic recurring fan-out, retained first checks and bounded SERP/history. Reviewed 2026-10-26T11:05:39+00:00. |
| 59 | **Private AI questions and saved answers** — Implemented; reviewed. | new | `convex/websiteCanonical.ts; siteAnswers.ts; siteAnswerShown.ts; holdLists.ts` | [User](./end-user/ai-questions-and-answers.md) / [Developer](./developer/ai-questions-and-answers.md) | Review priority P1; complete. Q59. Question edit/pause/removal, membership guards, app/model/page distinction, bounded text/index/search and old-summary retention reviewed. Reviewed 2026-10-26T11:13:30+00:00. |
| 60 | **AI visibility summaries and source reading** — Implemented; reviewed. | new | `convex/siteAi.ts; siteListAi.ts; siteAiApps.ts; siteAiPageDetail.ts; aiDemand.ts` | [User](./end-user/ai-visibility-reports.md) / [Developer](./developer/ai-visibility-reports.md) | Review priority P1; complete. Q60. Two-hundred-answer mention windows, group-mention denominator, bounded citations, ChatGPT-only app panels and demand estimates reviewed. Reviewed 2026-10-26T11:16:50+00:00. |
| 61 | **Backlink reports and details** — Implemented; reviewed. | new | `convex/siteLinks.ts; siteLinkLists.ts; siteLinkRecords.ts; siteLinkFiling.ts; siteLinkWeeks.ts` | [User](./end-user/backlink-reports.md) / [Developer](./developer/backlink-reports.md) | Review priority P1; complete. Q61. Representative versus every-link passes, held/reported totals, group/detail bounds, standing-list replacement and exports reviewed. Reviewed 2026-10-26T11:20:21+00:00. |
| 62 | **Technical site audit and problem pages** — Implemented; reviewed. | new | `convex/siteCrawl.ts; siteCrawlDetail.ts; dataForSeoCrawlOperations.ts; seoCrawlRefund.ts` | [User](./end-user/technical-site-audit.md) / [Developer](./developer/technical-site-audit.md) | Review priority P1; complete. Q62. Small-crawl heuristic, passive tenant reads, bounded fetch/detail examples, chunked retry/cleanup and recorded cost correction reviewed. Reviewed 2026-10-26T11:27:06+00:00. |
| 63 | **Local business profiles and listings** — Implemented; reviewed. | new | `convex/siteLocalProfile.ts; siteLocalListings.ts; localReads.ts; localFiling.ts; localListings.ts` | [User](./end-user/local-business-profiles.md) / [Developer](./developer/local-business-profiles.md) | Review priority P1; complete. Q63. Private listing links, Find purchase/reuse, own/rival limits, heuristic profile checks, weekly observations and bounded activity reviewed. Reviewed 2026-10-26T11:30:14+00:00. |
| 64 | **Local market and Maps visibility** — Implemented; reviewed. | new | `convex/siteLocalMaps.ts; siteLocalMarket.ts; siteBusinessDetail.ts; localPlanning.ts; localFiling.ts` | [User](./end-user/local-maps-and-market.md) / [Developer](./developer/local-maps-and-market.md) | Review priority P1; complete. Q64. Office-point tracking, null/zero distinctions, ranking denominators, 250-business market cap and first-office business detail reviewed. Reviewed 2026-10-26T11:33:24+00:00. |
| 65 | **Review intelligence and reply drafts** — Implemented; reviewed. | new | `convex/siteReviews.ts; localReviews.ts; reviewPlanning.ts; reviewJudging.ts; reviewReplies.ts; reviewReplyActions.ts` | [User](./end-user/review-intelligence.md) / [Developer](./developer/review-intelligence.md) | Review priority P1; complete. Q65. Retained versus public counts, topic configuration, shared words/classification, private copied drafts, bounded processing and cost indicator reviewed. Reviewed 2026-10-26T11:39:07+00:00. |
| 66 | **Paid search reports** — Implemented; reviewed. | new | `convex/sitePaid.ts; dataForSeoParsers.ts; seoCollectionParse.ts; siteExports.ts; src/app/(dashboard)/app/sites/[siteId]/paid/` | [User](./end-user/paid-search-reports.md) / [Developer](./developer/paid-search-reports.md) | Review priority P1; complete. Q66. Paid/organic separation, estimates versus spend, retained/reported totals, empty observation, replacement guards and unfiltered exports reviewed. Reviewed 2026-10-26T11:42:27+00:00. |
| 67 | **Web mention monitoring and listing opportunities** — Implemented; reviewed. | new | `convex/siteWebMentions.ts; webMentions.ts; mentionSchema.ts; dataForSeoMentionOperations.ts` | [User](./end-user/web-mention-monitoring.md) / [Developer](./developer/web-mention-monitoring.md) | Review priority P1; complete. Q67. English/UK scope, actual published/fetch dates, host-level link evidence, skipped URL refresh, filing-triggered retention and gap/Radar joins reviewed. Reviewed 2026-10-26T11:45:32+00:00. |
| 68 | **Brand Radar and AI Overview gaps** — Implemented; reviewed. | new | `convex/siteBrandRadar.ts; brandRadar.ts; siteRadarDetails.ts; siteAiOverviewGaps.ts; radarSchema.ts` | [User](./end-user/brand-radar.md) / [Developer](./developer/brand-radar.md) | Review priority P1; complete. Q68. Supplier-total/sample distinction, offsets/order, country/US ChatGPT gates, 36-month writer retention and separate tracked-search gaps reviewed. Reviewed 2026-10-26T11:49:06+00:00. |
| 69 | **Competitor discovery and content gaps** — Implemented; reviewed. | new | `convex/siteCompetitors.ts; siteContentGap.ts; siteRivalMoves.ts; siteRivalCited.ts; seoDiscoveredCompetitors.ts` | [User](./end-user/competitor-discovery-and-gaps.md) / [Developer](./developer/competitor-discovery-and-gaps.md) | Review priority P1; complete. Q69. Private group, bounded shared-search comparison, read-only suggestions/admin decisions, gap-copy preparation/caps and move-period distinctions reviewed. Reviewed 2026-10-26T11:52:18+00:00. |
| 70 | **Website assets and suggested drafts** — Implemented; reviewed. | new | `convex/siteAssets.ts; assetSummaries.ts; insightsDrafts.ts; insightsRunAfter.ts; utils/insightDrafts.ts` | [User](./end-user/website-assets-and-drafts.md) / [Developer](./developer/website-assets-and-drafts.md) | Review priority P1; complete. Q70. Saved heuristic summaries, bounded draft evidence, per-batch limits/reuse, copy-versus-approval and tenant decision/retention contracts reviewed. Reviewed 2026-10-26T11:55:32+00:00. |
| 71 | **Platform tour and cross-cutting architecture** — Implemented; scoped documentation review complete. | changed | `src/ui/components/layout/SidebarNavTrees.tsx; src/app/(dashboard)/admin/layout.tsx; src/app/(dashboard)/app/; convex/tenantFunctions.ts` | Tour [User](./end-user/platform-overview.md) / [Architecture](./developer/architecture.md); Administration [User](./end-user/administration.md) / [Developer](./developer/administration.md); AI administration [User](./end-user/ai-administration.md) / [Developer](./developer/ai-administration.md); [Frontend](./developer/frontend.md), [Backend](./developer/backend.md) | Review priority P1; complete. Q71. Tour and overview guides reconciled with current route families, staff-shell access and specialist coverage. All routed families checked against inventory; this is not a visual/live audit of every screen. Reviewed 2026-10-26T15:20:24+00:00. |
| 72 | **Insights strategy, services and page planning** — Implemented; scoped review complete. | new | `convex/insightsReads.ts; insightsReading.ts:strategyInternal/planInternal; utils/insightStrategy.ts; utils/insightPlan.ts` | [User](./end-user/insights-strategy-and-planning.md) / [Developer](./developer/insights-strategy-and-planning.md) | Review priority P1; complete. Q72. First-owned-site fallback, mixed source windows, carried specialist calls, estimate/rule thresholds and latest-plan bounds reviewed; wider page decisions remain Q75. Reviewed 2026-10-26T12:05:32+00:00. |
| 73 | **Insights period, measurement and enquiries** — Implemented; scoped review complete. | new | `convex/insightsPeriod.ts; insightsPeriodData.ts; insightsReading.ts:measurementInternal; utils/insightPeriods.ts; utils/insightMeasurement.ts; utils/insightWhy.ts` | [User](./end-user/insights-measurement-and-enquiries.md) / [Developer](./developer/insights-measurement-and-enquiries.md) | Review priority P1; complete. Q73. Whole-month eligibility, current classifications, latest check/source windows, heuristic why tests and three-month query allocation reviewed. Initial scoped review 2026-10-26T12:09:25+00:00.  Final source/reference reconciliation 2026-10-26T15:22:30+00:00. |
| 74 | **Page reviews, funnel and experiments** — Implemented; scoped review complete. | new | `convex/insightsConversion.ts; insightsRunAfter.ts:reviewPages; moneyPageChecks.ts; utils/insightConversion.ts` | [User](./end-user/page-reviews-and-experiments.md) / [Developer](./developer/page-reviews-and-experiments.md) | Review priority P1; complete. Q74. Bounded reviews, people/visits windows, rule fallback, task handoff, tenant mutation policy and missing-data baseline/result fallback reviewed. Reviewed 2026-10-26T12:12:21+00:00. |
| 75 | **Competing-page groups and search ownership** — Implemented; scoped review complete. | new | `convex/insightCompeting.ts; insightCompetingJudge.ts; utils/insightCompeting.ts; utils/insightCompetingAgent.ts` | [User](./end-user/competing-pages-and-search-ownership.md) / [Developer](./developer/competing-pages-and-search-ownership.md) | Review priority P1; complete. Q75. Query/page grouping, observed owners, advisory actions, estimates, model/specialist carry-forward and save-triggered supplier work reviewed; whole-site decisions Q80. Initial scoped review 2026-10-26T12:16:11+00:00.  Final source/reference reconciliation 2026-10-26T15:22:30+00:00. |
| 76 | **Insights leaderboards** — Implemented; scoped review complete. | new | `convex/insightsReads.ts:insightsLeagues; insightsReading.ts:marketFacts; utils/insightLeagues.ts; src/app/(dashboard)/app/insights/leaderboards/` | [User](./end-user/insights-leaderboards.md) / [Developer](./developer/insights-leaderboards.md) | Review priority P1; complete. Q76. Watched-group scope, nine source measures, sequential ties, prior-data requirements, shares and linked-profile source caveat reviewed. Reviewed 2026-10-26T12:22:39+00:00. |
| 77 | **Reading room readership analytics** — Implemented; scoped review complete. | new | `convex/readingAnalytics.ts; reading.ts; readingSchema.ts; src/app/(dashboard)/admin/content/analytics/` | Not applicable: internal process / [Developer](./developer/reading-room-readership-analytics.md) | Review priority P2; complete. Q77. Internal developer/operator coverage complete; 900/500 population bounds, 6000-row chart budget, UTC counting, identity transitions, privileged identifying projections and retention documented. Reviewed 2026-10-26T14:12:50+00:00. |
| 78 | **News collector and editorial recovery** — Implemented; scoped review complete. | new | `convex/newsCollector.ts; newsCollectorRun.ts; newsAgentRunActions.ts; newsKnowledge.ts` | Not applicable: internal process / [Developer](./developer/news-collector-and-editorial-recovery.md) | Review priority P2; complete. Q78. Internal developer/operator coverage complete. No same-run continuation, X cursor replay limits, paid fallbacks and retention ownership documented as implemented. Reviewed 2026-10-26T14:15:04+00:00. |
| 79 | **Insights AI-search growth and buyer-question panels** — Implemented; scoped review complete. | new | `convex/insightAiSearch.ts; insightsPanel.ts; utils/insightPanel.ts; insightsRunAfter.ts:buildPanel` | [User](./end-user/ai-search-growth-and-buyer-questions.md) / [Developer](./developer/ai-search-growth-and-buyer-questions.md) | Review priority P1; complete. Q79. Assistant attribution windows, answer/citation bounds, Radar country-key discrepancy and automatic private-prompt synchronization reviewed. Reviewed 2026-10-26T12:25:52+00:00. |
| 80 | **Whole-site page decisions and create candidates** — Implemented; scoped review complete. | new | `convex/insightDecisions.ts; utils/insightDecisions.ts; utils/insightPageAgent.ts; src/app/(dashboard)/app/insights/page-plan/` | [User](./end-user/page-decisions-and-create-candidates.md) / [Developer](./developer/page-decisions-and-create-candidates.md) | Review priority P1; complete. Q80. Evidence joins, broken-before-unused priority, model guards/carry signatures, 2000-decision retention and twenty create candidates reviewed. Reviewed 2026-10-26T12:18:49+00:00. |
| 81 | **Track record, changes and cross-company learnings** — Implemented; scoped review complete. | new | `convex/insightsReads.ts:insightsTrackRecord; insightsTeam.ts:scoreFindings/saveChanges; insightFindingChecks.ts; utils/insightTrack.ts` | [User](./end-user/insights-track-record.md) / [Developer](./developer/insights-track-record.md) | Review priority P1; complete. Q81. Pair complete: bounded scopes, replay/tally limits, clock resets, inferred changes, campaign non-additivity and five-company aggregates documented. Initial scoped review 2026-10-26T14:10:32+00:00.  Final source/reference reconciliation 2026-10-26T15:22:30+00:00. |
| 82 | **Local development and verification** — Implemented; scoped review complete. | changed | `package.json; .nvmrc; .node-version; scripts/verify-local-environment.mjs; validate-setup.mjs; convex/uploadReservations.ts` | Not applicable: internal process / [Developer](./developer/getting-started.md) | Review priority P2; complete. Q82. Getting-started and upload policy refreshed; Node baseline, complete-gate reference, configuration versus acceptance and controlled reservations reviewed. Reviewed 2026-10-26T14:51:32+00:00. |
| 83 | **Route API schema and environment references** — Implemented; scoped review complete. | changed | `src/app page/route inventory; convex exported wrappers/table declarations; direct process.env names; docs/developer references` | Internal reference: [Routes](./developer/route-reference.md), [API/schema](./developer/convex-api-and-schema-reference.md), [Environment](./developer/convex-environment-variables.md) | Review priority P2; complete. Q83. Route/API/schema/env references refreshed from current static source; technical evidence matrix replaces obsolete duplicate completion queue. Counts explicitly scoped. Initial scoped review 2026-10-26T14:55:43+00:00.  Final source/reference reconciliation 2026-10-26T15:22:30+00:00. |
| 84 | **Product extension generator recipes and clone setup** — Implemented; scoped review complete. | changed | `scripts/generate-entity.mjs; entity-generator/model,plan,backend.mjs; init-product.mjs; product-recipes/catalog,plan.mjs; template.verticals.json` | Not applicable: internal process / [Developer](./developer/feature-generator.md) | Review priority P2; complete. Q84. Generator/recipes/extension/starter setup guides refreshed; preview/apply, stale-file refusal, rollback, staff access, missing verticals and advisory checks reconciled. Historical plans unchanged. Reviewed 2026-10-26T15:05:19+00:00. |
| 85 | **Run observatory auth diagnostics audit and Health navigation** — Implemented; scoped review complete. | changed | `convex/agentObservabilityService.ts; authEvents.ts; auditLogs.ts; auditLogService.ts; admin/health; governance/audit-trail` | [User](./end-user/health.md) / [Run observatory](./developer/run-observatory.md); [Auth diagnostics](./developer/auth-diagnostics.md), [Audit service](./developer/audit-log-service.md) | Review priority P2; complete. Q85. Health user guide and three specialist developer guides refreshed; bounded samples, differing scope, current direct-entry API, inactive old purge and queued alerts verified. Reviewed 2026-10-26T15:01:33+00:00. |
| 86 | **Organization settings profile and personal context** — Implemented; scoped review complete. | changed | `src/app/(dashboard)/app/profile/; app/settings/page.tsx; convex/users.ts:updateMyProfile; userMemories.ts; userMemorySuggestionActions.ts` | [User](./end-user/organization-and-company-workspaces.md) / [Developer](./developer/organization-and-company-workspaces.md) | Review priority P1; complete. Q86. Pair refreshed; personal ownership/caps/deletion, bounded learning and EVAL distinction, current profile and company dashboard/billing scope verified. Reviewed 2026-10-26T14:58:39+00:00. |
| 87 | **Skill authoring and import examples** — Implemented; scoped review complete. | changed | `convex/utils/skillMarkdownService.ts; skillContracts.ts; skillBundleService.ts; agentSkills.ts` | Not applicable: internal process / [Developer](./developer/agent-skill-authoring-guide.md) | Review priority P2; complete. Q87. Authoring guide refreshed; simple frontmatter/parser scope, UI activation, same-name update/rollout, runtime text and recommended versus enforced fixture standards corrected. Reviewed 2026-10-26T14:56:47+00:00. |
| 88 | **Operator demo test-auth framework updates and packaging** — Implemented; scoped documentation review complete. | changed | `scripts/local-test-auth.mjs; scripts/local-demo-seed.mjs; scripts/framework-update.mjs; scripts/strip-verticals.mjs; scripts/provider-requirements.mjs; convex/seoCollectionSweep.ts` | Operator only: [Test auth](./operator/local-test-auth-runbook.md), [Demo seed](./operator/local-demo-seed-runbook.md), [Framework updates](./operator/framework-updates.md), [Setup](./operator/product-setup.md), [Cloning](./operator/cloning-hakken.md), [Packaging](./operator/vertical-app-packaging-checklist.md), [Data kept](./operator/dataforseo-data-kept.md) | Review priority P2; complete. Q88. Seven operator runbooks refreshed. Removed unavailable module/example/migration commands, corrected agent creation, provider requirements, asynchronous cleanup and target identity limits. No operational command executed. Reviewed 2026-10-26T15:20:24+00:00. |
| 89 | **Insights durable whole-section refresh and large-site workers** — Implemented; scoped documentation review complete. | changed | `convex/insightsRunWorker.ts; insightsRunState.ts:assertInsightsPublisher; insightHistorySteps.ts; insightsReadingSteps.ts; insightCompetingSteps.ts; insightsReads.ts:sectionRefresh` | [User](./end-user/insights-findings.md) / [Developer](./developer/insights-findings.md); related report, measurement, competing and Track record guides reused | Review priority P1; complete. Q89. Located during final concurrent-source diff review. Saved chain/booking, per-stage failure/retry, quota deferral, pinned list generations, per-run model-answer reuse and historical report refresh documented. Local uncommitted code, not deployed acceptance. Reviewed 2026-10-26T15:20:24+00:00. |

### Prioritized Documentation Queue

**No currently identified documentation-writing item remains pending.** The run
processed the expanded queue sequentially and revisited shared guides as deeper
implementation contracts were found. The final pass also reconciled stale overview,
reference, setup, diagnostics and operator procedures, rather than treating an
existing file as automatically complete.

Coverage comprises **67 distinct end-user feature guide bundles paired with developer
coverage: 34 newly created and 33 refreshed**. Count each primary end-user feature
once, even when several developer guides support it or multiple inventory rows deepen
it. The widget handoff is an additional supporting user guide. Fourteen internal-only
work units use developer/operator coverage; retirement/not-found reviews are recorded
separately and do not count as newly written feature pairs. All attempted scoped guide
work is complete; no attempted pair was left as an outline.

Overall discovered-inventory review: **89/89, 100%**. This continuation inherited
19 pending units, expanded its work through discovery, and completed **37/37, 100%**.
Whole-platform exhaustive behavior coverage has an unknown denominator, so no overall
percentage is claimed beyond the explicitly discovered inventory.

Next maintenance action: compare current source/history with this review checkpoint,
starting with any further changes to the shared Insights chain and report workers, then
add newly discovered or changed capabilities here before editing their established guides.
There is no next uncompleted feature in the current documentation queue. Product/security/
operational decisions below remain outside documentation-only authority.

### Discrepancies and Limits Requiring Review

- AI rule soft lists can read agent rules for signed-in non-ADMIN roles through the broad branch, and internal active agent rules are not independently filtered by company. Detail/write checks differ. Source permission repair is outside this documentation task; see the rules guide.

- News Collector time cutoffs finish the action and rely on a later run; no same-run continuation was found. X account cursors advance before summarization, and failed summaries can be behind a progressed cursor. Knowledge-retention pending state has no general watchdog found. Separate application decisions are needed; documentation does not repair these paths. Reviewed 2026-10-26.

- Insights reports are replaceable snapshots: same-period regeneration creates a new ID and Written state. Read is company-wide, monthly due starts on day four, and board covered dates are trailing ninety days. PDFs are browser-generated only for monthly/board records.
- Strategy defaults and period defaults differ between queries; mixed annual, quarterly and newest-three-held-month windows must remain labeled. Query-level enquiries are proportional estimates, not observed end-to-end attribution. Passing measurement is a rule result, not certification.
- Experiment start/due measurement can store zero figures and empty dates when Analytics evidence is missing; DONE does not certify complete measurement or controlled causation. Record/mutation role guards are narrower than listing write guards.
- Whole-site broken-page rules precede unused-page needed-type protections. Displayed REMOVE/MERGE/REDIRECT is advisory; the normal build retains only 2,000 detailed decisions although its total page count can be larger. Competing-group saving can queue supplier volume/difficulty work, while reads are passive.
- Leaderboards use the active watched group, correcting the initial discovery's cross-company description. Linked review facts do not filter to Google only despite surrounding labels. Historic ranking requires supplied prior values for all current rows, still subject to source bounds.
- Buyer-panel sync can override a matching manual pause; its firstAsked projection uses list creation time, and OVER_LIMIT combines several refusal/inactive causes. AI-growth Radar lookup uses place directly while dedicated Radar normalizes country. Further policy/source changes are outside documentation authorization.

- Technical audit summaries and detail have different bounds; small-crawl blocking is a heuristic. Older-detail cleanup can miss old rows beyond a current-filled first batch. Documentation records that limit without changing collection behavior.
- Local shared-evidence reads have narrower guards than some UI wording might imply: Maps search accepts a supplied keyword at an authorized office point, and business detail can resolve a shared listing ID. Further access-policy decisions require separate source work.
- Reviews topic marks are shared on the listing and use a selected own-company decision context; reply drafts are private but their lookup key omits listing ID. Draft cost display averages recent replier transactions across companies. Those contracts are documented, not changed.
- Web-mention day prefers publication/fetch dates rather than always first discovery. Link markers use any saved backlink from the host, not the exact page. Repeated URLs are not refreshed, and one-year thinning occurs only when fresh URLs arrive. Current guide wording follows implementation rather than broader source comments.

- PRODUCT.md §31 still says GA4/Bing, DataForSEO and the outbox are unbuilt, while current reviewed implementation and later change-log entries show concrete capabilities. Its Part Two/Three overview paragraphs also predate later exceptions. PRODUCT.md and plans remain unchanged. Manual reconciliation must distinguish implemented pieces from the complete intended product outcome.
- PRODUCT.md §33 records accepted rename cutover debt for external webhook receivers/signatures, Stripe metadata, widget snippets, persisted formats, DNS and Cloud resources. Local names or tests do not establish external acceptance; no cutover was checked.
- Clarity disconnect retains figures. Searches of `googleConnection.ts` and website-purge modules did not establish a full Clarity hold-removal cascade. Retention is based on newest held data and bounded cleanup. Do not promise complete private-data erasure until that path is reviewed or repaired in separately authorized application work.
- Digest production saves an issue before queueing recipients; an interruption can leave missing recipient rows while a normal rerun sees the saved issue and returns. Translation sweeps inspect fixed newest-row windows without a persisted full-backlog cursor. Both gaps are documented; application changes remain outside this task.
- Individual user deletion drains authentication identity records inline; company deletion batches remove users through a different path without that helper. Equivalent identity cleanup has not been established for company deletion. Team editors also remain dialogs, and invitation dispatch does not apply the same impersonation restriction as managed-user writes. These differences are documented without source changes.
- Workflow email now queues in Outbox. Its idempotency key is execution plus node, so repeated iterator visits to one email node require review before promising a distinct message per item. Knowledge ingestion can accept only some returned vectors if other vectors have wrong dimensions without throwing; ready status alone is not complete extraction evidence. No source fix was made.
- Wiki review-marked imports bypass the human checkpoint when the Reviewer is inactive; the flag is cleared and distillation scheduled. Empty source text can remain claimed; normal caught failures release claims for at most three attempts. These implementation boundaries are now visible, with no behavior change.
- Generic task writes use authenticated module mutations without an explicit oversight-role refusal; same-company users can change task status regardless of assignee. This differs from blanket read-only-role expectations and needs a separately authorized permission decision. Later Q31 review established manifest-based notification erasure and generic-task reference dissociation; arbitrary text and byte erasure is not established.
- Chat history deletion still removes only a bounded 100-message batch before its root. The refreshed guide preserves that caveat; no purge behavior was changed.
- Plan editing still uses dialogs in current source, despite the repository instruction that field editors should be pages. That UX discrepancy is recorded in the developer guide and left for a product decision.
- Gmail retirement guides already accurately say the mailbox was removed on 2026-10-09. Remaining generic Google OAuth is not an active inbox watcher. Stale mailbox language in the updated indexes/email references was corrected without rewriting the retirement records.
- A scoped legacy-name scan found an old framework-name explanation in `src/app/(dashboard)/app/assistant/_components/AssistantHero.tsx:28`. Remaining matches in `scripts/framework-snapshot.mjs`, `scripts/init-product.mjs` and `scripts/product-setup.test.mjs` concern upstream identity/guards. None was renamed; source changes are outside this task.
- Pre-existing edits to `convex/googleAnalyticsChannelReads.test.ts` and `convex/googleAnalyticsReads.test.ts` were preserved. They are not executed verification evidence for this pass.

- Spoken-channel review found an empty CRM lookup registry in `convex/customerIdentity.ts`; automatic customer matching is not established. Long phone summaries can also exceed generic task detail limits and fail the caught task step. Browser voice transcript labels still use fixed OpenAI metadata even for Google. These require separately authorized source decisions.
- Widget reset clears browser state, not server history. Deleting widget configuration is not a conversation/file purge. Upload allowance counts ten URL issuances, including abandoned uploads. No external domain/signing/rename cutover was tested.

- Governance subject-access export accepts a canonical email without checking the target company against the caller. Both overview routes render its panel. This requires a separately authorized permission fix; no export or source change was made. Evidence packs and audit exports have different role and bounded-read semantics now documented.
- Retention defaults are eighteen enabled pipelines, not five disabled pipelines. Stored disabled overrides survive. The legacy audit-specific scheduler was not found in current handlers/crons; helpers remain. Purge success can retain leaked storage identifiers, and a stale reaper marks failure rather than automatically resuming. These distinctions replace inaccurate old guidance.
- Maintenance inventory registry wording still calls an active-plan assignment estimate MRR; it is not Stripe revenue. Migration script SUCCESS means scheduled work, not completed backfills; failed orchestration has no verified independent stall recovery. Package reference no longer advertises absent movement commands.
- Public workflow triggers have no corresponding public workflow status endpoint; run-status reads agent runs only. Outbound webhook queue/dispatch helpers have no normal producer or destination editor in the inspected current code. No automatic callbacks or delivery-monitor screen is promised.

- Screen-kit core review found a 720px mobile table minimum despite broad no-sideways-scrolling instructions. Theme checking contacts a development backend and can exit successfully without comparing when skipped/unavailable. These implementation/policy differences are documented without changing the UI or theme record.

- Public home-page source still describes preparedness and framework positioning, contradicting PRODUCT.md's discovery product intent. Old showcase modules are absent and contact falls back to a missing route. Documentation reports these facts; source and product intent were not changed.
- Credit recording currently permits owed balances without refusal. Topup purchase creation was not found, while the model/read path can represent topups. The price editor accepts zero but positive-unit arithmetic charges at least one credit. Commercial policy and any source changes require separate authorization.

- Organic report Download all sends kind/site/sort, not screen search/filter state; its CSV can therefore contain more than the displayed filtered subset and is bounded with a completion flag. Tracking source review confirmed private list scope, bounded first checks and shared purchase reuse without exposing other companies' list choices.

- Brand Radar monthly writers cap histories at thirty-six months despite broad retained-forever labels; the UI shows twelve. Current question detail has no newer-month refusal on reparse. Google question/source detail and the US-only ChatGPT aggregate path are different datasets.
- Draft decisions check authenticated website access without the stricter listing oversight-role guard. Approval can succeed despite clipboard failure and performs no external publishing or sending. Per-area draft limits are per batch; sixty-day list scope and bounded two-year cleanup differ from some source comments. Any policy/behavior repair needs separate authorization.

- Concurrent Insights reliability changes introduce saved recovery stages and publication guards; no application tests or deployment were performed by this documentation task. Preserve other workers’ source changes and use their separate verification before release.

### Run Checkpoint And Validation

Final validation passed at **2026-10-26T15:24:20+00:00** (Europe/London): 183 allowed Markdown paths, 181 parsed frontmatter blocks plus two narrowly edited existing operator guides, 167 substantive user/developer guides, valid relative links/anchors, no empty Markdown and clean diff whitespace. The three original protected files retain their starting hashes. Fifty other working-tree paths are concurrent/pre-existing work and were not edited by this task.

Documentation status: **UPDATED**. Known documentation queue complete; edits remain
uncommitted for review. Only allowed Markdown paths were edited by this task. Existing
AGENTS/test edits and additional concurrent application/configuration/plan edits were
preserved; a mixed checkout must not be attributed entirely to this task.

Validation checks cover changed Markdown only: actual word counts, parsed YAML frontmatter,
required identity/review fields, metadata directly after H1, relative links/anchors, contextual
placeholder search, empty Markdown scan and `git diff --check`. End-user/developer feature
guides exceed 1,200 prose words as well as the requested `wc -w` threshold; indexes and
operator runbooks have no artificial minimum. The exact per-file word counts are below.

No dependency installation, app, browser, capture, automated application test, provider call,
live integration check, migration, data fill, commit, push, PR, deployment or schedule change
was run. No standalone package documentation-check command was found; the targeted
Markdown checks are the validation scope. Local source/tests are not deployed acceptance,
and PRODUCT.md section 33 external cutover remains unverified.

Historical research, plans and verification records remain unchanged. The retained Gmail
retirement notes were checked without rewriting them. `future-agent-maintenance-plan.md`
and `manage-agents-secondary-tabs-plan.md` are historical/planned developer records, not
current instructions or newly implemented features. Earlier execution checkpoints are
retained in automation memory rather than competing with this current queue.

### Changed Guide Word Counts

Counts are actual `wc -w` results including YAML/visible metadata. Indexes are excluded
from this table because they are navigation/coverage records rather than feature guides.

| Guide | Words | Audience |
| --- | --- | --- |
| [developer/administration.md](./developer/administration.md) | 2276 | developer |
| [developer/agent-configuration-and-catalogs.md](./developer/agent-configuration-and-catalogs.md) | 2198 | developer |
| [developer/agent-runtime-operations.md](./developer/agent-runtime-operations.md) | 2540 | developer |
| [developer/agent-skill-authoring-guide.md](./developer/agent-skill-authoring-guide.md) | 1562 | developer |
| [developer/agentic-starter-framework-overview.md](./developer/agentic-starter-framework-overview.md) | 1341 | developer |
| [developer/agents.md](./developer/agents.md) | 2782 | developer |
| [developer/ai-administration.md](./developer/ai-administration.md) | 2603 | developer |
| [developer/ai-models-providers-and-costs.md](./developer/ai-models-providers-and-costs.md) | 2716 | developer |
| [developer/ai-provider-tool-extension.md](./developer/ai-provider-tool-extension.md) | 2629 | developer |
| [developer/ai-questions-and-answers.md](./developer/ai-questions-and-answers.md) | 1404 | developer |
| [developer/ai-rules-and-prompts.md](./developer/ai-rules-and-prompts.md) | 1423 | developer |
| [developer/ai-search-growth-and-buyer-questions.md](./developer/ai-search-growth-and-buyer-questions.md) | 1299 | developer |
| [developer/ai-tools-and-connectors.md](./developer/ai-tools-and-connectors.md) | 1726 | developer |
| [developer/ai-visibility-reports.md](./developer/ai-visibility-reports.md) | 1374 | developer |
| [developer/analytics-rollups.md](./developer/analytics-rollups.md) | 1891 | developer |
| [developer/architecture.md](./developer/architecture.md) | 1763 | developer |
| [developer/assistant-chat.md](./developer/assistant-chat.md) | 4152 | developer |
| [developer/audit-log-service.md](./developer/audit-log-service.md) | 1307 | developer |
| [developer/auth-diagnostics.md](./developer/auth-diagnostics.md) | 1282 | developer |
| [developer/auxiliary-app-experiences.md](./developer/auxiliary-app-experiences.md) | 2331 | developer |
| [developer/backend.md](./developer/backend.md) | 1530 | developer |
| [developer/backlink-reports.md](./developer/backlink-reports.md) | 1350 | developer |
| [developer/bing-webmaster.md](./developer/bing-webmaster.md) | 1366 | developer |
| [developer/brand-radar.md](./developer/brand-radar.md) | 1378 | developer |
| [developer/collection-operations.md](./developer/collection-operations.md) | 1400 | developer |
| [developer/company-ai-readiness-and-checks.md](./developer/company-ai-readiness-and-checks.md) | 1797 | developer |
| [developer/company-user-management.md](./developer/company-user-management.md) | 2594 | developer |
| [developer/company-wiki.md](./developer/company-wiki.md) | 3282 | developer |
| [developer/competing-pages-and-search-ownership.md](./developer/competing-pages-and-search-ownership.md) | 1425 | developer |
| [developer/competitor-discovery-and-gaps.md](./developer/competitor-discovery-and-gaps.md) | 1349 | developer |
| [developer/content-translation.md](./developer/content-translation.md) | 1367 | developer |
| [developer/convex-api-and-schema-reference.md](./developer/convex-api-and-schema-reference.md) | 8202 | developer |
| [developer/convex-environment-variables.md](./developer/convex-environment-variables.md) | 2684 | developer |
| [developer/credit-ledger-and-usage.md](./developer/credit-ledger-and-usage.md) | 1599 | developer |
| [developer/data-retention-and-purges.md](./developer/data-retention-and-purges.md) | 1446 | developer |
| [developer/deployment.md](./developer/deployment.md) | 4230 | developer |
| [developer/drawing-guide.md](./developer/drawing-guide.md) | 1490 | developer |
| [developer/email-branding.md](./developer/email-branding.md) | 1641 | developer |
| [developer/email-system.md](./developer/email-system.md) | 3163 | developer |
| [developer/embedded-widgets.md](./developer/embedded-widgets.md) | 2341 | developer |
| [developer/feature-generator.md](./developer/feature-generator.md) | 1607 | developer |
| [developer/frontend.md](./developer/frontend.md) | 2365 | developer |
| [developer/function-and-feature-coverage-matrix.md](./developer/function-and-feature-coverage-matrix.md) | 1496 | developer |
| [developer/getting-started.md](./developer/getting-started.md) | 1334 | developer |
| [developer/google-analytics.md](./developer/google-analytics.md) | 1702 | developer |
| [developer/google-search-tracking.md](./developer/google-search-tracking.md) | 1450 | developer |
| [developer/governance-and-trust.md](./developer/governance-and-trust.md) | 1625 | developer |
| [developer/hakken-tasks.md](./developer/hakken-tasks.md) | 1288 | developer |
| [developer/insights-findings.md](./developer/insights-findings.md) | 1867 | developer |
| [developer/insights-leaderboards.md](./developer/insights-leaderboards.md) | 1276 | developer |
| [developer/insights-measurement-and-enquiries.md](./developer/insights-measurement-and-enquiries.md) | 1347 | developer |
| [developer/insights-reports-and-exports.md](./developer/insights-reports-and-exports.md) | 1573 | developer |
| [developer/insights-strategy-and-planning.md](./developer/insights-strategy-and-planning.md) | 1339 | developer |
| [developer/insights-track-record.md](./developer/insights-track-record.md) | 1599 | developer |
| [developer/keyword-research.md](./developer/keyword-research.md) | 1315 | developer |
| [developer/knowledge-management.md](./developer/knowledge-management.md) | 2249 | developer |
| [developer/local-business-profiles.md](./developer/local-business-profiles.md) | 1403 | developer |
| [developer/local-maps-and-market.md](./developer/local-maps-and-market.md) | 1404 | developer |
| [developer/maintenance-scripts.md](./developer/maintenance-scripts.md) | 1700 | developer |
| [developer/microsoft-clarity.md](./developer/microsoft-clarity.md) | 1297 | developer |
| [developer/new-agentic-app-setup-checklist.md](./developer/new-agentic-app-setup-checklist.md) | 1413 | developer |
| [developer/news-collector-and-editorial-recovery.md](./developer/news-collector-and-editorial-recovery.md) | 1507 | developer |
| [developer/operational-scripts-reference.md](./developer/operational-scripts-reference.md) | 1724 | developer |
| [developer/organic-keywords-and-pages.md](./developer/organic-keywords-and-pages.md) | 1530 | developer |
| [developer/organization-and-company-workspaces.md](./developer/organization-and-company-workspaces.md) | 1888 | developer |
| [developer/page-decisions-and-create-candidates.md](./developer/page-decisions-and-create-candidates.md) | 1300 | developer |
| [developer/page-reviews-and-experiments.md](./developer/page-reviews-and-experiments.md) | 1313 | developer |
| [developer/paid-search-reports.md](./developer/paid-search-reports.md) | 1302 | developer |
| [developer/photo-actions.md](./developer/photo-actions.md) | 1369 | developer |
| [developer/platform-operations-settings.md](./developer/platform-operations-settings.md) | 2601 | developer |
| [developer/platform-plans-and-quotas.md](./developer/platform-plans-and-quotas.md) | 2077 | developer |
| [developer/product-extension-guide.md](./developer/product-extension-guide.md) | 1673 | developer |
| [developer/product-recipes.md](./developer/product-recipes.md) | 1316 | developer |
| [developer/public-api-and-webhooks.md](./developer/public-api-and-webhooks.md) | 1819 | developer |
| [developer/public-website.md](./developer/public-website.md) | 1631 | developer |
| [developer/reading-room-readership-analytics.md](./developer/reading-room-readership-analytics.md) | 1480 | developer |
| [developer/reading-room.md](./developer/reading-room.md) | 1279 | developer |
| [developer/receptionist-screen.md](./developer/receptionist-screen.md) | 1659 | developer |
| [developer/review-intelligence.md](./developer/review-intelligence.md) | 1450 | developer |
| [developer/route-protection-and-authentication.md](./developer/route-protection-and-authentication.md) | 2444 | developer |
| [developer/route-reference.md](./developer/route-reference.md) | 2659 | developer |
| [developer/run-observatory.md](./developer/run-observatory.md) | 1334 | developer |
| [developer/screen-kit.md](./developer/screen-kit.md) | 10609 | developer |
| [developer/search-console.md](./developer/search-console.md) | 1394 | developer |
| [developer/spoken-channels.md](./developer/spoken-channels.md) | 2577 | developer |
| [developer/starter-app-template-checklist.md](./developer/starter-app-template-checklist.md) | 1325 | developer |
| [developer/system-health-and-platform-alerts.md](./developer/system-health-and-platform-alerts.md) | 1865 | developer |
| [developer/system-settings-and-branding.md](./developer/system-settings-and-branding.md) | 1743 | developer |
| [developer/tasks-and-notifications.md](./developer/tasks-and-notifications.md) | 1826 | developer |
| [developer/technical-site-audit.md](./developer/technical-site-audit.md) | 1445 | developer |
| [developer/telegram.md](./developer/telegram.md) | 1290 | developer |
| [developer/tenancy-enforcement.md](./developer/tenancy-enforcement.md) | 1567 | developer |
| [developer/tool-servers.md](./developer/tool-servers.md) | 1839 | developer |
| [developer/upload-and-knowledge-policy.md](./developer/upload-and-knowledge-policy.md) | 1467 | developer |
| [developer/web-mention-monitoring.md](./developer/web-mention-monitoring.md) | 1397 | developer |
| [developer/website-assets-and-drafts.md](./developer/website-assets-and-drafts.md) | 1358 | developer |
| [developer/websites-and-visibility.md](./developer/websites-and-visibility.md) | 1325 | developer |
| [developer/workflow-automation.md](./developer/workflow-automation.md) | 3736 | developer |
| [developer/workflow-runtime-internals.md](./developer/workflow-runtime-internals.md) | 4638 | developer |
| [end-user/administration.md](./end-user/administration.md) | 2389 | end-user |
| [end-user/agent-operations-and-review.md](./end-user/agent-operations-and-review.md) | 1874 | end-user |
| [end-user/agent-setup-and-configuration.md](./end-user/agent-setup-and-configuration.md) | 1872 | end-user |
| [end-user/agents.md](./end-user/agents.md) | 2279 | end-user |
| [end-user/ai-administration.md](./end-user/ai-administration.md) | 2465 | end-user |
| [end-user/ai-models-providers-and-costs.md](./end-user/ai-models-providers-and-costs.md) | 2307 | end-user |
| [end-user/ai-questions-and-answers.md](./end-user/ai-questions-and-answers.md) | 1473 | end-user |
| [end-user/ai-rules-and-prompts.md](./end-user/ai-rules-and-prompts.md) | 1473 | end-user |
| [end-user/ai-search-growth-and-buyer-questions.md](./end-user/ai-search-growth-and-buyer-questions.md) | 1622 | end-user |
| [end-user/ai-tools-and-connectors.md](./end-user/ai-tools-and-connectors.md) | 1490 | end-user |
| [end-user/ai-visibility-reports.md](./end-user/ai-visibility-reports.md) | 1534 | end-user |
| [end-user/assistant-chat.md](./end-user/assistant-chat.md) | 3116 | end-user |
| [end-user/auxiliary-app-experiences.md](./end-user/auxiliary-app-experiences.md) | 1530 | end-user |
| [end-user/backlink-reports.md](./end-user/backlink-reports.md) | 1489 | end-user |
| [end-user/bing-webmaster.md](./end-user/bing-webmaster.md) | 1477 | end-user |
| [end-user/brand-radar.md](./end-user/brand-radar.md) | 1672 | end-user |
| [end-user/company-ai-readiness-and-checks.md](./end-user/company-ai-readiness-and-checks.md) | 1850 | end-user |
| [end-user/company-wiki.md](./end-user/company-wiki.md) | 2559 | end-user |
| [end-user/company-workspace-administration.md](./end-user/company-workspace-administration.md) | 1681 | end-user |
| [end-user/competing-pages-and-search-ownership.md](./end-user/competing-pages-and-search-ownership.md) | 1633 | end-user |
| [end-user/competitor-discovery-and-gaps.md](./end-user/competitor-discovery-and-gaps.md) | 1659 | end-user |
| [end-user/credits-and-usage.md](./end-user/credits-and-usage.md) | 1569 | end-user |
| [end-user/emails.md](./end-user/emails.md) | 2163 | end-user |
| [end-user/embedded-widgets.md](./end-user/embedded-widgets.md) | 1528 | end-user |
| [end-user/google-analytics.md](./end-user/google-analytics.md) | 1669 | end-user |
| [end-user/google-search-tracking.md](./end-user/google-search-tracking.md) | 1569 | end-user |
| [end-user/governance-and-trust.md](./end-user/governance-and-trust.md) | 1647 | end-user |
| [end-user/hakken-tasks.md](./end-user/hakken-tasks.md) | 1406 | end-user |
| [end-user/health.md](./end-user/health.md) | 1292 | end-user |
| [end-user/insights-findings.md](./end-user/insights-findings.md) | 1643 | end-user |
| [end-user/insights-leaderboards.md](./end-user/insights-leaderboards.md) | 1454 | end-user |
| [end-user/insights-measurement-and-enquiries.md](./end-user/insights-measurement-and-enquiries.md) | 1740 | end-user |
| [end-user/insights-reports-and-exports.md](./end-user/insights-reports-and-exports.md) | 1779 | end-user |
| [end-user/insights-strategy-and-planning.md](./end-user/insights-strategy-and-planning.md) | 1654 | end-user |
| [end-user/insights-track-record.md](./end-user/insights-track-record.md) | 1589 | end-user |
| [end-user/keyword-research.md](./end-user/keyword-research.md) | 1482 | end-user |
| [end-user/knowledge-management.md](./end-user/knowledge-management.md) | 1738 | end-user |
| [end-user/local-business-profiles.md](./end-user/local-business-profiles.md) | 1682 | end-user |
| [end-user/local-maps-and-market.md](./end-user/local-maps-and-market.md) | 1631 | end-user |
| [end-user/login-access-and-authentication.md](./end-user/login-access-and-authentication.md) | 1692 | end-user |
| [end-user/microsoft-clarity.md](./end-user/microsoft-clarity.md) | 1423 | end-user |
| [end-user/operational-diagnostics-and-retention.md](./end-user/operational-diagnostics-and-retention.md) | 1930 | end-user |
| [end-user/organic-keywords-and-pages.md](./end-user/organic-keywords-and-pages.md) | 1554 | end-user |
| [end-user/organization-and-company-workspaces.md](./end-user/organization-and-company-workspaces.md) | 1942 | end-user |
| [end-user/page-decisions-and-create-candidates.md](./end-user/page-decisions-and-create-candidates.md) | 1545 | end-user |
| [end-user/page-reviews-and-experiments.md](./end-user/page-reviews-and-experiments.md) | 1639 | end-user |
| [end-user/paid-search-reports.md](./end-user/paid-search-reports.md) | 1573 | end-user |
| [end-user/photo-actions.md](./end-user/photo-actions.md) | 1463 | end-user |
| [end-user/platform-operations-settings.md](./end-user/platform-operations-settings.md) | 2350 | end-user |
| [end-user/platform-overview.md](./end-user/platform-overview.md) | 1363 | end-user |
| [end-user/platform-plans-and-quotas.md](./end-user/platform-plans-and-quotas.md) | 1748 | end-user |
| [end-user/public-api-and-webhooks.md](./end-user/public-api-and-webhooks.md) | 1655 | end-user |
| [end-user/public-website.md](./end-user/public-website.md) | 1668 | end-user |
| [end-user/reading-room.md](./end-user/reading-room.md) | 1470 | end-user |
| [end-user/receptionist-screen.md](./end-user/receptionist-screen.md) | 1379 | end-user |
| [end-user/review-intelligence.md](./end-user/review-intelligence.md) | 1587 | end-user |
| [end-user/search-console.md](./end-user/search-console.md) | 1566 | end-user |
| [end-user/spoken-channels.md](./end-user/spoken-channels.md) | 1594 | end-user |
| [end-user/system-health-and-maintenance.md](./end-user/system-health-and-maintenance.md) | 1405 | end-user |
| [end-user/tasks-and-notifications.md](./end-user/tasks-and-notifications.md) | 1573 | end-user |
| [end-user/technical-site-audit.md](./end-user/technical-site-audit.md) | 1542 | end-user |
| [end-user/telegram.md](./end-user/telegram.md) | 1394 | end-user |
| [end-user/tool-servers.md](./end-user/tool-servers.md) | 1470 | end-user |
| [end-user/web-mention-monitoring.md](./end-user/web-mention-monitoring.md) | 1612 | end-user |
| [end-user/website-assets-and-drafts.md](./end-user/website-assets-and-drafts.md) | 1672 | end-user |
| [end-user/websites-and-visibility.md](./end-user/websites-and-visibility.md) | 1483 | end-user |
| [end-user/widget-handoff-and-troubleshooting.md](./end-user/widget-handoff-and-troubleshooting.md) | 1635 | end-user |
| [end-user/workflow-automation.md](./end-user/workflow-automation.md) | 3500 | end-user |
| [operator/cloning-hakken.md](./operator/cloning-hakken.md) | 1010 | operator |
| [operator/collection-operations.md](./operator/collection-operations.md) | 765 | operator |
| [operator/dataforseo-data-kept.md](./operator/dataforseo-data-kept.md) | 1065 | operator |
| [operator/framework-updates.md](./operator/framework-updates.md) | 958 | operator |
| [operator/local-demo-seed-runbook.md](./operator/local-demo-seed-runbook.md) | 864 | operator |
| [operator/local-test-auth-runbook.md](./operator/local-test-auth-runbook.md) | 1178 | operator |
| [operator/news-collector-and-editorial-recovery.md](./operator/news-collector-and-editorial-recovery.md) | 684 | operator |
| [operator/product-setup.md](./operator/product-setup.md) | 1261 | operator |
| [operator/reading-room-readership-analytics.md](./operator/reading-room-readership-analytics.md) | 690 | operator |
| [operator/stripe-billing.md](./operator/stripe-billing.md) | 3201 | operator |
| [operator/telegram.md](./operator/telegram.md) | 501 | operator |
| [operator/vertical-app-packaging-checklist.md](./operator/vertical-app-packaging-checklist.md) | 854 | operator |
