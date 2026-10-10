import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedDay, dayStart } from "./utils/contentAdmin";
import { knowledgeStatusValidator, type KnowledgeStatus } from "./knowledgeArticlesSchema";
import { checkedTopicKey } from "./topics";
import { refreshInsightsCounts } from "./insightsCounts";
import { liveLeadUntil } from "./leadStory";
import { removeArticleFromWiki, syncArticleToWiki } from "./knowledgeArticleWiki";
import { readerFields, removeTranslations, requestTranslation, sourceFields, translationProgress, translationProgressValidator } from "./contentTranslation";
import { syncOursInList } from "./knowledgeList";

/**
 * Knowledge articles (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1):
 * articles every signed-in user reads from the main menu, whatever their
 * company or role (A14), and the super admin writes in Admin → Content.
 *
 * Nothing here is a company's: an article is general knowledge, so readers
 * enter through `tenantQuery` for the signed-in check alone and every write is
 * the super admin's. An article is written in English; the Translator writes
 * the other languages once it is published, and a reader sees theirs as soon
 * as it is ready (`contentTranslation.ts`, revised 2026-10-01). Every write
 * also brings Ask Hakken's copy in line (`knowledgeArticleWiki.ts`, phase 2).
 */

/** The most articles of one week the News front page sets among its stories. */
const WEEK_ARTICLES = 20;
/** Longest title, in characters. A title is a question or a line, never a paragraph. */
export const MAX_TITLE_LENGTH = 160;
/** Longest body, in characters: room for a long article, with a ceiling on a pasted book. */
export const MAX_BODY_LENGTH = 40_000;

/** The key of a topic in the shared list (`topics.ts`, IH20), or none. */
const topicOrNull = v.union(v.string(), v.null());

export const summaryValidator = v.object({
  _id: v.id("knowledgeArticles"),
  title: v.string(),
  /** Its opening, as plain words: what News shows under a new article's title (R5). */
  excerpt: v.string(),
  /** Its length in the reader's language, for "about 2 minutes to read" (IH12). */
  words: v.number(),
  topic: topicOrNull,
  publishedAt: v.number(),
  updatedAt: v.number(),
});

const articleValidator = v.object({
  _id: v.id("knowledgeArticles"),
  title: v.string(),
  body: v.string(),
  words: v.number(),
  topic: topicOrNull,
  publishedAt: v.number(),
  updatedAt: v.number(),
});

const adminRowValidator = v.object({
  _id: v.id("knowledgeArticles"),
  key: v.union(v.string(), v.null()),
  titleEn: v.string(),
  bodyEn: v.string(),
  status: knowledgeStatusValidator,
  topic: topicOrNull,
  publishedAt: v.union(v.number(), v.null()),
  /** Until when it leads the News front page (IH11); null when it does not, or no longer. */
  leadUntil: v.union(v.number(), v.null()),
  updatedAt: v.number(),
  /** The other languages done from the English as it stands; none to do for a draft. */
  translations: translationProgressValidator,
});

/** `topic` left out is no topic (R9): Learn lists the article under All articles alone. */
const articleInput = { titleEn: v.string(), bodyEn: v.string(), status: knowledgeStatusValidator, topic: v.optional(v.string()) };

type ArticleInput = { titleEn: string; bodyEn: string; status: KnowledgeStatus; topic?: string };

/** The longest opening shown under an article's title, in characters. */
const EXCERPT_LENGTH = 220;

/**
 * An article's first paragraph as plain words — no heading, table or list,
 * links and bold reduced to their words — cut at a word near `EXCERPT_LENGTH`.
 */
