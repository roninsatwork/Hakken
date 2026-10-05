import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { appError } from "./utils/appError";
import {
  DEFAULT_CREDIT_COVERS_USD,
  DEFAULT_CREDIT_PRICES,
  DEFAULT_PLAN_CREDITS,
  creditDayOf,
  creditMonthOf,
  creditsForUnits,
  type CreditKind,
  type CreditPrice,
} from "./creditKinds";

/**
 * The only code that writes credits (docs/plans/active/usage-credits-plan.md).
 *
 * A company's credits sit in batches: the plan's for each month, granted the
 * first time anything is charged in it and ended with the month, and later a
 * batch per top-up, ending 12 months on. A charge draws from the open batch
 * that ends soonest. Every write is a line on the company's statement
 * (`creditCharges`) with the balance after it, and the day's rollup moves in
 * the same transaction.
 *
 * Step 1 refuses nothing: a charge no batch can cover is recorded as owed, for
 * outstanding question 2 to decide what pays it.
 */

type Charge = Doc<"creditCharges">;

/** The price line a kind is charged at now: the saved one, or the placeholder. */
export async function readCreditPrice(ctx: MutationCtx, kind: CreditKind): Promise<CreditPrice> {
  const row = await ctx.db.query("creditPrices").withIndex("by_kind", (q) => q.eq("kind", kind)).first();
  return row ? { credits: row.credits, per: row.per } : DEFAULT_CREDIT_PRICES[kind];
}

/** The platform's credit settings, or the defaults. */
export async function readCreditSettings(ctx: MutationCtx) {
  const row = await ctx.db.query("creditSettings").withIndex("by_key", (q) => q.eq("key", "platform")).first();
  return {
    planCredits: row?.planCredits ?? DEFAULT_PLAN_CREDITS,
    creditCoversUsd: row?.creditCoversUsd ?? DEFAULT_CREDIT_COVERS_USD,
  };
}

/** Credits in a company's monthly plan batch: its plan's, else the platform's. */
export async function planCreditsFor(ctx: MutationCtx, companyId: Id<"companies">): Promise<number> {
  const company = await ctx.db.get(companyId);
  const plan = company?.planId ? await ctx.db.get(company.planId) : null;
  return plan?.monthlyCredits ?? (await readCreditSettings(ctx)).planCredits;
}

/**
 * A company's open batches, soonest-ending first. Bounded: a month's plan
 * batch and a handful of live top-ups is the whole of it, and a company
 * holding more open top-ups than this is drawn from its soonest-ending ones.
 */
async function openBatches(ctx: MutationCtx, companyId: Id<"companies">) {
  return await ctx.db
    .query("creditBatches")
    .withIndex("by_company_state_ends", (q) => q.eq("companyId", companyId).eq("state", "open"))
    .take(OPEN_BATCH_LIMIT);
}

const OPEN_BATCH_LIMIT = 50;

async function readAccount(ctx: MutationCtx, companyId: Id<"companies">) {
  return await ctx.db.query("creditAccounts").withIndex("by_company", (q) => q.eq("companyId", companyId)).first();
}

/** Every open batch's credits, less what is owed. */
export async function creditBalance(ctx: MutationCtx, companyId: Id<"companies">): Promise<number> {
  const [batches, account] = await Promise.all([openBatches(ctx, companyId), readAccount(ctx, companyId)]);
  return batches.reduce((sum, batch) => sum + batch.left, 0) - (account?.owed ?? 0);
}

/** End a batch whose time is up, writing off what it still held as a line of its own. */
async function endBatch(ctx: MutationCtx, batch: Doc<"creditBatches">, now: number): Promise<void> {
  if (batch.state !== "open") return;
  await ctx.db.patch(batch._id, { state: "ended", left: 0, endedAt: now, writtenOff: batch.left });
  if (batch.left <= 0) return;
  await ctx.db.insert("creditCharges", {
    companyId: batch.companyId,
    entry: "ended",
    state: "charged",
    at: batch.endsAt,
    source: batch.source,
    how: "automatic",
    units: 0,
    lines: 0,
    failedUnits: 0,
    creditsOut: batch.left,
    creditsIn: 0,
    paidFrom: [{ batchId: batch._id, credits: batch.left }],
    owed: 0,
    balanceAfter: await creditBalance(ctx, batch.companyId),
    realCostUsd: 0,
    reusedValueUsd: 0,
    batchId: batch._id,
    createdAt: now,
  });
}

