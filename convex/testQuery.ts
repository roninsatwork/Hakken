import { query, internalQuery } from "./_generated/server";

export const getPlans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect();
    const companies = await ctx.db.query("companies").collect();
    const users = await ctx.db.query("users").collect();
    return { plans, companies, users };
  }
});
