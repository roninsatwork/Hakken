# Developer Documentation

Developer docs are for coding agents and engineers working on Sonae. They cover setup, architecture, implementation boundaries, quality gates, and future-agent handoff context.

For the product vision and strategy behind the work, read [PRODUCT.md](../../PRODUCT.md). It is the single source of truth for what Sonae is.

The current cross-cutting implementation notes cover provider-neutral assistant streaming, real-time spoken channels, inbound phone calls, the receptionist screen, the connected Gmail mailbox, tool-server connection/discovery/import/execution boundaries, photo actions, tasks and in-app notifications, hybrid knowledge retrieval and bulk ingestion, the company Wiki page layer, diary, unanswered-demand queue and staff agents, workflow retry safety, rehearsal evals, personal/company/agent memory, self-improvement switches, widget quota privacy, widget embed-pass enforcement, maintenance connection probes, Sentry integration, screen-kit enforcement, theme-token enforcement, and retention/purge ownership.

## Core Guides

- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Frontend](./frontend.md)
- [Backend](./backend.md)
- [Deployment](./deployment.md)
- [Future Agent Maintenance Plan](./future-agent-maintenance-plan.md)
- [Function And Feature Coverage Matrix](./function-and-feature-coverage-matrix.md)
- [Route Reference](./route-reference.md)
- [Convex API And Schema Reference](./convex-api-and-schema-reference.md)
- [Operational Scripts Reference](./operational-scripts-reference.md)

## Product Areas

- [Assistant Chat](./assistant-chat.md)
- [Public Website](./public-website.md)
- [Governance And Trust](./governance-and-trust.md)
- [Sales Data Workspace](./sales-data-workspace.md)
- [Administration](./administration.md)
- [Spoken Channels](./spoken-channels.md)
- [Photo Actions](./photo-actions.md)
- [Receptionist Screen](./receptionist-screen.md)
- [Tasks And Notifications](./tasks-and-notifications.md)
- [Company And User Management](./company-user-management.md)
- [Company AI Readiness And Checks](./company-ai-readiness-and-checks.md)
- [Data Retention And Purges](./data-retention-and-purges.md)
- [Email Branding](./email-branding.md)
- [Email System](./email-system.md)
- [Gmail Mailbox](./gmail-mailbox.md)
- [Route Protection And Authentication](./route-protection-and-authentication.md)
- [Tenancy Enforcement](./tenancy-enforcement.md)
- [Screen Kit](./screen-kit.md)
- [AI Administration](./ai-administration.md)
- [AI Rules And Prompts](./ai-rules-and-prompts.md)
- [AI Models, Providers, And Costs](./ai-models-providers-and-costs.md)
- [AI Tools And Connectors](./ai-tools-and-connectors.md)
- [Tool Servers](./tool-servers.md)
- [Analytics Rollups](./analytics-rollups.md)
- [Audit Log Service](./audit-log-service.md)
- [Agents](./agents.md)
- [Manage Agents Secondary Tabs UX Plan](./manage-agents-secondary-tabs-plan.md)
- [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md)
- [Agent Runtime Operations](./agent-runtime-operations.md)
- [Auth Diagnostics](./auth-diagnostics.md)
- [Auxiliary App Experiences](./auxiliary-app-experiences.md)
- [Embedded Widgets](./embedded-widgets.md)
- [Knowledge Management](./knowledge-management.md)
- [Company Wiki](./company-wiki.md)
- [Maintenance Scripts](./maintenance-scripts.md)
- [Organization And Company Workspaces](./organization-and-company-workspaces.md)
- [Platform Operations Settings](./platform-operations-settings.md)
- [Platform Plans And Quotas](./platform-plans-and-quotas.md)
- [Public API And Webhooks](./public-api-and-webhooks.md)
- [Run Observatory](./run-observatory.md)
- [System Health And Platform Alerts](./system-health-and-platform-alerts.md)
- [System Settings And Branding](./system-settings-and-branding.md)
- [Temporary Posture Studio Demo](./temporary-posture-studio-demo.md)
- [Workflow Automation](./workflow-automation.md)
- [Workflow Runtime Internals](./workflow-runtime-internals.md)
- [Property Research And Board Reports](./property-research-and-reports.md)
- [Sales And Board Reports](./sales-and-board-reports.md)

