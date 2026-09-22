import type { Doc, Id } from "./_generated/dataModel";
import { computeCostFromMap } from "./analyticsService";

/**
 * One day's interactions folded into the rows the snapshot tables store.
 *
 * Lifted out of `generateDailySnapshots` unchanged so the generator can read the
 * day in pages instead of one capped `take`, and so the arithmetic behind every
 * analytics screen can be exercised without a database.
 */

type SystemAgentId = "system_assistant";
type SnapshotInteraction = {
  userId?: Id<"users">;
  widgetId?: Id<"widgets">;
  companyId?: Id<"companies">;
  agentId?: Id<"agents"> | SystemAgentId;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
};
type AgentLeader = { id: string; name: string; avatar: string; cost: number; interactions: number };
type UserLeader = { id: string; name: string; image: string; email: string; companyName: string; cost: number; messages: number };
type ModelMetric = { model: string; cost: number; calls: number };
type CompanyAggregate = {
  messages: number;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  activeUsers: Set<string>;
  topAgents: Map<string, AgentLeader>;
  topUsers: Map<string, UserLeader>;
  modelMetrics: Map<string, ModelMetric>;
};
type UserAggregate = { messages: number; inTokens: number; outTokens: number; costUsd: number };

export type SnapshotJoins = {
  userMap: Map<Id<"users">, Doc<"users">>;
  companyMap: Map<Id<"companies">, Doc<"companies">>;
  agentMap: Map<Id<"agents">, Doc<"agents">>;
};