/**
 * The month's plan batch, granted the first time anything is charged in the
 * month — dated the 1st — after ending whatever of this company's has run out.
 */
export async function ensurePlanBatch(ctx: MutationCtx, companyId: Id<"companies">, now: number): Promise<void> {
  for (const batch of await openBatches(ctx, companyId)) {
    if (batch.endsAt <= now) await endBatch(ctx, batch, now);
  }
  const { month, startsAt, endsAt } = creditMonthOf(now);
  const existing = await ctx.db
    .query("creditBatches")
    .withIndex("by_company_month", (q) => q.eq("companyId", companyId).eq("month", month))
    .first();
  if (existing) return;
  const granted = await planCreditsFor(ctx, companyId);
  const batchId = await ctx.db.insert("creditBatches", {
    companyId,
    source: "plan",
    month,
    granted,
    left: granted,
    startsAt,
    endsAt,
    state: "open",
    createdAt: now,
  });
  await ctx.db.insert("creditCharges", {
    companyId,
    entry: "grant",
    state: "charged",
    at: startsAt,
    source: "plan",
    how: "automatic",
    units: 0,
    lines: 0,
    failedUnits: 0,
    creditsOut: 0,
    creditsIn: granted,
    paidFrom: [],
    owed: 0,
    balanceAfter: await creditBalance(ctx, companyId),
    realCostUsd: 0,
    reusedValueUsd: 0,
    batchId,
    createdAt: now,
  });
}

/**
 * Raise a month's plan batch to what the company's plan gives now
 * (finish-off-plan.md, item 3a: 1,000 a month became 10,000 after October's
 * were granted). The extra credits are a grant line of their own, "October's
 * plan credits raised", with what the batch held before, so the statement
 * still adds up line by line. Never lowered; a batch that has ended is left
 * as it ended. Returns the credits added.
 */
export async function raisePlanBatch(ctx: MutationCtx, batch: Doc<"creditBatches">, now: number): Promise<number> {
  if (batch.source !== "plan" || batch.state !== "open" || batch.endsAt <= now) return 0;
  const target = await planCreditsFor(ctx, batch.companyId);
  const extra = target - batch.granted;
  if (extra <= 0) return 0;
  await ctx.db.patch(batch._id, { granted: target, left: batch.left + extra });
  await ctx.db.insert("creditCharges", {
    companyId: batch.companyId,
    entry: "grant",
    state: "charged",
    at: now,
    source: "plan",
    how: "automatic",
    units: 0,
    lines: 0,
    failedUnits: 0,
    creditsOut: 0,
    creditsIn: extra,
    paidFrom: [],
    owed: 0,
    balanceAfter: await creditBalance(ctx, batch.companyId),
    realCostUsd: 0,
    reusedValueUsd: 0,
    batchId: batch._id,
    reason: "raised",
    before: batch.granted,
    createdAt: now,
  });
  return extra;
}

/** Take credits from the batches that end soonest; what none can cover is owed. */
async function drawCredits(ctx: MutationCtx, companyId: Id<"companies">, credits: number, now: number) {
  await ensurePlanBatch(ctx, companyId, now);
  const paidFrom: Array<{ batchId: Id<"creditBatches">; credits: number }> = [];
  let needed = credits;
  for (const batch of await openBatches(ctx, companyId)) {
    if (needed <= 0) break;
    if (batch.endsAt <= now || batch.left <= 0) continue;
    const take = Math.min(batch.left, needed);
    await ctx.db.patch(batch._id, { left: batch.left - take });
    paidFrom.push({ batchId: batch._id, credits: take });
    needed -= take;
  }
  if (needed > 0) {
    const account = await readAccount(ctx, companyId);
    if (account) await ctx.db.patch(account._id, { owed: account.owed + needed, updatedAt: now });
    else await ctx.db.insert("creditAccounts", { companyId, owed: needed, updatedAt: now });
  }
  return { paidFrom, owed: needed };
}

