# Function And Feature Coverage Matrix

Last reviewed: 2026-08-25
Status: active coverage matrix
Audience: agents and engineers documenting every Sonae feature, route, backend function family, schema area, and operational command.

## Purpose

This matrix is the durable coverage control for documenting the whole Sonae app.
It sits between the implementation and the audience guides. Use it to answer
four questions before writing or refreshing documentation:

- What implemented surface exists?
- Which routes, Convex modules, schema tables, and scripts prove it exists?
- Which end-user, developer, operator, or plan documents currently cover it?
- What documentation work remains?

The current implementation is the source of truth. Existing documents may be
complete, partial, stale, or only broad coverage. A feature is not fully
documented just because it appears somewhere in a paragraph.

Use [Route Reference](./route-reference.md) for route ownership,
[Convex API And Schema Reference](./convex-api-and-schema-reference.md) for
backend ownership, and [Operational Scripts Reference](./operational-scripts-reference.md)
for package-script ownership.

## Coverage Status Key

- Complete pair: an end-user or operator guide and a developer guide exist and
  are useful for the current implementation.
- Covered broadly: a feature is described inside a larger guide, but the route
  or function family may need deeper dedicated documentation if it changes.
- Needs dedicated guide: the feature exists and is important enough that broad
  coverage is not enough.
- Active plan only: implementation is in flux or incomplete; document only the
  current live behavior and point planned behavior to the active plan.
- Frozen: do not expand or reinterpret except under the repo guardrails.

## Feature Coverage Matrix

