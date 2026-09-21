# Hakken Documentation

This is the front door for Hakken documentation. Use the audience sections below to decide where a document belongs and where to start reading.

## Structure

- [Product](./product/index.md): the dated research set behind PRODUCT.md — vision, competitive landscape, data sources, closed research gaps. Evidence, not specification; do not edit to match later decisions.
- [Plans](./plans/index.md): active, completed, and historical plans created during product and engineering work.
- [Developer](./developer/index.md): technical setup, architecture, implementation guides, platform extension notes, and agent handoff material.
- [Operator](./operator/index.md): internal runbooks for release review, packaging, demos, and platform operations.
- [End User](./end-user/index.md): customer-friendly documentation about the platform, features, and workflows.

## Start Here

- New coding agents: read [AGENTS.md](../AGENTS.md), then [Future Agent Maintenance Plan](./developer/future-agent-maintenance-plan.md).
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

## Complete Map

## Coverage Note

The latest implementation audit refreshed every active-plan link and aligned
the knowledge, workflow, task, notification, agent, assistant, widget,
reception, settings, governance, company AI, profile, screen-kit, maintenance
connections, deployment, connector, tool-server, and coverage guides with the
implementation through 2026-08-25. It also added dedicated Company Wiki,
spoken-channel, Gmail
mailbox, photo-action, receptionist-screen, and task/notification guide pairs
for the newly routed page/map/import/review experience, live voice/phone
surfaces, connected inbound mailbox backend, and image-to-task/walk-up
kiosk/task-routing behavior. Future upkeep should still treat broad guides and
newly changed implementation areas as active audit targets because routes,
Convex modules, workflows, scripts, and operator procedures continue to change.

### Product

- [Product Research Index](./product/index.md)
- [App Vision v2.3](./product/app-vision-v2.md) — the current plan in full: what Hakken is, who it's for, the weekly loop, the engine, the moat, pricing, and the six phases.
- [AI Visibility Landscape](./product/ai-visibility-landscape-sept-2026.md) — forty competitors by tier, funding, pricing, feature matrix, unit economics.
- [Data Sources And Integrations](./product/data-sources-and-integrations-sept-2026.md) — every source by layer with read/write access, cost, priority, legal exposure, and build order.
- [Research Gaps Closed](./product/research-gaps-closed-sept-2026.md) — market size, platform risk, incumbent roadmaps, the legal position, and the two phase-0 test protocols.
- [Research Note: Dooley's Search Stack](./product/research-note-dooley-search-stack-sept-2026.md) — the six-layer SEO/SMO/AEO/GEO/DEO/SXO frame and where it stops.

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
- [Pressing Run Should Actually Run The Agent](./plans/active/agents-run-properly-plan.md) — active plan/history for making manual and scheduled agent runs use the real tool-capable agent loop.
- [Rightmove Agent Execution Plan](./plans/active/rightmove-agent-execution-plan.md) — active plan for making the Rightmove Agent the single execution path for property collection.
- [Company AI Readiness Rebuild Plan](./plans/active/company-ai-readiness-rebuild-plan.md) — active plan for replacing the company AI readiness screen and its score/signal model.
- [Company And Agent Model Defaults Plan](./plans/active/company-and-agent-model-defaults-plan.md) — active plan for aligning company and agent model-default controls with the platform model-defaults screen.
- [Public Website Plan](./plans/active/public-website-plan.md) — active plan for the pre-login public website, including home, platform, showcase, trust, and contact work.
- [User Directory Plan](./plans/active/user-directory-plan.md) — active plan for the platform-wide user directory, login recording, and user activity aggregation.
- [Email Design System Plan](./plans/active/email-design-system-plan.md) — active plan for the shared outbound email shell, plain-text parity, sender identity, and accessible colour contract.
- [Observability Collection And Killswitch Handover](./plans/active/observability-collection-and-killswitch-handover.md) — active handover for honest Apify collection reporting and a visible agent kill switch.
- Workspace Sales Data Plan (not included in this copy) — active plan for the optional workspace spreadsheet-import vertical and module gating.
- Workspace Customer CRM Plan (not included in this copy) — active plan for customer records, profiles, typed-in details, and sales history inside workspace sections.
- Workspace Customer Research Agent Plan (not included in this copy) — active plan for internet backfill, prospect discovery, researched-field provenance, and customer/prospect write boundaries.
- [Market Discovery Agent Plan](./plans/active/market-discovery-agent-plan.md) — active plan for finding new parent companies outside imported groups, filing their locations as market-discovery prospects, and tracking the job with a visible progress bar.
- Comax Opportunity Report Plan (not included in this copy) — active plan for prospect valuation, chain gap analysis, opportunity-report tools, and the workspace opportunity report screen.
- [Research Agent Autopilot Plan](./plans/active/research-agent-autopilot-plan.md) — active plan for turning customer research and prospecting sweeps into a supervised queue-backed job.
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
- [Gmail Inbox Plan](./plans/active/gmail-inbox-plan.md) — active plan for the dedicated Gmail connector, mailbox watcher, and reply/task handling.
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
- [Gmail Mailbox](./developer/gmail-mailbox.md)
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

#### Required Movement Plan

Before changing movement capture, Replay Studio, or Game Studio behaviour, read **[Movement Definitive Plan](./plans/active/movement-definitive-plan.md)**. It defines the two goals (capture countdown with full-body walk-back gate; correct avatar/instructor motion in Replay and Game), the two-part acceptance (automated Replay/Game comparison passing on current schema-v3 recordings plus browser-visible confirmation), and the capture-screen rules that must never regress. Retired background on the repair-loop discipline lives in [docs/plans/completed/](./plans/index.md#retired-and-completed-plans); treat Game Studio live-camera checks as final confirmation rather than primary diagnosis.

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
- [Gmail Mailbox](./end-user/gmail-mailbox.md)
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
