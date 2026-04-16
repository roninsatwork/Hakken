import { query, mutation, internalMutation } from "./_generated/server";
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
        const rawMessages = await ctx.db.query("messages").filter(q => q.eq(q.field("role"), "assistant")).collect();
    const messages = rawMessages.filter(m => m.createdAt >= startDate && m.createdAt <= endDate);
    
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
       const model = msg.modelUsed || "gemini-1.5-flash"; 

       let msgCost = computeCostFromMap(model, inputs, outputs, modelMap);

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

        const rawMessages = await ctx.db.query("messages").filter(q => q.eq(q.field("role"), "assistant")).collect();
    const avgInteractionDepth = totalThreads > 0 ? (rawMessages.length / totalThreads) : 1.0;

    // 4. Financial Calculation Engine
    const recentMessages = rawMessages.filter(m => m.createdAt >= thirtyDaysAgo);
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
       const model = msg.modelUsed || "gemini-1.5-flash"; 

       let msgCost = computeCostFromMap(model, inputs, outputs, modelMap);
       
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
        let messageCount = messages.length;

        messages.filter(m => m.role === "assistant").forEach(msg => {
          const inputs = msg.inputTokens || 0;
          const outputs = msg.outputTokens || 0;
          const model = msg.modelUsed || "gemini-1.5-flash";

          threadInputTokens += inputs;
          threadOutputTokens += outputs;

          let msgCost = computeCostFromMap(model, inputs, outputs, modelMap);

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
    const timelineMap: Record<string, { cost: number; messages: number }> = {};

    const agents = await ctx.db.query("agents").collect();
    const agentMap = new Map(agents.map((a: any) => [a._id, a]));
    const agentLeaderboard: Record<string, { id: string; name: string; avatar: string; cost: number; interactions: number }> = {};

    const companyUsers = await ctx.db.query("users").filter((q: any) => q.eq(q.field("companyId"), args.companyId)).collect();
    const companyUserIds = new Set(companyUsers.map((u: any) => u._id));
    
    const threads = await ctx.db.query("threads").collect();
    const companyThreads = threads.filter((t: any) => companyUserIds.has(t.userId));
    const companyThreadIds = new Set(companyThreads.map((t: any) => t._id));

    const rawMessages = await ctx.db.query("messages").filter((q: any) => q.eq(q.field("role"), "assistant")).collect();
    const rawAgentTxs = await ctx.db.query("agentTransactions").filter((q: any) => q.eq(q.field("companyId"), args.companyId)).collect();

    const startTimeStamp = startDate.getTime();
    const endTimeStamp = endDate.getTime();
    
    const periodRawMessages = rawMessages.filter((m: any) => companyThreadIds.has(m.threadId) && m.createdAt >= startTimeStamp && m.createdAt <= endTimeStamp);
    const periodAgentTxs = rawAgentTxs.filter((t: any) => t.createdAt >= startTimeStamp && t.createdAt <= endTimeStamp);

    const threadUserMap = new Map(companyThreads.map((t: any) => [t._id, t.userId]));
    const threadAgentMap = new Map(companyThreads.map((t: any) => [t._id, t.agentId]));
    const userLeaderboard: Record<string, { id: string; name: string; image: string; email: string; cost: number; messages: number }> = {};
    const activePeriodUsers = new Set<string>();
    
    const unifiedInteractions = [
       ...periodRawMessages.map((m: any) => ({
          userId: threadUserMap.get(m.threadId),
          agentId: threadAgentMap.get(m.threadId) || "system_assistant",
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || "gemini-1.5-flash",
          createdAt: m.createdAt
       })),
       ...periodAgentTxs.map((t: any) => ({
          userId: t.userId,
          agentId: t.agentId,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          modelUsed: t.modelUsed || "gemini-1.5-flash",
          createdAt: t.createdAt
       }))
    ];

    for (const msg of unifiedInteractions) {
       const inputs = msg.inputTokens || 0;
       const outputs = msg.outputTokens || 0;
       const model = msg.modelUsed || "gemini-1.5-flash"; 
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

       if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0 };
       timelineMap[dateGroup].cost += gbpCost;
       timelineMap[dateGroup].messages += 1;

       if (msg.userId) {
          activePeriodUsers.add(msg.userId);
          
          if (!userLeaderboard[msg.userId]) {
             const userObj = companyUsers.find((u: any) => u._id === msg.userId);
             userLeaderboard[msg.userId] = {
                id: msg.userId,
                name: userObj?.name || "Unknown",
                image: userObj?.image || "https://api.dicebear.com/7.x/notionists/svg",
                email: userObj?.email || "",
                cost: 0,
                messages: 0
             };
          }
          userLeaderboard[msg.userId].cost += gbpCost;
          userLeaderboard[msg.userId].messages += 1;
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
       messages: timelineMap[k].messages
    }));

    const topUsers = Object.values(userLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);

    const topAgents = Object.values(agentLeaderboard)
       .sort((a,b) => b.cost - a.cost)
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
          mrr: 0,
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
    const timelineMap: Record<string, { cost: number; messages: number }> = {};
    const companyLeaderboard: Record<string, { id: string; name: string; logo: string; cost: number; messages: number }> = {};
    const agentLeaderboard: Record<string, { id: string; name: string; avatar: string; cost: number; interactions: number }> = {};

    const threads = await ctx.db.query("threads").collect();
    const rawMessages = await ctx.db.query("messages").filter((q: any) => q.eq(q.field("role"), "assistant")).collect();
    const rawAgentTxs = await ctx.db.query("agentTransactions").collect();
    
    const startTimeStamp = startDate.getTime();
    const endTimeStamp = endDate.getTime();
    
    const periodRawMessages = rawMessages.filter((m: any) => m.createdAt >= startTimeStamp && m.createdAt <= endTimeStamp);
    const periodAgentTxs = rawAgentTxs.filter((t: any) => t.createdAt >= startTimeStamp && t.createdAt <= endTimeStamp);
    
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    const thirtyDayMessages = rawMessages.filter((m: any) => m.createdAt >= thirtyDaysAgo);
    const threadUserMapAll = new Map(threads.map((t: any) => [t._id, t.userId]));
    const mauSet = new Set<string>();
    for (const msg of thirtyDayMessages) {
       const uId = threadUserMapAll.get(msg.threadId);
       if (uId) mauSet.add(uId);
    }
    const thirtyDayTxs = rawAgentTxs.filter((t: any) => t.createdAt >= thirtyDaysAgo);
    for (const tx of thirtyDayTxs) {
       if (tx.userId) mauSet.add(tx.userId);
    }

    const threadUserMap = new Map(threads.map((t: any) => [t._id, t.userId]));
    const threadAgentMap = new Map(threads.map((t: any) => [t._id, t.agentId]));
    const userLeaderboard: Record<string, { id: string; name: string; image: string; companyName: string; email: string; cost: number; messages: number }> = {};
    const activePeriodUsers = new Set<string>();
    
    const unifiedInteractions = [
       ...periodRawMessages.map((m: any) => ({
          userId: threadUserMap.get(m.threadId),
          companyId: undefined, // Resolved in loop
          agentId: threadAgentMap.get(m.threadId) || "system_assistant",
          inputTokens: m.inputTokens || 0,
          outputTokens: m.outputTokens || 0,
          modelUsed: m.modelUsed || "gemini-1.5-flash",
          createdAt: m.createdAt
       })),
       ...periodAgentTxs.map((t: any) => ({
          userId: t.userId,
          companyId: t.companyId,
          agentId: t.agentId,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          modelUsed: t.modelUsed || "gemini-1.5-flash",
          createdAt: t.createdAt
       }))
    ];

    for (const msg of unifiedInteractions) {
       const inputs = msg.inputTokens || 0;
       const outputs = msg.outputTokens || 0;
       const model = msg.modelUsed || "gemini-1.5-flash"; 
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

       if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0 };
       timelineMap[dateGroup].cost += gbpCost;
       timelineMap[dateGroup].messages += 1;

       if (msg.userId) {
          activePeriodUsers.add(msg.userId);
          
          if (!userLeaderboard[msg.userId]) {
             const userObj = users.find((u: any) => u._id === msg.userId);
             const compObj = (msg.companyId || (userObj && userObj.companyId)) ? companyMap.get(msg.companyId || userObj?.companyId) : null;
             userLeaderboard[msg.userId] = {
                id: msg.userId,
                name: userObj?.name || "Unknown",
                image: userObj?.image || "https://api.dicebear.com/7.x/notionists/svg",
                email: userObj?.email || "",
                companyName: compObj?.name || "Independent",
                cost: 0,
                messages: 0
             };
          }
          userLeaderboard[msg.userId].cost += gbpCost;
          userLeaderboard[msg.userId].messages += 1;
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
       messages: timelineMap[k].messages
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

    const costPerActiveUser = activePeriodUsers.size > 0 ? (totalCostGBP / activePeriodUsers.size) : 0;
    const avgCostPerMessage = totalMessages > 0 ? (totalCostGBP / totalMessages) : 0;

    const settings = await ctx.db.query("systemSettings").first() || { monthlyBasePrice: 199, monthlySeatPrice: 49 };
    const mrr = (companies.length * settings.monthlyBasePrice) + (users.length * settings.monthlySeatPrice);

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
       systemIntegrity: {
          totalProvisionedUsers: users.length,
          totalProvisionedCompanies: companies.length
       }
    };
  }
});


export const debugTime = query({
  args: {},
  handler: async (ctx) => {
    const rawAgentTxs = await ctx.db.query("agentTransactions").order("desc").take(5);
    return rawAgentTxs.map(t => ({ id: t._id, userId: t.userId, tokens: t.inputTokens }));
  }
});

