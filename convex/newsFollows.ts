import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedText, checkedUrl } from "./utils/contentAdmin";
import { followKindValidator } from "./newsSchema";
import { readerFields, removeTranslations, requestTranslation, sourceFields, translationProgress, translationProgressValidator } from "./contentTranslation";
import { checkedTopicKey } from "./topics";
import { kindTopicKey, readInsightsCounts, refreshInsightsCounts, type InsightsCounts } from "./insightsCounts";
import { listPageArgs, listPageResult } from "./siteListPages";

/**
 * "Who to follow" (docs/plans/active/knowledge-news-and-digest-plan.md, phase
 * 3): people and channels Anthony recommends, with why — written in English,
 * translated by the Translator — shown on the News page and written in Admin
 * → Content. A written list: nothing reads these.
 */

/**
 * How long "Who to follow" may grow: a couple of hundred people is the size it
 * is drawn for (insights-helpful-content-plan.md, IH13), and this is twice
 * that with room to spare. It is paged and counted on the server (IH21); the
 * most any one read takes is this many.
 */
export const MAX_FOLLOWS = 500;
/** "Our picks" (IH13, IH14): at most four, refused here whatever asks. */
export const MAX_PICKS = 4;
const MAX_NAME = 120;
const MAX_WHY = 400;

const readerValidator = v.object({
  _id: v.id("newsFollows"),
  kind: followKindValidator,
  name: v.string(),
  url: v.string(),
  why: v.string(),
  /** A key in the shared topic list (`topics.ts`), or none. */
  topic: v.union(v.string(), v.null()),
  /** When it was picked: picks show in that order; null when it is not one. */
  pickedAt: v.union(v.number(), v.null()),
});

const adminValidator = v.object({
  _id: v.id("newsFollows"),
  kind: followKindValidator,
  name: v.string(),
  url: v.string(),
  whyEn: v.string(),
  topic: v.union(v.string(), v.null()),
  pickedAt: v.union(v.number(), v.null()),
  translations: translationProgressValidator,
});

/** `topic` left out or blank is none; `picked` left out leaves "Our picks" as it is. */
const followInput = {
  kind: followKindValidator,
  name: v.string(),
  url: v.string(),
  whyEn: v.string(),
  topic: v.optional(v.string()),
  picked: v.optional(v.boolean()),
};

/**
 * Puts an entry in "Our picks" or takes it out (IH14). A fifth is refused,
 * naming the four and saying what to do; picks keep the order they were
 * picked in, and stay until changed. Returns whether anything changed.
 */
async function applyPick(ctx: MutationCtx & { userId: Id<"users"> }, row: Doc<"newsFollows">, picked: boolean): Promise<boolean> {
  if (picked === (row.pickedAt !== undefined)) return false;
  if (picked) {
    const picks = await ctx.db.query("newsFollows").withIndex("by_picked", (q) => q.gt("pickedAt", 0)).take(MAX_PICKS + 1);
    if (picks.length >= MAX_PICKS) {
      throw appError("INVALID_INPUT", `${MAX_PICKS} are picked already: ${picks.map((pick) => pick.name).join(", ")}. Untick one of them first.`);
    }
  }
  await ctx.db.patch(row._id, { pickedAt: picked ? Date.now() : undefined });
  await auditContentChange(ctx, picked ? "PICK_NEWS_FOLLOW" : "UNPICK_NEWS_FOLLOW", "newsFollows", row._id, { name: row.name });
  return true;
}

/** The name as the A to Z index keeps it (IH21). */
export const nameKeyOf = (name: string) => name.trim().toLocaleLowerCase("en-GB");

function checkedFollow(input: { name: string; url: string; whyEn: string }) {
  const name = checkedText(input.name, "A name", MAX_NAME);
  return {
    name,
    nameKey: nameKeyOf(name),
    url: checkedUrl(input.url, "The link"),
    whyEn: checkedText(input.whyEn, "Why", MAX_WHY),
  };
}

async function adminRow(ctx: QueryCtx, row: Doc<"newsFollows">) {
  return {
    _id: row._id,
    kind: row.kind,
    name: row.name,
    url: row.url,
    whyEn: row.whyEn,
    topic: row.topic ?? null,
    pickedAt: row.pickedAt ?? null,
    translations: await translationProgress(ctx, "newsFollows", row._id, sourceFields("newsFollows", row)),
  };
}

