import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readSiteDataLimits, type CompanyDataLimits } from "./companyDataLimits";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { BACKLINK_LIST_OPERATION_ID } from "./dataForSeoLinkOperations";
import { findSeoOperation, seoSiteOperationParams } from "./dataForSeoRegistry";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { runDayOf } from "./seoRunDay";
import { DEFAULT_LOCATION_CODE } from "./utils/seoLocations";
import { readSentLocationCode } from "./utils/seoSentPlace";

/**
 * The lists bought a thousand rows a request, in as many requests as a
 * website's limit allows (`companyDataLimits.ts`): every keyword a site ranks
 * for (`dataForSeoKeywordListOperations.ts`) and every link to it
 * (`backlinks_all` in `dataForSeoLinkOperations.ts`). Anthony, 2026-09-24:
 * "store whatever we can please".
 *
 * **A limit means what it says** (docs/plans/active/
 * sites-data-completeness-plan.md, B1). The keyword list's rows are not all
 * searches: a search can come back as the normal result and again as an AI
 * Overview mention, a featured snippet or a map result, so 1,000 rows held
 * 629 of one site's searches. Its limits — "Keywords kept" and "Keywords
 * checked every run" — are counted in searches: a run buys pages until the
 * searches it holds reach the limit, or the list ends. The links list counts
 * links, one a row.
 *
 * **Sized from the last list.** How many rows a number of searches takes is
 * read from the site's last list, page by page (`rowsForSearches`); a site
 * never listed gets its first page alone. Whatever the estimate, each page's
 * answer says how far the list really went, and the next page is asked for
 * then, if the searches held are still short (`queueListPages`).
 *
 * **One list, however many requests.** Every page of a list is dated by the
 * day its collection was planned (`listPageOf`), not the day each page was
 * answered, so a list whose second page lands a day after its first is still
 * one list.
 *
 * **The first pages every run, the rest weekly.** A site's everyday check is
 * the keyword list's first pages, bought on every run; the whole list follows
 * its own weekly cadence. A page carries how far its run meant to buy
 * (`listReach`, in the list's own unit), so a first page bought for the
 * everyday check never queues the rest of the list.
 */

/** The most rows DataForSEO returns in one request of either list. */
export const LIST_PAGE = 1_000;

/** Day summaries read for a site's latest count. */
export const LIST_COUNT_DAYS = 31;

/**
 * How many more rows than the estimate a page asks for: rows are charged as
 * returned, so a little over costs a little, and a little under costs a
 * whole extra request.
 */
const ROWS_MARGIN = 1.1;

/** Rows a search takes when nothing says otherwise: most searches come back once. */
const ROWS_PER_SEARCH_UNKNOWN = 1.3;

export type PagedList = {
  /** Which of the website's limits sets how long its list is. */
  limit: "keywordsPerSite" | "backlinksPerSite";
  /** A limit at or under this is covered by an everyday call, and needs no list. */
  coveredUpTo: number;
  /** The day-summary figure that says how long the site's list is; none when no figure does. */
  count: "rankedKeywordsTotal" | "backlinks" | "referringDomains" | "referringMainDomains" | "brokenBacklinks" | null;
  /** Which limit says how much of the list every run buys, rather than every week; none for a list bought weekly. */
  everyRun?: "everydayKeywords";
  /** What the limit counts: the searches a list's rows hold, or its rows. */
  unit: "searches" | "rows";
  /**
   * Never fewer rows than this, whatever the limit: the link lists bought a
   * thousand a request before they were paged keep at least that many.
   */
  floor?: number;
  /** The first page is asked for as the list was before it was paged, so an answer bought then still holds it. */
  firstAsBefore?: boolean;
};

/**
 * The link lists bought a thousand rows a request until 2026-09-27, whatever
 * "Backlinks kept" said, are now paged up to it — and never fewer than the
 * thousand they always had (sites-data-completeness-plan.md, B2).
 */
const LINK_LIST = { limit: "backlinksPerSite", coveredUpTo: 0, unit: "rows", floor: 1_000, firstAsBefore: true } as const;

