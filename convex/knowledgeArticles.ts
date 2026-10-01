import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { knowledgeStatusValidator, type KnowledgeStatus } from "./knowledgeArticlesSchema";
import { removeArticleFromWiki, syncArticleToWiki } from "./knowledgeArticleWiki";

/**
 * Knowledge articles (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1):
 * articles every signed-in user reads from the main menu, whatever their
 * company or role (A14), and the super admin writes in Admin → Content.
 *
 * Nothing here is a company's: an article is general knowledge, so readers
 * enter through `tenantQuery` for the signed-in check alone and every write is
 * the super admin's. Every write brings Ask Hakken's copy in line
 * (`knowledgeArticleWiki.ts`, phase 2): published, it is on the shared brain;
 * otherwise it is not.
 */

/** Articles read in one go. Knowledge is a handful of pages, not a library. */
export const MAX_ARTICLES = 200;
/** Longest title, in characters. A title is a question or a line, never a paragraph. */
export const MAX_TITLE_LENGTH = 160;
/** Longest body, in characters: room for a long article, with a ceiling on a pasted book. */
export const MAX_BODY_LENGTH = 40_000;

const summaryValidator = v.object({
  _id: v.id("knowledgeArticles"),
  titleEn: v.string(),
  titleIt: v.string(),
  publishedAt: v.number(),
  updatedAt: v.number(),
});

const articleValidator = v.object({
  _id: v.id("knowledgeArticles"),
  titleEn: v.string(),
  bodyEn: v.string(),
  titleIt: v.string(),
  bodyIt: v.string(),
  publishedAt: v.number(),
  updatedAt: v.number(),
});

const adminRowValidator = v.object({
  _id: v.id("knowledgeArticles"),
  key: v.union(v.string(), v.null()),
  titleEn: v.string(),
  bodyEn: v.string(),
  titleIt: v.string(),
  bodyIt: v.string(),
  status: knowledgeStatusValidator,
  publishedAt: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

const articleInput = {
  titleEn: v.string(),
  bodyEn: v.string(),
  titleIt: v.string(),
  bodyIt: v.string(),
  status: knowledgeStatusValidator,
};

type ArticleInput = { titleEn: string; bodyEn: string; titleIt: string; bodyIt: string; status: KnowledgeStatus };

/** Every published article, newest first: the Knowledge list. */
export const listPublishedArticles = tenantQuery({
  args: {},
  returns: v.array(summaryValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("knowledgeArticles")
      .withIndex("by_status_published", (q) => q.eq("status", "PUBLISHED"))
      .order("desc")
      .take(MAX_ARTICLES);
    return rows.map((row) => ({
      _id: row._id,
      titleEn: row.titleEn,
      titleIt: row.titleIt,
      publishedAt: row.publishedAt ?? row.updatedAt,
      updatedAt: row.updatedAt,
    }));
  },
});

/** One published article; null for a draft, exactly as for one that never existed. */
export const getPublishedArticle = tenantQuery({
  args: { articleId: v.id("knowledgeArticles") },
  returns: v.union(v.null(), articleValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.articleId);
    if (!row || row.status !== "PUBLISHED") return null;
    return {
      _id: row._id,
      titleEn: row.titleEn,
      bodyEn: row.bodyEn,
      titleIt: row.titleIt,
      bodyIt: row.bodyIt,
      publishedAt: row.publishedAt ?? row.updatedAt,
      updatedAt: row.updatedAt,
    };
  },
});

/** Every article, drafts too, the most recently changed first: Admin → Content → Knowledge. */
export const listArticles = superAdminQuery({
  args: {},
  returns: v.array(adminRowValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("knowledgeArticles").take(MAX_ARTICLES);
    return rows
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((row) => ({
        _id: row._id,
        key: row.key ?? null,
        titleEn: row.titleEn,
        bodyEn: row.bodyEn,
        titleIt: row.titleIt,
        bodyIt: row.bodyIt,
        status: row.status,
        publishedAt: row.publishedAt ?? null,
        updatedAt: row.updatedAt,
      }));
  },
});

/**
 * The article as it will be stored: trimmed, within its lengths, and — to be
 * published — whole in both languages, since a reader sees only theirs (A7).
 */
export function checkedArticle(input: ArticleInput): ArticleInput {
  const article = {
    titleEn: input.titleEn.trim(),
    bodyEn: input.bodyEn.trim(),
    titleIt: input.titleIt.trim(),
    bodyIt: input.bodyIt.trim(),
    status: input.status,
  };
  if (!article.titleEn) throw appError("INVALID_INPUT", "An article needs an English title.");
  for (const title of [article.titleEn, article.titleIt]) {
    if (title.length > MAX_TITLE_LENGTH) throw appError("INVALID_INPUT", `A title is at most ${MAX_TITLE_LENGTH} characters.`);
  }
  for (const body of [article.bodyEn, article.bodyIt]) {
    if (body.length > MAX_BODY_LENGTH) throw appError("INVALID_INPUT", `An article is at most ${MAX_BODY_LENGTH.toLocaleString("en-GB")} characters.`);
  }
  if (article.status === "PUBLISHED" && (!article.bodyEn || !article.titleIt || !article.bodyIt)) {
    throw appError("INVALID_INPUT", "To publish, write the title and the article in both English and Italian.");
  }
  return article;
}

async function audit(ctx: MutationCtx & { userId: Id<"users"> }, actionType: string, articleId: Id<"knowledgeArticles">, metadata: Record<string, unknown>) {
  await ctx.db.insert("auditLogs", {
    actorId: ctx.userId,
    actionType,
    entityId: articleId,
    entityType: "knowledgeArticles",
    timestamp: Date.now(),
    metadata: JSON.stringify(metadata),
  });
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
    await audit(ctx, "CREATE_KNOWLEDGE_ARTICLE", articleId, { title: article.titleEn, status: article.status });
    const created = await ctx.db.get(articleId);
    if (created) await syncArticleToWiki(ctx, created, ctx.userId);
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
    await audit(ctx, "UPDATE_KNOWLEDGE_ARTICLE", articleId, { title: article.titleEn, status: article.status, was: existing.status });
    const updated = await ctx.db.get(articleId);
    if (updated) await syncArticleToWiki(ctx, updated, ctx.userId);
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
    await audit(ctx, "DELETE_KNOWLEDGE_ARTICLE", args.articleId, { title: existing.titleEn, status: existing.status });
    return null;
  },
});
