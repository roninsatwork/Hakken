import { query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { api } from "./_generated/api";

export const listProperties = query({
  args: {
    paginationOpts: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.users.getMe);
    if (!user) throw new Error("Unauthenticated");

    return await ctx.db
      .query("properties")
      .withIndex("by_company", q => q.eq("companyId", user.companyId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
