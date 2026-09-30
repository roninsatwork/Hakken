import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { companyHolds, listHold, listWebsiteId, myRivals, requireMySite } from "./siteAccess";
import { holdAiSummary, holdQuestionAnswers, holdQuestions } from "./holdLists";
import { gapCopyKey, readListCopy } from "./siteListCopies";
import { listOrder, listPageArgs, listPageResult, pageOfList, preparingPage, sortDirectionArg, type ListSorts } from "./siteListPages";
import { wordStartMatcher } from "./utils/wordStarts";
import { latestFigures, searchTotalOf } from "./siteFigures";
import { asOfListCheck, searchStandings, searchStats } from "./siteGoogle";
import { rankIntentValidator, type NamedOther, type RankIntent } from "./utils/siteShapes";
import { rivalVerdict, rivalVerdictValidator } from "./utils/trackingVerdicts";
import { MAX_LIST } from "./websiteSiteRows";

/**
 * The site against its competitors, for the client's Sites screens.
 *
 * Every hold is a Site (D17), so the open site may be the company's own or one
 * it watches; the rivals beside it are the rest of its group (`siteAccess.ts`).
 * The organic competitors and suggestions are what DataForSEO found for this
 * company's hold. Nothing another company chose is ever read.
 */

type Reader = { db: QueryCtx["db"] };

/** Discovered competitors per hold; DataForSEO returns a few hundred at most. */
export const MAX_DISCOVERED = 300;

/** Websites the AI answers keep naming that Suggested competitors offers, at most. */
const NAMED_SUGGESTIONS = 10;

/**
 * What Suggested competitors lists, and the menu counts beside it — one rule
 * for both (docs/plans/active/sites-audit-fixes-plan.md, 2.4): the websites
 * the answers to the company's questions keep naming, most-named first, then
 * those discovery found ranking for the same searches, most overlap first.
 * Never one the company already holds, beside this site or anywhere else — it
 * could never be added — nor one it has decided about.
 */
export function pickSuggestions(
  othersNamed: readonly NamedOther[],
  discovered: readonly Doc<"discoveredCompetitors">[],
  held: { websiteIds: ReadonlySet<Id<"websites">>; hosts: ReadonlySet<string> },
): { named: NamedOther[]; found: Array<Doc<"discoveredCompetitors">> } {
  const named = othersNamed
    .filter((entry) => !held.websiteIds.has(entry.websiteId) && !held.hosts.has(entry.host))
    .slice(0, NAMED_SUGGESTIONS);
  const offered = new Set(named.map((entry) => entry.host));
  const found: Array<Doc<"discoveredCompetitors">> = [];
  for (const row of [...discovered].sort((left, right) => right.intersections - left.intersections)) {
    if (row.decidedAt || held.hosts.has(row.host) || offered.has(row.host)) continue;
    offered.add(row.host);
    found.push(row);
  }
  return { named, found };
}

/**
 * The content gap's copy (`siteListCopyBuilders.ts` writes it). Each row's
 * rivals are flattened as [rival, position, traffic, rival, position,
 * traffic, …], a rival being its place in the copy's `rivalIds` and its
 * traffic null when unknown, so the rivals no longer tracked can be left out
 * and the rest recounted when the list is read. A copy in the layout before
 * difficulty and traffic (2026-09-30) reads as none, and is built again.
 */
export const GAP_COPY_FIELDS = ["id", "keyword", "volume", "intent", "difficulty", "rivals", "day"] as const;

/**
 * The gaps a copy keeps, most-searched first. A gap can in theory reach 25
 * rivals × 5,000 searches; past this, the screen says the list is longer
 * (docs/plans/active/sites-table-pages-plan.md §5.2, T11).
 */
export const GAP_COPY_MAX = 50_000;

/** Searches a rival is compared on. Enough to rank it; bounded so a big list stays one query. */
const COMPARED_SEARCHES = 100;

/** The site's searches still checked read to find the ones it is compared on, at most. */
const STANDINGS_READ = 3 * COMPARED_SEARCHES;

/**
 * Lookups shared out among the rivals, each compared on its share: with the
 * site's own standings, a thousand searches and thirty competitors stay
 * inside what one request may read (docs/plans/active/sites-audit-fixes-plan.md, 3.5).
 */
