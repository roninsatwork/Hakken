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

    const enrichedThreads = await Promise.all(
      threads.map(async (thread) => {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .collect();
          
        let threadCostUSD = 0;
        let threadTokens = 0;
        let messageCount = messages.length;

        messages.filter(m => m.role === "assistant").forEach(msg => {
          const inputs = msg.inputTokens || 0;
          const outputs = msg.outputTokens || 0;
          const model = msg.modelUsed || "gemini-1.5-flash";

          let msgCost = computeCostFromMap(model, inputs, outputs, modelMap);

          threadCostUSD += msgCost;
          threadTokens += (inputs + outputs);
        });

        totalCostUSD += threadCostUSD;
        totalTokens += threadTokens;

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
      threads: enrichedThreads.sort((a, b) => b.createdAt - a.createdAt)
    };
  }
});

/**
 * Executes a hard compute of metrics for a specific day.
 * We extract this so both the cron job and the manual backfill can call it.
 */
async function computeMetricsForDate(ctx: any, targetDateStr?: string) {
  const aiModelsFetch = await ctx.db.query("aiModels").collect();
  const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
  const targetDate = targetDateStr ? new Date(targetDateStr) : new Date();
  if (!targetDateStr) {
    targetDate.setDate(targetDate.getDate() - 1); // Yesterday
  }
  
  const dateStr = targetDate.toISOString().split('T')[0];
  const startTime = targetDate.setUTCHours(0, 0, 0, 0);
  const endTime = targetDate.setUTCHours(23, 59, 59, 999);
  
  let companies = await ctx.db.query("companies").collect();
  
  let systemCompany = companies.find((c: any) => c.name === "Sonae System");
  if (!systemCompany) {
     const cId = await ctx.db.insert("companies", { name: "Sonae System", createdAt: Date.now() });
     systemCompany = await ctx.db.get(cId);
     companies.push(systemCompany);
  }
  
  const orphanedUsers = await ctx.db.query("users").filter((q: any) => q.eq(q.field("companyId"), undefined)).collect();
  for (const u of orphanedUsers) {
     await ctx.db.patch(u._id, { companyId: systemCompany._id });
  }
  
  for (const company of companies) {
    const users = await ctx.db
      .query("users")
      .filter((q: any) => q.eq(q.field("companyId"), company._id))
      .collect();
    
    let totalMessages = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let costUSD = 0;
    const activeUserIds = new Set<string>();
    
    for (const user of users) {
      
    const threads = await ctx.db
      .query("threads")
        .withIndex("by_user", (q: any) => q.eq("userId", user._id))
        .collect();
        
      let userWasActive = false;
      
      for (const thread of threads) {
         const messages = await ctx.db
          .query("messages")
          .withIndex("by_thread", (q: any) => q.eq("threadId", thread._id))
          .collect();
          
         for (const msg of messages) {
           if (msg.role === "assistant" && msg.createdAt >= startTime && msg.createdAt <= endTime) {
             userWasActive = true;
             totalMessages++;
             const inputs = msg.inputTokens || 0;
             const outputs = msg.outputTokens || 0;
             const model = msg.modelUsed || "gemini-1.5-flash"; 
             
             totalTokens += (inputs + outputs);
             totalInputTokens += inputs;
             totalOutputTokens += outputs;
             
             costUSD += computeCostFromMap(model, inputs, outputs, modelMap);
           }
         }
      }
      
      if (userWasActive) activeUserIds.add(user._id);
      else {
         const logins = await ctx.db.query("logins").withIndex("by_user", (q: any) => q.eq("userId", user._id)).collect();
         const hasLogin = logins.some((l: any) => l.timestamp >= startTime && l.timestamp <= endTime);
         if (hasLogin) activeUserIds.add(user._id);
      }
    }
    
    const existing = await ctx.db
      .query("companyMetrics")
      .withIndex("by_company_date", (q: any) => q.eq("companyId", company._id).eq("date", dateStr))
      .first();
      
    const costGBP = costUSD * 0.78;
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        activeUsers: activeUserIds.size,
        totalMessages,
        totalTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costGBP
      });
    } else {
      await ctx.db.insert("companyMetrics", {
        companyId: company._id,
        date: dateStr,
        activeUsers: activeUserIds.size,
        totalMessages,
        totalTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costGBP
      });
    }
  }
}

