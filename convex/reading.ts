import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { tenantMutation } from "./tenantFunctions";
import type { ReadingKind, ReadingScope } from "./readingSchema";

/**
 * Reading in Insights, counted as it happens (docs/plans/active/content-
 * people-knowledge-plan.md, phase 4). A client's screen says what was viewed,
 * read or clicked; Ask Hakken says which articles it drew on. Each lands as
 * one event and moves the day's totals — overall, its item, its person, the
 * company, the user, the item at that company and the user's topic — and who
 * and what was last active, so Analytics reads totals and never the events.
 * Super admins, and anyone with no company, are never counted (Q3).
 */

/** The UTC day of a moment, "YYYY-MM-DD". */
export const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

/** What a client opened or clicked, as their screen names it. */
export const readingThingValidator = v.object({
  type: v.union(v.literal("OURS"), v.literal("WEB"), v.literal("STORY"), v.literal("PERSON")),
  id: v.string(),
});
type ReadingThing = { type: "OURS" | "WEB" | "STORY" | "PERSON"; id: string };

/** What a thing counts as: its item, its person and topic, and what Analytics names it by. */
type Counted = {
  itemKey?: string;
  followId?: Id<"newsFollows">;
  topic?: string;
  title?: string;
  fromName?: string;
  where?: "KNOWLEDGE" | "NEWS";
};

const FIELD: Record<ReadingKind, "views" | "reads" | "clicks" | "answers"> = { VIEW: "views", READ: "reads", CLICK: "clicks", ANSWER: "answers" };
const SUM: Record<ReadingKind, "sumViews" | "sumReads" | "sumClicks" | "sumAnswers"> = { VIEW: "sumViews", READ: "sumReads", CLICK: "sumClicks", ANSWER: "sumAnswers" };

async function webArticle(ctx: QueryCtx, article: Doc<"libraryArticles">): Promise<Counted> {
  const follow = article.followId ? await ctx.db.get(article.followId) : null;
  return {
    itemKey: `WEB:${article._id}`,
    ...(follow ? { followId: follow._id } : {}),
    ...(article.topic ? { topic: article.topic } : {}),
    title: article.title,
    fromName: follow?.name ?? (article.author?.trim() || article.publication),
    where: "KNOWLEDGE",
  };
}

/**
 * What a thing counts as. A story kept in Knowledge counts as its kept
 * article, so the two are one row in Analytics; anything gone is not counted.
 */
async function countedAs(ctx: QueryCtx, thing: ReadingThing): Promise<Counted | null> {
  const id = ctx.db.normalizeId;
  if (thing.type === "OURS") {
    const articleId = id("knowledgeArticles", thing.id);
    const article = articleId ? await ctx.db.get(articleId) : null;
    if (!article) return null;
    return { itemKey: `OURS:${article._id}`, ...(article.topic ? { topic: article.topic } : {}), title: article.titleEn, fromName: "", where: "KNOWLEDGE" };
  }
  if (thing.type === "WEB") {
    const articleId = id("libraryArticles", thing.id);
    const article = articleId ? await ctx.db.get(articleId) : null;
    return article ? await webArticle(ctx, article) : null;
  }
  if (thing.type === "STORY") {
    const itemId = id("newsItems", thing.id);
    const item = itemId ? await ctx.db.get(itemId) : null;
    if (!item) return null;
    const kept = item.knowledgeArticleId ? await ctx.db.get(item.knowledgeArticleId) : null;
    if (kept) return await webArticle(ctx, kept);
    const follow = item.followId ? await ctx.db.get(item.followId) : null;
    return {
      itemKey: `STORY:${item._id}`,
      ...(follow ? { followId: follow._id } : {}),
      ...(follow?.topic ? { topic: follow.topic } : {}),
      title: item.titleEn,
      fromName: follow?.name ?? (item.kind === "GOOGLE_UPDATE" ? "Google" : item.sourceName),
      where: "NEWS",
    };
  }
  const followId = id("newsFollows", thing.id);
  const follow = followId ? await ctx.db.get(followId) : null;
  return follow ? { followId: follow._id, ...(follow.topic ? { topic: follow.topic } : {}) } : null;
}

/** One more of a kind on a thing's day, its running totals carried from its last day. */
async function addToTotal(ctx: MutationCtx, scope: ReadingScope, key: string, day: string, kind: ReadingKind, firsts: { reader?: boolean; company?: boolean } = {}) {
  const field = FIELD[kind];
  const sum = SUM[kind];
  const today = await ctx.db.query("readingTotals").withIndex("by_scope_key_day", (q) => q.eq("scope", scope).eq("key", key).eq("day", day)).unique();
  if (today) {
    await ctx.db.patch(today._id, {
      [field]: today[field] + 1,
      [sum]: today[sum] + 1,
      ...(firsts.reader ? { readers: (today.readers ?? 0) + 1 } : {}),
      ...(firsts.company ? { companies: (today.companies ?? 0) + 1 } : {}),
    });
    return;
  }
  const before = await ctx.db.query("readingTotals").withIndex("by_scope_key_day", (q) => q.eq("scope", scope).eq("key", key).lt("day", day)).order("desc").first();
  const row = {
    scope,
    key,
    day,
    views: 0,
    reads: 0,
    clicks: 0,
    answers: 0,
    sumViews: before?.sumViews ?? 0,
    sumReads: before?.sumReads ?? 0,
    sumClicks: before?.sumClicks ?? 0,
    sumAnswers: before?.sumAnswers ?? 0,
    ...(scope === "ALL" ? { readers: firsts.reader ? 1 : 0, companies: firsts.company ? 1 : 0 } : {}),
  };
  row[field] += 1;
  row[sum] += 1;
  await ctx.db.insert("readingTotals", row);
}