const RIVAL_READS = 2_500;

/**
 * Each rival beside the site — the rest of its group (D17) — compared on the
 * searches and questions the company measures the site on: who is above whom
 * on the same page from the same place, and how often the answers name each.
 */
export const listRivals = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    websiteId: v.id("websites"),
    host: v.string(),
    relationship: v.union(v.literal("OWNED"), v.literal("TRACKED")),
    beatsYouOn: v.number(),
    youBeatOn: v.number(),
    comparedOn: v.number(),
    /** Of the searches compared, how many the website held a place on: none, and there is nothing to compare (4.9). */
    rankedOn: v.number(),
    namedInAnswers: v.number(),
    answersCounted: v.number(),
    lastSeenDay: v.union(v.string(), v.null()),
    verdict: rivalVerdictValidator,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const [ours, rivals, questions, answered] = await Promise.all([
      searchStandings(ctx, site, { activeOnly: true, cap: STANDINGS_READ }),
      myRivals(ctx, site),
      holdQuestions(ctx, listHold(site), MAX_LIST),
      holdQuestionAnswers(ctx, listHold(site), site.place, MAX_LIST),
    ]);
    const perRival = Math.max(1, Math.min(COMPARED_SEARCHES, Math.floor(RIVAL_READS / Math.max(1, rivals.length))));
    const compared = ours
      .filter((row) => row.isActive && row.stats?.lastCheckedDay)
      .slice(0, perRival);

    // How often the answers to the questions still asked named each website
    // of the group, from the list's rows (`siteListAi.ts`): one read, however
    // long the list.
    let answersCounted = 0;
    const named = new Map<Id<"websites">, { times: number; lastDay: string | null }>();
    const byPrompt = new Map(answered.map((row) => [row.prompt, row]));
    for (const question of questions) {
      if (!question.isActive) continue;
      const row = byPrompt.get(question.prompt);
      for (const engine of question.engines) {
        const entry = row?.engines.find((held) => held.engine === engine);
        if (!entry) continue;
        answersCounted += entry.asked;
        for (const seen of entry.sites) {
          if (seen.named === 0) continue;
          const held = named.get(seen.websiteId) ?? { times: 0, lastDay: null };
          held.times += seen.named;
          if (seen.lastNamedDay && (!held.lastDay || seen.lastNamedDay > held.lastDay)) held.lastDay = seen.lastNamedDay;
          named.set(seen.websiteId, held);
        }
      }
    }

    // Each competitor read as of the list's newest check, like the site's own
    // row (`asOfListCheck`): a competitor off the page keeps no stale place.
    const listSite = listWebsiteId(site);
    const listStats = listSite === site.website._id
      ? compared.map((row) => row.stats)
      : await Promise.all(compared.map((row) => searchStats(ctx, listSite, row.keyword, site.place)));
    return await Promise.all(rivals.map(async (rival) => {
      const theirs = await Promise.all(compared.map(async (row, index) => {
        const raw = await searchStats(ctx, rival.website._id, row.keyword, site.place);
        return rival.website._id === listSite ? raw : asOfListCheck(raw, listStats[index]);
      }));
      let beatsYouOn = 0;
      let youBeatOn = 0;
      let rankedOn = 0;
      // Widened by hand: assignments inside the callback below are invisible to
      // narrowing, which would otherwise pin this at null.
      let lastSeenDay = null as string | null;
      compared.forEach((row, index) => {
        const their = theirs[index];
        const them = their?.lastPosition;
        const us = row.stats?.lastPosition;
        if (them !== undefined) rankedOn += 1;
        if (them !== undefined && (us === undefined || them < us)) beatsYouOn += 1;
        if (us !== undefined && (them === undefined || us < them)) youBeatOn += 1;
        if (their && them !== undefined && (!lastSeenDay || their.lastCheckedDay > lastSeenDay)) {
          lastSeenDay = their.lastCheckedDay;
        }
      });
      const answers = named.get(rival.website._id);
      if (answers?.lastDay && (!lastSeenDay || answers.lastDay > lastSeenDay)) lastSeenDay = answers.lastDay;
      const trackedSinceDay = new Date(rival.hold.createdAt).toISOString().slice(0, 10);
      return {
        websiteId: rival.website._id,
        host: rival.website.displayHost,
        relationship: rival.summary.relationship,
        beatsYouOn,
        youBeatOn,
        comparedOn: compared.length,
        rankedOn,
        namedInAnswers: answers?.times ?? 0,
        answersCounted,
        lastSeenDay,
        verdict: rivalVerdict({ beatsYouOn, youBeatOn, lastSeenDay, trackedSinceDay }, site.today),
      };
    }));
  },
});