export function aggregateDailySnapshots(
  unifiedInteractions: SnapshotInteraction[],
  joins: SnapshotJoins,
  modelMap: Parameters<typeof computeCostFromMap>[3],
  dateString: string
) {
  const { userMap, companyMap, agentMap } = joins;

  // Data structures for aggregation
  const globalMetrics = { messages: 0, inTokens: 0, outTokens: 0, costUsd: 0, activeUsers: new Set<string>() };
  const globalTopAgents = new Map<string, { id: string, name: string, avatar: string, cost: number, interactions: number }>();
  const globalTopUsers = new Map<string, { id: string, name: string, image: string, email: string, companyName: string, cost: number, messages: number }>();
  const globalModelMetrics = new Map<string, { model: string, cost: number, calls: number }>();

  const companyAggregates = new Map<Id<"companies">, CompanyAggregate>(); // companyId -> metrics
  const userAggregates = new Map<Id<"users">, UserAggregate>(); // userId -> metrics

  // Build the "Widget User" fallback leader profile
  const widgetUserLeader: UserLeader = {
      id: "WIDGET_USER_GROUP",
      name: "Widget User",
      image: "https://api.dicebear.com/7.x/shapes/svg?seed=WidgetUser",
      companyName: "External Web Traffic",
      email: "anonymous@widget",
      cost: 0,
      messages: 0
  };

  // Iterate once through everything
  for (const msg of unifiedInteractions) {
     const inputs = msg.inputTokens;
     const outputs = msg.outputTokens;
     const costUsd = computeCostFromMap(msg.modelUsed, inputs, outputs, modelMap);

     const activeCompanyId = msg.companyId || (msg.userId ? userMap.get(msg.userId)?.companyId : undefined);

     // 1. GLOBAL TALLIES
     globalMetrics.messages++;
     globalMetrics.inTokens += inputs;
     globalMetrics.outTokens += outputs;
     globalMetrics.costUsd += costUsd;
     if (msg.userId) globalMetrics.activeUsers.add(msg.userId);

     let gm = globalModelMetrics.get(msg.modelUsed);
     if (!gm) { gm = { model: msg.modelUsed, cost: 0, calls: 0 }; globalModelMetrics.set(msg.modelUsed, gm); }
     gm.cost += costUsd;
     gm.calls++;

     // Global Top Agents
     if (msg.agentId) {
         let ga = globalTopAgents.get(msg.agentId);
         if (!ga) {
             ga = msg.agentId === "system_assistant" 
                ? { id: "system_assistant", name: "Platform Assistant", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant", cost: 0, interactions: 0 }
                 : { id: msg.agentId, name: agentMap.get(msg.agentId)?.name || "Unknown", avatar: agentMap.get(msg.agentId)?.avatar || "", cost: 0, interactions: 0 };
             globalTopAgents.set(msg.agentId, ga);
         }
         ga.cost += costUsd;
         ga.interactions++;
     }

     // Global Top Users
     if (msg.userId) {
         const isWidget = !!msg.widgetId;
         const targetLeaderId = (!isWidget && userMap.has(msg.userId)) ? msg.userId : "WIDGET_USER_GROUP";
         let gu = globalTopUsers.get(targetLeaderId);
         if (!gu) {
             if (targetLeaderId === "WIDGET_USER_GROUP") {
                 gu = { ...widgetUserLeader };
             } else {
                 const uObj = userMap.get(targetLeaderId);
                 gu = {
                     id: targetLeaderId,
                     name: uObj?.name || "Unknown",
                     image: uObj?.image || "",
                     email: uObj?.email || "",
                     companyName: activeCompanyId ? companyMap.get(activeCompanyId)?.name || "Independent" : "Independent",
                     cost: 0,
                     messages: 0
                 };
             }
             globalTopUsers.set(targetLeaderId, gu);
         }
         gu.cost += costUsd;
         gu.messages++;
     }

     // 2. COMPANY TALLIES
     if (activeCompanyId) {
         let cAgg = companyAggregates.get(activeCompanyId);
         if (!cAgg) {
             cAgg = { messages: 0, inTokens: 0, outTokens: 0, costUsd: 0, activeUsers: new Set<string>(), topAgents: new Map(), topUsers: new Map(), modelMetrics: new Map<string, ModelMetric>() };
             companyAggregates.set(activeCompanyId, cAgg);
         }
         cAgg.messages++;
         cAgg.inTokens += inputs;
         cAgg.outTokens += outputs;
         cAgg.costUsd += costUsd;
         if (msg.userId) cAgg.activeUsers.add(msg.userId);

         let cm = cAgg.modelMetrics.get(msg.modelUsed);
         if (!cm) { cm = { model: msg.modelUsed, cost: 0, calls: 0 }; cAgg.modelMetrics.set(msg.modelUsed, cm); }
         cm.cost += costUsd;
         cm.calls++;

         if (msg.agentId) {
             let ca = cAgg.topAgents.get(msg.agentId);
             if (!ca) {
                ca = msg.agentId === "system_assistant" 
                   ? { id: "system_assistant", name: "Platform Assistant", avatar: "", cost: 0, interactions: 0 }
                   : {
                       id: msg.agentId,
                       name: agentMap.get(msg.agentId)?.name || "Unknown",
                       avatar: agentMap.get(msg.agentId)?.avatar || "",
                       cost: 0,
                       interactions: 0
                     };
                cAgg.topAgents.set(msg.agentId, ca);
             }
             ca.cost += costUsd;
             ca.interactions++;
         }

         if (msg.userId) {
             const isWidget = !!msg.widgetId;
             const targetLeaderId = (!isWidget && userMap.has(msg.userId)) ? msg.userId : "WIDGET_USER_GROUP";
             let cu = cAgg.topUsers.get(targetLeaderId);
             if (!cu) {
                 cu = targetLeaderId === "WIDGET_USER_GROUP" ? { ...widgetUserLeader } : {
                     id: targetLeaderId,
                     name: userMap.get(targetLeaderId)?.name || "Unknown",
                     image: userMap.get(targetLeaderId)?.image || "",
                     email: userMap.get(targetLeaderId)?.email || "",
                     companyName: companyMap.get(activeCompanyId)?.name || "",
                     cost: 0,
                     messages: 0
                 };
                 cAgg.topUsers.set(targetLeaderId, cu);
             }
             cu.cost += costUsd;
             cu.messages++;
         }
     }

     // 3. USER TALLIES (For getUserCostOverview)
     if (msg.userId && !msg.widgetId) {
         let uAgg = userAggregates.get(msg.userId);
         if (!uAgg) {
             uAgg = { messages: 0, inTokens: 0, outTokens: 0, costUsd: 0 };
             userAggregates.set(msg.userId, uAgg);
         }
         uAgg.messages++;
         uAgg.inTokens += inputs;
         uAgg.outTokens += outputs;
         uAgg.costUsd += costUsd;
     }
  }

  const globalRow = {
        date: dateString,
        type: "global" as const,
        metrics: {
            totalMessages: globalMetrics.messages,
            totalInputTokens: globalMetrics.inTokens,
            totalOutputTokens: globalMetrics.outTokens,
            costUsd: Number(globalMetrics.costUsd.toFixed(6)),
            activeUsersCount: globalMetrics.activeUsers.size
        },
        uniqueUserIds: Array.from(globalMetrics.activeUsers),
        modelMetrics: Array.from(globalModelMetrics.values()),
        leaderboards: {
            topAgents: Array.from(globalTopAgents.values()).sort((a,b) => b.interactions - a.interactions).slice(0,10),
            topUsers: Array.from(globalTopUsers.values()).sort((a,b) => b.cost - a.cost).slice(0,10)
        }
  };

  const companyRows = [...companyAggregates.entries()].map(([compId, cAgg]) => ({
            date: dateString,
            type: "company" as const,
            companyId: compId,
            metrics: {
                totalMessages: cAgg.messages,
                totalInputTokens: cAgg.inTokens,
                totalOutputTokens: cAgg.outTokens,
                costUsd: Number(cAgg.costUsd.toFixed(6)),
                activeUsersCount: cAgg.activeUsers.size
            },
            uniqueUserIds: Array.from(cAgg.activeUsers),
            modelMetrics: Array.from(cAgg.modelMetrics.values()),
            leaderboards: {
                topAgents: Array.from(cAgg.topAgents.values()).sort((a,b) => b.interactions - a.interactions).slice(0,10),
                topUsers: Array.from(cAgg.topUsers.values()).sort((a,b) => b.cost - a.cost).slice(0,10)
            }
  }));

  const userRows = [...userAggregates.entries()].map(([uId, uAgg]) => ({
            date: dateString,
            type: "user" as const,
            userId: uId,
            metrics: {
                totalMessages: uAgg.messages,
                totalInputTokens: uAgg.inTokens,
                totalOutputTokens: uAgg.outTokens,
                costUsd: Number(uAgg.costUsd.toFixed(6))
            },
            uniqueUserIds: [uId]
        }));

  return { globalRow, companyRows, userRows };
}

export type { SnapshotInteraction };
