import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminQuery } from "./tenantFunctions";
import { dayOf } from "./reading";
import type { ReadingScope } from "./readingSchema";
import { topicsInOrder } from "./topics";
import { byValue, compareText, type SortDirection, type SortValue } from "./utils/sortOrder";

/**
 * Admin → Content → Analytics (docs/plans/active/content-people-knowledge-
 * plan.md, phase 5, boards 7–12): how clients use what Hakken publishes, for
 * the last 7, 30 or 90 days or 12 months. Every figure is read from the daily
 * totals `reading.ts` writes as clients read — a period's total is the
 * running total at its end less the one before its start — and who read in a
 * period is whoever was last active since it began. Super admins only; the
 * events carry each company, and no company's own screen reads this.
 */

const DAY_MS = 86_400_000;
/** The most of any one kind of thing read for a period: items, people, companies, users. Each row is small. */
export const ANALYTICS_ACTIVE_MAX = 900;
/** The most day rows a series reads: a year and a day. */
const SERIES_MAX = 366;
/** The day rows the Articles chart adds up when narrowed; past it the chart is drawn from the most-viewed and says so. */
const NARROWED_SERIES_BUDGET = 6_000;
/** The most people in Who to follow (`newsFollows.ts`), and the most people at one company counted. */
const PEOPLE_MAX = 500;

export const periodValidator = v.union(v.literal("7"), v.literal("30"), v.literal("90"), v.literal("365"));
type Period = Infer<typeof periodValidator>;

type Sums = { views: number; reads: number; clicks: number; answers: number };
const ZERO: Sums = { views: 0, reads: 0, clicks: 0, answers: 0 };

const sumsValidator = { views: v.number(), reads: v.number(), clicks: v.number(), answers: v.number() };
const rangeValidator = v.object({ from: v.string(), to: v.string(), days: v.number() });
const dayValidator = v.object({ day: v.string(), views: v.number(), reads: v.number(), clicks: v.number(), answers: v.number() });
const directionValidator = v.union(v.literal("asc"), v.literal("desc"));
const pagingArgs = { page: v.number(), rows: v.number(), all: v.optional(v.boolean()) };

/** The period's days, today last, and the same length before it. */
function windowOf(period: Period) {
  const now = Date.now();
  const days = Number(period);
  const from = dayOf(now - (days - 1) * DAY_MS);
  return {
    days,
    from,
    to: dayOf(now),
    fromAt: Date.parse(`${from}T00:00:00Z`),
    before: { from: dayOf(now - (2 * days - 1) * DAY_MS), to: dayOf(now - days * DAY_MS) },
  };
}

/** One thing's counts over some days: its running totals at the end, less those before the start. */
async function sumsOver(ctx: QueryCtx, scope: ReadingScope, key: string, from: string, to: string): Promise<Sums> {
  const last = await ctx.db.query("readingTotals").withIndex("by_scope_key_day", (q) => q.eq("scope", scope).eq("key", key).lte("day", to)).order("desc").first();
  if (!last || last.day < from) return ZERO;
  const before = await ctx.db.query("readingTotals").withIndex("by_scope_key_day", (q) => q.eq("scope", scope).eq("key", key).lt("day", from)).order("desc").first();
  return {
    views: last.sumViews - (before?.sumViews ?? 0),
    reads: last.sumReads - (before?.sumReads ?? 0),
    clicks: last.sumClicks - (before?.sumClicks ?? 0),
    answers: last.sumAnswers - (before?.sumAnswers ?? 0),
  };
}

/** One thing's days with anything on them, oldest first; the screen fills the empty days. */
async function daysOf(ctx: QueryCtx, scope: ReadingScope, key: string, from: string, to: string) {
  return await ctx.db.query("readingTotals").withIndex("by_scope_key_day", (q) => q.eq("scope", scope).eq("key", key).gte("day", from).lte("day", to)).take(SERIES_MAX);
}

const dayRow = (row: Doc<"readingTotals">) => ({ day: row.day, views: row.views, reads: row.reads, clicks: row.clicks, answers: row.answers });

/** Everything of a kind last active since a moment, the most recent first. */
async function activeSince(ctx: QueryCtx, scope: "USER" | "COMPANY" | "ITEM" | "PERSON", since: number) {
  return await ctx.db.query("readingActive").withIndex("by_scope_last", (q) => q.eq("scope", scope).gte("lastAt", since)).order("desc").take(ANALYTICS_ACTIVE_MAX);
}

