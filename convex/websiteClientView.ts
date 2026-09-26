import { v } from "convex/values";

import { superAdminQuery } from "./tenantFunctions";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";
import { SEO_KEYWORD_CHECK_OPERATION } from "./dataForSeoRegistry";
import { findSeoLocation } from "./utils/seoLocations";
import { isTrackedHold } from "./utils/websitePairing";
import {
  RIVAL_ATTENTION,
  SEARCH_ATTENTION,
  daysBetween,
  rivalVerdictValidator,
  searchVerdictValidator,
} from "./utils/trackingVerdicts";
import {
  MAX_LIST,
  SITE_OPERATION_IDS,
  allOperationIds,
  engineUnits,
  loadQuestionRows,
  loadRivalHolds,
  loadRivalRows,
  loadSearchRows,
  loadSite,
  monthly,
  requireSite,
  siteUnits,
  sumMonthly,
  unitCosts,
  untrackedNamed,
} from "./websiteSiteRows";
import { holdQuestions, holdSearches } from "./holdLists";

/**
 * A company's view of one of its websites: what it tracks, what that is
 * producing, and what it costs.
 *
 * The screens this feeds judge every row — slipping, never landed, ahead of
 * you — and print what each one costs to keep. Both are worked out here, on
 * the server, from the summaries `websiteTrackingStats.ts` keeps as results are
 * filed; the browser gets finished rows, already sorted by what needs
 * attention and already cut to one page.
 *
 * **Every read is by index and bounded.** A search's standing is one point
 * lookup, a question's is one per engine, a list is one range read, and a
 * rival is compared on at most `COMPARED_SEARCHES` of the site's searches. The
 * header is a separate, cheaper query than any tab, because every tab draws
 * it.
 *
 * Read through the company's own hold, like every tenant read here: the
 * searches and questions are the company's own
 * (docs/plans/active/private-tracking-lists-plan.md), the summaries of what was
 * collected are the host's, and which rivals it is compared with is this
 * company's own choice.
 */

// ---------------------------------------------------------------------------
// The header every tab draws
// ---------------------------------------------------------------------------

const moneyOrNull = v.union(v.number(), v.null());

const headerShape = v.union(v.null(), v.object({
  companyWebsiteId: v.id("companyWebsites"),
  companyId: v.id("companies"),
  companyName: v.union(v.string(), v.null()),
  websiteId: v.id("websites"),
  displayHost: v.string(),
  relationship: v.union(v.literal("OWNED"), v.literal("TRACKED")),
  pairedWith: v.union(v.null(), v.object({ companyWebsiteId: v.id("companyWebsites"), displayHost: v.string() })),
  placeLabel: v.string(),
  schedule: v.object({
    active: v.boolean(),
    intervalStr: v.union(v.string(), v.null()),
    nextRunAt: v.union(v.number(), v.null()),
    source: v.union(v.literal("WEBSITE"), v.literal("COMPANY"), v.literal("NONE"), v.literal("PAIR")),
  }),
  counts: v.object({ searches: v.number(), questions: v.number(), rivals: v.number(), brandNames: v.number() }),
  monthly: v.object({
    site: moneyOrNull,
    searches: moneyOrNull,
    questions: moneyOrNull,
    rivals: moneyOrNull,
    total: moneyOrNull,
  }),
  lastCollectedAt: v.union(v.number(), v.null()),
}));

/**
 * Everything the site's header says, and nothing it does not.
 *
 * Cheaper than any tab on purpose — every tab draws it: the lists are read for
 * their lengths and their engines, the costs table for prices, and no summary
 * is touched. A price is null while any operation in it has never been
 * charged.
 */
