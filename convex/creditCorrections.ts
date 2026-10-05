import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { countedBefore, unitsNow } from "./creditHooks";
import {
  DEFAULT_PLAN_CREDITS,
  FIRST_PLAN_CREDITS,
  countsWhatCameBack,
  creditKindOfFamily,
  creditMonthOf,
  creditUnitsOfAnswer,
  cycleRunKey,
  type CreditKind,
} from "./creditKinds";
import { addToCreditRun, findCreditRun, raisePlanBatch, recountCreditRun } from "./creditLedger";
import { rowsReturnedIn } from "./dataForSeoSlim";
import { readPullAnswerParts } from "./seoPullAnswers";

/**
 * One-off corrections to the credit record, each run by hand once on a
 * deployment after the change it belongs to is deployed
 * (docs/plans/active/finish-off-plan.md). Each is paged: a page per
 * transaction, the next page booked by the one before, so none reads a whole
 * table at once — and each can be run again without doing its work twice.
 */

/** Batches raised in one transaction. */
const RAISE_PAGE = 100;

/**
 * A platform setting saved before 10,000 became the default holds the first
 * placeholder, 1,000 — `saveCreditPrices` wrote it beside "what a credit
 * covers" — and would keep every company at 1,000. Raised to the new default,
 * audited with no person behind it.
 */
async function raiseStoredPlaceholder(ctx: MutationCtx, now: number): Promise<boolean> {
  const settings = await ctx.db.query("creditSettings").withIndex("by_key", (q) => q.eq("key", "platform")).first();
  if (!settings || settings.planCredits !== FIRST_PLAN_CREDITS) return false;
  await ctx.db.patch(settings._id, { planCredits: DEFAULT_PLAN_CREDITS, updatedAt: now });
  await ctx.db.insert("auditLogs", {
    actionType: "CREDIT_PRICES_CHANGED",
    entityType: "creditPrices",
    timestamp: now,
    metadata: JSON.stringify({
      changes: [{ field: "planCredits", from: FIRST_PLAN_CREDITS, to: DEFAULT_PLAN_CREDITS }],
      why: "10,000 credits a month, for now (finish-off-plan.md, item 3a)",
    }),
  });
  return true;
}

/**
 * 10,000 credits a month, for now (finish-off-plan.md, item 3a): this month's
 * plan batches, already granted at 1,000, raised to what each company's plan
 * gives now — its plan's own number, else the platform's. Each raise is a
 * grant line of its own on the company's statement ("October's plan credits
 * raised, from 1,000"), so every balance after it still adds up. Run once,
 * with no arguments: `npx convex run creditCorrections:raisePlanCredits`.
 * A second run finds nothing to raise.
 */
export const raisePlanCredits = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ settingRaised: v.boolean(), raised: v.number(), credits: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const settingRaised = args.cursor ? false : await raiseStoredPlaceholder(ctx, now);
    // Every open plan batch of this month ends at the same UK midnight; a top-up's ends a year on.
    const { endsAt } = creditMonthOf(now);
    const page = await ctx.db
      .query("creditBatches")
      .withIndex("by_state_ends", (q) => q.eq("state", "open").eq("endsAt", endsAt))
      .paginate({ cursor: args.cursor ?? null, numItems: RAISE_PAGE });
    let raised = 0;
    let credits = 0;
    for (const batch of page.page) {
      const extra = await raisePlanBatch(ctx, batch, now);
      if (extra > 0) {
        raised += 1;
        credits += extra;
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.creditCorrections.raisePlanCredits, { cursor: page.continueCursor });
    return { settingRaised, raised, credits, done: page.isDone };
  },
});

// ---------------------------------------------------------------- the recount (item 3)

