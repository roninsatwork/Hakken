import { v } from "convex/values";
import { PARSE_FAILED } from "./seoFiling";
import { readPullAnswerParts } from "./seoPullAnswers";

import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { judgeCompetitors, judgeStances, linkCitedAddresses, normaliseKeyword } from "./seoJudgments";
import {
  citedPageOf, patchKeywordIntent, recountCitedPages, requestRebuildEverywhere, requestSiteRebuild, type CitedPage,
} from "./siteRankings";
import { fileAnswerText } from "./siteAnswers";
import { fileSiteLinkPull, isSiteLinkOperation } from "./siteLinkFiling";
import { filePaidKeywords, paidPositionValidator } from "./sitePaid";
import { fileSiteCrawlPull } from "./siteCrawl";
import { fileKeywordListPull, fileRankedPositions } from "./siteKeywordList";
import { isKeywordListOperation } from "./dataForSeoKeywordListOperations";
import { serpSnapshotOf } from "./siteSerp";
import { rankedPositionValidator } from "./utils/siteShapes";
import { findBrandMention } from "./utils/websiteBrands";
import {
  parseDomainCompetitors,
  parseLlmResponse,
  parseSeoResultFor,
  parseSerpPage,
} from "./dataForSeoParsers";
import { SEO_KEYWORD_CHECK_OPERATION } from "./dataForSeoRegistry";
import { recordAnswer } from "./websiteTrackingStats";

import { aiEngineValidator, engineForOperationId } from "./seoAiEngines";
import { resolveWebsiteIdsByHost } from "./websites";
import { readWebsiteHost } from "./websiteIdentity";
import { getErrorMessage } from "./utils/lang";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { readLocationCode, readSentLocationCode } from "./utils/seoSentPlace";


/**
 * Reading a raw payload into the numbers that are kept forever.
 *
 * Split from the sending path because it is a different kind of work with a
 * different failure. A send that goes wrong costs money; a parse that goes
 * wrong costs nothing, because the raw file is still there and the fix is to
 * correct the parser and run it again. That is the whole reason raw responses
 * are stored at all.
 *
 * Idempotent by `pullId`: re-parsing replaces what the last parse wrote rather
 * than adding to it, so a corrected parser can be run over a month of files
 * without anyone auditing the result afterwards.
 */

export const parseSeoResult = internalAction({
  args: {
    pullId: v.id("seoDataPulls"),
    /** How many times this filing has been tried again after a clash (`seoFiling.finishFiling`). */
    retry: v.optional(v.number()),
  },
  returns: v.null(),
  // Stated, not inferred: inferred, it reads `internal`, which reads this.
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.seoFiling.startFiling, { pullId: args.pullId });
    await fileSeoResult(ctx, args);
    await ctx.runMutation(internal.seoFiling.finishFiling, { pullId: args.pullId, retry: args.retry ?? 0 });
    return null;
  },
});

