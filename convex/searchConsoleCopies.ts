import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tenantAction, tenantMutation, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { requireMySite } from "./siteAccess";
import { isTrackedHold } from "./utils/websitePairing";
import { claimSchedule } from "./siteRankings";
import { dropCopies, readListCopy, writeListCopy } from "./siteListCopies";
import { listOrder, listPageArgs, pageOfList, preparingPage, sortDirectionArg, type ListSorts } from "./siteListPages";
import { wordStartMatcher } from "./utils/wordStarts";
import { dimensionValidator, searchTypeValidator, type SearchConsoleDimension, type SearchType } from "./searchConsoleSchema";
import { checkedRange } from "./searchConsoleReads";
import { periodBefore } from "./searchConsoleDays";

/**
 * The Search Console tables' lists (docs/plans/active/search-console-plan.md
 * §4.3): every search, page, country, device or search appearance a website
 * was shown for in the dates chosen, its days added up — clicks and
 * impressions summed, position averaged over every time it was shown — and
 * its clicks in the same number of days before.
 *
 * A big site holds thousands of searches a day, far more rows than one read
 * can add up, so each list is worked out once into a compact copy — the same
 * copies the Sites tables read (`siteListCopies.ts`) — and every page of the
 * table, its exact total, its search and its order come from that copy. A
 * copy is built the first time a table asks for its dates, and built again
 * when Google's next day has landed; meanwhile the table shows the last one.
 */

/** The layout of a copy's rows. A copy in any other is as good as none. */
const COPY_FIELDS = ["key", "clicks", "impressions", "position", "previousClicks"] as const;

/** Rows a copy keeps, the most clicks first: more than a page could ever need searching. */
const COPY_ROWS = 25_000;

/** Rows a short list sends whole: countries and devices never come near it. */
const SPLIT_ROWS = 500;

/** Rows read per request while adding a list up. */
const ROWS_PER_READ = 4_000;

/** Copies not built for this long are removed as a new one lands: dates nobody has asked for since. */
const COPY_KEPT_MS = 2 * 24 * 60 * 60 * 1000;

/** How long a build waits for another of the same list to finish. */
const TURN_WAIT_MS = 30_000;

type CopyRow = [string, number, number, number, number | null];

function copyKey(args: { companyWebsiteId: Id<"companyWebsites">; searchType: SearchType; dimension: SearchConsoleDimension; from: string; to: string }) {
  return `${args.companyWebsiteId}:${args.searchType}:${args.dimension}:${args.from}:${args.to}`;
}

const copyTurn = (key: string) => `copy:gsc:${key}`;

async function connectionOf(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">) {
  return await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .first();
}

/** Whether a copy is of what is held now: the same property, and Google's newest day since. */
function isCurrent(meta: Record<string, string | number | null>, connection: { newestDay?: string; dataProperty?: string }) {
  return meta.newestDay === (connection.newestDay ?? null) && meta.property === (connection.dataProperty ?? null);
}

// ---------------------------------------------------------------------------
// Reading a list
// ---------------------------------------------------------------------------

type Row = { key: string; clicks: number; impressions: number; ctr: number; position: number; previousClicks: number | null; change: number | null; share: number };

const rowValidator = v.object({
  key: v.string(),
  clicks: v.number(),
  impressions: v.number(),
  ctr: v.number(),
  position: v.number(),
  /** Its clicks in the days before; null when it had none there — or those days are not held. */
  previousClicks: v.union(v.number(), v.null()),
  /** Clicks gained or lost on the days before; null when those days are not held. */
  change: v.union(v.number(), v.null()),
  /** Its share of every named row's clicks. */
  share: v.number(),
});

