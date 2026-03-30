import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

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
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized AI Logistics query");
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "ADMIN") throw new Error("Unauthorized");

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

       let msgCost = 0;
       if (model.includes("pro")) {
          msgCost += (inputs / 1000000) * 3.50;
          msgCost += (outputs / 1000000) * 10.50;
       } else {
          msgCost += (inputs / 1000000) * 0.075;
          msgCost += (outputs / 1000000) * 0.30;
       }

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
    // 1. Core Authorization Check
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "ADMIN") throw new Error("Unauthorized");

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

       let msgCost = 0;
       if (model.includes("pro")) {
          msgCost += (inputs / 1000000) * 3.50;
          msgCost += (outputs / 1000000) * 10.50;
       } else {
          msgCost += (inputs / 1000000) * 0.075;
          msgCost += (outputs / 1000000) * 0.30;
       }
       
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