/** File one bought answer into the tables the screens read. Failures are recorded on the pull. */
async function fileSeoResult(ctx: ActionCtx, args: { pullId: Id<"seoDataPulls"> }): Promise<null> {
  const pull = await readPullForParse(ctx, args.pullId);
  if (!pull?.resultJson) return null;
  // The Sites link lists and histories file on their own (`siteLinkFiling.ts`).
  if (isSiteLinkOperation(pull.operationId)) return await fileSiteLinkPull(ctx, args.pullId, pull);
  if (pull.operationId === "site_crawl") return await fileSiteCrawlPull(ctx, args.pullId, pull);
  // The full keyword list files a page at a time (`siteKeywordList.ts`).
  if (isKeywordListOperation(pull.operationId)) return await fileKeywordListPull(ctx, args.pullId, pull);

  // An AI answer is read for who it names, and its text is kept for the
  // Sites Full answers page (D9, docs/plans/active/user-sites-plan.md). The
  // matching and the stance judgment happen here, in the action.
  const engine = engineForOperationId(pull.operationId);
  if (engine) {
    try {
      const parsed = parseLlmResponse(JSON.parse(pull.resultJson));
      const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
      const prompt = typeof sent.user_prompt === "string" ? sent.user_prompt : "";

      const branded = await ctx.runQuery(internal.websites.listBrandedWebsitesInternal, {
        limit: MAX_BRANDED_WEBSITES,
      });

      // Every brand we hold, not just the one who asked: the answer names
      // whoever it names and one purchase should serve every watcher.
      const hits = [];
      for (const website of branded) {
        const found = findBrandMention(parsed.answer, website.brandNames);
        if (found) {
          hits.push({
            websiteId: website.websiteId,
            text: found.matched,
            variantKind: found.kind,
            at: found.at,
          });
        }
      }
      hits.sort((left, right) => left.at - right.at);

      const sources = parsed.sources.slice(0, MAX_SOURCES);
      const sourceHosts = sources.map((source) => {
        const host = readWebsiteHost(source.url);
        return host.ok ? host.host : null;
      });
      const resolved = await ctx.runQuery(internal.websites.resolveWebsiteIdsByHostInternal, {
        hosts: sourceHosts.filter((host): host is string => host !== null),
      });
      const byHost = new Map(resolved.map((row) => [row.host, row.websiteId]));

      const judged = await judgeStances(ctx, {
        ...(pull.companyId ? { companyId: pull.companyId } : {}),
        pullId: args.pullId,
        prompt,
        answer: parsed.answer,
        hits: hits.slice(0, MAX_CITATION_ROWS),
      });

      const linked = await linkCitedAddresses(ctx, {
        ...(pull.companyId ? { companyId: pull.companyId } : {}),
        pullId: args.pullId,
        branded,
        sources: sources.map((source, index) => ({
          url: source.url,
          host: sourceHosts[index],
          ...(sourceHosts[index] && byHost.get(sourceHosts[index]!)
            ? { websiteId: byHost.get(sourceHosts[index]!)! }
            : {}),
        })),
      });

      const day = new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10);

      await ctx.runMutation(internal.seoCollectionParse.writeAiCitations, {
        pullId: args.pullId,
        prompt,
        engine,
        day,
        brands: judged,
        sources: linked,
        answer: parsed.answer,
      });

      // The engine's own expansion of the question. These arrive in every
      // answer we already buy, and they are searches rather than prose, so
      // they are kept and then judged like any other search.
      if (parsed.fanOutQueries.length > 0) {
        // The place as sent, which for these endpoints is a country and an
        // optional city rather than a location code.
        const country = typeof sent.web_search_country_iso_code === "string"
          ? sent.web_search_country_iso_code
          : undefined;
        const city = typeof sent.web_search_city === "string" ? sent.web_search_city : undefined;
        const place = country ? (city ? `${country}/${city}` : country) : undefined;

        await ctx.runMutation(internal.seoCollectionParse.writeFanOutQueries, {
          pullId: args.pullId,
          prompt,
          engine,
          ...(place !== undefined ? { place } : {}),
          day,
          queries: parsed.fanOutQueries,
        });

        // A fan-out search is a search: judged once per phrase and shared
        // with every other client who meets it, which is why adding this
        // costs almost nothing beyond the first time a phrase appears.
        await ctx.scheduler.runAfter(0, internal.seoFiling.judgeKeywordsLater, {
          ...(pull.companyId ? { companyId: pull.companyId } : {}),
          pullId: args.pullId,
          keywords: parsed.fanOutQueries,
        });
      }
    } catch (error) {
      await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
        pullId: args.pullId,
        error: getErrorMessage(error),
      });
    }
    return null;
  }

  // Discovery is about one website and returns many others, so it is filed
  // as suggestions against the company's hold rather than as metrics.
  if (pull.operationId === "domain_competitors" && pull.websiteId) {
    try {
      const found = parseDomainCompetitors(JSON.parse(pull.resultJson))
        .filter((row) => row.host !== pull.target)
        .slice(0, MAX_DISCOVERED);
      const ours = await ctx.runQuery(internal.websiteCanonical.describeBusinessForJudging, {
        websiteId: pull.websiteId as Id<"websites">,
      });
      // Competitors the platform already holds, described by an admin, are
      // judged on what they sell rather than on their address alone.
      const held = await ctx.runQuery(internal.websites.resolveWebsiteIdsByHostInternal, {
        hosts: found.map((row) => row.host),
      });
      const described = await ctx.runQuery(internal.websiteCanonical.describeWebsitesForJudging, {
        websiteIds: held.map((row) => row.websiteId),
      });
      const hostById = new Map(held.map((row) => [row.websiteId, row.host]));
      const knownCandidates = Object.fromEntries(described.map((row) => [
        hostById.get(row.websiteId)!,
        { ...(row.sector ? { sector: row.sector } : {}), ...(row.does ? { does: row.does } : {}) },
      ]));
      const judged = await judgeCompetitors(ctx, {
        ...(pull.companyId ? { companyId: pull.companyId } : {}),
        pullId: args.pullId,
        ourHost: pull.target ?? "",
        ours,
        knownCandidates,
        found,
      });
      await ctx.runMutation(internal.seoCollectionParse.writeDiscoveredCompetitors, {
        pullId: args.pullId,
        websiteId: pull.websiteId as Id<"websites">,
        found: judged,
      });
    } catch (error) {
      await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
        pullId: args.pullId,
        error: getErrorMessage(error),
      });
    }
    return null;
  }

  // A search checked for everyone who tracks it. It has no website of its
  // own, so it is filed against every known site on the page instead.
  if (pull.operationId === SEO_KEYWORD_CHECK_OPERATION && !pull.websiteId) {
    try {
      const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
      const keyword = normaliseKeyword(typeof sent.keyword === "string" ? sent.keyword : "");
      if (!keyword) return null;
      const locationCode = typeof sent.location_code === "number" ? sent.location_code : undefined;

      const page = parseSerpPage(JSON.parse(pull.resultJson));
      const onPage = page.rows.flatMap((row) => {
        const identity = readWebsiteHost(row.domain);
        return identity.ok ? [{ ...row, host: identity.host }] : [];
      });
      const resolved = await ctx.runQuery(internal.websites.resolveWebsiteIdsByHostInternal, {
        hosts: [...new Set(onPage.map((row) => row.host))],
      });
      const byHost = new Map(resolved.map((row) => [row.host, row.websiteId]));

      await ctx.runMutation(internal.seoKeywordChecks.writeKeywordCheck, {
        pullId: args.pullId,
        keyword,
        ...(locationCode !== undefined ? { locationCode } : {}),
        day: new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10),
        found: onPage.flatMap((row) => {
          const websiteId = byHost.get(row.host);
          return websiteId
            ? [{ websiteId, position: row.position, ...(row.url ? { url: row.url } : {}) }]
            : [];
        }),
        serp: serpSnapshotOf(page),
      });

      await ctx.scheduler.runAfter(0, internal.seoFiling.judgeKeywordsLater, {
        ...(pull.companyId ? { companyId: pull.companyId } : {}),
        pullId: args.pullId,
        keywords: [keyword],
      });
    } catch (error) {
      await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
        pullId: args.pullId,
        error: getErrorMessage(error),
      });
    }
    return null;
  }

  if (!pull.websiteId) return null;

  try {
    const parsed = parseSeoResultFor(
      pull.operationId,
      JSON.parse(pull.resultJson),
      pull.target ?? undefined,
    );
    if (!parsed) return null;

    const positions = (parsed.positions ?? []).slice(0, MAX_POSITION_ROWS);
    const sentPlace = readSentLocationCode(pull.taskArgsJson ?? undefined);
    await ctx.runMutation(internal.seoCollectionParse.writeSeoMetrics, {
      pullId: args.pullId,
      websiteId: pull.websiteId as Id<"websites">,
      operationId: pull.operationId,
      day: new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10),
      ...(sentPlace !== undefined ? { locationCode: sentPlace } : {}),
      metricsJson: JSON.stringify(parsed.metrics),
      positions,
      ...(parsed.paidPositions ? { paidPositions: parsed.paidPositions.slice(0, MAX_POSITION_ROWS) } : {}),
    });

    await ctx.scheduler.runAfter(0, internal.seoFiling.judgeKeywordsLater, {
      ...(pull.companyId ? { companyId: pull.companyId } : {}),
      pullId: args.pullId,
      host: pull.target ?? "",
      websiteId: pull.websiteId as Id<"websites">,
      keywords: positions.map((entry) => entry.keyword),
    });
  } catch (error) {
    await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
      pullId: args.pullId,
      error: getErrorMessage(error),
    });
  }
  return null;
}

