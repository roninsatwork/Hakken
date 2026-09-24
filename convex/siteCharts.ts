import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { listWebsiteId, myRivals, requireMySite } from "./siteAccess";
import { aiTotals, dayBefore, latestFigures, overlayMentions, pointValidator, seriesFor, stepValidator } from "./siteFigures";

/**
 * The figures behind the Sites charts: a site over time, its rivals beside it,
 * and a month of what changed day by day.
 *
 * Read from the day summaries only (`siteDaySummaries`), never from the rows
 * they summarise — a chart of two years is at most a few hundred small reads
 * per line. See docs/plans/active/user-sites-plan.md, "Charts".
 */

/** Rivals drawn as extra lines at once. More would be a chart nobody can read. */
const MAX_OVERLAY_RIVALS = 5;

/** Day rows read for one calendar month, with room for the day before it. */
const CALENDAR_DAYS = 40;

const lineValidator = v.object({
  websiteId: v.id("websites"),
  host: v.string(),
  isYou: v.boolean(),
  points: v.array(pointValidator),
  /** The last day before the range, for "what changed since". Null when there is none. */
  before: v.union(pointValidator, v.null()),
});

/** The site's figures between two days, in steps — and its rivals', when asked for. */
export const siteSeries = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    from: v.string(),
    to: v.string(),
    step: stepValidator,
    withRivals: v.optional(v.boolean()),
  },
  returns: v.array(lineValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    // Whose questions the AI figures come from: the owned site's. A website
    // that is not the asker gets its mentions from those answers (D17).
    const askerId = listWebsiteId(site);
    const pointsFor = async (websiteId: typeof askerId) => {
      const points = await seriesFor(ctx, websiteId, site.place, args.from, args.to, args.step);
      return websiteId === askerId
        ? points
        : await overlayMentions(ctx, points, askerId, websiteId, site.place, args.from, args.to, args.step);
    };
    const lines = [{
      websiteId: site.website._id,
      host: site.website.displayHost,
      isYou: true,
      points: await pointsFor(site.website._id),
      before: await dayBefore(ctx, site.website._id, site.place, args.from),
    }];
    if (!args.withRivals) return lines;

    // Each rival from the place this site is read from: it is collected there,
    // on this site's day, so the lines compare like with like.
    const rivals = (await myRivals(ctx, site)).slice(0, MAX_OVERLAY_RIVALS);
    for (const rival of rivals) {
      lines.push({
        websiteId: rival.website._id,
        host: rival.website.displayHost,
        isYou: false,
        points: await pointsFor(rival.website._id),
        before: await dayBefore(ctx, rival.website._id, site.place, args.from),
      });
    }
    return lines;
  },
});

/** One month, day by day: rankings won and lost, AI answers that named the site, links gained and lost. */
export const siteCalendar = tenantQuery({
  args: { siteId: v.id("companyWebsites"), month: v.string() },
  returns: v.array(v.object({
    day: v.string(),
    rankedUp: v.number(),
    rankedDown: v.number(),
    rankedNew: v.number(),
    rankedLost: v.number(),
    aiNamed: v.number(),
    aiAsked: v.number(),
    referringDomainsChange: v.union(v.number(), v.null()),
    backlinksChange: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const first = `${args.month}-01`;
    const last = `${args.month}-31`;
    // The day before the month too, so the 1st has something to change from.
    const before = await ctx.db
      .query("siteDaySummaries")
      .withIndex("by_site_day", (q) =>
        q.eq("websiteId", site.website._id).eq("locationCode", site.place).lt("day", first))
      .order("desc")
      .first();
    const rows = await ctx.db
      .query("siteDaySummaries")
      .withIndex("by_site_day", (q) =>
        q.eq("websiteId", site.website._id).eq("locationCode", site.place).gte("day", first).lte("day", last))
      .take(CALENDAR_DAYS);

    let referringDomains = before?.referringDomains;
    let backlinks = before?.backlinks;
    return rows.map((row) => {
      const ai = aiTotals(row);
      const referringDomainsChange = row.referringDomains !== undefined && referringDomains !== undefined
        ? row.referringDomains - referringDomains
        : null;
      const backlinksChange = row.backlinks !== undefined && backlinks !== undefined ? row.backlinks - backlinks : null;
      if (row.referringDomains !== undefined) referringDomains = row.referringDomains;
      if (row.backlinks !== undefined) backlinks = row.backlinks;
      return {
        day: row.day,
        rankedUp: row.rankedUp ?? 0,
        rankedDown: row.rankedDown ?? 0,
        rankedNew: row.rankedNew ?? 0,
        rankedLost: row.rankedLost ?? 0,
        aiNamed: ai.named,
        aiAsked: ai.asked,
        referringDomainsChange,
        backlinksChange,
      };
    });
  },
});

const figuresValidator = v.object({
  websiteId: v.id("websites"),
  host: v.string(),
  isYou: v.boolean(),
  day: v.union(v.string(), v.null()),
  keywords: v.union(v.number(), v.null()),
  top3: v.union(v.number(), v.null()),
  estimatedTraffic: v.union(v.number(), v.null()),
  backlinks: v.union(v.number(), v.null()),
  referringDomains: v.union(v.number(), v.null()),
  domainRank: v.union(v.number(), v.null()),
  aiNamed: v.number(),
  aiAsked: v.number(),
});

/** The site and each tracked rival, side by side, as each stood at its newest check. */
export const siteAndRivals = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(figuresValidator),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const everyone = [
      { website: site.website, isYou: true },
      ...(await myRivals(ctx, site)).map((rival) => ({ website: rival.website, isYou: false })),
    ];
    return await Promise.all(everyone.map(async ({ website, isYou }) => {
      const latest = await latestFigures(ctx, website._id, site.place);
      const ai = aiTotals(latest.answers);
      return {
        websiteId: website._id,
        host: website.displayHost,
        isYou,
        day: latest.lastDay,
        keywords: latest.metrics?.rankedKeywordsTotal ?? latest.ranking?.keywords ?? null,
        top3: latest.ranking?.bands?.p01_03 ?? null,
        estimatedTraffic: latest.metrics?.estimatedTraffic ?? null,
        backlinks: latest.links?.backlinks ?? null,
        referringDomains: latest.links?.referringDomains ?? null,
        domainRank: latest.links?.domainRank ?? null,
        aiNamed: ai.named,
        aiAsked: ai.asked,
      };
    }));
  },
});
