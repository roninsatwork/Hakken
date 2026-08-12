# Route Reference

Last reviewed: 2026-08-08 12:10 BST +0100
Status: current route inventory
Audience: engineers and agents changing Sonae routing, navigation, page ownership, or documentation coverage.

## Purpose

This reference maps every implemented Next.js route family to its product
purpose and owning documentation. It is intentionally route-focused. For feature
semantics, read the linked product or developer guide. For backend function and
schema ownership, read [Convex API And Schema Reference](./convex-api-and-schema-reference.md).

When adding, removing, renaming, or splitting a route, update this file, the
relevant audience guide, and [Function And Feature Coverage Matrix](./function-and-feature-coverage-matrix.md)
in the same documentation pass.

## Public And Auth Routes

| Route | Source | Purpose | Owning docs |
| --- | --- | --- | --- |
| `/` | `src/app/(public)/page.tsx` | Public pre-login home page. | [Public Website](../end-user/public-website.md), [Public Website Developer Guide](./public-website.md) |
| `/login` | `src/app/login/page.tsx` | Sign-in screen. | [Login, Access, And Authentication](../end-user/login-access-and-authentication.md), [Route Protection And Authentication](./route-protection-and-authentication.md) |
| `/verify` | `src/app/verify/page.tsx` | Magic-link consent confirmation page. | [Login, Access, And Authentication](../end-user/login-access-and-authentication.md), [Route Protection And Authentication](./route-protection-and-authentication.md) |
| `/local-test-auth` | `src/app/local-test-auth/page.tsx` | Local deterministic auth helper. | [Local Test Auth Runbook](../operator/local-test-auth-runbook.md) |
| `/w/[widgetId]` | `src/app/w/[widgetId]/page.tsx` | Public embedded widget runtime. | [Embedded Widgets](../end-user/embedded-widgets.md), [Embedded Widgets Developer Guide](./embedded-widgets.md) |
| `/sandbox/[widgetId]` | `src/app/sandbox/[widgetId]/page.tsx` | Widget sandbox host page. | [Widget Handoff And Troubleshooting](../end-user/widget-handoff-and-troubleshooting.md), [Embedded Widgets Developer Guide](./embedded-widgets.md) |
| `/api/health` | `src/app/api/health/route.ts` | HTTP health route. | [System Health And Platform Alerts](./system-health-and-platform-alerts.md) |
| `/api/email-preview` | `src/app/api/email-preview/route.ts` | Dev-only email template preview and raw source route. | [Email System](./email-system.md) |
| `/api/e2e-auth` | `src/app/api/e2e-auth/route.ts` | Deterministic E2E auth route. | Test-only route; see auth docs before changing. |
| `/api/e2e-fixture/face-proof` | `src/app/api/e2e-fixture/face-proof/route.ts` | Test fixture route for movement proof. | Movement docs and E2E tests. |
| `/api/e2e-fixture/hand-proof` | `src/app/api/e2e-fixture/hand-proof/route.ts` | Test fixture route for movement proof. | Movement docs and E2E tests. |

## Authenticated App Routes

