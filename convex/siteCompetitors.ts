import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { tenantQuery } from "./tenantFunctions";
import { listWebsiteId, myRivals, requireMySite, sitePage } from "./siteAccess";
import { answerPlace } from "./seoAiEngines";
import { latestFigures } from "./siteFigures";
import { searchStandings } from "./siteGoogle";
import { rankIntentValidator } from "./utils/siteShapes";
import { rivalVerdict, rivalVerdictValidator } from "./utils/trackingVerdicts";
import { loadQuestionRows, MAX_LIST, untrackedNamed } from "./websiteSiteRows";

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
const MAX_DISCOVERED = 300;

/** How far a narrowed gap read may look for one page of matches. */
const MAX_ROWS_READ = 1_000;

/** Searches a rival is compared on. Enough to rank it; bounded so a big list stays one query. */
const COMPARED_SEARCHES = 100;

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
    namedInAnswers: v.number(),
    answersCounted: v.number(),
    lastSeenDay: v.union(v.string(), v.null()),
    verdict: rivalVerdictValidator,
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const askerId = listWebsiteId(site);
    const [ours, rivals, questions] = await Promise.all([
      searchStandings(ctx, site),
      myRivals(ctx, site),
      ctx.db.query("websiteQuestions").withIndex("by_website", (q) => q.eq("websiteId", askerId)).take(MAX_LIST),
    ]);
    const compared = ours
      .filter((row) => row.isActive && row.stats?.lastCheckedDay)
      .slice(0, COMPARED_SEARCHES);

    // How often the answers to the asker's questions named each website: the
    // asker's own count, and everyone else's from what the answers named.
    let answersCounted = 0;
    const named = new Map<Id<"websites">, { times: number; lastDay: string | null }>();
    for (const question of questions) {
      if (!question.isActive) continue;
      for (const engine of question.engines) {
        const stats = await ctx.db
          .query("websiteQuestionStats")
          .withIndex("by_key", (q) =>
            q.eq("websiteId", askerId).eq("prompt", question.prompt).eq("engine", engine)
              .eq("locationCode", answerPlace(engine, site.place)))
          .unique();
        if (!stats) continue;
        answersCounted += stats.asked;
        const self = named.get(askerId) ?? { times: 0, lastDay: null };
        self.times += stats.named;
        if (stats.lastNamedDay && (!self.lastDay || stats.lastNamedDay > self.lastDay)) self.lastDay = stats.lastNamedDay;
        named.set(askerId, self);
        for (const other of stats.othersNamed) {
          const held = named.get(other.websiteId) ?? { times: 0, lastDay: null };
          held.times += other.times;
          if (!held.lastDay || other.lastDay > held.lastDay) held.lastDay = other.lastDay;
          named.set(other.websiteId, held);
        }
      }
    }

    return await Promise.all(rivals.map(async (rival) => {
      const theirs = await Promise.all(compared.map((row) =>
        ctx.db
          .query("websiteSearchStats")
          .withIndex("by_key", (q) =>
            q.eq("websiteId", rival.website._id).eq("keyword", row.keyword).eq("locationCode", site.place))
          .unique()));
      let beatsYouOn = 0;
      let youBeatOn = 0;
      // Widened by hand: assignments inside the callback below are invisible to
      // narrowing, which would otherwise pin this at null.
      let lastSeenDay = null as string | null;
      compared.forEach((row, index) => {
        const their = theirs[index];
        const them = their?.lastPosition;
        const us = row.stats?.lastPosition;
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
        keywords: latest.metrics?.rankedKeywordsTotal ?? latest.ranking?.keywords ?? null,
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

/**
 * Searches the tracked rivals rank for and this site does not, most-searched
 * first, from the gap worked out for this company's hold (`siteContentGap.ts`).
 */
export const listContentGap = tenantQuery({
  args: {
    siteId: v.id("companyWebsites"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    intent: v.optional(rankIntentValidator),
    /** Only searches at least this many rivals rank for. */
    minRivals: v.optional(v.number()),
  },
  returns: paginationResultValidator(v.object({
    _id: v.id("siteContentGaps"),
    keyword: v.string(),
    volume: v.union(v.number(), v.null()),
    intent: rankIntentValidator,
    rivalsRanking: v.number(),
    bestRivalPosition: v.number(),
    rivals: v.array(v.object({ websiteId: v.id("websites"), host: v.string(), position: v.number() })),
    /** The day the gap was last worked out from the rivals' rankings. */
    day: v.string(),
  })),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const rivals = await myRivals(ctx, site);
    const hosts = new Map<Id<"websites">, string>(rivals.map((rival) => [rival.website._id, rival.website.displayHost]));
    const term = args.search?.trim();
    const intent = args.intent;
    const minRivals = args.minRivals ?? 1;

    const result = term
      ? await ctx.db
        .query("siteContentGaps")
        .withSearchIndex("search_keyword", (q) => {
          const search = q.search("keyword", term).eq("companyWebsiteId", args.siteId);
          return intent ? search.eq("intent", intent) : search;
        })
        .filter((q) => q.gte(q.field("rivalsRanking"), minRivals))
        .paginate(sitePage(args.paginationOpts))
      : intent
        ? await ctx.db
          .query("siteContentGaps")
          .withIndex("by_hold_intent_volume", (q) => q.eq("companyWebsiteId", args.siteId).eq("intent", intent))
          .order("desc")
          .filter((q) => q.gte(q.field("rivalsRanking"), minRivals))
          .paginate({ ...sitePage(args.paginationOpts), maximumRowsRead: MAX_ROWS_READ })
        : minRivals > 1
          ? await ctx.db
            .query("siteContentGaps")
            .withIndex("by_hold_rivals_volume", (q) => q.eq("companyWebsiteId", args.siteId).gte("rivalsRanking", minRivals))
            .order("desc")
            .paginate(sitePage(args.paginationOpts))
          : await ctx.db
            .query("siteContentGaps")
            .withIndex("by_hold_volume", (q) => q.eq("companyWebsiteId", args.siteId))
            .order("desc")
            .paginate(sitePage(args.paginationOpts));

    return {
      ...result,
      page: result.page.map((row) => ({
        _id: row._id,
        keyword: row.keyword,
        volume: row.volumeKnown ? row.volume : null,
        intent: row.intent,
        rivalsRanking: row.rivalsRanking,
        bestRivalPosition: row.bestRivalPosition,
        // Only the rivals this company still tracks: one removed since the
        // last rebuild is not named on the screen.
        rivals: row.rivals.flatMap((rival) => {
          const host = hosts.get(rival.websiteId);
          return host ? [{ websiteId: rival.websiteId, host, position: rival.position }] : [];
        }),
        day: new Date(row.updatedAt).toISOString().slice(0, 10),
      })),
    };
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
    // The questions the site is measured on: its own, or its owned site's.
    const asker = await ctx.db.get(listWebsiteId(site));
    const [questions, found, rivals] = await Promise.all([
      loadQuestionRows(ctx, asker ? { ...site, website: asker } : site, new Map()),
      ctx.db
        .query("discoveredCompetitors")
        .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.siteId))
        .take(MAX_DISCOVERED),
      myRivals(ctx, site),
    ]);
    const watched = new Set([site.website.host, ...rivals.map((rival) => rival.website.host)]);
    const named = await untrackedNamed(ctx, site, questions);

    const rows: Array<{
      host: string;
      reason: "NAMED_BY_AI" | "RANKS_FOR_YOUR_SEARCHES";
      times: number | null;
      intersections: number | null;
      kind: "COMPETITOR" | "DIRECTORY" | "PUBLISHER" | "SUPPLIER" | "OTHER" | null;
      day: string | null;
    }> = [];
    const seen = new Set<string>();
    for (const row of named) {
      if (seen.has(row.displayHost)) continue;
      seen.add(row.displayHost);
      rows.push({ host: row.displayHost, reason: "NAMED_BY_AI", times: row.times, intersections: null, kind: null, day: row.lastDay });
    }
    const offered = found
      .sort((left, right) => right.intersections - left.intersections)
      .filter((row) => !row.decidedAt && !watched.has(row.host) && !seen.has(row.host));
    const days = await lastSeenDays(ctx, args.siteId, offered.map((row) => row.host));
    for (const row of offered) {
      if (seen.has(row.host)) continue;
      seen.add(row.host);
      rows.push({
        host: row.host,
        reason: "RANKS_FOR_YOUR_SEARCHES",
        times: null,
        intersections: row.intersections,
        kind: row.kind ?? null,
        day: days.get(row.host) ?? null,
      });
    }
    return rows;
  },
});