## Platform Development

- [Product Extension Guide](./product-extension-guide.md)
- [Upload And Knowledge Policy](./upload-and-knowledge-policy.md)
- [AI Provider Tool Extension](./ai-provider-tool-extension.md)
- [Agent Skill Authoring Guide](./agent-skill-authoring-guide.md)
- [Agentic Starter Framework Overview](./agentic-starter-framework-overview.md)
- [New Agentic App Setup Checklist](./new-agentic-app-setup-checklist.md)
- [Starter App Template Checklist](./starter-app-template-checklist.md)

## Movement Demo Technical Notes

The movement demo is frozen unless the user explicitly asks to reopen it or a required gate is broken.

**Required mirror methodology:** read [Movement Mirror And Side-Ownership Contract](./movement-mirror-and-side-ownership-contract.md) before any work involving left/right landmarks, instructor or player display preparation, scoring correspondence, retargeting, head/spine direction, hands, face, root motion, or avatar proof. Instructor motion preserves anatomical side, the human player imitates with the opposite side, and the player avatar reverses the player so both rendered avatars perform the same anatomical movement.

**Required Replay Studio context:** read the active [Movement Definitive Plan](../plans/active/movement-definitive-plan.md) before changing Replay Studio diagnosis, proof artifacts, avatar-follow gates, rendered fidelity thresholds, or the movement agent debugging workflow. Historical background lives in [Replay Studio Agent Repair Harness Plan](../plans/completed/replay-studio-agent-repair-harness-plan.md) and [Replay Lab Visual Acceptance Tightening Plan](../plans/completed/replay-lab-visual-acceptance-tightening-plan.md); use those for context only unless they are deliberately reopened. Replay Studio owns recorded-motion diagnosis, and Game Studio live-camera checks are final confirmation after Replay proof, not the primary debugging loop.

- [Movement Tracking](./movement-tracking.md)
- [Movement Demo Client Recovery Plan](../plans/completed/movement-demo-client-recovery-plan.md)
- [Movement Demo Game And Replay Parity Plan](../plans/completed/movement-demo-game-replay-parity-plan.md)
- [Movement Demo Replay Lab Plan](../plans/completed/movement-demo-replay-lab-plan.md)
- **[Movement Mirror And Side-Ownership Contract — required](./movement-mirror-and-side-ownership-contract.md)**
- [Movement Demo Retargeting Approach](./movement-demo-retargeting-approach.md)
- [Movement Studio And Replay Unification Plan](../plans/completed/movement-studio-replay-unification-plan.md)
- [Movement Studio Reward Presentation Fix Plan](../plans/active/movement-studio-reward-presentation-fix-plan.md)
- [Movement Studio VrmAvatar Inventory](./movement-studio-vrm-avatar-inventory.md)

## Coverage Status

The 2026-07-30 documentation coverage audit found no high-priority missing developer guide pair for the main routed product families, non-generated Convex module families, schema-backed platform areas, shared frontend modules, or operator-facing scripts reviewed in that pass. It did find stale index coverage for active plans, which is now tracked in [Documentation Coverage Audit](../plans/active/documentation-coverage-audit.md).

Future documentation upkeep should still treat newly changed implementation areas and active plans as audit targets. Coverage can drift when routes, Convex modules, workflows, scripts, settings, public website pages, or operator procedures change.

## Tooling Notes

`knip` checks for orphaned files and, since 2026-08-26, unused and unlisted
dependencies — its `ignoreDependencies` was `.*`, which switched that half of
the tool off entirely. It now names five exceptions, each with a reason:
`tailwindcss` (used by the CSS build, invisible to import analysis), `esbuild`
and `playwright` (imported by the frozen movement-debug scripts, whose
manifest entries are transitive and whose files are out of bounds), and
`google-auth-library` and `ws` (dependencies of `services/voice-relay`, which
carries its own `package.json`). Two genuinely dead dependencies found by
switching it on — `apify-client`, replaced by the plain-fetch `apifyRest`, and
the `resend` npm package, superseded by the `@auth/core` provider — were
removed the same day.
