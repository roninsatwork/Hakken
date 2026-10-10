import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { superAdminQuery } from "./tenantFunctions";
import { knowledgeCameValidator, knowledgeListKindValidator } from "./knowledgeListSchema";
import { liveLeadUntil } from "./leadStory";
import { sourceFields, translationProgress, translationProgressValidator } from "./contentTranslation";
import { topicsInOrder } from "./topics";
import { listPageArgs, listPageResult, pageOfList } from "./siteListPages";
import { countWords } from "./utils/libraryPage";
import { byValue, compareText, type SortDirection, type SortValue } from "./utils/sortOrder";

/**
 * Admin → Knowledge's one list (docs/plans/active/content-people-knowledge-
 * plan.md, phase 3, board 5): our articles and the web's, together. Every
 * write to either keeps its small row in `knowledgeList` in step, and the list
 * is read whole from those rows, then searched, narrowed, sorted by any
 * heading and cut into a page here, so its total is exact.
 */

/** The most rows the list reads; past it the list says it was cut. Each row is small. */
export const KNOWLEDGE_LIST_MAX = 900;

type ListRow = Omit<Doc<"knowledgeList">, "_id" | "_creationTime">;

async function upsert(ctx: MutationCtx, existing: Doc<"knowledgeList"> | null, row: ListRow | null) {
  if (!row) {
    if (existing) await ctx.db.delete(existing._id);
    return;
  }
  if (existing) await ctx.db.replace(existing._id, row);
  else await ctx.db.insert("knowledgeList", row);
}

/** Brings an article of ours's row in step with it; gone when the article is. */
export async function syncOursInList(ctx: MutationCtx, articleId: Id<"knowledgeArticles">): Promise<void> {
  const [article, existing] = await Promise.all([
    ctx.db.get(articleId),
    ctx.db.query("knowledgeList").withIndex("by_knowledge_article", (q) => q.eq("knowledgeArticleId", articleId)).first(),
  ]);
  await upsert(ctx, existing, article ? {
    kind: "OURS",
    knowledgeArticleId: articleId,
    title: article.titleEn,
    came: "WRITTEN",
    fromName: "",
    ...(article.topic ? { topic: article.topic } : {}),
    words: countWords(article.bodyEn),
    status: article.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    addedAt: article._creationTime,
  } : null);
}

/** Brings a web article's row in step with it: who it is from is the person it was ticked from, else its author, else its publication. */
export async function syncWebInList(ctx: MutationCtx, articleId: Id<"libraryArticles">): Promise<void> {
  const [article, existing] = await Promise.all([
    ctx.db.get(articleId),
    ctx.db.query("knowledgeList").withIndex("by_library_article", (q) => q.eq("libraryArticleId", articleId)).first(),
  ]);
  const follow = article?.followId ? await ctx.db.get(article.followId) : null;
  await upsert(ctx, existing, article ? {
    kind: "WEB",
    libraryArticleId: articleId,
    title: article.title,
    came: article.followId ? "NEWS" : "LINK",
    fromName: follow?.name ?? (article.author?.trim() || article.publication),
    // A person since deleted is no longer one to narrow the list to.
    ...(follow ? { followId: follow._id } : {}),
    ...(article.topic ? { topic: article.topic } : {}),
    words: article.words,
    status: article.status === "IN_KNOWLEDGE" ? "PUBLISHED" : "DRAFT",
    addedAt: article.createdAt,
  } : null);
}

/** A person renamed or deleted: the articles ticked from them say who they are from again. */
export async function syncFollowInList(ctx: MutationCtx, followId: Id<"newsFollows">): Promise<void> {
  const rows = await ctx.db.query("knowledgeList").withIndex("by_follow", (q) => q.eq("followId", followId)).take(KNOWLEDGE_LIST_MAX);
  for (const row of rows) if (row.libraryArticleId) await syncWebInList(ctx, row.libraryArticleId);
}

/** Every row written again from the articles: the first fill, and a repair. */
export async function rebuildKnowledgeList(ctx: MutationCtx): Promise<{ ours: number; web: number }> {
  const [ours, web] = await Promise.all([
    ctx.db.query("knowledgeArticles").take(KNOWLEDGE_LIST_MAX),
    ctx.db.query("libraryArticles").take(KNOWLEDGE_LIST_MAX),
  ]);
  for (const article of ours) await syncOursInList(ctx, article._id);
  for (const article of web) await syncWebInList(ctx, article._id);
  return { ours: ours.length, web: web.length };
}

const SORTS = ["title", "from", "topic", "words", "status", "added"] as const;
type Sort = (typeof SORTS)[number];

const listRowValidator = v.object({
  _id: v.id("knowledgeList"),
  kind: knowledgeListKindValidator,
  /** The article's own id: in `knowledgeArticles` for ours, `libraryArticles` for the web's. */
  articleId: v.string(),
  title: v.string(),
  came: knowledgeCameValidator,
  fromName: v.string(),
  followId: v.union(v.id("newsFollows"), v.null()),
  topic: v.union(v.string(), v.null()),
  words: v.number(),
  status: v.union(v.literal("PUBLISHED"), v.literal("DRAFT")),
  addedAt: v.number(),
  leadUntil: v.union(v.number(), v.null()),
  /** Whether it may lead the front page: ours published, the web's shown to readers. */
  canLead: v.boolean(),
  translations: translationProgressValidator,
});

const listArgs = {
  search: v.optional(v.string()),
  /** Ours, the web's, or one person's. */
  from: v.optional(v.union(v.literal("OURS"), v.literal("WEB"), v.id("newsFollows"))),
  topic: v.optional(v.string()),
  status: v.optional(v.union(v.literal("PUBLISHED"), v.literal("DRAFT"))),
};