type ActiveRow = Omit<Doc<"readingActive">, "_id" | "_creationTime">;

/** Marks something active now; says whether it was the first time today. */
async function markActive(ctx: MutationCtx, row: ActiveRow): Promise<boolean> {
  const existing = await ctx.db.query("readingActive").withIndex("by_scope_key", (q) => q.eq("scope", row.scope).eq("key", row.key)).unique();
  if (existing) {
    await ctx.db.patch(existing._id, row);
    return existing.lastDay !== row.lastDay;
  }
  await ctx.db.insert("readingActive", row);
  return true;
}

/** Records one event and moves every total it touches. */
async function record(ctx: MutationCtx, kind: ReadingKind, who: { userId: Id<"users">; companyId: Id<"companies"> }, counted: Counted) {
  const at = Date.now();
  const day = dayOf(at);
  const { itemKey, followId, topic } = counted;
  await ctx.db.insert("readingEvents", {
    at, day, kind, userId: who.userId, companyId: who.companyId,
    ...(itemKey ? { itemKey } : {}), ...(followId ? { followId } : {}), ...(topic ? { topic } : {}),
  });

  if (itemKey) {
    await addToTotal(ctx, "ITEM", itemKey, day, kind);
    await markActive(ctx, {
      scope: "ITEM", key: itemKey, lastAt: at, lastDay: day,
      ...(counted.title !== undefined ? { title: counted.title } : {}),
      ...(counted.fromName !== undefined ? { fromName: counted.fromName } : {}),
      ...(followId ? { followId } : {}), ...(topic ? { topic } : {}), ...(counted.where ? { where: counted.where } : {}),
    });
  }
  if (followId) {
    await addToTotal(ctx, "PERSON", followId, day, kind);
    await markActive(ctx, { scope: "PERSON", key: followId, followId, lastAt: at, lastDay: day });
  }
  // An answer drew on it; nobody read it, so who asked is not a reader.
  if (kind === "ANSWER") {
    await addToTotal(ctx, "ALL", "", day, kind);
    return;
  }

  const firstReader = await markActive(ctx, { scope: "USER", key: who.userId, userId: who.userId, companyId: who.companyId, lastAt: at, lastDay: day });
  const firstCompany = await markActive(ctx, { scope: "COMPANY", key: who.companyId, companyId: who.companyId, lastAt: at, lastDay: day });
  await addToTotal(ctx, "ALL", "", day, kind, { reader: firstReader, company: firstCompany });
  await addToTotal(ctx, "COMPANY", who.companyId, day, kind);
  await addToTotal(ctx, "USER", who.userId, day, kind);
  if (topic) await addToTotal(ctx, "USER_TOPIC", `${who.userId}|${topic}`, day, kind);
  if (itemKey) {
    await addToTotal(ctx, "ITEM_COMPANY", `${itemKey}|${who.companyId}`, day, kind);
    await markActive(ctx, { scope: "ITEM_USER", key: `${itemKey}|${who.userId}`, itemKey, userId: who.userId, companyId: who.companyId, lastAt: at, lastDay: day });
  }
}

/**
 * A client's screen counts a view, a read or a click (Q1: a read is 30
 * seconds on it or reaching its end, which the screen judges). Super admins,
 * and anyone without a company, are not counted.
 */
export const recordReading = tenantMutation({
  args: { kind: v.union(v.literal("VIEW"), v.literal("READ"), v.literal("CLICK")), thing: readingThingValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (ctx.user.role === "SUPER_ADMIN" || !ctx.companyId) return null;
    // A view or read is of an article or story; a person is only clicked through.
    if (args.thing.type === "PERSON" && args.kind !== "CLICK") return null;
    const counted = await countedAs(ctx, args.thing);
    if (!counted) return null;
    await record(ctx, args.kind, { userId: ctx.userId, companyId: ctx.companyId }, counted);
    return null;
  },
});

/** The page key Ask Hakken's answer names for one of our articles: its wiki page (`knowledgeArticleWiki.ts`). */
const OURS_PAGE_KEY = /PRODUCT:knowledge-(.+)$/;

/**
 * Ask Hakken drew on these for an answer (Q2): the web articles whose
 * sections it read, and ours through their wiki pages. Counted once each an
 * answer, for a signed-in client in their own conversation.
 */
export const recordAnswerInternal = internalMutation({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    libraryArticleIds: v.array(v.id("libraryArticles")),
    wikiPageKeys: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.role === "SUPER_ADMIN") return null;
    const things: ReadingThing[] = [
      ...[...new Set(args.libraryArticleIds)].map((id) => ({ type: "WEB" as const, id })),
      ...[...new Set(args.wikiPageKeys.map((key) => OURS_PAGE_KEY.exec(key)?.[1]).filter((id): id is string => Boolean(id)))].map((id) => ({ type: "OURS" as const, id })),
    ];
    for (const thing of things) {
      const counted = await countedAs(ctx, thing);
      if (counted) await record(ctx, "ANSWER", { userId: args.userId, companyId: args.companyId }, counted);
    }
    return null;
  },
});
