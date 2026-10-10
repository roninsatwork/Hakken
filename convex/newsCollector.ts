import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { requestTranslation } from "./contentTranslation";
import { followKindValidator } from "./newsSchema";

/**
 * The News Collector's reads and writes (docs/plans/active/knowledge-news-
 * and-digest-plan.md, phase 5); its job is `newsCollectorRun.ts`. What it
 * collects goes live in News at once (A4), in English, and the Translator is
 * asked for every other language as each item is saved. Since 2026-10-10 it
 * reads the channels of the people in "Who to follow" whose Collect tick is
 * on (content-people-knowledge-plan.md, C2), in place of a list of sources.
 */

/** Channels read in one run; more than this waits for the next. */
const CHANNELS_PER_RUN = 100;

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

/**
 * Every channel being collected, never read first and then the longest
 * unread, each with its person's name — what their items are filed under.
 */
export const listChannelsToRead = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("followChannels"),
    followId: v.id("newsFollows"),
    kind: followKindValidator,
    name: v.string(),
    address: v.string(),
    firstRead: v.boolean(),
    externalId: v.optional(v.string()),
    sinceId: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const due = await ctx.db.query("followChannels").withIndex("by_collect_checked", (q) => q.eq("collect", true)).take(CHANNELS_PER_RUN);
    const rows = [];
    for (const channel of due) {
      // LinkedIn can't be read, whatever its tick says.
      if (channel.kind === "LINKEDIN") continue;
      const follow = await ctx.db.get(channel.followId);
      if (!follow) continue;
      rows.push({
        _id: channel._id,
        followId: channel.followId,
        kind: channel.kind,
        name: follow.name,
        address: channel.address,
        firstRead: channel.lastCheckedAt === undefined,
        ...(channel.externalId ? { externalId: channel.externalId } : {}),
        ...(channel.sinceId ? { sinceId: channel.sinceId } : {}),
      });
    }
    return rows;
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

/**
 * One collected item, live in News at once; nothing when it was collected
 * meanwhile or taken down. An item from a person's channel is filed under them,
 * and their counts and the channel's follow.
 */
export const saveCollectedItem = internalMutation({
  args: {
    /** Absent for an X bookmark, which belongs to no one in "Who to follow". */
    followId: v.optional(v.id("newsFollows")),
    channelId: v.optional(v.id("followChannels")),
    kind: v.union(v.literal("WEBSITE"), v.literal("YOUTUBE"), v.literal("X")),
    sourceName: v.string(),
    titleEn: v.string(),
    summaryEn: v.string(),
    meaningEn: v.string(),
    url: v.string(),
    publishedAt: v.number(),
    externalKey: v.string(),
    linkUrl: v.optional(v.string()),
  },
  returns: v.union(v.id("newsItems"), v.null()),
  handler: async (ctx, args) => {
    const held = await ctx.db.query("newsItems").withIndex("by_external", (q) => q.eq("externalKey", args.externalKey)).first();
    const down = await ctx.db.query("newsTakenDown").withIndex("by_external", (q) => q.eq("externalKey", args.externalKey)).first();
    if (held || down) return null;
    const itemId = await ctx.db.insert("newsItems", { ...args, createdAt: Date.now() });
    await requestTranslation(ctx, "newsItems", itemId);
    const channel = args.channelId ? await ctx.db.get(args.channelId) : null;
    if (channel) await ctx.db.patch(channel._id, { found: channel.found + 1 });
    const follow = args.followId ? await ctx.db.get(args.followId) : null;
    if (follow) {
      await ctx.db.patch(follow._id, {
        collected: (follow.collected ?? 0) + 1,
        newestAt: Math.max(follow.newestAt ?? 0, args.publishedAt),
      });
    }
    return itemId;
  },
});

/**
 * When a channel was read, and when it last brought something new: the
 * person's page says both. A read that failed keeps why, in plain words, until
 * one works.
 */
export const markChannelRead = internalMutation({
  args: { channelId: v.id("followChannels"), foundNew: v.boolean(), problem: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!channel) return null;
    const now = Date.now();
    await ctx.db.patch(args.channelId, {
      lastCheckedAt: now,
      ...(args.foundNew ? { lastItemAt: now } : {}),
      problem: args.problem,
      updatedAt: now,
    });
    return null;
  },
});