/** The whole list after its search and filters, sorted. */
async function narrowedList(
  ctx: QueryCtx,
  args: { search?: string; from?: "OURS" | "WEB" | Id<"newsFollows">; topic?: string; status?: "PUBLISHED" | "DRAFT"; sort?: Sort; direction?: "asc" | "desc" },
) {
  const read = await ctx.db.query("knowledgeList").withIndex("by_added").order("desc").take(KNOWLEDGE_LIST_MAX + 1);
  const cut = read.length > KNOWLEDGE_LIST_MAX ? KNOWLEDGE_LIST_MAX : null;
  const all = read.slice(0, KNOWLEDGE_LIST_MAX);
  const search = args.search?.trim().toLowerCase();
  const rows = all.filter((row) =>
    (!search || row.title.toLowerCase().includes(search) || row.fromName.toLowerCase().includes(search))
    && (!args.from || (args.from === "OURS" ? row.kind === "OURS" : args.from === "WEB" ? row.kind === "WEB" : row.followId === args.from))
    && (!args.topic || row.topic === args.topic)
    && (!args.status || row.status === args.status));
  const topicNames = new Map((await topicsInOrder(ctx)).map((topic) => [topic.key, topic.nameEn]));
  const values: Record<Sort, (row: Doc<"knowledgeList">) => SortValue> = {
    title: (row) => row.title,
    // Ours reads "Ours" in the column, and sorts as it reads.
    from: (row) => (row.kind === "OURS" ? "Ours" : row.fromName),
    topic: (row) => (row.topic ? topicNames.get(row.topic) ?? null : null),
    words: (row) => row.words,
    status: (row) => row.status,
    added: (row) => row.addedAt,
  };
  const sort = args.sort ?? "added";
  const sorted = [...rows].sort(byValue(values[sort], (row) => row.title, (args.direction ?? "desc") as SortDirection, compareText));
  // The people the list can be narrowed to: everyone something was ticked from.
  const people = new Map<string, string>();
  for (const row of all) if (row.followId && !people.has(row.followId)) people.set(row.followId, row.fromName);
  return { rows: sorted, cut, people };
}

/** The list's page, with its counts and who it can be narrowed to (board 5). */
export const listKnowledgeForAdmin = superAdminQuery({
  args: { ...listArgs, sort: v.union(...SORTS.map((sort) => v.literal(sort))), direction: v.union(v.literal("asc"), v.literal("desc")), ...listPageArgs },
  returns: v.object({
    page: listPageResult(listRowValidator),
    /** Across the list as narrowed: how many are published, ours and the web's. */
    counts: v.object({ published: v.number(), ours: v.number(), web: v.number() }),
    people: v.array(v.object({ followId: v.id("newsFollows"), name: v.string() })),
  }),
  handler: async (ctx, args) => {
    const { rows, cut, people } = await narrowedList(ctx, args);
    const page = pageOfList(rows, args.page, args.rows, cut);
    return {
      page: { ...page, rows: await Promise.all(page.rows.map((row) => shownRow(ctx, row))) },
      counts: {
        published: rows.filter((row) => row.status === "PUBLISHED").length,
        ours: rows.filter((row) => row.kind === "OURS").length,
        web: rows.filter((row) => row.kind === "WEB").length,
      },
      people: [...people].map(([followId, name]) => ({ followId: followId as Id<"newsFollows">, name })).sort((left, right) => compareText(left.name, right.name)),
    };
  },
});

/** The whole list as narrowed and sorted, for Download CSV. */
export const listKnowledgeForCsv = superAdminQuery({
  args: { ...listArgs, sort: v.union(...SORTS.map((sort) => v.literal(sort))), direction: v.union(v.literal("asc"), v.literal("desc")) },
  returns: v.array(v.object({
    kind: knowledgeListKindValidator,
    title: v.string(),
    came: knowledgeCameValidator,
    fromName: v.string(),
    topic: v.union(v.string(), v.null()),
    words: v.number(),
    status: v.union(v.literal("PUBLISHED"), v.literal("DRAFT")),
    addedAt: v.number(),
  })),
  handler: async (ctx, args) => (await narrowedList(ctx, args)).rows.map((row) => ({
    kind: row.kind, title: row.title, came: row.came, fromName: row.fromName, topic: row.topic ?? null, words: row.words, status: row.status, addedAt: row.addedAt,
  })),
});

/** A row on screen: its pin and its translations, read from the article itself. */
async function shownRow(ctx: QueryCtx, row: Doc<"knowledgeList">) {
  const base = {
    _id: row._id,
    kind: row.kind,
    title: row.title,
    came: row.came,
    fromName: row.fromName,
    followId: row.followId ?? null,
    topic: row.topic ?? null,
    words: row.words,
    status: row.status,
    addedAt: row.addedAt,
  };
  if (row.knowledgeArticleId) {
    const article = await ctx.db.get(row.knowledgeArticleId);
    return {
      ...base,
      articleId: row.knowledgeArticleId,
      leadUntil: liveLeadUntil(article?.leadUntil),
      canLead: article?.status === "PUBLISHED",
      translations: article ? await translationProgress(ctx, "knowledgeArticles", article._id, sourceFields("knowledgeArticles", article)) : { done: 0, total: 0 },
    };
  }
  const article = row.libraryArticleId ? await ctx.db.get(row.libraryArticleId) : null;
  return {
    ...base,
    articleId: row.libraryArticleId ?? "",
    leadUntil: liveLeadUntil(article?.leadUntil),
    canLead: article?.shown === true,
    translations: article ? await translationProgress(ctx, "libraryArticles", article._id, sourceFields("libraryArticles", article)) : { done: 0, total: 0 },
  };
}
