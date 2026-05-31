import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  assertAnalyticsUserAccess,
  buildModelCostContext,
  computeCostFromMap,
  requireAnalyticsAdmin,
  requireAnalyticsCompanyAccess,
  requireAnalyticsSuperAdmin,
} from "./analytics";
import {
  createTimelineMap,
  formatAnalyticsDateGroup,
  getAggregationType,
  resolveDateRange,
  resolveTimestampRange,
} from "./analyticsService";
import type { Id } from "./_generated/dataModel";

type SystemAgentId = "system_assistant";
type HybridInteraction = {
    userId?: Id<"users">;
    widgetId?: Id<"widgets">;
    companyId?: Id<"companies">;
    agentId?: Id<"agents"> | SystemAgentId;
    inputTokens: number;
    outputTokens: number;
    modelUsed: string;
    createdAt: number;
};
type CompanyLeaderboardEntry = { id: string; name: string; logo: string; cost: number; messages: number };
const SYSTEM_AGENT_ID: SystemAgentId = "system_assistant";

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
    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);
    await requireAnalyticsSuperAdmin(ctx, "Unauthorized AI Logistics query");

    // 1. Establish Temporal Boundaries
    const { start: startDate, end: endDate } = resolveTimestampRange(args);

    // Filter target threads natively against timeframe parameters
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", startDate))
      .filter(q => q.lte(q.field("createdAt"), endDate))
      .take(10000);
    
    // Relational Map
    const threads = await ctx.db.query("threads").take(10000);
    const threadUserHashed = new Map(threads.map(t => [t._id, t.userId]));

    // Execution Variables
    let periodInputTokens = 0;
    let periodOutputTokens = 0;
    let periodCostUSD = 0;
    let periodProcessed = 0;
    const periodUniqueThreads = new Set<string>();
    const periodUniqueUsers = new Set<string>();
    
    // Aggregation Logic (Daily vs Weekly vs Monthly)
    const aggregationType = getAggregationType(startDate, endDate);
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
       const dateString = formatAnalyticsDateGroup(new Date(msg.createdAt), aggregationType, { includeWeekYear: true });

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
    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);
    // 1. Core Authorization Check
    await requireAnalyticsSuperAdmin(ctx);

    // 2. Base Structural Telemetry
    const users = await ctx.db.query("users").take(10000);
    const totalUsers = users.length;
    const threads = await ctx.db.query("threads").take(10000);
    const totalThreads = threads.length;

    // 3. Map Aggregation Parameters (Last 30 Days & Last 7 Days)
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", thirtyDaysAgo))
      .take(10000);
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
    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);
    // 1. Authorization Check
    const admin = await requireAnalyticsAdmin(ctx);
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");
    assertAnalyticsUserAccess(admin, targetUser);

    // 2. Fetch User Threads
    
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10000);

    let totalCostUSD = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const enrichedThreads = await Promise.all(
      threads.map(async (thread) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .take(10000);
          
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
    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);
    await requireAnalyticsCompanyAccess(ctx, args.companyId);

    const { now, start: startDate, end: endDate } = resolveDateRange(args);
    const aggregationType = getAggregationType(startDate.getTime(), endDate.getTime());

    let totalMessages = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostGBP = 0;
    const timelineMap = createTimelineMap(
      startDate,
      endDate,
      aggregationType,
      () => ({ cost: 0, messages: 0, internalMessages: 0, externalMessages: 0, inputTokens: 0, outputTokens: 0 })
    );
    const modelDistribution: Record<string, { name: string; cost: number; calls: number }> = {};

    const companyObj = await ctx.db.get(args.companyId);
    let mrr = 0;
    if (companyObj?.planId) {
       const planObj = await ctx.db.get(companyObj.planId);
       if (planObj && planObj.isActive) mrr = planObj.priceGBP || 0;
    }

    const agents = await ctx.db.query("agents").take(10000);
    const agentMap = new Map(agents.map((a) => [a._id, a]));
    const agentLeaderboard: Record<string, { id: string; name: string; avatar: string; cost: number; interactions: number }> = {};
    for (const a of agents) {
       agentLeaderboard[a._id] = { id: a._id, name: a.name, avatar: a.avatar || `https://api.dicebear.com/7.x/shapes/svg?seed=${a._id}`, cost: 0, interactions: 0 };
    }
    // Also inject the system assistant
    agentLeaderboard["system_assistant"] = { id: "system_assistant", name: "Platform Assistant (Web)", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant", cost: 0, interactions: 0 };

    const companyUsers = await ctx.db.query("users").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(10000);
    
    // Natively fetch only threads related to this tenant
    const companyThreads = await ctx.db.query("threads").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(10000);
    const companyThreadIds = new Set(companyThreads.map((t) => t._id));

    const startTimeStamp = startDate.getTime();

    const todayStartTs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const snapshotStartTs = startDate.getTime();

    const snapshots = await ctx.db.query("analyticsDailySnapshots")
        .withIndex("by_type_date", q => q.eq("type", "global"))
        .take(10000);
        
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
        
        const dateGroup = formatAnalyticsDateGroup(new Date(s.date), aggregationType);

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
      .take(10000);
      
    const periodRawMessages = rawMessages.filter((m) => companyThreadIds.has(m.threadId));

    const periodAgentTxs = await ctx.db.query("agentTransactions")
       .withIndex("by_company_created", q => q.eq("companyId", args.companyId).gte("createdAt", realStartTimeStamp))
       .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
       .take(10000);
       
    const knowledgeDocs = await ctx.db.query("knowledgeDocuments").withIndex("by_company", q => q.eq("companyId", args.companyId)).take(10000);

    const threadUserMap = new Map(companyThreads.map((t) => [t._id, t.userId]));
    const threadAgentMap = new Map(companyThreads.map((t) => [t._id, t.agentId]));
    const threadWidgetMap = new Map(companyThreads.map((t) => [t._id, t.widgetId]));
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
    
    const unifiedInteractions: HybridInteraction[] = [
       ...periodRawMessages.map((m) => ({
          userId: threadUserMap.get(m.threadId),
          widgetId: threadWidgetMap.get(m.threadId),
          agentId: threadAgentMap.get(m.threadId) ?? SYSTEM_AGENT_ID,
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
          createdAt: m.createdAt
       })),
       ...periodAgentTxs.map((t) => ({
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

       const dateGroup = formatAnalyticsDateGroup(new Date(msg.createdAt), aggregationType);

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
          const isRegistered = companyUsers.some((u) => u._id === msg.userId);
          const targetLeaderId = (isRegistered && !isWidgetThread) ? msg.userId : "WIDGET_USER_GROUP";
          
          if (!userLeaderboard[targetLeaderId]) {
             const userObj = companyUsers.find((u) => u._id === targetLeaderId);
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
       topCompanies: [] as CompanyLeaderboardEntry[]
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
    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);
    await requireAnalyticsSuperAdmin(ctx);

    const { now, start: startDate, end: endDate } = resolveDateRange(args);
    const aggregationType = getAggregationType(startDate.getTime(), endDate.getTime());

    const users = await ctx.db.query("users").take(10000);
    const companies = await ctx.db.query("companies").take(10000);
    const companyMap = new Map(companies.map((c) => [c._id, c]));

    const agents = await ctx.db.query("agents").take(10000);
    const agentMap = new Map(agents.map((a) => [a._id, a]));

    let totalMessages = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostGBP = 0;
    const timelineMap = createTimelineMap(
      startDate,
      endDate,
      aggregationType,
      () => ({ cost: 0, messages: 0, inputTokens: 0, outputTokens: 0 })
    );
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

    const threads = await ctx.db.query("threads").take(10000);
    
    const startTimeStamp = startDate.getTime();
    const endTimeStamp = endDate.getTime();
    
    const periodRawMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", startTimeStamp))
      .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
      .take(10000);
      
    const periodAgentTxs = await ctx.db.query("agentTransactions")
      .filter((q) => q.gte(q.field("createdAt"), startTimeStamp))
      .filter((q) => q.lte(q.field("createdAt"), endTimeStamp))
      .take(10000);
      
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    const thirtyDayMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", thirtyDaysAgo))
      .take(10000);
    const threadUserMapAll = new Map(threads.map((t) => [t._id, t.userId]));
    const mauSet = new Set<string>();
    for (const msg of thirtyDayMessages) {
       const uId = threadUserMapAll.get(msg.threadId);
       if (uId) mauSet.add(uId);
    }
    const thirtyDayTxs = await ctx.db.query("agentTransactions")
       .filter((q) => q.gte(q.field("createdAt"), thirtyDaysAgo))
       .take(10000);
    for (const tx of thirtyDayTxs) {
       if (tx.userId) mauSet.add(tx.userId);
    }

    const threadUserMap = new Map(threads.map((t) => [t._id, t.userId]));
    const threadAgentMap = new Map(threads.map((t) => [t._id, t.agentId]));
    const threadWidgetMap = new Map(threads.map((t) => [t._id, t.widgetId]));
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
    
    const unifiedInteractions: HybridInteraction[] = [
       ...periodRawMessages.map((m) => ({
          userId: threadUserMap.get(m.threadId),
          widgetId: threadWidgetMap.get(m.threadId),
          companyId: undefined, // Resolved in loop
          agentId: threadAgentMap.get(m.threadId) ?? SYSTEM_AGENT_ID,
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
          createdAt: m.createdAt
       })),
       ...periodAgentTxs.map((t) => ({
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

       const dateGroup = formatAnalyticsDateGroup(new Date(msg.createdAt), aggregationType);

       if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0, inputTokens: 0, outputTokens: 0 };
       timelineMap[dateGroup].cost += gbpCost;
       timelineMap[dateGroup].messages += 1;
       timelineMap[dateGroup].inputTokens += inputs;
       timelineMap[dateGroup].outputTokens += outputs;

       const modelObj = modelMap.get(model);
       if (modelObj) {
           if (!modelDistribution[model]) {
              modelDistribution[model] = { name: modelObj.friendlyName || modelObj.displayName || model, cost: 0, calls: 0 };
           }
           modelDistribution[model].cost += gbpCost;
           modelDistribution[model].calls += 1;
       }

       if (msg.userId) {
          activePeriodUsers.add(msg.userId);
          
          const isWidgetThread = !!msg.widgetId;
          const isRegistered = users.some((u) => u._id === msg.userId);
          const targetLeaderId = (isRegistered && !isWidgetThread) ? msg.userId : "WIDGET_USER_GROUP";
          
          if (!userLeaderboard[targetLeaderId]) {
             const userObj = users.find((u) => u._id === targetLeaderId);
             const companyId = msg.companyId ?? userObj?.companyId;
             const compObj = companyId ? companyMap.get(companyId) : null;
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

       const activeCompanyId = msg.companyId || (msg.userId ? users.find((u) => u._id === msg.userId)?.companyId : undefined);
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
       .take(10000);
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
    const plans = await ctx.db.query("plans").take(10000);
    const companies = await ctx.db.query("companies").take(10000);
    return { plans, companies };
  }
});
