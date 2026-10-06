import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { readerFields, removeTranslations, requestTranslation, sourceFields, translationProgress, translationProgressValidator } from "./contentTranslation";
import { appError } from "./utils/appError";
import { auditContentChange, checkedDay, checkedText, checkedUrl, dayStart } from "./utils/contentAdmin";
import { checkedTopicKey } from "./topics";
import { readInsightsCounts, refreshInsightsCounts } from "./insightsCounts";
import { liveLeadUntil } from "./leadStory";
import { libraryStatusValidator, type LibraryStatus } from "./libraryArticlesSchema";
import {
  countWords,
  LIBRARY_MAX_BODY_LENGTH,
  LIBRARY_MAX_DESCRIPTION_LENGTH,
  LIBRARY_MAX_MEANING_LENGTH,
  LIBRARY_MAX_SUMMARY_LENGTH,
  LIBRARY_MAX_NAME_LENGTH,
  LIBRARY_MAX_SECTIONS,
  LIBRARY_MAX_TITLE_LENGTH,
  librarySearchTerms,
  librarySections,
  libraryUrlKey,
  termsFound,
} from "./utils/libraryPage";

/**
 * Helpful content — the Library until 2026-10-06 (docs/plans/active/content-
 * library-plan.md; insights-helpful-content-plan.md): articles from other
 * websites, kept whole with their details. Only the super admin changes the
 * list; every change is audited and brings Ask Hakken's copy in line (L11) —
 * sections cut at the article's headings, without reference lists, embedded
 * for a search by meaning (IH9), for a published article, and none for a
 * draft. Readers see a published article's details and Hakken's own summary,
 * never its words (IH1); Ask Hakken reads the sections through
 * `libraryArticleSearch.ts`.
 */

/** The most articles read at once: the CSV, the counts, a migration — never a reader's list. Rows carry no words. */
export const MAX_LISTED_ARTICLES = 500;
/** The most articles of one week the News front page sets among its stories (IH8). */
const WEEK_ARTICLES = 20;
/** Sections that reach one answer (L11). */
export const LIBRARY_SECTIONS_PER_ANSWER = 3;
/** Sections read from the search before the closest are kept. */
const SEARCHED_SECTIONS = 12;

const optionalText = v.union(v.string(), v.null());
/** The key of a topic in the shared list (`topics.ts`, IH20), or none. */
const topicOrNull = v.union(v.string(), v.null());

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
  summaryEn: optionalText,
  meaningEn: optionalText,
  /** Readers see it — published, with a summary — and so it can lead (IH11). */
  shown: v.boolean(),
  /** Until when it leads the News front page (IH11); null when it does not, or no longer. */
  leadUntil: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
};
const rowValidator = v.object(rowFields);
const articleValidator = v.object({ ...rowFields, body: v.string(), translations: translationProgressValidator });

/** Blank text is "not given": what the form sends for a detail the page did not have. */
const articleInput = {
  url: v.string(),
  title: v.string(),
  publication: v.string(),
  author: v.string(),
  publishedOn: v.string(),
  updatedOn: v.string(),
  description: v.string(),
  topic: v.optional(v.string()),
  status: libraryStatusValidator,
  language: v.optional(v.string()),
  body: v.string(),
  /** When Firecrawl read the words in the form; left out for words pasted by hand. */
  readAt: v.optional(v.number()),
  /** What readers see (IH1, IH2): Hakken's summary and what it means for them; blank is none yet. */
  summaryEn: v.optional(v.string()),
  meaningEn: v.optional(v.string()),
};

export type LibraryArticleInput = {
  url: string;
  title: string;
  publication: string;
  author: string;
  publishedOn: string;
  updatedOn: string;
  description: string;
  topic?: string;
  status: LibraryStatus;
  language?: string;
  body: string;
  readAt?: number;
  summaryEn?: string;
  meaningEn?: string;
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
    summaryEn: article.summaryEn ?? null,
    meaningEn: article.meaningEn ?? null,
    shown: article.shown === true,
    leadUntil: liveLeadUntil(article.leadUntil),
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
  const summaryEn = checkedText(input.summaryEn ?? "", "The summary", LIBRARY_MAX_SUMMARY_LENGTH, { optional: true });
  const meaningEn = checkedText(input.meaningEn ?? "", "What it means for you", LIBRARY_MAX_MEANING_LENGTH, { optional: true });
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
      summaryEn: summaryEn || undefined,
      meaningEn: meaningEn || undefined,
      // Readers' lists read this through an index (IH21).
      shown: input.status === "IN_KNOWLEDGE" && Boolean(summaryEn),
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
  if (existing) throw appError("INVALID_INPUT", `That article is already in Helpful content: “${existing.title}”.`);
}