/** Who to follow's search and filters, narrowed on the server (IH21). Blank is none. */
const followFilters = {
  kind: v.optional(followKindValidator),
  topic: v.optional(v.string()),
  search: v.optional(v.string()),
};
type FollowFilters = { kind?: Doc<"newsFollows">["kind"]; topic?: string; search?: string };

/** The list as a query: searched by name through the search index, or A to Z through the index of its filters. */
function followsQuery(ctx: QueryCtx, args: FollowFilters) {
  const search = args.search?.trim();
  const { kind, topic } = args;
  if (search) {
    return ctx.db.query("newsFollows").withSearchIndex("search_name", (q) => {
      let found = q.search("name", search);
      if (kind) found = found.eq("kind", kind);
      if (topic) found = found.eq("topic", topic);
      return found;
    });
  }
  if (kind && topic) return ctx.db.query("newsFollows").withIndex("by_kind_topic_name", (q) => q.eq("kind", kind).eq("topic", topic));
  if (kind) return ctx.db.query("newsFollows").withIndex("by_kind_name", (q) => q.eq("kind", kind));
  if (topic) return ctx.db.query("newsFollows").withIndex("by_topic_name", (q) => q.eq("topic", topic));
  return ctx.db.query("newsFollows").withIndex("by_name");
}

async function readerRow(ctx: QueryCtx, row: Doc<"newsFollows">, language: string) {
  return {
    _id: row._id,
    kind: row.kind,
    name: row.name,
    url: row.url,
    why: (await readerFields(ctx, "newsFollows", row._id, { why: row.whyEn }, language)).why,
    topic: row.topic ?? null,
    pickedAt: row.pickedAt ?? null,
  };
}

/** The most a page of Who to follow shows: its 25, 50, 75 or 100 (IH13). */
const MAX_PAGE_ROWS = 100;

/**
 * Who to follow in Insights, one numbered page at a time, A to Z under Where
 * and Topic or by a search, in the reader's language (IH13, IH21). The total
 * is exact — kept as the list changes, or what the search found — so the
 * footer shows the last page and any page opens straight away. Only the rows
 * up to the page asked for are read, through the index of its filters, and
 * only its own rows are translated.
 */
export const listFollowsByPage = tenantQuery({
  args: { language: v.string(), ...followFilters, ...listPageArgs },
  returns: listPageResult(readerValidator),
  handler: async (ctx, args) => {
    const size = Math.min(Math.max(1, Math.floor(args.rows) || 1), MAX_PAGE_ROWS);
    const searched = Boolean(args.search?.trim());
    const found = searched ? await followsQuery(ctx, args).take(MAX_FOLLOWS) : null;
    const total = found ? found.length : followTotal((await readInsightsCounts(ctx)).follows, args);
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(Math.max(1, Math.floor(args.page) || 1), pages);
    const upTo = found ?? await followsQuery(ctx, args).take(Math.min(page * size, MAX_FOLLOWS));
    const rows = upTo.slice((page - 1) * size, page * size);
    return {
      rows: await Promise.all(rows.map((row) => readerRow(ctx, row, args.language))),
      total,
      page,
      pages,
      size,
      cut: null,
      preparing: false,
    };
  },
});

/** How many are under Where and Topic, from the counts kept as the list changes. */
function followTotal(follows: InsightsCounts["follows"], { kind, topic }: FollowFilters): number {
  if (kind && topic) return follows.byKindTopic[kindTopicKey(kind, topic)] ?? 0;
  if (kind) return follows.byKind[kind] ?? 0;
  if (topic) return follows.byTopic[topic] ?? 0;
  return follows.all;
}

/** "Our picks" for Insights, in the order they were picked: four at most, through their own index (IH13). */
export const listPicks = tenantQuery({
  args: { language: v.string() },
  returns: v.array(readerValidator),
  handler: async (ctx, args) => {
    const picks = await ctx.db.query("newsFollows").withIndex("by_picked", (q) => q.gt("pickedAt", 0)).take(MAX_PICKS);
    return await Promise.all(picks.map((row) => readerRow(ctx, row, args.language)));
  },
});

