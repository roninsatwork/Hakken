import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { aiEngineValidator, AI_ENGINES } from "./seoAiEngines";
import { listHold, myRivals, requireMySite } from "./siteAccess";
import { citedPagesOf, latestFigures, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import { pageTypeValidator } from "./utils/siteShapes";

/**
 * The parts of a site's Overview that no day summary holds (docs/plans/
 * active/sites-ux-updates-plan.md; drawn on the "Hakken Sites Overview
 * Drawing" canvas and agreed, Anthony, 2026-09-25: "ok lets build this"):
 * its pages by kind and by the visits each brings, the home page's strength,
 * how many pages Google's AI Overviews link to, the pages each AI assistant
 * links to, and its competitors — every one the company set up (Anthony,
 * 2026-09-25: "why all the competitors korda tackle has are not listed here").
 *
 * Read from the latest-rankings tables, one bounded read each: a site ranks
 * with hundreds of pages, and the cap keeps a very large one to a single read,
 * saying so when it bites.
 */

/**
 * Ranking pages read for the kinds and visit groups, those ranking for the
 * most searches first. Under a thousand, so the Overview stays a small read
 * (`src/analytics-read-drift.test.ts`); a site with more says it was counted
 * over these.
 */
const PAGES_READ = 999;

/** AI Overview rows read for the pages they link, one row per search; past this the count reads "999+". */
const FEATURE_ROWS_READ = 999;

/** Competitors read: DataForSEO finds a few hundred at most. */
const COMPETITORS_READ = 300;

/** The groups of pages by the visits a month each brings, smallest first. */
const VISIT_BANDS = [
  { band: "none", upTo: 0 },
  { band: "to100", upTo: 100 },
  { band: "to1000", upTo: 1_000 },
  { band: "to10000", upTo: 10_000 },
  { band: "over10000", upTo: Number.POSITIVE_INFINITY },
] as const;

const visitBandValidator = v.union(
  v.literal("none"),
  v.literal("to100"),
  v.literal("to1000"),
  v.literal("to10000"),
  v.literal("over10000"),
);

const nullableNumber = v.union(v.number(), v.null());

export const overviewExtras = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    homePageRank: nullableNumber,
    aiOverviewPages: v.number(),
    /** More AI Overview searches than were read: the page count is at least `aiOverviewPages`. */
    aiOverviewCapped: v.boolean(),
    assistants: v.array(v.object({ engine: aiEngineValidator, pages: v.number() })),
    pages: v.object({
      total: v.number(),
      visits: v.number(),
      capped: v.boolean(),
      kinds: v.array(v.object({ pageType: pageTypeValidator, pages: v.number(), visits: v.number() })),
      visitBands: v.array(v.object({ band: visitBandValidator, pages: v.number(), visits: v.number() })),
    }),
    competitors: v.object({
      /** Found ranking for the same searches and judged competitors: what Organic competitors lists under that kind. */
      found: v.number(),
      /** The site itself, for its place on the chart. */
      you: v.object({ keywords: nullableNumber, visits: nullableNumber }),
      /** The rest of the site's group: for an owned site, every competitor the company set up. */
      rivals: v.array(v.object({
        siteId: v.id("companyWebsites"),
        host: v.string(),
        keywords: nullableNumber,
        visits: nullableNumber,
        /** Searches both rank for, when either one's found list holds the other; null when neither does. */
        shared: nullableNumber,
        /**
         * The visits a month it gets from those searches, as this site's own
         * found list has them; null when that list does not hold it. The
         * competitor's own list holds this site's visits on them instead — not
         * the same figure — so it is not borrowed the way `shared` is.
         */
        sharedVisits: nullableNumber,
      })),
    }),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const websiteId = site.website._id;
    const place = site.place;

    const [pageRows, home, aiRows, cited, found, rivals, own] = await Promise.all([
      ctx.db
        .query("sitePageRanks")
        .withIndex("by_site_keywords", (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
        .order("desc")
        .take(PAGES_READ),
      ctx.db
        .query("sitePageRanks")
        .withIndex("by_site_page", (q) => q.eq("websiteId", websiteId).eq("locationCode", place).eq("page", "/"))
        .first(),
      ctx.db
        .query("siteKeywordFeatures")
        .withIndex("by_site_feature_keyword", (q) =>
          q.eq("websiteId", websiteId).eq("locationCode", place).eq("feature", "ai_overview_reference"))
        .take(FEATURE_ROWS_READ),
      citedPagesOf(ctx, websiteId, listHold(site), place, QUESTIONS_FOR_CITED_PAGES),
      ctx.db
        .query("discoveredCompetitors")
        .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.siteId))
        .take(COMPETITORS_READ),
      myRivals(ctx, site),
      latestFigures(ctx, websiteId, place),
    ]);

    // Pages by kind, and by the visits a month each brings.
    const kinds = new Map<string, { pageType: NonNullable<(typeof pageRows)[number]["pageType"]> | "UNJUDGED"; pages: number; visits: number }>();
    const bands = VISIT_BANDS.map((entry) => ({ band: entry.band, pages: 0, visits: 0 }));
    let visits = 0;
    for (const row of pageRows) {
      const pageType = row.pageType ?? "UNJUDGED";
      const traffic = row.traffic ?? 0;
      visits += traffic;
      const kind = kinds.get(pageType) ?? { pageType, pages: 0, visits: 0 };
      kind.pages += 1;
      kind.visits += traffic;
      kinds.set(pageType, kind);
      const band = bands[VISIT_BANDS.findIndex((entry) => traffic <= entry.upTo)];
      band.pages += 1;
      band.visits += traffic;
    }

    // Every competitor beside the site, from its own collected figures, as the
    // Market map reads them. The searches both rank for come from what
    // discovery found: this site's list first, then the competitor's own list,
    // since the count is the same either way round. The visits it gets from
    // them come from this site's list only (the Competitors card's Traffic view).
    const foundHere = new Map(found.map((row) => [row.host, row]));
    const rivalRows = await Promise.all(rivals.map(async (rival) => {
      const mine = foundHere.get(rival.website.host);
      const [latest, theirs] = await Promise.all([
        latestFigures(ctx, rival.website._id, place),
        mine
          ? null
          : ctx.db
            .query("discoveredCompetitors")
            .withIndex("by_company_website_host", (q) => q.eq("companyWebsiteId", rival.hold._id).eq("host", site.website.host))
            .first(),
      ]);
      return {
        siteId: rival.hold._id,
        host: rival.website.displayHost,
        keywords: latest.metrics?.rankedKeywordsTotal ?? latest.ranking?.keywords ?? null,
        visits: latest.metrics?.estimatedTraffic ?? null,
        shared: mine?.intersections ?? theirs?.intersections ?? null,
        sharedVisits: mine?.estimatedTraffic ?? null,
      };
    }));

    return {
      homePageRank: home?.pageRank ?? null,
      aiOverviewPages: new Set(aiRows.flatMap((row) => (row.page ? [row.page] : []))).size,
      aiOverviewCapped: aiRows.length === FEATURE_ROWS_READ,
      assistants: AI_ENGINES.map((engine) => ({ engine, pages: cited.filter((page) => page.engines.includes(engine)).length })),
      pages: {
        total: pageRows.length,
        visits,
        capped: pageRows.length === PAGES_READ,
        kinds: [...kinds.values()].sort((left, right) => right.pages - left.pages || right.visits - left.visits),
        visitBands: bands,
      },
      competitors: {
        found: found.filter((row) => row.host !== site.website.host && row.kind === "COMPETITOR").length,
        you: {
          keywords: own.metrics?.rankedKeywordsTotal ?? own.ranking?.keywords ?? null,
          visits: own.metrics?.estimatedTraffic ?? null,
        },
        // Most searches shared first; those neither list holds after, biggest first.
        rivals: rivalRows.sort((left, right) =>
          (right.shared ?? -1) - (left.shared ?? -1) || (right.visits ?? -1) - (left.visits ?? -1)),
      },
    };
  },
});