// ----------------------------------------------------
// CRON ROUTER & BACKFILL
// ----------------------------------------------------

export const aggregateNightlyMetrics = internalMutation({
  args: { targetDateStr: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").collect();
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    await computeMetricsForDate(ctx, args.targetDateStr);
  }
});

export const backfillCompanyMetrics = mutation({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").collect();
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");
    
    const now = new Date();
    for (let i = 0; i < args.days; i++) {
       const target = new Date(now);
       target.setDate(now.getDate() - i);
       const dateStr = target.toISOString().split('T')[0];
       await computeMetricsForDate(ctx, dateStr);
    }
    return true;
  }
});

export const getCompanyMetrics = query({
  args: { 
    companyId: v.id("companies"), 
    timeframe: v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("ytd"), v.literal("custom")),
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

    // 2. Establish Timeframe Boundaries
    const now = new Date();
    let startDate = new Date();
    
    if (args.timeframe === "7d") startDate.setDate(now.getDate() - 7);
    else if (args.timeframe === "30d") startDate.setDate(now.getDate() - 30);
    else if (args.timeframe === "90d") startDate.setDate(now.getDate() - 90);
    else if (args.timeframe === "ytd") startDate = new Date(now.getFullYear(), 0, 1);
    else if (args.timeframe === "custom" && args.customStart) startDate = new Date(args.customStart);

    let endDate = now;
    if (args.timeframe === "custom" && args.customEnd) endDate = new Date(args.customEnd);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const aggregationType = durationDays > 180 ? "month" : durationDays > 60 ? "week" : "day";

    // 4. Fetch the Highly-Optimized CompanyMetrics Ledger
    const allMetrics = await ctx.db
       .query("companyMetrics")
       .withIndex("by_company_date", (q) => q.eq("companyId", args.companyId))
       .collect();

    const validMetrics = allMetrics.filter(m => m.date >= startDateStr && m.date <= endDateStr);
    
    // Aggregation Variables
    let totalMessages = 0;
    let totalTokens = 0;
    let totalCostGBP = 0;
    const timelineMap: Record<string, { cost: number; messages: number }> = {};

    for (const m of validMetrics) {
       totalMessages += m.totalMessages;
       totalTokens += m.totalTokens;
       totalCostGBP += m.costGBP;

       const metricDate = new Date(m.date);
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
       timelineMap[dateGroup].cost += m.costGBP;
       timelineMap[dateGroup].messages += m.totalMessages;
    }

    // 5. Dynamic "Today" Telemetry Injection 
    const todayStr = now.toISOString().split('T')[0];
    const hasToday = validMetrics.some(m => m.date === todayStr);
    
    // Calculate raw "Today" and Top Users natively from the raw message tables
    const companyUsers = await ctx.db.query("users").filter((q: any) => q.eq(q.field("companyId"), args.companyId)).collect();
    const companyUserIds = new Set(companyUsers.map(u => u._id));
    
    const threads = await ctx.db.query("threads").collect();
    const companyThreads = threads.filter(t => companyUserIds.has(t.userId));
    const companyThreadIds = new Set(companyThreads.map(t => t._id));

    const allMessages = await ctx.db.query("messages").filter(q => q.eq(q.field("role"), "assistant")).collect();
    const rawMessages = allMessages.filter(m => companyThreadIds.has(m.threadId));

    const startTimeStamp = startDate.getTime();
    const endTimeStamp = endDate.getTime();
    const periodRawMessages = rawMessages.filter(m => m.createdAt >= startTimeStamp && m.createdAt <= endTimeStamp);
    const todayStartTime = new Date(now).setUTCHours(0,0,0,0);
    const todayMessages = periodRawMessages.filter(m => m.createdAt >= todayStartTime);

    // Build the "Top Users" natively
    const threadUserMap = new Map(companyThreads.map(t => [t._id, t.userId]));
    const userLeaderboard: Record<string, { id: string; name: string; image: string; email: string; cost: number; messages: number }> = {};
    const activePeriodUsers = new Set<string>();

    for (const msg of periodRawMessages) {
       const userId = threadUserMap.get(msg.threadId);
       if (userId) {
          activePeriodUsers.add(userId);
          
          let msgCost = 0;
          const inputs = msg.inputTokens || 0;
          const outputs = msg.outputTokens || 0;
          const model = msg.modelUsed || "gemini-1.5-flash"; 
          msgCost = computeCostFromMap(model, inputs, outputs, modelMap);
          
          const gbpCost = msgCost * 0.78;

          if (!userLeaderboard[userId]) {
             const userObj = companyUsers.find(u => u._id === userId);
             userLeaderboard[userId] = {
                id: userId,
                name: userObj?.name || "Unknown",
                image: userObj?.image || "https://api.dicebear.com/7.x/notionists/svg",
                email: userObj?.email || "",
                cost: 0,
                messages: 0
             };
          }
          userLeaderboard[userId].cost += gbpCost;
          userLeaderboard[userId].messages += 1;
       }
    }

    if (!hasToday && todayMessages.length > 0) {
       let tCost = 0;
       let tMsgs = 0; 
       let tTokens = 0;

       for (const msg of todayMessages) {
          tMsgs++;
          const inputs = msg.inputTokens || 0;
          const outputs = msg.outputTokens || 0;
          const model = msg.modelUsed || "gemini-1.5-flash"; 
          
          tTokens += (inputs + outputs);
          let mCost = 0;
          mCost = computeCostFromMap(model, inputs, outputs, modelMap);
          tCost += (mCost * 0.78);
          
          let dateGroup = "";
          if (aggregationType === "month") dateGroup = now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
          else if (aggregationType === "week") {
              const target = new Date(now.valueOf());
              const dayNr = (now.getDay() + 6) % 7;
              target.setDate(target.getDate() - dayNr + 3);
              const firstThursday = target.valueOf();
              target.setMonth(0, 1);
              if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
              const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
              dateGroup = `Wk ${weekNum}`;
          } else {
              dateGroup = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          }

          if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0 };
          timelineMap[dateGroup].cost += (mCost * 0.78);
          timelineMap[dateGroup].messages += 1;
       }
       
       totalMessages += tMsgs;
       totalTokens += tTokens;
       totalCostGBP += tCost;
    }

    const timeline = Object.keys(timelineMap).map(k => ({
       date: k,
       cost: Number(timelineMap[k].cost.toFixed(4)),
       messages: timelineMap[k].messages
    }));

    const topUsers = Object.values(userLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 10);

    return {
       timeline,
       aggregates: {
          activeUsers: activePeriodUsers.size,
          totalMessages,
          totalTokens,
          totalCostGBP: Number(totalCostGBP.toFixed(4)),
          aggregationType
       },
       topUsers
    };
  }
});

