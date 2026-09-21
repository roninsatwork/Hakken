import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  SEO_CLAIM_TIMEOUT_MS,
  SEO_CYCLE_RETENTION_DAYS,
  SEO_RAW_RETENTION_DAYS,
  SEO_RESULT_TIMEOUT_MS,
} from "./seoCollectionPolicy";
import { isWebsiteDue } from "./seoScheduleService";
import type { MutationCtx } from "./_generated/server";

/**
 * The hourly walk round the kitchen.
 *
 * It exists to catch failure, not to drive normal operation — which is why it
 * is hourly and not every minute. Normal operation is the worker chains
 * scheduling themselves; when they are working, this finds nothing. The price
 * of a self-scheduling chain is that it can die quietly, and this is that
 * price paid.
 *
 * Five duties, in the order they matter:
 *
 *  1. Return claims that no worker is coming back for.
 *  2. Collect results whose ping never arrived.
 *  3. Give up on tasks that will never answer.
 *  4. Close cycles whose work is all settled.
 *  5. Restart the drain if anything is due and nothing is running.
 *  6. Clear raw payloads and cycles that have outlived their retention.
 *
 * It never re-posts a task. A submitted task was paid for; if its result is
 * missing the answer is always to fetch it, never to buy it again.
 */
export const sweepSeoCollection = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    await reclaimStuckClaims(ctx, now);
    await chaseMissingResults(ctx, now);
    await closeSettledCycles(ctx, now);
    await startOverrideCycles(ctx, now);
    await restartDrainIfDue(ctx, now);
    await purgeExpiredRaw(ctx, now);
    await purgeExpiredCycles(ctx, now);

    return null;
  },
});

/**
 * A claim older than the timeout belonged to a chain that died.
 *
 * Returned to `PENDING` rather than failed, because a claim is taken *before*
 * anything is sent: a row still holding a claim and no task id was never
 * charged for, so it is safe to try again. A row that did get sent has a task
 * id and is `SUBMITTED`, which this never touches.
 */
async function reclaimStuckClaims(ctx: MutationCtx, now: number) {
  const stuck = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_status_due", (q) => q.eq("status", "CLAIMED"))
    .take(SWEEP_PAGE);

  for (const row of stuck) {
    if (now - (row.claimedAt ?? now) < SEO_CLAIM_TIMEOUT_MS) continue;
    await ctx.db.patch(row._id, {
      status: "PENDING",
      claimedBy: undefined,
      claimedAt: undefined,
      dueAt: now,
    });
  }
}

/**
 * Submitted tasks whose pingback never came.
 *
 * A lost callback is ordinary — it is one HTTP request over the open internet
 * with a ten-second timeout — so this is the path that makes the pingback an
 * optimisation rather than a dependency. Each of these is simply fetched; the
 * cost is nil.
 */
async function chaseMissingResults(ctx: MutationCtx, now: number) {
  const waiting = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_status_submitted", (q) => q.eq("status", "SUBMITTED"))
    .order("asc")
    .take(SWEEP_PAGE);

  for (const row of waiting) {
    const age = now - (row.sentAt ?? row.submittedAt);

    if (age > SEO_RESULT_TIMEOUT_MS) {
      // A day is not a wait any more. Marked failed and never re-posted: it
      // was paid for, and buying it again would be paying twice for silence.
      await ctx.db.patch(row._id, {
        status: "FAILED",
        error: "DataForSEO never returned a result for this task.",
        completedAt: now,
      });
      continue;
    }

    if (age < CHASE_AFTER_MS) continue;
    if (!row.taskId) continue;

    await ctx.scheduler.runAfter(0, internal.seoCollectionActions.fetchSeoResult, {
      pullId: row._id,
    });
  }
}

/** A cycle with nothing left in flight is finished. */
async function closeSettledCycles(ctx: MutationCtx, now: number) {
  const open = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_status", (q) => q.eq("status", "SENDING"))
    .take(SWEEP_PAGE);

  const collecting = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_status", (q) => q.eq("status", "COLLECTING"))
    .take(SWEEP_PAGE);

  for (const cycle of [...open, ...collecting]) {
    const unsettled = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "PENDING"),
          q.eq(q.field("status"), "CLAIMED"),
          q.eq(q.field("status"), "SUBMITTED"),
        ))
      .first();

    if (unsettled) {
      if (cycle.status === "SENDING") await ctx.db.patch(cycle._id, { status: "COLLECTING" });
      continue;
    }

    await ctx.db.patch(cycle._id, { status: "DONE", finishedAt: now });
  }
}

/**
 * Websites whose own schedule is faster than their company's.
 *
 * A company on weekly holding one site set to daily gets a cycle from the
 * dispatcher once a week; the other six days are these. Opened as
 * `OVERRIDE_SWEEP` so a screen can say plainly why a run appeared on a day
 * nobody scheduled.
 *
 * Bounded per sweep, because this walks overrides rather than schedules and
 * there is no index that can ask "which of these is due" directly.
 */