/**
 * The ceiling on keyword rows written from one pull.
 *
 * `domain_ranked_keywords` can return tens of thousands of keywords for a
 * large site, and every one of them is a document write inside a single
 * mutation. This keeps one parse inside one transaction; when per-keyword
 * tracking is switched on properly, this becomes a chunked write rather than
 * a cut.
 */
const MAX_POSITION_ROWS = 1_000;

/**
 * Websites filed from one bulk response.
 *
 * A page of expansion is a hundred websites and a bulk endpoint takes a
 * thousand, so this is well clear of both. It exists because the write happens
 * inside one mutation and a transaction needs a ceiling, not because a real
 * batch would ever approach it.
 */
const MAX_BULK_ROWS = 1_200;

/**
 * How much of a previous parse one re-parse will clear.
 *
 * A parse writes at most `MAX_POSITION_ROWS` positions and one metrics row, so
 * this is that with room to spare. Anything beyond it was not written here.
 */
const REPLACE_LIMIT = MAX_POSITION_ROWS + 100;


export type PullForParse = {
  operationId: string;
  websiteId: Id<"websites"> | null;
  target: string | null;
  resultJson: string | null;
  taskArgsJson: string | null;
  completedAt: number | null;
  companyId: Id<"companies"> | null;
};

/**
 * A request as filing reads it, its answer joined from the parts it is kept
 * in. Joined here, in the action: passed between functions, an answer is only
 * ever its parts, none larger than a document may be (`seoPullAnswers.ts`).
 */
