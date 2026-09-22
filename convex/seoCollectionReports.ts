import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";

import { superAdminQuery } from "./tenantFunctions";
import {
  includesSearchTerm,
  normalizeSearchTerm,
  paginateItems,
} from "./adminQueryService";
import type { Doc, Id } from "./_generated/dataModel";

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
 * Every pull, at whatever stage it has reached.
 *
 * One table rather than two. The queue and the collected list were separate
 * screens-within-a-screen for a while, which put two searches and two footers
 * on one page and left the useful list below a table that is empty by design
 * almost all the time. They are the same rows one stage apart, so they are one
 * list with a state filter over it, and "failures only" stops being a special
 * case and becomes one value of that filter.
 *
 * The counts come back with the page because an operator's first question is
 * "is anything moving", and a filtered list cannot answer it.
 */
export const listSeoPulls = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(
      v.literal("PENDING"),
      v.literal("CLAIMED"),
      v.literal("SUBMITTED"),
      v.literal("READY"),
      v.literal("FAILED"),
    )),
    searchTerm: v.optional(v.string()),
  },
  returns: paginationResultValidator(v.object({
    _id: v.id("seoDataPulls"),
    host: v.string(),
    companyName: v.string(),
    operationId: v.string(),
    /** Above one when a single call covered many websites. */
    targetCount: v.number(),
    status: v.string(),
    costUsd: v.number(),
    sandbox: v.boolean(),
    error: v.union(v.string(), v.null()),
    attempts: v.number(),
    /** When this happens or happened, whichever the row's stage makes true. */
    at: v.union(v.number(), v.null()),
    cycleId: v.union(v.id("seoCollectionCycles"), v.null()),
  })),
  handler: async (ctx, args) => {
    // Waiting rows read in the order they will go out; everything else reads
    // newest first. Sorting a queue by when it was created would bury the row
    // about to be sent under five hundred behind it.
    const page = args.status === "PENDING"
      ? await ctx.db
        .query("seoDataPulls")
        .withIndex("by_status_due", (q) => q.eq("status", "PENDING"))
        .order("asc")
        .paginate(args.paginationOpts)
      : args.status
        ? await ctx.db
          .query("seoDataPulls")
          .withIndex("by_status_submitted", (q) => q.eq("status", args.status!))
          .order("desc")
          .paginate(args.paginationOpts)
        : await ctx.db
          .query("seoDataPulls")
          .withIndex("by_submitted")
          .order("desc")
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
        // A citation pull is about a question rather than a host, and the
        // question is the thing to show. Everything else shows its host.
        host: pull.websiteId
          ? hosts.get(pull.websiteId) ?? ""
          : readPromptText(pull.taskArgsJson) ?? pull.target ?? "",
        // Whose cadence caused this, not somebody to charge. A shared host is
        // pulled once for everyone watching it.
        companyName: pull.companyId ? names.get(pull.companyId) ?? "" : "",
        operationId: pull.operationId,
        /**
         * How many websites one paid call covered, when it covered more than
         * one. A bulk pull has no single host, and a blank cell reads as
         * missing data rather than as the saving it actually is.
         */
        targetCount: countTargets(pull.taskArgsJson),
        status: pull.status,
        costUsd: pull.costUsd,
        sandbox: pull.sandbox,
        // A screen's error is a sentence, not a dump. A validation failure
        // once carried an entire AI answer into this column.
        error: pull.error ? pull.error.slice(0, MAX_ERROR_CHARS) : null,
        attempts: pull.attempts ?? 0,
        // One column, three meanings, each true of the stage it belongs to:
        // when a waiting row goes out, and when a settled one finished.
        at: pull.completedAt ?? pull.sentAt ?? pull.dueAt ?? null,
        cycleId: pull.cycleId ?? null,
      };
    }));

    // Filtered after the page is read, so a search narrows the page rather than
    // the archive. A search index over a table that exists to be written to
    // would be paid for on every write to save a query nobody runs often.
    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = term
      ? rows.filter((row) =>
        includesSearchTerm(row.host, term) || includesSearchTerm(row.companyName, term))
      : rows;

    return { ...page, page: matching };
  },
});

/**
 * How much is in flight right now, for the line above the table.
 *
 * Counted rather than listed, and bounded rather than exact: this is a number
 * somebody refreshes, not an accounting figure, and an unbounded count over the
 * pull table is the query that works until the day it does not. Over the ceiling
 * it says "more than", which is honest and enough.
 */