async function startOverrideCycles(ctx: MutationCtx, now: number) {
  const overridden = await ctx.db
    .query("companyWebsites")
    .filter((q) => q.neq(q.field("refreshIntervalStr"), undefined))
    .take(SWEEP_PAGE);

  const started = new Set<string>();

  for (const companyWebsite of overridden) {
    if (started.has(companyWebsite.companyId)) continue;

    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_company_agent", (q) => q.eq("companyId", companyWebsite.companyId))
      .first();

    const lastLine = await ctx.db
      .query("seoCycleLines")
      .withIndex("by_company_website", (q) =>
        q.eq("companyId", companyWebsite.companyId).eq("websiteId", companyWebsite.websiteId))
      .order("desc")
      .first();

    if (!isWebsiteDue(schedule, companyWebsite, lastLine?.createdAt, new Date(now))) continue;

    const running = await ctx.db
      .query("seoCollectionCycles")
      .withIndex("by_company_started", (q) => q.eq("companyId", companyWebsite.companyId))
      .order("desc")
      .first();
    // One open cycle per company at a time. A second would plan the same work
    // and, but for the idempotency key, buy it twice.
    if (running && !TERMINAL.includes(running.status)) continue;

    const cycleId = await ctx.db.insert("seoCollectionCycles", {
      companyId: companyWebsite.companyId,
      ...(schedule ? { scheduleId: schedule._id } : {}),
      trigger: "OVERRIDE_SWEEP",
      status: "EXPANDING",
      plannedCount: 0,
      reusedCount: 0,
      sentCount: 0,
      readyCount: 0,
      failedCount: 0,
      totalCostUsd: 0,
      startedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.seoCollection.expandSeoCycle, { cycleId });
    started.add(companyWebsite.companyId);
  }
}

/**
 * Anything due and nothing draining it.
 *
 * Starting a second set of chains beside a live one is harmless, because
 * claiming is atomic — the extra chains find nothing and stop. That is why
 * liveness is never tracked: it would be a second piece of state to get wrong
 * in exchange for avoiding a no-op.
 */
async function restartDrainIfDue(ctx: MutationCtx, now: number) {
  const due = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_status_due", (q) => q.eq("status", "PENDING").lte("dueAt", now))
    .first();
  if (!due) return;

  await ctx.scheduler.runAfter(0, internal.seoCollectionActions.startSeoWorkers, {});
}

/**
 * Drop raw payloads past their window, keeping the pull row itself.
 *
 * The raw response exists so a parser bug can be fixed and re-run rather than
 * re-bought; after a month that is no longer a real possibility and the bytes
 * are pure cost. The row stays because it is the cost record, and a cost
 * record has to be checkable against an invoice long after the payload is
 * useless.
 */
async function purgeExpiredRaw(ctx: MutationCtx, now: number) {
  const cutoff = now - SEO_RAW_RETENTION_DAYS * DAY_MS;

  const old = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_submitted", (q) => q.lt("submittedAt", cutoff))
    .order("asc")
    .take(SWEEP_PAGE);

  for (const row of old) {
    if (!row.resultJson) continue;
    await ctx.db.patch(row._id, { resultJson: undefined });
  }
}

/**
 * Retire cycles and their lines together.
 *
 * A cycle is the unit a screen shows, so it is the unit retention removes.
 * **Pulls are never purged by cycle** — a pull may still be the freshest
 * answer for a company whose cycle is long gone, and deleting it would make
 * the next cycle buy data we already hold.
 */
async function purgeExpiredCycles(ctx: MutationCtx, now: number) {
  const cutoff = now - SEO_CYCLE_RETENTION_DAYS * DAY_MS;

  const old = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_status", (q) => q.eq("status", "DONE"))
    .take(SWEEP_PAGE);

  for (const cycle of old) {
    if (cycle.startedAt >= cutoff) continue;

    const lines = await ctx.db
      .query("seoCycleLines")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
      .take(SWEEP_PAGE);
    for (const line of lines) await ctx.db.delete(line._id);

    // Only retire the cycle once its lines are gone, so an interrupted sweep
    // leaves orphaned lines rather than a cycle nobody will ever revisit.
    if (lines.length < SWEEP_PAGE) await ctx.db.delete(cycle._id);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

const TERMINAL = ["DONE", "FAILED", "CAPPED_PLAN", "CAPPED_SPEND"];

/** How much the sweep looks at per duty. It runs hourly; it need not be greedy. */
const SWEEP_PAGE = 200;

/** How long a submitted task waits for its ping before we go and ask. */
const CHASE_AFTER_MS = 60 * 60 * 1000;