const PAGED_LISTS = new Map<string, PagedList>([
  // The everyday ranked-keywords call files a site's first hundred searches;
  // past them, the everyday check is the list's first pages.
  [KEYWORD_LIST_OPERATION_ID, { limit: "keywordsPerSite", coveredUpTo: 100, count: "rankedKeywordsTotal", everyRun: "everydayKeywords", unit: "searches" }],
  // The everyday backlinks list is one link per linking website, never every link.
  [BACKLINK_LIST_OPERATION_ID, { limit: "backlinksPerSite", coveredUpTo: 0, count: "backlinks", unit: "rows" }],
  ["backlinks_list", { ...LINK_LIST, count: "referringDomains" }],
  ["backlinks_broken", { ...LINK_LIST, count: "brokenBacklinks" }],
  ["referring_domains_list", { ...LINK_LIST, count: "referringMainDomains" }],
  ["anchors_list", { ...LINK_LIST, count: null }],
  ["referring_ips_list", { ...LINK_LIST, count: null }],
]);

/** How far a site's list goes: its limit, and never under the list's floor. */
export function listLimitOf(list: PagedList, limits: CompanyDataLimits): number {
  return Math.max(list.floor ?? 0, limits[list.limit]);
}

/**
 * How much of a list every run buys, in the list's unit: the site's everyday
 * check, never more than it keeps — nothing for a list bought weekly, or when
 * the everyday call already brings that many.
 */
export function everyRunReach(list: PagedList, limits: CompanyDataLimits): number {
  if (!list.everyRun) return 0;
  const reach = Math.min(limits[list.everyRun], limits[list.limit]);
  return reach > list.coveredUpTo ? reach : 0;
}

/** Whether a run's every-run pages already bring this page of the week's list. */
export function coveredByPages(pages: ReadonlyArray<{ offset: number; limit: number }>, page: { offset: number; limit: number }): boolean {
  return pages.some((held) => held.offset === page.offset && held.limit >= page.limit);
}

/** The list an operation buys a page of, or null for an operation bought whole. */
export function pagedListOf(operationId: string): PagedList | null {
  return PAGED_LISTS.get(operationId) ?? null;
}

export function isPagedListOperation(operationId: string): boolean {
  return PAGED_LISTS.has(operationId);
}

/**
 * The requests that bring a list's first `rows` rows: a thousand each, the
 * last only what is left.
 */
export function pagesForRows(rows: number): Array<{ offset: number; limit: number }> {
  const pages: Array<{ offset: number; limit: number }> = [];
  for (let offset = 0; offset < rows; offset += LIST_PAGE) {
    pages.push({ offset, limit: Math.min(LIST_PAGE, rows - offset) });
  }
  return pages;
}

/** One page of a list as filed: where it started, what it asked for and brought, and the searches among its rows. */
export type ListSegment = { offset: number; limit: number; rows: number; searches: number };

/** What the site's last list said of itself, for sizing the next one. */
export type ListShape = {
  /** The last list's pages, from its first row on, as far as they joined up. */
  segments: ListSegment[];
  /** Rows in the whole list, every kind; null when never said. */
  totalRows: number | null;
  /** Searches the site ranks for, as the supplier counts them; null when never said. */
  totalSearches: number | null;
};

/** The pages of one list day that join up from the first row, in order, the longest where two start at one row. */
export function joinedSegments(pages: ReadonlyArray<ListSegment>): ListSegment[] {
  const byOffset = new Map<number, ListSegment>();
  for (const page of pages) {
    const held = byOffset.get(page.offset);
    if (!held || page.limit > held.limit) byOffset.set(page.offset, page);
  }
  const joined: ListSegment[] = [];
  for (let offset = 0; byOffset.has(offset);) {
    const page = byOffset.get(offset)!;
    joined.push(page);
    // A page that came back short is the end of the list.
    if (page.rows < page.limit || page.limit <= 0) break;
    offset += page.limit;
  }
  return joined;
}

/**
 * How many rows of a list bring a number of its searches, from the last
 * list's pages: through the page where its searches reach the number, in
 * proportion within it, with a little over. Past what the last list held,
 * at its own rows per search. `ends` when the list is expected to end within
 * those rows. Null when nothing is known of the site's list.
 */
