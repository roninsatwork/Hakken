import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  findSeoOperation,
  seoBulkOperationParams,
  seoBulkOperations,
  seoSiteOperationParams,
  seoSiteOperations,
} from "./dataForSeoRegistry";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { isWebsiteDue, resolveWebsiteSchedule } from "./seoScheduleService";
import {
  SEO_DUE_SPACING_MS,
  SEO_EXPANSION_PAGE,
  SEO_COMPETITORS_PER_WEBSITE,
  SEO_MAX_SENDS_PER_CYCLE,
} from "./seoCollectionPolicy";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Writing the work list.
 *
 * A schedule fires, the collecting agent opens a cycle and stops, and this is
 * what happens next: the company's websites are walked a page at a time and
 * every question worth asking becomes a row in the queue. Nothing here sends
 * anything. Sending is the workers' job in `seoCollectionActions.ts`, and the
 * split is deliberate — an agent run that fanned out its own sends could post
 * thousands of *paid* tasks and then die holding the only record of them.
 *
 * Two rules do most of the work.
 *
 * **Chunk, because a mutation is a transaction.** A company with thousands of
 * websites cannot be expanded in one mutation, so each page writes what it can,
 * remembers where it stopped, and reschedules itself. This is not an
 * optimisation; the single-transaction version simply fails at scale.
 *
 * **Reuse before buying.** One host is stored once and fetched once, so before
 * planning a send we ask whether somebody already holds a fresh enough answer.
 * If Acme pulled `rival.com` on Monday and Acme's rival comes round on
 * Wednesday, Wednesday gets a line pointing at Monday's pull and pays nothing.
 * "Fresh enough" is the asker's own schedule, judged by the same helper that
 * decides whether a website is due at all — a weekly watcher is perfectly
 * served by six-day-old data.
 */

/** What one page of expansion did, so the caller can decide what happens next. */
type ExpansionOutcome = {
  planned: number;
  reused: number;
  lastCursor: Id<"companyWebsites"> | null;
  exhausted: boolean;
  cappedPlan: boolean;
};

export const expandSeoCycle = internalMutation({
  args: {
    cycleId: v.id("seoCollectionCycles"),
    cursor: v.optional(v.id("companyWebsites")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle || cycle.status !== "EXPANDING") return null;

    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_company_agent", (q) => q.eq("companyId", cycle.companyId))
      .first();

    const outcome = await expandPage(ctx, cycle, schedule, args.cursor);

    const plannedCount = cycle.plannedCount + outcome.planned;
    const reusedCount = cycle.reusedCount + outcome.reused;

    if (outcome.cappedPlan) {
      // Stop where we are and keep every row already written. A capped cycle
      // that threw away its own work would collect nothing at all, which is a
      // worse answer to "you asked for more than your plan allows".
      await ctx.db.patch(args.cycleId, {
        status: "CAPPED_PLAN",
        plannedCount,
        reusedCount,
        cursor: outcome.lastCursor ?? cycle.cursor,
        cappedReason: `Planned ${plannedCount} pulls, which is this cycle's ceiling of ${SEO_MAX_SENDS_PER_CYCLE}.`,
      });
      await startSending(ctx, args.cycleId, plannedCount);
      return null;
    }

    if (!outcome.exhausted && outcome.lastCursor) {
      await ctx.db.patch(args.cycleId, {
        plannedCount,
        reusedCount,
        cursor: outcome.lastCursor,
      });
      await ctx.scheduler.runAfter(0, internal.seoCollection.expandSeoCycle, {
        cycleId: args.cycleId,
        cursor: outcome.lastCursor,
      });
      return null;
    }

    await ctx.db.patch(args.cycleId, {
      status: plannedCount > 0 ? "SENDING" : "DONE",
      plannedCount,
      reusedCount,
      cursor: outcome.lastCursor ?? cycle.cursor,
      finishedAt: plannedCount > 0 ? undefined : Date.now(),
    });
    await startSending(ctx, args.cycleId, plannedCount);
    return null;
  },
});