/**
 * Credits count what came back, not what was asked for (finish-off-plan.md,
 * item 3): the charges made before that change counted every list as the
 * rows it asked for and every crawl as the pages it might read — Conterra
 * Ops showed 602 credits for $13 of work. This counts them again, in three
 * passes, each paged and each booking the next:
 *
 * 1. **What came back** (`recountAnswers`): every answered list or crawl
 *    since `since` whose rows were never counted has them counted from its
 *    kept answer (`rowsReturnedIn`) — four answers a transaction at most,
 *    as each can be megabytes.
 * 2. **Each request's lines** (`recountRequests`): every plan line moves from
 *    what it had put in its run to what its request counts now; a list's
 *    later pages, which no line counted, are counted for the run that bought
 *    them; a request outside any collection is counted again on its own
 *    charge. A run still open just takes the difference; one already charged
 *    is told what it owes (`recountUnits`), so it is counted again once.
 * 3. **The charges** (`recountCharges`): each charged run told it owes a
 *    difference is counted again (`recountCreditRun`) — its line left as it
 *    was, and a "Counted again" line of its own, credits given back to the
 *    batches that paid. The statement says what changed; nothing is
 *    rewritten.
 *
 * Run once, after the change is deployed: `npx convex run
 * creditCorrections:recountCollectionCredits` — from the start of this UK
 * month, or `'{"since": <ms>}'`. Running it again changes nothing: each line,
 * page and charge keeps what it was counted at.
 */
export const recountCollectionCredits = internalMutation({
  args: { since: v.optional(v.number()) },
  returns: v.object({ since: v.number() }),
  handler: async (ctx, args) => {
    const since = args.since ?? creditMonthOf(Date.now()).startsAt;
    await ctx.scheduler.runAfter(0, internal.creditCorrections.recountAnswers, { since, cursor: null, skip: 0 });
    return { since };
  },
});

/** Requests read a transaction when counting answers, and answers read at most. */
const ANSWER_PAGE = 50;
const ANSWERS_READ = 4;

/** Pass 1: what each answered list and crawl brought back, counted from its kept answer. */
export const recountAnswers = internalMutation({
  args: { since: v.number(), cursor: v.union(v.string(), v.null()), skip: v.number() },
  returns: v.object({ counted: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_status_submitted", (q) => q.eq("status", "READY").gte("submittedAt", args.since))
      .paginate({ cursor: args.cursor, numItems: ANSWER_PAGE });
    let read = 0;
    let counted = 0;
    for (let at = args.skip; at < page.page.length; at += 1) {
      const pull = page.page[at];
      const kind = creditKindOfFamily(pull.family);
      if (!kind || pull.rowsReturned !== undefined || !countsWhatCameBack(kind, pull.taskArgsJson)) continue;
      // The same page again from this request, in a fresh transaction.
      if (read >= ANSWERS_READ) {
        await ctx.scheduler.runAfter(0, internal.creditCorrections.recountAnswers, { since: args.since, cursor: args.cursor, skip: at });
        return { counted, done: false };
      }
      read += 1;
      const rows = await rowsOfKeptAnswer(ctx, pull);
      if (rows === undefined) continue;
      await ctx.db.patch(pull._id, { rowsReturned: rows });
      counted += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.creditCorrections.recountAnswers, { since: args.since, cursor: page.continueCursor, skip: 0 });
      return { counted, done: false };
    }
    await ctx.scheduler.runAfter(0, internal.creditCorrections.recountRequests, { since: args.since, cursor: null });
    return { counted, done: true };
  },
});

/** What a kept answer brought back, or undefined when none is kept whole. */
async function rowsOfKeptAnswer(ctx: MutationCtx, pull: Doc<"seoDataPulls">): Promise<number | undefined> {
  const parts = await readPullAnswerParts(ctx, pull);
  if (!parts) return undefined;
  try {
    return rowsReturnedIn(pull.operationId, JSON.parse(parts.join("")));
  } catch {
    return undefined;
  }
}

/** Requests recounted a transaction: each reads its plan lines and their runs. */
const REQUEST_PAGE = 60;
const LINES_PER_REQUEST = 100;

/**
 * A run's difference, from one request: an open run takes it now; a charged
 * or void one is told it owes it, to be counted again once in pass 3.
 */
async function owe(ctx: MutationCtx, chargeId: Id<"creditCharges">, units: number): Promise<void> {
  if (units === 0) return;
  const charge = await ctx.db.get(chargeId);
  if (!charge) return;
  if (charge.state === "open") await addToCreditRun(ctx, charge, { units });
  else await ctx.db.patch(chargeId, { recountUnits: (charge.recountUnits ?? 0) + units });
}

