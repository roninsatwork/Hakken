# Sonae Documentation

This is the front door for Sonae documentation. Use the audience sections below to decide where a document belongs and where to start reading.

## Structure

- [Plans](./plans/index.md): active, completed, and historical plans created during product and engineering work.
- [Developer](./developer/index.md): technical setup, architecture, implementation guides, platform extension notes, and agent handoff material.
- [Operator](./operator/index.md): internal runbooks for release review, packaging, demos, and platform operations.
- [End User](./end-user/index.md): customer-friendly documentation about the platform, features, and workflows.

## Start Here

- New coding agents: read [AGENTS.md](../AGENTS.md), then [Future Agent Maintenance Plan](./developer/future-agent-maintenance-plan.md).
- Local development: read [Getting Started](./developer/getting-started.md), then [Deployment](./developer/deployment.md).
- Product or customer context: read [Platform Overview](./end-user/platform-overview.md).
- Planning work: add new plans under [Plans](./plans/index.md), usually in `docs/plans/active/`.

## Placement Rules

- Put work plans, roadmaps, phased refactors, and cleanup checklists in `docs/plans/`.
- Put implementation details, architecture, tests, backend/frontend rules, and future-agent guidance in `docs/developer/`.
- Put internal human runbooks and launch/demo procedures in `docs/operator/`.
- Put customer-facing explanations in `docs/end-user/`.
- Move completed execution checklists from `docs/plans/active/` to `docs/plans/completed/` when they are no longer current work.

## Complete Map

## Coverage Note

The latest implementation audit refreshed central plan coverage and the movement/replay handoff notes. Future documentation upkeep should still treat broad guides and newly changed implementation areas as active audit targets, because coverage can drift as routes, Convex modules, workflows, scripts, and operator procedures change.

### Plans