export async function readPullForParse(ctx: ActionCtx, pullId: Id<"seoDataPulls">): Promise<PullForParse | null> {
  const pull = await ctx.runQuery(internal.seoCollectionParse.getPullForParse, { pullId });
  if (!pull) return null;
  const { resultParts, ...rest } = pull;
  return { ...rest, resultJson: resultParts ? resultParts.join("") : null };
}

export const getPullForParse = internalQuery({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.union(v.null(), v.object({
    operationId: v.string(),
    websiteId: v.union(v.id("websites"), v.null()),
    target: v.union(v.string(), v.null()),
    resultParts: v.union(v.array(v.string()), v.null()),
    taskArgsJson: v.union(v.string(), v.null()),
    completedAt: v.union(v.number(), v.null()),
    /** Whose cadence caused this, so a Decision is asked in their name. */
    companyId: v.union(v.id("companies"), v.null()),
  })),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pullId);
    if (!row) return null;
    return {
      operationId: row.operationId,
      websiteId: row.websiteId ?? null,
      target: row.target ?? null,
      resultParts: await readPullAnswerParts(ctx, row),
      taskArgsJson: row.taskArgsJson ?? null,
      completedAt: row.completedAt ?? null,
      companyId: row.companyId ?? null,
    };
  },
});

/**
 * Write the day's numbers, replacing anything a previous parse left.
 *
 * Replacing rather than inserting is what makes re-parsing safe. The keys are
 * the pull for the metrics row and the website, keyword and day for a position
 * row, which is also the shape a chart reads them back in.
 */
export const writeSeoMetrics = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    websiteId: v.id("websites"),
    operationId: v.string(),
    day: v.string(),
    /** The place the positions were measured from, as it was sent. */
    locationCode: v.optional(v.number()),
    metricsJson: v.string(),
    positions: v.array(rankedPositionValidator),
    /** The adverts in a ranked-keywords answer, filed apart (`sitePaid.ts`). */
    paidPositions: v.optional(v.array(paidPositionValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Bounded, like every read here: a re-parse replaces at most what one
    // parse wrote, and a query with no ceiling is a query that works until the
    // day the table is large.
    const existing = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(REPLACE_LIMIT);
    for (const row of existing) await ctx.db.delete(row._id);

    await ctx.db.patch(args.pullId, { error: undefined });

    await ctx.db.insert("seoWebsiteMetrics", {
      websiteId: args.websiteId,
      day: args.day,
      operationId: args.operationId,
      pullId: args.pullId,
      metricsJson: args.metricsJson,
      // Rankings are measured from a place, and so are their totals. A
      // site-wide figure (a backlinks summary) is sent no place and keeps none.
      ...(args.locationCode !== undefined ? { locationCode: args.locationCode } : {}),
      createdAt: now,
    });

    const priorPositions = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(REPLACE_LIMIT);
    for (const row of priorPositions) await ctx.db.delete(row._id);

    await fileRankedPositions(ctx, {
      websiteId: args.websiteId,
      pullId: args.pullId,
      day: args.day,
      ...(args.locationCode !== undefined ? { locationCode: args.locationCode } : {}),
      positions: args.positions,
    });
    const place = args.locationCode ?? DEFAULT_LOCATION_CODE;

    if (args.paidPositions && args.operationId === "domain_ranked_keywords") {
      await filePaidKeywords(ctx, { websiteId: args.websiteId, locationCode: place, pullId: args.pullId, day: args.day, rows: args.paidPositions });
    }

    // Rankings are this place's; a site-wide figure (backlinks) is every
    // watcher's, so it refreshes the summary of every place the site is read from.
    if (args.positions.length > 0) await requestSiteRebuild(ctx, args.websiteId, place);
    else await requestRebuildEverywhere(ctx, args.websiteId);
    return null;
  },
});

