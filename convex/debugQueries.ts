import { query } from "./_generated/server";

export const test = query(async (ctx) => {
    return await ctx.db.query("agentTransactions").order("desc").take(5);
});