- [Plans Index](./plans/index.md)
- [Movement Definitive Plan](./plans/active/movement-definitive-plan.md) — the single active plan and source of truth for current work.
- Retired and completed plans live in [docs/plans/completed/](./plans/index.md#retired-and-completed-plans). All previous plans were retired on 2026-07-20 to start fresh; they are historical reference only.

### Developer

- [Developer Index](./developer/index.md)
- [Getting Started](./developer/getting-started.md)
- [Architecture](./developer/architecture.md)
- [Frontend](./developer/frontend.md)
- [Backend](./developer/backend.md)
- [Deployment](./developer/deployment.md)
- [Future Agent Maintenance Plan](./developer/future-agent-maintenance-plan.md)
- [Assistant Chat](./developer/assistant-chat.md)
- [Administration](./developer/administration.md)
- [Company And User Management](./developer/company-user-management.md)
- [Data Retention And Purges](./developer/data-retention-and-purges.md)
- [Email Branding](./developer/email-branding.md)
- [Route Protection And Authentication](./developer/route-protection-and-authentication.md)
- [Shared Admin UI](./developer/shared-admin-ui.md)
- [AI Administration](./developer/ai-administration.md)
- [AI Rules And Prompts](./developer/ai-rules-and-prompts.md)
- [AI Models, Providers, And Costs](./developer/ai-models-providers-and-costs.md)
- [AI Tools And Connectors](./developer/ai-tools-and-connectors.md)
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
- [App Kit And Launch Plan Implementation](./developer/app-kit-launch-plan-implementation.md)
- [App Kits Interface Simplification Plan](./developer/app-kits-interface-simplification-plan.md)
- [Agent Release Infrastructure](./developer/agent-release-infrastructure.md)
- [Launch, Releases, And Observability](./developer/launch-releases-and-observability.md)
- [Maintenance Scripts](./developer/maintenance-scripts.md)
- [Organization And Company Workspaces](./developer/organization-and-company-workspaces.md)
- [Platform Operations Settings](./developer/platform-operations-settings.md)
- [Platform Plans And Quotas](./developer/platform-plans-and-quotas.md)
- [Public API And Webhooks](./developer/public-api-and-webhooks.md)
- [Run Observatory](./developer/run-observatory.md)
- [System Health And Platform Alerts](./developer/system-health-and-platform-alerts.md)
- [System Settings And Branding](./developer/system-settings-and-branding.md)
- [Temporary Posture Studio Demo](./developer/temporary-posture-studio-demo.md)
- [White-Label Packaging Data Builders](./developer/white-label-packaging-data-builders.md)
- [Workflow Automation](./developer/workflow-automation.md)
- [Workflow Runtime Internals](./developer/workflow-runtime-internals.md)
- [Property Research And Board Reports](./developer/property-research-and-reports.md)
- [Product Extension Guide](./developer/product-extension-guide.md)
- [Upload And Knowledge Policy](./developer/upload-and-knowledge-policy.md)
- [AI Provider Tool Extension](./developer/ai-provider-tool-extension.md)
- [Agent Skill Authoring Guide](./developer/agent-skill-authoring-guide.md)
- [Agentic Starter Framework Overview](./developer/agentic-starter-framework-overview.md)
- [New Agentic App Setup Checklist](./developer/new-agentic-app-setup-checklist.md)
- [Starter App Template Checklist](./developer/starter-app-template-checklist.md)

#### Required Movement Mirror Methodology

Before changing movement-side behaviour, read **[Movement Mirror And Side-Ownership Contract](./developer/movement-mirror-and-side-ownership-contract.md)**. Instructor motion is anatomical identity; player-avatar motion is anatomical opposite; the instructor and player avatar must finish on the same anatomical movement. Preview mirroring, coordinate reflection, side ownership, and scoring correspondence are separate decisions.

#### Required Movement Plan

Before changing movement capture, Replay Studio, or Game Studio behaviour, read **[Movement Definitive Plan](./plans/active/movement-definitive-plan.md)**. It defines the two goals (capture countdown with full-body walk-back gate; correct avatar/instructor motion in Replay and Game), the two-part acceptance (automated Replay/Game comparison passing on current schema-v3 recordings plus browser-visible confirmation), and the capture-screen rules that must never regress. Retired background on the repair-loop discipline lives in [docs/plans/completed/](./plans/index.md#retired-and-completed-plans); treat Game Studio live-camera checks as final confirmation rather than primary diagnosis.

- [Movement Tracking](./developer/movement-tracking.md)
- [Movement Demo Client Recovery Plan](./developer/movement-demo-client-recovery-plan.md)
- [Movement Demo Game And Replay Parity Plan](./developer/movement-demo-game-replay-parity-plan.md)
- [Movement Demo Replay Lab Plan](./developer/movement-demo-replay-lab-plan.md)
- **[Movement Mirror And Side-Ownership Contract — required](./developer/movement-mirror-and-side-ownership-contract.md)**
- [Movement Demo Retargeting Approach](./developer/movement-demo-retargeting-approach.md)
- [Movement Studio And Replay Unification Plan](./developer/movement-studio-replay-unification-plan.md)
- [Movement Studio Reward Presentation Fix Plan](./developer/movement-studio-reward-presentation-fix-plan.md)
- [Movement Studio VrmAvatar Inventory](./developer/movement-studio-vrm-avatar-inventory.md)

### Operator

- [Operator Index](./operator/index.md)
- [Developer Ship Checks Operator Guide](./operator/developer-ship-checks-operator-guide.md)
- [Local Demo Seed Runbook](./operator/local-demo-seed-runbook.md)
- [Local Test Auth Runbook](./operator/local-test-auth-runbook.md)
- [White-Label Packaging Operator Guide](./operator/white-label-packaging-operator-guide.md)
- [Vertical App Packaging Checklist](./operator/vertical-app-packaging-checklist.md)
- [Movement Demo Pitch Runbook](./operator/movement-demo-pitch-runbook.md)
- [Movement Demo Manual Smoke Checklist](./operator/movement-demo-manual-smoke-checklist.md)
- [Movement Demo Live Rehearsal Notes Template](./operator/movement-demo-live-rehearsal-notes-template.md)
- [Movement Demo Presenter Card](./operator/movement-demo-presenter-card.md)

### End User

- [End User Index](./end-user/index.md)
- [Platform Overview](./end-user/platform-overview.md)
- [Login, Access, And Authentication](./end-user/login-access-and-authentication.md)
- [Assistant Chat](./end-user/assistant-chat.md)
- [Administration](./end-user/administration.md)
- [AI Administration](./end-user/ai-administration.md)
- [AI Rules And Prompts](./end-user/ai-rules-and-prompts.md)
- [AI Models, Providers, And Costs](./end-user/ai-models-providers-and-costs.md)
- [AI Tools And Connectors](./end-user/ai-tools-and-connectors.md)
- [Agents](./end-user/agents.md)
- [Agent Setup And Configuration](./end-user/agent-setup-and-configuration.md)
- [Agent Operations And Review](./end-user/agent-operations-and-review.md)
- [Auxiliary App Experiences](./end-user/auxiliary-app-experiences.md)
- [Embedded Widgets](./end-user/embedded-widgets.md)
- [Knowledge Management](./end-user/knowledge-management.md)
- [Launch, Releases, And Observability](./end-user/launch-releases-and-observability.md)
- [App Kit Launch Plans](./end-user/app-kit-launch-plans.md)
- [Release Review And Run Observatory](./end-user/release-review-and-run-observatory.md)
- [Organization And Company Workspaces](./end-user/organization-and-company-workspaces.md)
- [Company Workspace Administration](./end-user/company-workspace-administration.md)
- [Platform Plans And Quotas](./end-user/platform-plans-and-quotas.md)
- [Platform Operations Settings](./end-user/platform-operations-settings.md)
- [System Health And Maintenance](./end-user/system-health-and-maintenance.md)
- [Operational Diagnostics And Retention](./end-user/operational-diagnostics-and-retention.md)
- [Public API And Webhooks](./end-user/public-api-and-webhooks.md)
- [Widget Handoff And Troubleshooting](./end-user/widget-handoff-and-troubleshooting.md)
- [Temporary Posture Studio Demo](./end-user/temporary-posture-studio-demo.md)
- [Workflow Automation](./end-user/workflow-automation.md)
- [Property Research And Board Reports](./end-user/property-research-and-reports.md)
