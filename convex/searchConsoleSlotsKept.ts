import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { periodListValidator, periodValidator, searchTypeValidator } from "./searchConsoleSchema";

/**
 * The slots whose list is kept for the very days given: a settled slot built before a list kept its span before
 * (`missingBefore`) holds none for it.
 */
export const slotsKept = internalQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    country: v.optional(v.string()),
    searchType: searchTypeValidator,
    list: periodListValidator,
    slots: v.array(v.object({ period: periodValidator, which: v.union(v.literal("NOW"), v.literal("BEFORE")), from: v.string(), to: v.string() })),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const kept: string[] = [];
    for (const slot of args.slots) {
      const first = await ctx.db
        .query("searchConsolePeriods")
        .withIndex("by_hold_country_type_list_period", (q) => q
          .eq("companyWebsiteId", args.companyWebsiteId).eq("country", args.country).eq("searchType", args.searchType)
          .eq("list", args.list).eq("period", slot.period).eq("which", slot.which).eq("part", 0))
        .first();
      if (first && first.from === slot.from && first.to === slot.to) kept.push(`${slot.period}|${slot.which}`);
    }
    return kept;
  },
});