const SORTS: ListSorts<Row, "key" | "clicks" | "change" | "impressions" | "ctr" | "position" | "share"> = {
  key: { value: (row) => row.key, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
  share: { value: (row) => row.share, first: "desc" },
};

const sortValidator = v.optional(v.union(
  v.literal("key"), v.literal("clicks"), v.literal("change"), v.literal("impressions"), v.literal("ctr"), v.literal("position"), v.literal("share"),
));

type ListArgs = {
  searchType: SearchType;
  dimension: SearchConsoleDimension;
  from: string;
  to: string;
  q?: string;
  sort?: keyof typeof SORTS;
  direction?: "asc" | "desc";
};

/**
 * A list's rows from its copy, searched by the start of any word and ordered
 * over the whole of it by the heading asked for; with whether the copy is of
 * what is held now, the clicks of every row it holds, and whether the days
 * before are held for the change. Null while there is no copy yet.
 */
async function listRows(ctx: { db: QueryCtx["db"] }, companyWebsiteId: Id<"companyWebsites">, args: ListArgs) {
  const connection = await connectionOf(ctx, companyWebsiteId);
  if (!connection?.newestDay) return { held: false as const };
  const copy = await readListCopy(ctx as QueryCtx, "gsc", copyKey({ ...args, companyWebsiteId }), COPY_FIELDS);
  if (!copy) return { held: true as const, copy: null };
  const comparable = copy.meta.comparable === "yes";
  const named = typeof copy.meta.clicks === "number" ? copy.meta.clicks : null;
  const matches = wordStartMatcher(args.q?.trim().toLowerCase());
  const rows: Row[] = (copy.rows as CopyRow[])
    .filter((row) => !matches || matches(row[0]))
    .map(([key, clicks, impressions, position, previousClicks]) => ({
      key,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position,
      previousClicks: comparable ? previousClicks : null,
      change: comparable ? clicks - (previousClicks ?? 0) : null,
      share: named ? clicks / named : 0,
    }));
  rows.sort(listOrder(SORTS, args.sort ?? "clicks", args.direction, (row) => row.key));
  return { held: true as const, copy: { rows, cut: copy.cut, current: isCurrent(copy.meta, connection), named, comparable } };
}

const listArgs = {
  siteId: v.id("companyWebsites"),
  searchType: searchTypeValidator,
  dimension: dimensionValidator,
  from: v.string(),
  to: v.string(),
  q: v.optional(v.string()),
  sort: sortValidator,
  direction: sortDirectionArg,
};

/**
 * One page of a list, counted exactly (the Searches and Pages tables).
 * `preparing` while its copy is first being built; `current` false while an
 * older copy stands in for one being built again; `named` is the clicks of
 * every row the list holds, which the Searches page sets beside the site's
 * total clicks.
 */
export const searchConsoleListPage = tenantQuery({
  args: { ...listArgs, ...listPageArgs },
  returns: v.object({
    rows: v.array(rowValidator),
    total: v.number(),
    page: v.number(),
    pages: v.number(),
    size: v.number(),
    cut: v.union(v.number(), v.null()),
    preparing: v.boolean(),
    current: v.boolean(),
    named: v.union(v.number(), v.null()),
    comparable: v.boolean(),
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const list = await listRows(ctx, site.hold._id, args);
    if (!list.held) return { ...preparingPage(args.rows), preparing: false, current: true, named: null, comparable: false };
    if (!list.copy) return { ...preparingPage(args.rows), current: false, named: null, comparable: false };
    const { rows, cut, ...facts } = list.copy;
    return { ...pageOfList(rows, args.page, args.rows, cut), ...facts };
  },
});

/** A short list whole — the countries, the devices — for a page holding two tables to page in the browser. */
export const searchConsoleSplitList = tenantQuery({
  args: listArgs,
  returns: v.object({
    rows: v.array(rowValidator),
    preparing: v.boolean(),
    current: v.boolean(),
    named: v.union(v.number(), v.null()),
    comparable: v.boolean(),
  }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const list = await listRows(ctx, site.hold._id, args);
    if (!list.held) return { rows: [], preparing: false, current: true, named: null, comparable: false };
    if (!list.copy) return { rows: [], preparing: true, current: false, named: null, comparable: false };
    return { rows: list.copy.rows.slice(0, SPLIT_ROWS), preparing: false, current: list.copy.current, named: list.copy.named, comparable: list.copy.comparable };
  },
});

/** Whether a list's copy is there, and of what is held now: a table asks for one to be built when either is not. */
export const searchConsoleCopyStatus = tenantQuery({
  args: { siteId: v.id("companyWebsites"), searchType: searchTypeValidator, dimension: dimensionValidator, from: v.string(), to: v.string() },
  returns: v.object({ held: v.boolean(), exists: v.boolean(), current: v.boolean() }),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOf(ctx, site.hold._id);
    if (!connection?.newestDay) return { held: false, exists: false, current: false };
    const header = await ctx.db
      .query("siteListCopies")
      .withIndex("by_kind_key", (q) => q.eq("kind", "gsc").eq("key", copyKey({ ...args, companyWebsiteId: site.hold._id })))
      .unique();
    const exists = header !== null && header.fields.join("\u0000") === COPY_FIELDS.join("\u0000");
    return { held: true, exists, current: exists && isCurrent(header.meta, connection) };
  },
});

/** Every row of a list in the order on screen, for its download: only a hold of the caller's company. */
export const exportRows = internalQuery({
  args: { ...listArgs, companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.siteId);
    if (!hold || hold.companyId !== args.companyId) return null;
    const website = await ctx.db.get(hold.websiteId);
    const list = await listRows(ctx, hold._id, args);
    return { host: website?.displayHost ?? "site", rows: list.held && list.copy ? list.copy.rows : [], cut: list.held && list.copy ? list.copy.cut : null };
  },
});

