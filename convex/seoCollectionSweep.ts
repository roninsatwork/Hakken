import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, type Infer } from "convex/values";
import {
  SEO_CLAIM_TIMEOUT_MS,
  SEO_CYCLE_RETENTION_DAYS,
  SEO_RAW_RETENTION_DAYS,
  SEO_RESULT_TIMEOUT_MS,
} from "./seoCollectionPolicy";
import type { MutationCtx } from "./_generated/server";
import {
  countSettled,
  cyclePullIn,
  failUncertainSend,
  finishSeoCycle,
  RESULT_GAVE_UP,
} from "./seoCollectionQueue";
import { dropUnsentRequest } from "./seoCollectionClose";
import { appendRunStep } from "./agentRunStepWriter";

/**
 * The hourly walk round the kitchen.
 *
 * Housekeeping only. It neither plans nor sends: since 2026-09-23 the
 * DataForSEO Planner agent fills the queue and the Collector agent sends it,
 * and nothing else buys data. It used to restart the sending and open
 * collections for websites on their own schedule, both outside any agent.
 *
 * Its duties, in the order they matter:
 *
 *  1. Return claims that no Collector run is coming back for.
 *  2. Collect results whose ping never arrived — collecting is free.
 *  3. Give up on tasks that will never answer.
 *  4. Close cycles whose work is all settled.
 *  5. Close Planner and Collector runs that died without saying so.
 *  6. Clear raw payloads and cycles that have outlived their retention.
 *
 * It never re-posts a task. A submitted task was paid for; if its result is
 * missing the answer is always to fetch it, never to buy it again.
 *
 * **Each duty is its own transaction.** They were one, so a duty that failed
 * undid the rest: on 2026-09-25 closing Korda's collection read more than a
 * function may, and every hour the sweep gave up its late answer, failed, and
 * put everything back as it was. Now a duty that fails is reported and the
 * others still happen.
 *
 * **Each duty works through what it finds, a page at a time.** One page an
 * hour fetched at most 200 answers an hour, re-asking the same oldest ones
 * while the rest waited towards their twelve hours; purged 8 stored answers an
 * hour, far fewer than a day's collection adds; and retired old collections
 * with no limit on the rows deleted (reliability plan 3.3). Now each page is a
 * transaction inside Convex's limits, and a duty takes pages until it is done,
 * its page budget is spent, or the check has run for `SWEEP_TIME_MS`.
 */
const DUTIES = ["reclaim", "chase", "close", "resume", "refile", "stalledRuns", "purgeRaw", "purgeCycles"] as const;
type Duty = (typeof DUTIES)[number];
const dutyValidator = v.union(...DUTIES.map((duty) => v.literal(duty)));

/** Pages each duty may take in one check. Most need one; fetching and the purges can need thousands of rows. */
const PAGES_PER_DUTY: Record<Duty, number> = {
  reclaim: 1,
  chase: 50,
  close: 1,
  resume: 1,
  refile: 10,
  stalledRuns: 1,
  purgeRaw: 250,
  purgeCycles: 25,
};

/** The check takes no new page after this, well inside an action's ten minutes. */
const SWEEP_TIME_MS = 6 * 60 * 1000;

const dutyPage = v.object({
  /** More is waiting, from `cursor` where the duty pages. */
  more: v.boolean(),
  cursor: v.union(v.string(), v.null()),
  /** Jobs this page scheduled, so the next page's start after them rather than all at once. */
  scheduled: v.number(),
});
type DutyPage = Infer<typeof dutyPage>;
const FINISHED: DutyPage = { more: false, cursor: null, scheduled: 0 };

export const sweepSeoCollection = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // One moment for the whole check: a duty's pages must ask the same question.
    const now = Date.now();
    let firstFailure: unknown = null;
    for (const duty of DUTIES) {
      let cursor: string | null = null;
      let scheduled = 0;
      for (let page = 0; page < PAGES_PER_DUTY[duty] && Date.now() - now < SWEEP_TIME_MS; page += 1) {
        try {
          const done: DutyPage = await ctx.runMutation(internal.seoCollectionSweep.sweepDuty, { duty, now, cursor, scheduled });
          scheduled += done.scheduled;
          if (!done.more) break;
          cursor = done.cursor;
        } catch (error) {
          firstFailure ??= error;
          break;
        }
      }
    }
    // Reported to the job ledger as it was raised, once every duty has had its turn.
    if (firstFailure !== null) throw firstFailure;
    return null;
  },
});

