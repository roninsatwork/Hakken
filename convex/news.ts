import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange } from "./utils/contentAdmin";
import { newsItemKindValidator } from "./newsSchema";
import { readerFields, removeTranslations } from "./contentTranslation";
import { updateInLanguage } from "./googleUpdates";

/**
 * The News feed (docs/plans/active/knowledge-news-and-digest-plan.md, phase
 * 3): every signed-in user's, newest first, filtered by kind — Google updates,
 * X, YouTube, websites. Items arrive from the News Collector (phase 5) and
 * from the Google updates entered in Admin (`googleUpdates.ts`), and go live
 * at once (A4); Admin → Content → News is where one is taken down. Each is
 * written in English and read in the reader's language once the Translator
 * has it — a Google update's item through the update's own translation.
 */

const itemValidator = v.object({
  _id: v.id("newsItems"),
  kind: newsItemKindValidator,
  sourceName: v.string(),
  title: v.string(),
  summary: v.string(),
  /** "What this means for you"; empty for a Google update. */
  meaning: v.string(),
  url: v.string(),
  publishedAt: v.number(),
});

const adminItemValidator = v.object({
  _id: v.id("newsItems"),
  kind: newsItemKindValidator,
  sourceName: v.string(),
  titleEn: v.string(),
  url: v.string(),
  publishedAt: v.number(),
  createdAt: v.number(),
  /** A Google update's own item: taken down with the update, not here. */
  isGoogleUpdate: v.boolean(),
});

/** An item in the reader's language: on the News page, and in the Weekly News Digest (`outboxTemplates.ts`). */
export async function readerItem(ctx: QueryCtx, row: Doc<"newsItems">, language: string) {
  let words = { title: row.titleEn, summary: row.summaryEn, meaning: row.meaningEn };
  if (row.googleUpdateId) {
    const update = await ctx.db.get(row.googleUpdateId);
    if (update) {
      const { title, description } = await updateInLanguage(ctx, update, language);
      words = { title, summary: description, meaning: "" };
    }
  } else {
    const translated = await readerFields(ctx, "newsItems", row._id, words, language);
    words = { title: translated.title, summary: translated.summary, meaning: translated.meaning };
  }
  return { _id: row._id, kind: row.kind, sourceName: row.sourceName, ...words, url: row.url, publishedAt: row.publishedAt };
}

/** A page of the feed, newest first, of one kind or every kind, in the reader's language. */
export const listNewsItems = tenantQuery({
  args: { paginationOpts: paginationOptsValidator, kind: v.optional(newsItemKindValidator), language: v.string() },
  returns: paginationResultValidator(itemValidator),
  handler: async (ctx, args) => {
    const kind = args.kind;
    const query = kind
      ? ctx.db.query("newsItems").withIndex("by_kind_published", (q) => q.eq("kind", kind))
      : ctx.db.query("newsItems").withIndex("by_published");
    const page = await query.order("desc").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((row) => readerItem(ctx, row, args.language))) };
  },
});

/** Admin → Content → News: a page of every item, newest first, to take one down. */
export const listNewsItemsForAdmin = superAdminQuery({
  args: { paginationOpts: paginationOptsValidator, kind: v.optional(newsItemKindValidator) },
  returns: paginationResultValidator(adminItemValidator),
  handler: async (ctx, args) => {
    const kind = args.kind;
    const query = kind
      ? ctx.db.query("newsItems").withIndex("by_kind_published", (q) => q.eq("kind", kind))
      : ctx.db.query("newsItems").withIndex("by_published");
    const page = await query.order("desc").paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((row) => ({
        _id: row._id,
        kind: row.kind,
        sourceName: row.sourceName,
        titleEn: row.titleEn,
        url: row.url,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        isGoogleUpdate: row.googleUpdateId !== undefined,
      })),
    };
  },
});

/**
 * Takes an item down for good — the rare one that should not be there. Its
 * address stays known, so the collector does not bring it back. A Google
 * update's item goes with the update itself, in Google updates.
 */
export const deleteNewsItem = superAdminMutation({
  args: { itemId: v.id("newsItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return null;
    if (item.googleUpdateId) throw appError("INVALID_INPUT", "This is a Google update. Delete it in Google updates.");
    await ctx.db.insert("newsTakenDown", { externalKey: item.externalKey, takenDownAt: Date.now() });
    await ctx.db.delete(args.itemId);
    await removeTranslations(ctx, "newsItems", args.itemId);
    await auditContentChange(ctx, "DELETE_NEWS_ITEM", "newsItems", args.itemId, { title: item.titleEn, url: item.url });
    return null;
  },
});