| Route | Purpose | Owning docs |
| --- | --- | --- |
| `/app` | Authenticated app landing/dashboard handoff. | [Sonae Product Overview](../end-user/platform-overview.md), [Frontend Development](./frontend.md) |
| `/app/assistant` | Assistant landing/new conversation surface. | [Assistant Chat User Guide](../end-user/assistant-chat.md), [Assistant Chat Developer Guide](./assistant-chat.md) |
| `/app/assistant/[threadId]` | Existing assistant thread view. | [Assistant Chat User Guide](../end-user/assistant-chat.md), [Assistant Chat Developer Guide](./assistant-chat.md) |
| `/app/profile` | User profile settings. | [Organization And Company Workspaces](../end-user/organization-and-company-workspaces.md), [Company And User Management](./company-user-management.md) |
| `/app/settings` | Tenant admin organization dashboard. | [Organization And Company Workspaces](../end-user/organization-and-company-workspaces.md), [Organization And Company Workspaces Developer Guide](./organization-and-company-workspaces.md) |
| `/app/settings/team` | Tenant team management. | [Company Workspace Administration](../end-user/company-workspace-administration.md), [Company And User Management](./company-user-management.md) |
| `/app/settings/auth-diagnostics` | Tenant-facing auth diagnostics. | [Operational Diagnostics And Retention](../end-user/operational-diagnostics-and-retention.md), [Auth Diagnostics](./auth-diagnostics.md) |
| `/app/properties/information` | Property research explanation page. | [Property Research And Board Reports](../end-user/property-research-and-reports.md), [Property Research And Board Reports Developer Guide](./property-research-and-reports.md) |
| `/app/properties/search` | Rightmove/property collection search. | [Property Research And Board Reports](../end-user/property-research-and-reports.md), [Property Research And Board Reports Developer Guide](./property-research-and-reports.md) |
| `/app/properties/scraped-data` | Stored scraped property list. | [Property Research And Board Reports](../end-user/property-research-and-reports.md), [Property Research And Board Reports Developer Guide](./property-research-and-reports.md) |
| `/app/properties/scraped-data/[id]` | Stored property detail page. | [Property Research And Board Reports](../end-user/property-research-and-reports.md), [Property Research And Board Reports Developer Guide](./property-research-and-reports.md) |
| `/app/properties/logs` | Property extraction run log. | [Property Research And Board Reports](../end-user/property-research-and-reports.md), [Property Research And Board Reports Developer Guide](./property-research-and-reports.md) |
| `/app/reports/information` | Reports explanation page. | [Sales And Board Reports](../end-user/sales-and-board-reports.md), [Sales And Board Reports Developer Guide](./sales-and-board-reports.md) |
| `/app/reports` | Sales or board report workflow. | [Sales And Board Reports](../end-user/sales-and-board-reports.md), [Sales And Board Reports Developer Guide](./sales-and-board-reports.md) |
| `/app/governance` | Workspace governance overview. | [Governance And Trust](../end-user/governance-and-trust.md), [Governance And Trust Developer Guide](./governance-and-trust.md) |
| `/app/governance/register` | Workspace AI register. | [Governance And Trust](../end-user/governance-and-trust.md), [Governance And Trust Developer Guide](./governance-and-trust.md) |
| `/app/governance/policies` | Workspace active-policy view. | [Governance And Trust](../end-user/governance-and-trust.md), [Governance And Trust Developer Guide](./governance-and-trust.md) |
| `/app/governance/audit-trail` | Workspace audit trail. | [Governance And Trust](../end-user/governance-and-trust.md), [Governance And Trust Developer Guide](./governance-and-trust.md) |
| `/app/[workspace]/spreadsheet-import` | Workspace workbook upload and worksheet mapping. | [Sales Data Workspace](../end-user/sales-data-workspace.md), [Sales Data Workspace Developer Guide](./sales-data-workspace.md) |
| `/app/[workspace]/import-data` | Workspace imported sales-data table browser. | [Sales Data Workspace](../end-user/sales-data-workspace.md), [Sales Data Workspace Developer Guide](./sales-data-workspace.md) |
| `/app/[workspace]/customers` | Workspace customer/prospect list. | [Sales Data Workspace](../end-user/sales-data-workspace.md), [Sales Data Workspace Developer Guide](./sales-data-workspace.md) |
| `/app/[workspace]/customers/[account]` | Workspace customer/prospect profile. | [Sales Data Workspace](../end-user/sales-data-workspace.md), [Sales Data Workspace Developer Guide](./sales-data-workspace.md) |
| `/app/[workspace]/opportunity-report` | Workspace opportunity report. | [Sales Data Workspace](../end-user/sales-data-workspace.md), [Sales And Board Reports](../end-user/sales-and-board-reports.md), [Sales Data Workspace Developer Guide](./sales-data-workspace.md) |
| `/app/sales-data` | Legacy Sales Data redirect. | [Sales Data Workspace](../end-user/sales-data-workspace.md), [Sales Data Workspace Developer Guide](./sales-data-workspace.md) |
| `/app/sales-data/import` | Legacy Sales Data import redirect. | [Sales Data Workspace](../end-user/sales-data-workspace.md), [Sales Data Workspace Developer Guide](./sales-data-workspace.md) |
| `/app/arcade/ronins-run` | Ronin's Run arcade experience. | [Auxiliary App Experiences](../end-user/auxiliary-app-experiences.md), [Auxiliary App Experiences Developer Guide](./auxiliary-app-experiences.md) |
| `/app/agentic-testing` | Agentic testing sandbox. | [Auxiliary App Experiences](../end-user/auxiliary-app-experiences.md), [Auxiliary App Experiences Developer Guide](./auxiliary-app-experiences.md) |

