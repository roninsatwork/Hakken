import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

export function computeCostFromMap(model: string, inputs: number, outputs: number, modelMap: Map<string, any>) {
    const config = modelMap.get(model);
    const inRate = config ? (inputs > 200000 ? (config.standardInputCostAbove200k || 0) : (config.standardInputCostBelow200k || 0)) : 0;
    const outRate = config ? (config.outputResponseCost || 0) : 0;
    return (inputs / 1000000) * inRate + (outputs / 1000000) * outRate;
}

export const getGlobalAICosts = query({
  args: {
    timeframe: v.union(
      v.literal("today"),
      v.literal("7d"),
      v.literal("30d"),
      v.literal("ytd"),
      v.literal("custom")
    ),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").collect();
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    const defaultModelObj = aiModelsFetch.find((m: any) => m.isDefault);
    const defaultModelId = defaultModelObj ? defaultModelObj.modelId : "gemini-1.5-flash";
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized AI Logistics query");
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    // 1. Establish Temporal Boundaries
    const now = Date.now();
    let startDate = 0;
    
    if (args.timeframe === "today") startDate = new Date().setHours(0,0,0,0);
    else if (args.timeframe === "7d") startDate = now - (7 * 24 * 60 * 60 * 1000);
    else if (args.timeframe === "30d") startDate = now - (30 * 24 * 60 * 60 * 1000);
    else if (args.timeframe === "ytd") startDate = new Date(new Date().getFullYear(), 0, 1).getTime();
    else if (args.timeframe === "custom" && args.customStart) startDate = args.customStart;

    let endDate = now;
    if (args.timeframe === "custom" && args.customEnd) endDate = args.customEnd;

    // Filter target threads natively against timeframe parameters
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", startDate))
      .filter(q => q.lte(q.field("createdAt"), endDate))
      .collect();
    
    // Relational Map
    const threads = await ctx.db.query("threads").collect();
    const threadUserHashed = new Map(threads.map(t => [t._id, t.userId]));

    // Execution Variables
    let periodInputTokens = 0;
    let periodOutputTokens = 0;
    let periodCostUSD = 0;
    let periodProcessed = 0;
    const periodUniqueThreads = new Set<string>();
    const periodUniqueUsers = new Set<string>();
    
    // Aggregation Logic (Daily vs Weekly vs Monthly)
    const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    const aggregationType = durationDays > 180 ? "month" : durationDays > 60 ? "week" : "day";
    const timelineMap: Record<string, { costGBP: number }> = {};

    messages.forEach(msg => {
       const inputs = msg.inputTokens || 0;
       const outputs = msg.outputTokens || 0;
       const model = msg.modelUsed || defaultModelId; 

       const msgCost = computeCostFromMap(model, inputs, outputs, modelMap);

       // Core Execution Additions
       periodProcessed++;
       periodInputTokens += inputs;
       periodOutputTokens += outputs;
       periodCostUSD += msgCost;
       
       periodUniqueThreads.add(msg.threadId);
       const userId = threadUserHashed.get(msg.threadId);
       if (userId) periodUniqueUsers.add(userId);

       // Time-Based Timeline Grouping
       const msgDate = new Date(msg.createdAt);
       let dateString = "";

       if (aggregationType === "month") {
           dateString = msgDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
       } else if (aggregationType === "week") {
           // Basic Week approximating
           const target = new Date(msgDate.valueOf());
           const dayNr = (msgDate.getDay() + 6) % 7;
           target.setDate(target.getDate() - dayNr + 3);
           const firstThursday = target.valueOf();
           target.setMonth(0, 1);
           if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
           const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
           dateString = `Wk ${weekNum}, ${msgDate.getFullYear()}`;
       } else {
           dateString = msgDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
       }

       if (!timelineMap[dateString]) timelineMap[dateString] = { costGBP: 0 };
       timelineMap[dateString].costGBP += (msgCost * 0.78);
    });

    const periodCostGBP = periodCostUSD * 0.78;
    const avgCostPerUser = periodUniqueUsers.size > 0 ? (periodCostGBP / periodUniqueUsers.size) : 0;
    const avgCostPerThread = periodUniqueThreads.size > 0 ? (periodCostGBP / periodUniqueThreads.size) : 0;

    // Convert map to array
    const timeline = Object.keys(timelineMap).map(date => ({
       date,
       costGBP: Number(timelineMap[date].costGBP.toFixed(6))
    }));

    return {
       periodInputTokens,
       periodOutputTokens,
       periodTokens: periodInputTokens + periodOutputTokens,
       periodCostGBP: Number(periodCostGBP.toFixed(6)),
       avgCostPerUser: Number(avgCostPerUser.toFixed(6)),
       avgCostPerThread: Number(avgCostPerThread.toFixed(6)),
       periodProcessed,
       aggregationType,
       timeline
    };
  }
});

