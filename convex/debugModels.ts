import { internalQuery } from "./_generated/server";
export const dump = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query("aiModels").collect();
  }
});