async function startSending(
  ctx: MutationCtx,
  cycleId: Id<"seoCollectionCycles">,
  plannedCount: number,
) {
  // Nothing planned means nothing to drain. An empty queue must start no
  // chains at all — that is the whole reason this pipeline needs no
  // per-minute cron.
  if (plannedCount <= 0) return;
  await ctx.scheduler.runAfter(0, internal.seoCollectionActions.startSeoWorkers, { cycleId });
}

async function expandPage(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  schedule: Doc<"schedules"> | null,
  cursor: Id<"companyWebsites"> | undefined,
): Promise<ExpansionOutcome> {
  const now = new Date(cycle.startedAt);
  const operations = seoSiteOperations();

  let query = ctx.db
    .query("companyWebsites")
    .withIndex("by_company", (q) => q.eq("companyId", cycle.companyId));

  const page = await query.take(SEO_EXPANSION_PAGE + (cursor ? 1 : 0) + PAGE_SLACK);
  const after = cursor ? sliceAfter(page, cursor) : page;
  const websites = after.slice(0, SEO_EXPANSION_PAGE);

  let planned = 0;
  let reused = 0;
  let lastCursor: Id<"companyWebsites"> | null = cursor ?? null;
  let sendIndex = cycle.plannedCount;

  // Every website this page touched, for the bulk operations below. Collected
  // as it goes rather than re-read afterwards, because the same walk already
  // resolves each site's schedule and its competitors.
  const batch: Array<{ websiteId: Id<"websites">; host: string }> = [];

  for (const companyWebsite of websites) {
    lastCursor = companyWebsite._id;

    const resolved = resolveWebsiteSchedule(schedule, companyWebsite, now);
    if (!resolved.active) continue;

    // A website with its own slower schedule is not collected just because its
    // company's turn came round. Absence of an override is what makes a site
    // follow the company; presence is what makes it stop.
    const lastLine = await ctx.db
      .query("seoCycleLines")
      .withIndex("by_company_website", (q) =>
        q.eq("companyId", cycle.companyId).eq("websiteId", companyWebsite.websiteId))
      .order("desc")
      .first();
    if (lastLine && !isWebsiteDue(schedule, companyWebsite, lastLine.createdAt, now)) continue;

    // Bounded rather than collected. A website with more rivals than this is
    // a plan question, not something one transaction should discover the hard
    // way at the moment it runs out of room.
    const competitors = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", companyWebsite._id))
      .take(SEO_COMPETITORS_PER_WEBSITE);

    // A competitor is collected at the rate of the website it is measured
    // against. Numbers from different weeks are not a comparison.
    const targets = [companyWebsite.websiteId, ...competitors.map((row) => row.websiteId)];

    for (const websiteId of targets) {
      const target = await ctx.db.get(websiteId);
      if (target) batch.push({ websiteId, host: target.host });

      for (const operation of operations) {
        if (planned + cycle.plannedCount >= SEO_MAX_SENDS_PER_CYCLE) {
          return { planned, reused, lastCursor, exhausted: false, cappedPlan: true };
        }

        const result = await planPull(ctx, {
          cycle,
          schedule,
          companyWebsite,
          websiteId,
          operationId: operation.id,
          sendIndex,
          now,
        });
        if (result === "REUSED") reused += 1;
        if (result === "PLANNED") {
          planned += 1;
          sendIndex += 1;
        }
      }
    }
  }

  const bulkPlanned = await planBulkPulls(ctx, cycle, batch, sendIndex);

  return {
    planned: planned + bulkPlanned.planned,
    reused: reused + bulkPlanned.reused,
    lastCursor,
    exhausted: after.length <= SEO_EXPANSION_PAGE,
    cappedPlan: false,
  };
}