/**
 * Every company's month for a kind of work (`creditPlatformMonths`): what
 * Admin → Settings → Credit prices reads. Moved by a charge, a refund, and a
 * cost that arrives after its charge closed.
 */
async function bumpPlatformMonth(
  ctx: MutationCtx,
  month: string,
  kind: CreditKind,
  change: { credits?: number; runs?: number; units?: number; realCostUsd?: number; reusedValueUsd?: number },
  now: number,
): Promise<void> {
  const row = await ctx.db.query("creditPlatformMonths").withIndex("by_month_kind", (q) => q.eq("month", month).eq("kind", kind)).first();
  if (row) {
    await ctx.db.patch(row._id, {
      credits: row.credits + (change.credits ?? 0),
      runs: row.runs + (change.runs ?? 0),
      units: row.units + (change.units ?? 0),
      realCostUsd: row.realCostUsd + (change.realCostUsd ?? 0),
      reusedValueUsd: row.reusedValueUsd + (change.reusedValueUsd ?? 0),
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("creditPlatformMonths", {
    month, kind, credits: change.credits ?? 0, runs: change.runs ?? 0, units: change.units ?? 0,
    realCostUsd: change.realCostUsd ?? 0, reusedValueUsd: change.reusedValueUsd ?? 0, updatedAt: now,
  });
}

/** What a charge cost us, arriving after it closed — a lookup's calls, an answer that came late — into its month's rollups. */
async function bumpRollupCosts(ctx: MutationCtx, charge: Charge, realCostUsd: number, reusedValueUsd: number, now: number): Promise<void> {
  if (!charge.kind || charge.state !== "charged") return;
  const month = creditDayOf(charge.at).slice(0, 7);
  const websiteKey = charge.websiteId ?? "none";
  const kind = charge.kind;
  const row = await ctx.db
    .query("creditMonthRollups")
    .withIndex("by_company_month_kind_site", (q) => q.eq("companyId", charge.companyId).eq("month", month).eq("kind", kind).eq("websiteKey", websiteKey))
    .first();
  if (row) await ctx.db.patch(row._id, { realCostUsd: row.realCostUsd + realCostUsd, updatedAt: now });
  await bumpPlatformMonth(ctx, month, kind, { realCostUsd, reusedValueUsd }, now);
}

/** People a month's rollup names as having started work by hand: enough to count a team, never a list that grows without end. */
const BY_HAND_USERS = 50;

/** A rollup's people with a charge's person added, when it was started by hand and is not there yet; else nothing to write. */
function withByHandUser(users: Id<"users">[] | undefined, charge: Charge): Id<"users">[] | null {
  if (charge.how !== "byHand" || !charge.userId) return null;
  const known = users ?? [];
  if (known.includes(charge.userId) || known.length >= BY_HAND_USERS) return null;
  return [...known, charge.userId];
}

/**
 * Add a charge's person to its month's rollup — for charges closed before
 * the rollups named them (finish-off-plan.md, item 10). Safe to repeat.
 */
export async function noteByHandUser(ctx: MutationCtx, charge: Charge): Promise<void> {
  if (!charge.kind || charge.entry !== "charge" || charge.state !== "charged") return;
  const month = creditDayOf(charge.at).slice(0, 7);
  const kind = charge.kind;
  const websiteKey = charge.websiteId ?? "none";
  const row = await ctx.db
    .query("creditMonthRollups")
    .withIndex("by_company_month_kind_site", (q) => q.eq("companyId", charge.companyId).eq("month", month).eq("kind", kind).eq("websiteKey", websiteKey))
    .first();
  const byHandUsers = row ? withByHandUser(row.byHandUsers, charge) : null;
  if (row && byHandUsers) await ctx.db.patch(row._id, { byHandUsers });
}

/** A charge's credits into its month's rollup (per kind and website), its day's total, and every company's month. */
async function bumpCreditRollup(ctx: MutationCtx, charge: Charge, credits: number, now: number): Promise<void> {
  if (!charge.kind) return;
  const day = creditDayOf(now);
  const month = day.slice(0, 7);
  const websiteKey = charge.websiteId ?? "none";
  const kind = charge.kind;
  const existing = await ctx.db
    .query("creditMonthRollups")
    .withIndex("by_company_month_kind_site", (q) => q.eq("companyId", charge.companyId).eq("month", month).eq("kind", kind).eq("websiteKey", websiteKey))
    .first();
  const byHandUsers = withByHandUser(existing?.byHandUsers, charge);
  if (existing) {
    await ctx.db.patch(existing._id, {
      credits: existing.credits + credits,
      runs: existing.runs + 1,
      realCostUsd: existing.realCostUsd + charge.realCostUsd,
      ...(byHandUsers ? { byHandUsers } : {}),
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("creditMonthRollups", {
      companyId: charge.companyId, month, kind, websiteKey, credits, runs: 1, realCostUsd: charge.realCostUsd, ...(byHandUsers ? { byHandUsers } : {}), updatedAt: now,
    });
  }
  await bumpPlatformMonth(ctx, month, kind, {
    credits, runs: 1, units: charge.units, realCostUsd: charge.realCostUsd, reusedValueUsd: charge.reusedValueUsd,
  }, now);
  const byHand = charge.how === "byHand" ? credits : 0;
  const total = await ctx.db.query("creditDayTotals").withIndex("by_company_day", (q) => q.eq("companyId", charge.companyId).eq("day", day)).first();
  if (total) await ctx.db.patch(total._id, { credits: total.credits + credits, byHand: total.byHand + byHand, updatedAt: now });
  else await ctx.db.insert("creditDayTotals", { companyId: charge.companyId, day, credits, byHand, updatedAt: now });
}

/**
 * A charge's credits moved after it was charged — given back, or counted
 * again — in the rollups it was first counted in: its month's (per kind and
 * website), every company's month, and the day it was charged, so the Usage
 * chart's days still add up to the month's figures. Its runs stand.
 */
async function moveChargeRollups(ctx: MutationCtx, charge: Charge, credits: number, units: number, now: number): Promise<void> {
  if (!charge.kind || (credits === 0 && units === 0)) return;
  const day = creditDayOf(charge.at);
  const month = day.slice(0, 7);
  const kind = charge.kind;
  const websiteKey = charge.websiteId ?? "none";
  const row = await ctx.db
    .query("creditMonthRollups")
    .withIndex("by_company_month_kind_site", (q) => q.eq("companyId", charge.companyId).eq("month", month).eq("kind", kind).eq("websiteKey", websiteKey))
    .first();
  if (row && credits !== 0) await ctx.db.patch(row._id, { credits: row.credits + credits, updatedAt: now });
  await bumpPlatformMonth(ctx, month, kind, { credits, units }, now);
  if (credits === 0) return;
  const total = await ctx.db.query("creditDayTotals").withIndex("by_company_day", (q) => q.eq("companyId", charge.companyId).eq("day", day)).first();
  if (total) {
    await ctx.db.patch(total._id, {
      credits: total.credits + credits,
      byHand: total.byHand + (charge.how === "byHand" ? credits : 0),
      updatedAt: now,
    });
  }
}

/** What a run is, when it opens: everything but its counts. */
export type CreditRunStart = {
  companyId: Id<"companies">;
  kind: CreditKind;
  runKey: string;
  how: Charge["how"];
  websiteId?: Id<"websites">;
  userId?: Id<"users">;
  cycleId?: Id<"seoCollectionCycles">;
  agentRunId?: Id<"agentRuns">;
  messageId?: Id<"messages">;
  pullId?: Id<"seoDataPulls">;
  detail?: string;
};

/** A run's charge by what it is for, open, charged or void. */
export async function findCreditRun(ctx: MutationCtx, runKey: string): Promise<Charge | null> {
  return await ctx.db.query("creditCharges").withIndex("by_run_key", (q) => q.eq("runKey", runKey)).first();
}

/** Open a run's charge, at the price line as it stands now; an existing one is returned as it is. */
export async function openCreditRun(ctx: MutationCtx, start: CreditRunStart, now: number): Promise<Charge> {
  const existing = await findCreditRun(ctx, start.runKey);
  if (existing) return existing;
  const id = await ctx.db.insert("creditCharges", {
    ...start,
    entry: "charge",
    state: "open",
    at: now,
    units: 0,
    lines: 0,
    failedUnits: 0,
    price: await readCreditPrice(ctx, start.kind),
    creditsOut: 0,
    creditsIn: 0,
    paidFrom: [],
    owed: 0,
    realCostUsd: 0,
    reusedValueUsd: 0,
    createdAt: now,
  });
  const charge = await ctx.db.get(id);
  if (!charge) throw appError("NOT_FOUND", "A credit run could not be read back after it was written.");
  return charge;
}

export type CreditRunChange = {
  units?: number;
  lines?: number;
  failedUnits?: number;
  realCostUsd?: number;
  reusedValueUsd?: number;
  /** Lines whose requests are out, joining (+1) or come back (-1): an open run waits for them before it is charged. */
  pendingLines?: number;
};

/**
 * Add to a run. While it is open its units move. Once charged, what it cost
 * us can still arrive (an answer that comes after the run closed), and units
 * that move — an answer counted after the run was charged — count it again,
 * as a line of its own (`recountCreditRun`).
 */
export async function addToCreditRun(ctx: MutationCtx, charge: Charge, change: CreditRunChange): Promise<void> {
  const costs = {
    realCostUsd: charge.realCostUsd + (change.realCostUsd ?? 0),
    reusedValueUsd: charge.reusedValueUsd + (change.reusedValueUsd ?? 0),
  };
  if (charge.state !== "open") {
    if (change.realCostUsd || change.reusedValueUsd) {
      await ctx.db.patch(charge._id, costs);
      await bumpRollupCosts(ctx, charge, change.realCostUsd ?? 0, change.reusedValueUsd ?? 0, Date.now());
    }
    if (change.units && charge.entry === "charge") {
      await recountCreditRun(ctx, charge._id, (charge.unitsNow ?? charge.units) + change.units, "recounted", Date.now());
    }
    return;
  }
  await ctx.db.patch(charge._id, {
    ...costs,
    units: Math.max(0, charge.units + (change.units ?? 0)),
    lines: Math.max(0, charge.lines + (change.lines ?? 0)),
    failedUnits: charge.failedUnits + (change.failedUnits ?? 0),
    ...(change.pendingLines ? { pendingLines: Math.max(0, (charge.pendingLines ?? 0) + change.pendingLines) } : {}),
  });
}

/**
 * Give credits back to the batches a charge drew them from, the last drawn
 * first — or, where one has ended, to this month's plan batch. Nobody loses
 * credits to a count that came out lower. Returns where each went.
 */
async function giveCreditsBack(ctx: MutationCtx, charge: Charge, credits: number, now: number) {
  await ensurePlanBatch(ctx, charge.companyId, now);
  const current = (await openBatches(ctx, charge.companyId)).find((batch) => batch.source === "plan" && batch.endsAt > now);
  const paidBack: Array<{ batchId: Id<"creditBatches">; credits: number }> = [];
  let left = credits;
  const parts = [...charge.paidFrom].reverse();
  for (const part of parts) {
    if (left <= 0) break;
    const back = Math.min(part.credits, left);
    const batch = await ctx.db.get(part.batchId);
    const into = batch && batch.state === "open" ? batch : current ? await ctx.db.get(current._id) : null;
    if (!into) continue;
    await ctx.db.patch(into._id, { left: into.left + back });
    paidBack.push({ batchId: into._id, credits: back });
    left -= back;
  }
  // More than the charge first drew — counted up since, then down — goes to this month's plan.
  if (left > 0 && current) {
    const into = await ctx.db.get(current._id);
    if (into) {
      await ctx.db.patch(into._id, { left: into.left + left });
      paidBack.push({ batchId: into._id, credits: left });
    }
  }
  return paidBack;
}

/** Whether a charge was given back whole: nothing more is counted on it. */
async function refunded(ctx: MutationCtx, chargeId: Id<"creditCharges">): Promise<boolean> {
  return (await ctx.db.query("creditCharges").withIndex("by_run_key", (q) => q.eq("runKey", `refund:${chargeId}`)).first()) !== null;
}

/**
 * Count a run again, once what came back is known after it was charged
 * (finish-off-plan.md, items 3 and 9). An open run simply takes the new
 * units. One closed with nothing to charge is charged now, as any run
 * closing. One already charged keeps its line exactly as it was, and the
 * difference is a line of its own — "Counted again" — credits given back to
 * the batches that paid (`giveCreditsBack`), or taken from the batches that
 * end soonest; its month's and day's rollups move with it. So the statement
 * says what changed, and every balance on it still adds up. Returns the
 * credits it moved: more taken, or (below zero) given back.
 */
export async function recountCreditRun(
  ctx: MutationCtx,
  chargeId: Id<"creditCharges">,
  units: number,
  reason: "recounted" | "nothingBack",
  now: number,
): Promise<number> {
  const charge = await ctx.db.get(chargeId);
  if (!charge || charge.entry !== "charge" || !charge.kind) return 0;
  const target = Math.max(0, Math.floor(units));
  if (charge.state === "open") {
    if (target !== charge.units) await ctx.db.patch(chargeId, { units: target });
    return 0;
  }
  if (charge.state === "void") {
    if (target <= 0) return 0;
    await ctx.db.patch(chargeId, { state: "open", units: target });
    await closeCreditRun(ctx, chargeId, now);
    return (await ctx.db.get(chargeId))?.creditsOut ?? 0;
  }
  const unitsBefore = charge.unitsNow ?? charge.units;
  if (target === unitsBefore || (await refunded(ctx, chargeId))) return 0;
  const creditsBefore = charge.creditsNow ?? charge.creditsOut;
  const credits = creditsForUnits(charge.price ?? DEFAULT_CREDIT_PRICES[charge.kind], target);
  const moved = credits - creditsBefore;
  await ctx.db.patch(chargeId, { unitsNow: target, creditsNow: credits });
  await moveChargeRollups(ctx, charge, moved, target - unitsBefore, now);
  if (moved === 0) return 0;
  const taken = moved > 0 ? await drawCredits(ctx, charge.companyId, moved, now) : null;
  const paidFrom = taken ? taken.paidFrom : await giveCreditsBack(ctx, charge, -moved, now);
  await ctx.db.insert("creditCharges", {
    companyId: charge.companyId,
    entry: "recount",
    state: "charged",
    at: now,
    kind: charge.kind,
    websiteId: charge.websiteId,
    userId: charge.userId,
    how: "automatic",
    units: target,
    lines: 0,
    failedUnits: 0,
    creditsOut: Math.max(0, moved),
    creditsIn: Math.max(0, -moved),
    paidFrom,
    owed: taken?.owed ?? 0,
    balanceAfter: await creditBalance(ctx, charge.companyId),
    realCostUsd: 0,
    reusedValueUsd: 0,
    refundOf: chargeId,
    ...(charge.detail ? { detail: charge.detail } : {}),
    reason,
    before: unitsBefore,
    createdAt: now,
  });
  return moved;
}

/** Close a run: take its credits, or void it when nothing was left to charge. */
export async function closeCreditRun(ctx: MutationCtx, chargeId: Id<"creditCharges">, now: number): Promise<void> {
  const charge = await ctx.db.get(chargeId);
  if (!charge || charge.state !== "open" || !charge.kind) return;
  const credits = creditsForUnits(charge.price ?? DEFAULT_CREDIT_PRICES[charge.kind], charge.units);
  if (credits <= 0) {
    await ctx.db.patch(chargeId, { state: "void", at: now });
    return;
  }
  const { paidFrom, owed } = await drawCredits(ctx, charge.companyId, credits, now);
  await ctx.db.patch(chargeId, {
    state: "charged",
    at: now,
    creditsOut: credits,
    paidFrom,
    owed,
    balanceAfter: await creditBalance(ctx, charge.companyId),
  });
  await bumpCreditRollup(ctx, charge, credits, now);
}

/** Charge at once: a run whose units are known when it starts — a question, a lookup, a single request. */
export async function chargeCreditsNow(
  ctx: MutationCtx,
  start: CreditRunStart,
  units: number,
  costs: { realCostUsd?: number },
  now: number,
): Promise<void> {
  const charge = await openCreditRun(ctx, start, now);
  if (charge.state !== "open") return;
  await addToCreditRun(ctx, charge, { units, lines: 1, realCostUsd: costs.realCostUsd });
  await closeCreditRun(ctx, charge._id, now);
}

/**
 * Close every run a collection opened, once it has finished — except a run
 * still waiting for a request another collection sent, which closes when
 * that answer comes (`closeRunIfDone`) so what it brings is counted first.
 */
export async function closeCycleCreditRuns(ctx: MutationCtx, cycleId: Id<"seoCollectionCycles">, now: number): Promise<void> {
  const open = await ctx.db
    .query("creditCharges")
    .withIndex("by_cycle_state", (q) => q.eq("cycleId", cycleId).eq("state", "open"))
    .take(CLOSE_PAGE);
  for (const charge of open) {
    if ((charge.pendingLines ?? 0) > 0) continue;
    await closeCreditRun(ctx, charge._id, now);
  }
}

/** A collection that has stopped, one way or another: done, capped or failed. */
const FINISHED: ReadonlySet<Doc<"seoCollectionCycles">["status"]> = new Set(["DONE", "CAPPED_PLAN", "CAPPED_SPEND", "FAILED"]);

/** An open collection run whose last awaited answer has come: charged now, if its collection has finished. */
export async function closeRunIfDone(ctx: MutationCtx, chargeId: Id<"creditCharges">, now: number): Promise<void> {
  const charge = await ctx.db.get(chargeId);
  if (!charge || charge.state !== "open" || !charge.cycleId || (charge.pendingLines ?? 0) > 0) return;
  const cycle = await ctx.db.get(charge.cycleId);
  if (cycle && FINISHED.has(cycle.status)) await closeCreditRun(ctx, chargeId, now);
}

/**
 * Give a charge's credits back: to the batches that paid it, or — where one
 * has ended — to the current month's plan batch. Nobody loses credits to our
 * failure.
 */
export async function refundCreditCharge(ctx: MutationCtx, chargeId: Id<"creditCharges">, now: number): Promise<void> {
  const charge = await ctx.db.get(chargeId);
  // What it stands at now: a charge counted again since gives back what it was counted at.
  const standing = charge ? charge.creditsNow ?? charge.creditsOut : 0;
  if (!charge || charge.entry !== "charge" || charge.state !== "charged" || standing <= 0) return;
  if (await refunded(ctx, chargeId)) return;
  const paidBack = charge.creditsNow === undefined
    ? await givePartsBack(ctx, charge, now)
    : await giveCreditsBack(ctx, charge, standing, now);
  if (charge.owed > 0 && charge.creditsNow === undefined) {
    const account = await readAccount(ctx, charge.companyId);
    if (account) await ctx.db.patch(account._id, { owed: Math.max(0, account.owed - charge.owed), updatedAt: now });
  }
  await moveChargeRollups(ctx, charge, -standing, 0, now);
  await ctx.db.insert("creditCharges", {
    companyId: charge.companyId,
    entry: "refund",
    state: "charged",
    at: now,
    kind: charge.kind,
    websiteId: charge.websiteId,
    userId: charge.userId,
    how: "automatic",
    units: charge.unitsNow ?? charge.units,
    lines: 0,
    failedUnits: 0,
    creditsOut: 0,
    creditsIn: standing,
    paidFrom: paidBack,
    owed: 0,
    balanceAfter: await creditBalance(ctx, charge.companyId),
    realCostUsd: 0,
    reusedValueUsd: 0,
    runKey: `refund:${chargeId}`,
    refundOf: chargeId,
    createdAt: now,
  });
}

/** Every part a charge drew, back to its batch — or this month's plan, where it has ended. */
async function givePartsBack(ctx: MutationCtx, charge: Charge, now: number) {
  await ensurePlanBatch(ctx, charge.companyId, now);
  const current = (await openBatches(ctx, charge.companyId)).find((batch) => batch.source === "plan");
  const paidBack: Array<{ batchId: Id<"creditBatches">; credits: number }> = [];
  for (const part of charge.paidFrom) {
    const batch = await ctx.db.get(part.batchId);
    const into = batch && batch.state === "open" ? batch : current;
    if (!into) continue;
    const fresh = await ctx.db.get(into._id);
    if (!fresh) continue;
    await ctx.db.patch(fresh._id, { left: fresh.left + part.credits });
    paidBack.push({ batchId: fresh._id, credits: part.credits });
  }
  return paidBack;
}

/** A collection still at work: planning, or with a request not yet answered. */
async function collectionStillAtWork(ctx: MutationCtx, cycleId: Id<"seoCollectionCycles">): Promise<boolean> {
  const cycle = await ctx.db.get(cycleId);
  if (!cycle) return false;
  if (cycle.status === "EXPANDING") return true;
  for (const status of ["PENDING", "CLAIMED", "SUBMITTED"] as const) {
    const inFlight = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_cycle_status", (q) => q.eq("cycleId", cycleId).eq("status", status))
      .first();
    if (inFlight) return true;
  }
  return false;
}

/** How many of each the sweep and a closing collection handle in one transaction. */
const CLOSE_PAGE = 200;
/** A run opened less than this long ago is left to its collection to close. */
const OPEN_GRACE_MS = 60 * 60 * 1000;
/**
 * A run still waiting for an answer another collection sent is closed by the
 * sweep anyway once it has waited this long: an answer that comes later still
 * counts, as a line of its own (`recountCreditRun`).
 */
const WAITING_GIVE_UP_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Hourly (`credit-ledger-sweep`): end batches whose time is up, and close the
 * runs of collections that finished some way other than their last answer —
 * capped, failed, or closed by the collection sweep.
 */
export const sweepCreditLedger = internalMutation({
  args: {},
  returns: v.object({ batchesEnded: v.number(), runsClosed: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("creditBatches")
      .withIndex("by_state_ends", (q) => q.eq("state", "open").lte("endsAt", now))
      .take(CLOSE_PAGE);
    for (const batch of due) await endBatch(ctx, batch, now);

    const stale = await ctx.db
      .query("creditCharges")
      .withIndex("by_state_at", (q) => q.eq("state", "open").lte("at", now - OPEN_GRACE_MS))
      .take(CLOSE_PAGE);
    let runsClosed = 0;
    for (const charge of stale) {
      if (charge.cycleId && (await collectionStillAtWork(ctx, charge.cycleId))) continue;
      if ((charge.pendingLines ?? 0) > 0 && charge.at > now - WAITING_GIVE_UP_MS) continue;
      await closeCreditRun(ctx, charge._id, now);
      runsClosed += 1;
    }
    return { batchesEnded: due.length, runsClosed };
  },
});
