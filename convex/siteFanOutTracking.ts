import { v } from "convex/values";
import { tenantMutation } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { listedAlready, queueFirstChecks, tick, untick } from "./promptFanOut";
import { readSearchPhrase } from "./websiteCanonical";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";

/** The most wordings one topic sends; a topic is a handful of ways of saying one search. */
const MAX_WORDINGS = 50;

/**
 * Track a fan-out query, or stop, from the Sites Fan-out queries page
 * (Anthony, 2026-09-29: "The users need to be able to select which searches
 * that they want to track" — a Track tick on that page, not in admin).
 *
 * The same rule as admin's tick (`promptFanOut.ts`): tracked, the search is on
 * the website's tracked keywords and checked on Google every run, within the
 * website's limit for fan-out queries; untracked, it comes off them and waits
 * for its one first check. A row is a topic — several wordings of one search:
 * tracking it tracks the wording the page shows first; stopping stops every
 * wording of it that was tracked.
 *
 * Anyone in the company who can open the site may do it, as with every Sites
 * page; only on the company's own website, never on a competitor's list.
 */
export const trackSiteFanOutQuery = tenantMutation({
  args: {
    siteId: v.id("companyWebsites"),
    prompt: v.string(),
    /** The topic's wordings, the one the page shows first. */
    queries: v.array(v.string()),
    track: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const hold = site.hold;
    if (isTrackedHold(hold)) throw appError("INVALID_INPUT", "Only the company's own websites track fan-out queries.");
    if (args.queries.length === 0 || args.queries.length > MAX_WORDINGS) {
      throw appError("INVALID_INPUT", "Choose one fan-out query to track.");
    }

    const keywords = [...new Set(args.queries.map((query) => readSearchPhrase(query).keyword))];
    for (const keyword of keywords) {
      if (!(await listedAlready(ctx, hold, args.prompt, keyword))) {
        throw appError("NOT_FOUND", "That fan-out query is not on this website's list.");
      }
    }

    if (args.track) {
      await tick(ctx, hold, readSearchPhrase(args.queries[0]).text, ctx.userId);
    } else {
      for (const keyword of keywords) await untick(ctx, hold, keyword, ctx.userId);
      await queueFirstChecks(ctx, hold, keywords);
    }
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: args.track ? "TICK_FAN_OUT_QUERY" : "UNTICK_FAN_OUT_QUERY",
      entityId: hold._id,
      entityType: "companyWebsites",
      metadata: JSON.stringify({ prompt: args.prompt, query: keywords[0], companyId: hold.companyId, from: "SITES" }),
      timestamp: Date.now(),
    });
    return null;
  },
});