/** One request's lines, later page or own charge, moved to what it counts now. Returns the lines moved. */
async function recountRequest(ctx: MutationCtx, pull: Doc<"seoDataPulls">, kind: CreditKind, now: number): Promise<number> {
  if (!pull.cycleId) {
    // Outside any collection: one charge for the one request.
    const charge = pull.status === "READY" ? await findCreditRun(ctx, `pull:${pull._id}`) : null;
    if (charge) await recountCreditRun(ctx, charge._id, creditUnitsOfAnswer(kind, pull.taskArgsJson, pull.rowsReturned), "recounted", now);
    return charge ? 1 : 0;
  }
  const lines = await ctx.db.query("seoCycleLines").withIndex("by_pull", (q) => q.eq("pullId", pull._id)).take(LINES_PER_REQUEST);
  const after = unitsNow(kind, pull).units;
  if (lines.length === 0) {
    // A list's later page, which no line counted before.
    if (pull.creditUnits !== undefined || !pull.websiteId) return 0;
    const charge = await findCreditRun(ctx, cycleRunKey(pull.cycleId, pull.websiteId, kind));
    if (!charge) return 0;
    await owe(ctx, charge._id, after);
    await ctx.db.patch(pull._id, { creditUnits: after });
    return 1;
  }
  let moved = 0;
  for (const line of lines) {
    if (line.creditUnits === after && !line.creditPending) continue;
    const charge = await findCreditRun(ctx, cycleRunKey(line.cycleId, line.websiteId, kind));
    const before = countedBefore(kind, line, pull, charge);
    if (charge) await owe(ctx, charge._id, after - before);
    await ctx.db.patch(line._id, { creditUnits: after, creditPending: false });
    moved += 1;
  }
  return moved;
}

/** Pass 2: every request's lines moved to what it counts now. */
export const recountRequests = internalMutation({
  args: { since: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ lines: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_submitted", (q) => q.gte("submittedAt", args.since))
      .paginate({ cursor: args.cursor, numItems: REQUEST_PAGE });
    let lines = 0;
    for (const pull of page.page) {
      const kind = creditKindOfFamily(pull.family);
      // Still out: counted by its answer when it comes. A lookup's calls are charged by the lookup.
      if (!kind || pull.status === "PENDING" || pull.status === "CLAIMED" || pull.status === "SUBMITTED") continue;
      if (pull.operationId.startsWith("research_")) continue;
      lines += await recountRequest(ctx, pull, kind, now);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.creditCorrections.recountRequests, { since: args.since, cursor: page.continueCursor });
      return { lines, done: false };
    }
    await ctx.scheduler.runAfter(0, internal.creditCorrections.recountCharges, { since: args.since, state: "charged", cursor: null });
    return { lines, done: true };
  },
});

/** Charges read a transaction when counting them again. */
const CHARGE_PAGE = 100;

/** Pass 3: each charge told it owes a difference, counted again once — charged ones, then those closed with nothing. */
export const recountCharges = internalMutation({
  args: { since: v.number(), state: v.union(v.literal("charged"), v.literal("void")), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ recounted: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db
      .query("creditCharges")
      .withIndex("by_state_at", (q) => q.eq("state", args.state).gte("at", args.since))
      .paginate({ cursor: args.cursor, numItems: CHARGE_PAGE });
    let recounted = 0;
    for (const charge of page.page) {
      if (charge.recountUnits === undefined) continue;
      await ctx.db.patch(charge._id, { recountUnits: undefined });
      const standing = charge.state === "void" ? charge.units : charge.unitsNow ?? charge.units;
      await recountCreditRun(ctx, charge._id, standing + charge.recountUnits, "recounted", now);
      recounted += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.creditCorrections.recountCharges, { since: args.since, state: args.state, cursor: page.continueCursor });
    } else if (args.state === "charged") {
      await ctx.scheduler.runAfter(0, internal.creditCorrections.recountCharges, { since: args.since, state: "void", cursor: null });
    }
    return { recounted, done: page.isDone && args.state === "void" };
  },
});