export function excerptOf(body: string): string {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(#|\||-|\*\s|\d+\.)/.test(block)) ?? "";
  const words = paragraph
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (words.length <= EXCERPT_LENGTH) return words;
  const cut = words.slice(0, EXCERPT_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).replace(/[,;:.]$/, "")}…`;
}

/** An article in the reader's language: theirs when the Translator has it, the English until then. */
async function inLanguage(ctx: QueryCtx, row: Doc<"knowledgeArticles">, language: string) {
  const english = sourceFields("knowledgeArticles", row) ?? { title: row.titleEn, body: row.bodyEn };
  return await readerFields(ctx, "knowledgeArticles", row._id, english, language);
}

/** How many words an article runs to, as written. */
const wordsIn = (body: string) => body.split(/\s+/).filter(Boolean).length;

/** A published article as a reader's list shows it, in their language. */
export async function summaryRow(ctx: QueryCtx, row: Doc<"knowledgeArticles">, language: string) {
  const { title, body } = await inLanguage(ctx, row, language);
  return {
    _id: row._id,
    title,
    excerpt: excerptOf(body),
    words: wordsIn(body),
    topic: row.topic ?? null,
    publishedAt: row.publishedAt ?? row.updatedAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Published articles, newest first, a page at a time — all, or one topic's
 * through its index (insights-helpful-content-plan.md, IH12, IH21): Knowledge
 * in Insights, and "Keep reading" under an article.
 */
export const listPublishedPage = tenantQuery({
  args: { language: v.string(), topic: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(summaryValidator),
  handler: async (ctx, args) => {
    const topic = args.topic;
    const page = topic
      ? await ctx.db
        .query("knowledgeArticles")
        .withIndex("by_status_topic_published", (q) => q.eq("status", "PUBLISHED").eq("topic", topic))
        .order("desc")
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("knowledgeArticles")
        .withIndex("by_status_published", (q) => q.eq("status", "PUBLISHED"))
        .order("desc")
        .paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((row) => summaryRow(ctx, row, args.language))) };
  },
});

/** Articles published since `since`, newest first: those that take their place among the News front page's stories (R5). */
export const listPublishedSince = tenantQuery({
  args: { language: v.string(), since: v.number() },
  returns: v.array(summaryValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("knowledgeArticles")
      .withIndex("by_status_published", (q) => q.eq("status", "PUBLISHED").gte("publishedAt", args.since))
      .order("desc")
      .take(WEEK_ARTICLES);
    return await Promise.all(rows.map((row) => summaryRow(ctx, row, args.language)));
  },
});

/**
 * The article pinned to lead the News front page, if it is a Knowledge
 * article: it leads Knowledge's own page too (IH11). A pin counts for the
 * whole of the day it runs out on, as the front page's does.
 */
export const getPinnedForReaders = tenantQuery({
  args: { language: v.string(), today: v.string() },
  returns: v.union(v.null(), summaryValidator),
  handler: async (ctx, args) => {
    const pinned = await ctx.db
      .query("knowledgeArticles")
      .withIndex("by_lead_until", (q) => q.gt("leadUntil", dayStart(checkedDay(args.today, "Today"))))
      .order("desc")
      .first();
    return pinned?.status === "PUBLISHED" ? await summaryRow(ctx, pinned, args.language) : null;
  },
});

/** Articles listed under the one being read, in "Keep reading". */
const MORE_ARTICLES = 4;

/**
 * Others to read after an article (IH12): the newest published of its topic,
 * or the newest of all when it has none — never the one being read — through
 * the published indexes, a handful read. Helpful content's join them on the page.
 */
export const listMoreForReaders = tenantQuery({
  args: { language: v.string(), topic: v.optional(v.string()), exclude: v.optional(v.id("knowledgeArticles")) },
  returns: v.array(summaryValidator),
  handler: async (ctx, args) => {
    const topic = args.topic;
    const rows = topic
      ? await ctx.db.query("knowledgeArticles").withIndex("by_status_topic_published", (q) => q.eq("status", "PUBLISHED").eq("topic", topic)).order("desc").take(MORE_ARTICLES + 1)
      : await ctx.db.query("knowledgeArticles").withIndex("by_status_published", (q) => q.eq("status", "PUBLISHED")).order("desc").take(MORE_ARTICLES + 1);
    const others = rows.filter((row) => row._id !== args.exclude).slice(0, MORE_ARTICLES);
    return await Promise.all(others.map((row) => summaryRow(ctx, row, args.language)));
  },
});

/** One published article in the reader's language; null for a draft, exactly as for one that never existed. */
export const getPublishedArticle = tenantQuery({
  args: { articleId: v.id("knowledgeArticles"), language: v.string() },
  returns: v.union(v.null(), articleValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.articleId);
    if (!row || row.status !== "PUBLISHED") return null;
    const { title, body } = await inLanguage(ctx, row, args.language);
    return { _id: row._id, title, body, words: wordsIn(body), topic: row.topic ?? null, publishedAt: row.publishedAt ?? row.updatedAt, updatedAt: row.updatedAt };
  },
});

async function adminRow(ctx: QueryCtx, row: Doc<"knowledgeArticles">) {
  return {
    _id: row._id,
    key: row.key ?? null,
    titleEn: row.titleEn,
    bodyEn: row.bodyEn,
    status: row.status,
    topic: row.topic ?? null,
    publishedAt: row.publishedAt ?? null,
    leadUntil: liveLeadUntil(row.leadUntil),
    updatedAt: row.updatedAt,
    translations: await translationProgress(ctx, "knowledgeArticles", row._id, sourceFields("knowledgeArticles", row)),
  };
}

/**
 * Every article, drafts too, a page at a time: the most recently changed
 * first, or by a search of their titles — Admin → Content → Knowledge,
 * searched and paged on the server (insights-helpful-content-plan.md, IH21).
 */
export const listArticlesPage = superAdminQuery({
  args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(adminRowValidator),
  handler: async (ctx, args) => {
    const search = args.search?.trim();
    const page = search
      ? await ctx.db.query("knowledgeArticles").withSearchIndex("search_title", (q) => q.search("titleEn", search)).paginate(args.paginationOpts)
      : await ctx.db.query("knowledgeArticles").withIndex("by_updated").order("desc").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((row) => adminRow(ctx, row))) };
  },
});

/** One article for its editing page; null when it has gone. */
export const getArticle = superAdminQuery({
  args: { articleId: v.id("knowledgeArticles") },
  returns: v.union(v.null(), adminRowValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.articleId);
    return row ? await adminRow(ctx, row) : null;
  },
});

/** The article as it will be stored: trimmed, within its lengths, and — to be published — with something to read. */
export function checkedArticle(input: ArticleInput): ArticleInput {
  const article = { titleEn: input.titleEn.trim(), bodyEn: input.bodyEn.trim(), status: input.status, topic: input.topic };
  if (!article.titleEn) throw appError("INVALID_INPUT", "An article needs a title.");
  if (article.titleEn.length > MAX_TITLE_LENGTH) throw appError("INVALID_INPUT", `A title is at most ${MAX_TITLE_LENGTH} characters.`);
  if (article.bodyEn.length > MAX_BODY_LENGTH) throw appError("INVALID_INPUT", `An article is at most ${MAX_BODY_LENGTH.toLocaleString("en-GB")} characters.`);
  if (article.status === "PUBLISHED" && !article.bodyEn) throw appError("INVALID_INPUT", "To publish, write the article.");
  return article;
}

/** When an article counts as published from: kept through edits, set on first publishing, gone on a draft. */
function publishedAtFor(status: KnowledgeStatus, existing: Doc<"knowledgeArticles"> | null, now: number): number | undefined {
  if (status !== "PUBLISHED") return undefined;
  return existing?.status === "PUBLISHED" ? existing.publishedAt ?? now : now;
}

export const createArticle = superAdminMutation({
  args: articleInput,
  returns: v.id("knowledgeArticles"),
  handler: async (ctx, args) => {
    const article = { ...checkedArticle(args), topic: await checkedTopicKey(ctx, args.topic) };
    const now = Date.now();
    const articleId = await ctx.db.insert("knowledgeArticles", {
      ...article,
      publishedAt: publishedAtFor(article.status, null, now),
      updatedAt: now,
    });
    await auditContentChange(ctx, "CREATE_KNOWLEDGE_ARTICLE", "knowledgeArticles", articleId, { title: article.titleEn, status: article.status });
    const created = await ctx.db.get(articleId);
    if (created) await syncArticleToWiki(ctx, created, ctx.userId);
    if (article.status === "PUBLISHED") await requestTranslation(ctx, "knowledgeArticles", articleId);
    await refreshInsightsCounts(ctx);
    await syncOursInList(ctx, articleId);
    return articleId;
  },
});

export const updateArticle = superAdminMutation({
  args: { articleId: v.id("knowledgeArticles"), ...articleInput },
  returns: v.null(),
  handler: async (ctx, { articleId, ...input }) => {
    const existing = await ctx.db.get(articleId);
    if (!existing) throw appError("NOT_FOUND", "That article is no longer here.");
    const article = { ...checkedArticle(input), topic: await checkedTopicKey(ctx, input.topic) };
    const now = Date.now();
    await ctx.db.patch(articleId, {
      ...article,
      publishedAt: publishedAtFor(article.status, existing, now),
      // A draft cannot lead the front page (IH11).
      ...(article.status === "PUBLISHED" ? {} : { leadUntil: undefined }),
      updatedAt: now,
    });
    await auditContentChange(ctx, "UPDATE_KNOWLEDGE_ARTICLE", "knowledgeArticles", articleId, { title: article.titleEn, status: article.status, was: existing.status });
    const updated = await ctx.db.get(articleId);
    if (updated) await syncArticleToWiki(ctx, updated, ctx.userId);
    if (article.status === "PUBLISHED") await requestTranslation(ctx, "knowledgeArticles", articleId);
    await refreshInsightsCounts(ctx);
    await syncOursInList(ctx, articleId);
    return null;
  },
});

export const deleteArticle = superAdminMutation({
  args: { articleId: v.id("knowledgeArticles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.articleId);
    if (!existing) return null;
    await ctx.db.delete(args.articleId);
    await removeArticleFromWiki(ctx, args.articleId);
    await removeTranslations(ctx, "knowledgeArticles", args.articleId);
    await auditContentChange(ctx, "DELETE_KNOWLEDGE_ARTICLE", "knowledgeArticles", args.articleId, { title: existing.titleEn, status: existing.status });
    await refreshInsightsCounts(ctx);
    await syncOursInList(ctx, args.articleId);
    return null;
  },
});