export const getPlatformOverview = query({
  args: {},
  handler: async (ctx) => {
    const aiModelsFetch = await ctx.db.query("aiModels").collect();
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    const defaultModelObj = aiModelsFetch.find((m: any) => m.isDefault);
    const defaultModelId = defaultModelObj ? defaultModelObj.modelId : "gemini-1.5-flash";
    // 1. Core Authorization Check
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    // 2. Base Structural Telemetry
    const users = await ctx.db.query("users").collect();
    const totalUsers = users.length;
    const threads = await ctx.db.query("threads").collect();
    const totalThreads = threads.length;

    // 3. Map Aggregation Parameters (Last 30 Days & Last 7 Days)
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", thirtyDaysAgo))
      .collect();
    const avgInteractionDepth = totalThreads > 0 ? (recentMessages.length / totalThreads) : 1.0;

    // 4. Financial Calculation Engine
    let total30DCostUSD = 0;
    
    // Unique user trackers
    const activeWeeklyUsers = new Set<string>();
    const userLeaderboardMap = new Map<string, { userId: string; name: string; email: string; image: string; costGBP: number; messageCount: number }>();

    // Bind messages to the physical structural accounts 
    const threadUserMap = new Map<string, string>();
    for (const t of threads) {
      if (t.userId) threadUserMap.set(t._id, t.userId);
    }

    recentMessages.forEach(msg => {
       const inputs = msg.inputTokens || 0;
       const outputs = msg.outputTokens || 0;
       const model = msg.modelUsed || defaultModelId; 

       const msgCost = computeCostFromMap(model, inputs, outputs, modelMap);
       
       total30DCostUSD += msgCost;

       const userId = threadUserMap.get(msg.threadId);
       if (userId) {
          // Log WAU
          if (msg.createdAt >= sevenDaysAgo) activeWeeklyUsers.add(userId);

          // Update Leaderboard Object
          let leader = userLeaderboardMap.get(userId);
          if (!leader) {
             const u = users.find(x => x._id === userId);
             leader = {
               userId,
               name: u?.name || "Unknown",
               email: u?.email || "",
               image: u?.image || "https://api.dicebear.com/7.x/notionists/svg",
               costGBP: 0,
               messageCount: 0
             };
             userLeaderboardMap.set(userId, leader);
          }
          leader.costGBP += (msgCost * 0.78);
          leader.messageCount += 1;
       }
    });

    const cost30DGBP = total30DCostUSD * 0.78;
    const costPerActiveUserGBP = userLeaderboardMap.size > 0 ? (cost30DGBP / userLeaderboardMap.size) : 0;

    const topUsers = Array.from(userLeaderboardMap.values()).sort((a,b) => b.costGBP - a.costGBP);

    return {
       totalUsers,
       wauCount: activeWeeklyUsers.size,
       totalThreads,
       avgInteractionDepth: Number(avgInteractionDepth.toFixed(1)),
       cost30DGBP: Number(cost30DGBP.toFixed(5)),
       costPerActiveUserGBP: Number(costPerActiveUserGBP.toFixed(5)),
       topUsers
    };
  }
});

export const getUserCostOverview = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").collect();
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    const defaultModelObj = aiModelsFetch.find((m: any) => m.isDefault);
    const defaultModelId = defaultModelObj ? defaultModelObj.modelId : "gemini-1.5-flash";
    // 1. Authorization Check
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (!admin) throw new Error("Unauthorized");

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");

    if (admin.role !== "SUPER_ADMIN") {
       if (admin.role !== "ADMIN" || admin.companyId !== targetUser.companyId || !admin.companyId) {
          throw new Error("Unauthorized: Company Admin clearance required.");
       }
    }

    // 2. Fetch User Threads
    
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    let totalCostUSD = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const enrichedThreads = await Promise.all(
      threads.map(async (thread) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .collect();
          
        let threadCostUSD = 0;
        let threadTokens = 0;
        let threadInputTokens = 0;
        let threadOutputTokens = 0;
        const messageCount = messages.length;

        messages.filter(m => m.role === "assistant").forEach(msg => {
          const inputs = msg.inputTokens || 0;
          const outputs = msg.outputTokens || 0;
          const model = msg.modelUsed || defaultModelId;

          threadInputTokens += inputs;
          threadOutputTokens += outputs;

          const msgCost = computeCostFromMap(model, inputs, outputs, modelMap);

          threadCostUSD += msgCost;
          threadTokens += (inputs + outputs);
        });

        totalCostUSD += threadCostUSD;
        totalTokens += threadTokens;
        totalInputTokens += threadInputTokens;
        totalOutputTokens += threadOutputTokens;

        return {
          threadId: thread._id,
          title: thread.title || "Untitled Conversation",
          createdAt: thread.createdAt,
          messageCount,
          threadTokens,
          costGBP: threadCostUSD * 0.78
        };
      })
    );

    return {
      totalCostGBP: Number((totalCostUSD * 0.78).toFixed(6)),
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      threads: enrichedThreads.sort((a, b) => b.createdAt - a.createdAt)
    };
  }
});

