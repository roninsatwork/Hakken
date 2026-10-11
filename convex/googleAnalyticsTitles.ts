import { v } from "convex/values";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { encodePagesFromAction } from "./holdPageRefs";
import { shiftDay } from "./searchConsoleDays";
import { ask, type CollectTarget, type Session } from "./googleAnalyticsCollect";
import { pageAddress } from "./googleAnalyticsLists";

/**
 * Each page's title (docs/plans/active/google-analytics-plan.md GA27,
 * §18.6.3): asked of Google weekly with the long lists — `pageTitle` by
 * `pagePath` over the last 90 days in the main home country — and the title
 * each page was seen with most kept by the hold's page number. The website's
 * one page list copies it on its rebuild (`holdPages.title`), and every
 * screen listing the website's pages reads it there.
 */

/** Days a title is looked for over: the long lists' 90. */
const TITLE_DAYS = 90;
/** Titles written a call. */
const TITLES_PER_WRITE = 200;
/** Old titles read a call when clearing the week before's. */
const TITLES_PER_DROP = 200;
/** The longest title kept: a page's title, never a page of text. */
const MOST_TITLE = 300;

/** What Google calls a page it has no title for. */
const NO_TITLE = "(not set)";

/** Ask for the titles and keep them; answers how many pages have one, or why Google could not say. */
export async function collectTitles(
  ctx: ActionCtx,
  session: Session,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  top: string,
): Promise<{ ok: true; titled: number } | { ok: false; reason: string }> {
  const answer = await ask(session, target.property!, {
    startDate: shiftDay(top, -(TITLE_DAYS - 1)),
    endDate: top,
    dimensions: ["pagePath", "pageTitle"],
    metrics: ["screenPageViews"],
    hostNames: target.addresses,
    countries: [target.country],
  });
  if (!answer.ok) return { ok: false, reason: `${answer.reason} ${answer.status}: ${answer.detail}` };
  // Each address's title seen most; two paths that are one address once cleaned are one page.
  const best = new Map<string, { title: string; views: number }>();
  for (const row of answer.rows) {
    const [path, title] = row.keys;
    const address = pageAddress(target.origin, path ?? "");
    const clean = (title ?? "").trim().slice(0, MOST_TITLE);
    if (address === NO_TITLE || !clean || clean === NO_TITLE) continue;
    const views = row.values[0] ?? 0;
    const held = best.get(address);
    if (!held || views > held.views) best.set(address, { title: clean, views });
  }
  const addresses = [...best.keys()];
  const refs = await encodePagesFromAction(ctx, target.companyWebsiteId, addresses);
  return await keepTitles(ctx, connectionId, target, addresses.map((address, at) => ({ page: refs[at], ...best.get(address)! })));
}

/** The week's titles written, then those of pages not seen this week cleared. */
async function keepTitles(
  ctx: ActionCtx,
  connectionId: Id<"googleAnalyticsConnections">,
  target: CollectTarget,
  titles: Array<{ page: string; title: string; views: number }>,
): Promise<{ ok: true; titled: number }> {
  const askedAt = Date.now();
  for (let start = 0; start < titles.length; start += TITLES_PER_WRITE) {
    const kept: boolean = await ctx.runMutation(internal.googleAnalyticsTitles.putTitles, {
      connectionId, property: target.property!, askedAt, titles: titles.slice(start, start + TITLES_PER_WRITE),
    });
    if (!kept) return { ok: true, titled: 0 };
  }
  await ctx.runMutation(internal.googleAnalyticsTitles.dropOldTitles, { companyWebsiteId: target.companyWebsiteId, askedAt });
  return { ok: true, titled: titles.length };
}

/** A batch of the week's titles, by page number: changed only where the title moved. */
export const putTitles = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    property: v.string(),
    askedAt: v.number(),
    titles: v.array(v.object({ page: v.string(), title: v.string(), views: v.number() })),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Disconnected, another property chosen, or clearing while the step ran: these titles are not this connection's.
    if (!connection || connection.status !== "CONNECTED" || connection.property !== args.property || connection.clearing) return false;
    const hold = connection.companyWebsiteId;
    for (const { page, title, views } of args.titles) {
      const held = await ctx.db
        .query("googleAnalyticsTitles")
        .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", hold).eq("page", page))
        .first();
      if (!held) await ctx.db.insert("googleAnalyticsTitles", { companyWebsiteId: hold, page, title, views, askedAt: args.askedAt });
      else await ctx.db.patch(held._id, { title, views, askedAt: args.askedAt });
    }
    return true;
  },
});

/** Titles of pages not seen this week, a page of titles at a time. */
export const dropOldTitles = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), askedAt: v.number(), cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("googleAnalyticsTitles")
      .withIndex("by_hold_page", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .paginate({ cursor: args.cursor ?? null, numItems: TITLES_PER_DROP });
    for (const row of page.page) if (row.askedAt < args.askedAt) await ctx.db.delete(row._id);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.googleAnalyticsTitles.dropOldTitles, { ...args, cursor: page.continueCursor });
    }
    return null;
  },
});
