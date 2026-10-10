import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedText } from "./utils/contentAdmin";
import { followKindValidator } from "./newsSchema";
import { deleteChannelsOf, insertChannels, syncFollowChannels } from "./followChannels";
import { MAX_CHANNELS, type FollowKind } from "./utils/followChannels";
import { byValue, compareText, type SortDirection, type SortValue } from "./utils/sortOrder";
import { readerFields, removeTranslations, requestTranslation, sourceFields, translationProgress, translationProgressValidator } from "./contentTranslation";
import { checkedTopicKey } from "./topics";
import { kindTopicKey, readInsightsCounts, refreshInsightsCounts, type InsightsCounts } from "./insightsCounts";
import { listPageArgs, listPageResult, pageOfList } from "./siteListPages";
import { knowledgeStateOf, knowledgeStateValidator } from "./newsKnowledge";

/**
 * "Who to follow" (docs/plans/active/knowledge-news-and-digest-plan.md, phase
 * 3): people Anthony recommends, with why — written in English, translated by
 * the Translator — shown in Insights and written in Admin → Content. Since
 * 2026-10-10 each person has channels (`followChannels.ts`) that the News
 * Collector reads (content-people-knowledge-plan.md, C2, C3).
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

/** A person as Admin lists them (board 1). */
const adminListValidator = v.object({
  _id: v.id("newsFollows"),
  name: v.string(),
  whyEn: v.string(),
  /** Every channel's kind, in the order added. */
  channelKinds: v.array(followKindValidator),
  topic: v.union(v.string(), v.null()),
  pickedAt: v.union(v.number(), v.null()),
  /** Items their channels brought into News, how many are in Knowledge, and when the newest was published. */
  collected: v.number(),
  inKnowledge: v.number(),
  newestAt: v.union(v.number(), v.null()),
});

/** A person for their own page and their editing page. */
const adminValidator = v.object({
  _id: v.id("newsFollows"),
  name: v.string(),
  whyEn: v.string(),
  channelKinds: v.array(followKindValidator),
  topic: v.union(v.string(), v.null()),
  pickedAt: v.union(v.number(), v.null()),
  collected: v.number(),
  inKnowledge: v.number(),
  newestAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  translations: translationProgressValidator,
});