// ----------------------------------------------------
// FULL RESOLUTION REAL-TIME TELEMETRY ENGINE
// ----------------------------------------------------

export const getCompanyMetrics = query({
  args: { 
    companyId: v.id("companies"), 
    timeframe: v.union(v.literal("today"), v.literal("yesterday"), v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("ytd"), v.literal("custom")),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").collect();
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    const defaultModelObj = aiModelsFetch.find((m: any) => m.isDefault);
    const defaultModelId = defaultModelObj ? defaultModelObj.modelId : "gemini-1.5-flash";
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (!admin) throw new Error("Unauthorized");
    
    if (admin.role !== "SUPER_ADMIN") {
       if (admin.role !== "ADMIN" || admin.companyId !== args.companyId) {
          throw new Error("Unauthorized");
       }
    }

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    
    if (args.timeframe === "today") { startDate.setHours(0,0,0,0); endDate.setHours(23,59,59,999); }
    else if (args.timeframe === "yesterday") { startDate.setDate(now.getDate() - 1); startDate.setHours(0,0,0,0); endDate.setDate(now.getDate() - 1); endDate.setHours(23,59,59,999); }
    else if (args.timeframe === "7d") startDate.setDate(now.getDate() - 7);
    else if (args.timeframe === "30d") startDate.setDate(now.getDate() - 30);
    else if (args.timeframe === "90d") startDate.setDate(now.getDate() - 90);
    else if (args.timeframe === "ytd") startDate = new Date(now.getFullYear(), 0, 1);
    else if (args.timeframe === "custom" && args.customStart) startDate = new Date(args.customStart);

    if (args.timeframe === "custom" && args.customEnd) endDate = new Date(args.customEnd);

    const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const aggregationType = durationDays > 180 ? "month" : durationDays > 60 ? "week" : "day";

    let totalMessages = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostGBP = 0;
    const timelineMap: Record<string, { cost: number; messages: number; internalMessages: number; externalMessages: number; inputTokens: number; outputTokens: number }> = {};
    const modelDistribution: Record<string, { name: string; cost: number; calls: number }> = {};

    const companyObj = await ctx.db.get(args.companyId);
    let mrr = 0;
    if (companyObj?.planId) {
       const planObj = await ctx.db.get(companyObj.planId);
       if (planObj && planObj.isActive) mrr = planObj.priceGBP || 0;
    }

    const agents = await ctx.db.query("agents").collect();
    const agentMap = new Map(agents.map((a: any) => [a._id, a]));
    const agentLeaderboard: Record<string, { id: string; name: string; avatar: string; cost: number; interactions: number }> = {};
    for (const a of agents) {
       agentLeaderboard[a._id] = { id: a._id, name: a.name, avatar: a.avatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${a._id}`, cost: 0, interactions: 0 };
    }
    // Also inject the system assistant
    agentLeaderboard["system_assistant"] = { id: "system_assistant", name: "Platform Assistant (Web)", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant", cost: 0, interactions: 0 };

    const companyUsers = await ctx.db.query("users").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).collect();
    const companyUserIds = new Set(companyUsers.map((u: any) => u._id));
    
    // Natively fetch only threads related to this tenant
    const companyThreads = await ctx.db.query("threads").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).collect();
    const companyThreadIds = new Set(companyThreads.map((t: any) => t._id));

    const startTimeStamp = startDate.getTime();

    const todayStartTs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const snapshotStartTs = startDate.getTime();

    const snapshots = await ctx.db.query("analyticsDailySnapshots")
        .withIndex("by_type_date", q => q.eq("type", "global"))
        .collect();
        
    const validSnapshots = snapshots.filter(s => {
        const t = new Date(s.date).getTime();
        return t >= snapshotStartTs && t < todayStartTs;
    });

    validSnapshots.forEach(s => {
        totalMessages += s.metrics.totalMessages;
        totalTokens += (s.metrics.totalInputTokens + s.metrics.totalOutputTokens);
        totalInputTokens += s.metrics.totalInputTokens;
        totalOutputTokens += s.metrics.totalOutputTokens;
        totalCostGBP += s.metrics.costGBP;
        
        let dateGroup = s.date;
        const metricDate = new Date(s.date);
        if (aggregationType === "month") {
           dateGroup = metricDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        } else if (aggregationType === "week") {
           const target = new Date(metricDate.valueOf());
           const dayNr = (metricDate.getDay() + 6) % 7;
           target.setDate(target.getDate() - dayNr + 3);
           const firstThursday = target.valueOf();
           target.setMonth(0, 1);
           if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
           const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
           dateGroup = `Wk ${weekNum}`;
        } else {
           dateGroup = metricDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        }

        if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0, internalMessages: 0, externalMessages: 0, inputTokens: 0, outputTokens: 0 };
        timelineMap[dateGroup].cost += s.metrics.costGBP;
        timelineMap[dateGroup].messages += s.metrics.totalMessages;
        timelineMap[dateGroup].inputTokens += s.metrics.totalInputTokens;
        timelineMap[dateGroup].outputTokens += s.metrics.totalOutputTokens;

        if (s.leaderboards?.topAgents) {
            s.leaderboards.topAgents.forEach(a => {
                if (agentLeaderboard[a.id]) {
                    agentLeaderboard[a.id].cost += a.cost;
                    agentLeaderboard[a.id].interactions += a.interactions;
                }
            });
        }
        if (s.leaderboards?.topUsers) {
            s.leaderboards.topUsers.forEach(u => {
                if (userLeaderboard[u.id]) {
                    userLeaderboard[u.id].cost += u.cost;
                    userLeaderboard[u.id].messages += u.messages;
                }
            });
        }
        if (s.uniqueUserIds) s.uniqueUserIds.forEach(id => activePeriodUsers.add(id));
    });

    // Company snaps not tracked per tenant view

    const realStartTimeStamp = Math.max(startTimeStamp, todayStartTs);

    const endTimeStamp = endDate.getTime();

    // Bound Message and Tx retrieval natively to temporal bounds and indexes
    const rawMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", realStartTimeStamp))
      .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
      .collect();
      
    const periodRawMessages = rawMessages.filter((m: any) => companyThreadIds.has(m.threadId));

    const periodAgentTxs = await ctx.db.query("agentTransactions")
       .withIndex("by_company_created", q => q.eq("companyId", args.companyId).gte("createdAt", realStartTimeStamp))
       .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
       .collect();
       
    const knowledgeDocs = await ctx.db.query("knowledgeDocuments").withIndex("by_company", q => q.eq("companyId", args.companyId)).collect();

    const threadUserMap = new Map(companyThreads.map((t: any) => [t._id, t.userId]));
    const threadAgentMap = new Map(companyThreads.map((t: any) => [t._id, t.agentId]));
    const threadWidgetMap = new Map(companyThreads.map((t: any) => [t._id, t.widgetId]));
    const userLeaderboard: Record<string, { id: string; name: string; image: string; email: string; cost: number; messages: number }> = {};
    for (const u of companyUsers) {
       userLeaderboard[u._id] = {
           id: u._id,
           name: u.name || "Unknown",
           image: u.image || "https://api.dicebear.com/7.x/notionists/svg",
           email: u.email || "",
           cost: 0,
           messages: 0
       };
    }
    const activePeriodUsers = new Set<string>();
    
    userLeaderboard["WIDGET_USER_GROUP"] = {
        id: "WIDGET_USER_GROUP",
        name: "Widget User",
        image: "https://api.dicebear.com/7.x/shapes/svg?seed=WidgetUser",
        email: "anonymous@widget",
        cost: 0,
        messages: 0
    };
    
    const unifiedInteractions = [
       ...periodRawMessages.map((m: any) => ({
          userId: threadUserMap.get(m.threadId),
          widgetId: threadWidgetMap.get(m.threadId),
          agentId: threadAgentMap.get(m.threadId) || "system_assistant",
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
          createdAt: m.createdAt
       })),
       ...periodAgentTxs.map((t: any) => ({
          userId: t.userId,
          widgetId: undefined, // Txs don't have thread visibility easily, but they follow raw messages
          agentId: t.agentId,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          modelUsed: t.modelUsed || defaultModelId,
          createdAt: t.createdAt
       }))
    ];

    for (const msg of unifiedInteractions) {
       const inputs = msg.inputTokens || 0;
       const outputs = msg.outputTokens || 0;
       const model = msg.modelUsed || defaultModelId; 
       const msgCost = computeCostFromMap(model, inputs, outputs, modelMap);
       const gbpCost = msgCost * 0.78;

       totalMessages += 1;
       totalTokens += (inputs + outputs);
       totalInputTokens += inputs;
       totalOutputTokens += outputs;
       totalCostGBP += gbpCost;

       const metricDate = new Date(msg.createdAt);
       let dateGroup = "";
       if (aggregationType === "month") {
           dateGroup = metricDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
       } else if (aggregationType === "week") {
           const target = new Date(metricDate.valueOf());
           const dayNr = (metricDate.getDay() + 6) % 7;
           target.setDate(target.getDate() - dayNr + 3);
           const firstThursday = target.valueOf();
           target.setMonth(0, 1);
           if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
           const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
           dateGroup = `Wk ${weekNum}`;
       } else {
           dateGroup = metricDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
       }

       if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0, internalMessages: 0, externalMessages: 0, inputTokens: 0, outputTokens: 0 };
       timelineMap[dateGroup].cost += gbpCost;
       timelineMap[dateGroup].messages += 1;
       
       if (msg.widgetId) {
          timelineMap[dateGroup].externalMessages += 1;
       } else {
          timelineMap[dateGroup].internalMessages += 1;
       }
       
       timelineMap[dateGroup].inputTokens += inputs;
       timelineMap[dateGroup].outputTokens += outputs;

       if (!modelDistribution[model]) {
          modelDistribution[model] = { name: model, cost: 0, calls: 0 };
       }
       modelDistribution[model].cost += gbpCost;
       modelDistribution[model].calls += 1;

       if (msg.userId) {
          activePeriodUsers.add(msg.userId);
          
          const isWidgetThread = !!msg.widgetId;
          const isRegistered = companyUsers.some((u: any) => u._id === msg.userId);
          const targetLeaderId = (isRegistered && !isWidgetThread) ? msg.userId : "WIDGET_USER_GROUP";
          
          if (!userLeaderboard[targetLeaderId]) {
             const userObj = companyUsers.find((u: any) => u._id === targetLeaderId);
             userLeaderboard[targetLeaderId] = {
                id: targetLeaderId,
                name: userObj?.name || "Unknown",
                image: userObj?.image || "https://api.dicebear.com/7.x/notionists/svg",
                email: userObj?.email || "",
                cost: 0,
                messages: 0
             };
          }
          userLeaderboard[targetLeaderId].cost += gbpCost;
          userLeaderboard[targetLeaderId].messages += 1;
       }

       if (msg.agentId) {
          if (!agentLeaderboard[msg.agentId]) {
             if (msg.agentId === "system_assistant") {
                agentLeaderboard[msg.agentId] = {
                   id: "system_assistant",
                   name: "Platform Assistant (Web)",
                   avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant",
                   cost: 0,
                   interactions: 0
                };
             } else {
                 const agentObj = agentMap.get(msg.agentId);
                 agentLeaderboard[msg.agentId] = {
                    id: msg.agentId,
                    name: agentObj?.name || "Unknown Agent",
                    avatar: agentObj?.avatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.agentId}`,
                    cost: 0,
                    interactions: 0
                 };
             }
          }
          agentLeaderboard[msg.agentId].cost += gbpCost;
          agentLeaderboard[msg.agentId].interactions += 1;
       }
    }

    const timeline = Object.keys(timelineMap).map(k => ({
       date: k,
       cost: Number(timelineMap[k].cost.toFixed(4)),
       messages: timelineMap[k].messages,
       internalMessages: timelineMap[k].internalMessages,
       externalMessages: timelineMap[k].externalMessages,
       inputTokens: timelineMap[k].inputTokens,
       outputTokens: timelineMap[k].outputTokens
    }));

    const topUsers = Object.values(userLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);

    const topAgents = Object.values(agentLeaderboard)
       .sort((a,b) => b.interactions - a.interactions)
       .slice(0, 10);

    const costPerActiveUser = activePeriodUsers.size > 0 ? (totalCostGBP / activePeriodUsers.size) : 0;
    const avgCostPerMessage = totalMessages > 0 ? (totalCostGBP / totalMessages) : 0;

    return {
       timeline,
       aggregates: {
          activeUsers: activePeriodUsers.size,
          totalMessages,
          totalTokens,
          totalInputTokens,
          totalOutputTokens,
          totalCostGBP: Number(totalCostGBP.toFixed(4)),
          costPerActiveUser: Number(costPerActiveUser.toFixed(4)),
          avgCostPerMessage: Number(avgCostPerMessage.toFixed(4)),
          aggregationType,
          mrr: Number(mrr.toFixed(2)),
          knowledgeDocuments: knowledgeDocs.length,
          mau: 0
       },
       topUsers,
       topAgents,
       topCompanies: [] as any[]
    };
  }
});

