import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, findMySite, listHold, myRivals, placeName, type HoldSummary, type SiteReader } from "./siteAccess";
import { citedPagesIn, coverageOf, coverageValidator, enginesNamingIn, latestBands, latestFigures, latestListAi, linkingWebsitesOf, searchTotalOf } from "./siteFigures";
import { holdAiSummary, holdQuestions, holdSearches } from "./holdLists";
import { tickedCount } from "./promptFanOut";
import type { EngineDay } from "./utils/siteShapes";
import { isTrackedHold } from "./utils/websitePairing";
import { CADENCES, cadenceOf } from "./utils/trackingVerdicts";
import { MAX_DISCOVERED, pickSuggestions } from "./siteCompetitors";
import { loadSite, MAX_LIST } from "./websiteSiteRows";
import { websiteIconUrl } from "./websiteIcons";
import { yourPagesCount } from "./yourPages";

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

type Reader = { db: QueryCtx["db"] };

/** Engines that named the site, of the engines asked, on its newest day of answers. */
function enginesNamed(ai: EngineDay[] | undefined): { named: number; asked: number } | null {
  if (!ai || ai.length === 0) return null;
  return {
    named: ai.filter((engine) => engine.named > 0).length,
    asked: ai.filter((engine) => engine.asked > 0).length,
  };
}

/** The searches held, for a site whose list holds only part of what it ranks for; null for a whole one. */
function heldOnlyOf(latest: Parameters<typeof coverageOf>[0]): number | null {
  const coverage = coverageOf(latest);
  return coverage.whole ? null : coverage.searches.held;
}

/** A website's newest lines of the company's collection read to find one whose request came back. */
const LINES_READ = 25;

/**
 * When the company's collection last brought something back for this website:
 * the newest of its requests that came back with data. A line is written when
 * a request is planned, so it moved on for a run still going, or one whose
 * every request failed (docs/plans/active/sites-audit-fixes-plan.md, 2.6).
 */
async function lastCollectedAt(ctx: Reader, companyId: Id<"companies">, websiteId: Id<"websites">) {
  const lines = await ctx.db
    .query("seoCycleLines")
    .withIndex("by_company_website", (q) => q.eq("companyId", companyId).eq("websiteId", websiteId))
    .order("desc")
    .take(LINES_READ);
  const pulls = await Promise.all(lines.map((line) => ctx.db.get(line.pullId)));
  const back = pulls.flatMap((pull) => (pull?.status === "READY" && pull.completedAt !== undefined ? [pull.completedAt] : []));
  return back.length > 0 ? Math.max(...back) : null;
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
  ofSiteId: v.union(v.id("companyWebsites"), v.null()),
});

const numberOrNull = v.union(v.number(), v.null());

/** A hold as the lists draw it: its summary, and its icon (`websiteIcons.ts`) or null to draw its letter. */
const pickerHoldValidator = v.object({ ...holdSummaryValidator.fields, iconUrl: v.union(v.string(), v.null()) });

async function withIcon(ctx: Pick<QueryCtx, "db">, entry: { website: Doc<"websites">; summary: HoldSummary }) {
  return { ...entry.summary, iconUrl: await websiteIconUrl(ctx, entry.website._id) };
}