/** Who to follow's totals — everyone, by Where, by Topic and by both — as kept when the list changes (IH21): exact page counts. */
export const getFollowTotals = tenantQuery({
  args: {},
  returns: v.object({ all: v.number(), byKind: v.record(v.string(), v.number()), byTopic: v.record(v.string(), v.number()), byKindTopic: v.record(v.string(), v.number()) }),
  handler: async (ctx) => (await readInsightsCounts(ctx)).follows,
});

/** Admin → Content → Who to follow: a page at a time, searched and filtered on the server, or only the picks (IH14, IH21). */
export const listFollowsForAdminPage = superAdminQuery({
  args: { ...followFilters, picks: v.optional(v.boolean()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(adminValidator),
  handler: async (ctx, args) => {
    const page = args.picks
      ? await ctx.db.query("newsFollows").withIndex("by_picked", (q) => q.gt("pickedAt", 0)).paginate(args.paginationOpts)
      : await followsQuery(ctx, args).paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((row) => adminRow(ctx, row))) };
  },
});

/** One entry for its editing page; null when it has gone. */
export const getFollow = superAdminQuery({
  args: { followId: v.id("newsFollows") },
  returns: v.union(v.null(), adminValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.followId);
    return row ? await adminRow(ctx, row) : null;
  },
});

export const createFollow = superAdminMutation({
  args: followInput,
  returns: v.id("newsFollows"),
  handler: async (ctx, args) => {
    const now = Date.now();
    // New entries go last.
    const topic = await checkedTopicKey(ctx, args.topic);
    const followId = await ctx.db.insert("newsFollows", { kind: args.kind, ...checkedFollow(args), topic, order: now, createdAt: now, updatedAt: now });
    const created = await ctx.db.get(followId);
    if (created && args.picked) await applyPick(ctx, created, true);
    await refreshInsightsCounts(ctx);
    await requestTranslation(ctx, "newsFollows", followId);
    await auditContentChange(ctx, "CREATE_NEWS_FOLLOW", "newsFollows", followId, { name: args.name });
    return followId;
  },
});

export const updateFollow = superAdminMutation({
  args: { followId: v.id("newsFollows"), ...followInput },
  returns: v.null(),
  handler: async (ctx, { followId, ...input }) => {
    const existing = await ctx.db.get(followId);
    if (!existing) throw appError("NOT_FOUND", "That entry is no longer here.");
    await ctx.db.patch(followId, { kind: input.kind, ...checkedFollow(input), topic: await checkedTopicKey(ctx, input.topic), updatedAt: Date.now() });
    if (input.picked !== undefined) await applyPick(ctx, existing, input.picked);
    await refreshInsightsCounts(ctx);
    await requestTranslation(ctx, "newsFollows", followId);
    await auditContentChange(ctx, "UPDATE_NEWS_FOLLOW", "newsFollows", followId, { name: input.name });
    return null;
  },
});

/** The list's "Our pick" tick (IH14): one entry in or out of the picks. */
export const setFollowPick = superAdminMutation({
  args: { followId: v.id("newsFollows"), picked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.followId);
    if (!existing) throw appError("NOT_FOUND", "That entry is no longer here.");
    if (await applyPick(ctx, existing, args.picked)) await ctx.db.patch(args.followId, { updatedAt: Date.now() });
    return null;
  },
});

/** "Our picks" by name, in the order picked: what an entry's page says when four are picked already. */
export const listPicksForAdmin = superAdminQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("newsFollows"), name: v.string() })),
  handler: async (ctx) => {
    const picks = await ctx.db.query("newsFollows").withIndex("by_picked", (q) => q.gt("pickedAt", 0)).take(MAX_PICKS);
    return picks.map((pick) => ({ _id: pick._id, name: pick.name }));
  },
});

export const deleteFollow = superAdminMutation({
  args: { followId: v.id("newsFollows") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.followId);
    if (!existing) return null;
    await ctx.db.delete(args.followId);
    await removeTranslations(ctx, "newsFollows", args.followId);
    await refreshInsightsCounts(ctx);
    await auditContentChange(ctx, "DELETE_NEWS_FOLLOW", "newsFollows", args.followId, { name: existing.name });
    return null;
  },
});