/** A cell of a download: quoted where needed, and never read as a formula by a spreadsheet. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A list whole, as CSV, built here and returned for the page to save — in the
 * order and with the search on screen. `headers` are the page's own words for
 * its columns, in the reader's language.
 */
export const exportSearchConsoleList = tenantAction({
  args: { ...listArgs, headers: v.array(v.string()) },
  returns: v.object({ fileName: v.string(), csv: v.string(), rows: v.number(), cut: v.union(v.number(), v.null()) }),
  handler: async (ctx, args): Promise<{ fileName: string; csv: string; rows: number; cut: number | null }> => {
    checkedRange(args.from, args.to);
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const { headers, ...list } = args;
    const found = await ctx.runQuery(internal.searchConsoleCopies.exportRows, { ...list, companyId });
    if (!found) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const lines = found.rows.map((row) => [
      row.key,
      row.clicks,
      row.change,
      row.impressions,
      Math.round(row.ctr * 10_000) / 100,
      Math.round(row.position * 10) / 10,
    ].map(cell).join(","));
    return {
      fileName: `${found.host}-search-console-${args.dimension}-${args.from}-${args.to}.csv`,
      csv: [headers.map(cell).join(","), ...lines].join("\n"),
      rows: lines.length,
      cut: found.cut,
    };
  },
});

// ---------------------------------------------------------------------------
// Building a list
// ---------------------------------------------------------------------------

/**
 * Ask for a list's copy when a table finds it missing or behind: built once
 * however many readers ask, and left alone when it is current.
 */
export const ensureSearchConsoleCopy = tenantMutation({
  args: {
    siteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: dimensionValidator,
    from: v.string(),
    to: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    checkedRange(args.from, args.to);
    const site = await requireMySite(ctx, args.siteId);
    if (isTrackedHold(site.hold)) return null;
    const connection = await connectionOf(ctx, site.hold._id);
    if (!connection?.newestDay || connection.clearing) return null;
    const build = { companyWebsiteId: site.hold._id, searchType: args.searchType, dimension: args.dimension, from: args.from, to: args.to };
    const key = copyKey(build);
    const header = await ctx.db
      .query("siteListCopies")
      .withIndex("by_kind_key", (q) => q.eq("kind", "gsc").eq("key", key))
      .unique();
    if (header && header.fields.join("\u0000") === COPY_FIELDS.join("\u0000") && isCurrent(header.meta, connection)) return null;
    if (await claimSchedule(ctx, copyTurn(key))) {
      await ctx.scheduler.runAfter(0, internal.searchConsoleCopies.buildSearchConsoleCopy, build);
    }
    return null;
  },
});

/** What a build needs to know of the connection, or null when there is nothing to build from. */
export const copyState = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  handler: async (ctx, args) => {
    const connection = await connectionOf(ctx, args.companyWebsiteId);
    if (!connection?.newestDay || !connection.dataProperty || connection.clearing) return null;
    return { newestDay: connection.newestDay, oldestDay: connection.oldestDay ?? connection.newestDay, property: connection.dataProperty };
  },
});

/** A page of one split's rows in a range, as tuples. */
export const rowsInRange = internalQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: dimensionValidator,
    from: v.string(),
    to: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("searchConsoleRows")
      .withIndex("by_hold_type_dimension_day", (q) => q
        .eq("companyWebsiteId", args.companyWebsiteId)
        .eq("searchType", args.searchType)
        .eq("dimension", args.dimension)
        .gte("day", args.from)
        .lte("day", args.to))
      .paginate({ numItems: ROWS_PER_READ, cursor: args.cursor });
    return {
      rows: page.page.map((row) => [row.key, row.clicks, row.impressions, row.position] as [string, number, number, number]),
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

/** Remove one copy, a few parts at a time; answers whether any remains. */
export const dropCopyStep = internalMutation({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => await dropCopies(ctx, "gsc", args.key),
});

/** A hold's copies not built for two days, but for the one just written. */
export const staleCopies = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), keep: v.string() },
  handler: async (ctx, args) => {
    const prefix = `${args.companyWebsiteId}:`;
    const headers = await ctx.db
      .query("siteListCopies")
      .withIndex("by_kind_key", (q) => q.eq("kind", "gsc").gte("key", prefix).lt("key", `${prefix}￿`))
      .take(200);
    const before = Date.now() - COPY_KEPT_MS;
    return headers.filter((header) => header.key !== args.keep && header.builtAt < before).map((header) => header.key);
  },
});

