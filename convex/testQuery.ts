import { query, internalQuery } from "./_generated/server";

export const getPlans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").take(10000);
    const companies = await ctx.db.query("companies").take(10000);
    const users = await ctx.db.query("users").take(10000);
    return { plans, companies, users };
  }
});