| Feature or function area | Implemented surfaces checked | Backend or data anchors | Current docs | Status | Remaining documentation work |
| --- | --- | --- | --- | --- | --- |
| Public website home | `/`, `src/app/(public)`, public nav/footer, public motion components | public route group, environment-driven contact/company links | `docs/end-user/public-website.md`, `docs/developer/public-website.md`, `docs/plans/active/public-website-plan.md` | Current page documented plus active plan | Refresh when `/platform`, `/showcase`, `/trust`, and `/contact` ship. Current drift: `/platform` and `/contact` are linked/fallback targets while those routes are still pending. |
| Login, verification, typed codes, and local auth | `/login`, `/verify`, `/local-test-auth`, login layout | `convex/auth.ts`, `convex/localTestAuth.ts`, `convex/authEvents.ts`, `convex/oneTimeCodes.ts`, `convex/oneTimeCodeService.ts`, `convex/magicLinkUrlService.ts`, `convex/authz-migration-allowlist.json`, `users`, `logins`, `authEvents` | `docs/end-user/login-access-and-authentication.md`, `docs/developer/route-protection-and-authentication.md`, `docs/developer/tenancy-enforcement.md`, `docs/operator/local-test-auth-runbook.md` | Complete pair | Keep local-test-only routes, `/verify`, one-time-code limits, tenant-builder enforcement, and operator steps current when auth flows change. |
| Dashboard shell and navigation | `/app`, `/admin`, dashboard layout, sidebar navigation | `convex/settings.ts`, `systemSettings` | `docs/end-user/platform-overview.md`, `docs/developer/frontend.md`, `docs/developer/system-settings-and-branding.md` | Covered broadly | Add deeper docs if dashboard routing changes. |
| Assistant chat | `/app/assistant`, `/app/assistant/[threadId]` | `convex/chat.ts`, `convex/aiChat.ts`, `convex/aiSpeech.ts`, `convex/aiPromptAssembly.ts`, provider adapters, `convex/messageFeedback.ts`, `threads`, `messages`, `messageFeedback`, `knowledgeDocuments`, `knowledgeChunks` | `docs/end-user/assistant-chat.md`, `docs/developer/assistant-chat.md`, `docs/end-user/spoken-channels.md`, `docs/developer/spoken-channels.md`, `docs/end-user/photo-actions.md`, `docs/developer/photo-actions.md` | Complete pair | Keep streaming and reveal pacing, feedback, dictation, live voice, photo actions, attachment, quota, model, and safety behavior current. |
| Tasks and notifications | `/app/tasks`, header notification bell, sidebar task badge, agent task tool, workflow task node, phone/Gmail/photo follow-up tasks | `convex/tasks.ts`, `convex/notifications.ts`, `convex/aiToolExecutionService.ts`, `convex/workflowRuntime.ts`, `src/lib/taskGrouping.ts`, `tasks`, `notifications`, `auditLogs` | `docs/end-user/tasks-and-notifications.md`, `docs/developer/tasks-and-notifications.md`, `docs/plans/active/tasks-and-notifications-plan.md` | Complete pair plus historical plan | Keep tenant-scoped assignment, per-user notification read state, internal-only notification writes, task audit rows, task-vs-approval boundary, source links, and machine-created task paths current. |
| Photo actions | Ask Sonae image attachments, widget photo uploads, image thumbnails, vision model routing, photo-action proposal chips, human-confirmed task creation | `convex/chat.ts`, `convex/aiChat.ts`, `convex/agentRuntime.ts`, `convex/photoActionService.ts`, `convex/tasks.ts`, `convex/widgets.ts`, `src/ui/components/chat/PhotoActionChip.tsx`, `src/lib/constants/uploads.ts`, `threads`, `messages`, `tasks` | `docs/end-user/photo-actions.md`, `docs/developer/photo-actions.md`, `docs/plans/active/photo-actions-plan.md` | Complete pair plus active proof plan | Keep photo upload limits, image-not-knowledge semantics, vision default routing, non-vision fallback, proposal extraction, one-tap task idempotency, and widget-token confirmation current. |
| Spoken channels and phone calls | Ask Sonae live voice overlay, `/app/calls`, `/app/calls/[id]`, `/admin/ai/voice`, inbound Twilio voice/status webhooks, voice relay knowledge lookup | `convex/aiVoiceSession.ts`, `convex/voiceRelay.ts`, `convex/voiceSettings.ts`, `convex/voicePreview.ts`, `convex/telephony.ts`, `convex/telephonyActions.ts`, `convex/telephonyService.ts`, `src/lib/googleLiveVoice.ts`, `src/lib/voiceSession.ts`, `phoneCalls`, `companies.spokenVoice`, `aiActionRequests`, `toolConnectors`, `tasks` | `docs/end-user/spoken-channels.md`, `docs/developer/spoken-channels.md`, voice and telephone active plans | Complete pair plus active plans | Keep relay ticket auth, provider signature checks, line ownership, call admission ceilings, quota spending, call privacy, voice settings, post-call tasks, and Wiki handoff current. |
| Receptionist screen | `/app/reception`, `/kiosk/[widgetId]`, widget Integration receptionist toggle, full-screen tap-to-wake voice session, kiosk heartbeat and session count | `convex/kiosk.ts`, `convex/kioskActions.ts`, `convex/widgets.ts`, `src/lib/googleLiveVoice.ts`, `src/lib/voiceSession.ts`, `widgets`, `threads`, `messages`, `companies.spokenVoice` | `docs/end-user/receptionist-screen.md`, `docs/developer/receptionist-screen.md`, `docs/end-user/spoken-channels.md`, `docs/developer/spoken-channels.md`, `docs/plans/active/receptionist-kiosk-plan.md` | Complete pair plus active proof plan | Keep kiosk opt-in, in-memory visitor tokens, heartbeat, session/thread ceilings, silence reset, daily reload, relay/model availability, and tablet proof status current. |
| Profile and user self-service | `/app/profile`, profile preferences, Assistant Notes, super-admin login history | `convex/users.ts`, `convex/userMemories.ts`, `users`, `userMemories`, storage uploads | `docs/end-user/organization-and-company-workspaces.md`, `docs/developer/company-user-management.md` | Covered broadly | Add dedicated profile doc if profile settings or personal memory governance grow beyond account basics. |
| Organization workspace | `/app/settings`, `/app/settings/team`, `/app/settings/auth-diagnostics` | `convex/users.ts`, `convex/companies.ts`, `convex/plans.ts`, `companies`, `users`, `plans`, `logins` | `docs/end-user/organization-and-company-workspaces.md`, `docs/end-user/company-workspace-administration.md`, `docs/developer/organization-and-company-workspaces.md`, `docs/developer/company-user-management.md` | Complete pair | Keep tenant-admin limits, team invite behavior, and diagnostics aligned. |
| Administration overview | `/admin`, admin layout | `convex/adminQueryService.ts`, admin auth helpers | `docs/end-user/administration.md`, `docs/developer/administration.md` | Complete pair | Umbrella only; specialized admin routes are tracked separately below. |
| Company management | `/admin/companies`, `/admin/companies/[id]`, overview, feature gates, directory users/invites, company calls, company mailbox, company detail tabs | `convex/companies.ts`, `convex/users.ts`, `convex/invites.ts`, `convex/telephony.ts`, `convex/mailbox.ts`, `companies`, `users`, `invitations`, `emailTemplates`, `phoneCalls`, `mailboxMessages` | `docs/end-user/administration.md`, `docs/end-user/company-workspace-administration.md`, `docs/end-user/organization-and-company-workspaces.md`, `docs/developer/company-user-management.md`, `docs/developer/spoken-channels.md`, `docs/developer/gmail-mailbox.md` | Complete pair | Check directory, feature-gate, call, and mailbox routes when company workspace UX changes. |
| Super-admin and user management | `/admin/users`, `/admin/users/invite`, `/admin/super-admins`, `/admin/super-admins/invite` | `convex/users.ts`, `convex/invites.ts`, `users`, `invitations`, `auditLogs` | `docs/end-user/administration.md`, `docs/developer/company-user-management.md`, `docs/developer/tenancy-enforcement.md` | Complete pair | Keep privilege escalation and super-admin assignment rules explicit. |
| Read-only user directory | `/admin/directory` | `convex/users.ts`, `convex/userActivityService.ts`, `users`, `logins` | `docs/end-user/administration.md`, `docs/developer/administration.md`, `docs/plans/active/user-directory-plan.md` | Covered broadly | Keep this read-only; account mutations belong in `/admin/users`. |
| Governance and trust | `/admin/governance`, register, policies, audit trail, approvals; `/app/governance`, register, policies, audit trail | `convex/governanceDashboard.ts`, `convex/governanceRegister.ts`, `convex/governanceActivity.ts`, `convex/evidencePack.ts`, `convex/personalData.ts`, `convex/conformanceService.ts`, `auditLogs`, `agentRuns`, `aiRules`, `agents`, `widgets`, `workflows` | `docs/end-user/governance-and-trust.md`, `docs/developer/governance-and-trust.md`, `docs/plans/active/governance-and-trust-plan.md` | Complete pair plus active plan | Refresh when evidence-pack contents, personal-data rules, audit export, or register inputs change. |
| Global AI administration | `/admin/ai`, costs, chat logs, rules, system prompt, global knowledge, widget, models, providers, defaults, tools | `convex/aiModels.ts`, `convex/aiModelsActions.ts`, `convex/aiRules.ts`, `convex/system.ts`, `convex/knowledge.ts`, `convex/widgets.ts`, `convex/aiTools.ts`, `convex/analytics.ts` | `docs/end-user/ai-administration.md`, `docs/developer/ai-administration.md` | Complete pair | Split dedicated docs only when a sub-area becomes too large for the AI admin guide. |
| AI models, providers, defaults, and costs | `/admin/ai/models`, model detail, catalogue, providers, defaults, usage/cost routes, company model defaults | `aiProviders`, `aiModels`, `aiModelDefaults`, `aiModelRollups`, `analyticsDailySnapshots`, `convex/aiModels.ts`, `convex/aiModelsActions.ts`, `convex/aiModelService.ts`, `convex/utils/modelPricing.ts`, provider services | `docs/end-user/ai-models-providers-and-costs.md`, `docs/developer/ai-models-providers-and-costs.md`, `docs/plans/active/openrouter-and-model-scale-plan.md`, `docs/plans/active/company-and-agent-model-defaults-plan.md` | Complete pair plus active plans | OpenRouter, indexed catalogue paging, lightweight picker rows, and cost-measurable checks are current. Refresh after company/agent defaults work lands or if model-price semantics change. |
| AI rules and prompts | global, company, and agent rule routes; global/company/agent prompt routes | `convex/aiRules.ts`, `convex/system.ts`, `convex/agents.ts`, `systemConfig`, `aiRules`, `agents` | `docs/end-user/ai-rules-and-prompts.md`, `docs/developer/ai-rules-and-prompts.md` | Complete pair | Keep scope hierarchy and safety precedence current. |
| Knowledge management source archive | global, company, agent, thread, and website/file/manual knowledge routes | `convex/knowledge.ts`, `convex/knowledgeActions.ts`, `convex/knowledgeRetrieval.ts`, `convex/knowledgeRetrievalService.ts`, `knowledgeDocuments`, `knowledgeChunks`, `knowledgeChunkStats`, storage | `docs/end-user/knowledge-management.md`, `docs/developer/knowledge-management.md`, `docs/developer/upload-and-knowledge-policy.md` | Complete pair | Markdown, OKF folder upload, queued ingestion, hybrid retrieval, and bounded evidence priors are current. Company knowledge source documents now feed the Wiki; refresh with the Wiki guide when ingestion hooks change. |
| Company Wiki | `/admin/ai/knowledge`, `/admin/ai/knowledge/[pageId]`, `/admin/ai/knowledge/map`, `/admin/ai/global-knowledge` redirect, `/admin/companies/[id]/ai/pages`, `/admin/companies/[id]/ai/pages/[pageId]`, `/admin/companies/[id]/ai/pages/map`, shared wiki feature components, platform-scope Wiki doors | `convex/wikiPages.ts`, `convex/wikiActions.ts`, `convex/wikiDistill.ts`, `convex/wikiDistillActions.ts`, `convex/wikiStaff.ts`, `convex/wikiStaffRunActions.ts`, `convex/wikiTending.ts`, `convex/wikiTendingActions.ts`, `convex/wikiQuestions.ts`, `convex/wikiContradictionActions.ts`, `convex/wikiFreshness.ts`, `convex/wikiFreshnessActions.ts`, `convex/wikiReviews.ts`, `convex/wikiReviewActions.ts`, `convex/wikiFilingActions.ts`, `convex/wikiFeedback.ts`, `convex/wikiFeedbackService.ts`, `convex/wikiRewriteService.ts`, `convex/wikiRewriteEval.ts`, `convex/wikiExam.ts`, `convex/wikiExamGrowth.ts`, `convex/wikiExamGrowthActions.ts`, `convex/memoryMigration.ts`, `convex/memoryMigrationActions.ts`, `wikiPages`, `wikiPageSources`, `wikiDistillState`, `wikiOpenQuestions`, `wikiReviews`, `wikiPageRevisions`, `wikiUnansweredQuestions`, `wikiAnswerTallies` | `docs/end-user/company-wiki.md`, `docs/developer/company-wiki.md`, `docs/plans/completed/wiki-replaces-knowledge-plan.md`, `docs/plans/completed/self-improving-wiki-plan.md`, `docs/plans/completed/wiki-agents-plan.md` | Complete pair plus delivered plans | Keep whole-page answer context, source receipts, review-before-write, open questions, staff agents, map links, pinned corrections, feedback tallies, exam growth from resolved unanswered questions, memory-to-wiki/rule migration, platform/company scope separation, and customer-page privacy current. |
| AI tools and connectors | `/admin/ai/tools`, tool detail/new, connector detail, agent tool bindings | `convex/aiTools.ts`, `convex/aiToolExecutionService.ts`, connector policy modules, `toolConnectors`, `aiTools`, `agentTools` | `docs/end-user/ai-tools-and-connectors.md`, `docs/developer/ai-tools-and-connectors.md`, `docs/developer/ai-provider-tool-extension.md` | Complete pair | Keep not-implemented connector language aligned with the real handler registry. |
| Tool servers | `/admin/ai/tool-servers`, connected server CRUD, discovery, server-tool import, tenant-visible imported tools, and external tool-call execution | `convex/mcpServers.ts`, `convex/mcpServerPolicy.ts`, `convex/mcpProtocol.ts`, `convex/mcpTransport.ts`, `convex/mcpDiscovery.ts`, `convex/mcpToolPromotion.ts`, `convex/mcpToolPolicy.ts`, `convex/mcpToolCall.ts`, `convex/toolModelName.ts`, `mcpServers`, `mcpServerTools`, `aiTools.mcpServerId`, `aiTools.mcpToolName` | `docs/end-user/tool-servers.md`, `docs/developer/tool-servers.md`, `docs/plans/active/tool-server-plan.md` | Complete pair plus active plan | Keep the four-step connect/discover/import/enable workflow, SSRF/address policy, company-owned imported tools, external approval boundary, model-name derivation, and untrusted result wrapping current. |
| Gmail mailbox | `google-gmail` connector install/detail, Connect mailbox OAuth flow, once-a-minute mailbox watcher, Gmail read/reply tools, processed Gmail label, follow-up tasks, Wiki handoff | `convex/toolConnectorDefinitions.ts`, `convex/aiTools.ts`, `convex/connectorOAuth.ts`, `convex/connectorOAuthProviders.ts`, `convex/connectorTokenCrypto.ts`, `convex/gmailConnector.ts`, `convex/gmailWatcher.ts`, `convex/gmailWatcherStore.ts`, `convex/crons.ts`, `toolConnectors`, `toolConnectorOAuthConnections`, `connectorOAuthTokens`, `mailboxMessages`, `tasks`, `wikiPages` | `docs/end-user/gmail-mailbox.md`, `docs/developer/gmail-mailbox.md`, `docs/plans/active/gmail-inbox-plan.md` | Complete pair plus active proof plan | Keep OAuth availability, token encryption, reply rails, processed-message idempotency, skip rules, task routing, Wiki customer-page handoff, retention, and live-proof status current. |
| Embedded widgets | `/w/[widgetId]`, `/sandbox/[widgetId]`, global widget, company widget, server-minted embed pass, per-widget frame-ancestors, photo upload and photo-action confirmation | `convex/widgets.ts`, `convex/chat.ts`, `convex/tasks.ts`, `convex/utils/widgetEmbedPass.ts`, `convex/utils/widgetOriginPolicy.ts`, `src/proxy.ts`, `src/lib/widgetEmbedPolicy.ts`, `src/lib/widgetSystemMessages.ts`, `widgets`, `threads`, `messages`, upload policy | `docs/end-user/embedded-widgets.md`, `docs/end-user/widget-handoff-and-troubleshooting.md`, `docs/developer/embedded-widgets.md`, `docs/end-user/photo-actions.md`, `docs/developer/photo-actions.md` | Complete pair | Company-plan quota, anonymous billing privacy, refused-message PII redaction, Italian quota notice, embed-pass enforcement, frame-ancestor policy, widget thread ceiling, widget photo uploads, and anonymous task confirmation are current. |
| Agent builder and configuration | `/admin/agents`, agent detail dashboard/settings/interfaces/system prompt/rules/skills/knowledge | `convex/agents.ts`, `convex/agentSkills.ts`, `convex/agentTemplates.ts`, `agents`, `agentSkills`, `agentTools`, `agentVersions` | `docs/end-user/agents.md`, `docs/end-user/agent-setup-and-configuration.md`, `docs/developer/agents.md`, `docs/developer/agent-configuration-and-catalogs.md` | Complete pair | Update after active agent model-defaults and autonomy work. |
| Agent runtime, runs, approvals, memory, evals, and observability | `/admin/agents/[id]/runs`, evals, memory, logs, observability, approvals | `convex/agentRuns.ts`, `convex/agentRunApprovals.ts`, `convex/agentObjectiveService.ts`, `convex/agentRuntime.ts`, `convex/agentObjectiveLoop.ts`, `convex/agentRuntimeTurnService.ts`, `convex/agentRuntimeService.ts`, `convex/modelTurnService.ts`, `convex/agentEvalFixtures.ts`, `convex/rehearsalEvalService.ts`, `convex/selfImprovementConfig.ts`, `convex/agentMemories.ts`, `convex/agentLogs.ts`, `convex/agentRunFeedback.ts`, `convex/agentImprovementSuggestions.ts` | `docs/end-user/agent-operations-and-review.md`, `docs/developer/agent-runtime-operations.md`, `docs/developer/run-observatory.md`, active agent plans | Complete pair plus active plans | Rehearsal evals, automatic reflection, objective fallback, approval expiry/settlement, shared model-turn safety/streaming, outcome ranking, feedback controls, retrieval priors, and autonomous memory are current. |
| Company AI readiness, evals, memories, skills, Wiki demand, money, and usage | `/admin/companies/[id]/ai`, evals, memory, skills, pages, diary, unanswered, saved-answers redirect, money, usage, chat-log eval/memory actions | `convex/companyReadiness.ts`, `convex/companyEvals.ts`, `convex/companyEvalRuns.ts`, `convex/companyMemories.ts`, `convex/companySkills.ts`, `convex/companyMemorySuggestions.ts`, `convex/wikiFeedback.ts`, `convex/wikiDiary.ts`, `convex/moneyView.ts` | `docs/end-user/company-ai-readiness-and-checks.md`, `docs/developer/company-ai-readiness-and-checks.md`, `docs/end-user/company-wiki.md`, `docs/developer/company-wiki.md`, active company AI plans | Complete current pair plus active plans | Refresh when the Company AI readiness rebuild, AI Checks plan, Wiki answer filing, or Wiki demand flow changes. |
| Workflow automation and schedules | `/admin/workflows`, workflow detail, executions, schedules | `convex/workflows.ts`, `convex/workflowRuntime.ts`, `convex/workflowRetryService.ts`, `convex/workflowEngine.ts`, `convex/scheduler.ts`, `src/lib/convexHttpActionsUrl.ts`, `workflows`, `workflowExecutions`, `workflowExecutionSteps`, `schedules` | `docs/end-user/workflow-automation.md`, `docs/developer/workflow-automation.md`, `docs/developer/workflow-runtime-internals.md` | Complete pair | Safe agent-node transient retry, three-attempt budget, backoff, webhook origin, approvals, and schedule behavior are current. |
| Platform operations settings | `/admin/settings`, plans, API keys, analytics, scripts, connection checks | `convex/settings.ts`, `convex/plans.ts`, `convex/apiKeys.ts`, `convex/maintenanceScripts.ts`, `convex/connectionProbes.ts`, `convex/jobLedger.ts`, `systemSettings`, `plans`, `apiKeys`, `maintenanceScriptRuns`, `toolConnectors`, `aiProviders`, `jobRuns` | `docs/end-user/platform-operations-settings.md`, `docs/developer/platform-operations-settings.md`, `docs/developer/platform-plans-and-quotas.md`, `docs/developer/maintenance-scripts.md` | Complete pair | Maintenance scripts are concise; deepen if new scripts or external probes become operator-facing. |
| System health, alerts, diagnostics, retention, purges, and external error monitoring | `/admin/health`, `/admin/auth-diagnostics`, audit log detail, purge settings/history; Next.js instrumentation | `convex/systemHealth.ts`, `convex/platformAlerts.ts`, `convex/analyticsSnapshots.ts`, `convex/platformAlertService.ts`, `convex/purges.ts`, `convex/auditLogs.ts`, `src/instrumentation*.ts`, `src/lib/errorMonitoring.ts`, `purgeHistory`, `analyticsDailySnapshots`, `auditLogs` | `docs/end-user/health.md`, `docs/end-user/system-health-and-maintenance.md`, `docs/end-user/operational-diagnostics-and-retention.md`, `docs/developer/system-health-and-platform-alerts.md`, `docs/developer/data-retention-and-purges.md`, `docs/developer/deployment.md` | Complete pair plus developer operations | Keep alert recipients, Sentry environment/release configuration, health thresholds, and purge semantics current. |
| Public API and webhooks | `/api/health`, public agent/workflow/run-status API, Apify webhook, webhook delivery monitor | `convex/publicApi.ts`, `convex/http.ts`, `convex/webhooks.ts`, `convex/webhookDeliveries.ts`, `publicApiRequests`, `webhookDeliveries`, `apifyRuns` | `docs/end-user/public-api-and-webhooks.md`, `docs/developer/public-api-and-webhooks.md` | Complete pair | Add endpoint-level examples when public API expands. |
| Property research and Rightmove/Apify flow | `/app/properties/information`, search, scraped data, detail, logs | `convex/properties.ts`, `convex/propertyAgents.ts`, `convex/apify.ts`, `convex/webhooks.ts`, `properties`, `apifyRuns` | `docs/end-user/property-research-and-reports.md`, `docs/developer/property-research-and-reports.md`, `docs/plans/active/rightmove-agent-execution-plan.md` | Complete pair plus active plan | The Search page now queues the Rightmove Agent. Refresh again when Apify run records link visibly back to agent run detail or the active plan is retired. |
| Sales and board reports | `/app/reports/information`, `/app/reports` | `convex/salesReports.ts`, `convex/salesReportActions.ts`, `salesReports`, knowledge docs | `docs/end-user/sales-and-board-reports.md`, `docs/developer/sales-and-board-reports.md` | Complete pair | Refresh when report history, manual regeneration, source selection, or document export changes. |
| Sales Data workspace | `/app/[workspace]/spreadsheet-import`, `/app/[workspace]/import-data`, `/app/[workspace]/customers`, `/app/[workspace]/customers/[account]`, `/app/[workspace]/opportunity-report`, legacy `/app/sales-data` redirects | `convex/salesData.ts`, `convex/salesDataImportActions.ts`, `convex/salesDataCustomers.ts`, `convex/salesDataResearch.ts`, `convex/salesDataMarketDiscovery.ts`, `convex/salesDataReset.ts`, `convex/salesOpportunityReports.ts`, sales data tables | `docs/end-user/sales-data-workspace.md`, `docs/developer/sales-data-workspace.md`, sales-data active plans | Complete pair plus active plans | Refresh when workspace routing, import mapping, reset scope, research jobs, market discovery, or opportunity-report workflow changes. |
| Auxiliary app experiences | `/app/arcade/ronins-run`, `/app/agentic-testing` | `convex/arcade.ts`, `convex/orchestrator.ts`, `arcadeScores`, `threads`, `messages` | `docs/end-user/auxiliary-app-experiences.md`, `docs/developer/auxiliary-app-experiences.md` | Complete pair | Keep diagnostic-routing visibility and agent auto-routing behavior current. |
| Temporary Posture Studio and movement demo | `/demos/movements`, replay lab, play, capture, benchmark, proof routes | `convex/movements.ts`, movement debug scripts, `movements`, `movementDebugSessions` | `docs/end-user/temporary-posture-studio-demo.md`, `docs/developer/temporary-posture-studio-demo.md`, movement docs and active movement plan | Frozen | Do not expand except under explicit user approval and movement guardrails. |
| Local demo seed and packaging operations | package scripts, local demo seed, setup validation | `convex/localDemoSeed.ts`, `convex/localTestAuth.ts`, `scripts/local-demo-seed.mjs`, `scripts/validate-setup.mjs` | `docs/operator/local-demo-seed-runbook.md`, `docs/operator/local-test-auth-runbook.md`, `docs/operator/vertical-app-packaging-checklist.md` | Complete operator coverage | Add runbooks only for real recurring operations. |
| Developer setup, architecture, deployment, and extension | repo config, scripts, deployment workflow, starter/template docs | package scripts, `scripts/strip-verticals.mjs` and the `template:remove` fences it reads, app architecture docs | `docs/developer/getting-started.md`, `architecture.md`, `backend.md`, `frontend.md`, `deployment.md`, extension and starter docs | Covered broadly | Several short docs should be reviewed when setup, deployment, or template boundaries change. |

