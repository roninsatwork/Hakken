# Convex API And Schema Reference

Last reviewed: 2026-08-08 12:10 BST +0100
Status: current function-family and schema inventory
Audience: engineers and agents changing Convex functions, schema tables, authorization, data flow, or backend documentation.

## Purpose

This reference maps Convex modules and schema tables to their product ownership.
It is not a replacement for feature guides. Use it when you need to know where a
backend function family belongs before editing code or documentation.

Before editing any file under `convex/`, follow the Convex repo guardrails and
the Sonae auth/tenancy rules in `AGENTS.md`. Keep public, tenant, admin,
super-admin, and internal surfaces separate.

## Function Family Map

| Module or family | Main exported functions | Product ownership |
| --- | --- | --- |
| `agents.ts` | agent list/get/create/update/delete, templates, standing objective and behavior prompt updates, inherited model lookup, internal agent/tool lookup, inline agent creation, promotion | [Agents Developer Guide](./agents.md), [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md) |
| `agentRuntime.ts` | `runAgentObjective`, `continueAgentObjective`, `generateAgentResponse`, `runTriggeredAgentObjective`, approval resume/refusal, workflow agent node execution | [Agent Runtime Operations](./agent-runtime-operations.md) |
| `agentRuns.ts` | run status/detail context, pending approvals, approval decisions, run creation/status/usage/steps/tool calls/approvals, approval expiry and resume settlement | [Agent Runtime Operations](./agent-runtime-operations.md), [Run Observatory](./run-observatory.md) |
| `agentRunCheckpoints.ts` | checkpoint read/save/clear/reactivate and stalled run recovery | [Agent Runtime Operations](./agent-runtime-operations.md) |
| `agentLogs.ts`, `agentTransactions.ts` | seed and insert log/transaction records | [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| `agentEvalFixtures.ts`, `agentEvalGradingActions.ts` | eval thread creation/outcome, smoke grading context, model-graded eval completion, grading action | [Agent Runtime Operations](./agent-runtime-operations.md) |
| `agentMemories.ts`, `agentMemoryCandidates.ts` | runtime memory search, always memories, usage recording, candidate generation | [Agent Runtime Operations](./agent-runtime-operations.md) |
| `agentSkills.ts` | skill import/preview, catalog, analytics, CRUD, archive/delete, binding, upgrade, runtime skill queries | [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md), [Agent Skill Authoring Guide](./agent-skill-authoring-guide.md) |
| `ai.ts` | assistant response generation, audio transcription, thread title generation | [Assistant Chat Developer Guide](./assistant-chat.md), [AI Administration Developer Guide](./ai-administration.md) |
| `aiActionRequests.ts` | provider-backed helper action reservation | [AI Administration Developer Guide](./ai-administration.md) |
| `aiModels.ts`, `aiModelsActions.ts` | model list/search/count, provider controls, global/company defaults, runtime resolution, embedding resolution, enforcement, sync upsert, backfills, pricing, provider sync/test actions | [AI Models, Providers, And Costs](./ai-models-providers-and-costs.md) |
| `aiRules.ts`, `system.ts` | AI rules, active rules, system prompt, analytics id, PII config | [AI Rules And Prompts](./ai-rules-and-prompts.md), [AI Administration Developer Guide](./ai-administration.md) |
| `aiTools.ts`, `aiToolReadTools.ts`, `aiToolWriteTools.ts`, `aiToolNotificationTools.ts` | connector install, tool CRUD, agent tool binding, knowledge read tool, company overview write tool, notification helpers | [AI Tools And Connectors](./ai-tools-and-connectors.md), [AI Provider And Tool Extension](./ai-provider-tool-extension.md) |
| `analytics.ts`, `analyticsCron.ts`, `platformOverview.ts`, `platformAlertRecipients.ts` | costs, platform overview, inventory metrics, analytics health, daily snapshots, platform alerts | [Analytics Rollups](./analytics-rollups.md), [System Health And Platform Alerts](./system-health-and-platform-alerts.md) |
| `apiKeys.ts`, `publicApi.ts` | public request authentication, public ping, run status, public agent/workflow triggers | [Public API And Webhooks](./public-api-and-webhooks.md) |
| `apify.ts`, `webhooks.ts`, `properties.ts`, `propertyAgents.ts` | Rightmove Agent collection start, Apify scrape start, poll, sync, webhook, data storage, property read/delete | [Property Research And Board Reports](./property-research-and-reports.md) |
| `arcade.ts` | leaderboard listing, score count, score submission | [Auxiliary App Experiences](./auxiliary-app-experiences.md) |
| `auditLogs.ts`, `auditLogService.ts` | audit logging, audit config, purge dispatch/execution, recent log reads, purge schedule helpers, actor-name enrichment | [Audit Log Service](./audit-log-service.md) |
| `authEvents.ts`, `auth.ts`, `auth.config.ts`, `actionAuth.ts`, `oneTimeCodes.ts`, `magicLinkUrlService.ts` | auth event recording, auth configuration, typed one-time codes, and scanner-safe magic-link consent URLs | [Route Protection And Authentication](./route-protection-and-authentication.md), [Auth Diagnostics](./auth-diagnostics.md) |
| `chat.ts`, `chatAdmin.ts` | thread/message reads, upload URL generation, thread CRUD, send message, assistant message streaming, safety refusal, admin chat thread pagination | [Assistant Chat Developer Guide](./assistant-chat.md), [AI Administration Developer Guide](./ai-administration.md) |
| `companies.ts`, `users.ts`, `invites.ts`, `seedUsers.ts` | company CRUD, prompts/profile, plan assignment, user CRUD/profile/logins/impersonation/super-admin assignment, invitations and templates | [Company And User Management](./company-user-management.md) |
| `companyReadiness.ts`, `companyEvals.ts`, `companyEvalRuns.ts`, `companyEvalRunActions.ts` | company AI readiness, drift, checks, check runs, grading | [Company AI Readiness And Checks](./company-ai-readiness-and-checks.md) |
| `companyMemories.ts`, `companyMemorySuggestions.ts`, `companyMemorySuggestionActions.ts` | company memory, memory candidates, runtime memory, sweeps | [Company AI Readiness And Checks](./company-ai-readiness-and-checks.md) |
| `companySkills.ts` | company skill summary, import/search/list, binding, runtime skill reads | [Company AI Readiness And Checks](./company-ai-readiness-and-checks.md) |
| `dataMigrations.ts` | migration run, batch processing, status reads | [Maintenance Scripts](./maintenance-scripts.md) |
| `governanceDashboard.ts`, `governanceRegister.ts`, `governanceActivity.ts` | governance overview, AI register, and activity evidence | [Governance And Trust](./governance-and-trust.md) |
| `evidencePack.ts`, `personalData.ts` | evidence-pack gathering/export recording, subject-access production, erasure, and retained exceptions | [Governance And Trust](./governance-and-trust.md) |
| `inventoryRollups.ts` | global inventory rollup rebuild | [Analytics Rollups](./analytics-rollups.md) |
| `knowledge.ts`, `knowledgeActions.ts`, `knowledgeReembed.ts`, `knowledgeReembedActions.ts`, `webScrapeActions.ts` | document listing, upload/save/delete/retry/repair, website ingestion, chunks, retrieval, embedding repair | [Knowledge Management](./knowledge-management.md), [Upload And Knowledge Policy](./upload-and-knowledge-policy.md) |
| `localDemoSeed.ts`, `localTestAuth.ts` | local demo seed and deterministic auth seed/authorization | [Local Demo Seed Runbook](../operator/local-demo-seed-runbook.md), [Local Test Auth Runbook](../operator/local-test-auth-runbook.md) |
| `maintenanceScripts.ts` | script list/get/run | [Maintenance Scripts](./maintenance-scripts.md) |
| `movements.ts` | movement list/get/create/delete, upload URL/file URL, debug tracking sessions | Movement docs and active movement plan |
| `orchestrator.ts` | agent intent routing | [Auxiliary App Experiences](./auxiliary-app-experiences.md), [Agents Developer Guide](./agents.md) |
| `plans.ts` | plan status, plan list/pagination, plan CRUD, billing cycle resets | [Platform Plans And Quotas](./platform-plans-and-quotas.md) |
| `purges.ts` | purge config/history, manual purge, recursive execution, dispatch, cancel | [Data Retention And Purges](./data-retention-and-purges.md) |
| `salesReports.ts`, `salesReportActions.ts` | report context reads, generated report save, report generation | [Sales And Board Reports](./sales-and-board-reports.md) |
| `salesData.ts`, `salesDataImportActions.ts`, `salesDataCustomers.ts` | workspace workbook upload/import, imported table reads, customer lists/details, typed detail saves, and sales-by-month reads | [Sales Data Workspace](./sales-data-workspace.md) |
| `salesDataResearch.ts`, `salesDataResearchJobs.ts`, `salesDataMarketDiscovery.ts`, `salesDataReset.ts` | customer research, prospect records, research jobs, market discovery, and destructive workspace reset actions | [Sales Data Workspace](./sales-data-workspace.md) |
| `salesOpportunityReports.ts` | opportunity report read/start/watch, deterministic matching/gap passes, and summary save | [Sales Data Workspace](./sales-data-workspace.md), [Sales And Board Reports](./sales-and-board-reports.md) |
| `scheduler.ts` | schedules CRUD/toggle/manual run, agent execution completion, workflow execution reads, pending workflow approval count | [Workflow Automation](./workflow-automation.md) |
| `settings.ts` | public settings, settings update, email branding, white-label readiness/presets/navigation/domain/handoff/packaging, upload URL | [Platform Operations Settings](./platform-operations-settings.md), [System Settings And Branding](./system-settings-and-branding.md) |
| `swarmActions.ts`, `swarmRuntime.ts` | swarm execution, logs, demo agents, company context | [Assistant Chat Developer Guide](./assistant-chat.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| `webhookDeliveries.ts`, `webhookDeliveryActions.ts` | delivery reads, queue/attempt recording, dispatch | [Public API And Webhooks](./public-api-and-webhooks.md) |
| `widgets.ts` | global/primary widget reads, public widget config, widget upload, widget thread creation | [Embedded Widgets](./embedded-widgets.md) |
| `workflowEngine.ts`, `workflowExecutions.ts`, `workflowRuntime.ts`, `workflows.ts`, `seedWorkflows.ts` | workflow CRUD, execution creation/update/steps, runtime node execution, approval resume, public/manual triggers, webhook routes, seed workflow | [Workflow Automation](./workflow-automation.md), [Workflow Runtime Internals](./workflow-runtime-internals.md) |

## Supporting Service Module Map

These modules are not usually public Convex API entry points, but they carry
core behavior and must be treated as documentation owners when changed.

| Module family | Files | Product ownership |
| --- | --- | --- |
| Agent runtime, state, continuation, versions, and observability services | `agentService.ts`, `agentRuntimeService.ts`, `agentRunStateService.ts`, `agentRunContinuationService.ts`, `agentVersioningService.ts`, `agentVersions.ts`, `agentFailureKeyService.ts`, `agentLogGroupingService.ts`, `agentObservabilityService.ts`, `approvalExpiryService.ts` | [Agents Developer Guide](./agents.md), [Agent Runtime Operations](./agent-runtime-operations.md), [Run Observatory](./run-observatory.md) |
| Agent providers and provider-neutral runtime types | `agentProviderRegistry.ts`, `agentProviderTypes.ts`, `anthropicAgentProvider.ts`, `googleAgentProvider.ts`, `openaiAgentProvider.ts`, `openrouterAgentProvider.ts` | [Agent Runtime Operations](./agent-runtime-operations.md), [AI Models, Providers, And Costs](./ai-models-providers-and-costs.md) |
| Agent eval, reflection, risk, accountability, and improvement services | `agentEvalGradingService.ts`, `agentRunReflections.ts`, `agentRiskService.ts`, `agentAccountabilityService.ts` | [Agent Runtime Operations](./agent-runtime-operations.md), [Agents Developer Guide](./agents.md), [Governance And Trust](./governance-and-trust.md) |
| AI providers, model resolution, retries, costs, and safety | `aiModelService.ts`, `aiProviderRegistry.ts`, `aiProviderRetryService.ts`, `aiRuntimeTypes.ts`, `aiCostService.ts`, `aiSafetyPolicy.ts`, `anthropicMessageService.ts`, `anthropicProviderService.ts`, `anthropicStreamService.ts`, `googleProviderAdapter.ts`, `openaiProviderService.ts`, `openrouterMessageService.ts`, `openrouterProviderService.ts`, `promptCacheService.ts`, `providerHttpService.ts`, `streamingService.ts`, `vertexProviderService.ts` | [AI Models, Providers, And Costs](./ai-models-providers-and-costs.md), [AI Administration Developer Guide](./ai-administration.md), [Assistant Chat Developer Guide](./assistant-chat.md) |
| AI action requests and tool execution support | `aiActionRequestService.ts`, `aiToolIdempotencyService.ts`, `aiToolNotificationService.ts`, `connectorSecretPolicy.ts`, `connectorSecretResolver.ts`, `httpConnectorPolicy.ts`, `toolConnectorDefinitions.ts` | [AI Tools And Connectors](./ai-tools-and-connectors.md), [AI Provider And Tool Extension](./ai-provider-tool-extension.md) |
| Analytics, dashboard, settings, plans, email, and system services | `analyticsService.ts`, `companyEngagement.ts`, `companyService.ts`, `emailBrandingService.ts`, `emailLayoutService.ts`, `planService.ts`, `settingsService.ts`, `systemService.ts`, `resendEmailService.ts`, `userActivityService.ts` | [Administration Developer Guide](./administration.md), [Analytics Rollups](./analytics-rollups.md), [Platform Operations Settings](./platform-operations-settings.md), [Email Branding](./email-branding.md), [Email System](./email-system.md) |
| Auth, tenancy, and user management helpers | `actionAuth.ts`, `authUserProvisioning.ts`, `authz.ts`, `authz-migration-allowlist.json`, `magicLinkUrlService.ts`, `oneTimeCodeService.ts`, `tenantFunctions.ts`, `userManagementService.ts` | [Route Protection And Authentication](./route-protection-and-authentication.md), [Tenancy Enforcement](./tenancy-enforcement.md), [Company And User Management](./company-user-management.md) |
| Chat and knowledge services | `chatService.ts`, `chatAdminService.ts`, `knowledgeService.ts` | [Assistant Chat Developer Guide](./assistant-chat.md), [AI Administration Developer Guide](./ai-administration.md), [Knowledge Management](./knowledge-management.md) |
| Company AI learning services | `companyLearningLoop.ts` | [Company AI Readiness And Checks](./company-ai-readiness-and-checks.md) |
| Governance, evidence, personal data, and conformance services | `governanceDashboardService.ts`, `governanceRegisterService.ts`, `governanceActivityService.ts`, `governancePolicyService.ts`, `evidencePackService.ts`, `personalDataService.ts`, `conformanceService.ts`, `webhookSignatureService.ts` | [Governance And Trust](./governance-and-trust.md), [Public API And Webhooks](./public-api-and-webhooks.md) |
| Apify and property actor helpers | `apifyActors.ts`, `apifyRest.ts` | [Property Research And Board Reports](./property-research-and-reports.md) |
| Maintenance, cron, purge, and workflow services | `crons.ts`, `maintenanceScriptRegistry.ts`, `purgeScheduleService.ts`, `workflowRuntimeService.ts`, `workflowScheduleService.ts` | [Maintenance Scripts](./maintenance-scripts.md), [Data Retention And Purges](./data-retention-and-purges.md), [Workflow Runtime Internals](./workflow-runtime-internals.md) |
| Sales report and sales-data helpers | `salesReportContextService.ts`, `salesDataImportService.ts`, `salesDataResearchService.ts`, `salesDataResearchJobService.ts`, `salesDataProspectMatching.ts`, `salesDataCustomerFields.ts`, `salesDataComaxProvisioning.ts`, `salesOpportunityService.ts` | [Sales And Board Reports](./sales-and-board-reports.md), [Sales Data Workspace](./sales-data-workspace.md) |

## Schema Domain Map

| Domain | Tables | Owning docs |
| --- | --- | --- |
| Tenancy, users, auth, and invites | `companies`, `users`, `logins`, `invitations`, `emailTemplates`, auth tables | [Company And User Management](./company-user-management.md), [Route Protection And Authentication](./route-protection-and-authentication.md) |
| System configuration and packaging | `systemSettings`, `systemConfig`, `plans`, `apiKeys`, `publicApiRequests`, `maintenanceScriptRuns`, `dataMigrations` | [Platform Operations Settings](./platform-operations-settings.md), [Platform Plans And Quotas](./platform-plans-and-quotas.md), [Maintenance Scripts](./maintenance-scripts.md) |
| AI providers, models, prompts, rules, and costs | `aiProviders`, `aiModels`, `aiModelDefaults`, `aiModelRollups`, `aiRules`, `aiActionRequests`, `analyticsDailySnapshots`, `inventoryRollups` | [AI Administration Developer Guide](./ai-administration.md), [AI Models, Providers, And Costs](./ai-models-providers-and-costs.md) |
| Tools, connectors, widgets, and webhooks | `toolConnectors`, `toolConnectorTestLogs`, `toolConnectorSecretRefs`, `toolConnectorOAuthConnections`, `aiTools`, `agentTools`, `widgets`, `webhookDeliveries` | [AI Tools And Connectors](./ai-tools-and-connectors.md), [Embedded Widgets](./embedded-widgets.md), [Public API And Webhooks](./public-api-and-webhooks.md) |
| Knowledge and chat | `knowledgeDocuments`, `knowledgeChunks`, `threads`, `messages` | [Knowledge Management](./knowledge-management.md), [Assistant Chat Developer Guide](./assistant-chat.md) |
| Agents and runtime evidence | `agents`, `agentRuns`, `agentRunSteps`, `agentToolCalls`, `agentToolIdempotency`, `agentRunApprovals`, `agentRunFeedback`, `agentRunReflections`, `agentRunCheckpoints`, `agentTransactions`, `agentLogs`, `agentVersions`, `agentImprovementSuggestions` | [Agents Developer Guide](./agents.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| Agent skills, evals, and memory | `agentSkills`, `agentSkillVersions`, `agentSkillBindings`, `agentSkillRollups`, `agentEvalFixtures`, `agentEvalSuitePresets`, `agentMemories`, `agentMemoryCandidates`, `agentMemoryUsage` | [Agent Configuration And Catalogs](./agent-configuration-and-catalogs.md), [Agent Runtime Operations](./agent-runtime-operations.md) |
| Company AI skills, evals, and memory | `companySkills`, `companySkillBindings`, `companyEvalCases`, `companyEvalRuns`, `companyMemories`, `companyMemoryCandidates`, `companyMemoryUsage`, `companyMemorySweeps`, `companyAiDriftEvents` | [Company AI Readiness And Checks](./company-ai-readiness-and-checks.md) |
| Workflows and schedules | `workflows`, `workflowExecutions`, `workflowExecutionSteps`, `schedules` | [Workflow Automation](./workflow-automation.md), [Workflow Runtime Internals](./workflow-runtime-internals.md) |
| Property research | `properties`, `apifyRuns` | [Property Research And Board Reports](./property-research-and-reports.md) |
| Sales and board reports | `salesReports` | [Sales And Board Reports](./sales-and-board-reports.md) |
| Sales Data workspace | `salesDataImports`, `salesDataRows`, `salesDataCategoryLinks`, `salesDataAreasOfInterest`, `salesDataFrequencies`, `salesDataAccounts`, `salesDataCustomers`, `salesDataCustomerResearch`, `salesDataProspects`, `salesDataMarketDiscoveryJobs`, `salesDataMarketDiscoveryGroups`, `salesDataResearchJobs`, `salesDataResearchJobItems`, `salesOpportunityReports`, `salesOpportunityReportGapProducts`, `salesOpportunityReportTypeBaskets` | [Sales Data Workspace](./sales-data-workspace.md) |
| Operations, audit, and retention | `auditLogs`, `authEvents`, `purgeHistory`, `swarmLogs` | [Audit Log Service](./audit-log-service.md), [Data Retention And Purges](./data-retention-and-purges.md), [Auth Diagnostics](./auth-diagnostics.md) |
| Auxiliary and demos | `arcadeScores`, `movements`, `movementDebugSessions`, `mockStorageMetadata` | [Auxiliary App Experiences](./auxiliary-app-experiences.md), movement docs |

## Authorization Surface Rules

Use these rules when changing or documenting Convex functions:

- Public HTTP/action surfaces must validate request identity, tokens, or widget
  context before exposing data.
- Tenant functions must scope by active company, thread ownership, user id, or
  explicit company access.
- Admin functions must call the correct admin helper and enforce company access
  for company-scoped records.
- Super-admin functions must not be weakened to ordinary admin access without a
  product and security decision.
- Internal functions are not user authorization boundaries by themselves; the
  public or scheduled caller must establish the right context.
- Mutations that create, update, delete, approve, reject, impersonate, trigger,
  export, dispatch, or purge should be checked for audit requirements.

## Verification

For documentation-only edits, run:

```bash
git diff --check
```

For Convex implementation changes, follow the repo gate and run focused tests
for the touched module family. If the change touches authorization, tenant
isolation, public APIs, tool execution, model routing, workflow execution, or
purges, add or update focused tests before relying on the broader gate.