/** Ask Hakken's copy in line with the article (L11): its sections replaced, or gone for a draft. */
async function syncSections(ctx: MutationCtx, articleId: Id<"libraryArticles">, article: StoredArticle, body: string) {
  const old = await ctx.db.query("libraryArticleSections").withIndex("by_article", (q) => q.eq("articleId", articleId)).take(LIBRARY_MAX_SECTIONS);
  await Promise.all(old.map((section) => ctx.db.delete(section._id)));
  if (article.status !== "IN_KNOWLEDGE") return;
  const sections = librarySections(article.title, body);
  await Promise.all(sections.map((section, position) => ctx.db.insert("libraryArticleSections", { articleId, position, ...section })));
  // Their meaning, for a search by meaning as well as by words (IH9): embedded straight after, apart from the save.
  if (sections.length > 0) await ctx.scheduler.runAfter(0, internal.libraryArticleEmbeddings.embedSectionsInternal, { articleId });
}

/** Asks the Translator for what readers see (IH2) — only when there is something to translate: a published article with a summary. */
async function translateForReaders(ctx: MutationCtx, articleId: Id<"libraryArticles">) {
  const saved = await ctx.db.get(articleId);
  if (saved && sourceFields("libraryArticles", saved)) await requestTranslation(ctx, "libraryArticles", articleId);
}

/** Admin's search and filters, narrowed on the server (IH21). Blank is none. */
const adminFilters = {
  search: v.optional(v.string()),
  status: v.optional(libraryStatusValidator),
  topic: v.optional(v.string()),
  publication: v.optional(v.string()),
};
type AdminFilters = { search?: string; status?: LibraryStatus; topic?: string; publication?: string };

/**
 * Admin's list as a query: searched by title through the search index, or
 * read newest first through the index of its narrowest filter — publication,
 * then topic, then who reads it — with the others applied on the server.
 */
function adminQuery(ctx: QueryCtx, args: AdminFilters) {
  const search = args.search?.trim();
  const { status, topic, publication } = args;
  if (search) {
    return ctx.db.query("libraryArticles").withSearchIndex("search_title", (q) => {
      let found = q.search("title", search);
      if (status) found = found.eq("status", status);
      if (topic) found = found.eq("topic", topic);
      if (publication) found = found.eq("publication", publication);
      return found;
    });
  }
  const byIndex = publication
    ? ctx.db.query("libraryArticles").withIndex("by_publication_created", (q) => q.eq("publication", publication)).order("desc")
    : topic
      ? ctx.db.query("libraryArticles").withIndex("by_topic_created", (q) => q.eq("topic", topic)).order("desc")
      : status
        ? ctx.db.query("libraryArticles").withIndex("by_status_created", (q) => q.eq("status", status)).order("desc")
        : ctx.db.query("libraryArticles").withIndex("by_created").order("desc");
  return byIndex.filter((q) => q.and(
    status ? q.eq(q.field("status"), status) : true,
    topic ? q.eq(q.field("topic"), topic) : true,
  ));
}

/** Admin → Content → Helpful content: a page at a time, searched and filtered on the server, without the articles' words (IH21). */
export const listArticlesPage = superAdminQuery({
  args: { ...adminFilters, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(rowValidator),
  handler: async (ctx, args) => {
    const page = await adminQuery(ctx, args).paginate(args.paginationOpts);
    return { ...page, page: page.page.map(row) };
  },
});

/** The same search and filters, every matching article up to the list's limit: the Download CSV. */
export const listArticlesForExport = superAdminQuery({
  args: adminFilters,
  returns: v.array(rowValidator),
  handler: async (ctx, args) => (await adminQuery(ctx, args).take(MAX_LISTED_ARTICLES)).map(row),
});

/** Every publication in Helpful content, drafts too — the Admin list's Publication filter — as kept when the list changes (IH21). */
export const listAdminPublications = superAdminQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => (await readInsightsCounts(ctx)).adminPublications,
});