export function sizeForSearches(searches: number, shape: ListShape): { rows: number; ends: boolean } | null {
  if (searches <= 0) return { rows: 0, ends: false };
  const size = (rows: number, ends = false) => {
    const whole = shape.totalRows !== null && rows >= shape.totalRows;
    return { rows: Math.max(1, Math.ceil(whole ? shape.totalRows! : rows)), ends: ends || whole };
  };
  let held = 0;
  let rows = 0;
  for (const segment of shape.segments) {
    if (segment.searches > 0 && held + segment.searches >= searches) {
      return size((segment.offset + (segment.rows * (searches - held)) / segment.searches) * ROWS_MARGIN);
    }
    held += segment.searches;
    rows = segment.offset + segment.rows;
  }
  if (shape.segments.length > 0) {
    // Short of the number when the last list ended: the whole list, if it did.
    const last = shape.segments[shape.segments.length - 1];
    if (last.rows < last.limit) return size(rows, true);
    const perSearch = held > 0 ? rows / held : ROWS_PER_SEARCH_UNKNOWN;
    return size((rows + (searches - held) * perSearch) * ROWS_MARGIN);
  }
  if (shape.totalSearches !== null && shape.totalSearches > 0) {
    // Only the supplier's totals: in proportion when both are known; with the
    // searches alone, at least a row each — never more than the list can hold.
    if (shape.totalRows !== null) return size(Math.min(searches, shape.totalSearches) * (shape.totalRows / shape.totalSearches) * ROWS_MARGIN);
    return size(Math.min(searches, shape.totalSearches), searches >= shape.totalSearches);
  }
  return null;
}

/** How many rows of a list bring a number of its searches (`sizeForSearches`), or null when nothing is known. */
export function rowsForSearches(searches: number, shape: ListShape): number | null {
  return sizeForSearches(searches, shape)?.rows ?? null;
}

/**
 * The pages a run buys for so many of a list's units: every row it keeps, for
 * a list counted in rows; for searches, the rows the last list says they
 * take — or, for a site never listed, its first page alone. Where the list is
 * expected to end within its last page, that page asks for all of it: rows
 * are charged as returned, so the rest costs nothing, and a site that has
 * grown since still comes back whole.
 */
export function listPagesFor(list: PagedList, reach: number, shape: ListShape): Array<{ offset: number; limit: number }> {
  if (reach <= 0) return [];
  if (list.unit === "rows") {
    // As many pages as the site's count says, each asking a full page within
    // the limit: rows are charged as returned.
    const known = shape.totalRows;
    const rows = known === null ? Math.min(reach, LIST_PAGE) : Math.min(reach, Math.max(known, 1));
    return pagesForRows(rows).map((page) => ({ offset: page.offset, limit: Math.min(LIST_PAGE, reach - page.offset) }));
  }
  const size = sizeForSearches(reach, shape);
  if (!size) return pagesForRows(Math.min(LIST_PAGE, Math.ceil(reach * ROWS_PER_SEARCH_UNKNOWN)));
  const pages = pagesForRows(size.rows);
  const last = pages.at(-1);
  return size.ends && last ? [...pages.slice(0, -1), { offset: last.offset, limit: LIST_PAGE }] : pages;
}

/** One page's parameters, for one website from one place — the same whoever plans it. */
export function pagedListParams(
  operationId: string,
  host: string,
  locationCode: number | undefined,
  page: { offset: number; limit: number },
): Record<string, unknown> | null {
  const operation = findSeoOperation(operationId);
  if (!operation) return null;
  const params = { ...seoSiteOperationParams(operation, host, { locationCode }), limit: page.limit, offset: page.offset };
  if (page.offset === 0 && pagedListOf(operationId)?.firstAsBefore) delete (params as { offset?: number }).offset;
  return params;
}

/** How many rows a page asked for, as it was sent, or null when it did not say. */
export function sentLimit(taskArgsJson: string | null | undefined): number | null {
  try {
    const sent = JSON.parse(taskArgsJson ?? "{}") as Record<string, unknown>;
    return typeof sent.limit === "number" ? sent.limit : null;
  } catch {
    return null;
  }
}

/** Where a page starts in its list, as it was sent. */
export function sentOffset(taskArgsJson: string | null | undefined): number {
  try {
    const sent = JSON.parse(taskArgsJson ?? "{}") as Record<string, unknown>;
    return typeof sent.offset === "number" ? sent.offset : 0;
  } catch {
    return 0;
  }
}

/** The day a list's page belongs to: the day its collection was planned, or it was asked for. */
export const listPageOf = internalQuery({
  args: { pullId: v.id("seoDataPulls") },
  returns: v.union(v.null(), v.object({ day: v.string(), companyId: v.union(v.id("companies"), v.null()) })),
  handler: async (ctx, args) => {
    const pull = await ctx.db.get(args.pullId);
    if (!pull) return null;
    return { day: await runDayOf(ctx, pull), companyId: pull.companyId ?? null };
  },
});

