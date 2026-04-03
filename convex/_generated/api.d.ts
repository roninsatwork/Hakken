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
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatAdmin from "../chatAdmin.js";
import type * as companies from "../companies.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as knowledge from "../knowledge.js";
import type * as knowledgeActions from "../knowledgeActions.js";
import type * as migrations from "../migrations.js";
import type * as orchestrator from "../orchestrator.js";
import type * as scheduler from "../scheduler.js";
import type * as settings from "../settings.js";
import type * as system from "../system.js";
import type * as users from "../users.js";
import type * as utils_pii from "../utils/pii.js";
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
  auth: typeof auth;
  chat: typeof chat;
  chatAdmin: typeof chatAdmin;
  companies: typeof companies;
  crons: typeof crons;
  debug: typeof debug;
  http: typeof http;
  invites: typeof invites;
  knowledge: typeof knowledge;
  knowledgeActions: typeof knowledgeActions;
  migrations: typeof migrations;
  orchestrator: typeof orchestrator;
  scheduler: typeof scheduler;
  settings: typeof settings;
  system: typeof system;
  users: typeof users;
  "utils/pii": typeof utils_pii;
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