/** One article with its words, for its page; null when it has gone. */
export const getArticle = superAdminQuery({
  args: { articleId: v.id("libraryArticles") },
  returns: v.union(v.null(), articleValidator),
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    if (!article) return null;
    const text = await ctx.db.query("libraryArticleTexts").withIndex("by_article", (q) => q.eq("articleId", article._id)).first();
    const translations = await translationProgress(ctx, "libraryArticles", article._id, sourceFields("libraryArticles", article));
    return { ...row(article), body: text?.body ?? "", translations };
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
    article.topic = await checkedTopicKey(ctx, args.topic);
    await refuseSecondCopy(ctx, article.url);
    const now = Date.now();
    const articleId = await ctx.db.insert("libraryArticles", { ...article, createdAt: now, updatedAt: now });
    await ctx.db.insert("libraryArticleTexts", { articleId, body });
    await syncSections(ctx, articleId, article, body);
    await translateForReaders(ctx, articleId);
    await refreshInsightsCounts(ctx);
    await auditContentChange(ctx, "CREATE_LIBRARY_ARTICLE", "libraryArticles", articleId, { title: article.title, url: article.url, status: article.status });
    return articleId;
  },
});

export const updateArticle = superAdminMutation({
  args: { articleId: v.id("libraryArticles"), ...articleInput },
  returns: v.null(),
  handler: async (ctx, { articleId, ...input }) => {
    const existing = await ctx.db.get(articleId);
    if (!existing) throw appError("NOT_FOUND", "That article is no longer in Helpful content.");
    const { article, body } = checkedLibraryArticle(input);
    article.topic = await checkedTopicKey(ctx, input.topic);
    await refuseSecondCopy(ctx, article.url, articleId);
    // A save of words pasted by hand keeps when the page was last read.
    // Its pin stays while readers can see it, and goes when they no longer can (IH11).
    await ctx.db.replace(articleId, {
      ...article,
      readAt: article.readAt ?? existing.readAt,
      leadUntil: article.shown ? existing.leadUntil : undefined,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    });
    const text = await ctx.db.query("libraryArticleTexts").withIndex("by_article", (q) => q.eq("articleId", articleId)).first();
    if (text) await ctx.db.patch(text._id, { body });
    else await ctx.db.insert("libraryArticleTexts", { articleId, body });
    await syncSections(ctx, articleId, article, body);
    await translateForReaders(ctx, articleId);
    await refreshInsightsCounts(ctx);
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
    await removeTranslations(ctx, "libraryArticles", args.articleId);
    await refreshInsightsCounts(ctx);
    await auditContentChange(ctx, "DELETE_LIBRARY_ARTICLE", "libraryArticles", args.articleId, { title: existing.title, url: existing.url });
    return null;
  },
});

/**
 * What a reader sees of a Helpful content article in Insights (IH1, IH5–IH7):
 * its details and Hakken's summary in their language — never the article's
 * words, which no reader query reads.
 */
export const readerValidator = v.object({
  _id: v.id("libraryArticles"),
  url: v.string(),
  title: v.string(),
  publication: v.string(),
  author: optionalText,
  publishedOn: optionalText,
  language: optionalText,
  topic: topicOrNull,
  words: v.number(),
  /** When it was added to Helpful content: what the lists go by. */
  addedAt: v.number(),
  summary: v.string(),
  meaning: optionalText,
});

/** Shown to readers: published, with a summary written (IH2) — as stored on it (IH21). */
function forReaders(article: Doc<"libraryArticles">): boolean {
  return article.shown === true;
}

export async function readerRow(ctx: QueryCtx, article: Doc<"libraryArticles">, language: string) {
  const english = sourceFields("libraryArticles", article) ?? { summary: article.summaryEn ?? "" };
  const words = await readerFields(ctx, "libraryArticles", article._id, english, language);
  return {
    _id: article._id,
    url: article.url,
    title: article.title,
    publication: article.publication,
    author: article.author ?? null,
    publishedOn: article.publishedOn ?? null,
    language: article.language ?? null,
    topic: article.topic ?? null,
    words: article.words,
    addedAt: article.createdAt,
    summary: words.summary,
    meaning: words.meaning ?? null,
  };
}

/**
 * Helpful content for readers, newest added first, a page at a time — all,
 * one topic's or one publication's, each through its own index (IH5, IH6,
 * IH21): any signed-in user.
 */
export const listForReaders = tenantQuery({
  args: { language: v.string(), topic: v.optional(v.string()), publication: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(readerValidator),
  handler: async (ctx, args) => {
    const { topic, publication } = args;
    const page = topic
      ? await ctx.db.query("libraryArticles").withIndex("by_shown_topic_created", (q) => q.eq("shown", true).eq("topic", topic)).order("desc").paginate(args.paginationOpts)
      : publication
        ? await ctx.db.query("libraryArticles").withIndex("by_shown_publication_created", (q) => q.eq("shown", true).eq("publication", publication)).order("desc").paginate(args.paginationOpts)
        : await ctx.db.query("libraryArticles").withIndex("by_shown_created", (q) => q.eq("shown", true)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((article) => readerRow(ctx, article, args.language))) };
  },
});

