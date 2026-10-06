import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedDay, checkedText, checkedUrl } from "./utils/contentAdmin";
import { knowledgeTopicValidator, type KnowledgeTopic } from "./knowledgeArticlesSchema";
import { libraryStatusValidator, type LibraryStatus } from "./libraryArticlesSchema";
import {
  countWords,
  LIBRARY_MAX_BODY_LENGTH,
  LIBRARY_MAX_DESCRIPTION_LENGTH,
  LIBRARY_MAX_NAME_LENGTH,
  LIBRARY_MAX_SECTIONS,
  LIBRARY_MAX_TITLE_LENGTH,
  librarySearchTerms,
  librarySections,
  libraryUrlKey,
  termsFound,
} from "./utils/libraryPage";

/**
 * Admin → Content → Library (docs/plans/active/content-library-plan.md):
 * articles from other websites, kept whole with their details. Only the super
 * admin reads or changes the list; every change is audited and brings Ask
 * Hakken's copy in line (L11) — sections cut at the article's headings, for an
 * article in its knowledge, and none for a draft. Readers never see an
 * article (L7); Ask Hakken reads the sections through `searchLibraryInternal`.
 */

/** The most articles read for the list, newest first. Rows carry no words; past this the list needs paging. */
export const MAX_LISTED_ARTICLES = 500;
/** Sections that reach one answer (L11). */
export const LIBRARY_SECTIONS_PER_ANSWER = 3;
/** Sections read from the search before the closest are kept. */
const SEARCHED_SECTIONS = 12;

const optionalText = v.union(v.string(), v.null());
const topicOrNull = v.union(knowledgeTopicValidator, v.null());

const rowFields = {
  _id: v.id("libraryArticles"),
  url: v.string(),
  title: v.string(),
  publication: v.string(),
  author: optionalText,
  publishedOn: optionalText,
  updatedOn: optionalText,
  description: optionalText,
  topic: topicOrNull,
  status: libraryStatusValidator,
  language: optionalText,
  words: v.number(),
  readAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
};
const rowValidator = v.object(rowFields);
const articleValidator = v.object({ ...rowFields, body: v.string() });

/** Blank text is "not given": what the form sends for a detail the page did not have. */
const articleInput = {
  url: v.string(),
  title: v.string(),
  publication: v.string(),
  author: v.string(),
  publishedOn: v.string(),
  updatedOn: v.string(),
  description: v.string(),
  topic: v.optional(knowledgeTopicValidator),
  status: libraryStatusValidator,
  language: v.optional(v.string()),
  body: v.string(),
  /** When Firecrawl read the words in the form; left out for words pasted by hand. */
  readAt: v.optional(v.number()),
};

export type LibraryArticleInput = {
  url: string;
  title: string;
  publication: string;
  author: string;
  publishedOn: string;
  updatedOn: string;
  description: string;
  topic?: KnowledgeTopic;
  status: LibraryStatus;
  language?: string;
  body: string;
  readAt?: number;
};

type StoredArticle = Omit<Doc<"libraryArticles">, "_id" | "_creationTime" | "createdAt" | "updatedAt">;

function row(article: Doc<"libraryArticles">) {
  return {
    _id: article._id,
    url: article.url,
    title: article.title,
    publication: article.publication,
    author: article.author ?? null,
    publishedOn: article.publishedOn ?? null,
    updatedOn: article.updatedOn ?? null,
    description: article.description ?? null,
    topic: article.topic ?? null,
    status: article.status,
    language: article.language ?? null,
    words: article.words,
    readAt: article.readAt ?? null,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  };
}

/** A day as typed, or not given. */
function optionalDay(value: string, what: string): string | undefined {
  return value.trim() ? checkedDay(value, what) : undefined;
}