/** Every website the company holds, owned first, with its headline figures. */
export const listMySites = tenantQuery({
  args: {},
  returns: v.array(v.object({
    ...pickerHoldValidator.fields,
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
    /** The searches held, for a list held in part: its moves are among those (§4.C). Null for a whole list. */
    movesAmongHeld: numberOrNull,
    toDo: v.number(),
    toDoCapped: v.boolean(),
    lastCheckedAt: numberOrNull,
    lastCheckedDay: v.union(v.string(), v.null()),
    nextRunAt: numberOrNull,
    /** How often the site is collected — a paired competitor at its owned site's — or null when nothing is. */
    cadence: v.union(...CADENCES.map((cadence) => v.literal(cadence)), v.null()),
    /** Where the site is watched from: its own place, or its owned site's. */
    placeLabel: v.string(),
    addedAt: v.number(),
  })),
  handler: async (ctx) => {
    const companyId = ctx.companyId;
    if (!companyId) return [];
    const holds = await companyHolds(ctx, companyId);
    // Each owned site's list summary, read once however many competitors
    // are measured on its questions — this company's own questions only.
    const summaries = new Map<string, ReturnType<typeof holdAiSummary>>();
    const summaryFor = (holdId: Id<"companyWebsites">, place: number) => {
      const key = `${holdId}|${place}`;
      const held = summaries.get(key) ?? holdAiSummary(ctx, holdId, place);
      summaries.set(key, held);
      return held;
    };
    return await Promise.all(holds.map(async ({ hold, website, summary }) => {
      const site = await loadSite(ctx, hold._id);
      const place = site?.place ?? 0;
      // The list the site is measured on: its own, the owned site's for a
      // competitor, none for a competitor watched against nothing.
      const holdId = site ? listHold(site) : null;
      const isAsker = holdId === hold._id;
      const [latest, collectedAt, moves, ownAi, watchedAi, iconUrl] = await Promise.all([
        latestFigures(ctx, website._id, place),
        lastCollectedAt(ctx, companyId, website._id),
        openMoves(ctx, hold),
        isAsker ? latestListAi(ctx, holdId, place, website._id) : Promise.resolve(null),
        !isAsker && holdId ? summaryFor(holdId, place).then((list) => enginesNamingIn(list, website._id)) : Promise.resolve(null),
        websiteIconUrl(ctx, website._id),
      ]);
      const ai = isAsker ? enginesNamed(ownAi?.ai) : watchedAi;
      const bands = latestBands(latest);
      return {
        ...summary,
        iconUrl,
        checked: latest.lastDay !== null,
        aiNamed: ai?.named ?? null,
        aiAsked: ai?.asked ?? null,
        top3: bands ? bands.p01_03 : null,
        pageOne: bands ? bands.p01_03 + bands.p04_10 : null,
        keywords: searchTotalOf(latest),
        estimatedTraffic: latest.metrics?.estimatedTraffic ?? null,
        rankedUp: latest.ranking?.rankedUp ?? null,
        rankedDown: latest.ranking?.rankedDown ?? null,
        // A list held in part: its moves are among the searches held, and the list says so (§4.C).
        movesAmongHeld: heldOnlyOf(latest),
        ...moves,
        lastCheckedAt: collectedAt,
        lastCheckedDay: latest.lastDay,
        nextRunAt: site?.schedule.nextRunAt ?? null,
        cadence: site?.schedule.active ? cadenceOf(site.schedule.intervalStr) : null,
        placeLabel: site ? placeName(site) : "",
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
    holds: v.array(pickerHoldValidator),
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
      /** The searches on the list switched on: the menu's count beside Your searches. */
      trackedSearches: v.number(),
      /** Of those, the ones ticked from a fan-out query (`tickedCount`): the menu's count beside Tracked fan-out queries. */
      trackedFanOut: v.number(),
      /** Searches on the list, and every one of them paused: still set up, so their pages keep their history and say so. */
      searchesPaused: v.boolean(),
      /** Whether the list holds any question the site is measured on in AI answers, on or paused: none means AI answers is not set up. */
      questionsSetUp: v.boolean(),
      /** Questions on the list, and every one of them paused (docs/plans/active/sites-audit-fixes-plan.md, 4.2). */
      questionsPaused: v.boolean(),
      rankedUp: numberOrNull,
      rankedDown: numberOrNull,
      suggestions: v.number(),
      citedPages: v.number(),
      /** DataForSEO's count of the searches it shows adverts on; Paid keywords holds only the everyday answer's. */
      paidKeywords: numberOrNull,
      /** Every page of the company's own website once: the menu's count beside Your pages; null on a competitor or before it is built. */
      yourPages: numberOrNull,
    }),
    /** What the keyword list holds of the site against the supplier's totals: every screen's "X of Y". */
    coverage: coverageValidator,
  })),
  handler: async (ctx, args) => await readMySite(ctx, args.siteId),
});

/**
 * A site's header and headline figures — the one read the Sites screens and
 * the Assistant both make (assistant-foundation-plan.md, item 7), so a figure
 * in an answer is the figure on the screen. Null when the site is not one of
 * the company's holds.
 */
