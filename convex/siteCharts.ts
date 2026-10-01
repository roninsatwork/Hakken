import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { listHold, myRivals, requireMySite } from "./siteAccess";
import { checkStarts, dayBefore, latestBands, latestFigures, linkingWebsitesOf, overlayListAi, pointValidator, searchTotalOf, seriesFor, stepValidator } from "./siteFigures";

/**
 * The figures behind the Sites charts: a site over time and its rivals beside it.
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

const lineValidator = v.object({
  websiteId: v.id("websites"),
  host: v.string(),
  isYou: v.boolean(),
  points: v.array(pointValidator),
  /** The figures before the range, each from the newest earlier day with it, for "what changed since". Null when there is none. */
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
      const starts = await checkStarts(ctx, websiteId, site.place);
      const points = await seriesFor(ctx, websiteId, site.place, args.from, args.to, args.step, starts);
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
    // on this site's day, so the lines compare like with like. A group of
    // more than five draws the five with the most traffic at their newest
    // check, and the chart says so (4.11).
    const group = await myRivals(ctx, site);
    const rivals = group.length <= MAX_OVERLAY_RIVALS
      ? group
      : (await Promise.all(group.map(async (rival) => ({
        rival,
        traffic: (await latestFigures(ctx, rival.website._id, site.place)).metrics?.estimatedTraffic ?? -1,
      }))))
        .sort((left, right) => right.traffic - left.traffic || left.rival.website.host.localeCompare(right.rival.website.host))
        .slice(0, MAX_OVERLAY_RIVALS)
        .map((entry) => entry.rival);
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
        keywords: searchTotalOf(latest),
        top3: latestBands(latest)?.p01_03 ?? null,
        estimatedTraffic: latest.metrics?.estimatedTraffic ?? null,
        backlinks: latest.links?.backlinks ?? null,
        referringDomains: linkingWebsitesOf(latest.links),
        domainRank: latest.links?.domainRank ?? null,
      };
    }));
  },
});
