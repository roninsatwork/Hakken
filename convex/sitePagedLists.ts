import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { readSiteDataLimits, type CompanyDataLimits } from "./companyDataLimits";
import { KEYWORD_LIST_OPERATION_ID } from "./dataForSeoKeywordListOperations";
import { BACKLINK_LIST_OPERATION_ID } from "./dataForSeoLinkOperations";
import { findSeoOperation, seoSiteOperationParams } from "./dataForSeoRegistry";
import { buildSeoIdempotencyKey } from "./seoIdempotency";

/**
 * The lists bought a thousand rows a request, in as many requests as a
 * website's limit allows (`companyDataLimits.ts`): every keyword a site ranks
 * for (`dataForSeoKeywordListOperations.ts`) and every link to it
 * (`backlinks_all` in `dataForSeoLinkOperations.ts`). Anthony, 2026-09-24:
 * "store whatever we can please".
 *
 * **Planned from the last count.** A list takes a request per thousand rows,
 * as many as the site's latest count says it has, up to its limit
 * (`planPagedList` in `seoCollection.ts`). A site never counted gets its
 * first request alone; whatever the count, the first answer says how long the
 * list really is, and any request still missing is asked for then
 * (`queueListPages`).
 *
 * **One list, however many requests.** Every page of a list is dated by the
 * day its collection was planned (`listPageOf`), not the day each page was
 * answered, so a list whose second page lands a day after its first is still
 * one list.
 */

/** The most rows DataForSEO returns in one request of either list. */
export const LIST_PAGE = 1_000;

/** Day summaries read for a site's latest count. */
export const LIST_COUNT_DAYS = 31;

export type PagedList = {
  /** Which of the website's limits sets how long its list is. */
  limit: keyof CompanyDataLimits;
  /** A limit at or under this is covered by an everyday call, and needs no list. */
  coveredUpTo: number;
  /** The day-summary figure that says how long the site's list is. */
  count: "rankedKeywordsTotal" | "backlinks";
};

const PAGED_LISTS = new Map<string, PagedList>([
  // The everyday ranked-keywords call files a site's first hundred searches.
  [KEYWORD_LIST_OPERATION_ID, { limit: "keywordsPerSite", coveredUpTo: 100, count: "rankedKeywordsTotal" }],
  // The everyday backlinks list is one link per linking website, never every link.
  [BACKLINK_LIST_OPERATION_ID, { limit: "backlinksPerSite", coveredUpTo: 0, count: "backlinks" }],
]);

/** The list an operation buys a page of, or null for an operation bought whole. */
export function pagedListOf(operationId: string): PagedList | null {
  return PAGED_LISTS.get(operationId) ?? null;
}

export function isPagedListOperation(operationId: string): boolean {
  return PAGED_LISTS.has(operationId);
}

/**
 * The requests one list takes: a thousand rows each, up to the website's
 * limit and no further than its own count, when that is known. A site whose
 * count is not known yet gets its first request only.
 */
export function listPages(limit: number, known: number | null): Array<{ offset: number; limit: number }> {
  if (limit <= 0) return [];
  // Each request asks for a full page within the limit: rows are charged as
  // returned, so asking for more than a site has costs nothing, and a site
  // that has grown since its count was taken still comes back whole.
  const reach = known === null ? Math.min(limit, LIST_PAGE) : Math.min(limit, Math.max(known, 1));
  const pages: Array<{ offset: number; limit: number }> = [];
  for (let offset = 0; offset < reach; offset += LIST_PAGE) {
    pages.push({ offset, limit: Math.min(LIST_PAGE, limit - offset) });
  }
  return pages;
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
  return { ...seoSiteOperationParams(operation, host, { locationCode }), limit: page.limit, offset: page.offset };
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
    const cycle = pull.cycleId ? await ctx.db.get(pull.cycleId) : null;
    return {
      day: new Date(cycle?.startedAt ?? pull.submittedAt).toISOString().slice(0, 10),
      companyId: pull.companyId ?? null,
    };
  },
});

/**
 * After a list's first page: the rest of the list, now its answer has said how
 * long it is. Only the pages not planned already, each asked for once — a
 * re-parse finds them by their key. Nothing past the website's own limit,
 * else its company's.
 */
export const queueListPages = internalMutation({
  args: { pullId: v.id("seoDataPulls"), total: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const first = await ctx.db.get(args.pullId);
    const list = first ? pagedListOf(first.operationId) : null;
    const operation = first ? findSeoOperation(first.operationId) : undefined;
    if (!first?.websiteId || !first.target || !list || !operation) return 0;
    if (sentOffset(first.taskArgsJson) !== 0) return 0;
    const sent = JSON.parse(first.taskArgsJson) as Record<string, unknown>;

    const cycle = first.cycleId ? await ctx.db.get(first.cycleId) : null;
    const startedAt = cycle?.startedAt ?? first.submittedAt;
    const hold = first.companyId
      ? await ctx.db.query("companyWebsites").withIndex("by_company_website", (q) =>
        q.eq("companyId", first.companyId!).eq("websiteId", first.websiteId!)).first()
      : null;
    const limits = await readSiteDataLimits(ctx, first.companyId ?? undefined, hold?._id);
    let queued = 0;
    for (const page of listPages(limits[list.limit], args.total).slice(1)) {
      const params = { ...sent, limit: page.limit, offset: page.offset };
      const idempotencyKey = buildSeoIdempotencyKey({
        operationId: operation.id,
        websiteId: first.websiteId,
        params,
        cycleStartedAt: startedAt,
      });
      const existing = await ctx.db.query("seoDataPulls").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).first();
      if (existing) continue;
      await ctx.db.insert("seoDataPulls", {
        operationId: operation.id,
        family: operation.family,
        mode: operation.mode,
        target: first.target,
        websiteId: first.websiteId,
        ...(first.companyId ? { companyId: first.companyId } : {}),
        taskArgsJson: JSON.stringify(params),
        status: "PENDING",
        tag: idempotencyKey,
        idempotencyKey,
        ...(first.cycleId ? { cycleId: first.cycleId } : {}),
        dueAt: Date.now(),
        attempts: 0,
        costUsd: 0,
        sandbox: false,
        ...(first.agentRunId ? { agentRunId: first.agentRunId } : {}),
        submittedAt: Date.now(),
      });
      queued += 1;
    }
    return queued;
  },
});
