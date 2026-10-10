import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { superAdminMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange } from "./utils/contentAdmin";
import { articleAtAddress, checkedLibraryArticle, removeArticle, storeArticle } from "./libraryArticles";
import { fetchPage } from "./webScrapeActions";
import { LIBRARY_MAX_MEANING_LENGTH, LIBRARY_MAX_SUMMARY_LENGTH, LIBRARY_MIN_WORDS, libraryPageFrom } from "./utils/libraryPage";
import { validateSafeUrl } from "./utils/security";

/**
 * A News story ticked into Knowledge (docs/plans/active/content-people-
 * knowledge-plan.md, C4, boards 2 and 4): Hakken reads the whole article once
 * — one paid page through Firecrawl — and keeps it in Knowledge as Helpful
 * content keeps an article added from a link, so Ask Hakken advises from every
 * word and clients read the story's summary in Insights. An X post keeps the
 * article it points to; a video, or a post that points nowhere, has no article
 * to keep and says so (Q5, summary only until answered). Unticking takes the
 * kept copy out again. Nothing here decides by itself: a person ticks.
 */

/** Why a page could not be kept, in words the tick shows. */
const PROBLEMS: Record<string, string> = {
  bad_address: "The article's address can't be read.",
  not_configured: "Reading pages isn't set up yet (FIRECRAWL_API_KEY).",
  refused: "The site refused to let the page be read.",
  no_text: "The page had no words to keep.",
  timeout: "The page took too long to read.",
  failed: "The page could not be read.",
};

/** The article a story keeps: its own page, or the one an X post points to; null with why when there is none. */
function articleAddressOf(item: Doc<"newsItems">): { address: string } | { problem: string } {
  if (item.kind === "YOUTUBE") return { problem: "A video has no article to keep: News keeps its summary." };
  if (item.kind === "X") return item.linkUrl ? { address: item.linkUrl } : { problem: "This post points to no article, so there is nothing to keep." };
  return { address: item.url };
}

async function countInKnowledge(ctx: MutationCtx, item: Doc<"newsItems">, change: 1 | -1) {
  const follow = item.followId ? await ctx.db.get(item.followId) : null;
  if (follow) await ctx.db.patch(follow._id, { inKnowledge: Math.max(0, (follow.inKnowledge ?? 0) + change) });
}

async function keep(ctx: MutationCtx, item: Doc<"newsItems">) {
  if (item.knowledgeArticleId || item.keeping === "READING") return;
  const target = articleAddressOf(item);
  if ("problem" in target) {
    await ctx.db.patch(item._id, { keeping: "FAILED", keepProblem: target.problem });
    return;
  }
  // An article already in Knowledge at this address is joined, never copied twice (L2).
  const existing = await articleAtAddress(ctx, target.address);
  if (existing) {
    await ctx.db.patch(item._id, { knowledgeArticleId: existing._id, keeping: undefined, keepProblem: undefined });
    await countInKnowledge(ctx, item, 1);
    return;
  }
  await ctx.db.patch(item._id, { keeping: "READING", keepProblem: undefined });
  await ctx.scheduler.runAfter(0, internal.newsKnowledge.keepWholeInternal, { itemId: item._id });
}

async function release(ctx: MutationCtx, item: Doc<"newsItems">) {
  if (item.knowledgeArticleId) {
    const article = await ctx.db.get(item.knowledgeArticleId);
    // Only the copy this story kept goes; an article added on its own stays.
    if (article?.newsItemId === item._id) await removeArticle(ctx, article._id);
    await countInKnowledge(ctx, item, -1);
  }
  await ctx.db.patch(item._id, { knowledgeArticleId: undefined, keeping: undefined, keepProblem: undefined });
}

/**
 * A story taken down from News: its kept article stays in Knowledge, where it
 * is deleted on its own, and no longer counts as the story's or its person's.
 */
export async function forgetTakenDownStory(ctx: MutationCtx, item: Doc<"newsItems">) {
  if (!item.knowledgeArticleId) return;
  const article = await ctx.db.get(item.knowledgeArticleId);
  if (article?.newsItemId === item._id) await ctx.db.patch(article._id, { newsItemId: undefined });
  await countInKnowledge(ctx, item, -1);
}

/** The In knowledge tick on News and on a person's page. */
export const setNewsItemInKnowledge = superAdminMutation({
  args: { itemId: v.id("newsItems"), keep: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw appError("NOT_FOUND", "That story is no longer in News.");
    if (args.keep) await keep(ctx, item);
    else await release(ctx, item);
    await auditContentChange(ctx, args.keep ? "KEEP_NEWS_ITEM" : "RELEASE_NEWS_ITEM", "newsItems", item._id, { title: item.titleEn });
    return null;
  },
});

/** What the reader needs: the address to read, while the story is still waiting to be kept. */
export const keepTargetInternal = internalQuery({
  args: { itemId: v.id("newsItems") },
  returns: v.union(v.null(), v.object({ address: v.string() })),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.keeping !== "READING") return null;
    const target = articleAddressOf(item);
    return "address" in target ? { address: target.address } : null;
  },
});

const readValidator = v.object({
  url: v.string(),
  title: v.string(),
  publication: v.string(),
  author: v.optional(v.string()),
  publishedOn: v.optional(v.string()),
  updatedOn: v.optional(v.string()),
  description: v.optional(v.string()),
  language: v.optional(v.string()),
  body: v.string(),
});