const kindValidator = v.union(
  v.literal("COMPETITOR"), v.literal("DIRECTORY"), v.literal("PUBLISHER"),
  v.literal("SUPPLIER"), v.literal("OTHER"), v.null(),
);

/**
 * The day each found website was last seen by discovery for this hold: the
 * "last checked" column (D12). One short read per website, from a list
 * capped on the hold.
 */
async function lastSeenDays(ctx: Reader, holdId: Id<"companyWebsites">, hosts: string[]): Promise<Map<string, string>> {
  const days = await Promise.all(hosts.map(async (host) => {
    const newest = await ctx.db
      .query("discoveredCompetitorDays")
      .withIndex("by_company_website_host_day", (q) => q.eq("companyWebsiteId", holdId).eq("host", host))
      .order("desc")
      .first();
    return [host, newest?.day] as const;
  }));
  return new Map(days.flatMap(([host, day]) => (day ? [[host, day] as [string, string]] : [])));
}

/** Every site DataForSEO found ranking for the same searches, most overlap first. */
export const listOrganicCompetitors = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    host: v.string(),
    kind: kindValidator,
    intersections: v.number(),
    averagePosition: v.union(v.number(), v.null()),
    estimatedTraffic: v.union(v.number(), v.null()),
    /** The whole domain: every keyword it ranks for, and its traffic (Phase 2). */
    domainKeywords: v.union(v.number(), v.null()),
    domainTraffic: v.union(v.number(), v.null()),
    tracked: v.boolean(),
    day: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const [found, rivals] = await Promise.all([
      ctx.db
        .query("discoveredCompetitors")
        .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.siteId))
        .take(MAX_DISCOVERED),
      myRivals(ctx, site),
    ]);
    const tracked = new Set(rivals.map((rival) => rival.website.host));
    const seen = await lastSeenDays(ctx, args.siteId, found.map((row) => row.host));
    return found
      .filter((row) => row.host !== site.website.host)
      .map((row) => ({
        host: row.host,
        kind: row.kind ?? null,
        intersections: row.intersections,
        averagePosition: row.averagePosition ?? null,
        estimatedTraffic: row.estimatedTraffic ?? null,
        domainKeywords: row.domainKeywords ?? null,
        domainTraffic: row.domainTraffic ?? null,
        tracked: tracked.has(row.host),
        day: seen.get(row.host) ?? null,
      }))
      .sort((left, right) => right.intersections - left.intersections);
  },
});

/**
 * The market map: every site in this one's market by how many searches it
 * ranks for and the traffic they bring — the site itself and its rivals from
 * their own collected figures, and the competitors DataForSEO found from its
 * whole-domain figures (Phase 2).
 */
export const marketMap = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    host: v.string(),
    role: v.union(v.literal("YOU"), v.literal("RIVAL"), v.literal("FOUND")),
    kind: kindValidator,
    keywords: v.union(v.number(), v.null()),
    traffic: v.union(v.number(), v.null()),
    sharedKeywords: v.union(v.number(), v.null()),
    day: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const [found, rivals] = await Promise.all([
      ctx.db
        .query("discoveredCompetitors")
        .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.siteId))
        .take(MAX_DISCOVERED),
      myRivals(ctx, site),
    ]);
    const held = [
      { website: site.website, role: "YOU" as const },
      ...rivals.map((rival) => ({ website: rival.website, role: "RIVAL" as const })),
    ];
    const heldHosts = new Set(held.map((entry) => entry.website.host));
    const shared = new Map(found.map((row) => [row.host, row.intersections]));
    const mine = await Promise.all(held.map(async ({ website, role }) => {
      const latest = await latestFigures(ctx, website._id, site.place);
      return {
        host: website.displayHost,
        role,
        kind: null,
        keywords: searchTotalOf(latest),
        traffic: latest.metrics?.estimatedTraffic ?? null,
        sharedKeywords: role === "YOU" ? null : shared.get(website.host) ?? null,
        day: latest.metrics?.day ?? latest.ranking?.day ?? null,
      };
    }));
    const listed = found.filter((row) => !heldHosts.has(row.host) && (row.domainKeywords !== undefined || row.domainTraffic !== undefined));
    const seen = await lastSeenDays(ctx, args.siteId, listed.map((row) => row.host));
    const others = listed
      .map((row) => ({
        host: row.host,
        role: "FOUND" as const,
        kind: row.kind ?? null,
        keywords: row.domainKeywords ?? null,
        traffic: row.domainTraffic !== undefined ? Math.round(row.domainTraffic) : null,
        sharedKeywords: row.intersections,
        day: seen.get(row.host) ?? null,
      }));
    return [...mine, ...others];
  },
});

