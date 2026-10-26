---
product: Hakken
documentation_type: audience index
feature_area: developer documentation directory
audience: developer
source_repository: roninsatwork/Hakken
source_path: docs/developer/index.md
last_reviewed: '2026-10-26T15:21:11+00:00'
reviewed_against: current implementation
status: Current
---
# Developer Documentation

> **Product:** Hakken · **Document type:** audience index · **Feature area:** developer documentation directory
> **Reviewed:** 26 October 2026, 15:21:11 GMT (Europe/London)
> **Source path:** `docs/developer/index.md` · **Status:** Current

Developer docs are for coding agents and engineers working on Hakken. They cover setup, architecture, implementation boundaries, quality gates, and future-agent handoff context.

For the product vision and strategy behind the work, read [PRODUCT.md](../../PRODUCT.md). It is the single source of truth for what Hakken is.

The current cross-cutting implementation notes cover provider-neutral assistant streaming, real-time spoken channels, inbound phone calls, the receptionist screen, the retained Gmail retirement note, tool-server connection/discovery/import/execution boundaries, photo actions, tasks and in-app notifications, hybrid knowledge retrieval and bulk ingestion, the company Wiki page layer, diary, unanswered-demand queue and staff agents, workflow retry safety, rehearsal evals, personal/company/agent memory, self-improvement switches, widget quota privacy, widget embed-pass enforcement, maintenance connection probes, Sentry integration, screen-kit enforcement, theme-token enforcement, and retention/purge ownership.

## Core Guides

- [Backlink Reports](./backlink-reports.md) — list passes, projections, group parts and replacement
- [AI Visibility Reports](./ai-visibility-reports.md) — maintained list summaries, app projections and demand
- [AI Questions And Saved Answers](./ai-questions-and-answers.md) — membership guards, text indexes and lifecycle
- [Google Search Tracking And Fan-Out Queries](./google-search-tracking.md) — holding scope, mutations, request reuse and evidence
- [Organic Keywords And Pages](./organic-keywords-and-pages.md) — tenant access, compact lists, record reads and filing
- [Credit Ledger And Usage](./credit-ledger-and-usage.md) — pricing, batch accounting, hooks and customer projections


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

- [Data Collection Operations](./collection-operations.md)
- [Google Analytics](./google-analytics.md)
- [Search Console](./search-console.md)
- [Bing Webmaster](./bing-webmaster.md)
- [Websites And Visibility](./websites-and-visibility.md)
- [Keyword Research](./keyword-research.md)
- [Insights Findings](./insights-findings.md)
- [Microsoft Clarity](./microsoft-clarity.md)
- [Hakken Tasks](./hakken-tasks.md)
- [Telegram](./telegram.md)
- [Reading Room](./reading-room.md)

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
- [Content Translation](./content-translation.md) — source fingerprints, English fallback, bounded sweeps and recovery limits.
- [Gmail Mailbox — retired](./gmail-mailbox.md)
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

- [Technical Site Audit](./technical-site-audit.md)

- [Local Business Profiles And Listings](./local-business-profiles.md)

- [Local Maps And Market](./local-maps-and-market.md)

- [Review Intelligence](./review-intelligence.md)

- [Paid Search Reports](./paid-search-reports.md)

- [Web Mention Monitoring](./web-mention-monitoring.md)

- [Brand Radar](./brand-radar.md)

- [Competitor Discovery And Content Gaps](./competitor-discovery-and-gaps.md)

- [Website Assets And Suggested Drafts](./website-assets-and-drafts.md)

- [Insights Reports And Exports](./insights-reports-and-exports.md)

- [Insights Strategy And Planning](./insights-strategy-and-planning.md)

- [Insights Measurement And Enquiries](./insights-measurement-and-enquiries.md)

- [Page Reviews, Funnel And Experiments](./page-reviews-and-experiments.md)

- [Competing Pages And Search Ownership](./competing-pages-and-search-ownership.md)

- [Page Decisions And Create Candidates](./page-decisions-and-create-candidates.md)

- [Insights Leaderboards](./insights-leaderboards.md)

- [AI Search Growth And Buyer Questions](./ai-search-growth-and-buyer-questions.md)

## Additional Reviewed Guides

- [Insights Track Record](./insights-track-record.md) — finding outcomes, observed changes and campaign evidence.
- [Reading Room Readership Analytics](./reading-room-readership-analytics.md) — internal engagement counts and interpretation.
- [News Collector And Editorial Recovery](./news-collector-and-editorial-recovery.md) — bounded imports, costs, cursors and retention.

## Further References

- [Drawing and building screens — read before either](./drawing-guide.md)

## Coverage Status

The [central documentation inventory](../index.md#documentation-coverage-inventory)
records actual source review times, evidence, scope and the current queue. The known
89-unit documentation inventory was completed on 26 October 2026; this is not live
integration acceptance or an exhaustive guarantee about every behavior in the repository.
New source changes can create new work. Older documentation audits and plans are dated
records and do not override that current coverage record.

For command/dependency verification, use [Operational scripts](./operational-scripts-reference.md),
[Getting started](./getting-started.md) and [Deployment](./deployment.md). The future-agent
maintenance and secondary-tabs plans are historical/planned references, preserved unchanged.
Their old movement/module assumptions are not current product availability.
