import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, findMySite, listWebsiteId, myRivals, placeName, type HoldSummary } from "./siteAccess";
import {
  citedPagesOf,
  enginesNamedIn,
  latestFigures,
  newestAnswerEngines,
  newestAnswers,
  QUESTIONS_FOR_CITED_PAGES,
} from "./siteFigures";
import type { EngineDay } from "./utils/siteShapes";
import { isTrackedHold } from "./utils/websitePairing";
import { loadSite, MAX_LIST } from "./websiteSiteRows";

/**
 * The client's Sites list, and the header and side menu every page of one
 * site wears.
 *
 * See docs/plans/active/user-sites-plan.md. Read-only (D1). Every hold is a
 * Site (D17). Every figure comes from a summary row written when the data was
 * filed (`siteSummaries.ts`), so opening Sites counts nothing: per site, one
 * run of recent day rows, one collection line and at most a hundred open
 * moves.
 */

/** Open moves counted for a site's "to do"; shown as "100+" beyond it. */
const MOVES_COUNTED = 100;

/** Days offered to compare against: a year and a bit of checks. */
const CHECK_DAYS = 400;

/** Suggestions counted for the menu, at most. */
const COUNT_CEILING = 500;

type Reader = { db: QueryCtx["db"] };

/** Engines that named the site, of the engines asked, on its newest day of answers. */
function enginesNamed(ai: EngineDay[] | undefined): { named: number; asked: number } | null {
  if (!ai || ai.length === 0) return null;
  return {
    named: ai.filter((engine) => engine.named > 0).length,
    asked: ai.filter((engine) => engine.asked > 0).length,
  };
}

/** When the company's collection last filed anything for this website. */
async function lastCollectedAt(ctx: Reader, companyId: Id<"companies">, websiteId: Id<"websites">) {
  const line = await ctx.db
    .query("seoCycleLines")
    .withIndex("by_company_website", (q) => q.eq("companyId", companyId).eq("websiteId", websiteId))
    .order("desc")
    .first();
  return line?.createdAt ?? null;
}

async function openMoves(ctx: Reader, hold: Doc<"companyWebsites">) {
  const moves = await ctx.db
    .query("websiteMoves")
    .withIndex("by_company_website_state", (q) => q.eq("companyWebsiteId", hold._id).eq("state", "OPEN"))
    .take(MOVES_COUNTED + 1);
  return { toDo: Math.min(moves.length, MOVES_COUNTED), toDoCapped: moves.length > MOVES_COUNTED };
}

const holdSummaryValidator = v.object({
  siteId: v.id("companyWebsites"),
  host: v.string(),
  relationship: v.union(v.literal("OWNED"), v.literal("TRACKED")),
  ofHost: v.union(v.string(), v.null()),
});

const numberOrNull = v.union(v.number(), v.null());

/** Every website the company holds, owned first, with its headline figures. */
export const listMySites = tenantQuery({
  args: {},
  returns: v.array(v.object({
    ...holdSummaryValidator.fields,
    /** A first check has been filed; until then every figure is null, never 0. */
    checked: v.boolean(),
    aiNamed: numberOrNull,
    aiAsked: numberOrNull,
    top3: numberOrNull,
    pageOne: numberOrNull,
    keywords: numberOrNull,
    estimatedTraffic: numberOrNull,
    rankedUp: numberOrNull,
    rankedDown: numberOrNull,
    toDo: v.number(),
    toDoCapped: v.boolean(),
    lastCheckedAt: numberOrNull,
    lastCheckedDay: v.union(v.string(), v.null()),
    nextRunAt: numberOrNull,
    addedAt: v.number(),
  })),
  handler: async (ctx) => {
    const companyId = ctx.companyId;
    if (!companyId) return [];
    const holds = await companyHolds(ctx, companyId);
    // Each owned site's newest answers, read once however many competitors
    // are measured on its questions.
    const answersOf = new Map<string, ReturnType<typeof newestAnswers>>();
    const answersFor = (askerId: Id<"websites">, place: number) => {
      const key = `${askerId}|${place}`;
      const held = answersOf.get(key) ?? newestAnswers(ctx, askerId, place);
      answersOf.set(key, held);
      return held;
    };
    return await Promise.all(holds.map(async ({ hold, website, summary }) => {
      const site = await loadSite(ctx, hold._id);
      const place = site?.place ?? 0;
      const askerId = site ? listWebsiteId(site) : website._id;
      const [latest, collectedAt, moves, watchedAi] = await Promise.all([
        latestFigures(ctx, website._id, place),
        lastCollectedAt(ctx, companyId, website._id),
        openMoves(ctx, hold),
        askerId === website._id ? Promise.resolve(null) : answersFor(askerId, place).then((answers) => enginesNamedIn(answers, website._id)),
      ]);
      const ai = askerId === website._id ? enginesNamed(latest.answers?.ai) : watchedAi;
      // DataForSEO's bands over everything the site ranks for, where read out
      // (Phase 2); the stored keywords' own bands before that.
      const bands = latest.metrics?.allBands ?? latest.ranking?.bands;
      return {
        ...summary,
        checked: latest.lastDay !== null,
        aiNamed: ai?.named ?? null,
        aiAsked: ai?.asked ?? null,
        top3: bands ? bands.p01_03 : null,
        pageOne: bands ? bands.p01_03 + bands.p04_10 : null,
        keywords: latest.metrics?.rankedKeywordsTotal ?? latest.ranking?.keywords ?? null,
        estimatedTraffic: latest.metrics?.estimatedTraffic ?? null,
        rankedUp: latest.ranking?.rankedUp ?? null,
        rankedDown: latest.ranking?.rankedDown ?? null,
        ...moves,
        lastCheckedAt: collectedAt,
        lastCheckedDay: latest.lastDay,
        nextRunAt: site?.schedule.nextRunAt ?? null,
        addedAt: hold.createdAt,
      };
    }));
  },
});

