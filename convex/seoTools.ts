import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  describeSeoOperation,
  findSeoOperation,
  SEO_OPERATIONS,
  seoSiteOperationParams,
} from "./dataForSeoRegistry";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { WEBSITE_IDENTITY_MESSAGES, readWebsiteHost } from "./websiteIdentity";
import { appError } from "./utils/appError";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * What the collecting agent can actually do.
 *
 * Four narrow doors, and the narrowness is the design. The agent opens a
 * cycle, asks for one thing, or reads numbers back; it never sends a request,
 * never sees a raw payload and never learns what another company watches.
 *
 * **The tenancy rule.** A website record is shared — one host is stored once,
 * for everyone tracking it — so the record implicitly knows that a company and
 * its rival both watch the same site. Nothing here may start from a website
 * and walk outward to its watchers. Every read goes through
 * `requireCompanyWebsite`, which resolves a host only through *this* company's
 * own join rows, so a host nobody here holds is indistinguishable from a host
 * that does not exist.
 *
 * **The injection rule.** SERP results are text from the open web, and a page
 * whose title reads as an instruction is a prompt injection waiting for an
 * agent to read it. No tool here returns result text: only positions, counts
 * and keywords we already asked about. That is not a filter to be got round;
 * the text is simply never in the reply.
 */

/**
 * Resolve a host this company is entitled to, or refuse identically to a host
 * that does not exist.
 *
 * Both a company's own website and a competitor tracked under one count, and
 * both are found through rows that carry `companyId`. The lookup deliberately
 * never queries `websites` first: starting there and filtering afterwards is
 * the shape that leaks, because the filter is one edit away from being dropped.
 */
export async function requireCompanyWebsite(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  host: string,
): Promise<{ websiteId: Id<"websites">; host: string }> {
  const identity = readWebsiteHost(host);
  if (!identity.ok) {
    throw appError("INVALID_INPUT", WEBSITE_IDENTITY_MESSAGES[identity.problem]);
  }

  const website = await ctx.db
    .query("websites")
    .withIndex("by_host", (q) => q.eq("host", identity.host))
    .unique();

  const denial = appError(
    "NOT_FOUND",
    `This company does not hold ${identity.displayHost}. Add it as a website or as a competitor first.`,
  );
  if (!website) throw denial;

  const owned = await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_website", (q) =>
      q.eq("companyId", companyId).eq("websiteId", website._id))
    .first();
  if (owned) return { websiteId: website._id, host: website.host };

  const tracked = await ctx.db
    .query("trackedCompetitors")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .filter((q) => q.eq(q.field("websiteId"), website._id))
    .first();
  if (tracked) return { websiteId: website._id, host: website.host };

  // Same words as "no such website", on purpose. A different message would
  // turn this into a way of asking which hosts the platform knows about.
  throw denial;
}

/** Every operation the agent may name, in the words it was written to read. */
export const listSeoOperations = internalQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async () => SEO_OPERATIONS.map((operation) => describeSeoOperation(operation)),
});

/**
 * Open a collection cycle for a company and stop.
 *
 * The agent's whole job. It writes no requests and waits for nothing: the
 * expansion chain builds the work list and the workers send it, long after
 * this run has ended.
 */