## Route Coverage Catalogue

Every implemented route should either be documented directly or covered by a
feature family above.

### Public And Auth Routes

- `/` - public home page, currently covered by the Public Website Plan.
- `/login` - login page and login layout.
- `/verify` - click-to-redeem magic-link confirmation page.
- `/local-test-auth` - local deterministic auth helper.
- `/w/[widgetId]` - public embedded widget runtime.
- `/kiosk/[widgetId]` - full-screen receptionist voice surface for a kiosk-enabled widget.
- `/sandbox/[widgetId]` - widget sandbox host page.
- `/api/health` - public health check.
- `/api/email-preview` - dev-only email template preview.
- Convex HTTP `/api/connectors/oauth/authorize` and `/api/connectors/oauth/callback` - connector OAuth consent legs for the Gmail mailbox and future OAuth connectors.
- `/api/e2e-auth`, `/api/e2e-fixture/face-proof`, `/api/e2e-fixture/hand-proof` - deterministic test-only routes.

### Authenticated App Routes

- `/app`
- `/app/assistant`
- `/app/assistant/[threadId]`
- `/app/calls`
- `/app/calls/[id]`
- `/app/reception`
- `/app/tasks`
- `/app/profile`
- `/app/settings`
- `/app/settings/team`
- `/app/settings/auth-diagnostics`
- `/app/properties/information`
- `/app/properties/search`
- `/app/properties/scraped-data`
- `/app/properties/scraped-data/[id]`
- `/app/properties/logs`
- `/app/reports/information`
- `/app/reports`
- `/app/governance`
- `/app/governance/register`
- `/app/governance/policies`
- `/app/governance/audit-trail`
- `/app/[workspace]/spreadsheet-import`
- `/app/[workspace]/import-data`
- `/app/[workspace]/customers`
- `/app/[workspace]/customers/[account]`
- `/app/[workspace]/opportunity-report`
- `/app/sales-data`
- `/app/sales-data/import`
- `/app/arcade/ronins-run`
- `/app/agentic-testing`

