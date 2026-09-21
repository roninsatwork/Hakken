import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";

import { superAdminQuery } from "./tenantFunctions";
import {
  includesSearchTerm,
  normalizeSearchTerm,
  paginateItems,
} from "./adminQueryService";
import type { Doc } from "./_generated/dataModel";

/**
 * What the collection screens read.
 *
 * **Super admin only, every one of them.** Hakken absorbs DataForSEO spend and
 * no customer ever sees it, so a cost figure on a company-facing screen would
 * be a number nobody is entitled to and nobody can act on. The company id here
 * answers "which client is expensive to serve", which is a margin question.
 *
 * **Nothing here sums the pull table.** A dashboard built on raw rows works
 * perfectly until the day there are millions of them, and that day arrives
 * without warning. Totals come from `seoDayRollups`, which is written at the
 * moment each pull settles, the same way the governance and inventory screens
 * are fed.
 */

const cycleRow = v.object({
  _id: v.id("seoCollectionCycles"),
  _creationTime: v.number(),
  trigger: v.string(),
  status: v.string(),
  planned: v.number(),
  /** Lines this run got for nothing, because somebody had already paid. */
  reused: v.number(),
  ready: v.number(),
  failed: v.number(),
  costUsd: v.number(),
  cappedReason: v.union(v.string(), v.null()),
  startedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
});

/**
 * The queue as it stands right now, row by row.
 *
 * A live window rather than an archive, which is why it has no pagination: the
 * queue is meant to be short-lived, and what an operator wants is the next
 * hundred things going out, not page nine of a hundred thousand. When a cycle
 * for a large tenant is draining, that list is the whole story anyway — the
 * rows behind it are the same rows with later due times.
 *
 * Ordered by when each row may be sent, because that is the order they will
 * actually go. `dueAt` spacing is what makes this list read as a schedule
 * rather than a heap.
 */
export const listSeoQueue = superAdminQuery({
  args: {
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("seoDataPulls"),
      host: v.string(),
      companyName: v.string(),
      operationId: v.string(),
      status: v.string(),
      dueAt: v.union(v.number(), v.null()),
      sentAt: v.union(v.number(), v.null()),
      attempts: v.number(),
      cycleId: v.union(v.id("seoCollectionCycles"), v.null()),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
    /** Totals behind the window, so a short list cannot read as a quiet queue. */
    pending: v.number(),
    claimed: v.number(),
    submitted: v.number(),
    countsAreCapped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const counts: Record<string, number> = {};
    let countsAreCapped = false;
    const collected = [];

    for (const status of ["PENDING", "CLAIMED", "SUBMITTED"] as const) {
      const rows = await ctx.db
        .query("seoDataPulls")
        .withIndex("by_status_due", (q) => q.eq("status", status))
        .order("asc")
        .take(QUEUE_COUNT_CEILING);
      counts[status] = rows.length;
      countsAreCapped ||= rows.length === QUEUE_COUNT_CEILING;
      collected.push(...rows.slice(0, QUEUE_WINDOW));
    }

    // Merged after the fact rather than in one query, because the three
    // statuses live in separate ranges of the same index. Sorting here is
    // cheap at this size and honest: they really are one queue.
    const window = collected
      .sort((a, b) => (a.dueAt ?? a.submittedAt) - (b.dueAt ?? b.submittedAt))
      .slice(0, QUEUE_WINDOW);

    const hosts = new Map<string, string>();
    const names = new Map<string, string>();

    const rows = await Promise.all(window.map(async (pull) => {
      if (pull.websiteId && !hosts.has(pull.websiteId)) {
        const website = await ctx.db.get(pull.websiteId);
        hosts.set(pull.websiteId, website?.displayHost ?? website?.host ?? "");
      }
      if (pull.companyId && !names.has(pull.companyId)) {
        const company = await ctx.db.get(pull.companyId);
        names.set(pull.companyId, company?.name ?? "");
      }
      return {
        _id: pull._id,
        host: pull.websiteId ? hosts.get(pull.websiteId) ?? "" : pull.target ?? "",
        // Whose cadence caused this, not somebody to charge. A shared host is
        // pulled once for everyone watching it.
        companyName: pull.companyId ? names.get(pull.companyId) ?? "" : "",
        operationId: pull.operationId,
        status: pull.status,
        dueAt: pull.dueAt ?? null,
        sentAt: pull.sentAt ?? null,
        attempts: pull.attempts ?? 0,
        cycleId: pull.cycleId ?? null,
      };
    }));

    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = term
      ? rows.filter((row) =>
        includesSearchTerm(row.host, term) || includesSearchTerm(row.companyName, term))
      : rows;

    const paged = paginateItems(matching, args.page, args.pageSize);

    return {
      ...paged,
      pending: counts.PENDING ?? 0,
      claimed: counts.CLAIMED ?? 0,
      submitted: counts.SUBMITTED ?? 0,
      countsAreCapped,
    };
  },
});