async function companyName(ctx: QueryCtx, companyId: Id<"companies"> | undefined) {
  return companyId ? (await ctx.db.get(companyId))?.name ?? "" : "";
}

const personName = (user: Doc<"users"> | null) => user?.name?.trim() || user?.email || "";

const readRate = (sums: Sums) => (sums.views > 0 ? Math.round((sums.reads / sums.views) * 100) : null);

/** A page of a list held whole, or all of it for Download CSV. */
function pageOf<Row>(list: Row[], page: number, rows: number, all = false) {
  const size = all ? Math.max(1, list.length) : Math.min(Math.max(1, Math.floor(rows) || 1), 100);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const shown = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { rows: list.slice((shown - 1) * size, shown * size), total: list.length, page: shown, pages, size };
}

function pageValidator<Row extends Parameters<typeof v.array>[0]>(row: Row) {
  return v.object({ rows: v.array(row), total: v.number(), page: v.number(), pages: v.number(), size: v.number() });
}

// ── Items: what an article or story is, from its key ─────────────────────────

/** Where an item came from, for the From filter: ours, Google's updates, a person's, or a page added from a link. */
function sourceOf(row: Doc<"readingActive">): "OURS" | "GOOGLE" | "PERSON" | "LINK" {
  if (row.key.startsWith("OURS:")) return "OURS";
  if (row.followId) return "PERSON";
  return row.key.startsWith("STORY:") ? "GOOGLE" : "LINK";
}

const itemValidator = v.object({
  itemKey: v.string(),
  title: v.string(),
  fromName: v.string(),
  source: v.union(v.literal("OURS"), v.literal("GOOGLE"), v.literal("PERSON"), v.literal("LINK")),
  where: v.union(v.literal("KNOWLEDGE"), v.literal("NEWS")),
  topic: v.union(v.string(), v.null()),
  ...sumsValidator,
  readRate: v.union(v.number(), v.null()),
});

async function itemsOver(ctx: QueryCtx, period: Period) {
  const window = windowOf(period);
  const active = await activeSince(ctx, "ITEM", window.fromAt);
  return await Promise.all(active.map(async (row) => {
    const sums = await sumsOver(ctx, "ITEM", row.key, window.from, window.to);
    return {
      itemKey: row.key,
      title: row.title ?? "",
      fromName: row.fromName ?? "",
      source: sourceOf(row),
      where: row.where ?? "NEWS",
      topic: row.topic ?? null,
      followId: row.followId,
      ...sums,
      readRate: readRate(sums),
    };
  }));
}

// ── Overview (board 7) ─────────────────────────────────────────────────────────

