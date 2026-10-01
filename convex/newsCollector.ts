import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { requestTranslation } from "./contentTranslation";
import { newsSourceKindValidator } from "./newsSchema";

/**
 * The News Collector's reads and writes (docs/plans/active/knowledge-news-
 * and-digest-plan.md, phase 5); its job is `newsCollectorRun.ts`. What it
 * collects goes live in News at once (A4), in English, and the Translator is
 * asked for every other language as each item is saved.
 */

/** Sources read in one run; more than this waits for the next. */
const SOURCES_PER_RUN = 100;

/** The agent's own instructions and model, which the collector's summaries follow. */
export const readCollectorAgent = internalQuery({
  args: { runId: v.id("agentRuns") },
  returns: v.union(v.null(), v.object({
    instructions: v.string(),
    requestedModelId: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    const agent = run ? await ctx.db.get(run.agentId) : null;
    if (!agent) return null;
    return {
      instructions: agent.systemPrompt ?? "",
      ...(agent.modelSelectionMode === "inherit" ? {} : { requestedModelId: agent.modelId }),
    };
  },
});

/** Every source that is on, the longest unread first. */
export const listSourcesToRead = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("newsSources"),
    kind: newsSourceKindValidator,
    name: v.string(),
    address: v.string(),
    firstRead: v.boolean(),
  })),
  handler: async (ctx) => {
    const on = await ctx.db.query("newsSources").withIndex("by_on", (q) => q.eq("isOn", true)).take(SOURCES_PER_RUN);
    return on
      .sort((one, other) => (one.lastCheckedAt ?? 0) - (other.lastCheckedAt ?? 0))
      .map((source) => ({
        _id: source._id,
        kind: source.kind,
        name: source.name,
        address: source.address,
        firstRead: source.lastCheckedAt === undefined,
      }));
  },
});

/** Which of these keys the News already holds, or has had taken down — neither is collected again. */
export const knownKeys = internalQuery({
  args: { keys: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const known: string[] = [];
    for (const key of args.keys) {
      const held = await ctx.db.query("newsItems").withIndex("by_external", (q) => q.eq("externalKey", key)).first();
      const down = held ? null : await ctx.db.query("newsTakenDown").withIndex("by_external", (q) => q.eq("externalKey", key)).first();
      if (held || down) known.push(key);
    }
    return known;
  },
});

/** One collected item, live in News at once; nothing when it was collected meanwhile or taken down. */
export const saveCollectedItem = internalMutation({
  args: {
    sourceId: v.id("newsSources"),
    kind: v.union(v.literal("WEBSITE"), v.literal("YOUTUBE"), v.literal("X")),
    sourceName: v.string(),
    titleEn: v.string(),
    summaryEn: v.string(),
    meaningEn: v.string(),
    url: v.string(),
    publishedAt: v.number(),
    externalKey: v.string(),
  },
  returns: v.union(v.id("newsItems"), v.null()),
  handler: async (ctx, args) => {
    const held = await ctx.db.query("newsItems").withIndex("by_external", (q) => q.eq("externalKey", args.externalKey)).first();
    const down = await ctx.db.query("newsTakenDown").withIndex("by_external", (q) => q.eq("externalKey", args.externalKey)).first();
    if (held || down) return null;
    const itemId = await ctx.db.insert("newsItems", { ...args, createdAt: Date.now() });
    await requestTranslation(ctx, "newsItems", itemId);
    return itemId;
  },
});

/** When a source was read, and when it last brought something new: Admin's list says both. */
export const markSourceRead = internalMutation({
  args: { sourceId: v.id("newsSources"), foundNew: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return null;
    const now = Date.now();
    await ctx.db.patch(args.sourceId, { lastCheckedAt: now, ...(args.foundNew ? { lastItemAt: now } : {}), updatedAt: now });
    return null;
  },
});
