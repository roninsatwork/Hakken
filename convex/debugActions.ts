import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const test = action(async (ctx) => {
    const rawLogs = await ctx.runQuery(internal.agentLogs.getOffsetPaginated as any, { 
        agentId: "invalid", // wait, agentLogs needs agentId, I can just query the raw table if I make a query
        page: 1, pageSize: 5 
    });
    return rawLogs;
});