/** Overview: the period's figures and the one before's views, every day of it, the tabs' counts and the top five of each. */
export const analyticsOverview = superAdminQuery({
  args: { period: periodValidator },
  returns: v.object({
    range: rangeValidator,
    figures: v.object({ ...sumsValidator, viewsBefore: v.number(), readers: v.number(), companies: v.number() }),
    days: v.array(dayValidator),
    counts: v.object({ articles: v.number(), people: v.number(), companies: v.number() }),
    top: v.object({
      articles: v.array(itemValidator),
      people: v.array(v.object({ followId: v.id("newsFollows"), name: v.string(), views: v.number(), clicks: v.number() })),
      companies: v.array(v.object({ companyId: v.id("companies"), name: v.string(), readers: v.number(), views: v.number() })),
      users: v.array(v.object({ userId: v.id("users"), name: v.string(), companyName: v.string(), views: v.number() })),
    }),
  }),
  handler: async (ctx, args) => {
    const window = windowOf(args.period);
    const [sums, before, days, items, people, companies, users, follows] = await Promise.all([
      sumsOver(ctx, "ALL", "", window.from, window.to),
      sumsOver(ctx, "ALL", "", window.before.from, window.before.to),
      daysOf(ctx, "ALL", "", window.from, window.to),
      itemsOver(ctx, args.period),
      activeSince(ctx, "PERSON", window.fromAt),
      activeSince(ctx, "COMPANY", window.fromAt),
      activeSince(ctx, "USER", window.fromAt),
      ctx.db.query("newsFollows").take(PEOPLE_MAX),
    ]);
    const topPeople = await Promise.all(people.map(async (row) => {
      const follow = row.followId ? await ctx.db.get(row.followId) : null;
      const counted = await sumsOver(ctx, "PERSON", row.key, window.from, window.to);
      return follow ? { followId: follow._id, name: follow.name, views: counted.views, clicks: counted.clicks } : null;
    }));
    const topCompanies = await Promise.all(companies.map(async (row) => {
      const companyId = row.companyId as Id<"companies">;
      const readers = users.filter((user) => user.companyId === companyId).length;
      const counted = await sumsOver(ctx, "COMPANY", row.key, window.from, window.to);
      return { companyId, name: await companyName(ctx, companyId), readers, views: counted.views };
    }));
    const topUsers = await Promise.all(users.map(async (row) => {
      const counted = await sumsOver(ctx, "USER", row.key, window.from, window.to);
      return { userId: row.userId as Id<"users">, name: personName(row.userId ? await ctx.db.get(row.userId) : null), companyName: await companyName(ctx, row.companyId), views: counted.views };
    }));
    const firstFive = <Row>(rows: Row[], ...values: Array<(row: Row) => number>) =>
      [...rows].sort((left, right) => values.map((value) => value(right) - value(left)).find((difference) => difference !== 0) ?? 0).slice(0, 5);
    return {
      range: { from: window.from, to: window.to, days: window.days },
      figures: { ...sums, viewsBefore: before.views, readers: users.length, companies: companies.length },
      days: days.map(dayRow),
      counts: { articles: items.length, people: follows.length, companies: companies.length },
      top: {
        articles: firstFive(items, (row) => row.reads, (row) => row.views).map(({ followId: _followId, ...row }) => row),
        people: firstFive(topPeople.filter((row) => row !== null), (row) => row.views, (row) => row.clicks),
        companies: firstFive(topCompanies, (row) => row.readers, (row) => row.views),
        users: firstFive(topUsers, (row) => row.views),
      },
    };
  },
});

// ── Articles (boards 8, 9) ────────────────────────────────────────────────────

const ITEM_SORTS = ["title", "views", "reads", "readRate", "clicks", "answers"] as const;
type ItemSort = (typeof ITEM_SORTS)[number];

/** Articles: every article and story read in the period, narrowed and sorted on the server; each row's views by day; the chart's days. */
export const analyticsArticles = superAdminQuery({
  args: {
    period: periodValidator,
    /** OURS, GOOGLE, or one person's id. */
    from: v.optional(v.string()),
    where: v.optional(v.union(v.literal("KNOWLEDGE"), v.literal("NEWS"))),
    topic: v.optional(v.string()),
    sort: v.union(...ITEM_SORTS.map((sort) => v.literal(sort))),
    direction: directionValidator,
    ...pagingArgs,
  },
  returns: v.object({
    range: rangeValidator,
    page: pageValidator(v.object({ ...itemValidator.fields, trend: v.array(v.object({ day: v.string(), views: v.number() })) })),
    days: v.array(dayValidator),
    /** The chart was drawn from the most-viewed only, for its size. */
    daysCut: v.boolean(),
    people: v.array(v.object({ followId: v.id("newsFollows"), name: v.string() })),
  }),
  handler: async (ctx, args) => {
    const window = windowOf(args.period);
    const items = await itemsOver(ctx, args.period);
    const people = new Map<string, string>();
    for (const item of items) if (item.followId && !people.has(item.followId)) people.set(item.followId, item.fromName);
    const narrowed = items.filter((item) =>
      (!args.from || (args.from === "OURS" || args.from === "GOOGLE" ? item.source === args.from : item.followId === args.from))
      && (!args.where || item.where === args.where)
      && (!args.topic || item.topic === args.topic));
    const values: Record<ItemSort, (row: (typeof narrowed)[number]) => SortValue> = {
      title: (row) => row.title, views: (row) => row.views, reads: (row) => row.reads, readRate: (row) => row.readRate, clicks: (row) => row.clicks, answers: (row) => row.answers,
    };
    const sorted = [...narrowed].sort(byValue(values[args.sort], (row) => row.title, args.direction as SortDirection, compareText));
    const page = pageOf(sorted, args.page, args.rows, args.all);

    // The chart: everything's own days, or the narrowed items' added up, the most-viewed first, within a budget.
    let days = (await daysOf(ctx, "ALL", "", window.from, window.to)).map(dayRow);
    let daysCut = false;
    if (args.from || args.where || args.topic) {
      const added = new Map<string, Infer<typeof dayValidator>>();
      let read = 0;
      for (const item of [...narrowed].sort((left, right) => right.views - left.views)) {
        if (read >= NARROWED_SERIES_BUDGET) {
          daysCut = true;
          break;
        }
        const rows = await daysOf(ctx, "ITEM", item.itemKey, window.from, window.to);
        read += rows.length;
        for (const row of rows) {
          const day = added.get(row.day) ?? { day: row.day, views: 0, reads: 0, clicks: 0, answers: 0 };
          day.views += row.views;
          day.reads += row.reads;
          day.clicks += row.clicks;
          day.answers += row.answers;
          added.set(row.day, day);
        }
      }
      days = [...added.values()].sort((left, right) => left.day.localeCompare(right.day));
    }

    return {
      range: { from: window.from, to: window.to, days: window.days },
      page: {
        ...page,
        rows: await Promise.all(page.rows.map(async ({ followId: _followId, ...row }) => ({
          ...row,
          trend: args.all ? [] : (await daysOf(ctx, "ITEM", row.itemKey, window.from, window.to)).map((day) => ({ day: day.day, views: day.views })),
        }))),
      },
      days,
      daysCut,
      people: [...people].map(([followId, name]) => ({ followId: followId as Id<"newsFollows">, name })).sort((left, right) => compareText(left.name, right.name)),
    };
  },
});