/**
 * Record who an AI answer named.
 *
 * **A row per mention, never per tracked site.** Every website with brand
 * names is matched against the answer — the client who asked, their rivals,
 * and everyone else we hold — because the answer names whoever it names and
 * one purchase should serve every watcher. Names we cannot match to a website
 * are still kept, as the cited domain, so a rival added later already has a
 * history waiting.
 *
 * The citation rows hold only the matched variant or the cited domain. The
 * answer's text is kept beside them in `aiAnswerTexts` since D9
 * (docs/plans/active/user-sites-plan.md, "Stored answers"): people need to
 * read what was said to plan from it, and an agent reading it later is handed
 * it as quoted material to analyse, never as instructions.
 *
 * Replaces by pull, like every other parse, so a corrected matcher can be run
 * over stored payloads without anyone auditing the result afterwards.
 */
/**
 * Keep the searches an engine derived from one of our questions.
 *
 * One row per search per question per engine per place, counted rather than
 * logged: what a reader wants is which searches keep coming back, not a diary
 * of every collection. `lastPullId` makes a re-parse idempotent — running a
 * corrected parser over a month of stored answers must not multiply the counts
 * by the number of times it was run.
 *
 * The text is a search phrase the engine wrote, not a passage of its answer,
 * so unlike the answer itself it is safe to keep and is the whole point of
 * keeping it.
 */
export const writeFanOutQueries = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    prompt: v.string(),
    engine: aiEngineValidator,
    place: v.optional(v.string()),
    day: v.string(),
    queries: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const queryText of args.queries.slice(0, MAX_FAN_OUT_QUERIES)) {
      const query = normaliseKeyword(queryText);
      if (!query) continue;

      // The dated record, for reporting over time. Once per answer: reading
      // the same answer twice is still one appearance.
      const alreadyDated = await ctx.db
        .query("promptFanOutDays")
        .withIndex("by_pull_query", (q) => q.eq("pullId", args.pullId).eq("query", query))
        .first();
      if (!alreadyDated) {
        await ctx.db.insert("promptFanOutDays", {
          prompt: args.prompt,
          engine: args.engine,
          ...(args.place !== undefined ? { place: args.place } : {}),
          query,
          day: args.day,
          pullId: args.pullId,
          createdAt: now,
        });
      }

      const existing = await ctx.db
        .query("promptFanOutQueries")
        .withIndex("by_prompt_engine_place_query", (q) =>
          q
            .eq("prompt", args.prompt)
            .eq("engine", args.engine)
            .eq("place", args.place)
            .eq("query", query),
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("promptFanOutQueries", {
          prompt: args.prompt,
          engine: args.engine,
          ...(args.place !== undefined ? { place: args.place } : {}),
          query,
          queryText,
          timesSeen: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          lastSeenDay: args.day,
          lastPullId: args.pullId,
        });
        continue;
      }

      // The same answer read twice is still one appearance — any answer, not
      // only the newest: known by its dated record, which is kept once per
      // answer. Re-filing an older one counted it again (reliability plan 3.6).
      if (alreadyDated || existing.lastPullId === args.pullId) continue;

      // An older answer filed late adds its appearance, never moves "last seen" back.
      const newest = args.day >= existing.lastSeenDay;
      await ctx.db.patch(existing._id, {
        timesSeen: existing.timesSeen + 1,
        ...(newest ? { queryText, lastSeenAt: now, lastSeenDay: args.day, lastPullId: args.pullId } : {}),
      });
    }
    return null;
  },
});