/**
 * One paid call about every website on this page.
 *
 * DataForSEO's bulk endpoints take up to a thousand targets for a single
 * charge, so a thousand tracked sites costs one call rather than a thousand.
 * This is the cheapest thing the pipeline does by a wide margin.
 *
 * **Batched per page rather than per cycle**, which is a deliberate trade. A
 * cycle-wide batch would be one call for a thousand sites instead of ten, but
 * expansion is chunked and accumulating hosts across pages would mean holding
 * them somewhere between mutations. Ten calls instead of a thousand is already
 * ninety-nine per cent of the saving, for none of the complexity. The page size
 * is well inside every endpoint's cap, so a batch is never refused for length.
 *
 * One pull, many lines. Each website gets its own line so its history is
 * complete, and all but the first are marked as not having paid — because they
 * did not. One charge happened, and the counts have to say so.
 */
async function planBulkPulls(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  batch: Array<{ websiteId: Id<"websites">; host: string }>,
  startIndex: number,
): Promise<{ planned: number; reused: number }> {
  if (batch.length === 0) return { planned: 0, reused: 0 };

  // The same host can arrive twice on one page — a competitor of two sites, or
  // a site somebody also tracks as a rival. It is one target either way.
  const unique = new Map<string, { websiteId: Id<"websites">; host: string }>();
  for (const entry of batch) unique.set(entry.host, entry);
  const hosts = [...unique.values()];

  let planned = 0;
  let reused = 0;
  let sendIndex = startIndex;

  for (const operation of seoBulkOperations()) {
    let params: Record<string, unknown>;
    try {
      params = seoBulkOperationParams(operation, hosts.map((entry) => entry.host));
    } catch {
      // A batch the registry refuses is a bug in the page size, not in the
      // data. Skipping is better than failing a cycle over it.
      continue;
    }

    const idempotencyKey = buildSeoIdempotencyKey({
      operationId: operation.id,
      // A batch has no single website, so the key is keyed on the batch itself.
      // The params hash covers every host in it, so two pages with the same
      // sites in the same order are one question and two different pages are
      // two.
      websiteId: `batch:${hosts.length}`,
      params,
      cycleStartedAt: cycle.startedAt,
    });

    const existing = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    const pullId = existing?._id ?? await ctx.db.insert("seoDataPulls", {
      operationId: operation.id,
      family: operation.family,
      mode: operation.mode,
      companyId: cycle.companyId,
      taskArgsJson: JSON.stringify(params),
      status: "PENDING",
      tag: idempotencyKey,
      idempotencyKey,
      cycleId: cycle._id,
      dueAt: cycle.startedAt + sendIndex * SEO_DUE_SPACING_MS,
      attempts: 0,
      costUsd: 0,
      sandbox: false,
      ...(cycle.agentRunId ? { agentRunId: cycle.agentRunId } : {}),
      submittedAt: Date.now(),
    });

    if (!existing) {
      planned += 1;
      sendIndex += 1;
    }

    for (const [index, entry] of hosts.entries()) {
      await ctx.db.insert("seoCycleLines", {
        cycleId: cycle._id,
        companyId: cycle.companyId,
        websiteId: entry.websiteId,
        operationId: operation.id,
        pullId,
        // One charge covered all of them, so only one line can claim to have
        // paid for it. The rest are true reuse.
        reused: Boolean(existing) || index > 0,
        createdAt: Date.now(),
      });
      if (existing || index > 0) reused += 1;
    }
  }

  return { planned, reused };
}

/**
 * Read one more row than the page needs, so "is there another page" is known
 * without a second query.
 */
const PAGE_SLACK = 1;

function sliceAfter(
  rows: Doc<"companyWebsites">[],
  cursor: Id<"companyWebsites">,
): Doc<"companyWebsites">[] {
  const index = rows.findIndex((row) => row._id === cursor);
  return index === -1 ? rows : rows.slice(index + 1);
}