export const startSeoCollection = internalMutation({
  args: {
    companyId: v.id("companies"),
    agentRunId: v.optional(v.id("agentRuns")),
    trigger: v.union(v.literal("SCHEDULE"), v.literal("MANUAL")),
  },
  returns: v.object({
    ok: v.boolean(),
    cycleId: v.union(v.id("seoCollectionCycles"), v.null()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_company_agent", (q) => q.eq("companyId", args.companyId))
      .first();

    const running = await ctx.db
      .query("seoCollectionCycles")
      .withIndex("by_company_started", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .first();

    // One open cycle per company. A second would plan the same work, and the
    // only thing standing between that and a doubled bill would be the
    // idempotency key — which is a safety net, not a plan.
    if (running && !TERMINAL.includes(running.status)) {
      return {
        ok: false,
        cycleId: running._id,
        message: "A collection run for this company is already under way.",
      };
    }

    const cycleId = await ctx.db.insert("seoCollectionCycles", {
      companyId: args.companyId,
      ...(schedule ? { scheduleId: schedule._id } : {}),
      ...(args.agentRunId ? { agentRunId: args.agentRunId } : {}),
      trigger: args.trigger,
      status: "EXPANDING",
      plannedCount: 0,
      reusedCount: 0,
      sentCount: 0,
      readyCount: 0,
      failedCount: 0,
      totalCostUsd: 0,
      startedAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.seoCollection.expandSeoCycle, { cycleId });

    return {
      ok: true,
      cycleId,
      message: "Collection started. The work list is being written and will send itself.",
    };
  },
});

const TERMINAL = ["DONE", "FAILED", "CAPPED_PLAN", "CAPPED_SPEND"];

/**
 * Ask for one operation on one host, off-schedule.
 *
 * Goes through the same reuse check as a scheduled cycle, so an ad hoc
 * question cannot buy something the platform already holds. This is the door
 * the customer-facing version will use too, which is why the entitlement check
 * is here and not in the caller.
 */
export const requestSeoPull = internalMutation({
  args: {
    companyId: v.id("companies"),
    host: v.string(),
    operationId: v.string(),
    agentRunId: v.optional(v.id("agentRuns")),
  },
  returns: v.object({
    ok: v.boolean(),
    reused: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const operation = findSeoOperation(args.operationId);
    if (!operation) {
      throw appError(
        "INVALID_INPUT",
        `There is no operation called '${args.operationId}'. List the operations to see what can be asked.`,
      );
    }

    const { websiteId, host } = await requireCompanyWebsite(ctx, args.companyId, args.host);
    const params = seoSiteOperationParams(operation, host);
    const startedAt = Date.now();
    const idempotencyKey = buildSeoIdempotencyKey({
      operationId: operation.id,
      websiteId,
      params,
      cycleStartedAt: startedAt,
    });

    const existing = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) {
      return {
        ok: true,
        reused: true,
        message: `${host} was already asked this today; the answer will be the same one.`,
      };
    }

    await ctx.db.insert("seoDataPulls", {
      operationId: operation.id,
      family: operation.family,
      mode: operation.mode,
      target: host,
      websiteId,
      companyId: args.companyId,
      taskArgsJson: JSON.stringify(params),
      status: "PENDING",
      tag: idempotencyKey,
      idempotencyKey,
      dueAt: startedAt,
      attempts: 0,
      costUsd: 0,
      sandbox: false,
      ...(args.agentRunId ? { agentRunId: args.agentRunId } : {}),
      submittedAt: startedAt,
    });

    await ctx.scheduler.runAfter(0, internal.seoCollectionActions.startSeoWorkers, {});

    return {
      ok: true,
      reused: false,
      message: `Queued ${operation.id} for ${host}. The answer arrives separately.`,
    };
  },
});

/**
 * The numbers held for one host this company holds.
 *
 * Metrics and keyword positions only. No titles, no snippets, no raw payload
 * and nothing about who else watches the host — see the injection and tenancy
 * rules at the top of this file.
 */
export const readSeoMetrics = internalQuery({
  args: {
    companyId: v.id("companies"),
    host: v.string(),
    days: v.optional(v.number()),
  },
  returns: v.object({
    host: v.string(),
    metrics: v.array(v.object({
      day: v.string(),
      operationId: v.string(),
      metrics: v.any(),
    })),
    keywords: v.array(v.object({
      keyword: v.string(),
      day: v.string(),
      position: v.union(v.number(), v.null()),
      searchVolume: v.union(v.number(), v.null()),
    })),
  }),
  handler: async (ctx, args) => {
    const { websiteId, host } = await requireCompanyWebsite(ctx, args.companyId, args.host);

    const since = new Date(Date.now() - (args.days ?? 30) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const metrics = await ctx.db
      .query("seoWebsiteMetrics")
      .withIndex("by_website_day", (q) => q.eq("websiteId", websiteId).gte("day", since))
      .order("desc")
      .take(MAX_METRIC_ROWS);

    const keywords = await ctx.db
      .query("seoKeywordPositions")
      .withIndex("by_website_day", (q) => q.eq("websiteId", websiteId).gte("day", since))
      .order("desc")
      .take(MAX_KEYWORD_ROWS);

    return {
      host,
      metrics: metrics.map((row) => ({
        day: row.day,
        operationId: row.operationId,
        metrics: JSON.parse(row.metricsJson) as unknown,
      })),
      keywords: keywords.map((row) => ({
        keyword: row.keyword,
        day: row.day,
        position: row.position ?? null,
        searchVolume: row.searchVolume ?? null,
      })),
    };
  },
});

/** Enough for a model to reason over, and far short of a model's context. */
const MAX_METRIC_ROWS = 200;
const MAX_KEYWORD_ROWS = 500;
