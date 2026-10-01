import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedText, checkedUrl } from "./utils/contentAdmin";
import { followKindValidator } from "./newsSchema";
import { readerFields, removeTranslations, requestTranslation, sourceFields, translationProgress, translationProgressValidator } from "./contentTranslation";

/**
 * "Who to follow" (docs/plans/active/knowledge-news-and-digest-plan.md, phase
 * 3): people and channels Anthony recommends, with why — written in English,
 * translated by the Translator — shown on the News page and written in Admin
 * → Content. A written list: nothing reads these.
 */

/** "Who to follow" is a short written list, read whole. */
export const MAX_FOLLOWS = 100;
const MAX_NAME = 120;
const MAX_WHY = 400;

const readerValidator = v.object({
  _id: v.id("newsFollows"),
  kind: followKindValidator,
  name: v.string(),
  url: v.string(),
  why: v.string(),
});

const adminValidator = v.object({
  _id: v.id("newsFollows"),
  kind: followKindValidator,
  name: v.string(),
  url: v.string(),
  whyEn: v.string(),
  translations: translationProgressValidator,
});

const followInput = { kind: followKindValidator, name: v.string(), url: v.string(), whyEn: v.string() };

function checkedFollow(input: { name: string; url: string; whyEn: string }) {
  return {
    name: checkedText(input.name, "A name", MAX_NAME),
    url: checkedUrl(input.url, "The link"),
    whyEn: checkedText(input.whyEn, "Why", MAX_WHY),
  };
}

async function adminRow(ctx: QueryCtx, row: Doc<"newsFollows">) {
  return {
    _id: row._id,
    kind: row.kind,
    name: row.name,
    url: row.url,
    whyEn: row.whyEn,
    translations: await translationProgress(ctx, "newsFollows", row._id, sourceFields("newsFollows", row)),
  };
}

/** The list, in the order it was written, in the reader's language: the News page. */
export const listFollows = tenantQuery({
  args: { language: v.string() },
  returns: v.array(readerValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("newsFollows").withIndex("by_order").take(MAX_FOLLOWS);
    return await Promise.all(rows.map(async (row) => ({
      _id: row._id,
      kind: row.kind,
      name: row.name,
      url: row.url,
      why: (await readerFields(ctx, "newsFollows", row._id, { why: row.whyEn }, args.language)).why,
    })));
  },
});

/** The same list for Admin, in English, with how far its translations have got. */
export const listFollowsForAdmin = superAdminQuery({
  args: {},
  returns: v.array(adminValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("newsFollows").withIndex("by_order").take(MAX_FOLLOWS);
    return await Promise.all(rows.map((row) => adminRow(ctx, row)));
  },
});

/** One entry for its editing page; null when it has gone. */
export const getFollow = superAdminQuery({
  args: { followId: v.id("newsFollows") },
  returns: v.union(v.null(), adminValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.followId);
    return row ? await adminRow(ctx, row) : null;
  },
});

export const createFollow = superAdminMutation({
  args: followInput,
  returns: v.id("newsFollows"),
  handler: async (ctx, args) => {
    const now = Date.now();
    // New entries go last.
    const followId = await ctx.db.insert("newsFollows", { kind: args.kind, ...checkedFollow(args), order: now, createdAt: now, updatedAt: now });
    await requestTranslation(ctx, "newsFollows", followId);
    await auditContentChange(ctx, "CREATE_NEWS_FOLLOW", "newsFollows", followId, { name: args.name });
    return followId;
  },
});

export const updateFollow = superAdminMutation({
  args: { followId: v.id("newsFollows"), ...followInput },
  returns: v.null(),
  handler: async (ctx, { followId, ...input }) => {
    const existing = await ctx.db.get(followId);
    if (!existing) throw appError("NOT_FOUND", "That entry is no longer here.");
    await ctx.db.patch(followId, { kind: input.kind, ...checkedFollow(input), updatedAt: Date.now() });
    await requestTranslation(ctx, "newsFollows", followId);
    await auditContentChange(ctx, "UPDATE_NEWS_FOLLOW", "newsFollows", followId, { name: input.name });
    return null;
  },
});

export const deleteFollow = superAdminMutation({
  args: { followId: v.id("newsFollows") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.followId);
    if (!existing) return null;
    await ctx.db.delete(args.followId);
    await removeTranslations(ctx, "newsFollows", args.followId);
    await auditContentChange(ctx, "DELETE_NEWS_FOLLOW", "newsFollows", args.followId, { name: existing.name });
    return null;
  },
});
