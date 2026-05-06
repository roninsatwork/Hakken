/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentLogs from "../agentLogs.js";
import type * as agentRuntime from "../agentRuntime.js";
import type * as agentTransactions from "../agentTransactions.js";
import type * as agents from "../agents.js";
import type * as ai from "../ai.js";
import type * as aiModels from "../aiModels.js";
import type * as aiModelsActions from "../aiModelsActions.js";
import type * as aiRules from "../aiRules.js";
import type * as aiTools from "../aiTools.js";
import type * as analytics from "../analytics.js";
import type * as analyticsCron from "../analyticsCron.js";
import type * as analyticsHybrid from "../analyticsHybrid.js";
import type * as arcade from "../arcade.js";
import type * as auditLogs from "../auditLogs.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatAdmin from "../chatAdmin.js";
import type * as companies from "../companies.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as debugModels from "../debugModels.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as knowledge from "../knowledge.js";
import type * as knowledgeActions from "../knowledgeActions.js";
import type * as migrations from "../migrations.js";
import type * as orchestrator from "../orchestrator.js";
import type * as plans from "../plans.js";
import type * as salesReportActions from "../salesReportActions.js";
import type * as salesReports from "../salesReports.js";
import type * as scheduler from "../scheduler.js";
import type * as seedAgents from "../seedAgents.js";
import type * as seedUsers from "../seedUsers.js";
import type * as seedWorkflows from "../seedWorkflows.js";
import type * as settings from "../settings.js";
import type * as swarmActions from "../swarmActions.js";
import type * as swarmRuntime from "../swarmRuntime.js";
import type * as system from "../system.js";
import type * as testQuery from "../testQuery.js";
import type * as users from "../users.js";
import type * as utils_fileParser from "../utils/fileParser.js";
import type * as utils_pii from "../utils/pii.js";
import type * as utils_security from "../utils/security.js";
import type * as utils_templateParser from "../utils/templateParser.js";
import type * as widgets from "../widgets.js";
import type * as workflowEngine from "../workflowEngine.js";
import type * as workflowExecutions from "../workflowExecutions.js";
import type * as workflowRuntime from "../workflowRuntime.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentLogs: typeof agentLogs;
  agentRuntime: typeof agentRuntime;
  agentTransactions: typeof agentTransactions;
  agents: typeof agents;
  ai: typeof ai;
  aiModels: typeof aiModels;
  aiModelsActions: typeof aiModelsActions;
  aiRules: typeof aiRules;
  aiTools: typeof aiTools;
  analytics: typeof analytics;
  analyticsCron: typeof analyticsCron;
  analyticsHybrid: typeof analyticsHybrid;
  arcade: typeof arcade;
  auditLogs: typeof auditLogs;
  auth: typeof auth;
  chat: typeof chat;
  chatAdmin: typeof chatAdmin;
  companies: typeof companies;
  crons: typeof crons;
  debug: typeof debug;
  debugModels: typeof debugModels;
  http: typeof http;
  invites: typeof invites;
  knowledge: typeof knowledge;
  knowledgeActions: typeof knowledgeActions;
  migrations: typeof migrations;
  orchestrator: typeof orchestrator;
  plans: typeof plans;
  salesReportActions: typeof salesReportActions;
  salesReports: typeof salesReports;
  scheduler: typeof scheduler;
  seedAgents: typeof seedAgents;
  seedUsers: typeof seedUsers;
  seedWorkflows: typeof seedWorkflows;
  settings: typeof settings;
  swarmActions: typeof swarmActions;
  swarmRuntime: typeof swarmRuntime;
  system: typeof system;
  testQuery: typeof testQuery;
  users: typeof users;
  "utils/fileParser": typeof utils_fileParser;
  "utils/pii": typeof utils_pii;
  "utils/security": typeof utils_security;
  "utils/templateParser": typeof utils_templateParser;
  widgets: typeof widgets;
  workflowEngine: typeof workflowEngine;
  workflowExecutions: typeof workflowExecutions;
  workflowRuntime: typeof workflowRuntime;
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
