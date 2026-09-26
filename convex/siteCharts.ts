import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { listHold, myRivals, requireMySite } from "./siteAccess";
import { aiTotals, dayBefore, latestFigures, overlayListAi, pointValidator, seriesFor, stepValidator } from "./siteFigures";

/**
 * The figures behind the Sites charts: a site over time, its rivals beside it,
 * and a month of what changed day by day.
 *
 * Read from the day summaries only (`siteDaySummaries`), never from the rows
 * they summarise — a chart of two years is at most a few hundred small reads
 * per line — and the AI lines from the company's own list (`siteListAiDays`),
 * so its questions reach no other company's chart. See
 * docs/plans/active/user-sites-plan.md, "Charts", and
 * docs/plans/active/private-tracking-lists-plan.md.
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
    // Whose questions the AI figures come from: this company's own list for
    // the owned site. The owned site's line is its answers; every other
    // website's is how often those answers named it (D17).
    const holdId = listHold(site);
    const pointsFor = async (websiteId: typeof site.website._id) => {
      const points = await seriesFor(ctx, websiteId, site.place, args.from, args.to, args.step);
      return await overlayListAi(ctx, points, holdId, websiteId, site.place, args.from, args.to, args.step);
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

    // The AI answers of each day, from this company's own list: the site's
    // own line, or — for a competitor — how often the list's answers named it.
    const holdId = listHold(site);
    const aiDays = holdId
      ? await ctx.db
        .query("siteListAiDays")
        .withIndex("by_hold_site_day", (q) =>
          q.eq("companyWebsiteId", holdId).eq("locationCode", site.place).eq("websiteId", site.website._id)
            .gte("day", first).lte("day", last))
        .take(CALENDAR_DAYS)
      : [];
    const aiOf = new Map(aiDays.map((row) => [row.day, row]));
    // A day with answers and no other figures is a day of the month too.
    const days = [...new Set([...rows.map((row) => row.day), ...aiOf.keys()])].sort();
    const rowOf = new Map(rows.map((row) => [row.day, row]));

    let referringDomains = before?.referringDomains;
    let backlinks = before?.backlinks;
    return days.map((day) => {
      const row = rowOf.get(day) ?? { day };
      const ai = aiTotals(aiOf.get(day) ?? null);
      const figures: Partial<Doc<"siteDaySummaries">> = row;
      const referringDomainsChange = figures.referringDomains !== undefined && referringDomains !== undefined
        ? figures.referringDomains - referringDomains
        : null;
      const backlinksChange = figures.backlinks !== undefined && backlinks !== undefined ? figures.backlinks - backlinks : null;
      if (figures.referringDomains !== undefined) referringDomains = figures.referringDomains;
      if (figures.backlinks !== undefined) backlinks = figures.backlinks;
      return {
        day,
        rankedUp: figures.rankedUp ?? 0,
        rankedDown: figures.rankedDown ?? 0,
        rankedNew: figures.rankedNew ?? 0,
        rankedLost: figures.rankedLost ?? 0,
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
      };
    }));
  },
});