export const getGlobalAnalytics = query({
  args: { 
    timeframe: v.union(v.literal("today"), v.literal("yesterday"), v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("ytd"), v.literal("custom")),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").collect();
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    const defaultModelObj = aiModelsFetch.find((m: any) => m.isDefault);
    const defaultModelId = defaultModelObj ? defaultModelObj.modelId : "gemini-1.5-flash";
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    
    if (args.timeframe === "today") { startDate.setHours(0,0,0,0); endDate.setHours(23,59,59,999); }
    else if (args.timeframe === "yesterday") { startDate.setDate(now.getDate() - 1); startDate.setHours(0,0,0,0); endDate.setDate(now.getDate() - 1); endDate.setHours(23,59,59,999); }
    else if (args.timeframe === "7d") startDate.setDate(now.getDate() - 7);
    else if (args.timeframe === "30d") startDate.setDate(now.getDate() - 30);
    else if (args.timeframe === "90d") startDate.setDate(now.getDate() - 90);
    else if (args.timeframe === "ytd") startDate = new Date(now.getFullYear(), 0, 1);
    else if (args.timeframe === "custom" && args.customStart) startDate = new Date(args.customStart);

    if (args.timeframe === "custom" && args.customEnd) endDate = new Date(args.customEnd);

    const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const aggregationType = durationDays > 180 ? "month" : durationDays > 60 ? "week" : "day";

    const users = await ctx.db.query("users").collect();
    const companies = await ctx.db.query("companies").collect();
    const companyMap = new Map(companies.map((c: any) => [c._id, c]));

    const agents = await ctx.db.query("agents").collect();
    const agentMap = new Map(agents.map((a: any) => [a._id, a]));

    let totalMessages = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostGBP = 0;
    const timelineMap: Record<string, { cost: number; messages: number; inputTokens: number; outputTokens: number }> = {};
    const modelDistribution: Record<string, { name: string; cost: number; calls: number }> = {};
    const companyLeaderboard: Record<string, { id: string; name: string; logo: string; cost: number; messages: number }> = {};
    for (const c of companies) {
       companyLeaderboard[c._id] = { id: c._id, name: c.name, logo: c.logo || "", cost: 0, messages: 0 };
    }

    const agentLeaderboard: Record<string, { id: string; name: string; avatar: string; cost: number; interactions: number }> = {};
    for (const a of agents) {
       agentLeaderboard[a._id] = { id: a._id, name: a.name, avatar: a.avatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${a._id}`, cost: 0, interactions: 0 };
    }
    // Also inject the system assistant
    agentLeaderboard["system_assistant"] = { id: "system_assistant", name: "Platform Assistant (Web)", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant", cost: 0, interactions: 0 };

    const threads = await ctx.db.query("threads").collect();
    
    const startTimeStamp = startDate.getTime();
    const endTimeStamp = endDate.getTime();
    
    const periodRawMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", startTimeStamp))
      .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
      .collect();
      
    const periodAgentTxs = await ctx.db.query("agentTransactions")
      .filter((q: any) => q.gte(q.field("createdAt"), startTimeStamp))
      .filter((q: any) => q.lte(q.field("createdAt"), endTimeStamp))
      .collect();
      
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    const thirtyDayMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", thirtyDaysAgo))
      .collect();
    const threadUserMapAll = new Map(threads.map((t: any) => [t._id, t.userId]));
    const mauSet = new Set<string>();
    for (const msg of thirtyDayMessages) {
       const uId = threadUserMapAll.get(msg.threadId);
       if (uId) mauSet.add(uId);
    }
    const thirtyDayTxs = await ctx.db.query("agentTransactions")
       .filter((q: any) => q.gte(q.field("createdAt"), thirtyDaysAgo))
       .collect();
    for (const tx of thirtyDayTxs) {
       if (tx.userId) mauSet.add(tx.userId);
    }

    const threadUserMap = new Map(threads.map((t: any) => [t._id, t.userId]));
    const threadAgentMap = new Map(threads.map((t: any) => [t._id, t.agentId]));
    const threadWidgetMap = new Map(threads.map((t: any) => [t._id, t.widgetId]));
    const userLeaderboard: Record<string, { id: string; name: string; image: string; companyName: string; email: string; cost: number; messages: number }> = {};
    for (const u of users) {
       const compObj = u.companyId ? companyMap.get(u.companyId) : null;
       userLeaderboard[u._id] = {
           id: u._id,
           name: u.name || "Unknown",
           image: u.image || "https://api.dicebear.com/7.x/notionists/svg",
           email: u.email || "",
           companyName: compObj?.name || "Independent",
           cost: 0,
           messages: 0
       };
    }
    const activePeriodUsers = new Set<string>();
    
    userLeaderboard["WIDGET_USER_GROUP"] = {
        id: "WIDGET_USER_GROUP",
        name: "Widget User",
        image: "https://api.dicebear.com/7.x/shapes/svg?seed=WidgetUser",
        companyName: "External Web Traffic",
        email: "anonymous@widget",
        cost: 0,
        messages: 0
    };
    
    const unifiedInteractions = [
       ...periodRawMessages.map((m: any) => ({
          userId: threadUserMap.get(m.threadId),
          widgetId: threadWidgetMap.get(m.threadId),
          companyId: undefined, // Resolved in loop
          agentId: threadAgentMap.get(m.threadId) || "system_assistant",
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
          createdAt: m.createdAt
       })),
       ...periodAgentTxs.map((t: any) => ({
          userId: t.userId,
          widgetId: undefined,
          companyId: t.companyId,
          agentId: t.agentId,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          modelUsed: t.modelUsed || defaultModelId,
          createdAt: t.createdAt
       }))
    ];

    for (const msg of unifiedInteractions) {
       const inputs = msg.inputTokens || 0;
       const outputs = msg.outputTokens || 0;
       const model = msg.modelUsed || defaultModelId; 
       const msgCost = computeCostFromMap(model, inputs, outputs, modelMap);
       const gbpCost = msgCost * 0.78;

       totalMessages += 1;
       totalTokens += (inputs + outputs);
       totalInputTokens += inputs;
       totalOutputTokens += outputs;
       totalCostGBP += gbpCost;

       const metricDate = new Date(msg.createdAt);
       let dateGroup = "";
       if (aggregationType === "month") {
           dateGroup = metricDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
       } else if (aggregationType === "week") {
           const target = new Date(metricDate.valueOf());
           const dayNr = (metricDate.getDay() + 6) % 7;
           target.setDate(target.getDate() - dayNr + 3);
           const firstThursday = target.valueOf();
           target.setMonth(0, 1);
           if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
           const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
           dateGroup = `Wk ${weekNum}`;
       } else {
           dateGroup = metricDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
       }

       if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0, inputTokens: 0, outputTokens: 0 };
       timelineMap[dateGroup].cost += gbpCost;
       timelineMap[dateGroup].messages += 1;
       timelineMap[dateGroup].inputTokens += inputs;
       timelineMap[dateGroup].outputTokens += outputs;

       const modelObj = modelMap.get(model);
       if (modelObj) {
           if (!modelDistribution[model]) {
              modelDistribution[model] = { name: modelObj.friendlyName || modelObj.name || model, cost: 0, calls: 0 };
           }
           modelDistribution[model].cost += gbpCost;
           modelDistribution[model].calls += 1;
       }

       if (msg.userId) {
          activePeriodUsers.add(msg.userId);
          
          const isWidgetThread = !!msg.widgetId;
          const isRegistered = users.some((u: any) => u._id === msg.userId);
          const targetLeaderId = (isRegistered && !isWidgetThread) ? msg.userId : "WIDGET_USER_GROUP";
          
          if (!userLeaderboard[targetLeaderId]) {
             const userObj = users.find((u: any) => u._id === targetLeaderId);
             const compObj = (msg.companyId || (userObj && userObj.companyId)) ? companyMap.get(msg.companyId || userObj?.companyId) : null;
             userLeaderboard[targetLeaderId] = {
                id: targetLeaderId,
                name: userObj?.name || "Unknown",
                image: userObj?.image || "https://api.dicebear.com/7.x/notionists/svg",
                email: userObj?.email || "",
                companyName: compObj?.name || "Independent",
                cost: 0,
                messages: 0
             };
          }
          userLeaderboard[targetLeaderId].cost += gbpCost;
          userLeaderboard[targetLeaderId].messages += 1;
       }

       const activeCompanyId = msg.companyId || (msg.userId ? users.find((u: any) => u._id === msg.userId)?.companyId : undefined);
       if (activeCompanyId) {
          if (!companyLeaderboard[activeCompanyId]) {
             const compObj = companyMap.get(activeCompanyId);
             companyLeaderboard[activeCompanyId] = {
                id: activeCompanyId,
                name: compObj?.name || "Unknown Company",
                logo: compObj?.logo || "",
                cost: 0,
                messages: 0
             };
          }
          companyLeaderboard[activeCompanyId].cost += gbpCost;
          companyLeaderboard[activeCompanyId].messages += 1;
       }

       if (msg.agentId) {
          if (!agentLeaderboard[msg.agentId]) {
             if (msg.agentId === "system_assistant") {
                agentLeaderboard[msg.agentId] = {
                   id: "system_assistant",
                   name: "Platform Assistant (Web)",
                   avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant",
                   cost: 0,
                   interactions: 0
                };
             } else {
                 const agentObj = agentMap.get(msg.agentId);
                 agentLeaderboard[msg.agentId] = {
                    id: msg.agentId,
                    name: agentObj?.name || "Unknown Agent",
                    avatar: agentObj?.avatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${msg.agentId}`,
                    cost: 0,
                    interactions: 0
                 };
             }
          }
          agentLeaderboard[msg.agentId].cost += gbpCost;
          agentLeaderboard[msg.agentId].interactions += 1;
       }
    }

    const timeline = Object.keys(timelineMap).map(k => ({
       date: k,
       cost: Number(timelineMap[k].cost.toFixed(4)),
       messages: timelineMap[k].messages,
       inputTokens: timelineMap[k].inputTokens,
       outputTokens: timelineMap[k].outputTokens
    }));

    const topCompanies = Object.values(companyLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);
       
    const topUsers = Object.values(userLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);

    const topAgents = Object.values(agentLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);

    const costPerActiveUser = users.length > 0 ? (totalCostGBP / users.length) : 0;
    const avgCostPerMessage = totalMessages > 0 ? (totalCostGBP / totalMessages) : 0;

    const plans = await ctx.db.query("plans")
       .withIndex("by_active", q => q.eq("isActive", true))
       .collect();
    const planMap = new Map(plans.map(p => [p._id, p.priceGBP || 0]));
    const planNameMap = new Map(plans.map(p => [p._id, p.name || "Unknown Plan"]));

    let mrr = 0;
    const planDistributionMap: Record<string, { planId: string; name: string; mrr: number; companies: number }> = {};
    
    companies.forEach(company => {
        if (company.planId && planMap.has(company.planId)) {
             const planPrice = planMap.get(company.planId) || 0;
             mrr += planPrice;
             
             if (!planDistributionMap[company.planId]) {
                 planDistributionMap[company.planId] = {
                     planId: company.planId,
                     name: planNameMap.get(company.planId) || "Unknown Plan",
                     mrr: 0,
                     companies: 0
                 };
             }
             planDistributionMap[company.planId].mrr += planPrice;
             planDistributionMap[company.planId].companies += 1;
        }
    });

    const planDistribution = Object.values(planDistributionMap).sort((a,b) => b.mrr - a.mrr);
    const modelBreakdown = Object.values(modelDistribution).sort((a,b) => b.cost - a.cost);

    return {
       timeline,
       aggregates: {
          activeUsers: activePeriodUsers.size,
          mau: mauSet.size,
          mrr: Number(mrr.toFixed(2)),
          totalMessages,
          totalTokens,
          totalInputTokens,
          totalOutputTokens,
          totalCostGBP: Number(totalCostGBP.toFixed(4)),
          costPerActiveUser: Number(costPerActiveUser.toFixed(4)),
          avgCostPerMessage: Number(avgCostPerMessage.toFixed(4)),
          aggregationType
       },
       topCompanies,
       topUsers,
       topAgents,
       modelDistribution: modelBreakdown,
       planDistribution,
       systemIntegrity: {
          totalProvisionedUsers: users.length,
          totalProvisionedCompanies: companies.length
       }
    };
  }
});


export const debugTime = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rawAgentTxs = await ctx.db.query("agentTransactions").order("desc").take(5);
    return rawAgentTxs.map(t => ({ id: t._id, userId: t.userId, tokens: t.inputTokens }));
  }
});


export const debugDb = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect();
    const companies = await ctx.db.query("companies").collect();
    return { plans, companies };
  }
});
