import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  isBulkOperation,
  parseBulkByTarget,
  parseLlmResponse,
  parseSeoResultFor,
} from "./dataForSeoParsers";
import { listBrandedWebsites, resolveWebsiteIdsByHost } from "./websites";
import { aiEngineValidator, engineForOperationId } from "./seoAiEngines";
import { findBrandMention } from "./websiteBrands";
import { readWebsiteHost } from "./websiteIdentity";
import { getErrorMessage } from "./utils/lang";
import type { Id } from "./_generated/dataModel";
import { SEO_LOCATIONS } from "./seoLocations";

const LOCATION_BY_CITY = new Map(
  SEO_LOCATIONS.filter((location) => location.city).map((location) => [location.city!, location.code]),
);

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
  args: { pullId: v.id("seoDataPulls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pull = await ctx.runQuery(internal.seoCollectionParse.getPullForParse, {
      pullId: args.pullId,
    });
    if (!pull?.resultJson) return null;

    // An AI answer is read for who it names, then dropped. Nothing of its
    // prose is stored.
    const engine = engineForOperationId(pull.operationId);
    if (engine) {
      try {
        const parsed = parseLlmResponse(JSON.parse(pull.resultJson));
        // `sent`, not `args`: the action's own `args` is what carries the pull
        // id, and shadowing it here once sent an undefined id to the writer.
        const sent = JSON.parse(pull.taskArgsJson ?? "{}") as Record<string, unknown>;
        await ctx.runMutation(internal.seoCollectionParse.writeAiCitations, {
          pullId: args.pullId,
          prompt: typeof sent.user_prompt === "string" ? sent.user_prompt : "",
          engine,
          day: new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10),
          answer: parsed.answer,
          sources: parsed.sources.slice(0, MAX_SOURCES),
        });
      } catch (error) {
        await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
          pullId: args.pullId,
          error: getErrorMessage(error),
        });
      }
      return null;
    }

    // A bulk pull is about many websites and carries no single `websiteId`, so
    // it is filed target by target rather than against the row's own site.
    if (isBulkOperation(pull.operationId)) {
      try {
        const rows = parseBulkByTarget(pull.operationId, JSON.parse(pull.resultJson));
        if (rows.length > 0) {
          await ctx.runMutation(internal.seoCollectionParse.writeBulkMetrics, {
            pullId: args.pullId,
            operationId: pull.operationId,
            day: new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10),
            rows: rows.slice(0, MAX_BULK_ROWS).map((row) => ({
              host: row.target,
              metricsJson: JSON.stringify(row.metrics),
            })),
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

    if (!pull.websiteId) return null;

    try {
      const parsed = parseSeoResultFor(
        pull.operationId,
        JSON.parse(pull.resultJson),
        pull.target ?? undefined,
      );
      if (!parsed) return null;

      await ctx.runMutation(internal.seoCollectionParse.writeSeoMetrics, {
        pullId: args.pullId,
        websiteId: pull.websiteId as Id<"websites">,
        operationId: pull.operationId,
        day: new Date(pull.completedAt ?? Date.now()).toISOString().slice(0, 10),
        metricsJson: JSON.stringify(parsed.metrics),
        positions: (parsed.positions ?? []).slice(0, MAX_POSITION_ROWS),
      });
    } catch (error) {
      await ctx.runMutation(internal.seoCollectionParse.recordParseFailure, {
        pullId: args.pullId,
        error: getErrorMessage(error),
      });
    }
    return null;
  },
});

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

/**
 * One keyword on one day is one fact, so this should only ever find one row.
 * The small ceiling is the assertion: if it is ever hit, something upstream
 * has been writing duplicates.
 */
const SAME_DAY_LIMIT = 5;

export const getPullForParse = internalQuery({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.union(v.null(), v.object({
    operationId: v.string(),
    websiteId: v.union(v.id("websites"), v.null()),
    target: v.union(v.string(), v.null()),
    resultJson: v.union(v.string(), v.null()),
    taskArgsJson: v.union(v.string(), v.null()),
    completedAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pullId);
    if (!row) return null;
    return {
      operationId: row.operationId,
      websiteId: row.websiteId ?? null,
      target: row.target ?? null,
      resultJson: row.resultJson ?? null,
      taskArgsJson: row.taskArgsJson ?? null,
      completedAt: row.completedAt ?? null,
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
    metricsJson: v.string(),
    positions: v.array(v.object({
      keyword: v.string(),
      position: v.optional(v.number()),
      url: v.optional(v.string()),
      searchVolume: v.optional(v.number()),
    })),
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
      createdAt: now,
    });

    const priorPositions = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(REPLACE_LIMIT);
    for (const row of priorPositions) await ctx.db.delete(row._id);

    for (const entry of args.positions) {
      // The same keyword measured twice on one day is one fact, so an earlier
      // row for that day is replaced rather than joined by a second.
      const sameDay = await ctx.db
        .query("seoKeywordPositions")
        .withIndex("by_website_keyword_day", (q) =>
          q.eq("websiteId", args.websiteId).eq("keyword", entry.keyword).eq("day", args.day))
        .take(SAME_DAY_LIMIT);
      for (const row of sameDay) await ctx.db.delete(row._id);

      await ctx.db.insert("seoKeywordPositions", {
        websiteId: args.websiteId,
        keyword: entry.keyword,
        day: args.day,
        ...(entry.position !== undefined ? { position: entry.position } : {}),
        ...(entry.url ? { url: entry.url } : {}),
        ...(entry.searchVolume !== undefined ? { searchVolume: entry.searchVolume } : {}),
        pullId: args.pullId,
        createdAt: now,
      });
    }
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
 * The answer text arrives here, is read once, and is not stored. Only the
 * matched variant or the cited domain is written, so nothing an engine wrote
 * can ever reach an agent's prompt from this table.
 *
 * Replaces by pull, like every other parse, so a corrected matcher can be run
 * over stored payloads without anyone auditing the result afterwards.
 */
export const writeAiCitations = internalMutation({
  args: {
    pullId: v.id("seoDataPulls"),
    prompt: v.string(),
    engine: aiEngineValidator,
    day: v.string(),
    answer: v.string(),
    sources: v.array(v.object({ url: v.string(), title: v.optional(v.string()) })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const pull = await ctx.db.get(args.pullId);
    const locationCode = readLocationCode(pull?.taskArgsJson);

    const existing = await ctx.db
      .query("aiCitations")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .take(MAX_CITATION_ROWS + 100);
    for (const row of existing) await ctx.db.delete(row._id);

    // Brands first, in order of appearance: being named first and being named
    // last are different results, and the position is the screen's headline.
    const branded = await listBrandedWebsites(ctx, MAX_BRANDED_WEBSITES);
    const found: Array<{ websiteId: Id<"websites">; text: string; kind: "NAME" | "MISSPELLING"; at: number }> = [];
    for (const website of branded) {
      const hit = findBrandMention(args.answer, website.brandNames);
      if (hit) found.push({ websiteId: website._id, text: hit.matched, kind: hit.kind, at: hit.at });
    }
    found.sort((left, right) => left.at - right.at);

    // A parse that now succeeds clears what an earlier attempt left behind,
    // or the row would carry "Parse failed" forever after the fix that fixed it.
    await ctx.db.patch(args.pullId, { error: undefined });

    let position = 0;
    for (const hit of found.slice(0, MAX_CITATION_ROWS)) {
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
        variantKind: hit.kind,
        position,
        createdAt: now,
      });
    }

    // Then the sources the engine cited, by domain, matched to a website when
    // we hold one. A domain we do not hold is still a rival worth seeing.
    const hosts = args.sources
      .map((source) => readWebsiteHost(source.url))
      .map((parsed) => (parsed.ok ? parsed.host : null));
    const known = await resolveWebsiteIdsByHost(
      ctx,
      hosts.filter((host): host is string => host !== null),
    );

    let sourcePosition = 0;
    for (const [index, source] of args.sources.entries()) {
      const host = hosts[index];
      if (!host) continue;
      sourcePosition += 1;
      const websiteId = known.get(host);
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
    }
    return null;
  },
});

/** Which place the question was asked from, read back from what was sent. */
function readLocationCode(taskArgsJson: string | undefined): number | undefined {
  if (!taskArgsJson) return undefined;
  try {
    const args = JSON.parse(taskArgsJson) as Record<string, unknown>;
    // The engines take a country and city, not a code; the code is what the
    // company website stored, and it is recovered from the city when present.
    const city = typeof args.web_search_city === "string" ? args.web_search_city : undefined;
    if (!city) return undefined;
    return LOCATION_BY_CITY.get(city);
  } catch {
    return undefined;
  }
}

/** Cited sources kept per answer; an engine rarely cites more than a dozen. */
const MAX_SOURCES = 40;

/** Named brands kept per answer. */
const MAX_CITATION_ROWS = 200;

/** A ceiling on the platform's branded estate, not on this feature. */
const MAX_BRANDED_WEBSITES = 2_000;

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
    await ctx.db.patch(args.pullId, { error: `Parse failed: ${args.error}` });
    return null;
  },
});
