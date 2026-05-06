import { internalMutation, internalAction, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { computeCostFromMap } from "./analytics";
import { internal } from "./_generated/api";

export const generateDailySnapshots = internalMutation({
  args: { 
    targetDateStr: v.optional(v.string()), // "YYYY-MM-DD", defaults to yesterday
  },
  handler: async (ctx, args) => {
    const now = new Date();
    
    // Determine the target bounds. Default: Yesterday 00:00:00 to 23:59:59 UTC
    let startTs: number;
    let endTs: number;
    let dateString: string;

    if (args.targetDateStr) {
      const parts = args.targetDateStr.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(year, month, day));
      startTs = d.getTime();
      endTs = startTs + (24 * 60 * 60 * 1000) - 1;
      dateString = args.targetDateStr;
    } else {
      const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
      startTs = yesterday.getTime();
      endTs = startTs + (24 * 60 * 60 * 1000) - 1;
      dateString = yesterday.toISOString().split("T")[0];
    }

    // Guard: Prevent duplicate snapshot generation for the same date
    const existing = await ctx.db.query("analyticsDailySnapshots")
        .withIndex("by_date", q => q.eq("date", dateString))
        .first();
    if (existing) {
        console.log(`[Analytics] Snapshots for ${dateString} already exist. Skipping.`);
        return;
    }

    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    const defaultModelObj = aiModelsFetch.find((m: any) => m.isDefault);
    const defaultModelId = defaultModelObj ? defaultModelObj.modelId : "gemini-2.5-flash";

    // Fetch all interaction data for the 24h window
    const rawMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", startTs))
      .filter(q => q.lte(q.field("createdAt"), endTs))
      .take(10000);

    const agentTxs = await ctx.db.query("agentTransactions")
      .filter(q => q.gte(q.field("createdAt"), startTs))
      .filter(q => q.lte(q.field("createdAt"), endTs))
      .take(10000);

    if (rawMessages.length === 0 && agentTxs.length === 0) {
       console.log(`[Analytics] No activity on ${dateString}. Creating empty global snapshot.`);
       await ctx.db.insert("analyticsDailySnapshots", {
           date: dateString,
           type: "global",
           metrics: { totalMessages: 0, totalInputTokens: 0, totalOutputTokens: 0, costGBP: 0, activeUsersCount: 0 },
           uniqueUserIds: [],
       });
       return;
    }

    // Helper caches
    const threads = await ctx.db.query("threads").take(10000); // In a huge DB, this would need to be paginated, but for now we rely on the same architecture
    const threadUserMap = new Map(threads.map(t => [t._id, t.userId]));
    const threadAgentMap = new Map(threads.map(t => [t._id, t.agentId]));
    const threadWidgetMap = new Map(threads.map(t => [t._id, t.widgetId]));

    const users = await ctx.db.query("users").take(10000);
    const userMap = new Map(users.map(u => [u._id, u]));

    const companies = await ctx.db.query("companies").take(10000);
    const companyMap = new Map(companies.map(c => [c._id, c]));

    const agents = await ctx.db.query("agents").take(10000);
    const agentMap = new Map(agents.map(a => [a._id, a]));

    const unifiedInteractions = [
       ...rawMessages.map(m => ({
          userId: threadUserMap.get(m.threadId),
          widgetId: threadWidgetMap.get(m.threadId),
          companyId: undefined, // Resolved below
          agentId: threadAgentMap.get(m.threadId) || "system_assistant",
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
       })),
       ...agentTxs.map(t => ({
          userId: t.userId,
          widgetId: undefined,
          companyId: t.companyId,
          agentId: t.agentId,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          modelUsed: t.modelUsed || defaultModelId,
       }))
    ];

    // Data structures for aggregation
    const globalMetrics = { messages: 0, inTokens: 0, outTokens: 0, costGBP: 0, activeUsers: new Set<string>() };
    const globalTopAgents = new Map<string, { id: string, name: string, avatar: string, cost: number, interactions: number }>();
    const globalTopUsers = new Map<string, { id: string, name: string, image: string, email: string, companyName: string, cost: number, messages: number }>();
    const globalModelMetrics = new Map<string, { model: string, cost: number, calls: number }>();

    const companyAggregates = new Map<string, any>(); // companyId -> metrics
    const userAggregates = new Map<string, any>(); // userId -> metrics

    // Build the "Widget User" fallback leader profile
    const widgetUserLeader = {
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
       const costGBP = computeCostFromMap(msg.modelUsed, inputs, outputs, modelMap) * 0.78;

       const activeCompanyId = msg.companyId || (msg.userId ? userMap.get(msg.userId)?.companyId : undefined);

       // 1. GLOBAL TALLIES
       globalMetrics.messages++;
       globalMetrics.inTokens += inputs;
       globalMetrics.outTokens += outputs;
       globalMetrics.costGBP += costGBP;
       if (msg.userId) globalMetrics.activeUsers.add(msg.userId);
       
       let gm = globalModelMetrics.get(msg.modelUsed);
       if (!gm) { gm = { model: msg.modelUsed, cost: 0, calls: 0 }; globalModelMetrics.set(msg.modelUsed, gm); }
       gm.cost += costGBP;
       gm.calls++;

       // Global Top Agents
       if (msg.agentId) {
           let ga = globalTopAgents.get(msg.agentId);
           if (!ga) {
               ga = msg.agentId === "system_assistant" 
                  ? { id: "system_assistant", name: "Platform Assistant", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant", cost: 0, interactions: 0 }
                   : { id: msg.agentId as string, name: agentMap.get(msg.agentId as any)?.name || "Unknown", avatar: agentMap.get(msg.agentId as any)?.avatar || "", cost: 0, interactions: 0 };
               globalTopAgents.set(msg.agentId, ga);
           }
           ga.cost += costGBP;
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
           gu.cost += costGBP;
           gu.messages++;
       }

       // 2. COMPANY TALLIES
       if (activeCompanyId) {
           let cAgg = companyAggregates.get(activeCompanyId);
           if (!cAgg) {
               cAgg = { messages: 0, inTokens: 0, outTokens: 0, costGBP: 0, activeUsers: new Set<string>(), topAgents: new Map(), topUsers: new Map(), modelMetrics: new Map<string, { model: string, cost: number, calls: number }>() };
               companyAggregates.set(activeCompanyId, cAgg);
           }
           cAgg.messages++;
           cAgg.inTokens += inputs;
           cAgg.outTokens += outputs;
           cAgg.costGBP += costGBP;
           if (msg.userId) cAgg.activeUsers.add(msg.userId);

           let cm = cAgg.modelMetrics.get(msg.modelUsed);
           if (!cm) { cm = { model: msg.modelUsed, cost: 0, calls: 0 }; cAgg.modelMetrics.set(msg.modelUsed, cm); }
           cm.cost += costGBP;
           cm.calls++;

           if (msg.agentId) {
               let ca = cAgg.topAgents.get(msg.agentId);
               if (!ca) {
                  ca = msg.agentId === "system_assistant" 
                     ? { id: "system_assistant", name: "Platform Assistant", avatar: "", cost: 0, interactions: 0 }
                     : { id: msg.agentId as string, name: agentMap.get(msg.agentId as any)?.name || "Unknown", avatar: "", cost: 0, interactions: 0 };
                  cAgg.topAgents.set(msg.agentId, ca);
               }
               ca.cost += costGBP;
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
               cu.cost += costGBP;
               cu.messages++;
           }
       }

       // 3. USER TALLIES (For getUserCostOverview)
       if (msg.userId && !msg.widgetId) {
           let uAgg = userAggregates.get(msg.userId);
           if (!uAgg) {
               uAgg = { messages: 0, inTokens: 0, outTokens: 0, costGBP: 0 };
               userAggregates.set(msg.userId, uAgg);
           }
           uAgg.messages++;
           uAgg.inTokens += inputs;
           uAgg.outTokens += outputs;
           uAgg.costGBP += costGBP;
       }
    }

    // --- INSERT GLOBAL SNAPSHOT ---
    await ctx.db.insert("analyticsDailySnapshots", {
        date: dateString,
        type: "global",
        metrics: {
            totalMessages: globalMetrics.messages,
            totalInputTokens: globalMetrics.inTokens,
            totalOutputTokens: globalMetrics.outTokens,
            costGBP: Number(globalMetrics.costGBP.toFixed(6)),
            activeUsersCount: globalMetrics.activeUsers.size
        },
        uniqueUserIds: Array.from(globalMetrics.activeUsers),
        modelMetrics: Array.from(globalModelMetrics.values()),
        leaderboards: {
            topAgents: Array.from(globalTopAgents.values()).sort((a,b) => b.interactions - a.interactions).slice(0,10),
            topUsers: Array.from(globalTopUsers.values()).sort((a,b) => b.cost - a.cost).slice(0,10)
        }
    });

    // --- INSERT COMPANY SNAPSHOTS ---
    for (const [compId, cAgg] of companyAggregates.entries()) {
        await ctx.db.insert("analyticsDailySnapshots", {
            date: dateString,
            type: "company",
            companyId: compId as any,
            metrics: {
                totalMessages: cAgg.messages,
                totalInputTokens: cAgg.inTokens,
                totalOutputTokens: cAgg.outTokens,
                costGBP: Number(cAgg.costGBP.toFixed(6)),
                activeUsersCount: cAgg.activeUsers.size
            },
            uniqueUserIds: Array.from(cAgg.activeUsers),
            modelMetrics: Array.from(cAgg.modelMetrics.values()),
            leaderboards: {
                topAgents: Array.from(cAgg.topAgents.values() as Iterable<any>).sort((a,b) => b.interactions - a.interactions).slice(0,10),
                topUsers: Array.from(cAgg.topUsers.values() as Iterable<any>).sort((a,b) => b.cost - a.cost).slice(0,10)
            }
        });
    }

    // --- INSERT USER SNAPSHOTS ---
    for (const [uId, uAgg] of userAggregates.entries()) {
        await ctx.db.insert("analyticsDailySnapshots", {
            date: dateString,
            type: "user",
            userId: uId as any,
            metrics: {
                totalMessages: uAgg.messages,
                totalInputTokens: uAgg.inTokens,
                totalOutputTokens: uAgg.outTokens,
                costGBP: Number(uAgg.costGBP.toFixed(6))
            },
            uniqueUserIds: [uId]
        });
    }

    console.log(`[Analytics] Successfully generated snapshots for ${dateString}`);
  }
});

// Migration helper to seed past data
export const seedHistoricalSnapshots = internalAction({
    args: { daysBack: v.number() },
    handler: async (ctx, args) => {
        const now = new Date();
        for (let i = args.daysBack; i >= 1; i--) {
            const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const dateStr = target.toISOString().split("T")[0];
            await ctx.runMutation(internal.analyticsCron.generateDailySnapshots, { targetDateStr: dateStr });
            console.log(`Dispatched snapshot job for ${dateStr}`);
        }
    }
});

export const wipeSnapshots = internalMutation({
    args: {},
    handler: async (ctx) => {
        const snaps = await ctx.db.query("analyticsDailySnapshots").take(10000);
        for (const s of snaps) {
            await ctx.db.delete(s._id);
        }
        return snaps.length;
    }
});
