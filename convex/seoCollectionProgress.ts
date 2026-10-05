import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminQuery } from "./tenantFunctions";
import { creditsForUnits, ukDayStart } from "./creditKinds";
import { collectorSending } from "./seoAgentRuns";
import { dayCeilingReached } from "./seoCollectionLimits";
import { SEO_RESULT_TIMEOUT_MS } from "./seoCollectionPolicy";
import { lastMoved, ROLE_RUN_LIVE_MS } from "./roleRuns";

/**
 * What Collection pipeline's **Collecting now** reads: every collection and
 * Search Console download going, or finished today, and what each is doing
 * (docs/plans/active/collection-progress-plan.md, the screen approved
 * 2026-10-05 — Anthony: "I don't see what it's working on, just waiting").
 *
 * Super admin only: it names every company's collections side by side and
 * what each really cost, as the rest of the pipeline screen does.
 *
 * Every read is bounded. The counts of requests waiting and out are read to a
 * ceiling (`COUNTED_TO`), past which a row says "500+"; a company's whole
 * collection is never summed request by request.
 */

/** Requests read per collection, per state, to count them. */
const COUNTED_TO = 500;
/** Collections read per state. */
const CYCLES_READ = 30;
/** Search Console runs read. */
const SEARCH_CONSOLE_RUNS_READ = 30;
/** Answers of one call read to say how long it usually takes. */
const ANSWERS_READ_FOR_TYPICAL = 40;
/** A live request takes a few seconds and five go at once; a queued hundred go in one request. */
const LIVE_SECONDS_EACH = 1.6;
const QUEUED_SECONDS_PER_HUNDRED = 3;

const show = v.union(v.literal("IN_PROGRESS"), v.literal("FINISHED_TODAY"), v.literal("EVERYTHING"));

const state = v.union(
  /** The work list is still being written. */
  v.literal("WRITING"),
  v.literal("SENDING"),
  /** Requests are due and the Collector is starting; the hourly check is the net. */
  v.literal("WAITING_TO_SEND"),
  /** Everything is sent; answers are still out. */
  v.literal("ANSWERS"),
  /** Everything is back; the collection is closing. */
  v.literal("CLOSING"),
  v.literal("DONE"),
  /** Stopped for something only a person can fix; `needsYou` says what. */
  v.literal("NEEDS_YOU"),
  /** Stopped short — at its plan's limit, or failed; `stopped` says why. */
  v.literal("STOPPED"),
  /** A Search Console download going. */
  v.literal("DOWNLOADING"),
);

const outGroup = v.object({
  operationId: v.string(),
  count: v.number(),
  hosts: v.array(v.string()),
  /** When the first of them went out. */
  since: v.number(),
  /** When the first is given up on, if it never answers. */
  givesUpAt: v.number(),
  /** How long this call's answers have usually taken, from its recent ones; null with too few to say. */
  typicalMs: v.union(v.number(), v.null()),
});

const row = v.object({
  key: v.string(),
  kind: v.union(v.literal("COLLECTION"), v.literal("SEARCH_CONSOLE")),
  companyName: v.string(),
  /** The website, for a Search Console download. */
  host: v.union(v.string(), v.null()),
  how: v.union(v.literal("COLLECT_NOW"), v.literal("SCHEDULE"), v.literal("PLANNER_TEST"), v.literal("FIRST_DAYS"), v.literal("NEWEST_DAYS")),
  startedAt: v.number(),
  finishedAt: v.union(v.number(), v.null()),
  startedBy: v.union(v.string(), v.null()),
  state,
  needsYou: v.union(v.string(), v.null()),
  stopped: v.union(v.string(), v.null()),
  planned: v.number(),
  back: v.number(),
  out: v.number(),
  toSend: v.number(),
  /** Counted to `COUNTED_TO`: more than it says. */
  countsCut: v.boolean(),
  failed: v.number(),
  reused: v.number(),
  /** What is being sent, when something is. */
  sending: v.union(v.null(), v.object({ host: v.union(v.string(), v.null()), operationId: v.string() })),
  outGroups: v.array(outGroup),
  sendSecondsLeft: v.union(v.number(), v.null()),
  costUsd: v.union(v.number(), v.null()),
  credits: v.union(v.number(), v.null()),
  /** Counted on Usage yet — at the end of a collection. */
  creditsCounted: v.boolean(),
  cycleId: v.union(v.id("seoCollectionCycles"), v.null()),
  /** A Search Console download: its days fetched of all it fetches, the rows, and the step it is on. */
  days: v.union(v.null(), v.object({
    done: v.number(),
    total: v.number(),
    rows: v.number(),
    latest: v.union(v.string(), v.null()),
    /** Its connection was found, so its rows are its own: none means Google had nothing. */
    known: v.boolean(),
  })),
});