export const getSiteHeader = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: headerShape,
  handler: async (ctx, args) => {
    const site = await loadSite(ctx, args.companyWebsiteId);
    if (!site) return null;
    const tracked = isTrackedHold(site.hold);

    const [searches, questions, rivals, lastLine] = await Promise.all([
      // This company's own lists for its own website; a competitor has none
      // (docs/plans/active/private-tracking-lists-plan.md, V8).
      tracked ? Promise.resolve([]) : holdSearches(ctx, site.hold._id, MAX_LIST),
      tracked ? Promise.resolve([]) : holdQuestions(ctx, site.hold._id, MAX_LIST),
      tracked ? Promise.resolve([]) : loadRivalHolds(ctx, site),
      ctx.db
        .query("seoCycleLines")
        .withIndex("by_company_website", (q) =>
          q.eq("companyId", site.hold.companyId).eq("websiteId", site.website._id))
        .order("desc")
        .first(),
    ]);
    const liveSearches = searches.filter((row) => row.isActive);
    const liveQuestions = questions.filter((row) => row.isActive);
    const costs = await unitCosts(ctx, allOperationIds(liveQuestions));

    const siteMonthly = monthly(siteUnits(costs, site.perMonth), site.perMonth);
    const perSearch = monthly([costs.get(SEO_KEYWORD_CHECK_OPERATION)], site.perMonth);
    const searchesMonthly = liveSearches.length === 0 ? 0 : perSearch === null ? null : perSearch * liveSearches.length;
    const questionsMonthly = sumMonthly(liveQuestions.map((row) =>
      monthly(engineUnits(costs, row.engines), site.perMonth)));
    const perRival = monthly(siteUnits(costs, site.perMonth), site.perMonth);
    const rivalsMonthly = rivals.length === 0 ? 0 : perRival === null ? null : perRival * rivals.length;

    const place = findSeoLocation(site.place);
    return {
      companyWebsiteId: site.hold._id,
      companyId: site.hold.companyId,
      companyName: site.company?.name ?? null,
      websiteId: site.website._id,
      displayHost: site.website.displayHost,
      relationship: tracked ? ("TRACKED" as const) : ("OWNED" as const),
      pairedWith: site.pair && site.pairHost
        ? { companyWebsiteId: site.pair._id, displayHost: site.pairHost }
        : null,
      placeLabel: place?.label ?? "United Kingdom",
      schedule: {
        active: site.schedule.active,
        intervalStr: site.schedule.intervalStr,
        nextRunAt: site.schedule.nextRunAt,
        source: site.pair ? ("PAIR" as const) : site.schedule.source,
      },
      counts: {
        searches: liveSearches.length,
        questions: liveQuestions.length,
        rivals: rivals.length,
        brandNames: site.website.brandNames?.length ?? 0,
      },
      monthly: {
        site: siteMonthly,
        searches: searchesMonthly,
        questions: questionsMonthly,
        rivals: rivalsMonthly,
        // A tracked site is collected as a rival would be: its own pulls only.
        total: tracked
          ? siteMonthly
          : sumMonthly([siteMonthly, searchesMonthly, questionsMonthly, rivalsMonthly]),
      },
      lastCollectedAt: lastLine?.createdAt ?? null,
    };
  },
});

// ---------------------------------------------------------------------------
// The Brief's portfolio cards
// ---------------------------------------------------------------------------

/**
 * How each list is doing, counted by verdict.
 *
 * The portfolio summary under the Brief. It needs every row's verdict, so it
 * reads the summaries — which is why it is its own query rather than part of
 * the header every tab draws.
 */
export const getSitePortfolio = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.object({
    searches: v.record(v.string(), v.number()),
    questions: v.record(v.string(), v.number()),
    rivals: v.record(v.string(), v.number()),
    untrackedNamed: v.number(),
  }),
  handler: async (ctx, args) => {
    const site = await requireSite(ctx, args.companyWebsiteId);
    const noCosts = new Map<string, number>();
    const searches = (await loadSearchRows(ctx, site, noCosts)).filter((row) => row.isActive);
    const questions = (await loadQuestionRows(ctx, site, noCosts)).filter((row) => row.isActive);
    const rivals = isTrackedHold(site.hold) ? [] : await loadRivalRows(ctx, site, searches, questions, noCosts);

    const tally = <T extends string>(verdicts: readonly T[]) => {
      const counts: Record<string, number> = {};
      for (const verdict of verdicts) counts[verdict] = (counts[verdict] ?? 0) + 1;
      return counts;
    };
    const untracked = await untrackedNamed(ctx, site, questions);

    return {
      searches: tally(searches.map((row) => row.verdict)),
      questions: tally(questions.map((row) => row.verdict)),
      rivals: tally(rivals.map((row) => row.verdict)),
      untrackedNamed: untracked.length,
    };
  },
});

