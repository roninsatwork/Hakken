import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireAdmin, requireSuperAdmin } from "./authz";
import {
    createTimelineMap,
    buildModelCostContext,
    computeCostFromMap,
    formatAnalyticsDateGroup,
    getAggregationType,
    resolveDateRange,
    resolveTimestampRange,
} from "./analyticsService";

type SystemAgentId = "system_assistant";
type AnalyticsInteraction = {
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

function formatSnapshotDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

type ThreadAnalyticsContext = Pick<Doc<"threads">, "_id" | "userId" | "companyId" | "agentId" | "widgetId">;

async function loadThreadAnalyticsContext(
    ctx: QueryCtx,
    threadIds: Iterable<Id<"threads">>
) {
    const threadMap = new Map<Id<"threads">, ThreadAnalyticsContext>();
    const uniqueThreadIds = Array.from(new Set(threadIds));

    for (const threadId of uniqueThreadIds) {
        const thread = await ctx.db.get(threadId);
        if (thread) threadMap.set(threadId, thread);
    }

    return threadMap;
}

function getMessageFallbackThreadIds(messages: Doc<"messages">[]) {
    return messages
        .filter((message) => !message.analyticsDimensionsVersion)
        .map((message) => message.threadId);
}

export async function requireAnalyticsSuperAdmin(ctx: QueryCtx, unauthenticatedMessage = "Unauthorized") {
    return await requireSuperAdmin(ctx, "Unauthorized", unauthenticatedMessage);
}

export async function requireAnalyticsAdmin(ctx: QueryCtx) {
    const { user: admin } = await requireAdmin(ctx, "Unauthorized", "Unauthorized");
    return admin;
}

export function assertAnalyticsUserAccess(admin: Doc<"users">, targetUser: Doc<"users">) {
    if (admin.role !== "SUPER_ADMIN") {
       if (admin.role !== "ADMIN" || admin.companyId !== targetUser.companyId || !admin.companyId) {
          throw new Error("Unauthorized: Company Admin clearance required.");
       }
    }
}

export async function requireAnalyticsUserAccess(ctx: QueryCtx, targetUser: Doc<"users">) {
    const admin = await requireAnalyticsAdmin(ctx);
    assertAnalyticsUserAccess(admin, targetUser);
    return admin;
}

export async function requireAnalyticsCompanyAccess(ctx: QueryCtx, companyId: Id<"companies">) {
    const { user: admin } = await requireAdmin(ctx, "Unauthorized", "Unauthorized");

    if (admin.role !== "SUPER_ADMIN") {
       if (admin.role !== "ADMIN" || admin.companyId !== companyId) {
          throw new Error("Unauthorized");
       }
    }

    return admin;
}

export const getGlobalAICosts = query({
  args: {
    timeframe: v.union(v.literal("today"), v.literal("yesterday"), v.literal("7d"), v.literal("14d"), v.literal("30d"), v.literal("60d"), v.literal("90d"), v.literal("180d"), v.literal("365d"), v.literal("ytd"), v.literal("custom")),
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

    const legacyThreadMap = await loadThreadAnalyticsContext(ctx, getMessageFallbackThreadIds(messages));

    // Execution Variables
    let periodInputTokens = 0;
    let periodOutputTokens = 0;
    let periodCostUSD = 0;
    let periodProcessed = 0;
    const periodUniqueThreads = new Set<string>();
    const periodUniqueUsers = new Set<string>();
    
    // Aggregation Logic (Daily vs Weekly vs Monthly)
    const aggregationType = getAggregationType(startDate, endDate);
    const timelineMap = createTimelineMap(
      new Date(startDate),
      new Date(endDate),
      aggregationType,
      () => ({ costGBP: 0 }),
      { includeWeekYear: true }
    );


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
       const userId = msg.userId ?? legacyThreadMap.get(msg.threadId)?.userId;
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

    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", thirtyDaysAgo))
      .take(10000);

    let total30DCostUSD = 0;
    const activeWeeklyUsers = new Set<string>();
    const periodUniqueThreads = new Set<string>();
    const userLeaderboardMap = new Map<string, { userId: string; name: string; email: string; image: string; costGBP: number; messageCount: number }>();
    const legacyThreadMap = await loadThreadAnalyticsContext(ctx, getMessageFallbackThreadIds(recentMessages));
    const userCache = new Map<Id<"users">, Doc<"users"> | null>();
    const loadUser = async (userId: Id<"users">) => {
      if (!userCache.has(userId)) userCache.set(userId, await ctx.db.get(userId));
      return userCache.get(userId) ?? null;
    };

    for (const msg of recentMessages) {
      const inputs = msg.inputTokens || 0;
      const outputs = msg.outputTokens || 0;
      const model = msg.modelUsed || defaultModelId;
      const msgCost = computeCostFromMap(model, inputs, outputs, modelMap);

      total30DCostUSD += msgCost;
      periodUniqueThreads.add(msg.threadId);

      const userId = msg.userId ?? legacyThreadMap.get(msg.threadId)?.userId;
      if (userId) {
        if (msg.createdAt >= sevenDaysAgo) activeWeeklyUsers.add(userId);

        let leader = userLeaderboardMap.get(userId);
        if (!leader) {
          const u = await loadUser(userId);
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
    }

    const cost30DGBP = total30DCostUSD * 0.78;
    const costPerActiveUserGBP = userLeaderboardMap.size > 0 ? (cost30DGBP / userLeaderboardMap.size) : 0;
    const avgInteractionDepth = periodUniqueThreads.size > 0 ? (recentMessages.length / periodUniqueThreads.size) : 1.0;

    const topUsers = Array.from(userLeaderboardMap.values()).sort((a,b) => b.costGBP - a.costGBP);

    return {
       totalUsers: userLeaderboardMap.size,
       wauCount: activeWeeklyUsers.size,
       totalThreads: periodUniqueThreads.size,
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

    const now = new Date();
    const todayStartTs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const todayDate = formatSnapshotDate(new Date(todayStartTs));

    const snapshots = await ctx.db
      .query("analyticsDailySnapshots")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId))
      .filter((q) => q.lt(q.field("date"), todayDate))
      .take(10000);

    let totalCostGBP = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    snapshots.forEach((snapshot) => {
      totalCostGBP += snapshot.metrics.costGBP;
      totalInputTokens += snapshot.metrics.totalInputTokens;
      totalOutputTokens += snapshot.metrics.totalOutputTokens;
      totalTokens += snapshot.metrics.totalInputTokens + snapshot.metrics.totalOutputTokens;
    });

    const liveAssistantMessages = await ctx.db
      .query("messages")
      .withIndex("by_user_role_created", (q) => q.eq("userId", args.userId).eq("role", "assistant").gte("createdAt", todayStartTs))
      .take(10000);

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(10000);
    const threadIds = new Set(threads.map((thread) => thread._id));

    const legacyLiveMessages = await ctx.db
      .query("messages")
      .withIndex("by_role_created", (q) => q.eq("role", "assistant").gte("createdAt", todayStartTs))
      .take(10000);

    const liveMessages = [
      ...liveAssistantMessages,
      ...legacyLiveMessages.filter((message) => !message.analyticsDimensionsVersion && !message.userId && threadIds.has(message.threadId)),
    ];

    liveMessages.forEach((message) => {
      const inputs = message.inputTokens || 0;
      const outputs = message.outputTokens || 0;
      const model = message.modelUsed || defaultModelId;
      const msgCostGBP = computeCostFromMap(model, inputs, outputs, modelMap) * 0.78;

      totalCostGBP += msgCostGBP;
      totalInputTokens += inputs;
      totalOutputTokens += outputs;
      totalTokens += inputs + outputs;
    });

    return {
      totalCostGBP: Number(totalCostGBP.toFixed(6)),
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      threads: []
    };
  }
});

export const getUserCostThreads = query({
  args: {
    userId: v.id("users"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);
    const admin = await requireAnalyticsAdmin(ctx);
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("User not found");
    assertAnalyticsUserAccess(admin, targetUser);

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .paginate(args.paginationOpts);

    const enrichedThreads = await Promise.all(
      threads.page.map(async (thread) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .take(10000);
          
        let threadCostUSD = 0;
        let threadTokens = 0;
        const messageCount = messages.length;

        messages.filter(m => m.role === "assistant").forEach(msg => {
          const inputs = msg.inputTokens || 0;
          const outputs = msg.outputTokens || 0;
          const model = msg.modelUsed || defaultModelId;

          const msgCost = computeCostFromMap(model, inputs, outputs, modelMap);

          threadCostUSD += msgCost;
          threadTokens += (inputs + outputs);
        });

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
      ...threads,
      page: enrichedThreads
    };
  }
});

// ----------------------------------------------------
// FULL RESOLUTION REAL-TIME TELEMETRY ENGINE
// ----------------------------------------------------

export const getCompanyMetrics = query({
  args: { 
    companyId: v.id("companies"), 
    timeframe: v.union(v.literal("today"), v.literal("yesterday"), v.literal("7d"), v.literal("14d"), v.literal("30d"), v.literal("60d"), v.literal("90d"), v.literal("180d"), v.literal("365d"), v.literal("ytd"), v.literal("custom")),
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

    const agentLeaderboard: Record<string, { id: string; name: string; avatar: string; cost: number; interactions: number }> = {};
    agentLeaderboard["system_assistant"] = { id: "system_assistant", name: "Platform Assistant (Web)", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant", cost: 0, interactions: 0 };

    const companyUsers = await ctx.db.query("users").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(10000);
    const companyUserMap = new Map(companyUsers.map((u) => [u._id, u]));

    const startTimeStamp = startDate.getTime();
    const todayStartTs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const realStartTimeStamp = Math.max(startTimeStamp, todayStartTs);
    const endTimeStamp = endDate.getTime();

    // Bound Message and Tx retrieval natively to temporal bounds and indexes
    const companyScopedMessages = await ctx.db.query("messages")
      .withIndex("by_company_role_created", q => q.eq("companyId", args.companyId).eq("role", "assistant").gte("createdAt", realStartTimeStamp))
      .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
      .take(10000);

    const legacyMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", realStartTimeStamp))
      .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
      .take(10000);

    const legacyThreadMap = await loadThreadAnalyticsContext(ctx, getMessageFallbackThreadIds(legacyMessages));
      
    const periodRawMessages = [
      ...companyScopedMessages,
      ...legacyMessages.filter((m) => !m.analyticsDimensionsVersion && !m.companyId && legacyThreadMap.get(m.threadId)?.companyId === args.companyId),
    ];

    const periodAgentTxs = await ctx.db.query("agentTransactions")
       .withIndex("by_company_created", q => q.eq("companyId", args.companyId).gte("createdAt", realStartTimeStamp))
       .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
       .take(10000);
       
    const knowledgeDocs = await ctx.db.query("knowledgeDocuments").withIndex("by_company", q => q.eq("companyId", args.companyId)).take(10000);

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
    
    const unifiedInteractions: AnalyticsInteraction[] = [
       ...periodRawMessages.map((m) => {
          const thread = legacyThreadMap.get(m.threadId);
          return {
          userId: m.userId ?? thread?.userId,
          widgetId: m.widgetId ?? thread?.widgetId,
          companyId: m.companyId ?? thread?.companyId ?? args.companyId,
          agentId: m.agentId ?? thread?.agentId ?? SYSTEM_AGENT_ID,
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
          createdAt: m.createdAt
       };
       }),
       ...periodAgentTxs.map((t) => ({
          userId: t.userId,
          widgetId: undefined, // Txs don't have thread visibility easily, but they follow raw messages
          companyId: args.companyId,
          agentId: t.agentId,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          modelUsed: t.modelUsed || defaultModelId,
          createdAt: t.createdAt
       }))
    ];


    const snapshotStartTs = startDate.getTime();
    const snapshotStartDate = formatSnapshotDate(startDate);
    const todayDate = formatSnapshotDate(new Date(todayStartTs));
    const snapshots = await ctx.db.query("analyticsDailySnapshots")
        .withIndex("by_company_date", q => q.eq("companyId", args.companyId).gte("date", snapshotStartDate))
        .filter(q => q.lt(q.field("date"), todayDate))
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
        timelineMap[dateGroup].internalMessages += s.metrics.totalMessages; 
        timelineMap[dateGroup].inputTokens += s.metrics.totalInputTokens;
        timelineMap[dateGroup].outputTokens += s.metrics.totalOutputTokens;

        if (s.leaderboards?.topAgents) {
            s.leaderboards.topAgents.forEach(a => {
                if (!agentLeaderboard[a.id]) {
                    agentLeaderboard[a.id] = {
                        id: a.id,
                        name: a.name,
                        avatar: a.avatar,
                        cost: 0,
                        interactions: 0
                    };
                }
                agentLeaderboard[a.id].cost += a.cost;
                agentLeaderboard[a.id].interactions += a.interactions;
            });
        }
        if (s.leaderboards?.topUsers) {
            s.leaderboards.topUsers.forEach((u) => {
                if (!userLeaderboard[u.id]) {
                    userLeaderboard[u.id] = {
                        id: u.id,
                        name: u.name || "Unknown",
                        image: u.image || "https://api.dicebear.com/7.x/notionists/svg",
                        email: u.email || "",
                        cost: 0,
                        messages: 0
                    };
                }
                userLeaderboard[u.id].cost += u.cost;
                userLeaderboard[u.id].messages += u.messages;
            });
        }
        if (s.modelMetrics) {
            s.modelMetrics.forEach((m) => {
                if (!modelDistribution[m.model]) {
                    const modelObj = modelMap.get(m.model);
                    modelDistribution[m.model] = { name: modelObj?.friendlyName || modelObj?.displayName || m.model, cost: 0, calls: 0 };
                }
                modelDistribution[m.model].cost += m.cost;
                modelDistribution[m.model].calls += m.calls;
            });
        }
        if (s.uniqueUserIds) s.uniqueUserIds.forEach(id => activePeriodUsers.add(id));
    });


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
          const isRegistered = companyUserMap.has(msg.userId);
          const targetLeaderId = (isRegistered && !isWidgetThread) ? msg.userId : "WIDGET_USER_GROUP";
          
          if (!userLeaderboard[targetLeaderId]) {
             const userObj = companyUserMap.get(targetLeaderId as Id<"users">);
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
                 const agentObj = await ctx.db.get(msg.agentId);
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

export const getGlobalInventoryMetrics = query({
  args: {},
  handler: async (ctx) => {
    await requireAnalyticsSuperAdmin(ctx);

    const users = await ctx.db.query("users").take(10000);
    const companies = await ctx.db.query("companies").take(10000);
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

    return {
      aggregates: {
        mrr: Number(mrr.toFixed(2)),
      },
      planDistribution: Object.values(planDistributionMap).sort((a,b) => b.mrr - a.mrr),
      systemIntegrity: {
        totalProvisionedUsers: users.length,
        totalProvisionedCompanies: companies.length,
      }
    };
  }
});

export const getGlobalAnalytics = query({
  args: { 
    timeframe: v.union(v.literal("today"), v.literal("yesterday"), v.literal("7d"), v.literal("14d"), v.literal("30d"), v.literal("60d"), v.literal("90d"), v.literal("180d"), v.literal("365d"), v.literal("ytd"), v.literal("custom")),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").take(10000);
    const { modelMap, defaultModelId } = buildModelCostContext(aiModelsFetch);
    await requireAnalyticsSuperAdmin(ctx);

    const { now, start: startDate, end: endDate } = resolveDateRange(args);
    const aggregationType = getAggregationType(startDate.getTime(), endDate.getTime());

    const userMap = new Map<Id<"users">, Doc<"users"> | null>();
    const companyMap = new Map<Id<"companies">, Doc<"companies"> | null>();
    const agentMap = new Map<Id<"agents">, Doc<"agents"> | null>();
    const loadUser = async (userId: Id<"users">) => {
       if (!userMap.has(userId)) userMap.set(userId, await ctx.db.get(userId));
       return userMap.get(userId) ?? null;
    };
    const loadCompany = async (companyId: Id<"companies">) => {
       if (!companyMap.has(companyId)) companyMap.set(companyId, await ctx.db.get(companyId));
       return companyMap.get(companyId) ?? null;
    };
    const loadAgent = async (agentId: Id<"agents">) => {
       if (!agentMap.has(agentId)) agentMap.set(agentId, await ctx.db.get(agentId));
       return agentMap.get(agentId) ?? null;
    };

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

    const agentLeaderboard: Record<string, { id: string; name: string; avatar: string; cost: number; interactions: number }> = {};
    agentLeaderboard["system_assistant"] = { id: "system_assistant", name: "Platform Assistant (Web)", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=system_assistant", cost: 0, interactions: 0 };
    
    const startTimeStamp = startDate.getTime();
    const todayStartTs = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const realStartTimeStamp = Math.max(startTimeStamp, todayStartTs);
    const endTimeStamp = endDate.getTime();
    
    const periodRawMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", realStartTimeStamp))
      .filter(q => q.lte(q.field("createdAt"), endTimeStamp))
      .take(10000);
      
    const periodAgentTxs = await ctx.db.query("agentTransactions")
      .withIndex("by_createdAt", q => q.gte("createdAt", realStartTimeStamp))
      .filter((q) => q.lte(q.field("createdAt"), endTimeStamp))
      .take(10000);
      
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    const thirtyDayMessages = await ctx.db.query("messages")
      .withIndex("by_role_created", q => q.eq("role", "assistant").gte("createdAt", thirtyDaysAgo))
      .take(10000);

    const legacyThreadMap = await loadThreadAnalyticsContext(ctx, [
      ...getMessageFallbackThreadIds(periodRawMessages),
      ...getMessageFallbackThreadIds(thirtyDayMessages),
    ]);

    const mauSet = new Set<string>();
    for (const msg of thirtyDayMessages) {
       const uId = msg.userId ?? legacyThreadMap.get(msg.threadId)?.userId;
       if (uId) mauSet.add(uId);
    }
    const thirtyDayTxs = await ctx.db.query("agentTransactions")
       .withIndex("by_createdAt", q => q.gte("createdAt", thirtyDaysAgo))
       .take(10000);
    for (const tx of thirtyDayTxs) {
       if (tx.userId) mauSet.add(tx.userId);
    }

    const userLeaderboard: Record<string, { id: string; name: string; image: string; companyName: string; email: string; cost: number; messages: number }> = {};
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
    
    const unifiedInteractions: AnalyticsInteraction[] = [
       ...periodRawMessages.map((m) => {
          const thread = legacyThreadMap.get(m.threadId);
          return {
          userId: m.userId ?? thread?.userId,
          widgetId: m.widgetId ?? thread?.widgetId,
          companyId: m.companyId ?? thread?.companyId,
          agentId: m.agentId ?? thread?.agentId ?? SYSTEM_AGENT_ID,
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || defaultModelId,
          createdAt: m.createdAt
       };
       }),
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


    const snapshotStartTs = startDate.getTime();
    const snapshotStartDate = formatSnapshotDate(startDate);
    const todayDate = formatSnapshotDate(new Date(todayStartTs));
    const snapshots = await ctx.db.query("analyticsDailySnapshots")
        .withIndex("by_type_date", q => q.eq("type", "global").gte("date", snapshotStartDate))
        .filter(q => q.lt(q.field("date"), todayDate))
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

        if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0, inputTokens: 0, outputTokens: 0 };
        timelineMap[dateGroup].cost += s.metrics.costGBP;
        timelineMap[dateGroup].messages += s.metrics.totalMessages;
        timelineMap[dateGroup].inputTokens += s.metrics.totalInputTokens;
        timelineMap[dateGroup].outputTokens += s.metrics.totalOutputTokens;

        if (s.leaderboards?.topAgents) {
            s.leaderboards.topAgents.forEach(a => {
                if (!agentLeaderboard[a.id]) {
                    agentLeaderboard[a.id] = {
                        id: a.id,
                        name: a.name,
                        avatar: a.avatar,
                        cost: 0,
                        interactions: 0
                    };
                }
                agentLeaderboard[a.id].cost += a.cost;
                agentLeaderboard[a.id].interactions += a.interactions;
            });
        }
        if (s.leaderboards?.topUsers) {
            s.leaderboards.topUsers.forEach((u) => {
                if (!userLeaderboard[u.id]) {
                    userLeaderboard[u.id] = {
                        id: u.id,
                        name: u.name,
                        image: u.image,
                        email: u.email || "",
                        companyName: u.companyName || "Independent",
                        cost: 0,
                        messages: 0
                    };
                }
                userLeaderboard[u.id].cost += u.cost;
                userLeaderboard[u.id].messages += u.messages;
            });
        }
        if (s.modelMetrics) {
            s.modelMetrics.forEach((m) => {
                if (!modelDistribution[m.model]) {
                    const modelObj = modelMap.get(m.model);
                    modelDistribution[m.model] = { name: modelObj?.friendlyName || modelObj?.displayName || m.model, cost: 0, calls: 0 };
                }
                modelDistribution[m.model].cost += m.cost;
                modelDistribution[m.model].calls += m.calls;
            });
        }
        if (s.uniqueUserIds) s.uniqueUserIds.forEach(id => activePeriodUsers.add(id));
    });

    const companySnaps = await ctx.db.query("analyticsDailySnapshots")
        .withIndex("by_type_date", q => q.eq("type", "company").gte("date", snapshotStartDate))
        .filter(q => q.lt(q.field("date"), todayDate))
        .take(10000);
    companySnaps.filter(s => {
        const t = new Date(s.date).getTime();
        return t >= snapshotStartTs && t < todayStartTs;
    }).forEach(s => {
        if (s.companyId) {
            if (!companyLeaderboard[s.companyId]) {
                companyLeaderboard[s.companyId] = { id: s.companyId, name: "Unknown Company", logo: "", cost: 0, messages: 0 };
            }
            companyLeaderboard[s.companyId].cost += s.metrics.costGBP;
            companyLeaderboard[s.companyId].messages += s.metrics.totalMessages;
        }
    });


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
          const userObj = await loadUser(msg.userId);
          
          const isWidgetThread = !!msg.widgetId;
          const isRegistered = !!userObj;
          const targetLeaderId = (isRegistered && !isWidgetThread) ? msg.userId : "WIDGET_USER_GROUP";
          
          if (!userLeaderboard[targetLeaderId]) {
             const companyId = msg.companyId ?? userObj?.companyId;
             const compObj = companyId ? await loadCompany(companyId) : null;
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

       const activeCompanyId = msg.companyId || (msg.userId ? (await loadUser(msg.userId))?.companyId : undefined);
       if (activeCompanyId) {
          if (!companyLeaderboard[activeCompanyId]) {
             const compObj = await loadCompany(activeCompanyId);
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
                 const agentObj = await loadAgent(msg.agentId);
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

    for (const company of Object.values(companyLeaderboard)) {
       if (company.name === "Unknown Company") {
          const companyObj = await loadCompany(company.id as Id<"companies">);
          company.name = companyObj?.name || "Unknown Company";
          company.logo = companyObj?.logo || "";
       }
    }

    const topCompanies = Object.values(companyLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);
       
    const topUsers = Object.values(userLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);

    const topAgents = Object.values(agentLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);

    const costPerActiveUser = activePeriodUsers.size > 0 ? (totalCostGBP / activePeriodUsers.size) : 0;
    const avgCostPerMessage = totalMessages > 0 ? (totalCostGBP / totalMessages) : 0;
    const modelBreakdown = Object.values(modelDistribution).sort((a,b) => b.cost - a.cost);

    return {
       timeline,
       aggregates: {
          activeUsers: activePeriodUsers.size,
          mau: mauSet.size,
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
       planDistribution: [],
       systemIntegrity: undefined
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