/**
 * What the queue has already settled, newest first.
 *
 * The same rows as the queue above, one stage later, which is why it carries
 * the same columns. A screen that showed work in flight as pulls and finished
 * work as runs would be describing two different things and quietly inviting
 * the reader to compare them.
 *
 * Paginated, unlike the queue, because this one really is an archive.
 */
export const listSeoHistory = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    /** "FAILED" narrows to what went wrong, which is the usual reason to look. */
    status: v.optional(v.union(v.literal("READY"), v.literal("FAILED"))),
    searchTerm: v.optional(v.string()),
  },
  returns: paginationResultValidator(v.object({
    _id: v.id("seoDataPulls"),
    host: v.string(),
    companyName: v.string(),
    operationId: v.string(),
    status: v.string(),
    costUsd: v.number(),
    sandbox: v.boolean(),
    error: v.union(v.string(), v.null()),
    completedAt: v.union(v.number(), v.null()),
    cycleId: v.union(v.id("seoCollectionCycles"), v.null()),
  })),
  handler: async (ctx, args) => {
    const page = args.status
      ? await ctx.db
        .query("seoDataPulls")
        .withIndex("by_status_submitted", (q) => q.eq("status", args.status!))
        .order("desc")
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("seoDataPulls")
        .withIndex("by_submitted")
        .order("desc")
        .filter((q) =>
          q.or(q.eq(q.field("status"), "READY"), q.eq(q.field("status"), "FAILED")))
        .paginate(args.paginationOpts);

    const hosts = new Map<string, string>();
    const names = new Map<string, string>();

    const rows = await Promise.all(page.page.map(async (pull) => {
      if (pull.websiteId && !hosts.has(pull.websiteId)) {
        const website = await ctx.db.get(pull.websiteId);
        hosts.set(pull.websiteId, website?.displayHost ?? website?.host ?? "");
      }
      if (pull.companyId && !names.has(pull.companyId)) {
        const company = await ctx.db.get(pull.companyId);
        names.set(pull.companyId, company?.name ?? "");
      }
      return {
        _id: pull._id,
        host: pull.websiteId ? hosts.get(pull.websiteId) ?? "" : pull.target ?? "",
        companyName: pull.companyId ? names.get(pull.companyId) ?? "" : "",
        operationId: pull.operationId,
        status: pull.status,
        costUsd: pull.costUsd,
        sandbox: pull.sandbox,
        error: pull.error ?? null,
        completedAt: pull.completedAt ?? null,
        cycleId: pull.cycleId ?? null,
      };
    }));

    // Filtered after the page is read, so a search narrows the page rather
    // than the archive. The alternative is a search index over a table that
    // exists to be written to, not searched.
    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = term
      ? rows.filter((row) =>
        includesSearchTerm(row.host, term) || includesSearchTerm(row.companyName, term))
      : rows;

    return { ...page, page: matching };
  },
});

/**
 * How much of the queue the screen can page through.
 *
 * Still a window rather than an archive — the queue is meant to be short-lived,
 * and the rows beyond this are the same rows with later due times. Large enough
 * that a draining cycle is legible, small enough to stay a cheap read.
 */
const QUEUE_WINDOW = 500;

/** The ceiling on counting. Over it the screen says "more than", which is honest. */
const QUEUE_COUNT_CEILING = 500;

/**
 * Every company's collection runs on one screen.
 *
 * The platform view: one list across every tenant, which is exactly the view a
 * company must never be given. Super admin only, like everything in this file.
 */
export const listAllCycles = superAdminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    ...cycleRow.fields,
    companyId: v.id("companies"),
    companyName: v.string(),
  })),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("seoCollectionCycles")
      .order("desc")
      .paginate(args.paginationOpts);

    const names = new Map<string, string>();

    const rows = await Promise.all(page.page.map(async (cycle) => {
      if (!names.has(cycle.companyId)) {
        const company = await ctx.db.get(cycle.companyId);
        names.set(cycle.companyId, company?.name ?? "");
      }
      return {
        ...toCycleRow(cycle),
        companyId: cycle.companyId,
        companyName: names.get(cycle.companyId) ?? "",
      };
    }));

    return { ...page, page: rows };
  },
});

/**
 * One run, line by line: what was asked, about which host, and whether this
 * run paid for it.
 *
 * The host is named here, across companies, which is the one place that is
 * allowed to happen — and the reason every screen over this file is super
 * admin only. A tenant-facing version of this list would tell each customer
 * which of their rivals somebody else is also watching.
 */