## Admin Root And Companies

| Route | Purpose | Owning docs |
| --- | --- | --- |
| `/admin` | Super-admin dashboard. | [Administration User Guide](../end-user/administration.md), [Administration Developer Guide](./administration.md) |
| `/admin/directory` | Read-only platform user directory. | [Administration User Guide](../end-user/administration.md), [Administration Developer Guide](./administration.md) |
| `/admin/companies` | Company list and management. | [Administration User Guide](../end-user/administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/companies/[id]` | Company detail redirect/root. | [Company Workspace Administration](../end-user/company-workspace-administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/companies/[id]/overview` | Company overview. | [Company Workspace Administration](../end-user/company-workspace-administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/companies/[id]/users` | Company user management. | [Company Workspace Administration](../end-user/company-workspace-administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/companies/[id]/invites` | Company invitation management. | [Company Workspace Administration](../end-user/company-workspace-administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/companies/[id]/directory` | Company directory shell. | [Company Workspace Administration](../end-user/company-workspace-administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/companies/[id]/directory/users` | Directory user list. | [Company Workspace Administration](../end-user/company-workspace-administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/companies/[id]/directory/invites` | Directory invitation list. | [Company Workspace Administration](../end-user/company-workspace-administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/companies/[id]/chat-logs` | Company chat-log review. | [AI Administration](../end-user/ai-administration.md), [AI Administration Developer Guide](./ai-administration.md) |
| `/admin/companies/[id]/knowledge` | Company knowledge management. | [Knowledge Management](../end-user/knowledge-management.md), [Knowledge Management Developer Guide](./knowledge-management.md) |
| `/admin/companies/[id]/models` | Company model defaults. | [AI Models, Providers, And Costs](../end-user/ai-models-providers-and-costs.md), [AI Models, Providers, And Costs Developer Guide](./ai-models-providers-and-costs.md) |
| `/admin/companies/[id]/system-prompt` | Company prompt editor. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/companies/[id]/rules` and children | Company AI rules. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/companies/[id]/rules/new` | New company AI rule. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/companies/[id]/rules/[ruleId]` | Company AI rule detail/edit. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/companies/[id]/widget` | Company widget configuration. | [Embedded Widgets](../end-user/embedded-widgets.md), [Embedded Widgets Developer Guide](./embedded-widgets.md) |

## Company AI Routes

| Route | Purpose | Owning docs |
| --- | --- | --- |
| `/admin/companies/[id]/ai` | Company AI readiness overview. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/prompt` | Company instructions. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/companies/[id]/ai/models` | Company model routing/defaults. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [AI Models, Providers, And Costs Developer Guide](./ai-models-providers-and-costs.md) |
| `/admin/companies/[id]/ai/rules` and children | Company AI rules. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/companies/[id]/ai/knowledge` and document detail | Company knowledge. | [Knowledge Management](../end-user/knowledge-management.md), [Knowledge Management Developer Guide](./knowledge-management.md) |
| `/admin/companies/[id]/ai/chat-logs` | Company chat logs. | [AI Administration](../end-user/ai-administration.md), [AI Administration Developer Guide](./ai-administration.md) |
| `/admin/companies/[id]/ai/chat-logs/[threadId]/evals/new` | Create a company check from a chat thread. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/chat-logs/[threadId]/memory-candidate/new` | Create a memory candidate from a chat thread. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/evals` and children | Company checks and check results. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/evals/new` | New company check. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/evals/[evalCaseId]` | Company check detail/results. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/evals/[evalCaseId]/edit` | Company check edit. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/memory` | Company memories and memory suggestions. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/skills` and children | Company skills. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/skills/new` | New company skill. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [Company AI Readiness And Checks Developer Guide](./company-ai-readiness-and-checks.md) |
| `/admin/companies/[id]/ai/knowledge/[documentId]` | Company knowledge document detail. | [Knowledge Management](../end-user/knowledge-management.md), [Knowledge Management Developer Guide](./knowledge-management.md) |
| `/admin/companies/[id]/ai/rules/new` | New company AI rule in Company AI area. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/companies/[id]/ai/rules/[ruleId]` | Company AI rule detail/edit in Company AI area. | [Company AI Readiness And Checks](../end-user/company-ai-readiness-and-checks.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/companies/[id]/ai/usage` | Company AI usage. | [AI Models, Providers, And Costs](../end-user/ai-models-providers-and-costs.md), [AI Administration Developer Guide](./ai-administration.md) |

## Global AI Routes

| Route | Purpose | Owning docs |
| --- | --- | --- |
| `/admin/ai` | Global AI landing. | [AI Administration](../end-user/ai-administration.md), [AI Administration Developer Guide](./ai-administration.md) |
| `/admin/ai/costs`, `/admin/ai/usage/costs` | Global AI cost analytics. | [AI Models, Providers, And Costs](../end-user/ai-models-providers-and-costs.md), [AI Models, Providers, And Costs Developer Guide](./ai-models-providers-and-costs.md) |
| `/admin/ai/chat-logs`, `/admin/ai/usage/chat-logs` | Global chat-log review. | [AI Administration](../end-user/ai-administration.md), [AI Administration Developer Guide](./ai-administration.md) |
| `/admin/ai/system-prompt` | Global system prompt. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/ai/rules` | Global AI rules. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/ai/rules/new` | New global AI rule. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/ai/rules/[id]` | Global AI rule detail/edit. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [AI Rules And Prompts Developer Guide](./ai-rules-and-prompts.md) |
| `/admin/ai/global-knowledge`, `/admin/ai/knowledge` | Global knowledge. | [Knowledge Management](../end-user/knowledge-management.md), [Knowledge Management Developer Guide](./knowledge-management.md) |
| `/admin/ai/widget` | Global widget configuration. | [Embedded Widgets](../end-user/embedded-widgets.md), [Embedded Widgets Developer Guide](./embedded-widgets.md) |
| `/admin/ai/models` and children | Model catalogue, providers, defaults, detail. | [AI Models, Providers, And Costs](../end-user/ai-models-providers-and-costs.md), [AI Models, Providers, And Costs Developer Guide](./ai-models-providers-and-costs.md) |
| `/admin/ai/models/catalogue` | Model catalogue. | [AI Models, Providers, And Costs](../end-user/ai-models-providers-and-costs.md), [AI Models, Providers, And Costs Developer Guide](./ai-models-providers-and-costs.md) |
| `/admin/ai/models/providers` | Provider settings. | [AI Models, Providers, And Costs](../end-user/ai-models-providers-and-costs.md), [AI Models, Providers, And Costs Developer Guide](./ai-models-providers-and-costs.md) |
| `/admin/ai/models/defaults` | Model defaults. | [AI Models, Providers, And Costs](../end-user/ai-models-providers-and-costs.md), [AI Models, Providers, And Costs Developer Guide](./ai-models-providers-and-costs.md) |
| `/admin/ai/models/[id]` | Model detail. | [AI Models, Providers, And Costs](../end-user/ai-models-providers-and-costs.md), [AI Models, Providers, And Costs Developer Guide](./ai-models-providers-and-costs.md) |
| `/admin/ai/tools` and children | Tool catalogue and connectors. | [AI Tools And Connectors](../end-user/ai-tools-and-connectors.md), [AI Tools And Connectors Developer Guide](./ai-tools-and-connectors.md) |
| `/admin/ai/tools/new` | New AI tool. | [AI Tools And Connectors](../end-user/ai-tools-and-connectors.md), [AI Tools And Connectors Developer Guide](./ai-tools-and-connectors.md) |
| `/admin/ai/tools/[id]` | AI tool detail/edit. | [AI Tools And Connectors](../end-user/ai-tools-and-connectors.md), [AI Tools And Connectors Developer Guide](./ai-tools-and-connectors.md) |
| `/admin/ai/tools/connectors/[id]` | Tool connector detail. | [AI Tools And Connectors](../end-user/ai-tools-and-connectors.md), [AI Tools And Connectors Developer Guide](./ai-tools-and-connectors.md) |
| `/admin/ai/skills` | Skill Center alias/surface. | [Agent Setup And Configuration](../end-user/agent-setup-and-configuration.md), [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md) |

## Governance Routes

| Route | Purpose | Owning docs |
| --- | --- | --- |
| `/admin/governance` | Platform governance overview. | [Governance And Trust](../end-user/governance-and-trust.md), [Governance And Trust Developer Guide](./governance-and-trust.md) |
| `/admin/governance/register` | Platform AI register. | [Governance And Trust](../end-user/governance-and-trust.md), [Governance And Trust Developer Guide](./governance-and-trust.md) |
| `/admin/governance/policies` | Platform active-policy view. | [Governance And Trust](../end-user/governance-and-trust.md), [Governance And Trust Developer Guide](./governance-and-trust.md) |
| `/admin/governance/audit-trail` | Platform audit trail with filters and export. | [Governance And Trust](../end-user/governance-and-trust.md), [Governance And Trust Developer Guide](./governance-and-trust.md) |
| `/admin/governance/audit-trail/[id]` | Governance audit event detail. | [Governance And Trust](../end-user/governance-and-trust.md), [Audit Log Service](./audit-log-service.md) |
| `/admin/governance/approvals` | Governance-facing agent approvals queue. | [Governance And Trust](../end-user/governance-and-trust.md), [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Agent Runtime Operations](./agent-runtime-operations.md) |

## Agent Routes

| Route | Purpose | Owning docs |
| --- | --- | --- |
| `/admin/agents` | Agent list and creation. | [Agents](../end-user/agents.md), [Agents Developer Guide](./agents.md) |
| `/admin/agents/new` | New agent creation screen. | [Agent Setup And Configuration](../end-user/agent-setup-and-configuration.md), [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md) |
| `/admin/agents/skills` | Skill Center. | [Agent Setup And Configuration](../end-user/agent-setup-and-configuration.md), [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md) |
| `/admin/agents/[id]` | Agent detail overview. | [Agent Setup And Configuration](../end-user/agent-setup-and-configuration.md), [Agents Developer Guide](./agents.md) |
| `/admin/agents/[id]/settings` | Agent settings. | [Agent Setup And Configuration](../end-user/agent-setup-and-configuration.md), [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md) |
| `/admin/agents/[id]/interfaces` | Agent interfaces. | [Agent Setup And Configuration](../end-user/agent-setup-and-configuration.md), [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md) |
| `/admin/agents/[id]/system-prompt` | Agent prompt. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [Agents Developer Guide](./agents.md) |
| `/admin/agents/[id]/rules` and children | Agent rules. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [Agents Developer Guide](./agents.md) |
| `/admin/agents/[id]/rules/new` | New agent rule. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [Agents Developer Guide](./agents.md) |
| `/admin/agents/[id]/rules/[ruleId]` | Agent rule detail/edit. | [AI Rules And Prompts](../end-user/ai-rules-and-prompts.md), [Agents Developer Guide](./agents.md) |
| `/admin/agents/[id]/skills` | Agent-bound skills. | [Agent Setup And Configuration](../end-user/agent-setup-and-configuration.md), [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md) |
| `/admin/agents/[id]/knowledge` | Agent knowledge. | [Knowledge Management](../end-user/knowledge-management.md), [Knowledge Management Developer Guide](./knowledge-management.md) |
| `/admin/agents/[id]/memory` | Agent memory review. | [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| `/admin/agents/[id]/runs` | Agent run history. | [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| `/admin/agents/[id]/observability` and run detail | Agent observability and job detail. | [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Run Observatory Developer Guide](./run-observatory.md) |
| `/admin/agents/[id]/observability/[runId]` | Agent observability run detail. | [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Run Observatory Developer Guide](./run-observatory.md) |
| `/admin/agents/[id]/logs` and log detail | Raw agent logs. | [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| `/admin/agents/[id]/logs/[logId]` | Raw agent log detail. | [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| `/admin/agents/[id]/evals` and fixture detail | Agent checks/evals. | [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| `/admin/agents/[id]/evals/[fixtureId]` | Agent check fixture detail. | [Agent Operations And Review](../end-user/agent-operations-and-review.md), [Agent Runtime Operations](./agent-runtime-operations.md) |

## Workflow, Settings, Operations, And Users

| Route | Purpose | Owning docs |
| --- | --- | --- |
| `/admin/workflows` and workflow detail | Workflow builder and workflow records. | [Workflow Automation](../end-user/workflow-automation.md), [Workflow Automation Developer Guide](./workflow-automation.md) |
| `/admin/workflows/[id]` | Workflow detail/builder. | [Workflow Automation](../end-user/workflow-automation.md), [Workflow Automation Developer Guide](./workflow-automation.md) |
| `/admin/workflows/executions` and detail | Workflow run review. | [Workflow Automation](../end-user/workflow-automation.md), [Workflow Runtime Internals](./workflow-runtime-internals.md) |
| `/admin/workflows/executions/[id]` | Workflow execution detail. | [Workflow Automation](../end-user/workflow-automation.md), [Workflow Runtime Internals](./workflow-runtime-internals.md) |
| `/admin/workflows/schedules` and children | Workflow schedules. | [Workflow Automation](../end-user/workflow-automation.md), [Workflow Automation Developer Guide](./workflow-automation.md) |
| `/admin/workflows/schedules/new` | New workflow schedule. | [Workflow Automation](../end-user/workflow-automation.md), [Workflow Automation Developer Guide](./workflow-automation.md) |
| `/admin/workflows/schedules/[id]` | Workflow schedule detail/edit. | [Workflow Automation](../end-user/workflow-automation.md), [Workflow Automation Developer Guide](./workflow-automation.md) |
| `/admin/settings` | Forwards to the first settings screen; also maps legacy `?tab=` links. | [Platform Operations Settings](../end-user/platform-operations-settings.md), [Platform Operations Settings Developer Guide](./platform-operations-settings.md) |
| `/admin/settings/identity` and `/admin/settings/identity/aesthetics` | Core identity and global aesthetics. | [Platform Operations Settings](../end-user/platform-operations-settings.md), [Platform Operations Settings Developer Guide](./platform-operations-settings.md) |
| `/admin/settings/security`, `/admin/settings/security/retention`, and `/admin/settings/security/purge-history` | PII masking, log-retention settings, and purge history. | [Platform Operations Settings](../end-user/platform-operations-settings.md), [Data Retention And Purges](./data-retention-and-purges.md) |
| `/admin/settings/options`, `/admin/settings/options/self-improvement`, and `/admin/settings/options/approvals` | Developer diagnostics, learning switches, and the agent approval window. | [Platform Operations Settings](../end-user/platform-operations-settings.md), [Self-Improvement Plan](../plans/active/self-improvement-plan.md) |
| `/admin/settings/plans` | Platform plans and quotas. | [Platform Plans And Quotas](../end-user/platform-plans-and-quotas.md), [Platform Plans And Quotas Developer Guide](./platform-plans-and-quotas.md) |
| `/admin/settings/api-keys` | Public API key management. | [Public API And Webhooks](../end-user/public-api-and-webhooks.md), [Public API And Webhooks Developer Guide](./public-api-and-webhooks.md) |
| `/admin/settings/analytics` | Analytics settings. | [Platform Operations Settings](../end-user/platform-operations-settings.md), [Platform Operations Settings Developer Guide](./platform-operations-settings.md) |
| `/admin/settings/scripts` and detail | Maintenance scripts. | [System Health And Maintenance](../end-user/system-health-and-maintenance.md), [Maintenance Scripts Developer Guide](./maintenance-scripts.md) |
| `/admin/settings/scripts/[scriptId]` | Maintenance script detail/run review. | [System Health And Maintenance](../end-user/system-health-and-maintenance.md), [Maintenance Scripts Developer Guide](./maintenance-scripts.md) |
| `/admin/health` | System health. | [Health](../end-user/health.md), [System Health And Platform Alerts](./system-health-and-platform-alerts.md) |
| `/admin/auth-diagnostics` | Admin auth diagnostics. | [Operational Diagnostics And Retention](../end-user/operational-diagnostics-and-retention.md), [Auth Diagnostics](./auth-diagnostics.md) |
| `/admin/audit-logs/[id]` | Audit log detail. | [Administration User Guide](../end-user/administration.md), [Audit Log Service](./audit-log-service.md) |
| `/admin/users` and children | Global users and invitations. | [Administration User Guide](../end-user/administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/users/invite` | Global user invitation. | [Administration User Guide](../end-user/administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/users/[id]` | Global user detail/edit. | [Administration User Guide](../end-user/administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/super-admins` and children | System admin management. | [Administration User Guide](../end-user/administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/super-admins/invite` | System admin invitation. | [Administration User Guide](../end-user/administration.md), [Company And User Management](./company-user-management.md) |
| `/admin/super-admins/[id]` | System admin detail/edit. | [Administration User Guide](../end-user/administration.md), [Company And User Management](./company-user-management.md) |

## Movement Demo Routes

The movement demo is frozen unless the user explicitly reopens it or a required
gate is broken. Before changing movement behavior or documentation semantics,
read [Movement Mirror And Side-Ownership Contract](./movement-mirror-and-side-ownership-contract.md)
and [Movement Definitive Plan](../plans/active/movement-definitive-plan.md).

| Route | Purpose | Owning docs |
| --- | --- | --- |
| `/demos/movements` | Posture Studio library. | [Temporary Posture Studio Demo](../end-user/temporary-posture-studio-demo.md), [Temporary Posture Studio Demo Developer Guide](./temporary-posture-studio-demo.md) |
| `/demos/movements/[id]` | Movement detail. | Movement docs and active plan. |
| `/demos/movements/[id]/play` | Movement game/play surface. | Movement docs and active plan. |
| `/demos/movements/information` | Public-facing movement info page inside app shell. | [Temporary Posture Studio Demo](../end-user/temporary-posture-studio-demo.md) |
| `/demos/movements/replay-lab` | Replay Alignment/Replay Studio. | [Movement Demo Replay Lab Plan](./movement-demo-replay-lab-plan.md), active movement plan. |
| `/demos/movements/squat-proof` | Squat proof route. | Movement proof docs and tests. |
| `/demos/movement-capture` and children | Capture, deep capture, benchmark, readiness, hand/face proof routes. | Movement docs, proof scripts, active movement plan. |
| `/demos/movement-capture/deep` | Deep movement capture route. | Movement docs, proof scripts, active movement plan. |
| `/demos/movement-capture/benchmark` | Movement benchmark route. | Movement docs, proof scripts, active movement plan. |
| `/demos/movement-capture/benchmark/device` | Movement benchmark device route. | Movement docs, proof scripts, active movement plan. |
| `/demos/movement-capture/readiness-proof` | Movement readiness proof route. | Movement docs, proof scripts, active movement plan. |
| `/demos/movement-capture/face-model-proof` | Face model proof route. | Movement docs, proof scripts, active movement plan. |
| `/demos/movement-capture/hand-model-proof` | Hand model proof route. | Movement docs, proof scripts, active movement plan. |
| `/demos/movement-capture/hand-recovery-proof` | Hand recovery proof route. | Movement docs, proof scripts, active movement plan. |
