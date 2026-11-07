import { v } from "convex/values";
import { softQuery } from "./tenantFunctions";

/**
 * The workspace holding a website a super admin has opened by its address, when it isn't the one they're in: the website's screens
 * move them into it rather than show "Website not found" (Anthony, 2026-11-07: "we should not see an error"). Null for anyone else,
 * for a website already in their workspace, and for one that doesn't exist, so everyone but a super admin sees the message as before.
 */
export const workspaceHoldingWebsite = softQuery({
  reason: "A website's screens ask on every 'not found'; anyone but a super admin, or no session, is answered null and sees the message.",
  args: { siteId: v.string() },
  returns: v.union(v.null(), v.id("companies")),
  empty: null,
  allowRoles: ["SUPER_ADMIN"],
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("companyWebsites", args.siteId);
    const hold = id ? await ctx.db.get(id) : null;
    if (!hold || hold.companyId === ctx.companyId) return null;
    return (await ctx.db.get(hold.companyId)) ? hold.companyId : null;
  },
});