export const listCollectionsNow = superAdminQuery({
  args: { show },
  returns: v.object({
    headline: v.object({
      kind: v.union(v.literal("SENDING"), v.literal("WORKING"), v.literal("NEEDS_YOU"), v.literal("IDLE")),
      needsYou: v.union(v.string(), v.null()),
      sendingFor: v.union(v.string(), v.null()),
      collections: v.number(),
      downloads: v.number(),
    }),
    rows: v.array(row),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const dayStart = ukDayStart(now);
    const sending = await collectorSending(ctx);
    const ceiling = await dayCeilingReached(ctx);
    const typical = new Map<string, number | null>();

    const going: Doc<"seoCollectionCycles">[] = [];
    for (const status of ["EXPANDING", "SENDING", "COLLECTING"] as const) {
      going.push(...await ctx.db.query("seoCollectionCycles").withIndex("by_status", (q) => q.eq("status", status)).order("desc").take(CYCLES_READ));
    }
    const finished: Doc<"seoCollectionCycles">[] = [];
    if (args.show !== "IN_PROGRESS") {
      for (const status of ["DONE", "CAPPED_PLAN", "CAPPED_SPEND", "FAILED"] as const) {
        const recent = await ctx.db.query("seoCollectionCycles").withIndex("by_status", (q) => q.eq("status", status)).order("desc").take(CYCLES_READ);
        finished.push(...recent.filter((cycle) => (cycle.finishedAt ?? cycle.startedAt) >= dayStart));
      }
    }
    const cycles = [...(args.show === "FINISHED_TODAY" ? [] : going), ...finished];

    const rows: Array<typeof row.type> = [];
    for (const cycle of cycles) rows.push(await collectionRow(ctx, cycle, { now, sending, ceiling, typical }));
    rows.push(...await searchConsoleRows(ctx, args.show, now, dayStart));
    rows.sort((left, right) => Number(left.finishedAt !== null) - Number(right.finishedAt !== null) || right.startedAt - left.startedAt);

    const inProgress = rows.filter((entry) => entry.finishedAt === null);
    const blocked = inProgress.find((entry) => entry.state === "NEEDS_YOU");
    const sendingRow = inProgress.find((entry) => entry.state === "SENDING");
    return {
      headline: {
        kind: blocked ? "NEEDS_YOU" as const : sendingRow ? "SENDING" as const : inProgress.length > 0 ? "WORKING" as const : "IDLE" as const,
        needsYou: blocked?.needsYou ?? null,
        sendingFor: sendingRow?.companyName ?? null,
        collections: inProgress.filter((entry) => entry.kind === "COLLECTION").length,
        downloads: inProgress.filter((entry) => entry.kind === "SEARCH_CONSOLE").length,
      },
      rows,
    };
  },
});

async function collectionRow(
  ctx: QueryCtx,
  cycle: Doc<"seoCollectionCycles">,
  context: { now: number; sending: boolean; ceiling: string | null; typical: Map<string, number | null> },
): Promise<typeof row.type> {
  const company = await ctx.db.get(cycle.companyId);
  const run = cycle.agentRunId ? await ctx.db.get(cycle.agentRunId) : null;
  const starter = run?.userId ? await ctx.db.get(run.userId) : null;

  const waiting = [
    ...await pullsIn(ctx, cycle._id, "CLAIMED"),
    ...await pullsIn(ctx, cycle._id, "PENDING"),
  ];
  const outRows = await pullsIn(ctx, cycle._id, "SUBMITTED");
  const countsCut = waiting.length >= COUNTED_TO || outRows.length >= COUNTED_TO;
  const claimed = waiting.find((pull) => pull.status === "CLAIMED");
  const live = waiting.filter((pull) => pull.mode === "LIVE").length;
  const queued = waiting.length - live;

  const finishedAt = cycle.status === "EXPANDING" || cycle.status === "SENDING" || cycle.status === "COLLECTING" ? null : (cycle.finishedAt ?? null);
  let state: typeof row.type.state;
  let needsYou: string | null = null;
  let stopped: string | null = null;
  if (finishedAt !== null) {
    state = cycle.status === "DONE" ? "DONE" : "STOPPED";
    if (state === "STOPPED") stopped = cycle.cappedReason ?? cycle.error ?? null;
  } else if (cycle.status === "EXPANDING") {
    state = "WRITING";
  } else if (waiting.length > 0) {
    if (context.sending) state = "SENDING";
    else if (context.ceiling) {
      state = "NEEDS_YOU";
      needsYou = `Stopped: ${context.ceiling}.`;
    } else state = "WAITING_TO_SEND";
  } else {
    state = outRows.length > 0 ? "ANSWERS" : "CLOSING";
  }

  const outGroups = await groupOut(ctx, outRows, context.typical);
  const { credits, counted } = await creditsOf(ctx, cycle._id);
  const back = cycle.readyCount;
  return {
    key: cycle._id,
    kind: "COLLECTION",
    companyName: company?.name ?? "—",
    host: null,
    how: cycle.trigger !== "MANUAL" ? "SCHEDULE" : run?.title?.startsWith("Collect now") ? "COLLECT_NOW" : "PLANNER_TEST",
    startedAt: cycle.startedAt,
    finishedAt,
    startedBy: starter?.name ?? null,
    state,
    needsYou,
    stopped,
    planned: Math.max(cycle.plannedCount, back + outRows.length + waiting.length + cycle.failedCount),
    back,
    out: outRows.length,
    toSend: waiting.length,
    countsCut,
    failed: cycle.failedCount,
    reused: cycle.reusedCount,
    sending: state === "SENDING" ? sendingNow(claimed ?? waiting[0]) : null,
    outGroups,
    sendSecondsLeft: waiting.length > 0 ? Math.round(live * LIVE_SECONDS_EACH + Math.ceil(queued / 100) * QUEUED_SECONDS_PER_HUNDRED) : null,
    costUsd: cycle.totalCostUsd,
    credits,
    creditsCounted: counted,
    cycleId: cycle._id,
    days: null,
  };
}

function sendingNow(pull: Doc<"seoDataPulls"> | undefined) {
  return pull ? { host: pull.target ?? null, operationId: pull.operationId } : null;
}

async function pullsIn(ctx: QueryCtx, cycleId: Id<"seoCollectionCycles">, status: "PENDING" | "CLAIMED" | "SUBMITTED") {
  return await ctx.db.query("seoDataPulls").withIndex("by_cycle_status", (q) => q.eq("cycleId", cycleId).eq("status", status)).take(COUNTED_TO);
}

/** What is out, by call: how many, which websites, since when, and how long such answers usually take. */
async function groupOut(ctx: QueryCtx, out: Doc<"seoDataPulls">[], typical: Map<string, number | null>) {
  const groups = new Map<string, Doc<"seoDataPulls">[]>();
  for (const pull of out) groups.set(pull.operationId, [...(groups.get(pull.operationId) ?? []), pull]);
  const result = [];
  for (const [operationId, pulls] of groups) {
    if (!typical.has(operationId)) typical.set(operationId, await typicalAnswerMs(ctx, operationId));
    const since = Math.min(...pulls.map((pull) => pull.submittedAt));
    result.push({
      operationId,
      count: pulls.length,
      hosts: [...new Set(pulls.map((pull) => pull.target).filter((host): host is string => Boolean(host)))].slice(0, 3),
      since,
      givesUpAt: since + SEO_RESULT_TIMEOUT_MS,
      typicalMs: typical.get(operationId) ?? null,
    });
  }
  return result.sort((left, right) => left.since - right.since);
}

/** The middle of how long this call's recent answers took to come back, or null with fewer than three. */
async function typicalAnswerMs(ctx: QueryCtx, operationId: string): Promise<number | null> {
  const recent = await ctx.db
    .query("seoDataPulls")
    .withIndex("by_operation_submitted", (q) => q.eq("operationId", operationId))
    .order("desc")
    .take(ANSWERS_READ_FOR_TYPICAL);
  const took = recent
    .filter((pull) => pull.status === "READY" && pull.mode === "QUEUED" && pull.completedAt !== undefined)
    .map((pull) => pull.completedAt! - pull.submittedAt)
    .filter((ms) => ms > 0)
    .sort((left, right) => left - right);
  return took.length >= 3 ? took[Math.floor(took.length / 2)] : null;
}

/** The credits a collection counts: as charged once it closed, or as its open charges would count them now. */
async function creditsOf(ctx: QueryCtx, cycleId: Id<"seoCollectionCycles">): Promise<{ credits: number | null; counted: boolean }> {
  const charged = await ctx.db.query("creditCharges").withIndex("by_cycle_state", (q) => q.eq("cycleId", cycleId).eq("state", "charged")).take(COUNTED_TO);
  const open = await ctx.db.query("creditCharges").withIndex("by_cycle_state", (q) => q.eq("cycleId", cycleId).eq("state", "open")).take(COUNTED_TO);
  if (charged.length === 0 && open.length === 0) return { credits: null, counted: false };
  const counted = charged.reduce((total, charge) => total + charge.creditsOut, 0);
  const counting = open.reduce((total, charge) => total + (charge.price ? creditsForUnits(charge.price, charge.units) : 0), 0);
  return { credits: counted + counting, counted: open.length === 0 };
}

/** Search Console downloads going, or finished today: one website's run each. */
async function searchConsoleRows(ctx: QueryCtx, showing: typeof show.type, now: number, dayStart: number): Promise<Array<typeof row.type>> {
  const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "SEARCH_CONSOLE_COLLECTOR")).first();
  if (!agent) return [];
  const runs = await ctx.db
    .query("agentRuns")
    .withIndex("by_agent_started", (q) => q.eq("agentId", agent._id).gte("startedAt", dayStart - ROLE_RUN_LIVE_MS))
    .order("desc")
    .take(SEARCH_CONSOLE_RUNS_READ);
  const rows: Array<typeof row.type> = [];
  for (const run of runs) {
    if (!run.title?.startsWith("Search Console: ")) continue;
    const going = (run.status === "QUEUED" || run.status === "RUNNING") && now - lastMoved(run) < ROLE_RUN_LIVE_MS;
    const finishedToday = !going && (run.completedAt ?? 0) >= dayStart;
    if (showing === "IN_PROGRESS" ? !going : showing === "FINISHED_TODAY" ? !finishedToday : !going && !finishedToday) continue;

    const host = run.title.slice("Search Console: ".length);
    const connection = await connectionFor(ctx, run.companyId, host);
    const company = run.companyId ? await ctx.db.get(run.companyId) : null;
    const until = run.completedAt ?? now;
    const steps = connection
      ? (await ctx.db.query("searchConsoleRuns").withIndex("by_hold_started", (q) => q.eq("companyWebsiteId", connection.companyWebsiteId).gte("startedAt", run.startedAt)).take(200))
        .filter((step) => step.startedAt <= until)
      : [];
    const latest = await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", run._id)).order("desc").first();
    // The days it fetches, recorded since 2026-10-05; a run before that says only its rows.
    const window = connection?.collecting?.runId === run._id ? connection.collecting : undefined;
    const total = window ? daysBetween(window.from, window.top) + 1 : 0;
    const reached = connection?.oldestDay && window && connection.oldestDay <= window.top
      ? daysBetween(connection.oldestDay < window.from ? window.from : connection.oldestDay, window.top) + 1
      : 0;
    rows.push({
      key: run._id,
      kind: "SEARCH_CONSOLE",
      companyName: company?.name ?? "—",
      host,
      how: total > 7 ? "FIRST_DAYS" : "NEWEST_DAYS",
      startedAt: run.startedAt,
      finishedAt: going ? null : (run.completedAt ?? null),
      startedBy: null,
      state: going ? "DOWNLOADING" : run.status === "FAILED" ? "STOPPED" : "DONE",
      needsYou: null,
      stopped: run.status === "FAILED" ? (run.finalOutput ?? null) : null,
      planned: total,
      back: going ? reached : total,
      out: 0,
      toSend: 0,
      countsCut: false,
      failed: 0,
      reused: 0,
      sending: null,
      outGroups: [],
      sendSecondsLeft: null,
      costUsd: null,
      credits: null,
      creditsCounted: false,
      cycleId: null,
      days: {
        done: going ? reached : total,
        total,
        rows: steps.reduce((sum, step) => sum + step.rows, 0),
        latest: latest?.input ?? null,
        known: connection !== null,
      },
    });
  }
  return rows;
}

/** Holds read to find a run's website among its company's. */
const HOLDS_READ = 200;

/**
 * A run's connection: found through its company's own hold of the website, as
 * every Search Console read is (`websiteTenancyGuard.test.ts`), never by
 * listing every company's connections.
 */
async function connectionFor(
  ctx: QueryCtx,
  companyId: Id<"companies"> | undefined,
  host: string,
): Promise<Doc<"searchConsoleConnections"> | null> {
  if (!companyId) return null;
  const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(HOLDS_READ);
  for (const hold of holds) {
    const website = await ctx.db.get(hold.websiteId);
    if (!website || (website.host !== host && website.displayHost !== host)) continue;
    return await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", hold._id)).first();
  }
  return null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