### Admin Routes

- `/admin`
- `/admin/directory`
- `/admin/governance`
- `/admin/governance/register`
- `/admin/governance/policies`
- `/admin/governance/audit-trail`
- `/admin/governance/audit-trail/[id]`
- `/admin/governance/approvals`
- `/admin/companies`
- `/admin/companies/[id]`
- `/admin/companies/[id]/overview`
- `/admin/companies/[id]/features`
- `/admin/companies/[id]/directory`
- `/admin/companies/[id]/directory/users`
- `/admin/companies/[id]/directory/invites`
- `/admin/companies/[id]/calls`
- `/admin/companies/[id]/calls/[callId]`
- `/admin/companies/[id]/mailbox`
- `/admin/companies/[id]/widget`
- `/admin/companies/[id]/ai`
- `/admin/companies/[id]/ai/prompt`
- `/admin/companies/[id]/ai/models`
- `/admin/companies/[id]/ai/rules`
- `/admin/companies/[id]/ai/rules/new`
- `/admin/companies/[id]/ai/rules/[ruleId]`
- `/admin/companies/[id]/ai/knowledge`
- `/admin/companies/[id]/ai/knowledge/[documentId]`
- `/admin/companies/[id]/ai/pages`
- `/admin/companies/[id]/ai/pages/[pageId]`
- `/admin/companies/[id]/ai/pages/map`
- `/admin/companies/[id]/ai/diary`
- `/admin/companies/[id]/ai/unanswered`
- `/admin/companies/[id]/ai/chat-logs`
- `/admin/companies/[id]/ai/chat-logs/[threadId]/evals/new`
- `/admin/companies/[id]/ai/chat-logs/[threadId]/memory-candidate/new`
- `/admin/companies/[id]/ai/evals`
- `/admin/companies/[id]/ai/evals/new`
- `/admin/companies/[id]/ai/evals/[evalCaseId]`
- `/admin/companies/[id]/ai/evals/[evalCaseId]/edit`
- `/admin/companies/[id]/ai/memory`
- `/admin/companies/[id]/ai/skills`
- `/admin/companies/[id]/ai/skills/new`
- `/admin/companies/[id]/ai/saved-answers`
- `/admin/companies/[id]/ai/usage`
- `/admin/companies/[id]/ai/money`
- `/admin/ai`
- `/admin/ai/costs`
- `/admin/ai/usage/costs`
- `/admin/ai/money`
- `/admin/ai/chat-logs`
- `/admin/ai/usage/chat-logs`
- `/admin/ai/diary`
- `/admin/ai/unanswered`
- `/admin/ai/evals`
- `/admin/ai/evals/new`
- `/admin/ai/evals/[evalCaseId]`
- `/admin/ai/evals/[evalCaseId]/edit`
- `/admin/ai/system-prompt`
- `/admin/ai/rules`
- `/admin/ai/rules/new`
- `/admin/ai/rules/[id]`
- `/admin/ai/global-knowledge`
- `/admin/ai/knowledge`
- `/admin/ai/knowledge/[pageId]`
- `/admin/ai/knowledge/map`
- `/admin/ai/voice`
- `/admin/ai/widget`
- `/admin/ai/models`
- `/admin/ai/models/[id]`
- `/admin/ai/models/catalogue`
- `/admin/ai/models/providers`
- `/admin/ai/models/defaults`
- `/admin/ai/tools`
- `/admin/ai/tools/new`
- `/admin/ai/tools/[id]`
- `/admin/ai/tools/connectors/[id]`
- `/admin/ai/tool-servers`
- `/admin/ai/skills`
- `/admin/agents`
- `/admin/agents/new`
- `/admin/agents/skills`
- `/admin/agents/[id]`
- `/admin/agents/[id]/settings`
- `/admin/agents/[id]/interfaces`
- `/admin/agents/[id]/system-prompt`
- `/admin/agents/[id]/rules`
- `/admin/agents/[id]/rules/new`
- `/admin/agents/[id]/rules/[ruleId]`
- `/admin/agents/[id]/skills`
- `/admin/agents/[id]/knowledge`
- `/admin/agents/[id]/memory`
- `/admin/agents/[id]/runs`
- `/admin/agents/[id]/observability`
- `/admin/agents/[id]/observability/[runId]`
- `/admin/agents/[id]/logs`
- `/admin/agents/[id]/logs/[logId]`
- `/admin/agents/[id]/evals`
- `/admin/agents/[id]/evals/[fixtureId]`
- `/admin/workflows`
- `/admin/workflows/[id]`
- `/admin/workflows/executions`
- `/admin/workflows/executions/[id]`
- `/admin/workflows/schedules`
- `/admin/workflows/schedules/new`
- `/admin/workflows/schedules/[id]`
- `/admin/settings`
- `/admin/settings/plans`
- `/admin/settings/api-keys`
- `/admin/settings/analytics`
- `/admin/settings/scripts`
- `/admin/settings/scripts/[scriptId]`
- `/admin/health`
- `/admin/connections`
- `/admin/auth-diagnostics`
- `/admin/audit-logs/[id]`
- `/admin/users`
- `/admin/users/invite`
- `/admin/users/[id]`
- `/admin/super-admins`
- `/admin/super-admins/invite`
- `/admin/super-admins/[id]`