export const writeAiCitations = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    prompt: v.string(),
    engine: aiEngineValidator,
    day: v.string(),
    /** Already matched and already judged; see `judgeStances` in this file. */
    brands: v.array(v.object({
      websiteId: v.id("websites"),
      text: v.string(),
      variantKind: v.union(v.literal("NAME"), v.literal("MISSPELLING")),
      stance: v.optional(v.union(
        v.literal("RECOMMENDED"), v.literal("MENTIONED"), v.literal("WARNED_AGAINST"),
      )),
      stanceCertainty: v.optional(v.union(
        v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"),
      )),
    })),
    /** Already resolved, and already judged where an address needed judging. */
    sources: v.array(v.object({
      url: v.string(),
      title: v.optional(v.string()),
      websiteId: v.optional(v.id("websites")),
    })),
    /** What the engine said, kept word for word since D9. Absent from a caller that has none. */
    answer: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const pull = await ctx.db.get(args.pullId);
    const locationCode = readLocationCode(pull?.taskArgsJson);
    if (args.answer !== undefined) {
      await fileAnswerText(ctx, {
        pullId: args.pullId, prompt: args.prompt, engine: args.engine,
        locationCode: locationCode ?? DEFAULT_LOCATION_CODE, day: args.day, text: args.answer,
        sources: args.sources.map((source) => source.url),
      });
    }

    const existing = await ctx.db
      .query("aiCitations")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(MAX_CITATION_ROWS + 100);
    for (const row of existing) await ctx.db.delete(row._id);
    // Pages this answer cited before and after this parse, recounted below, so
    // a page a corrected parse no longer finds loses the citation.
    const citedPages: CitedPage[] = existing.flatMap((row) => citedPageOf(row) ?? []);

    // A parse that now succeeds clears what an earlier attempt left behind,
    // or the row would carry "Parse failed" forever after the fix that fixed it.
    await ctx.db.patch(args.pullId, { error: undefined });

    // Brands in order of appearance: being named first and being named last
    // are different results, and the position is the screen's headline. They
    // arrive already matched and already judged, from the action.
    let position = 0;
    for (const hit of args.brands) {
      position += 1;
      await ctx.db.insert("aiCitations", {
        prompt: args.prompt,
        engine: args.engine,
        ...(locationCode !== undefined ? { locationCode } : {}),
        day: args.day,
        pullId: args.pullId,
        kind: "BRAND",
        mentionedWebsiteId: hit.websiteId,
        mentionedText: hit.text,
        variantKind: hit.variantKind,
        ...(hit.stance ? { stance: hit.stance } : {}),
        ...(hit.stanceCertainty ? { stanceCertainty: hit.stanceCertainty } : {}),
        position,
        createdAt: now,
      });
    }

    // Then the sources the engine cited, by domain. A domain we do not hold
    // is still a rival worth seeing.
    const hosts = args.sources
      .map((source) => readWebsiteHost(source.url))
      .map((parsed) => (parsed.ok ? parsed.host : null));

    let sourcePosition = 0;
    for (const [index, source] of args.sources.entries()) {
      const host = hosts[index];
      if (!host) continue;
      sourcePosition += 1;
      const websiteId = source.websiteId;
      await ctx.db.insert("aiCitations", {
        prompt: args.prompt,
        engine: args.engine,
        ...(locationCode !== undefined ? { locationCode } : {}),
        day: args.day,
        pullId: args.pullId,
        kind: "SOURCE",
        ...(websiteId ? { mentionedWebsiteId: websiteId } : {}),
        mentionedText: host,
        url: source.url,
        position: sourcePosition,
        createdAt: now,
      });
      if (websiteId) {
        citedPages.push({
          websiteId, url: source.url, prompt: args.prompt, engine: args.engine, locationCode: locationCode ?? DEFAULT_LOCATION_CODE,
        });
      }
    }
    await recountCitedPages(ctx, citedPages);

    // The answer as a whole — including when it named nobody we know, which a
    // row per mention cannot record — and the summaries of every host asking
    // this question. The named list is brands, not sources: a cited page is
    // evidence, being named is the result.
    await recordAnswer(ctx, {
      pullId: args.pullId,
      prompt: args.prompt,
      engine: args.engine,
      locationCode: locationCode ?? DEFAULT_LOCATION_CODE,
      day: args.day,
      brands: args.brands,
    });
    return null;
  },
});