/** The article as it will be stored: trimmed, within its limits, one address per article, and — for Ask Hakken — with words to read. */
export function checkedLibraryArticle(input: LibraryArticleInput): { article: StoredArticle; body: string } {
  const url = libraryUrlKey(checkedUrl(input.url, "The article's address"));
  const body = input.body.trim();
  if (body.length > LIBRARY_MAX_BODY_LENGTH) {
    throw appError("INVALID_INPUT", `An article is at most ${LIBRARY_MAX_BODY_LENGTH.toLocaleString("en-GB")} characters.`);
  }
  if (input.status === "IN_KNOWLEDGE" && !body) throw appError("INVALID_INPUT", "For the assistant to read it, the article needs its words.");
  const author = checkedText(input.author, "The author", LIBRARY_MAX_NAME_LENGTH, { optional: true });
  const description = checkedText(input.description, "The description", LIBRARY_MAX_DESCRIPTION_LENGTH, { optional: true });
  const language = input.language?.trim();
  return {
    article: {
      url,
      title: checkedText(input.title, "A title", LIBRARY_MAX_TITLE_LENGTH),
      publication: checkedText(input.publication, "The publication", LIBRARY_MAX_NAME_LENGTH),
      author: author || undefined,
      publishedOn: optionalDay(input.publishedOn, "Published"),
      updatedOn: optionalDay(input.updatedOn, "Last updated"),
      description: description || undefined,
      topic: input.topic,
      status: input.status,
      language: language && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(language) ? language : undefined,
      words: countWords(body),
      readAt: input.readAt,
    },
    body,
  };
}

/** The article already at this address, if any but `exceptId` (L2). */
async function articleAt(ctx: QueryCtx, url: string, exceptId?: Id<"libraryArticles">) {
  const found = await ctx.db.query("libraryArticles").withIndex("by_url", (q) => q.eq("url", url)).first();
  return found && found._id !== exceptId ? found : null;
}

async function refuseSecondCopy(ctx: QueryCtx, url: string, exceptId?: Id<"libraryArticles">) {
  const existing = await articleAt(ctx, url, exceptId);
  if (existing) throw appError("INVALID_INPUT", `That article is already in the Library: “${existing.title}”.`);
}

/** Ask Hakken's copy in line with the article (L11): its sections replaced, or gone for a draft. */
async function syncSections(ctx: MutationCtx, articleId: Id<"libraryArticles">, article: StoredArticle, body: string) {
  const old = await ctx.db.query("libraryArticleSections").withIndex("by_article", (q) => q.eq("articleId", articleId)).take(LIBRARY_MAX_SECTIONS);
  await Promise.all(old.map((section) => ctx.db.delete(section._id)));
  if (article.status !== "IN_KNOWLEDGE") return;
  const sections = librarySections(article.title, body);
  await Promise.all(sections.map((section, position) => ctx.db.insert("libraryArticleSections", { articleId, position, ...section })));
}

/** Every article, newest first, without its words: the Library list. */
export const listArticles = superAdminQuery({
  args: {},
  returns: v.array(rowValidator),
  handler: async (ctx) => {
    const articles = await ctx.db.query("libraryArticles").withIndex("by_created").order("desc").take(MAX_LISTED_ARTICLES);
    return articles.map(row);
  },
});

/** One article with its words, for its page; null when it has gone. */
export const getArticle = superAdminQuery({
  args: { articleId: v.id("libraryArticles") },
  returns: v.union(v.null(), articleValidator),
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    if (!article) return null;
    const text = await ctx.db.query("libraryArticleTexts").withIndex("by_article", (q) => q.eq("articleId", article._id)).first();
    return { ...row(article), body: text?.body ?? "" };
  },
});

/** The article already at an address, so Read the page can say so before Firecrawl is paid for it (L2). */
export const findByUrlInternal = internalQuery({
  args: { url: v.string(), exceptId: v.optional(v.id("libraryArticles")) },
  returns: v.union(v.null(), v.object({ articleId: v.id("libraryArticles"), title: v.string() })),
  handler: async (ctx, args) => {
    const existing = await articleAt(ctx, args.url, args.exceptId);
    return existing ? { articleId: existing._id, title: existing.title } : null;
  },
});