### Movement Demo Routes

- `/demos/movements`
- `/demos/movements/[id]`
- `/demos/movements/[id]/play`
- `/demos/movements/information`
- `/demos/movements/replay-lab`
- `/demos/movements/squat-proof`
- `/demos/movement-capture`
- `/demos/movement-capture/deep`
- `/demos/movement-capture/benchmark`
- `/demos/movement-capture/benchmark/device`
- `/demos/movement-capture/readiness-proof`
- `/demos/movement-capture/face-model-proof`
- `/demos/movement-capture/hand-model-proof`
- `/demos/movement-capture/hand-recovery-proof`

## Convex Function Coverage Catalogue

This catalogue tracks exported Convex functions by module. It intentionally
groups helper services under the feature matrix above rather than documenting
every private TypeScript helper one-by-one.

| Module | Exported Convex functions |
| --- | --- |
| `agentEvalFixtures.ts` | `createEvalThreadInternal`, `getEvalThreadOutcomeInternal`, `getSmokeEvalGradingContextInternal`, `completeModelGradedSmokeEvalInternal` |
| `agentEvalGradingActions.ts` | `gradeSmokeEvalWithModel` |
| `agentLogs.ts` | `seedForAgent`, `insertAgentLogInternal` |
| `agentMemories.ts` | `getAlwaysMemoriesInternal`, `searchMemoryInternal`, `recordUsageInternal` |
| `agentMemoryCandidates.ts` | `generateForRunInternal` |
| `agentRunCheckpoints.ts` | `getCheckpointInternal`, `saveCheckpointInternal`, `clearCheckpointInternal`, `reactivateCheckpointInternal`, `recoverStalledRuns` |
| `agentObjectiveService.ts` | manual, scheduled, and triggered agent run objective fallback resolution |
| `agentRuns.ts`, `agentRunApprovals.ts` | run status/detail context, pending approvals/count, approval decision and expiry, run creation/status/usage/steps/tool calls, approval resume settlement, and public run status |
| `agentRuntime.ts`, `modelTurnService.ts` | `runAgentObjective`, `continueAgentObjective`, `generateAgentResponse`, `runTriggeredAgentObjective`, `resumeApprovedToolCall`, `resumeAfterRefusedToolCall`, `executeAgentNode`, shared model-turn safety/streaming/finish helpers |
| `agentSkills.ts` | skill import/preview, catalog, analytics, CRUD, archive/delete, binding, upgrade, runtime skill queries |
| `agentTransactions.ts` | `seedForAgent`, `insertTransactionInternal` |
| `agents.ts` | agent list/get/create/update/delete, templates, inherited model lookup, internal agent/tool lookup, inline agent creation, promotion |
| `aiChat.ts` | `generateSonaeResponse`, `generateThreadTitle` |
| `aiSpeech.ts` | `transcribeAudio`, `synthesizeSpeech` |
| `aiVoiceSession.ts` | `searchKnowledgeForVoice`, realtime voice session/ticket creation |
| `workflowNodeConfig.ts` | `generateNodeConfig` |
| `aiActionRequests.ts` | `reserve` |
| `aiModels.ts` | model list/search/count, provider controls, global/company defaults including vision, runtime resolution, embedding resolution, enforcement, sync upsert, backfills, pricing |
| `aiModelsActions.ts` | provider sync and provider connection test actions |
| `aiRules.ts` | public/tenant rule reads, active internal rules, seed pricing rule, rule CRUD and activation |
| `aiTools.ts` | connector install, tool listing, paginated tools, tool CRUD, agent tool binding, internal tool lookup |
| `analytics.ts` | global AI costs, platform overview, inventory metrics, global analytics, debug helpers |
| `analyticsSnapshots.ts` | daily snapshots, analytics backfills, validation, seeding, snapshot wiping |
| `systemHealth.ts` | system health and analytics data health reports |
| `platformAlerts.ts` | daily platform alert dispatch |
| `apiKeys.ts` | `authenticatePublicRequest` |
| `apify.ts` | Apify actor start/describe, Rightmove scrape, poll/sync/fetch dataset, dataset debug |
| `arcade.ts` | leaderboard listing, score count, score submission |
| `auditLogs.ts` | audit logging, audit config, purge dispatch/execution, recent log reads |
| `authEvents.ts` | `recordMagicLinkRequestAttempt` |
| `oneTimeCodes.ts` | typed one-time-code request, failed attempt recording, verified attempt recording |
| `chat.ts`, `messageEvidence.ts` | thread/message reads, upload URL generation, thread CRUD, send message, image attachment URL enrichment, assistant message/streaming saves, answer evidence reads, photo-action proposal extraction, safety refusal |
| `chatAdmin.ts` | global/company chat thread pagination |
| `companies.ts` | company list/search/options/get, create/update/delete, prompt/profile updates, plan assignment, internal purge |
| `companyEvals.ts` and actions | company eval thread creation/outcome, batch/case lookup, graded run recording, `runCompanyCheck` |
| `companyMemories.ts` and suggestions | runtime memory reads/usage, sweep input, sweep recording, sweep actions |
| `companySkills.ts` | runtime company skill reads |
| `governanceDashboard.ts`, `governanceRegister.ts`, `governanceActivity.ts` | governance overview, AI register, activity evidence |
| `evidencePack.ts`, `personalData.ts` | evidence-pack production/export recording, subject-access and erasure actions |
| `dataMigrations.ts` | migration run, batch processing, status reads |
| `inventoryRollups.ts` | global inventory rollup rebuild |
| `invites.ts` | active template read, template save, invite record creation |
| `knowledge.ts`, actions, retrieval, and evidence | document list/pagination/quality/inspection, Markdown and bulk upload, file/website queues, hybrid scoped retrieval, bounded evidence priors, source evidence, chunks, retry/repair, re-embedding, wiki distillation handoff fields |
| `wiki*.ts`, `memoryMigration.ts`, `memoryMigrationActions.ts` | company and platform wiki pages, source notes, distillation, staff agents, tending, open questions, review checkpoints, answer context, filing, feedback, wiki exams, exam growth, and memory migration into Wiki pins or AI rules |
| `voiceRelay.ts`, `voiceSettings.ts`, `voicePreview.ts` | signed relay knowledge lookup, workspace spoken-voice reads/writes, and production-path voice preview tickets |
| `kiosk.ts`, `kioskActions.ts` | receptionist screen config, anonymous kiosk threads/tokens, voice turns, heartbeat, session reservation, screen listing, and kiosk relay tickets |
| `telephony.ts`, `telephonyActions.ts`, `telephonyService.ts` | inbound phone webhook, status callback, transcript turns, call admission, Twilio signature checks, phone-number formatting/masking, post-call summary/task/customer-match/Wiki handoff |
| `tasks.ts`, `notifications.ts` | tenant task list/create/complete/reopen/cancel, assignee lookup, agent/workflow/internal task creation, photo-action confirmation, per-user notification list/count/read state, and internal notification writes |
| `localDemoSeed.ts` | local demo seed |
| `localTestAuth.ts` | local auth seed and authorization |
| `maintenanceScripts.ts` | script list/get/run |
| `mcpServers.ts`, `mcpDiscovery.ts`, `mcpToolPromotion.ts`, `mcpToolCall.ts`, `mcpProtocol.ts`, `mcpTransport.ts`, `mcpServerPolicy.ts`, `mcpToolPolicy.ts` | connected tool-server CRUD, discovery, import into `aiTools`, external tool execution, protocol parsing, transport limits, address/credential policy, tenant visibility, and untrusted-result handling |
| `movements.ts` | movement list/get/create/delete, upload/file URL, debug tracking session save/read |
| `orchestrator.ts` | `routeAgentIntent` |
| `plans.ts` | plan status, plan list/pagination, plan CRUD, billing cycle resets |
| `photoActionService.ts` | photo-action proposal instruction and structured proposal extraction |
| `properties.ts` and `propertyAgents.ts` | property list/count/get/delete, latest/admin runs, Rightmove collection start |
| `publicApi.ts` | public ping, run status, public agent trigger, public workflow trigger |
| `purges.ts` | purge config, history, manual purge, recursive execution, dispatch, cancel |
| `salesReports.ts` and actions | sales report context reads and generated report save/generation |
| `salesData.ts` and actions | workspace workbook upload/import, imported table reads, row insertion, import purge/completion |
| `salesDataCustomers.ts`, `salesDataResearch.ts`, `salesDataResearchJobs.ts`, `salesDataMarketDiscovery.ts` | customer/prospect records, typed details, research findings, research jobs, market discovery |
| `salesOpportunityReports.ts` | opportunity report read/start/watch, matching pass, gap pass, summary save |
| `scheduler.ts` | schedules CRUD/toggle/manual run, agent execution completion, workflow executions, pending workflow approvals |
| `settings.ts` | public settings read, settings update, email branding, upload URL |
| `swarmActions.ts` and `swarmRuntime.ts` | swarm execution, logs, demo agents, company context |
| `system.ts` | system prompt, analytics id, PII config reads/writes |
| `schema.ts` | authoritative Convex table, field, validator, and index declarations |
| `users.ts` | current user, upload URL, user lists, user CRUD, profile update, logins, login/logout record, impersonation, super-admin assignment |
| `webScrapeActions.ts` | `scrapeUrl` |
| `webhookDeliveries.ts` and actions | delivery reads, queue/attempt recording, dispatch |
| `webhooks.ts` | Apify webhook processing, run status update, run lookup/start, Rightmove data storage |
| `widgets.ts` | global/primary widget reads, public widget config, embed-pass gated widget thread creation, widget photo upload, receptionist opt-in persistence |
| `workflowEngine.ts` | execution init/finalize/resume/reject/expire/fail/link, database operation, dispatcher scheduling |
| `workflowExecutions.ts` | execution create/update, step upsert/read, execution read, pending-step claim |
| `workflowRuntime.ts` and retry service | start workflow, execute node, transient classification, safe-node retry/requeue/backoff, resume approval step |
| `workflows.ts` | workflow list/pagination/get, CRUD, manual trigger, public run creation, sync run, webhook, secret read |