/** Discovered websites kept per pull. Beyond this the tail is noise. */
const MAX_DISCOVERED = 50;

/** Cited sources kept per answer; an engine rarely cites more than a dozen. */
const MAX_SOURCES = 40;

/** Named brands kept per answer. */
const MAX_CITATION_ROWS = 200;

/** A ceiling on the platform's branded estate, not on this feature. */
const MAX_BRANDED_WEBSITES = 2_000;

/**
 * Fan-out searches kept per answer.
 *
 * An engine publishes a handful; this is a guard against a payload that is not
 * what the docs describe, not a judgment about how many are worth having.
 */
const MAX_FAN_OUT_QUERIES = 50;

/**
 * File one bulk response against every website it covered.
 *
 * Matched on the host, because a bulk row names its target and nothing else. A
 * target we do not hold is skipped rather than guessed at: filing a number
 * against the wrong website is worse than filing none.
 *
 * Replaces by pull, like every other parse here, so a corrected parser can be
 * re-run over stored payloads without anyone auditing the result afterwards.
 */
export const writeBulkMetrics = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    operationId: v.string(),
    day: v.string(),
    rows: v.array(v.object({ host: v.string(), metricsJson: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(MAX_BULK_ROWS + 100);
    for (const row of existing) await ctx.db.delete(row._id);

    await ctx.db.patch(args.pullId, { error: undefined });
    const byHost = await resolveWebsiteIdsByHost(ctx, args.rows.map((row) => row.host));

    for (const row of args.rows) {
      const websiteId = byHost.get(row.host);
      // A target we do not hold is skipped rather than guessed at.
      if (!websiteId) continue;

      await ctx.db.insert("seoWebsiteMetrics", {
        websiteId,
        day: args.day,
        operationId: args.operationId,
        pullId: args.pullId,
        metricsJson: row.metricsJson,
        createdAt: now,
      });
      // A site-wide figure, so every place the site is read from.
      await requestRebuildEverywhere(ctx, websiteId);
    }
    return null;
  },
});

/**
 * File this run's discovered competitors against every company holding the
 * website they were discovered for.
 *
 * A suggestion a person already accepted or dismissed is left exactly as it
 * is: re-running discovery must not resurrect a rejected suggestion, nor
 * unpick an accepted one.
 */