export const sweepDuty = internalMutation({
  args: {
    duty: dutyValidator,
    /** When the check began; absent, now. */
    now: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    /** Jobs the duty's earlier pages scheduled. */
    scheduled: v.optional(v.number()),
  },
  returns: dutyPage,
  handler: async (ctx, args): Promise<DutyPage> => {
    const now = args.now ?? Date.now();
    const cursor = args.cursor ?? null;
    const scheduled = args.scheduled ?? 0;
    switch (args.duty) {
      case "reclaim":
        await reclaimStuckClaims(ctx, now);
        return FINISHED;
      case "chase":
        return await chaseMissingResults(ctx, now, cursor, scheduled);
      case "close":
        await closeSettledCycles(ctx);
        return FINISHED;
      case "resume":
        await resumeStalledExpansions(ctx, now);
        return FINISHED;
      case "refile":
        return await refileUnfiled(ctx, now, cursor, scheduled);
      case "stalledRuns":
        await closeStalledRuns(ctx, now);
        return FINISHED;
      case "purgeRaw":
        return await purgeExpiredRaw(ctx, now);
      case "purgeCycles":
        return await purgeExpiredCycles(ctx, now);
    }
  },
});

/**
 * A claim older than the timeout belonged to a chain that died.
 *
 * Returned to `PENDING` only if it never reached the send: a claim is taken
 * *before* anything is sent, and a row with no `postedAt` was never charged
 * for, so it is safe to try again. One marked as being sent may have been
 * charged even though its answer was never recorded — it is failed instead
 * (2026-09-25: returning those to the queue bought them twice). A row that
 * did get recorded has a task id and is `SUBMITTED`, which this never touches.
 */