## Schema Table Coverage Catalogue

| Domain | Tables |
| --- | --- |
| Tenancy, users, auth, and invites | `companies`, `users`, `logins`, `invitations`, `emailTemplates`, auth tables |
| System configuration and packaging | `systemSettings`, `systemConfig`, `plans`, `apiKeys`, `publicApiRequests`, `maintenanceScriptRuns`, `dataMigrations` |
| AI providers, models, prompts, rules, and costs | `aiProviders`, `aiModels`, `aiModelDefaults`, `aiModelRollups`, `aiRules`, `aiActionRequests`, `analyticsDailySnapshots`, `inventoryRollups` |
| Tools, connectors, widgets, mailbox, and webhooks | `toolConnectors`, `toolConnectorTestLogs`, `toolConnectorSecretRefs`, `toolConnectorOAuthConnections`, `connectorOAuthTokens`, `mailboxMessages`, `mcpServers`, `mcpServerTools`, `aiTools`, `agentTools`, `widgets`, `webhookDeliveries` |
| Knowledge, wiki, chat, photo actions, spoken channels, and tasks | `knowledgeDocuments`, `knowledgeChunks`, `knowledgeChunkStats`, `wikiPages`, `wikiPageSources`, `wikiDistillState`, `wikiOpenQuestions`, `wikiReviews`, `wikiPageRevisions`, `threads`, `messages`, `messageFeedback`, `phoneCalls`, `tasks`, `notifications`, `aiActionRequests`, `companies.spokenVoice` |
| Agents and runtime evidence | `agents`, `agentRuns`, `agentRunSteps`, `agentToolCalls`, `agentToolIdempotency`, `agentRunApprovals`, `agentRunFeedback`, `agentRunReflections`, `agentRunCheckpoints`, `agentTransactions`, `agentLogs`, `agentVersions`, `agentImprovementSuggestions` |
| Agent skills, evals, and memory | `agentSkills`, `agentSkillVersions`, `agentSkillBindings`, `agentSkillRollups`, `agentEvalFixtures`, `agentEvalSuitePresets`, `agentMemories`, `agentMemoryCandidates`, `agentMemoryUsage` |
| Company AI skills, evals, and memory | `companySkills`, `companySkillBindings`, `companyEvalCases`, `companyEvalRuns`, `companyMemories`, `companyMemoryCandidates`, `companyMemoryUsage`, `companyMemorySweeps`, `companyAiDriftEvents` |
| Workflows and schedules | `workflows`, `workflowExecutions`, `workflowExecutionSteps`, `schedules` |
| Property and reports | `properties`, `apifyRuns`, `salesReports` |
| Sales Data workspace | `salesDataImports`, `salesDataRows`, `salesDataCategoryLinks`, `salesDataAreasOfInterest`, `salesDataFrequencies`, `salesDataAccounts`, `salesDataCustomers`, `salesDataCustomerResearch`, `salesDataProspects`, `salesDataMarketDiscoveryJobs`, `salesDataMarketDiscoveryGroups`, `salesDataResearchJobs`, `salesDataResearchJobItems`, `salesOpportunityReports`, `salesOpportunityReportGapProducts`, `salesOpportunityReportTypeBaskets` |
| Operations, audit, and retention | `auditLogs`, `authEvents`, `purgeHistory`, `swarmLogs` |
| Auxiliary and demos | `arcadeScores`, `movements`, `movementDebugSessions`, `mockStorageMetadata` |