type GapListRow = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  rivals: Array<{ websiteId: Id<"websites">; position: number; traffic: number | null }>;
};

/**
 * Content gap's columns that sort, every one worked out for every search
 * before the page is cut: the search A to Z, the most searched first and the
 * easiest first. A competitor's own Position (the top first) and Traffic (the
 * most first) sort too, by `rivalId`; a search it does not rank for is a
 * blank, last whichever way.
 */
const GAP_SORTS: ListSorts<GapListRow, "keyword" | "volume" | "kd"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  kd: { value: (row) => row.difficulty, first: "asc" },
};

/** One competitor's column, for the searches it ranks for; blank for the rest. */
function rivalSorts(rivalId: Id<"websites">): ListSorts<GapListRow, "position" | "traffic"> {
  const of = (row: GapListRow) => row.rivals.find((rival) => rival.websiteId === rivalId);
  return {
    position: { value: (row) => of(row)?.position ?? null, first: "asc" },
    traffic: { value: (row) => of(row)?.traffic ?? null, first: "desc" },
  };
}

/** A competitor's columns: its Sites page (`siteId`), the website its rankings are filed under, and its name. */
const gapRival = v.object({ siteId: v.id("companyWebsites"), websiteId: v.id("websites"), host: v.string() });

/**
 * Searches the tracked rivals rank for and this site does not, most-searched
 * first, from the gap worked out for this company's hold (`siteContentGap.ts`),
 * counted from its compact copy — laid out as Ahrefs lays out its content gap
 * (Anthony, 2026-09-30), organic search only: what each search is like, then
 * each competitor's position and traffic for it. The search's cost per click
 * and its page's features were drawn and taken off the same day ("remove it
 * please", "and remove CPC too"). `competitors` names the
 * columns, every rival tracked in the order the site switcher lists them,
 * whether or not it ranks for anything on the page. A rival no longer tracked
 * is left out of each search's rivals and the rest recounted, so "at least two
 * rivals" means two the company still tracks.
 */
