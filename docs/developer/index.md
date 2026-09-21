# Developer Documentation

Developer docs are for coding agents and engineers working on Hakken. They cover setup, architecture, implementation boundaries, quality gates, and future-agent handoff context.

For the product vision and strategy behind the work, read [PRODUCT.md](../../PRODUCT.md). It is the single source of truth for what Hakken is.

The current cross-cutting implementation notes cover provider-neutral assistant streaming, real-time spoken channels, inbound phone calls, the receptionist screen, the connected Gmail mailbox, tool-server connection/discovery/import/execution boundaries, photo actions, tasks and in-app notifications, hybrid knowledge retrieval and bulk ingestion, the company Wiki page layer, diary, unanswered-demand queue and staff agents, workflow retry safety, rehearsal evals, personal/company/agent memory, self-improvement switches, widget quota privacy, widget embed-pass enforcement, maintenance connection probes, Sentry integration, screen-kit enforcement, theme-token enforcement, and retention/purge ownership.

## Core Guides

- [Product Setup After Cloning](../operator/product-setup.md)
- [Optional Stripe Billing](../operator/stripe-billing.md)
- [Generate a Product Feature](./feature-generator.md)
- [Product Recipes](./product-recipes.md)
- [Reviewed Framework Updates](../operator/framework-updates.md)
- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Frontend](./frontend.md)
- [Backend](./backend.md)
- [Deployment](./deployment.md)
- [Future Agent Maintenance Plan](./future-agent-maintenance-plan.md)
- [Function And Feature Coverage Matrix](./function-and-feature-coverage-matrix.md)
- [Route Reference](./route-reference.md)
- [Convex API And Schema Reference](./convex-api-and-schema-reference.md)
- [Convex Environment Variables Reference](./convex-environment-variables.md)
- [Operational Scripts Reference](./operational-scripts-reference.md)

## Product Areas

- [Assistant Chat](./assistant-chat.md)
- [Public Website](./public-website.md)
- [Governance And Trust](./governance-and-trust.md)
- Sales Data Workspace (not included in this copy)
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
- Temporary Posture Studio Demo (not included in this copy)
- [Workflow Automation](./workflow-automation.md)
- [Workflow Runtime Internals](./workflow-runtime-internals.md)
- Property Research And Board Reports (not included in this copy)
- Sales And Board Reports (not included in this copy)

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

**Required mirror methodology:** read Movement Mirror And Side-Ownership Contract (not included in this copy) before any work involving left/right landmarks, instructor or player display preparation, scoring correspondence, retargeting, head/spine direction, hands, face, root motion, or avatar proof. Instructor motion preserves anatomical side, the human player imitates with the opposite side, and the player avatar reverses the player so both rendered avatars perform the same anatomical movement.

- Movement Tracking (not included in this copy)
- Movement Demo Client Recovery Plan (not included in this copy)
- Movement Demo Game And Replay Parity Plan (not included in this copy)
- Movement Demo Replay Lab Plan (not included in this copy)
- **Movement Mirror And Side-Ownership Contract — required (not included in this copy)**
- Movement Demo Retargeting Approach (not included in this copy)
- Movement Studio And Replay Unification Plan (not included in this copy)
- Movement Studio Reward Presentation Fix Plan (not included in this copy)
- Movement Studio VrmAvatar Inventory (not included in this copy)

## Coverage Status

The 2026-07-30 documentation coverage audit found no high-priority missing developer guide pair for the main routed product families, non-generated Convex module families, schema-backed platform areas, shared frontend modules, or operator-facing scripts reviewed in that pass. It did find stale index coverage for active plans, which is now tracked in [Documentation Coverage Audit](../plans/active/documentation-coverage-audit.md).

Future documentation upkeep should still treat newly changed implementation areas and active plans as audit targets. Coverage can drift when routes, Convex modules, workflows, scripts, settings, public website pages, or operator procedures change.

## Tooling Notes

`knip` checks for orphaned files and, since 2026-08-26, unused and unlisted
dependencies. Both halves took two goes. `ignoreDependencies` was `.*`, which
switched dependency analysis off in the config; narrowing it that morning
changed nothing, because `check:orphans` passed `--include files`, and that
flag excludes the very issue types the narrowed config had just enabled. The
script asks for `files,dependencies,unlisted` now, so the gate runs what the
config describes — a review the same afternoon is what caught the gap.

Five exceptions are named, and they are two different kinds. `tailwindcss` is
a genuinely unused-looking dependency: the CSS build uses it and import
analysis cannot see that. The other four suppress *unlisted* reports rather
than unused ones — `esbuild` and `playwright` are imported by the frozen
movement-debug scripts, and `google-auth-library` and `ws` belong to
`services/voice-relay`, which carries its own `package.json`.

Two genuinely dead dependencies — `apify-client`, replaced by the plain-fetch
`apifyRest`, and the `resend` npm package, superseded by the `@auth/core`
provider — were found by a manual run and removed. Nothing would have caught a
third until the script was fixed.