## Operational Script Coverage

Package scripts are grouped into these documented operational families:

- local development and verification: `dev`, `convex:dev`, `verify:env`,
  `lint`, `lint:all`, `typecheck`, `test`, `test:run`, `test:coverage`,
  `coverage:check`, `check:pagination`, `check:encoding`, `check:layering`,
  `check:guards`, `check`, `build`, `gate`, `setup:validate`
- npm lifecycle guards: `predev`, `preconvex:dev`, `prebuild`, `pretest`,
  `pretest:run`, `pretest:coverage`, `pretest:e2e`,
  `pretest:e2e:real-auth`, `preeval:movement-avatar`
- browser and auth testing: `test:e2e`, `test:e2e:real-auth`,
  `auth:local:seed`, `auth:local:state`
- demo, template, and packaging helpers: `demo:local:seed`, `template:build`
- movement proof and diagnostic families: every `movement:*` script is covered
  by the frozen movement docs and the active Movement Definitive Plan

If a future script becomes a recurring human operation rather than a developer
gate, add or refresh an operator runbook and link it from `docs/operator/index.md`.

## Current Completion Queue

1. Public website: add end-user/developer docs only after the remaining public
   routes ship. Do not document planned routes as live behavior.
2. Company AI readiness and checks: after the active rebuild and AI Checks work
   lands, refresh the dedicated end-user and developer guides.
3. Sales Data workspace: refresh the dedicated guides when import semantics,
   reset scope, research/prospecting jobs, market discovery, clear/reset
   behavior, or opportunity-report workflow changes.
4. Agent observability and autonomy: refresh the agent operation guides when
   the active observability/autonomy/run-properly plans settle.
5. Rightmove Agent execution: the Search page now queues the Rightmove Agent;
   refresh property docs again when Apify run records link visibly back to agent
   run detail or the active plan is retired.
6. Tool servers: refresh when the active tool-server plan settles, when
   live-server proof changes the operator/support boundary, or when imported
   tools gain a different approval policy.
7. Short-doc review: revisit concise guides when their implementation changes,
   especially `knowledge-management`, `maintenance-scripts`, `public-api-and-webhooks`,
   `tenancy-enforcement`, `upload-and-knowledge-policy`, and auxiliary docs.