/** Reads the story's article once and keeps it, or says why it could not. */
export const keepWholeInternal = internalAction({
  args: { itemId: v.id("newsItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.newsKnowledge.keepTargetInternal, { itemId: args.itemId });
    if (!target) return null;
    try {
      validateSafeUrl(target.address, "Knowledge");
    } catch {
      await ctx.runMutation(internal.newsKnowledge.keepFailedInternal, { itemId: args.itemId, problem: PROBLEMS.bad_address });
      return null;
    }
    const page = await fetchPage({ url: target.address, mainContentOnly: true, withStructuredData: true });
    if (page.status === "error") {
      await ctx.runMutation(internal.newsKnowledge.keepFailedInternal, { itemId: args.itemId, problem: PROBLEMS[page.reason] ?? PROBLEMS.failed });
      return null;
    }
    const read = libraryPageFrom(page.markdown, page.metadata, target.address, page.structuredData);
    if (read.words < LIBRARY_MIN_WORDS) {
      await ctx.runMutation(internal.newsKnowledge.keepFailedInternal, {
        itemId: args.itemId, problem: `The page had only ${read.words} words: too few to be the article.`,
      });
      return null;
    }
    await ctx.runMutation(internal.newsKnowledge.saveKeptInternal, {
      itemId: args.itemId,
      read: {
        url: target.address,
        title: read.title,
        publication: read.publication,
        ...(read.author ? { author: read.author } : {}),
        ...(read.publishedOn ? { publishedOn: read.publishedOn } : {}),
        ...(read.updatedOn ? { updatedOn: read.updatedOn } : {}),
        ...(read.description ? { description: read.description } : {}),
        ...(read.language ? { language: read.language } : {}),
        body: read.body,
      },
    });
    return null;
  },
});

export const keepFailedInternal = internalMutation({
  args: { itemId: v.id("newsItems"), problem: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    // Unticked meanwhile: nothing to say.
    if (!item || item.keeping !== "READING") return null;
    await ctx.db.patch(args.itemId, { keeping: "FAILED", keepProblem: args.problem });
    return null;
  },
});

/** The read article kept in Knowledge, with the story's summary for clients, filed under the story and its person. */
export const saveKeptInternal = internalMutation({
  args: { itemId: v.id("newsItems"), read: readValidator },
  returns: v.null(),
  handler: async (ctx, { itemId, read }) => {
    const item = await ctx.db.get(itemId);
    if (!item || item.keeping !== "READING") return null;
    const existing = await articleAtAddress(ctx, read.url);
    if (existing) {
      await ctx.db.patch(itemId, { knowledgeArticleId: existing._id, keeping: undefined, keepProblem: undefined });
      await countInKnowledge(ctx, item, 1);
      return null;
    }
    const follow = item.followId ? await ctx.db.get(item.followId) : null;
    const { article, body } = checkedLibraryArticle({
      url: read.url,
      title: (read.title || item.titleEn).slice(0, 300),
      publication: (read.publication || item.sourceName).slice(0, 160),
      author: (read.author ?? (follow ? follow.name : "")).slice(0, 160),
      publishedOn: read.publishedOn ?? new Date(item.publishedAt).toISOString().slice(0, 10),
      updatedOn: read.updatedOn ?? "",
      description: (read.description ?? "").slice(0, 600),
      topic: follow?.topic,
      status: "IN_KNOWLEDGE",
      language: read.language,
      body: read.body,
      readAt: Date.now(),
      // What clients read in Insights: the story's own summary, which the admin can change on the article's page.
      summaryEn: item.summaryEn.slice(0, LIBRARY_MAX_SUMMARY_LENGTH),
      meaningEn: item.meaningEn.slice(0, LIBRARY_MAX_MEANING_LENGTH),
    });
    const articleId = await storeArticle(ctx, article, body, { newsItemId: itemId, ...(item.followId ? { followId: item.followId } : {}) });
    await ctx.db.patch(itemId, { knowledgeArticleId: articleId, keeping: undefined, keepProblem: undefined });
    await countInKnowledge(ctx, item, 1);
    return null;
  },
});

/** A story's place in Knowledge, as News and a person's page show it beside the tick. */
export const knowledgeStateValidator = v.object({
  /** IN: kept whole; READING: being read; FAILED: could not be kept; null: not ticked. */
  state: v.union(v.literal("IN"), v.literal("READING"), v.literal("FAILED"), v.null()),
  /** How many words are kept, when it is in. */
  words: v.union(v.number(), v.null()),
  /** Why it could not be kept, when it could not. */
  problem: v.union(v.string(), v.null()),
});

export async function knowledgeStateOf(ctx: QueryCtx, item: Doc<"newsItems">) {
  if (item.knowledgeArticleId) {
    const article = await ctx.db.get(item.knowledgeArticleId);
    return { state: "IN" as const, words: article?.words ?? null, problem: null };
  }
  if (item.keeping === "READING") return { state: "READING" as const, words: null, problem: null };
  if (item.keeping === "FAILED") return { state: "FAILED" as const, words: null, problem: item.keepProblem ?? null };
  return { state: null, words: null, problem: null };
}