/**
 * Everything the site's header and side menu say: which website and what kind
 * of hold, where it is read from, when it was last and will next be checked,
 * the company's holds for the switcher, the rivals beside it, the days that
 * can be compared, and the number beside each menu item. Null for a hold that
 * is not the company's, exactly as for a missing one.
 */
export const getMySite = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.union(v.null(), v.object({
    ...holdSummaryValidator.fields,
    websiteId: v.id("websites"),
    placeLabel: v.string(),
    checked: v.boolean(),
    latestDay: v.union(v.string(), v.null()),
    lastCheckedAt: numberOrNull,
    nextRunAt: numberOrNull,
    holds: v.array(holdSummaryValidator),
    rivals: v.array(holdSummaryValidator),
    /** Days with a ranking check, newest first: what "compare with" can offer. */
    checkDays: v.array(v.string()),
    counts: v.object({
      keywords: numberOrNull,
      keywordsStored: numberOrNull,
      pages: numberOrNull,
      top3: numberOrNull,
      referringDomains: numberOrNull,
      brokenBacklinks: numberOrNull,
      aiNamed: numberOrNull,
      aiAsked: numberOrNull,
      trackedSearches: v.number(),
      /** Whether any question the site is measured on in AI answers is switched on: none means AI answers is not set up. */
      questionsSetUp: v.boolean(),
      rankedUp: numberOrNull,
      rankedDown: numberOrNull,
      suggestions: v.number(),
      citedPages: v.number(),
    }),
  })),
  handler: async (ctx, args) => {
    const site = await findMySite(ctx, args.siteId);
    if (!site) return null;
    const companyId = site.hold.companyId;
    const websiteId = site.website._id;

    const askerId = listWebsiteId(site);
    const [holds, rivals, latest, collectedAt, days, searches, suggestions, cited, watchedAi, questions] = await Promise.all([
      companyHolds(ctx, companyId),
      myRivals(ctx, site),
      latestFigures(ctx, websiteId, site.place),
      lastCollectedAt(ctx, companyId, websiteId),
      ctx.db
        .query("siteDaySummaries")
        .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", site.place))
        .order("desc")
        .take(CHECK_DAYS),
      ctx.db
        .query("websiteKeywords")
        .withIndex("by_website", (q) => q.eq("websiteId", site.pair?.websiteId ?? websiteId))
        .take(MAX_LIST),
      ctx.db
        .query("discoveredCompetitors")
        .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.siteId))
        .take(COUNT_CEILING),
      citedPagesOf(ctx, websiteId, askerId, site.place, QUESTIONS_FOR_CITED_PAGES),
      askerId === websiteId ? Promise.resolve(null) : newestAnswerEngines(ctx, askerId, websiteId, site.place),
      ctx.db
        .query("websiteQuestions")
        .withIndex("by_website_active", (q) => q.eq("websiteId", askerId).eq("isActive", true))
        .first(),
    ]);

    const me: HoldSummary = holds.find((entry) => entry.hold._id === args.siteId)?.summary ?? {
      siteId: args.siteId,
      host: site.website.displayHost,
      relationship: isTrackedHold(site.hold) ? "TRACKED" : "OWNED",
      ofHost: site.pairHost,
    };
    const watched = new Set([site.website.host, ...holds.map((entry) => entry.website.host)]);
    const ai = askerId === websiteId ? enginesNamed(latest.answers?.ai) : watchedAi;
    const bands = latest.metrics?.allBands ?? latest.ranking?.bands;
    return {
      ...me,
      websiteId,
      placeLabel: placeName(site),
      checked: latest.lastDay !== null,
      latestDay: latest.lastDay,
      lastCheckedAt: collectedAt,
      nextRunAt: site.schedule.nextRunAt,
      holds: holds.map((entry) => entry.summary),
      rivals: rivals.map((entry) => entry.summary),
      checkDays: days.filter((row) => row.keywords !== undefined).map((row) => row.day),
      counts: {
        // DataForSEO's own count of what the site ranks for; `keywordsStored`
        // is how many of them the Keywords page can list, which a pull capped
        // at its first few hundred leaves smaller.
        keywords: latest.metrics?.rankedKeywordsTotal ?? latest.ranking?.keywords ?? null,
        keywordsStored: latest.ranking?.keywords ?? null,
        pages: latest.ranking?.pages ?? null,
        top3: bands ? bands.p01_03 : null,
        referringDomains: latest.links?.referringDomains ?? null,
        brokenBacklinks: latest.links?.brokenBacklinks ?? null,
        aiNamed: ai?.named ?? null,
        aiAsked: ai?.asked ?? null,
        trackedSearches: searches.filter((row) => row.isActive).length,
        questionsSetUp: questions !== null,
        rankedUp: latest.ranking?.rankedUp ?? null,
        rankedDown: latest.ranking?.rankedDown ?? null,
        // What the Suggested page shows: not decided, and not already held.
        suggestions: suggestions.filter((row) => !row.decidedAt && !watched.has(row.host)).length,
        citedPages: cited.length,
      },
    };
  },
});
