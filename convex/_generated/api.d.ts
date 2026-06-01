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
import type * as agentLogs from "../agentLogs.js";
import type * as agentRuntime from "../agentRuntime.js";
import type * as agentService from "../agentService.js";
import type * as agentTransactions from "../agentTransactions.js";
import type * as agents from "../agents.js";
import type * as ai from "../ai.js";
import type * as aiModelService from "../aiModelService.js";
import type * as aiModels from "../aiModels.js";
import type * as aiModelsActions from "../aiModelsActions.js";
import type * as aiRules from "../aiRules.js";
import type * as aiToolExecutionService from "../aiToolExecutionService.js";
import type * as aiTools from "../aiTools.js";
import type * as analytics from "../analytics.js";
import type * as analyticsCron from "../analyticsCron.js";
import type * as analyticsHybrid from "../analyticsHybrid.js";
import type * as analyticsService from "../analyticsService.js";
import type * as apify from "../apify.js";
import type * as arcade from "../arcade.js";
import type * as auditLogService from "../auditLogService.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as chat from "../chat.js";
import type * as chatAdmin from "../chatAdmin.js";
import type * as chatAdminService from "../chatAdminService.js";
import type * as chatService from "../chatService.js";
import type * as companies from "../companies.js";
import type * as companyService from "../companyService.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as debugModels from "../debugModels.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as knowledge from "../knowledge.js";
import type * as knowledgeActions from "../knowledgeActions.js";
import type * as knowledgeService from "../knowledgeService.js";
import type * as migrations from "../migrations.js";
import type * as movements from "../movements.js";
import type * as orchestrator from "../orchestrator.js";
import type * as planService from "../planService.js";
import type * as plans from "../plans.js";
import type * as properties from "../properties.js";
import type * as purgeScheduleService from "../purgeScheduleService.js";
import type * as purges from "../purges.js";
import type * as salesReportActions from "../salesReportActions.js";
import type * as salesReports from "../salesReports.js";
import type * as scheduler from "../scheduler.js";
import type * as seedAgents from "../seedAgents.js";
import type * as seedUsers from "../seedUsers.js";
import type * as seedWorkflows from "../seedWorkflows.js";
import type * as settings from "../settings.js";
import type * as settingsService from "../settingsService.js";
import type * as swarmActions from "../swarmActions.js";
import type * as swarmRuntime from "../swarmRuntime.js";
import type * as system from "../system.js";
import type * as systemService from "../systemService.js";
import type * as testQuery from "../testQuery.js";
import type * as userManagementService from "../userManagementService.js";
import type * as users from "../users.js";
import type * as utils_fileParser from "../utils/fileParser.js";
import type * as utils_pii from "../utils/pii.js";
import type * as utils_security from "../utils/security.js";
import type * as utils_templateParser from "../utils/templateParser.js";
import type * as utils_uploadPolicy from "../utils/uploadPolicy.js";
import type * as utils_workflowTypes from "../utils/workflowTypes.js";
import type * as vertexProviderService from "../vertexProviderService.js";
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
  agentLogs: typeof agentLogs;
  agentRuntime: typeof agentRuntime;
  agentService: typeof agentService;
  agentTransactions: typeof agentTransactions;
  agents: typeof agents;
  ai: typeof ai;
  aiModelService: typeof aiModelService;
  aiModels: typeof aiModels;
  aiModelsActions: typeof aiModelsActions;
  aiRules: typeof aiRules;
  aiToolExecutionService: typeof aiToolExecutionService;
  aiTools: typeof aiTools;
  analytics: typeof analytics;
  analyticsCron: typeof analyticsCron;
  analyticsHybrid: typeof analyticsHybrid;
  analyticsService: typeof analyticsService;
  apify: typeof apify;
  arcade: typeof arcade;
  auditLogService: typeof auditLogService;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  authz: typeof authz;
  chat: typeof chat;
  chatAdmin: typeof chatAdmin;
  chatAdminService: typeof chatAdminService;
  chatService: typeof chatService;
  companies: typeof companies;
  companyService: typeof companyService;
  crons: typeof crons;
  debug: typeof debug;
  debugModels: typeof debugModels;
  http: typeof http;
  invites: typeof invites;
  knowledge: typeof knowledge;
  knowledgeActions: typeof knowledgeActions;
  knowledgeService: typeof knowledgeService;
  migrations: typeof migrations;
  movements: typeof movements;
  orchestrator: typeof orchestrator;
  planService: typeof planService;
  plans: typeof plans;
  properties: typeof properties;
  purgeScheduleService: typeof purgeScheduleService;
  purges: typeof purges;
  salesReportActions: typeof salesReportActions;
  salesReports: typeof salesReports;
  scheduler: typeof scheduler;
  seedAgents: typeof seedAgents;
  seedUsers: typeof seedUsers;
  seedWorkflows: typeof seedWorkflows;
  settings: typeof settings;
  settingsService: typeof settingsService;
  swarmActions: typeof swarmActions;
  swarmRuntime: typeof swarmRuntime;
  system: typeof system;
  systemService: typeof systemService;
  testQuery: typeof testQuery;
  userManagementService: typeof userManagementService;
  users: typeof users;
  "utils/fileParser": typeof utils_fileParser;
  "utils/pii": typeof utils_pii;
  "utils/security": typeof utils_security;
  "utils/templateParser": typeof utils_templateParser;
  "utils/uploadPolicy": typeof utils_uploadPolicy;
  "utils/workflowTypes": typeof utils_workflowTypes;
  vertexProviderService: typeof vertexProviderService;
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