/** Helpful content for readers at a glance — how many, and its publications — as kept when the list changes (IH5, IH21). */
export const getReaderOverview = tenantQuery({
  args: {},
  returns: v.object({ all: v.number(), publications: v.array(v.object({ name: v.string(), count: v.number() })) }),
  handler: async (ctx) => {
    const { helpful } = await readInsightsCounts(ctx);
    return { all: helpful.all, publications: helpful.publications };
  },
});

/** Added since `since`, newest first: those that take their place among the News front page's stories (IH8). */
export const listForReadersSince = tenantQuery({
  args: { language: v.string(), since: v.number() },
  returns: v.array(readerValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("libraryArticles")
      .withIndex("by_shown_created", (q) => q.eq("shown", true).gte("createdAt", args.since))
      .order("desc")
      .take(WEEK_ARTICLES);
    return await Promise.all(rows.map((article) => readerRow(ctx, article, args.language)));
  },
});

/** One Helpful content article for its page in Insights (IH7); null for a draft or one without a summary, as for one that never existed. */
export const getForReader = tenantQuery({
  args: { articleId: v.id("libraryArticles"), language: v.string() },
  returns: v.union(v.null(), readerValidator),
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    return article && forReaders(article) ? await readerRow(ctx, article, args.language) : null;
  },
});

/**
 * The article pinned to lead the News front page, if it is one of these: it
 * leads Helpful content's own page too (IH11). A pin counts for the whole of
 * the day it runs out on, as the front page's does.
 */
export const getPinnedForReaders = tenantQuery({
  args: { language: v.string(), today: v.string() },
  returns: v.union(v.null(), readerValidator),
  handler: async (ctx, args) => {
    const pinned = await ctx.db
      .query("libraryArticles")
      .withIndex("by_lead_until", (q) => q.gt("leadUntil", dayStart(checkedDay(args.today, "Today"))))
      .order("desc")
      .first();
    return pinned && forReaders(pinned) ? await readerRow(ctx, pinned, args.language) : null;
  },
});

/** Articles listed under the one being read. */
export const MORE_ARTICLES = 4;

/**
 * Others to read after an article (IH7, IH12): the newest of its topic, or the
 * newest of all when it has none — never the one being read — through the
 * reader indexes, a handful read.
 */
export const listMoreForReaders = tenantQuery({
  args: { language: v.string(), topic: v.optional(v.string()), exclude: v.optional(v.id("libraryArticles")) },
  returns: v.array(readerValidator),
  handler: async (ctx, args) => {
    const topic = args.topic;
    const rows = topic
      ? await ctx.db.query("libraryArticles").withIndex("by_shown_topic_created", (q) => q.eq("shown", true).eq("topic", topic)).order("desc").take(MORE_ARTICLES + 1)
      : await ctx.db.query("libraryArticles").withIndex("by_shown_created", (q) => q.eq("shown", true)).order("desc").take(MORE_ARTICLES + 1);
    const others = rows.filter((article) => article._id !== args.exclude).slice(0, MORE_ARTICLES);
    return await Promise.all(others.map((article) => readerRow(ctx, article, args.language)));
  },
});

/**
 * The model that writes what readers see (IH2): the News Collector agent's
 * own choice, as its News summaries use, or the default for agents when it
 * has none or there is no Collector. Never a model named in code.
 */
export const writerModelInternal = internalQuery({
  args: {},
  returns: v.object({ requestedModelId: v.optional(v.string()) }),
  handler: async (ctx) => {
    const collector = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "NEWS_COLLECTOR")).first();
    if (!collector || collector.modelSelectionMode === "inherit" || !collector.modelId) return {};
    return { requestedModelId: collector.modelId };
  },
});

/** Published articles still without what readers see, with their words, for the writer to catch up on (IH2). */
export const missingReaderWordsInternal = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({ articleId: v.id("libraryArticles"), title: v.string(), publication: v.string(), body: v.string() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("libraryArticles")
      .withIndex("by_status_created", (q) => q.eq("status", "IN_KNOWLEDGE"))
      .take(MAX_LISTED_ARTICLES);
    const missing = rows.filter((article) => !article.summaryEn?.trim()).slice(0, args.limit);
    return await Promise.all(missing.map(async (article) => {
      const text = await ctx.db.query("libraryArticleTexts").withIndex("by_article", (q) => q.eq("articleId", article._id)).first();
      return { articleId: article._id, title: article.title, publication: article.publication, body: text?.body ?? "" };
    }));
  },
});

