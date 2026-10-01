import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange } from "./utils/contentAdmin";
import { knowledgeStatusValidator, knowledgeTopicValidator, type KnowledgeStatus, type KnowledgeTopic } from "./knowledgeArticlesSchema";
import { removeArticleFromWiki, syncArticleToWiki } from "./knowledgeArticleWiki";
import { readerFields, removeTranslations, requestTranslation, sourceFields, translationProgress, translationProgressValidator } from "./contentTranslation";

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

/** Articles read in one go. Knowledge is a handful of pages, not a library. */
export const MAX_ARTICLES = 200;
/** Longest title, in characters. A title is a question or a line, never a paragraph. */
export const MAX_TITLE_LENGTH = 160;
/** Longest body, in characters: room for a long article, with a ceiling on a pasted book. */
export const MAX_BODY_LENGTH = 40_000;

const topicOrNull = v.union(knowledgeTopicValidator, v.null());

const summaryValidator = v.object({
  _id: v.id("knowledgeArticles"),
  title: v.string(),
  /** Its opening, as plain words: what News shows under a new article's title (R5). */
  excerpt: v.string(),
  topic: topicOrNull,
  publishedAt: v.number(),
  updatedAt: v.number(),
});

const articleValidator = v.object({
  _id: v.id("knowledgeArticles"),
  title: v.string(),
  body: v.string(),
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
  updatedAt: v.number(),
  /** The other languages done from the English as it stands; none to do for a draft. */
  translations: translationProgressValidator,
});

/** `topic` left out is no topic (R9): Learn lists the article under All articles alone. */
const articleInput = { titleEn: v.string(), bodyEn: v.string(), status: knowledgeStatusValidator, topic: v.optional(knowledgeTopicValidator) };

type ArticleInput = { titleEn: string; bodyEn: string; status: KnowledgeStatus; topic?: KnowledgeTopic };

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

/** Every published article, newest first, or those on one topic: the Knowledge list, in the reader's language. */
export const listPublishedArticles = tenantQuery({
  args: { language: v.string(), topic: v.optional(knowledgeTopicValidator) },
  returns: v.array(summaryValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("knowledgeArticles")
      .withIndex("by_status_published", (q) => q.eq("status", "PUBLISHED"))
      .order("desc")
      .take(MAX_ARTICLES);
    const shown = args.topic ? rows.filter((row) => row.topic === args.topic) : rows;
    return await Promise.all(shown.map(async (row) => {
      const { title, body } = await inLanguage(ctx, row, args.language);
      return {
        _id: row._id,
        title,
        excerpt: excerptOf(body),
        topic: row.topic ?? null,
        publishedAt: row.publishedAt ?? row.updatedAt,
        updatedAt: row.updatedAt,
      };
    }));
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
    return { _id: row._id, title, body, topic: row.topic ?? null, publishedAt: row.publishedAt ?? row.updatedAt, updatedAt: row.updatedAt };
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
    updatedAt: row.updatedAt,
    translations: await translationProgress(ctx, "knowledgeArticles", row._id, sourceFields("knowledgeArticles", row)),
  };
}

/** Every article, drafts too, the most recently changed first: Admin → Content → Knowledge. */
export const listArticles = superAdminQuery({
  args: {},
  returns: v.array(adminRowValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("knowledgeArticles").take(MAX_ARTICLES);
    rows.sort((left, right) => right.updatedAt - left.updatedAt);
    return await Promise.all(rows.map((row) => adminRow(ctx, row)));
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
    const article = checkedArticle(args);
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
    return articleId;
  },
});

export const updateArticle = superAdminMutation({
  args: { articleId: v.id("knowledgeArticles"), ...articleInput },
  returns: v.null(),
  handler: async (ctx, { articleId, ...input }) => {
    const existing = await ctx.db.get(articleId);
    if (!existing) throw appError("NOT_FOUND", "That article is no longer here.");
    const article = checkedArticle(input);
    const now = Date.now();
    await ctx.db.patch(articleId, {
      ...article,
      publishedAt: publishedAtFor(article.status, existing, now),
      updatedAt: now,
    });
    await auditContentChange(ctx, "UPDATE_KNOWLEDGE_ARTICLE", "knowledgeArticles", articleId, { title: article.titleEn, status: article.status, was: existing.status });
    const updated = await ctx.db.get(articleId);
    if (updated) await syncArticleToWiki(ctx, updated, ctx.userId);
    if (article.status === "PUBLISHED") await requestTranslation(ctx, "knowledgeArticles", articleId);
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
    return null;
  },
});