/** A site's newest list pages read, from every place: a list is up to a few dozen pages a day. */
const LIST_PAGES_READ = 200;

/** A site's newest requests of one list read for the pages a run already asked for. */
const RUN_PULLS_READ = 200;

/** One filed page's figures, as its metrics row recorded them; null for a page filed before it recorded them. */
function segmentOf(row: Doc<"seoWebsiteMetrics">): (ListSegment & { total: number | null; ranked: number | null }) | null {
  const figures = JSON.parse(row.metricsJson) as Record<string, unknown>;
  const number = (key: string) => (typeof figures[key] === "number" ? (figures[key] as number) : null);
  const offset = number("listOffset");
  const limit = number("listLimit");
  const rows = number("listItems");
  const through = number("returnedKeywords");
  if (offset === null || limit === null || rows === null) return null;
  return {
    offset,
    limit,
    rows,
    // The page records its searches as how far they reach: its first row's place and its own.
    searches: through === null ? 0 : Math.max(0, through - offset),
    total: number("listTotal"),
    ranked: number("rankedKeywords"),
  };
}

const isPlace = (row: Doc<"seoWebsiteMetrics">, place: number) => row.locationCode === undefined || row.locationCode === place;

/** The pages of one day's keyword list filed so far, from one place. */
async function filedSegments(ctx: QueryCtx, websiteId: Id<"websites">, day: string, place: number) {
  return (await ctx.db
    .query("seoWebsiteMetrics")
    .withIndex("by_website_operation_day", (q) => q.eq("websiteId", websiteId).eq("operationId", KEYWORD_LIST_OPERATION_ID).eq("day", day))
    .take(LIST_PAGES_READ))
    .filter((row) => isPlace(row, place))
    .flatMap((row) => segmentOf(row) ?? []);
}

/**
 * What the site's last keyword list said of itself, from one place: the
 * pages of the recent day whose list went furthest — the week's list, not an
 * everyday check's first pages — and the supplier's totals.
 */
export async function readListShape(ctx: QueryCtx, websiteId: Id<"websites">, place: number): Promise<ListShape> {
  const rows = (await ctx.db
    .query("seoWebsiteMetrics")
    .withIndex("by_website_operation_day", (q) => q.eq("websiteId", websiteId).eq("operationId", KEYWORD_LIST_OPERATION_ID))
    .order("desc")
    .take(LIST_PAGES_READ))
    .filter((row) => isPlace(row, place));
  const byDay = new Map<string, Array<NonNullable<ReturnType<typeof segmentOf>>>>();
  for (const row of rows) {
    const segment = segmentOf(row);
    if (segment) byDay.set(row.day, [...(byDay.get(row.day) ?? []), segment]);
  }
  let best: ListSegment[] = [];
  for (const pages of byDay.values()) {
    const joined = joinedSegments(pages);
    const searches = (list: ListSegment[]) => list.reduce((sum, segment) => sum + segment.searches, 0);
    if (searches(joined) > searches(best)) best = joined;
  }
  const newest = [...byDay.keys()].sort().at(-1);
  const newestPages = newest ? byDay.get(newest) ?? [] : [];
  const most = (values: Array<number | null>) => values.reduce<number | null>((top, value) => (value === null ? top : Math.max(top ?? 0, value)), null);
  return {
    segments: best,
    totalRows: most(newestPages.map((page) => page.total)),
    totalSearches: most(newestPages.map((page) => page.ranked)),
  };
}

/** Whether this run already asked for a page of this list from this row, whatever its size. */
async function askedThisRun(ctx: MutationCtx, pull: Doc<"seoDataPulls">, offset: number): Promise<boolean> {
  const recent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_operation_submitted", (q) => q.eq("websiteId", pull.websiteId!).eq("operationId", pull.operationId))
    .order("desc")
    .take(RUN_PULLS_READ);
  const place = readSentLocationCode(pull.taskArgsJson) ?? DEFAULT_LOCATION_CODE;
  return recent.some((other) =>
    (pull.cycleId ? other.cycleId === pull.cycleId : other.submittedAt >= pull.submittedAt)
    && sentOffset(other.taskArgsJson) === offset
    && (readSentLocationCode(other.taskArgsJson) ?? DEFAULT_LOCATION_CODE) === place);
}