export async function readMySite(ctx: SiteReader, siteId: Id<"companyWebsites">) {
  const site = await findMySite(ctx, siteId);
  if (!site) return null;
  const companyId = site.hold.companyId;
  const websiteId = site.website._id;

  // The list the site is measured on — this company's own (see `listHold`).
  const holdId = listHold(site);
  const isAsker = holdId === site.hold._id;
  const [holds, rivals, latest, collectedAt, days, searches, suggestions, summary, ownAi, anyQuestion, onQuestion] = await Promise.all([
    companyHolds(ctx, companyId),
    myRivals(ctx, site),
    latestFigures(ctx, websiteId, site.place),
    lastCollectedAt(ctx, companyId, websiteId),
    ctx.db
      .query("siteDaySummaries")
      .withIndex("by_site_day", (q) => q.eq("websiteId", websiteId).eq("locationCode", site.place))
      .order("desc")
      .take(CHECK_DAYS),
    holdSearches(ctx, holdId, MAX_LIST),
    ctx.db
      .query("discoveredCompetitors")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", siteId))
      .take(MAX_DISCOVERED),
    // The list's AI summary: the menu's count of cited pages, and a
    // competitor's engines naming it (docs/plans/active/sites-ai-list-summaries-plan.md).
    holdAiSummary(ctx, holdId, site.place),
    isAsker ? latestListAi(ctx, holdId, site.place, websiteId) : Promise.resolve(null),
    // Paused still counts as set up (4.2): a paused list keeps its history.
    holdQuestions(ctx, holdId, 1),
    holdQuestions(ctx, holdId, 1, { activeOnly: true }),
  ]);
  // One header read: the list's own length (`yourPages.ts`).
  const yourPages = isTrackedHold(site.hold) ? null : await yourPagesCount(ctx, siteId);

  const me: HoldSummary = holds.find((entry) => entry.hold._id === siteId)?.summary ?? {
    siteId: siteId,
    host: site.website.displayHost,
    relationship: isTrackedHold(site.hold) ? "TRACKED" : "OWNED",
    ofHost: site.pairHost,
    ofSiteId: site.pair?._id ?? null,
  };
  const suggested = pickSuggestions(summary?.othersNamed ?? [], suggestions, {
    websiteIds: new Set([websiteId, ...holds.map((entry) => entry.website._id)]),
    hosts: new Set([site.website.host, ...holds.map((entry) => entry.website.host)]),
  });
  const ai = isAsker ? enginesNamed(ownAi?.ai) : enginesNamingIn(summary, websiteId);
  const searchesOn = searches.filter((row) => row.isActive).length;
  const bands = latestBands(latest);
  return {
    ...me,
    websiteId,
    placeLabel: placeName(site),
    checked: latest.lastDay !== null,
    latestDay: latest.lastDay,
    lastCheckedAt: collectedAt,
    nextRunAt: site.schedule.nextRunAt,
    holds: await Promise.all(holds.map((entry) => withIcon(ctx, entry))),
    rivals: rivals.map((entry) => entry.summary),
    checkDays: days.filter((row) => row.keywords !== undefined).map((row) => row.day),
    counts: {
      // DataForSEO's own count of what the site ranks for; `keywordsStored`
      // is how many of them the Keywords page can list, which a pull capped
      // at its first few hundred leaves smaller.
      keywords: searchTotalOf(latest),
      keywordsStored: latest.ranking?.keywords ?? null,
      pages: latest.ranking?.pages ?? null,
      top3: bands ? bands.p01_03 : null,
      referringDomains: linkingWebsitesOf(latest.links),
      brokenBacklinks: latest.links?.brokenBacklinks ?? null,
      aiNamed: ai?.named ?? null,
      aiAsked: ai?.asked ?? null,
      trackedSearches: searchesOn,
      trackedFanOut: tickedCount(searches),
      searchesPaused: searches.length > 0 && searchesOn === 0,
      questionsSetUp: anyQuestion.length > 0,
      questionsPaused: anyQuestion.length > 0 && onQuestion.length === 0,
      rankedUp: latest.ranking?.rankedUp ?? null,
      rankedDown: latest.ranking?.rankedDown ?? null,
      // What the Suggested page lists, by its own rule (`pickSuggestions`).
      suggestions: suggested.named.length + suggested.found.length,
      citedPages: citedPagesIn(summary, websiteId).pages,
      paidKeywords: latest.metrics?.paidKeywords ?? null,
      yourPages,
    },
    coverage: coverageOf(latest),
  };
}