export const writeDiscoveredCompetitors = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    websiteId: v.id("websites"),
    found: v.array(v.object({
      host: v.string(),
      intersections: v.number(),
      averagePosition: v.optional(v.number()),
      estimatedTraffic: v.optional(v.number()),
      domainKeywords: v.optional(v.number()),
      domainTraffic: v.optional(v.number()),
      kind: v.optional(v.union(
        v.literal("COMPETITOR"), v.literal("DIRECTORY"), v.literal("PUBLISHER"),
        v.literal("SUPPLIER"), v.literal("OTHER"),
      )),
      kindCertainty: v.optional(v.union(
        v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"),
      )),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.pullId, { error: undefined });
    const pull = await ctx.db.get(args.pullId);
    const day = new Date(pull?.completedAt ?? now).toISOString().slice(0, 10);

    // One pull, many holders: the website is shared, so everyone watching it
    // gets the suggestions from the one purchase.
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(MAX_HOLDERS);

    for (const hold of holds) {
      for (const row of args.found) {
        const existing = await ctx.db
          .query("discoveredCompetitors")
          .withIndex("by_company_website_host", (q) =>
            q.eq("companyWebsiteId", hold._id).eq("host", row.host))
          .unique();

        // The day's figures, kept whatever the suggestion's state, for
        // reporting over time — the suggestion row itself is overwritten.
        const dated = {
          intersections: row.intersections,
          ...(row.averagePosition !== undefined ? { averagePosition: row.averagePosition } : {}),
          ...(row.estimatedTraffic !== undefined ? { estimatedTraffic: row.estimatedTraffic } : {}),
          ...(row.kind ? { kind: row.kind } : {}),
          pullId: args.pullId,
        };
        const sameDay = await ctx.db
          .query("discoveredCompetitorDays")
          .withIndex("by_company_website_host_day", (q) =>
            q.eq("companyWebsiteId", hold._id).eq("host", row.host).eq("day", day))
          .first();
        if (sameDay) await ctx.db.patch(sameDay._id, dated);
        else {
          await ctx.db.insert("discoveredCompetitorDays", {
            companyWebsiteId: hold._id,
            companyId: hold.companyId,
            host: row.host,
            day,
            createdAt: now,
            ...dated,
          });
        }

        // The domain's own size is a fact, not a suggestion, so it is kept
        // current even once a person has decided (the Sites Market map).
        const domain = {
          ...(row.domainKeywords !== undefined ? { domainKeywords: row.domainKeywords } : {}),
          ...(row.domainTraffic !== undefined ? { domainTraffic: row.domainTraffic } : {}),
        };
        if (existing?.decidedAt) {
          await ctx.db.patch(existing._id, domain);
          continue;
        }

        const fields = {
          ...domain,
          intersections: row.intersections,
          ...(row.averagePosition !== undefined ? { averagePosition: row.averagePosition } : {}),
          ...(row.estimatedTraffic !== undefined ? { estimatedTraffic: row.estimatedTraffic } : {}),
          ...(row.kind ? { kind: row.kind } : {}),
          ...(row.kindCertainty ? { kindCertainty: row.kindCertainty } : {}),
        };

        if (existing) await ctx.db.patch(existing._id, fields);
        else {
          await ctx.db.insert("discoveredCompetitors", {
            companyWebsiteId: hold._id,
            companyId: hold.companyId,
            host: row.host,
            discoveredAt: now,
            ...fields,
          });
        }
      }
    }
    return null;
  },
});

/** Companies one discovery run files suggestions for. */
const MAX_HOLDERS = 200;

/** Which of these searches nobody has judged yet. */
export const findUnjudgedKeywords = internalQuery({
  args: { keywords: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const unjudged: string[] = [];
    for (const keyword of args.keywords) {
      const existing = await ctx.db
        .query("seoKeywordIntents")
        .withIndex("by_keyword", (q) => q.eq("keyword", keyword))
        .unique();
      if (!existing) unjudged.push(keyword);
    }
    return unjudged;
  },
});

/**
 * Keep what a search means.
 *
 * Kept forever rather than per collection: the meaning of a phrase does not
 * change while its rankings do, and re-judging it every week would be paying
 * again for an answer already held.
 */
export const writeKeywordIntents = internalMutation({
  args: {
    judged: v.array(v.object({
      keyword: v.string(),
      intent: v.union(
        v.literal("BUYING"), v.literal("RESEARCHING"), v.literal("BRANDED"),
        v.literal("IRRELEVANT"), v.literal("OTHER"),
      ),
      certainty: v.optional(v.union(
        v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"),
      )),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const row of args.judged) {
      const existing = await ctx.db
        .query("seoKeywordIntents")
        .withIndex("by_keyword", (q) => q.eq("keyword", row.keyword))
        .unique();
      // A later judgment replaces an earlier one rather than adding a second
      // opinion about the same phrase.
      if (existing) await ctx.db.patch(existing._id, { ...row, judgedAt: now });
      else await ctx.db.insert("seoKeywordIntents", { ...row, judgedAt: now });
      await patchKeywordIntent(ctx, row.keyword, row.intent);
    }
    return null;
  },
});

/**
 * A parse that threw.
 *
 * Recorded on the pull and nowhere else, and deliberately not a status change:
 * the data was bought and collected successfully, and only our reading of it
 * failed. Marking the pull failed would hide a paid result from the re-parse
 * that is meant to rescue it.
 */
export const recordParseFailure = internalMutation({
  args: { pullId: v.id("seoDataPulls"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pullId, { error: `${PARSE_FAILED} ${args.error}` });
    return null;
  },
});