export const listContentGap = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    ...listPageArgs,
    search: v.optional(v.string()),
    intent: v.optional(rankIntentValidator),
    /** Only searches at least this many rivals rank for. */
    minRivals: v.optional(v.number()),
    sort: v.optional(v.union(v.literal("keyword"), v.literal("volume"), v.literal("kd"), v.literal("position"), v.literal("traffic"))),
    /** The competitor a Position or Traffic order is of, by its Sites page. */
    rivalId: v.optional(v.id("companyWebsites")),
    direction: sortDirectionArg,
  },
  returns: v.object({
    ...listPageResult(v.object({
      _id: v.id("siteContentGaps"),
      keyword: v.string(),
      volume: v.union(v.number(), v.null()),
      intent: rankIntentValidator,
      /** How hard the search is, 0–100; null until the gap is worked out again. */
      difficulty: v.union(v.number(), v.null()),
      rivalsRanking: v.number(),
      rivals: v.array(v.object({
        websiteId: v.id("websites"),
        host: v.string(),
        position: v.number(),
        /** Visits a month DataForSEO estimates the search brings this rival. */
        traffic: v.union(v.number(), v.null()),
      })),
      /** The day the gap was last worked out from the rivals' rankings. */
      day: v.string(),
    })).fields,
    competitors: v.array(gapRival),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rivals = await myRivals(ctx, site);
    const competitors = rivals.map((rival) => ({ siteId: rival.hold._id, websiteId: rival.website._id, host: rival.website.displayHost }));
    const copy = await readListCopy(ctx, "gap", gapCopyKey(args.siteId), GAP_COPY_FIELDS);
    if (!copy) return { ...preparingPage(args.rows), competitors };
    const hosts = new Map<string, string>(competitors.map((rival) => [rival.websiteId, rival.host]));
    const rivalIds = JSON.parse(typeof copy.meta.rivalIds === "string" ? copy.meta.rivalIds : "[]") as string[];
    const matches = wordStartMatcher(args.search);
    const minRivals = Math.max(1, args.minRivals ?? 1);

    const list = copy.rows.flatMap(([id, keyword, volume, intent, difficulty, flat, day]) => {
      if (args.intent && intent !== args.intent) return [];
      if (matches && !matches(keyword as string)) return [];
      // Only the rivals this company still tracks: one removed since the
      // gap was worked out is not named, nor counted.
      const tracked: Array<{ websiteId: Id<"websites">; host: string; position: number; traffic: number | null }> = [];
      const triples = flat as Array<number | null>;
      for (let index = 0; index < triples.length; index += 3) {
        const websiteId = rivalIds[triples[index] as number];
        const host = websiteId ? hosts.get(websiteId) : undefined;
        if (host) tracked.push({ websiteId: websiteId as Id<"websites">, host, position: triples[index + 1] as number, traffic: triples[index + 2] });
      }
      if (tracked.length < minRivals) return [];
      return [{
        _id: id as Id<"siteContentGaps">,
        keyword: keyword as string,
        volume: volume as number | null,
        intent: intent as RankIntent,
        difficulty: difficulty as number | null,
        rivalsRanking: tracked.length,
        rivals: tracked,
        day: day as string,
      }];
    });
    const name = (row: GapListRow) => row.keyword;
    const column = args.sort;
    if (column === "position" || column === "traffic") {
      // A competitor's order with no competitor tracked to read it from opens on the list's own.
      const rival = competitors.find((entry) => entry.siteId === args.rivalId);
      list.sort(rival
        ? listOrder(rivalSorts(rival.websiteId), column, args.direction, name)
        : listOrder(GAP_SORTS, "volume", undefined, name));
    } else {
      list.sort(listOrder(GAP_SORTS, column ?? "volume", args.direction, name));
    }
    return { ...pageOfList(list, args.page, args.rows, copy.cut), competitors };
  },
});

/**
 * Competitors worth a look: sites the AI answers keep naming, then sites
 * ranking for the same searches, that this company does not watch yet.
 * Read-only — adding one is done in admin (D1, D6).
 */
export const listSuggested = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.array(v.object({
    host: v.string(),
    reason: v.union(v.literal("NAMED_BY_AI"), v.literal("RANKS_FOR_YOUR_SEARCHES")),
    times: v.union(v.number(), v.null()),
    intersections: v.union(v.number(), v.null()),
    kind: kindValidator,
    /** When it was last seen: named in an answer, or found by discovery. */
    day: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    // The answers' most-named websites come from the list's summary — one read,
    // however long the list (docs/plans/active/sites-audit-fixes-plan.md, 3.4).
    const [summary, discovered, holds] = await Promise.all([
      holdAiSummary(ctx, listHold(site), site.place),
      ctx.db
        .query("discoveredCompetitors")
        .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.siteId))
        .take(MAX_DISCOVERED),
      companyHolds(ctx, site.hold.companyId),
    ]);
    const { named, found } = pickSuggestions(summary?.othersNamed ?? [], discovered, {
      websiteIds: new Set(holds.map((entry) => entry.website._id)),
      hosts: new Set(holds.map((entry) => entry.website.host)),
    });
    const days = await lastSeenDays(ctx, args.siteId, found.map((row) => row.host));
    return [
      ...named.map((entry) => ({
        host: entry.host, reason: "NAMED_BY_AI" as const, times: entry.times, intersections: null, kind: null, day: entry.lastDay,
      })),
      ...found.map((row) => ({
        host: row.host,
        reason: "RANKS_FOR_YOUR_SEARCHES" as const,
        times: null,
        intersections: row.intersections,
        kind: row.kind ?? null,
        day: days.get(row.host) ?? null,
      })),
    ];
  },
});