/**
 * The reuse ladder, in the order money is saved.
 *
 * 1. A finished pull this asker would still call fresh. Costs nothing.
 * 2. A pull already on its way for the same question today. Costs nothing, and
 *    catches two companies whose cycles land in the same hour.
 * 3. Otherwise, plan one.
 *
 * Rungs one and two are matched differently on purpose. Freshness has to look
 * across days — Monday's answer serves Wednesday's asker — so it is found by
 * website and operation and then judged by the asker's own schedule. An
 * in-flight duplicate is only ever *today's*, so it is found by the exact
 * idempotency key, which carries the date.
 */
async function planPull(
  ctx: MutationCtx,
  args: {
    cycle: Doc<"seoCollectionCycles">;
    schedule: Doc<"schedules"> | null;
    companyWebsite: Doc<"companyWebsites">;
    websiteId: Id<"websites">;
    operationId: string;
    sendIndex: number;
    now: Date;
  },
): Promise<"REUSED" | "PLANNED" | "SKIPPED"> {
  const operation = findSeoOperation(args.operationId);
  if (!operation) return "SKIPPED";

  const website = await ctx.db.get(args.websiteId);
  if (!website) return "SKIPPED";

  const params = seoSiteOperationParams(operation, website.host);
  const idempotencyKey = buildSeoIdempotencyKey({
    operationId: operation.id,
    websiteId: args.websiteId,
    params,
    cycleStartedAt: args.cycle.startedAt,
  });

  const fresh = await findFreshPull(ctx, args);
  if (fresh) {
    await writeLine(ctx, args, fresh._id, true);
    return "REUSED";
  }

  const inFlight = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .filter((q) =>
      q.or(
        q.eq(q.field("status"), "PENDING"),
        q.eq(q.field("status"), "CLAIMED"),
        q.eq(q.field("status"), "SUBMITTED"),
      ))
    .first();
  if (inFlight) {
    await writeLine(ctx, args, inFlight._id, true);
    return "REUSED";
  }

  const pullId = await ctx.db.insert("seoDataPulls", {
    operationId: operation.id,
    family: operation.family,
    mode: operation.mode,
    target: website.host,
    websiteId: args.websiteId,
    companyId: args.cycle.companyId,
    taskArgsJson: JSON.stringify(params),
    status: "PENDING",
    tag: idempotencyKey,
    idempotencyKey,
    cycleId: args.cycle._id,
    // Spread across the cycle rather than fired together. One line, and it is
    // the whole of this pipeline's rate limiting and tenant fairness.
    dueAt: args.cycle.startedAt + args.sendIndex * SEO_DUE_SPACING_MS,
    attempts: 0,
    costUsd: 0,
    sandbox: false,
    agentRunId: args.cycle.agentRunId,
    submittedAt: Date.now(),
  });

  await writeLine(ctx, args, pullId, false);
  return "PLANNED";
}

async function findFreshPull(
  ctx: MutationCtx,
  args: {
    schedule: Doc<"schedules"> | null;
    companyWebsite: Doc<"companyWebsites">;
    websiteId: Id<"websites">;
    operationId: string;
    now: Date;
  },
) {
  const recent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_website_submitted", (q) => q.eq("websiteId", args.websiteId))
    .order("desc")
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "READY"),
        q.eq(q.field("operationId"), args.operationId),
      ))
    .first();

  if (!recent?.completedAt) return null;

  // "Fresh enough" is the asker's own cadence, asked of the same helper that
  // decides whether a website is due at all. A weekly watcher handed six-day-old
  // numbers is being served correctly, not short-changed.
  const stale = isWebsiteDue(args.schedule, args.companyWebsite, recent.completedAt, args.now);
  return stale ? null : recent;
}

async function writeLine(
  ctx: MutationCtx,
  args: {
    cycle: Doc<"seoCollectionCycles">;
    websiteId: Id<"websites">;
    operationId: string;
  },
  pullId: Id<"seoDataPulls">,
  reused: boolean,
) {
  await ctx.db.insert("seoCycleLines", {
    cycleId: args.cycle._id,
    companyId: args.cycle.companyId,
    websiteId: args.websiteId,
    operationId: args.operationId,
    pullId,
    reused,
    createdAt: Date.now(),
  });
}