/**
 * Universal Global Analytics Engine (Google Analytics Style)
 * Supports dynamic timeframe ranges and twin leaderboards.
 */
export const getGlobalAnalytics = query({
  args: { 
    timeframe: v.union(v.literal("today"), v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("ytd"), v.literal("custom")),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const aiModelsFetch = await ctx.db.query("aiModels").collect();
    const modelMap = new Map<string, any>(aiModelsFetch.map((m: any) => [m.modelId, m]));
    // 1. Core Authorization Check
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    // 2. Establish Timeframe Boundaries
    const now = new Date();
    let startDate = new Date();
    
    if (args.timeframe === "7d") startDate.setDate(now.getDate() - 7);
    else if (args.timeframe === "30d") startDate.setDate(now.getDate() - 30);
    else if (args.timeframe === "90d") startDate.setDate(now.getDate() - 90);
    else if (args.timeframe === "ytd") startDate = new Date(now.getFullYear(), 0, 1);
    else if (args.timeframe === "custom" && args.customStart) startDate = new Date(args.customStart);

    let endDate = now;
    if (args.timeframe === "custom" && args.customEnd) endDate = new Date(args.customEnd);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const aggregationType = durationDays > 180 ? "month" : durationDays > 60 ? "week" : "day";

    // 3. Structure Telemetry
    const users = await ctx.db.query("users").collect();
      const companies = await ctx.db.query("companies").collect();
    const companyMap = new Map(companies.map(c => [c._id, c]));

    // 4. Fetch the Highly-Optimized CompanyMetrics Ledger
    const allMetrics = await ctx.db.query("companyMetrics").collect();
    const validMetrics = allMetrics.filter(m => m.date >= startDateStr && m.date <= endDateStr);
    
    // Aggregation Variables
    let totalMessages = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostGBP = 0;
    const timelineMap: Record<string, { cost: number; messages: number }> = {};
    const companyLeaderboard: Record<string, { id: string; name: string; logo: string; cost: number; messages: number }> = {};

    // Grouping Ledger Data
    for (const m of validMetrics) {
       totalMessages += m.totalMessages;
       totalTokens += m.totalTokens;
       totalInputTokens += (m.inputTokens || 0);
       totalOutputTokens += (m.outputTokens || 0);
       totalCostGBP += m.costGBP;

       // Timeline Formatting 
       const metricDate = new Date(m.date);
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
       timelineMap[dateGroup].cost += m.costGBP;
       timelineMap[dateGroup].messages += m.totalMessages;

       // Top Companies Aggregation
       if (!companyLeaderboard[m.companyId]) {
          const comp = companyMap.get(m.companyId);
          companyLeaderboard[m.companyId] = {
             id: m.companyId,
             name: comp?.name || "Unknown Company",
             logo: comp?.logo || "",
             cost: 0,
             messages: 0
          };
       }
       companyLeaderboard[m.companyId].cost += m.costGBP;
       companyLeaderboard[m.companyId].messages += m.totalMessages;
    }

    // 5. Dynamic "Today" Telemetry Injection (for real-time dashboard accuracy)
    const todayStr = now.toISOString().split('T')[0];
    const hasToday = validMetrics.some(m => m.date === todayStr);
    
    // Calculate raw "Today" and Top Users natively from the raw message tables
    const threads = await ctx.db.query("threads").collect();
        const rawMessages = await ctx.db.query("messages").filter(q => q.eq(q.field("role"), "assistant")).collect();
    
    const startTimeStamp = startDate.getTime();
    const endTimeStamp = endDate.getTime();
    const periodRawMessages = rawMessages.filter(m => m.createdAt >= startTimeStamp && m.createdAt <= endTimeStamp);
    const todayStartTime = new Date(now).setUTCHours(0,0,0,0);
    const todayMessages = periodRawMessages.filter(m => m.createdAt >= todayStartTime);
    
    // Core MAU Calculation (last 30 days rolling)
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    const thirtyDayMessages = rawMessages.filter(m => m.createdAt >= thirtyDaysAgo);
    const threadUserMapAll = new Map(threads.map(t => [t._id, t.userId]));
    const mauSet = new Set<string>();
    for (const msg of thirtyDayMessages) {
       const uId = threadUserMapAll.get(msg.threadId);
       if (uId) mauSet.add(uId);
    }

    // Build the "Top Users" natively
    const threadUserMap = new Map(threads.map(t => [t._id, t.userId]));
    const userLeaderboard: Record<string, { id: string; name: string; image: string; companyName: string; email: string; cost: number; messages: number }> = {};
    const activePeriodUsers = new Set<string>();

    for (const msg of periodRawMessages) {
       const userId = threadUserMap.get(msg.threadId);
       if (userId) {
          activePeriodUsers.add(userId);
          
          let msgCost = 0;
          const inputs = msg.inputTokens || 0;
          const outputs = msg.outputTokens || 0;
          const model = msg.modelUsed || "gemini-1.5-flash"; 
          msgCost = computeCostFromMap(model, inputs, outputs, modelMap);
          
          const gbpCost = msgCost * 0.78;

          if (!userLeaderboard[userId]) {
             const userObj = users.find(u => u._id === userId);
             const compObj = userObj?.companyId ? companyMap.get(userObj.companyId) : null;
             userLeaderboard[userId] = {
                id: userId,
                name: userObj?.name || "Unknown",
                image: userObj?.image || "https://api.dicebear.com/7.x/notionists/svg",
                email: userObj?.email || "",
                companyName: compObj?.name || "Independent",
                cost: 0,
                messages: 0
             };
          }
          userLeaderboard[userId].cost += gbpCost;
          userLeaderboard[userId].messages += 1;
       }
    }

    // Process if "Today" is completely missing from the Ledger timeline
    if (!hasToday && todayMessages.length > 0) {
       let tCost = 0;
       let tMsgs = 0; 
       let tTokens = 0;
       let tInputs = 0;
       let tOutputs = 0;

       for (const msg of todayMessages) {
          tMsgs++;
          const inputs = msg.inputTokens || 0;
          const outputs = msg.outputTokens || 0;
          const model = msg.modelUsed || "gemini-1.5-flash"; 
          
          tTokens += (inputs + outputs);
          tInputs += inputs;
          tOutputs += outputs;
          let mCost = 0;
          mCost = computeCostFromMap(model, inputs, outputs, modelMap);
          tCost += (mCost * 0.78);
          
          // Add to timeline group
          let dateGroup = "";
          if (aggregationType === "month") dateGroup = now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
          else if (aggregationType === "week") {
              const target = new Date(now.valueOf());
              const dayNr = (now.getDay() + 6) % 7;
              target.setDate(target.getDate() - dayNr + 3);
              const firstThursday = target.valueOf();
              target.setMonth(0, 1);
              if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
              const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
              dateGroup = `Wk ${weekNum}`;
          } else {
              dateGroup = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          }

          if (!timelineMap[dateGroup]) timelineMap[dateGroup] = { cost: 0, messages: 0 };
          timelineMap[dateGroup].cost += (mCost * 0.78);
          timelineMap[dateGroup].messages += 1;

          // Add to Top Companies
          const userId = threadUserMap.get(msg.threadId);
          if (userId) {
             const userAcct = users.find(u => u._id === userId);
             if (userAcct && userAcct.companyId) {
                if (!companyLeaderboard[userAcct.companyId]) {
                   const compObj = companyMap.get(userAcct.companyId);
                   companyLeaderboard[userAcct.companyId] = {
                      id: userAcct.companyId,
                      name: compObj?.name || "Unknown Company",
                      logo: compObj?.logo || "",
                      cost: 0,
                      messages: 0
                   };
                }
                companyLeaderboard[userAcct.companyId].cost += (mCost * 0.78);
                companyLeaderboard[userAcct.companyId].messages += 1;
             }
          }
       }
       
       totalMessages += tMsgs;
       totalTokens += tTokens;
       totalInputTokens += tInputs;
       totalOutputTokens += tOutputs;
       totalCostGBP += tCost;
    }

    // 6. Format Outputs
    const timeline = Object.keys(timelineMap).map(k => ({
       date: k,
       cost: Number(timelineMap[k].cost.toFixed(4)),
       messages: timelineMap[k].messages
    }));

    const topCompanies = Object.values(companyLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 8);
       
    const topUsers = Object.values(userLeaderboard)
       .sort((a,b) => b.cost - a.cost)
       .slice(0, 8);

    const costPerActiveUser = activePeriodUsers.size > 0 ? (totalCostGBP / activePeriodUsers.size) : 0;

    // 7. Calculate Dynamic MRR based on Settings
    const settings = await ctx.db.query("systemSettings").first() || { monthlyBasePrice: 199, monthlySeatPrice: 49 };
    const mrr = (companies.length * settings.monthlyBasePrice) + (users.length * settings.monthlySeatPrice);

    const avgCostPerMessage = totalMessages > 0 ? (totalCostGBP / totalMessages) : 0;

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
       systemIntegrity: {
          totalProvisionedUsers: users.length,
          totalProvisionedCompanies: companies.length
       }
    };
  }
});