/**
 * Add a list up for its dates and write its copy: every row of the range,
 * a page of rows at a time; the days before, when they are held, for each
 * row's change; the most clicks first, held to what a copy keeps.
 */
export const buildSearchConsoleCopy = internalAction({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchType: searchTypeValidator,
    dimension: dimensionValidator,
    from: v.string(),
    to: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = copyKey(args);
    const turn = copyTurn(key);
    if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key: turn }))) {
      await ctx.scheduler.runAfter(TURN_WAIT_MS, internal.searchConsoleCopies.buildSearchConsoleCopy, args);
      return null;
    }
    try {
      const state = await ctx.runQuery(internal.searchConsoleCopies.copyState, { companyWebsiteId: args.companyWebsiteId });
      if (!state) return null;
      const addUp = async (from: string, to: string) => {
        const sums = new Map<string, { clicks: number; impressions: number; weighted: number }>();
        for (let cursor: string | null = null, first = true; first || cursor !== null; first = false) {
          const page: { rows: Array<[string, number, number, number]>; cursor: string | null } = await ctx.runQuery(
            internal.searchConsoleCopies.rowsInRange,
            { ...args, from, to, cursor },
          );
          for (const [rowKey, clicks, impressions, position] of page.rows) {
            const sum = sums.get(rowKey) ?? { clicks: 0, impressions: 0, weighted: 0 };
            sum.clicks += clicks;
            sum.impressions += impressions;
            sum.weighted += position * impressions;
            sums.set(rowKey, sum);
          }
          cursor = page.cursor;
        }
        return sums;
      };
      const current = await addUp(args.from, args.to);
      const before = periodBefore(args.from, args.to);
      // The change needs the days before, all of them: a part would read as losses.
      const comparable = state.oldestDay <= before.from;
      const previous = comparable ? await addUp(before.from, before.to) : new Map<string, { clicks: number }>();
      let clicks = 0;
      let impressions = 0;
      const rows: CopyRow[] = [...current].map(([rowKey, sum]) => {
        clicks += sum.clicks;
        impressions += sum.impressions;
        const position = sum.impressions > 0 ? Math.round((sum.weighted / sum.impressions) * 100) / 100 : 0;
        return [rowKey, sum.clicks, sum.impressions, position, previous.get(rowKey)?.clicks ?? null];
      });
      rows.sort((left, right) => right[1] - left[1] || right[2] - left[2] || left[0].localeCompare(right[0]));
      await writeListCopy(ctx, {
        kind: "gsc",
        key,
        fields: COPY_FIELDS,
        rows: rows.slice(0, COPY_ROWS),
        cut: rows.length > COPY_ROWS ? COPY_ROWS : null,
        meta: {
          from: args.from,
          to: args.to,
          newestDay: state.newestDay,
          property: state.property,
          clicks,
          impressions,
          comparable: comparable ? "yes" : "no",
        },
      });
      // Dates nobody has asked for in two days go.
      const stale: string[] = await ctx.runQuery(internal.searchConsoleCopies.staleCopies, { companyWebsiteId: args.companyWebsiteId, keep: key });
      for (const staleKey of stale) {
        while (await ctx.runMutation(internal.searchConsoleCopies.dropCopyStep, { key: staleKey })) {
          // A few parts a step; the next takes the rest.
        }
      }
    } finally {
      await ctx.runMutation(internal.siteSummaries.endRebuild, { key: turn });
    }
    return null;
  },
});

/**
 * Remove a hold's copies a batch at a time — its figures cleared for another
 * property, or the website no longer held. Answers whether any remain.
 */
export async function dropHoldCopies(ctx: Parameters<typeof dropCopies>[0], companyWebsiteId: Id<"companyWebsites">): Promise<boolean> {
  return await dropCopies(ctx, "gsc", `${companyWebsiteId}:`);
}