/** The article's own record behind an item key, for its page's header. */
async function itemRecord(ctx: QueryCtx, itemKey: string) {
  const [type, id] = itemKey.split(":");
  if (type === "OURS") {
    const articleId = ctx.db.normalizeId("knowledgeArticles", id);
    const article = articleId ? await ctx.db.get(articleId) : null;
    return article ? { url: null, publishedAt: article.publishedAt ?? null, keptAt: article.publishedAt ?? null } : null;
  }
  if (type === "WEB") {
    const articleId = ctx.db.normalizeId("libraryArticles", id);
    const article = articleId ? await ctx.db.get(articleId) : null;
    return article ? { url: article.url, publishedAt: article.publishedOn ? Date.parse(`${article.publishedOn}T00:00:00Z`) : null, keptAt: article.createdAt } : null;
  }
  const itemId = ctx.db.normalizeId("newsItems", id);
  const item = itemId ? await ctx.db.get(itemId) : null;
  return item ? { url: item.url, publishedAt: item.publishedAt, keptAt: null } : null;
}

/** One article or story (board 9): its figures, its days, and the companies that read it. */
export const analyticsArticle = superAdminQuery({
  args: { itemKey: v.string(), period: periodValidator },
  returns: v.union(v.null(), v.object({
    range: rangeValidator,
    item: v.object({
      title: v.string(), fromName: v.string(), where: v.union(v.literal("KNOWLEDGE"), v.literal("NEWS")), topic: v.union(v.string(), v.null()),
      url: v.union(v.string(), v.null()), publishedAt: v.union(v.number(), v.null()), keptAt: v.union(v.number(), v.null()),
    }),
    figures: v.object({ ...sumsValidator, viewsBefore: v.number() }),
    days: v.array(dayValidator),
    companies: v.array(v.object({ companyId: v.id("companies"), name: v.string(), readers: v.number(), views: v.number(), reads: v.number(), clicks: v.number(), lastAt: v.number() })),
    readers: v.number(),
  })),
  handler: async (ctx, args) => {
    const active = await ctx.db.query("readingActive").withIndex("by_scope_key", (q) => q.eq("scope", "ITEM").eq("key", args.itemKey)).unique();
    if (!active) return null;
    const window = windowOf(args.period);
    const [sums, before, days, record, readers] = await Promise.all([
      sumsOver(ctx, "ITEM", args.itemKey, window.from, window.to),
      sumsOver(ctx, "ITEM", args.itemKey, window.before.from, window.before.to),
      daysOf(ctx, "ITEM", args.itemKey, window.from, window.to),
      itemRecord(ctx, args.itemKey),
      ctx.db.query("readingActive").withIndex("by_item_last", (q) => q.eq("itemKey", args.itemKey).gte("lastAt", window.fromAt)).take(ANALYTICS_ACTIVE_MAX),
    ]);
    const byCompany = new Map<Id<"companies">, { readers: number; lastAt: number }>();
    for (const reader of readers) {
      if (!reader.companyId) continue;
      const company = byCompany.get(reader.companyId) ?? { readers: 0, lastAt: 0 };
      company.readers += 1;
      company.lastAt = Math.max(company.lastAt, reader.lastAt);
      byCompany.set(reader.companyId, company);
    }
    const companies = await Promise.all([...byCompany].map(async ([companyId, company]) => {
      const counted = await sumsOver(ctx, "ITEM_COMPANY", `${args.itemKey}|${companyId}`, window.from, window.to);
      return { companyId, name: await companyName(ctx, companyId), readers: company.readers, views: counted.views, reads: counted.reads, clicks: counted.clicks, lastAt: company.lastAt };
    }));
    return {
      range: { from: window.from, to: window.to, days: window.days },
      item: {
        title: active.title ?? "", fromName: active.fromName ?? "", where: active.where ?? "NEWS", topic: active.topic ?? null,
        url: record?.url ?? null, publishedAt: record?.publishedAt ?? null, keptAt: active.where === "KNOWLEDGE" ? record?.keptAt ?? null : null,
      },
      figures: { ...sums, viewsBefore: before.views },
      days: days.map(dayRow),
      companies: companies.sort((left, right) => right.readers - left.readers || right.views - left.views),
      readers: readers.length,
    };
  },
});