async function reclaimStuckClaims(ctx: MutationCtx, now: number) {
  const stuck = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_status_due", (q) => q.eq("status", "CLAIMED"))
    .take(SWEEP_PAGE);

  for (const row of stuck) {
    if (now - (row.claimedAt ?? now) < SEO_CLAIM_TIMEOUT_MS) continue;
    // A run closed by hand buys nothing more: its dead claim is dropped, not
    // put back in the queue for the next Collector to send. Known by what the
    // close took off the queue, which outlives the closer's name.
    const cycle = row.cycleId ? await ctx.db.get(row.cycleId) : null;
    if (cycle?.closedUnsent !== undefined && row.cycleId) {
      await dropUnsentRequest(ctx, row._id, row.cycleId);
      // Still needed by another run: it moved there, and goes back in the queue for it.
      if (await ctx.db.get(row._id)) {
        await ctx.db.patch(row._id, { status: "PENDING", dueAt: now, claimedBy: undefined, claimedAt: undefined, postedAt: undefined });
      }
      continue;
    }
    // Marked as being sent: DataForSEO may have it and have charged for it, so
    // it is failed, not bought again. If it did take it, its pingback still
    // finds it by its tag and its answer is filed.
    if (row.postedAt !== undefined) {
      await failUncertainSend(ctx, row, "the Collector stopped after sending it, before its answer was recorded");
      continue;
    }
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
 * cost is nil. Only those out for an hour are read — a younger one's ping may
 * still come — every one of them each hour, oldest first, and the fetches
 * spaced out rather than all sent at once.
 */
async function chaseMissingResults(
  ctx: MutationCtx,
  now: number,
  cursor: string | null,
  scheduledBefore: number,
): Promise<DutyPage> {
  const page = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_status_submitted", (q) => q.eq("status", "SUBMITTED").lt("submittedAt", now - CHASE_AFTER_MS))
    .order("asc")
    .paginate({ cursor, numItems: SWEEP_PAGE });

  let scheduled = 0;
  for (const row of page.page) {
    const age = now - (row.sentAt ?? row.submittedAt);

    if (age > SEO_RESULT_TIMEOUT_MS) {
      // Twelve hours is not a wait any more. Marked failed and never
      // re-posted: it was paid for, and buying it again would be paying twice
      // for silence.
      await ctx.db.patch(row._id, { status: "FAILED", error: RESULT_GAVE_UP, completedAt: now });
      // Counted, so the run's failed figure is true; a late pingback revives it.
      await countSettled(ctx, row, "FAILED", 0, "RESULT");
      continue;
    }

    if (age < CHASE_AFTER_MS) continue;
    if (!row.taskId) continue;

    await ctx.scheduler.runAfter((scheduledBefore + scheduled) * FETCH_SPACING_MS, internal.seoCollectionActions.fetchSeoResult, {
      pullId: row._id,
    });
    scheduled += 1;
  }
  return { more: !page.isDone, cursor: page.isDone ? null : page.continueCursor, scheduled };
}

/** An expansion quiet this long has died: its next page never ran. */
const EXPANSION_IDLE_MS = 15 * 60 * 1000;

/** Restarts before a collection whose work list will not write is closed. */
const EXPANSION_RESTARTS = 3;

/**
 * Restart a collection whose work list stopped being written.
 *
 * A page of expansion that fails is not retried, and a collection left
 * "writing its list" held up every collection after it for that company, for
 * ever (2026-09-25). Restarted from where it got to — a page is one
 * transaction, so a failed one wrote nothing — and closed, saying so, if it
 * keeps stopping; what it had already queued is still sent.
 */
async function resumeStalledExpansions(ctx: MutationCtx, now: number) {
  const expanding = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_status", (q) => q.eq("status", "EXPANDING"))
    .take(SWEEP_PAGE);
  for (const cycle of expanding) {
    if (now - (cycle.expandedAt ?? cycle.startedAt) < EXPANSION_IDLE_MS) continue;
    const restarts = cycle.expandRestarts ?? 0;
    if (restarts >= EXPANSION_RESTARTS) {
      await ctx.db.patch(cycle._id, {
        status: "FAILED",
        finishedAt: now,
        error: `Writing this collection's work list stopped ${restarts + 1} times, so it was closed and the next `
          + "collection can start. What it had already queued is still sent.",
      });
      continue;
    }
    await ctx.db.patch(cycle._id, { expandRestarts: restarts + 1, expandedAt: now });
    await ctx.scheduler.runAfter(0, internal.seoCollection.expandSeoCycle, {
      cycleId: cycle._id,
      ...(cycle.cursor ? { cursor: cycle.cursor } : {}),
      ...(cycle.cursorCreatedAt !== undefined ? { cursorCreatedAt: cycle.cursorCreatedAt } : {}),
      ...(cycle.cursorStep ? { step: cycle.cursorStep } : {}),
    });
  }
}

/**
 * Answers are marked filed from this moment (collection reliability plan,
 * 1.11). Those recorded before it were filed before the mark existed, and are
 * never taken for unfiled.
 */
const FILING_MARKS_FROM = Date.parse("2026-09-25T10:45:00Z");

/** Filings tried before an answer is left, unfiled and saying why, for a person. */
const FILE_TRIES = 3;

/** Unfiled this long after it was recorded, an answer's filing has died. */
const REFILE_AFTER_MS = 30 * 60 * 1000;

/**
 * File again the answers recorded and never filed — a filing that crashed,
 * failed for a reason other than a clash, or was never started. The answer is
 * stored, so filing again costs nothing, and filing replaces rather than adds.
 * Newest first, so answers left unfiled after every try never crowd out the
 * rest; spaced out, so a backlog is not filed all at once.
 */
async function refileUnfiled(
  ctx: MutationCtx,
  now: number,
  cursor: string | null,
  scheduledBefore: number,
): Promise<DutyPage> {
  const page = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_status_filed_completed", (q) =>
      q.eq("status", "READY").eq("filedAt", undefined)
        .gte("completedAt", FILING_MARKS_FROM).lt("completedAt", now - REFILE_AFTER_MS))
    .order("desc")
    .paginate({ cursor, numItems: SWEEP_PAGE });
  let scheduled = 0;
  for (const row of page.page) {
    if ((row.fileAttempts ?? 0) >= FILE_TRIES) continue;
    await ctx.scheduler.runAfter((scheduledBefore + scheduled) * REFILE_SPACING_MS, internal.seoCollectionParse.parseSeoResult, {
      pullId: row._id,
    });
    scheduled += 1;
  }
  return { more: !page.isDone, cursor: page.isDone ? null : page.continueCursor, scheduled };
}

/** The DataForSEO agents, whose runs do fixed work and say when they end. */
const SEO_ROLES = ["DATAFORSEO_PLANNER", "DATAFORSEO_COLLECTOR"] as const;

/** Past this, a run still "running" has died: an action is stopped at ten minutes. */
const RUN_LIFE_MS = 20 * 60 * 1000;

/** A role's newest runs past that life, looked at each hour. */
const STALLED_RUNS_READ = 50;

export const RUN_STALLED =
  "This run stopped without finishing — the platform ended it, at its time limit or a restart — so it never said how it went.";

/**
 * Close a Planner or Collector run that died without saying so. One stopped
 * by the platform — at an action's ten minutes, or by a restart — never
 * reached its own ending, and read "Running" for ever in its Observability
 * timeline and on the Scheduler (reliability plan 3.1). Closed as failed,
 * saying why, with its workflow execution.
 */
async function closeStalledRuns(ctx: MutationCtx, now: number) {
  for (const role of SEO_ROLES) {
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", role)).first();
    if (!agent) continue;
    const old = await ctx.db
      .query("agentRuns")
      .withIndex("by_agent_started", (q) => q.eq("agentId", agent._id).lt("startedAt", now - RUN_LIFE_MS))
      .order("desc")
      .take(STALLED_RUNS_READ);
    for (const run of old) {
      if (run.status !== "QUEUED" && run.status !== "RUNNING") continue;
      await appendRunStep(ctx, {
        runId: run._id,
        agentId: agent._id,
        kind: "FINAL",
        status: "FAILED",
        output: RUN_STALLED,
        error: RUN_STALLED,
      });
      await ctx.db.patch(run._id, { status: "FAILED", finalOutput: RUN_STALLED, error: RUN_STALLED, completedAt: now, updatedAt: now });
      // Its workflow execution, started with it, is found by its start.
      const executions = await ctx.db
        .query("workflowExecutions")
        .withIndex("by_startedAt", (q) => q.gte("startedAt", run.startedAt - 60_000).lte("startedAt", run.startedAt + 60_000))
        .take(50);
      for (const execution of executions) {
        if (execution.agentRunId === run._id && execution.status === "RUNNING") {
          await ctx.db.patch(execution._id, { status: "FAILED", completedAt: now });
        }
      }
    }
  }
}

/** A cycle with nothing left in flight is finished. */
async function closeSettledCycles(ctx: MutationCtx) {
  const open = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_status", (q) => q.eq("status", "SENDING"))
    .take(SWEEP_PAGE);

  const collecting = await ctx.db
    .query("seoCollectionCycles")
    .withIndex("by_status", (q) => q.eq("status", "COLLECTING"))
    .take(SWEEP_PAGE);

  for (const cycle of [...open, ...collecting]) {
    const unsettled = await cyclePullIn(ctx, cycle._id, ["PENDING", "CLAIMED", "SUBMITTED"]);

    if (unsettled) {
      if (cycle.status === "SENDING") await ctx.db.patch(cycle._id, { status: "COLLECTING" });
      continue;
    }

    await finishSeoCycle(ctx, cycle._id);
  }
}


/**
 * Drop raw payloads past their window, keeping the pull row itself.
 *
 * The raw response exists so a parser bug can be fixed and re-run rather than
 * re-bought; after a month that is no longer a real possibility and the bytes
 * are pure cost. The row stays because it is the cost record, and a cost
 * record has to be checkable against an invoice long after the payload is
 * useless. An answer kept in parts may lose them over two pages; one missing a
 * part reads as no answer (`readPullAnswerParts`), as it is on its way out.
 */
async function purgeExpiredRaw(ctx: MutationCtx, now: number): Promise<DutyPage> {
  const cutoff = now - SEO_RAW_RETENTION_DAYS * DAY_MS;

  // The answers live apart from the requests since 2026-09-25, oldest first.
  const old = await ctx.db
    .query("seoPullAnswers")
    .withIndex("by_stored", (q) => q.lt("storedAt", cutoff))
    .take(ANSWER_PURGE_PAGE);
  for (const answer of old) await ctx.db.delete(answer._id);
  return { ...FINISHED, more: old.length === ANSWER_PURGE_PAGE };
}

/**
 * Answer rows cleared per page. Each is read to be deleted and can run to
 * 900 KB, so eight keep a page well inside the sixteen megabytes a function
 * may read; the check takes as many pages as there are rows to clear.
 */
const ANSWER_PURGE_PAGE = 8;

/**
 * Retire cycles and their lines together.
 *
 * A cycle is the unit a screen shows, so it is the unit retention removes —
 * with its report, which nothing can show once its cycle has gone. Every way a
 * cycle ends is retired, not only DONE: a failed or capped one was kept for
 * ever. Never one with a request still to go or out.
 * **Pulls are never purged by cycle** — a pull may still be the freshest
 * answer for a company whose cycle is long gone, and deleting it would make
 * the next cycle buy data we already hold.
 *
 * A page deletes at most `RETIRE_WRITES` rows: a cycle's lines run to
 * thousands, and two hundred cycles' lines at once were past what one
 * transaction may write (reliability plan 3.3).
 */
async function purgeExpiredCycles(ctx: MutationCtx, now: number): Promise<DutyPage> {
  const cutoff = now - SEO_CYCLE_RETENTION_DAYS * DAY_MS;
  let writes = 0;
  let more = false;

  for (const status of RETIRED_STATES) {
    // Oldest first: the index keeps a status's cycles in the order they began.
    const oldest = await ctx.db
      .query("seoCollectionCycles")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(CYCLES_PER_PAGE);

    for (const cycle of oldest) {
      if (cycle.startedAt >= cutoff) continue;
      if (writes >= RETIRE_WRITES) return { ...FINISHED, more: true };
      if (await cyclePullIn(ctx, cycle._id, ["PENDING", "CLAIMED", "SUBMITTED"])) continue;

      const lines = await ctx.db
        .query("seoCycleLines")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
        .take(RETIRE_WRITES - writes);
      for (const line of lines) await ctx.db.delete(line._id);
      writes += lines.length;
      // Only retire the cycle once its lines are gone, so an interrupted page
      // leaves orphaned lines rather than a cycle nobody will ever revisit.
      if (writes >= RETIRE_WRITES) return { ...FINISHED, more: true };

      const report = await ctx.db
        .query("seoRunReports")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
        .first();
      if (report) await ctx.db.delete(report._id);
      await ctx.db.delete(cycle._id);
      writes += report ? 2 : 1;
    }
    // A full page of this state, the last of it past retention: there may be more behind.
    const last = oldest[oldest.length - 1];
    if (oldest.length === CYCLES_PER_PAGE && last && last.startedAt < cutoff) more = true;
  }
  return { ...FINISHED, more };
}

/** How a collection can end. Each is retired after `SEO_CYCLE_RETENTION_DAYS`. */
const RETIRED_STATES = ["DONE", "FAILED", "CAPPED_PLAN"] as const;

/** Cycles of each end state looked at per page of retirement. */
const CYCLES_PER_PAGE = 200;

/** Rows one page of retirement deletes at most: well inside what a transaction may write. */
const RETIRE_WRITES = 2_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How much the sweep looks at per duty. It runs hourly; it need not be greedy. */
const SWEEP_PAGE = 200;

/** How long a submitted task waits for its ping before we go and ask. */
const CHASE_AFTER_MS = 60 * 60 * 1000;

/**
 * Between one chased fetch and the next: ten a second, so a backlog of
 * thousands is asked for over minutes, well inside DataForSEO's rate limit,
 * rather than all at once.
 */
const FETCH_SPACING_MS = 100;

/** Between one re-filing and the next: filing writes hundreds of rows. */
const REFILE_SPACING_MS = 1_000;