/** Keeps what the writer wrote, unless the admin wrote a summary meanwhile; asks for its translation. */
export const saveReaderWordsInternal = internalMutation({
  args: { articleId: v.id("libraryArticles"), summaryEn: v.string(), meaningEn: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId);
    if (!article || article.summaryEn?.trim()) return false;
    const summaryEn = args.summaryEn.trim().slice(0, LIBRARY_MAX_SUMMARY_LENGTH);
    const meaningEn = args.meaningEn.trim().slice(0, LIBRARY_MAX_MEANING_LENGTH);
    if (!summaryEn) return false;
    await ctx.db.patch(args.articleId, { summaryEn, ...(meaningEn ? { meaningEn } : {}), shown: article.status === "IN_KNOWLEDGE", updatedAt: Date.now() });
    await requestTranslation(ctx, "libraryArticles", args.articleId);
    await refreshInsightsCounts(ctx);
    return true;
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
 * The sections closest to a question (L11, IH9), at most
 * `LIBRARY_SECTIONS_PER_ANSWER`: first those found by meaning — the vector
 * search's matches (`libraryArticleSearch.ts`), kept when embedded by the
 * question's own model — then those found by its distinctive words, kept only
 * when they share at least two of them (or its one word, for a one-word
 * question). Only an article readers can see is read.
 */
export const searchLibraryInternal = internalQuery({
  args: {
    question: v.string(),
    byMeaning: v.optional(v.array(v.id("libraryArticleSections"))),
    embeddingModelId: v.optional(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const close: Doc<"libraryArticleSections">[] = [];
    for (const sectionId of args.byMeaning ?? []) {
      const section = await ctx.db.get(sectionId);
      if (section && section.embeddingModelId === args.embeddingModelId) close.push(section);
    }
    const terms = librarySearchTerms(args.question);
    if (terms.length > 0) {
      const needed = Math.min(2, terms.length);
      const found = await ctx.db
        .query("libraryArticleSections")
        .withSearchIndex("search_text", (q) => q.search("text", terms.join(" ")))
        .take(SEARCHED_SECTIONS);
      for (const section of found) {
        if (termsFound(section.text, terms) >= needed && !close.some((kept) => kept._id === section._id)) close.push(section);
      }
    }
    const answers: string[] = [];
    for (const section of close) {
      if (answers.length === LIBRARY_SECTIONS_PER_ANSWER) break;
      const article = await ctx.db.get(section.articleId);
      // A section outlives its article only between two writes; never read it.
      if (article?.status === "IN_KNOWLEDGE") answers.push(sectionForAnswer(article, section.text));
    }
    return answers;
  },
});

/** An article's sections still without a meaning from the model in use, for the embedder (IH9). */
export const sectionsToEmbedInternal = internalQuery({
  args: { articleId: v.id("libraryArticles"), embeddingModelId: v.string() },
  returns: v.array(v.object({ sectionId: v.id("libraryArticleSections"), text: v.string() })),
  handler: async (ctx, args) => {
    const sections = await ctx.db.query("libraryArticleSections").withIndex("by_article", (q) => q.eq("articleId", args.articleId)).take(LIBRARY_MAX_SECTIONS);
    return sections
      .filter((section) => !section.embedding || section.embeddingModelId !== args.embeddingModelId)
      .map((section) => ({ sectionId: section._id, text: section.text }));
  },
});

/** Keeps one section's meaning; a section replaced meanwhile is left alone. */
export const saveSectionEmbeddingInternal = internalMutation({
  args: { sectionId: v.id("libraryArticleSections"), embedding: v.array(v.number()), embeddingModelId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId);
    if (section) await ctx.db.patch(args.sectionId, { embedding: args.embedding, embeddingModelId: args.embeddingModelId });
    return null;
  },
});

/**
 * Cuts every published article's sections again and embeds them (IH9): for
 * the articles saved before reference lists were left out and sections had a
 * meaning. The migration `2026-10-06-helpful-content-meaning` runs it once.
 */
export async function recutPublishedSections(ctx: MutationCtx): Promise<number> {
  const articles = await ctx.db.query("libraryArticles").withIndex("by_status_created", (q) => q.eq("status", "IN_KNOWLEDGE")).take(MAX_LISTED_ARTICLES);
  for (const article of articles) {
    const text = await ctx.db.query("libraryArticleTexts").withIndex("by_article", (q) => q.eq("articleId", article._id)).first();
    await syncSections(ctx, article._id, article, text?.body ?? "");
  }
  return articles.length;
}