// ── People (board 10) ─────────────────────────────────────────────────────────

const PERSON_SORTS = ["name", "articles", "views", "reads", "readRate", "clicks", "answers"] as const;
type PersonSort = (typeof PERSON_SORTS)[number];

/** People: everyone in Who to follow, by how much clients read them in the period. */
export const analyticsPeople = superAdminQuery({
  args: { period: periodValidator, topic: v.optional(v.string()), sort: v.union(...PERSON_SORTS.map((sort) => v.literal(sort))), direction: directionValidator, ...pagingArgs },
  returns: v.object({
    range: rangeValidator,
    page: pageValidator(v.object({
      followId: v.id("newsFollows"), name: v.string(), topic: v.union(v.string(), v.null()), picked: v.boolean(), articles: v.number(),
      ...sumsValidator, readRate: v.union(v.number(), v.null()), trend: v.array(v.object({ day: v.string(), views: v.number() })),
    })),
  }),
  handler: async (ctx, args) => {
    const window = windowOf(args.period);
    const follows = (await ctx.db.query("newsFollows").take(PEOPLE_MAX)).filter((follow) => !args.topic || follow.topic === args.topic);
    const rows = await Promise.all(follows.map(async (follow) => {
      const sums = await sumsOver(ctx, "PERSON", follow._id, window.from, window.to);
      return { followId: follow._id, name: follow.name, topic: follow.topic ?? null, picked: follow.pickedAt !== undefined, articles: follow.collected ?? 0, ...sums, readRate: readRate(sums) };
    }));
    const values: Record<PersonSort, (row: (typeof rows)[number]) => SortValue> = {
      name: (row) => row.name, articles: (row) => row.articles, views: (row) => row.views, reads: (row) => row.reads, readRate: (row) => row.readRate, clicks: (row) => row.clicks, answers: (row) => row.answers,
    };
    const page = pageOf([...rows].sort(byValue(values[args.sort], (row) => row.name, args.direction as SortDirection, compareText)), args.page, args.rows, args.all);
    return {
      range: { from: window.from, to: window.to, days: window.days },
      page: {
        ...page,
        rows: await Promise.all(page.rows.map(async (row) => ({
          ...row,
          trend: args.all ? [] : (await daysOf(ctx, "PERSON", row.followId, window.from, window.to)).map((day) => ({ day: day.day, views: day.views })),
        }))),
      },
    };
  },
});

// ── Companies (boards 11, 12) ─────────────────────────────────────────────────

const COMPANY_SORTS = ["name", "readers", "views", "reads", "clicks", "lastAt"] as const;
type CompanySort = (typeof COMPANY_SORTS)[number];