/** `topic` left out or blank is none; `picked` left out leaves "Our picks" as it is. Channels are added on their own. */
const followDetails = {
  name: v.string(),
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

function checkedFollow(input: { name: string; whyEn: string }) {
  const name = checkedText(input.name, "A name", MAX_NAME);
  return {
    name,
    nameKey: nameKeyOf(name),
    whyEn: checkedText(input.whyEn, "Why", MAX_WHY),
  };
}

/** Every channel's kind; a person from before channels has their one link's. */
const channelKindsOf = (row: Doc<"newsFollows">): FollowKind[] => row.channelKinds ?? [row.kind];

function adminListRow(row: Doc<"newsFollows">) {
  return {
    _id: row._id,
    name: row.name,
    whyEn: row.whyEn,
    channelKinds: channelKindsOf(row),
    topic: row.topic ?? null,
    pickedAt: row.pickedAt ?? null,
    collected: row.collected ?? 0,
    inKnowledge: row.inKnowledge ?? 0,
    newestAt: row.newestAt ?? null,
  };
}

async function adminRow(ctx: QueryCtx, row: Doc<"newsFollows">) {
  return {
    ...adminListRow(row),
    createdAt: row.createdAt,
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

/** What Admin's list sorts by (board 1): a person A to Z, or by their topic, articles or newest item. */
type AdminSort = "name" | "topic" | "collected" | "inKnowledge" | "newest";
const adminSortValidator = v.union(v.literal("name"), v.literal("topic"), v.literal("collected"), v.literal("inKnowledge"), v.literal("newest"));

const ADMIN_SORT_VALUES: Record<AdminSort, (row: Doc<"newsFollows">) => SortValue> = {
  name: (row) => row.nameKey ?? nameKeyOf(row.name),
  topic: (row) => row.topic ?? null,
  collected: (row) => row.collected ?? 0,
  inKnowledge: (row) => row.inKnowledge ?? 0,
  newest: (row) => row.newestAt ?? null,
};

/**
 * Admin → Content → Who to follow (content-people-knowledge-plan.md, board
 * 1): one page of people, searched, filtered by a channel they have, their
 * topic or "Our picks", and sorted by any heading over the whole list — on
 * the server, which reads at most `MAX_FOLLOWS` (IH21) and counts exactly.
 */
export const listFollowsForAdmin = superAdminQuery({
  args: {
    search: v.optional(v.string()),
    channel: v.optional(followKindValidator),
    topic: v.optional(v.string()),
    picks: v.optional(v.boolean()),
    sort: adminSortValidator,
    direction: v.union(v.literal("asc"), v.literal("desc")),
    ...listPageArgs,
  },
  returns: listPageResult(adminListValidator),
  handler: async (ctx, args) => {
    const read = await followsQuery(ctx, { search: args.search, topic: args.topic }).take(MAX_FOLLOWS);
    const narrowed = read.filter((row) =>
      (!args.channel || channelKindsOf(row).includes(args.channel)) && (!args.picks || row.pickedAt !== undefined));
    const sorted = args.search?.trim()
      ? narrowed
      : [...narrowed].sort(byValue(ADMIN_SORT_VALUES[args.sort], (row) => row.name, args.direction as SortDirection, compareText));
    const page = pageOfList(sorted, args.page, args.rows);
    return { ...page, rows: page.rows.map(adminListRow) };
  },
});

/** One person for their page and their editing page; null when they have gone. */
export const getFollow = superAdminQuery({
  args: { followId: v.id("newsFollows") },
  returns: v.union(v.null(), adminValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.followId);
    return row ? await adminRow(ctx, row) : null;
  },
});

/**
 * Add a person (board 3): their name, why, topic and pick, and their channels —
 * one address each, at least one, at most `MAX_CHANNELS`. Each channel added is
 * collected; LinkedIn is shown in Insights only.
 */
export const createFollow = superAdminMutation({
  args: { ...followDetails, channels: v.array(v.string()) },
  returns: v.id("newsFollows"),
  handler: async (ctx, { channels, ...args }) => {
    const addresses = channels.filter((address) => address.trim());
    if (addresses.length === 0) throw appError("INVALID_INPUT", "Add at least one of their channels.");
    if (addresses.length > MAX_CHANNELS) throw appError("INVALID_INPUT", `A person has at most ${MAX_CHANNELS} channels.`);
    const now = Date.now();
    const topic = await checkedTopicKey(ctx, args.topic);
    // The first channel is filled in by `syncFollowChannels` once the channels are in.
    const followId = await ctx.db.insert("newsFollows", { kind: "WEBSITE", url: "", ...checkedFollow(args), topic, order: now, collected: 0, createdAt: now, updatedAt: now });
    await insertChannels(ctx, followId, addresses);
    await syncFollowChannels(ctx, followId);
    const created = await ctx.db.get(followId);
    if (created && args.picked) await applyPick(ctx, created, true);
    await requestTranslation(ctx, "newsFollows", followId);
    await auditContentChange(ctx, "CREATE_NEWS_FOLLOW", "newsFollows", followId, { name: args.name, channels: addresses.length });
    return followId;
  },
});

/** A person's details (Edit details on their page); their channels are changed on the page itself. */
export const updateFollow = superAdminMutation({
  args: { followId: v.id("newsFollows"), ...followDetails },
  returns: v.null(),
  handler: async (ctx, { followId, ...input }) => {
    const existing = await ctx.db.get(followId);
    if (!existing) throw appError("NOT_FOUND", "That person is no longer here.");
    await ctx.db.patch(followId, { ...checkedFollow(input), topic: await checkedTopicKey(ctx, input.topic), updatedAt: Date.now() });
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
    await deleteChannelsOf(ctx, args.followId);
    await ctx.db.delete(args.followId);
    await removeTranslations(ctx, "newsFollows", args.followId);
    await refreshInsightsCounts(ctx);
    await auditContentChange(ctx, "DELETE_NEWS_FOLLOW", "newsFollows", args.followId, { name: existing.name });
    return null;
  },
});

/** What one of a person's items shows on their page (board 2). */
const followItemValidator = v.object({
  _id: v.id("newsItems"),
  kind: v.union(v.literal("WEBSITE"), v.literal("YOUTUBE"), v.literal("X"), v.literal("GOOGLE_UPDATE")),
  titleEn: v.string(),
  summaryEn: v.string(),
  url: v.string(),
  publishedAt: v.number(),
  /** Its place in Knowledge, beside its In knowledge tick (C4). */
  knowledge: knowledgeStateValidator,
});

/**
 * What a person published (board 2): a page at a time, newest first or
 * oldest first, narrowed to one kind of channel or searched by title — on the
 * server, through the item's own indexes.
 */
export const listFollowItemsForAdmin = superAdminQuery({
  args: {
    followId: v.id("newsFollows"),
    search: v.optional(v.string()),
    channel: v.optional(v.union(v.literal("WEBSITE"), v.literal("YOUTUBE"), v.literal("X"))),
    direction: v.union(v.literal("asc"), v.literal("desc")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(followItemValidator),
  handler: async (ctx, args) => {
    const search = args.search?.trim();
    const { followId, channel } = args;
    const page = search
      ? await ctx.db.query("newsItems").withSearchIndex("search_title", (q) => {
        const found = q.search("titleEn", search).eq("followId", followId);
        return channel ? found.eq("kind", channel) : found;
      }).paginate(args.paginationOpts)
      : await (channel
        ? ctx.db.query("newsItems").withIndex("by_follow_published", (q) => q.eq("followId", followId)).order(args.direction).filter((q) => q.eq(q.field("kind"), channel))
        : ctx.db.query("newsItems").withIndex("by_follow_published", (q) => q.eq("followId", followId)).order(args.direction)
      ).paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map(async (row) => ({
        _id: row._id, kind: row.kind, titleEn: row.titleEn, summaryEn: row.summaryEn, url: row.url, publishedAt: row.publishedAt, knowledge: await knowledgeStateOf(ctx, row),
      }))),
    };
  },
});

/** Everyone in "Who to follow" by name, A to Z: News's From filter (board 4). */
export const listFollowNamesForAdmin = superAdminQuery({
  args: {},
  returns: v.array(v.object({ _id: v.id("newsFollows"), name: v.string() })),
  handler: async (ctx) => (await ctx.db.query("newsFollows").withIndex("by_name").take(MAX_FOLLOWS)).map((row) => ({ _id: row._id, name: row.name })),
});
