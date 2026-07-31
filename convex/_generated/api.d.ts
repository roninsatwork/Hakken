/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actionAuth from "../actionAuth.js";
import type * as adminQueryService from "../adminQueryService.js";
import type * as agentEvalFixtures from "../agentEvalFixtures.js";
import type * as agentEvalGradingActions from "../agentEvalGradingActions.js";
import type * as agentEvalGradingService from "../agentEvalGradingService.js";
import type * as agentFailureKeyService from "../agentFailureKeyService.js";
import type * as agentImprovementSuggestions from "../agentImprovementSuggestions.js";
import type * as agentLogGroupingService from "../agentLogGroupingService.js";
import type * as agentLogs from "../agentLogs.js";
import type * as agentMemories from "../agentMemories.js";
import type * as agentMemoryCandidates from "../agentMemoryCandidates.js";
import type * as agentObservabilityService from "../agentObservabilityService.js";
import type * as agentProviderRegistry from "../agentProviderRegistry.js";
import type * as agentProviderTypes from "../agentProviderTypes.js";
import type * as agentRunCheckpoints from "../agentRunCheckpoints.js";
import type * as agentRunContinuationService from "../agentRunContinuationService.js";
import type * as agentRunFeedback from "../agentRunFeedback.js";
import type * as agentRunReflections from "../agentRunReflections.js";
import type * as agentRunStateService from "../agentRunStateService.js";
import type * as agentRuns from "../agentRuns.js";
import type * as agentRuntime from "../agentRuntime.js";
import type * as agentRuntimeService from "../agentRuntimeService.js";
import type * as agentService from "../agentService.js";
import type * as agentSkills from "../agentSkills.js";
import type * as agentTemplates from "../agentTemplates.js";
import type * as agentTransactions from "../agentTransactions.js";
import type * as agentVersioningService from "../agentVersioningService.js";
import type * as agentVersions from "../agentVersions.js";
import type * as agents from "../agents.js";
import type * as ai from "../ai.js";
import type * as aiActionRequestService from "../aiActionRequestService.js";
import type * as aiActionRequests from "../aiActionRequests.js";
import type * as aiCostService from "../aiCostService.js";
import type * as aiModelService from "../aiModelService.js";
import type * as aiModels from "../aiModels.js";
import type * as aiModelsActions from "../aiModelsActions.js";
import type * as aiPromptAssembly from "../aiPromptAssembly.js";
import type * as aiProviderRegistry from "../aiProviderRegistry.js";
import type * as aiProviderRetryService from "../aiProviderRetryService.js";
import type * as aiRules from "../aiRules.js";
import type * as aiRuntimeTypes from "../aiRuntimeTypes.js";
import type * as aiSafetyPolicy from "../aiSafetyPolicy.js";
import type * as aiToolExecutionService from "../aiToolExecutionService.js";
import type * as aiToolIdempotencyService from "../aiToolIdempotencyService.js";
import type * as aiToolNotificationService from "../aiToolNotificationService.js";
import type * as aiToolNotificationTools from "../aiToolNotificationTools.js";
import type * as aiToolReadTools from "../aiToolReadTools.js";
import type * as aiToolWriteTools from "../aiToolWriteTools.js";
import type * as aiTools from "../aiTools.js";
import type * as analytics from "../analytics.js";
import type * as analyticsCron from "../analyticsCron.js";
import type * as analyticsService from "../analyticsService.js";
import type * as anthropicAgentProvider from "../anthropicAgentProvider.js";
import type * as anthropicMessageService from "../anthropicMessageService.js";
import type * as anthropicProviderService from "../anthropicProviderService.js";
import type * as anthropicStreamService from "../anthropicStreamService.js";
import type * as apiKeys from "../apiKeys.js";
import type * as apify from "../apify.js";
import type * as apifyActors from "../apifyActors.js";
import type * as apifyRest from "../apifyRest.js";
import type * as approvalExpiryService from "../approvalExpiryService.js";
import type * as arcade from "../arcade.js";
import type * as auditLogService from "../auditLogService.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as authEvents from "../authEvents.js";
import type * as authUserProvisioning from "../authUserProvisioning.js";
import type * as authz from "../authz.js";
import type * as chat from "../chat.js";
import type * as chatAdmin from "../chatAdmin.js";
import type * as chatAdminService from "../chatAdminService.js";
import type * as chatService from "../chatService.js";
import type * as companies from "../companies.js";
import type * as companyEngagement from "../companyEngagement.js";
import type * as companyEvalRunActions from "../companyEvalRunActions.js";
import type * as companyEvalRuns from "../companyEvalRuns.js";
import type * as companyEvals from "../companyEvals.js";
import type * as companyLearningLoop from "../companyLearningLoop.js";
import type * as companyMemories from "../companyMemories.js";
import type * as companyMemorySuggestionActions from "../companyMemorySuggestionActions.js";
import type * as companyMemorySuggestions from "../companyMemorySuggestions.js";
import type * as companyReadiness from "../companyReadiness.js";
import type * as companyService from "../companyService.js";
import type * as companySkills from "../companySkills.js";
import type * as connectorSecretPolicy from "../connectorSecretPolicy.js";
import type * as connectorSecretResolver from "../connectorSecretResolver.js";
import type * as crons from "../crons.js";
import type * as dataMigrations from "../dataMigrations.js";
import type * as emailBrandingService from "../emailBrandingService.js";
import type * as emailLayoutService from "../emailLayoutService.js";
import type * as googleAgentProvider from "../googleAgentProvider.js";
import type * as googleProviderAdapter from "../googleProviderAdapter.js";
import type * as http from "../http.js";
import type * as httpConnectorPolicy from "../httpConnectorPolicy.js";
import type * as inventoryRollups from "../inventoryRollups.js";
import type * as invites from "../invites.js";
import type * as knowledge from "../knowledge.js";
import type * as knowledgeActions from "../knowledgeActions.js";
import type * as knowledgeReembed from "../knowledgeReembed.js";
import type * as knowledgeReembedActions from "../knowledgeReembedActions.js";
import type * as knowledgeService from "../knowledgeService.js";
import type * as localDemoSeed from "../localDemoSeed.js";
import type * as localTestAuth from "../localTestAuth.js";
import type * as maintenanceScriptRegistry from "../maintenanceScriptRegistry.js";
import type * as maintenanceScripts from "../maintenanceScripts.js";
import type * as movements from "../movements.js";
import type * as openaiProviderService from "../openaiProviderService.js";
import type * as openrouterAgentProvider from "../openrouterAgentProvider.js";
import type * as openrouterMessageService from "../openrouterMessageService.js";
import type * as openrouterProviderService from "../openrouterProviderService.js";
import type * as orchestrator from "../orchestrator.js";
import type * as planService from "../planService.js";
import type * as plans from "../plans.js";
import type * as platformAlertRecipients from "../platformAlertRecipients.js";
import type * as platformAlertService from "../platformAlertService.js";
import type * as platformOverview from "../platformOverview.js";
import type * as promptCacheService from "../promptCacheService.js";
import type * as properties from "../properties.js";
import type * as propertyAgents from "../propertyAgents.js";
import type * as providerHttpService from "../providerHttpService.js";
import type * as publicApi from "../publicApi.js";
import type * as purgeScheduleService from "../purgeScheduleService.js";
import type * as purges from "../purges.js";
import type * as resendEmailService from "../resendEmailService.js";
import type * as salesData from "../salesData.js";
import type * as salesDataImportActions from "../salesDataImportActions.js";
import type * as salesDataImportService from "../salesDataImportService.js";
import type * as salesReportActions from "../salesReportActions.js";
import type * as salesReportContextService from "../salesReportContextService.js";
import type * as salesReports from "../salesReports.js";
import type * as scheduler from "../scheduler.js";
import type * as seedUsers from "../seedUsers.js";
import type * as seedWorkflows from "../seedWorkflows.js";
import type * as settings from "../settings.js";
import type * as settingsService from "../settingsService.js";
import type * as streamingService from "../streamingService.js";
import type * as swarmActions from "../swarmActions.js";
import type * as swarmRuntime from "../swarmRuntime.js";
import type * as system from "../system.js";
import type * as systemService from "../systemService.js";
import type * as tenantFunctions from "../tenantFunctions.js";
import type * as toolConnectorDefinitions from "../toolConnectorDefinitions.js";
import type * as userActivityService from "../userActivityService.js";
import type * as userManagementService from "../userManagementService.js";
import type * as users from "../users.js";
import type * as utils_agentSkillRollupService from "../utils/agentSkillRollupService.js";
import type * as utils_companyModules from "../utils/companyModules.js";
import type * as utils_fileParser from "../utils/fileParser.js";
import type * as utils_inventoryRollupService from "../utils/inventoryRollupService.js";
import type * as utils_knowledgeActionsService from "../utils/knowledgeActionsService.js";
import type * as utils_memoryApplication from "../utils/memoryApplication.js";
import type * as utils_memoryRetrieval from "../utils/memoryRetrieval.js";
import type * as utils_pii from "../utils/pii.js";
import type * as utils_salesDataModule from "../utils/salesDataModule.js";
import type * as utils_security from "../utils/security.js";
import type * as utils_skillLimits from "../utils/skillLimits.js";
import type * as utils_templateParser from "../utils/templateParser.js";
import type * as utils_uploadPolicy from "../utils/uploadPolicy.js";
import type * as utils_widgetOriginPolicy from "../utils/widgetOriginPolicy.js";
import type * as utils_workflowTypes from "../utils/workflowTypes.js";
import type * as vertexProviderService from "../vertexProviderService.js";
import type * as webScrapeActions from "../webScrapeActions.js";
import type * as webhookDeliveries from "../webhookDeliveries.js";
import type * as webhookDeliveryActions from "../webhookDeliveryActions.js";
import type * as webhooks from "../webhooks.js";
import type * as widgets from "../widgets.js";
import type * as workflowEngine from "../workflowEngine.js";
import type * as workflowExecutions from "../workflowExecutions.js";
import type * as workflowRuntime from "../workflowRuntime.js";
import type * as workflowRuntimeService from "../workflowRuntimeService.js";
import type * as workflowScheduleService from "../workflowScheduleService.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actionAuth: typeof actionAuth;
  adminQueryService: typeof adminQueryService;
  agentEvalFixtures: typeof agentEvalFixtures;
  agentEvalGradingActions: typeof agentEvalGradingActions;
  agentEvalGradingService: typeof agentEvalGradingService;
  agentFailureKeyService: typeof agentFailureKeyService;
  agentImprovementSuggestions: typeof agentImprovementSuggestions;
  agentLogGroupingService: typeof agentLogGroupingService;
  agentLogs: typeof agentLogs;
  agentMemories: typeof agentMemories;
  agentMemoryCandidates: typeof agentMemoryCandidates;
  agentObservabilityService: typeof agentObservabilityService;
  agentProviderRegistry: typeof agentProviderRegistry;
  agentProviderTypes: typeof agentProviderTypes;
  agentRunCheckpoints: typeof agentRunCheckpoints;
  agentRunContinuationService: typeof agentRunContinuationService;
  agentRunFeedback: typeof agentRunFeedback;
  agentRunReflections: typeof agentRunReflections;
  agentRunStateService: typeof agentRunStateService;
  agentRuns: typeof agentRuns;
  agentRuntime: typeof agentRuntime;
  agentRuntimeService: typeof agentRuntimeService;
  agentService: typeof agentService;
  agentSkills: typeof agentSkills;
  agentTemplates: typeof agentTemplates;
  agentTransactions: typeof agentTransactions;
  agentVersioningService: typeof agentVersioningService;
  agentVersions: typeof agentVersions;
  agents: typeof agents;
  ai: typeof ai;
  aiActionRequestService: typeof aiActionRequestService;
  aiActionRequests: typeof aiActionRequests;
  aiCostService: typeof aiCostService;
  aiModelService: typeof aiModelService;
  aiModels: typeof aiModels;
  aiModelsActions: typeof aiModelsActions;
  aiPromptAssembly: typeof aiPromptAssembly;
  aiProviderRegistry: typeof aiProviderRegistry;
  aiProviderRetryService: typeof aiProviderRetryService;
  aiRules: typeof aiRules;
  aiRuntimeTypes: typeof aiRuntimeTypes;
  aiSafetyPolicy: typeof aiSafetyPolicy;
  aiToolExecutionService: typeof aiToolExecutionService;
  aiToolIdempotencyService: typeof aiToolIdempotencyService;
  aiToolNotificationService: typeof aiToolNotificationService;
  aiToolNotificationTools: typeof aiToolNotificationTools;
  aiToolReadTools: typeof aiToolReadTools;
  aiToolWriteTools: typeof aiToolWriteTools;
  aiTools: typeof aiTools;
  analytics: typeof analytics;
  analyticsCron: typeof analyticsCron;
  analyticsService: typeof analyticsService;
  anthropicAgentProvider: typeof anthropicAgentProvider;
  anthropicMessageService: typeof anthropicMessageService;
  anthropicProviderService: typeof anthropicProviderService;
  anthropicStreamService: typeof anthropicStreamService;
  apiKeys: typeof apiKeys;
  apify: typeof apify;
  apifyActors: typeof apifyActors;
  apifyRest: typeof apifyRest;
  approvalExpiryService: typeof approvalExpiryService;
  arcade: typeof arcade;
  auditLogService: typeof auditLogService;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  authEvents: typeof authEvents;
  authUserProvisioning: typeof authUserProvisioning;
  authz: typeof authz;
  chat: typeof chat;
  chatAdmin: typeof chatAdmin;
  chatAdminService: typeof chatAdminService;
  chatService: typeof chatService;
  companies: typeof companies;
  companyEngagement: typeof companyEngagement;
  companyEvalRunActions: typeof companyEvalRunActions;
  companyEvalRuns: typeof companyEvalRuns;
  companyEvals: typeof companyEvals;
  companyLearningLoop: typeof companyLearningLoop;
  companyMemories: typeof companyMemories;
  companyMemorySuggestionActions: typeof companyMemorySuggestionActions;
  companyMemorySuggestions: typeof companyMemorySuggestions;
  companyReadiness: typeof companyReadiness;
  companyService: typeof companyService;
  companySkills: typeof companySkills;
  connectorSecretPolicy: typeof connectorSecretPolicy;
  connectorSecretResolver: typeof connectorSecretResolver;
  crons: typeof crons;
  dataMigrations: typeof dataMigrations;
  emailBrandingService: typeof emailBrandingService;
  emailLayoutService: typeof emailLayoutService;
  googleAgentProvider: typeof googleAgentProvider;
  googleProviderAdapter: typeof googleProviderAdapter;
  http: typeof http;
  httpConnectorPolicy: typeof httpConnectorPolicy;
  inventoryRollups: typeof inventoryRollups;
  invites: typeof invites;
  knowledge: typeof knowledge;
  knowledgeActions: typeof knowledgeActions;
  knowledgeReembed: typeof knowledgeReembed;
  knowledgeReembedActions: typeof knowledgeReembedActions;
  knowledgeService: typeof knowledgeService;
  localDemoSeed: typeof localDemoSeed;
  localTestAuth: typeof localTestAuth;
  maintenanceScriptRegistry: typeof maintenanceScriptRegistry;
  maintenanceScripts: typeof maintenanceScripts;
  movements: typeof movements;
  openaiProviderService: typeof openaiProviderService;
  openrouterAgentProvider: typeof openrouterAgentProvider;
  openrouterMessageService: typeof openrouterMessageService;
  openrouterProviderService: typeof openrouterProviderService;
  orchestrator: typeof orchestrator;
  planService: typeof planService;
  plans: typeof plans;
  platformAlertRecipients: typeof platformAlertRecipients;
  platformAlertService: typeof platformAlertService;
  platformOverview: typeof platformOverview;
  promptCacheService: typeof promptCacheService;
  properties: typeof properties;
  propertyAgents: typeof propertyAgents;
  providerHttpService: typeof providerHttpService;
  publicApi: typeof publicApi;
  purgeScheduleService: typeof purgeScheduleService;
  purges: typeof purges;
  resendEmailService: typeof resendEmailService;
  salesData: typeof salesData;
  salesDataImportActions: typeof salesDataImportActions;
  salesDataImportService: typeof salesDataImportService;
  salesReportActions: typeof salesReportActions;
  salesReportContextService: typeof salesReportContextService;
  salesReports: typeof salesReports;
  scheduler: typeof scheduler;
  seedUsers: typeof seedUsers;
  seedWorkflows: typeof seedWorkflows;
  settings: typeof settings;
  settingsService: typeof settingsService;
  streamingService: typeof streamingService;
  swarmActions: typeof swarmActions;
  swarmRuntime: typeof swarmRuntime;
  system: typeof system;
  systemService: typeof systemService;
  tenantFunctions: typeof tenantFunctions;
  toolConnectorDefinitions: typeof toolConnectorDefinitions;
  userActivityService: typeof userActivityService;
  userManagementService: typeof userManagementService;
  users: typeof users;
  "utils/agentSkillRollupService": typeof utils_agentSkillRollupService;
  "utils/companyModules": typeof utils_companyModules;
  "utils/fileParser": typeof utils_fileParser;
  "utils/inventoryRollupService": typeof utils_inventoryRollupService;
  "utils/knowledgeActionsService": typeof utils_knowledgeActionsService;
  "utils/memoryApplication": typeof utils_memoryApplication;
  "utils/memoryRetrieval": typeof utils_memoryRetrieval;
  "utils/pii": typeof utils_pii;
  "utils/salesDataModule": typeof utils_salesDataModule;
  "utils/security": typeof utils_security;
  "utils/skillLimits": typeof utils_skillLimits;
  "utils/templateParser": typeof utils_templateParser;
  "utils/uploadPolicy": typeof utils_uploadPolicy;
  "utils/widgetOriginPolicy": typeof utils_widgetOriginPolicy;
  "utils/workflowTypes": typeof utils_workflowTypes;
  vertexProviderService: typeof vertexProviderService;
  webScrapeActions: typeof webScrapeActions;
  webhookDeliveries: typeof webhookDeliveries;
  webhookDeliveryActions: typeof webhookDeliveryActions;
  webhooks: typeof webhooks;
  widgets: typeof widgets;
  workflowEngine: typeof workflowEngine;
  workflowExecutions: typeof workflowExecutions;
  workflowRuntime: typeof workflowRuntime;
  workflowRuntimeService: typeof workflowRuntimeService;
  workflowScheduleService: typeof workflowScheduleService;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