/** Companies: each client company that read in the period, and readers and companies by day. */
export const analyticsCompanies = superAdminQuery({
  args: { period: periodValidator, sort: v.union(...COMPANY_SORTS.map((sort) => v.literal(sort))), direction: directionValidator, ...pagingArgs },
  returns: v.object({
    range: rangeValidator,
    days: v.array(v.object({ day: v.string(), readers: v.number(), companies: v.number() })),
    readers: v.number(),
    page: pageValidator(v.object({ companyId: v.id("companies"), name: v.string(), readers: v.number(), views: v.number(), reads: v.number(), clicks: v.number(), lastAt: v.number() })),
  }),
  handler: async (ctx, args) => {
    const window = windowOf(args.period);
    const [companies, users, days] = await Promise.all([
      activeSince(ctx, "COMPANY", window.fromAt),
      activeSince(ctx, "USER", window.fromAt),
      daysOf(ctx, "ALL", "", window.from, window.to),
    ]);
    const rows = await Promise.all(companies.map(async (row) => {
      const companyId = row.companyId as Id<"companies">;
      const sums = await sumsOver(ctx, "COMPANY", row.key, window.from, window.to);
      return {
        companyId, name: await companyName(ctx, companyId), readers: users.filter((user) => user.companyId === companyId).length,
        views: sums.views, reads: sums.reads, clicks: sums.clicks, lastAt: row.lastAt,
      };
    }));
    const values: Record<CompanySort, (row: (typeof rows)[number]) => SortValue> = {
      name: (row) => row.name, readers: (row) => row.readers, views: (row) => row.views, reads: (row) => row.reads, clicks: (row) => row.clicks, lastAt: (row) => row.lastAt,
    };
    return {
      range: { from: window.from, to: window.to, days: window.days },
      days: days.map((row) => ({ day: row.day, readers: row.readers ?? 0, companies: row.companies ?? 0 })),
      readers: users.length,
      page: pageOf([...rows].sort(byValue(values[args.sort], (row) => row.name, args.direction as SortDirection, compareText)), args.page, args.rows, args.all),
    };
  },
});

/** One company (board 12): its figures, its days, and each of its people that read, with what they read most. */
export const analyticsCompany = superAdminQuery({
  args: { companyId: v.id("companies"), period: periodValidator },
  returns: v.union(v.null(), v.object({
    range: rangeValidator,
    name: v.string(),
    lastAt: v.union(v.number(), v.null()),
    figures: v.object({ ...sumsValidator, viewsBefore: v.number(), readers: v.number(), people: v.number() }),
    days: v.array(dayValidator),
    people: v.array(v.object({ userId: v.id("users"), name: v.string(), views: v.number(), reads: v.number(), clicks: v.number(), topMost: v.union(v.string(), v.null()), lastAt: v.number() })),
  })),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;
    const window = windowOf(args.period);
    const [sums, before, days, readers, everyone, active, topics] = await Promise.all([
      sumsOver(ctx, "COMPANY", args.companyId, window.from, window.to),
      sumsOver(ctx, "COMPANY", args.companyId, window.before.from, window.before.to),
      daysOf(ctx, "COMPANY", args.companyId, window.from, window.to),
      ctx.db.query("readingActive").withIndex("by_company_scope_last", (q) => q.eq("companyId", args.companyId).eq("scope", "USER").gte("lastAt", window.fromAt)).take(PEOPLE_MAX),
      ctx.db.query("users").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(PEOPLE_MAX),
      ctx.db.query("readingActive").withIndex("by_scope_key", (q) => q.eq("scope", "COMPANY").eq("key", args.companyId)).unique(),
      topicsInOrder(ctx),
    ]);
    const people = await Promise.all(readers.map(async (reader) => {
      const userId = reader.userId as Id<"users">;
      const counted = await sumsOver(ctx, "USER", userId, window.from, window.to);
      // What they read most: the topic with the most reads, then views.
      let topMost: { key: string; reads: number; views: number } | null = null;
      for (const topic of topics) {
        const byTopic = await sumsOver(ctx, "USER_TOPIC", `${userId}|${topic.key}`, window.from, window.to);
        if (byTopic.views > 0 && (!topMost || byTopic.reads > topMost.reads || (byTopic.reads === topMost.reads && byTopic.views > topMost.views))) {
          topMost = { key: topic.key, reads: byTopic.reads, views: byTopic.views };
        }
      }
      return { userId, name: personName(await ctx.db.get(userId)), views: counted.views, reads: counted.reads, clicks: counted.clicks, topMost: topMost?.key ?? null, lastAt: reader.lastAt };
    }));
    return {
      range: { from: window.from, to: window.to, days: window.days },
      name: company.name,
      lastAt: active?.lastAt ?? null,
      figures: { ...sums, viewsBefore: before.views, readers: readers.length, people: everyone.filter((user) => user.role !== "SUPER_ADMIN").length },
      days: days.map(dayRow),
      people: people.sort((left, right) => right.views - left.views || compareText(left.name, right.name)),
    };
  },
});