export const createArticle = superAdminMutation({
  args: articleInput,
  returns: v.id("libraryArticles"),
  handler: async (ctx, args) => {
    const { article, body } = checkedLibraryArticle(args);
    await refuseSecondCopy(ctx, article.url);
    const now = Date.now();
    const articleId = await ctx.db.insert("libraryArticles", { ...article, createdAt: now, updatedAt: now });
    await ctx.db.insert("libraryArticleTexts", { articleId, body });
    await syncSections(ctx, articleId, article, body);
    await auditContentChange(ctx, "CREATE_LIBRARY_ARTICLE", "libraryArticles", articleId, { title: article.title, url: article.url, status: article.status });
    return articleId;
  },
});

export const updateArticle = superAdminMutation({
  args: { articleId: v.id("libraryArticles"), ...articleInput },
  returns: v.null(),
  handler: async (ctx, { articleId, ...input }) => {
    const existing = await ctx.db.get(articleId);
    if (!existing) throw appError("NOT_FOUND", "That article is no longer in the Library.");
    const { article, body } = checkedLibraryArticle(input);
    await refuseSecondCopy(ctx, article.url, articleId);
    // A save of words pasted by hand keeps when the page was last read.
    await ctx.db.replace(articleId, { ...article, readAt: article.readAt ?? existing.readAt, createdAt: existing.createdAt, updatedAt: Date.now() });
    const text = await ctx.db.query("libraryArticleTexts").withIndex("by_article", (q) => q.eq("articleId", articleId)).first();
    if (text) await ctx.db.patch(text._id, { body });
    else await ctx.db.insert("libraryArticleTexts", { articleId, body });
    await syncSections(ctx, articleId, article, body);
    await auditContentChange(ctx, "UPDATE_LIBRARY_ARTICLE", "libraryArticles", articleId, { title: article.title, status: article.status, was: existing.status });
    return null;
  },
});

export const deleteArticle = superAdminMutation({
  args: { articleId: v.id("libraryArticles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.articleId);
    if (!existing) return null;
    // One text and at most LIBRARY_MAX_SECTIONS sections an article, by how they are written.
    const [text, sections] = await Promise.all([
      ctx.db.query("libraryArticleTexts").withIndex("by_article", (q) => q.eq("articleId", args.articleId)).first(),
      ctx.db.query("libraryArticleSections").withIndex("by_article", (q) => q.eq("articleId", args.articleId)).take(LIBRARY_MAX_SECTIONS),
    ]);
    await Promise.all([...(text ? [text] : []), ...sections].map((doc) => ctx.db.delete(doc._id)));
    await ctx.db.delete(args.articleId);
    await auditContentChange(ctx, "DELETE_LIBRARY_ARTICLE", "libraryArticles", args.articleId, { title: existing.title, url: existing.url });
    return null;
  },
});

/** One section as Ask Hakken reads it: where it is from first, so the answer can name and link the original (L11). */
function sectionForAnswer(article: Doc<"libraryArticles">, text: string): string {
  const byline = [
    article.publication,
    // A one-person blog is its author's publication: named once.
    article.author && article.author !== article.publication ? article.author : undefined,
    article.publishedOn ? `published ${article.publishedOn}` : undefined,
  ].filter(Boolean).join(", ");
  return `From "${article.title}" (${byline}) — ${article.url}\n${text}`;
}

/**
 * The Library sections closest to a question (L11): searched by its
 * distinctive words, kept only when they share at least two of them (or its
 * one word, for a one-word question), at most `LIBRARY_SECTIONS_PER_ANSWER`.
 */
export const searchLibraryInternal = internalQuery({
  args: { question: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const terms = librarySearchTerms(args.question);
    if (terms.length === 0) return [];
    const needed = Math.min(2, terms.length);
    const found = await ctx.db
      .query("libraryArticleSections")
      .withSearchIndex("search_text", (q) => q.search("text", terms.join(" ")))
      .take(SEARCHED_SECTIONS);
    const close = found.filter((section) => termsFound(section.text, terms) >= needed).slice(0, LIBRARY_SECTIONS_PER_ANSWER);
    const answers: string[] = [];
    for (const section of close) {
      const article = await ctx.db.get(section.articleId);
      // A section outlives its article only between two writes; never read it.
      if (article?.status === "IN_KNOWLEDGE") answers.push(sectionForAnswer(article, section.text));
    }
    return answers;
  },
});
