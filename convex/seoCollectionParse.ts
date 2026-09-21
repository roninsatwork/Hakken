import { v } from "convex/values";

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { parseSeoResultFor } from "./dataForSeoParsers";
import { getErrorMessage } from "./utils/lang";
import type { Id } from "./_generated/dataModel";

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
    if (!pull?.resultJson || !pull.websiteId) return null;

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

export const getPullForParse = internalQuery({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.union(v.null(), v.object({
    operationId: v.string(),
    websiteId: v.union(v.id("websites"), v.null()),
    target: v.union(v.string(), v.null()),
    resultJson: v.union(v.string(), v.null()),
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

    const existing = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_pull", (q) => q.eq("pullId", args.pullId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

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
      .collect();
    for (const row of priorPositions) await ctx.db.delete(row._id);

    for (const entry of args.positions) {
      // The same keyword measured twice on one day is one fact, so an earlier
      // row for that day is replaced rather than joined by a second.
      const sameDay = await ctx.db
        .query("seoKeywordPositions")
        .withIndex("by_website_keyword_day", (q) =>
          q.eq("websiteId", args.websiteId).eq("keyword", entry.keyword).eq("day", args.day))
        .collect();
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