// ---------------------------------------------------------------------------
// The lists behind the Results and Competitors tabs
// ---------------------------------------------------------------------------

const listArgs = {
  companyWebsiteId: v.id("companyWebsites"),
  searchTerm: v.optional(v.string()),
  page: v.number(),
  pageSize: v.number(),
};


/**
 * The searches on this site's record, judged from this company's place.
 *
 * Sorted by what needs attention — slipping first — then paged, all here; the
 * browser gets fifteen finished rows. The intent beside each is the platform's
 * one judgment per phrase, looked up for the rows on this page only.
 */
export const listTrackedSearches = superAdminQuery({
  args: listArgs,
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("websiteKeywords"),
      keyword: v.string(),
      isActive: v.boolean(),
      verdict: searchVerdictValidator,
      lastPosition: v.union(v.number(), v.null()),
      previousPosition: v.union(v.number(), v.null()),
      bestPosition: v.union(v.number(), v.null()),
      firstCheckedDay: v.union(v.string(), v.null()),
      lastCheckedDay: v.union(v.string(), v.null()),
      weeksRunning: v.union(v.number(), v.null()),
      intent: v.union(v.string(), v.null()),
      monthlyUsd: moneyOrNull,
    })),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const site = await requireSite(ctx, args.companyWebsiteId);
    const costs = await unitCosts(ctx, [SEO_KEYWORD_CHECK_OPERATION]);
    const rows = await loadSearchRows(ctx, site, costs);

    const term = normalizeSearchTerm(args.searchTerm);
    const matching = (term ? rows.filter((row) => includesSearchTerm(row.keyword, term)) : rows)
      .sort((left, right) =>
        Number(right.isActive) - Number(left.isActive)
        || SEARCH_ATTENTION[left.verdict] - SEARCH_ATTENTION[right.verdict]
        || left.keyword.localeCompare(right.keyword));

    const paged = paginateItems(matching, args.page, args.pageSize);
    const data = await Promise.all(paged.data.map(async (row) => {
      const intent = await ctx.db
        .query("seoKeywordIntents")
        .withIndex("by_keyword", (q) => q.eq("keyword", row.keyword))
        .unique();
      return {
        ...row,
        weeksRunning: row.firstCheckedDay ? Math.floor(daysBetween(row.firstCheckedDay, site.today) / 7) : null,
        intent: intent?.intent ?? null,
      };
    }));
    return { ...paged, data };
  },
});


/**
 * The rivals this company watches against this site, and the ones the answers
 * keep naming that it does not.
 *
 * "Beats you on" compares the two on this site's own searches, on the same
 * page from the same place — the only comparison that means anything, and
 * why a rival is collected on its pair's day.
 */
export const listTrackedCompetitors = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.object({
    rivals: v.array(v.object({
      companyWebsiteId: v.id("companyWebsites"),
      websiteId: v.id("websites"),
      displayHost: v.string(),
      trackedSinceDay: v.string(),
      beatsYouOn: v.number(),
      youBeatOn: v.number(),
      comparedOn: v.number(),
      namedInAnswers: v.number(),
      answersCounted: v.number(),
      lastSeenDay: v.union(v.string(), v.null()),
      verdict: rivalVerdictValidator,
      monthlyUsd: moneyOrNull,
    })),
    untrackedNamed: v.array(v.object({
      websiteId: v.id("websites"),
      displayHost: v.string(),
      times: v.number(),
      lastDay: v.string(),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireSite(ctx, args.companyWebsiteId);
    if (isTrackedHold(site.hold)) return { rivals: [], untrackedNamed: [] };

    const costs = await unitCosts(ctx, SITE_OPERATION_IDS);
    const noCosts = new Map<string, number>();
    const searches = await loadSearchRows(ctx, site, noCosts);
    const questions = (await loadQuestionRows(ctx, site, noCosts)).filter((row) => row.isActive);
    const rivals = (await loadRivalRows(ctx, site, searches, questions, costs))
      .sort((left, right) =>
        RIVAL_ATTENTION[left.verdict] - RIVAL_ATTENTION[right.verdict]
        || right.beatsYouOn - left.beatsYouOn
        || left.displayHost.localeCompare(right.displayHost));

    return { rivals, untrackedNamed: await untrackedNamed(ctx, site, questions) };
  },
});