export const readSeoQueueCounts = superAdminQuery({
  args: {},
  returns: v.object({
    pending: v.number(),
    claimed: v.number(),
    submitted: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    let capped = false;

    for (const status of ["PENDING", "CLAIMED", "SUBMITTED"] as const) {
      const rows = await ctx.db
        .query("seoDataPulls")
        .withIndex("by_status_due", (q) => q.eq("status", status))
        .take(QUEUE_COUNT_CEILING);
      counts[status] = rows.length;
      capped ||= rows.length === QUEUE_COUNT_CEILING;
    }

    return {
      pending: counts.PENDING ?? 0,
      claimed: counts.CLAIMED ?? 0,
      submitted: counts.SUBMITTED ?? 0,
      capped,
    };
  },
});

/** The ceiling on counting. Over it the screen says "more than". */
const QUEUE_COUNT_CEILING = 500;

/**
 * One run's summary, for the header of its detail page.
 *
 * Separate from its lines below because they change at different rates: the
 * pills settle once, while the table under them is searched and paged.
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

/**
 * One run's lines, searchable and paged like every other admin table.
 *
 * The host is named here across companies, which is the one place that is
 * allowed to happen and the reason every screen over this file is super admin
 * only. A tenant-facing version of this list would tell each customer which of
 * their rivals somebody else is also watching.
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

/** One screenful of detail. A cycle can hold far more; the list is a sample. */
const MAX_LINES = 200;

/**
 * How many websites one pull was about, read from what was actually sent.
 *
 * From the stored arguments rather than from a column, because the arguments
 * are the record of what was asked and cannot drift from it.
 */
/** The question a citation pull asked, or null for anything else. */
function readPromptText(taskArgsJson: string): string | null {
  try {
    const args = JSON.parse(taskArgsJson) as Record<string, unknown>;
    return typeof args.user_prompt === "string" ? args.user_prompt : null;
  } catch {
    return null;
  }
}

/** Enough to say what went wrong; never enough to carry a payload. */
const MAX_ERROR_CHARS = 160;

function countTargets(taskArgsJson: string): number {
  try {
    const args = JSON.parse(taskArgsJson) as Record<string, unknown>;
    const targets = args.targets;
    return Array.isArray(targets) ? targets.length : 1;
  } catch {
    return 1;
  }
}

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
/**
 * What collection has cost one company, or the platform, by day.
 *
 * **Two figures, because one of them lies when asked about pricing.** `paid` is
 * money out. `standalone` is what this company would have cost on its own, and
 * it is the number a price has to clear: a company whose rival happens to
 * trigger the pulls looks almost free to serve until that rival leaves.
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
      reused: v.number(),
      failed: v.number(),
      paidUsd: v.number(),
      reusedValueUsd: v.number(),
    })),
    paidUsd: v.number(),
    /** Priced at what it cost whoever did pay. The saving, made countable. */
    reusedValueUsd: v.number(),
    /** paid + reusedValue: what this company would have cost standing alone. */
    standaloneUsd: v.number(),
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

    const paidUsd = rows.reduce((sum, row) => sum + row.costUsd, 0);
    const reusedValueUsd = rows.reduce((sum, row) => sum + (row.reusedValueUsd ?? 0), 0);

    return {
      days: rows.map((row) => ({
        day: row.day,
        pulls: row.pulls,
        reused: row.reused,
        failed: row.failed,
        paidUsd: row.costUsd,
        reusedValueUsd: row.reusedValueUsd ?? 0,
      })),
      paidUsd,
      reusedValueUsd,
      standaloneUsd: paidUsd + reusedValueUsd,
      totalPulls: rows.reduce((sum, row) => sum + row.pulls, 0),
    };
  },
});

/**
 * Every company, by what it costs to serve.
 *
 * Company-led and rolled up, which is the order the question is actually asked
 * in: "am I charging enough" is really "who are my most expensive clients, and
 * what do they pay me". Sorted by standalone rather than by paid, because that
 * is the figure that survives another customer churning.
 *
 * Read from the day rollups, never from the pull table. Same rule the
 * governance and inventory screens follow.
 */
export const listCompanyCosts = superAdminQuery({
  args: { days: v.optional(v.number()) },
  returns: v.object({
    companies: v.array(v.object({
      companyId: v.id("companies"),
      companyName: v.string(),
      pulls: v.number(),
      paidUsd: v.number(),
      reusedValueUsd: v.number(),
      standaloneUsd: v.number(),
    })),
    paidUsd: v.number(),
    reusedValueUsd: v.number(),
    /** True when a scope hit the read ceiling, so the totals read as partial. */
    isCapped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const since = new Date(Date.now() - (args.days ?? 30) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const rows = await ctx.db
      .query("seoDayRollups")
      .withIndex("by_scope_day")
      .take(MAX_ROLLUP_ROWS);

    const byCompany = new Map<string, {
      pulls: number; paidUsd: number; reusedValueUsd: number;
    }>();

    for (const row of rows) {
      if (row.day < since) continue;
      if (!row.scopeKey.startsWith("company:")) continue;
      const companyId = row.scopeKey.slice("company:".length);
      const entry = byCompany.get(companyId)
        ?? { pulls: 0, paidUsd: 0, reusedValueUsd: 0 };
      entry.pulls += row.pulls;
      entry.paidUsd += row.costUsd;
      entry.reusedValueUsd += row.reusedValueUsd ?? 0;
      byCompany.set(companyId, entry);
    }

    const companies = await Promise.all([...byCompany.entries()].map(async ([id, entry]) => {
      const company = await ctx.db.get(id as Id<"companies">);
      return {
        companyId: id as Id<"companies">,
        companyName: company?.name ?? "",
        pulls: entry.pulls,
        paidUsd: entry.paidUsd,
        reusedValueUsd: entry.reusedValueUsd,
        standaloneUsd: entry.paidUsd + entry.reusedValueUsd,
      };
    }));

    companies.sort((left, right) => right.standaloneUsd - left.standaloneUsd);

    return {
      companies,
      paidUsd: companies.reduce((sum, row) => sum + row.paidUsd, 0),
      reusedValueUsd: companies.reduce((sum, row) => sum + row.reusedValueUsd, 0),
      isCapped: rows.length === MAX_ROLLUP_ROWS,
    };
  },
});

/**
 * One row per scope per day, so this is thirty days times the number of
 * companies plus one. Generous, and bounded rather than collected, because a
 * query with no ceiling is the one that works until the day it does not.
 */
const MAX_ROLLUP_ROWS = 5_000;

/** A year of daily rows, which is far more than any screen asks for. */
const MAX_DAYS = 400;
