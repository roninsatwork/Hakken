import { defineTable } from "convex/server";
import { v } from "convex/values";
import { seenValidator } from "./utils/hakkenSees";

/**
 * What Hakken advised (docs/plans/active/search-console-volatility-plan.md §8,
 * HS5): each screen's What Hakken sees for a website, saved as its codes and
 * numbers — never its words, which stay in the language files — once a day
 * per screen, the newest advice that day. Ask Hakken reads it, so it says
 * what the screens say (HS4, HS7), and it is a record of what Hakken advised
 * and when. Kept 90 days (`hakkenAdvice.ts`).
 */
export const adviceTables = {
  hakkenAdvice: defineTable({
    companyId: v.id("companies"),
    companyWebsiteId: v.id("companyWebsites"),
    /** The box: its words' namespace and screen, "searchConsole.seen.volatility". */
    screen: v.string(),
    /** The day it was worked out (UTC): one record a screen a day. */
    day: v.string(),
    /** What it advises as one line (`seenAdvice`): codes and quoted names, never numbers. */
    advice: v.string(),
    seen: seenValidator,
    /** The screen's address, for the way to it. */
    path: v.string(),
    /** Google Analytics' money is in the property's currency. */
    currency: v.optional(v.string()),
    notedAt: v.number(),
  })
    .index("by_hold_screen_day", ["companyWebsiteId", "screen", "day"])
    .index("by_hold_day", ["companyWebsiteId", "day"]),
};