export const getSeoCycle = superAdminQuery({
  args: { cycleId: v.id("seoCollectionCycles") },
  returns: v.union(v.null(), v.object({
    ...cycleRow.fields,
    companyId: v.id("companies"),
    companyName: v.string(),
  })),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle) return null;

    const company = await ctx.db.get(cycle.companyId);

    return {
      ...toCycleRow(cycle),
      companyId: cycle.companyId,
      companyName: company?.name ?? "",
    };
  },
});

/** One screenful of detail. A cycle can hold far more; the list is a sample. */
const MAX_LINES = 200;

/**
 * One run's lines, searchable and paged like every other admin table.
 *
 * Split out of `getSeoCycle` so the screen reads the way the rest of admin
 * reads: title, description, search, table, footer. The summary above the
 * table and the rows inside it are different reads because they change at
 * different rates.
 */
export const listSeoCycleLines = superAdminQuery({
  args: {
    cycleId: v.id("seoCollectionCycles"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("seoCycleLines"),
      host: v.string(),
      operationId: v.string(),
      reused: v.boolean(),
      status: v.string(),
      costUsd: v.number(),
      error: v.union(v.string(), v.null()),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
    isCapped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const lines = await ctx.db
      .query("seoCycleLines")
      .withIndex("by_cycle", (q) => q.eq("cycleId", args.cycleId))
      .take(MAX_LINES + 1);

    const hosts = new Map<string, string>();

    const rows = await Promise.all(lines.slice(0, MAX_LINES).map(async (line) => {
      if (!hosts.has(line.websiteId)) {
        const website = await ctx.db.get(line.websiteId);
        hosts.set(line.websiteId, website?.displayHost ?? website?.host ?? "");
      }
      const pull = await ctx.db.get(line.pullId);
      return {
        _id: line._id,
        host: hosts.get(line.websiteId) ?? "",
        operationId: line.operationId,
        reused: line.reused,
        status: pull?.status ?? "",
        // A reused line shows nothing, because this run did not pay for it.
        // Showing the original pull's cost would count one charge twice.
        costUsd: line.reused ? 0 : pull?.costUsd ?? 0,
        error: pull?.error ?? null,
      };
    }));

    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = term
      ? rows.filter((row) =>
        includesSearchTerm(row.host, term) || includesSearchTerm(row.operationId, term))
      : rows;

    return {
      ...paginateItems(matching, args.page, args.pageSize),
      isCapped: lines.length > MAX_LINES,
    };
  },
});

function toCycleRow(cycle: Doc<"seoCollectionCycles">) {
  return {
    _id: cycle._id,
    _creationTime: cycle._creationTime,
    trigger: cycle.trigger,
    status: cycle.status,
    planned: cycle.plannedCount,
    reused: cycle.reusedCount,
    ready: cycle.readyCount,
    failed: cycle.failedCount,
    costUsd: cycle.totalCostUsd,
    cappedReason: cycle.cappedReason ?? null,
    startedAt: cycle.startedAt,
    finishedAt: cycle.finishedAt ?? null,
  };
}

/** A company's collection runs, newest first. */
export const listCompanyCycles = superAdminQuery({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(cycleRow),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("seoCollectionCycles")
      .withIndex("by_company_started", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...page,
      page: page.page.map(toCycleRow),
    };
  },
});

/**
 * What collection has cost, by day, for one company or for the platform.
 *
 * `reused` is the number worth watching. It is how many questions were
 * answered by a pull somebody else had already paid for, and it is the whole
 * economics of storing one host once made visible: a rising reuse count on a
 * flat spend is the shared record doing its job.
 */
export const readSeoSpend = superAdminQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    days: v.optional(v.number()),
  },
  returns: v.object({
    days: v.array(v.object({
      day: v.string(),
      pulls: v.number(),
      sent: v.number(),
      ready: v.number(),
      failed: v.number(),
      costUsd: v.number(),
    })),
    totalCostUsd: v.number(),
    totalPulls: v.number(),
  }),
  handler: async (ctx, args) => {
    const scopeKey = args.companyId ? `company:${args.companyId}` : "platform";
    const since = new Date(Date.now() - (args.days ?? 30) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const rows = await ctx.db
      .query("seoDayRollups")
      .withIndex("by_scope_day", (q) => q.eq("scopeKey", scopeKey).gte("day", since))
      .order("desc")
      .take(MAX_DAYS);

    return {
      days: rows.map((row) => ({
        day: row.day,
        pulls: row.pulls,
        sent: row.sent,
        ready: row.ready,
        failed: row.failed,
        costUsd: row.costUsd,
      })),
      totalCostUsd: rows.reduce((sum, row) => sum + row.costUsd, 0),
      totalPulls: rows.reduce((sum, row) => sum + row.pulls, 0),
    };
  },
});

/** A year of daily rows, which is far more than any screen asks for. */
const MAX_DAYS = 400;
