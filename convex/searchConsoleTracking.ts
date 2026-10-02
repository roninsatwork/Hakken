import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { tenantMutation, tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";
import { readFanOutLimits } from "./fanOutLimits";

/**
 * The searches and pages a company tracks on its website's Search Console
 * (docs/plans/active/search-console-plan.md §13.2), as Sites tracks its
 * fan-out queries: a tick in a table's first column adds one, unticking takes
 * it off. Held to the website's limits — 200 searches and 100 pages unless
 * set otherwise on the Limits screens — and its company's own: read and
 * changed only through the company's hold.
 *
 * Anyone in the company who can open the website may tick, as on Sites.
 */

type Kind = "query" | "page";
export const kindValidator = v.union(v.literal("query"), v.literal("page"));

/** The longest search or page address kept: Google's own are far shorter. */
const MOST_KEY = 2_048;

/** Tracked rows read a page at a time. */
const TRACKED_PER_READ = 500;

/** Every search or page the company tracks on a website, in pages read by its hold. */
export async function trackedKeys(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, kind: Kind): Promise<string[]> {
  const keys: string[] = [];
  for (let after: string | null = null; ;) {
    const from: string | null = after;
    const page = await ctx.db
      .query("searchConsoleTracked")
      .withIndex("by_hold_kind_key", (q) => (from === null
        ? q.eq("companyWebsiteId", companyWebsiteId).eq("kind", kind)
        : q.eq("companyWebsiteId", companyWebsiteId).eq("kind", kind).gt("key", from)))
      .take(TRACKED_PER_READ);
    keys.push(...page.map((row) => row.key));
    if (page.length < TRACKED_PER_READ) return keys;
    after = page[page.length - 1].key;
  }
}

const countValidator = v.object({ count: v.number(), limit: v.number() });

/** How many searches and pages the company tracks on this website, and its limits: the "x of y tracked" every table shows. */
export const searchConsoleTracking = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({ keywords: countValidator, pages: countValidator })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) return null;
    const limits = await readFanOutLimits(ctx, site.hold.companyId, site.hold._id);
    return {
      keywords: { count: (await trackedKeys(ctx, site.hold._id, "query")).length, limit: limits.consoleTrackedKeywordsPerSite },
      pages: { count: (await trackedKeys(ctx, site.hold._id, "page")).length, limit: limits.consoleTrackedPagesPerSite },
    };
  },
});

/** Track a search or a page on the website's Search Console, or stop tracking it. */
export const trackSearchConsoleItem = tenantMutation({
  args: { siteId: v.id("companyWebsites"), kind: kindValidator, key: v.string(), track: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const hold = site.hold;
    if (isTrackedHold(hold)) throw appError("INVALID_INPUT", "Only the company's own websites track Search Console keywords and pages.");
    const key = args.key.trim();
    if (!key || key.length > MOST_KEY) throw appError("INVALID_INPUT", "Choose a keyword or a page to track.");
    const held = await ctx.db
      .query("searchConsoleTracked")
      .withIndex("by_hold_kind_key", (q) => q.eq("companyWebsiteId", hold._id).eq("kind", args.kind).eq("key", key))
      .unique();
    if (args.track && !held) {
      const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
      const limit = args.kind === "query" ? limits.consoleTrackedKeywordsPerSite : limits.consoleTrackedPagesPerSite;
      if ((await trackedKeys(ctx, hold._id, args.kind)).length >= limit) {
        throw appError(
          "INVALID_INPUT",
          `${site.website.displayHost} already tracks ${limit} ${args.kind === "query" ? "keywords" : "pages"}: its limit in Limits. Untick one to track another.`,
        );
      }
      await ctx.db.insert("searchConsoleTracked", { companyWebsiteId: hold._id, kind: args.kind, key, createdAt: Date.now(), createdBy: ctx.userId });
    } else if (!args.track && held) {
      await ctx.db.delete(held._id);
    } else {
      return null;
    }
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: args.track ? "TRACK_SEARCH_CONSOLE_ITEM" : "UNTRACK_SEARCH_CONSOLE_ITEM",
      entityId: hold._id,
      entityType: "companyWebsites",
      companyId: hold.companyId,
      metadata: JSON.stringify({ kind: args.kind, key }),
      timestamp: Date.now(),
    });
    return null;
  },
});