/**
 * After a page of a list is filed: the rest of it, as far as its run meant to
 * buy (`listReach`, else the site's limit) — nothing past the website's own
 * limit, else its company's. A list counted in rows queues every page still
 * missing once its first page has said how long it is. A list counted in
 * searches asks for one page at a time, from the end of the pages that join
 * up from the first row, only while the searches they hold are short and the
 * list goes on — so a page answered early never queues past a gap, and a
 * limit is reached in searches, however many rows that takes. A page this
 * run already asked for, from the same row, is never asked for again.
 */
export const queueListPages = internalMutation({
  args: { pullId: v.id("seoDataPulls"), total: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const pull = await ctx.db.get(args.pullId);
    const list = pull ? pagedListOf(pull.operationId) : null;
    const operation = pull ? findSeoOperation(pull.operationId) : undefined;
    if (!pull?.websiteId || !pull.target || !list || !operation) return 0;
    const sent = JSON.parse(pull.taskArgsJson) as Record<string, unknown>;
    const hold = pull.companyId
      ? await ctx.db.query("companyWebsites").withIndex("by_company_website", (q) =>
        q.eq("companyId", pull.companyId!).eq("websiteId", pull.websiteId!)).first()
      : null;
    const limits = await readSiteDataLimits(ctx, pull.companyId ?? undefined, hold?._id);
    // As far as its run meant to buy: a page bought for the everyday check
    // queues the everyday check's pages, never the week's list.
    const reach = Math.min(listLimitOf(list, limits), pull.listReach ?? listLimitOf(list, limits));
    const everyRun = everyRunReach(list, limits);

    let pages: Array<{ offset: number; limit: number; eachRun: boolean }> = [];
    if (list.unit === "rows") {
      if (sentOffset(pull.taskArgsJson) !== 0) return 0;
      // Each asking a full page within the limit: rows are charged as returned.
      pages = pagesForRows(Math.min(reach, Math.max(args.total, 1))).slice(1)
        .map((page) => ({ offset: page.offset, limit: Math.min(LIST_PAGE, reach - page.offset), eachRun: page.offset < everyRun }));
    } else {
      const place = readSentLocationCode(pull.taskArgsJson) ?? DEFAULT_LOCATION_CODE;
      const joined = joinedSegments(await filedSegments(ctx, pull.websiteId, await runDayOf(ctx, pull), place));
      const end = joined.at(-1);
      // Nothing joins up from the first row yet, or the list has ended.
      if (!end || end.rows < end.limit) return 0;
      const held = joined.reduce((sum, segment) => sum + segment.searches, 0);
      const next = end.offset + end.limit;
      if (held >= reach || next >= args.total) return 0;
      // The rows still wanted, at the rows per search the list has shown so far.
      const perSearch = held > 0 ? next / held : ROWS_PER_SEARCH_UNKNOWN;
      const limit = Math.min(LIST_PAGE, args.total - next, Math.max(1, Math.ceil((reach - held) * perSearch * ROWS_MARGIN)));
      pages = [{ offset: next, limit, eachRun: held < everyRun }];
    }

    const cycle = pull.cycleId ? await ctx.db.get(pull.cycleId) : null;
    const startedAt = cycle?.startedAt ?? pull.submittedAt;
    let queued = 0;
    for (const page of pages) {
      if (await askedThisRun(ctx, pull, page.offset)) continue;
      const params = { ...sent, limit: page.limit, offset: page.offset };
      const idempotencyKey = buildSeoIdempotencyKey({
        operationId: operation.id,
        websiteId: pull.websiteId,
        params,
        cycleStartedAt: startedAt,
      });
      const existing = await ctx.db.query("seoDataPulls").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).first();
      if (existing) continue;
      await ctx.db.insert("seoDataPulls", {
        operationId: operation.id,
        family: operation.family,
        mode: operation.mode,
        target: pull.target,
        websiteId: pull.websiteId,
        ...(pull.companyId ? { companyId: pull.companyId } : {}),
        taskArgsJson: JSON.stringify(params),
        status: "PENDING",
        tag: idempotencyKey,
        idempotencyKey,
        ...(pull.cycleId ? { cycleId: pull.cycleId } : {}),
        dueAt: Date.now(),
        attempts: 0,
        costUsd: 0,
        sandbox: false,
        ...(pull.agentRunId ? { agentRunId: pull.agentRunId } : {}),
        ...(pull.listReach !== undefined ? { listReach: pull.listReach } : {}),
        ...(page.eachRun ? { eachRun: true } : {}),
        submittedAt: Date.now(),
      });
      queued += 1;
    }
    return queued;
  },
});
