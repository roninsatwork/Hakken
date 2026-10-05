import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { calculateModelCostUsd } from "./aiCostService";
import {
  creditKindOfFamily,
  creditUnitsOfAnswer,
  creditUnitsOfRequest,
  creditUnitsUpFront,
  cycleRunKey,
  type CreditKind,
} from "./creditKinds";
import {
  addToCreditRun,
  chargeCreditsNow,
  closeCycleCreditRuns,
  closeRunIfDone,
  findCreditRun,
  openCreditRun,
  recountCreditRun,
  refundCreditCharge,
  type CreditRunChange,
} from "./creditLedger";

/**
 * Where paid work meets the credit ledger: one call from each place work is
 * planned, settled, finished or answered (docs/plans/active/usage-credits-plan.md,
 * step 1).
 *
 * **A credit failure never fails the work.** Step 1 only records, so each
 * entry point catches and logs: a collection, a lookup or a reply goes ahead
 * whatever happened to its charge, and the gap shows in the audit rather than
 * as a stalled pipeline.
 */

async function quietly(what: string, write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error(`Credits: ${what} was not recorded.`, error);
  }
}

/** A request as a plan line sees it: the stored one, or the one about to be stored. */
type RequestShape = Pick<Doc<"seoDataPulls">, "family" | "taskArgsJson" | "costUsd" | "status" | "rowsReturned">;

/** A request still out: planned, being sent, or sent and not yet answered. */
const isOut = (status: Doc<"seoDataPulls">["status"]) => status === "PENDING" || status === "CLAIMED" || status === "SUBMITTED";

/**
 * What a request counts in credits (finish-off-plan.md, item 3), and whether
 * it is still to come: a request still out counts what is known up front —
 * one for a single answer, nothing yet for a list or a crawl — an answered
 * one what came back, a failed one nothing.
 */
export function unitsNow(kind: CreditKind, request: RequestShape): { units: number; out: boolean } {
  if (isOut(request.status)) return { units: creditUnitsUpFront(kind, request.taskArgsJson), out: true };
  if (request.status === "FAILED") return { units: 0, out: false };
  return { units: creditUnitsOfAnswer(kind, request.taskArgsJson, request.rowsReturned), out: false };
}

/**
 * What a line had put in its charge before now: its own record, or — for a
 * line planned before 2026-10-05's change — what its request asked for, as
 * every line counted then, unless its request had failed while the run was
 * still open, which took that back off.
 */
export function countedBefore(kind: CreditKind, line: Doc<"seoCycleLines">, request: Pick<Doc<"seoDataPulls">, "taskArgsJson" | "status" | "completedAt">, charge: Doc<"creditCharges"> | null): number {
  if (line.creditUnits !== undefined) return line.creditUnits;
  if (request.status !== "FAILED") return creditUnitsOfRequest(kind, request.taskArgsJson);
  const failedAfterCharged = charge !== null && charge.state === "charged" && (request.completedAt ?? 0) > charge.at;
  return failedAfterCharged ? creditUnitsOfRequest(kind, request.taskArgsJson) : 0;
}

/** A collection run's charge for one website and kind, opened with who it is for. */
async function cycleRun(ctx: MutationCtx, cycle: Doc<"seoCollectionCycles">, websiteId: Id<"websites">, kind: CreditKind, now: number) {
  const runKey = cycleRunKey(cycle._id, websiteId, kind);
  const existing = await findCreditRun(ctx, runKey);
  if (existing) return existing;
  // Who: whoever set the schedule up, or whoever started this collection by hand.
  const scheduled = cycle.trigger !== "MANUAL";
  const schedule = scheduled && cycle.scheduleId ? await ctx.db.get(cycle.scheduleId) : null;
  const run = !scheduled && cycle.agentRunId ? await ctx.db.get(cycle.agentRunId) : null;
  const userId = schedule?.createdBy ?? run?.userId;
  return await openCreditRun(ctx, {
    companyId: cycle.companyId,
    kind,
    runKey,
    how: scheduled ? "scheduled" : "byHand",
    websiteId,
    cycleId: cycle._id,
    ...(userId ? { userId } : {}),
  }, now);
}

/**
 * A collection planned a line: its request's units join the run's charge —
 * at the full price whether it was bought or served by a request someone else
 * paid for, which only adds to what the sharing saved. A request already
 * answered counts what came back; one still out counts what is known up
 * front, and the run waits for it (`pendingLines`) before it is charged. The
 * line keeps what it put in, so its answer moves the run by the difference.
 */
export async function creditCycleLine(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  websiteId: Id<"websites">,
  request: RequestShape | Id<"seoDataPulls">,
  reused: boolean,
  lineId?: Id<"seoCycleLines">,
): Promise<void> {
  await quietly("a collection's planned line", async () => {
    const pull = typeof request === "string" ? await ctx.db.get(request) : request;
    if (!pull) return;
    const kind = creditKindOfFamily(pull.family);
    if (!kind) return;
    const charge = await cycleRun(ctx, cycle, websiteId, kind, Date.now());
    const { units, out } = unitsNow(kind, pull);
    await addToCreditRun(ctx, charge, {
      units,
      lines: 1,
      ...(out ? { pendingLines: 1 } : {}),
      ...(reused && pull.status === "READY" ? { reusedValueUsd: pull.costUsd } : {}),
    });
    if (lineId) await ctx.db.patch(lineId, { creditUnits: units, creditPending: out });
  });
}

/** A collection closed by hand dropped a line it never sent: what it put in comes off, and the run stops waiting for it. */
export async function creditCycleLineDropped(ctx: MutationCtx, line: Doc<"seoCycleLines">, pullId: Id<"seoDataPulls">): Promise<void> {
  await quietly("a dropped line", async () => {
    const pull = await ctx.db.get(pullId);
    const kind = pull ? creditKindOfFamily(pull.family) : null;
    if (!pull || !kind) return;
    const charge = await findCreditRun(ctx, cycleRunKey(line.cycleId, line.websiteId, kind));
    if (!charge) return;
    const units = countedBefore(kind, line, pull, charge);
    await addToCreditRun(ctx, charge, { units: -units, lines: -1, ...(line.creditPending ? { pendingLines: -1 } : {}) });
    await closeRunIfDone(ctx, charge._id, Date.now());
  });
}

/**
 * A request outside any collection that a single charge covers: an agent's
 * own, or a super admin's. Charged when it is sent, at what is known then;
 * counted again from what came back once it is answered (finish-off-plan.md,
 * item 3); given back if it fails.
 */
async function creditLoneRequest(ctx: MutationCtx, row: Doc<"seoDataPulls">, status: "SUBMITTED" | "READY" | "FAILED", costUsd: number, now: number) {
  const kind = creditKindOfFamily(row.family);
  if (!row.companyId || !kind) return;
  const runKey = `pull:${row._id}`;
  const existing = await findCreditRun(ctx, runKey);
  if (status === "FAILED") {
    if (existing) await refundCreditCharge(ctx, existing._id, now);
    return;
  }
  const answered = status === "READY" ? await ctx.db.get(row._id) : null;
  const units = answered
    ? creditUnitsOfAnswer(kind, row.taskArgsJson, answered.rowsReturned)
    : creditUnitsUpFront(kind, row.taskArgsJson);
  if (existing) {
    await addToCreditRun(ctx, existing, { realCostUsd: costUsd });
    if (answered) await recountCreditRun(ctx, existing._id, units, "recounted", now);
    return;
  }
  await chargeCreditsNow(ctx, {
    companyId: row.companyId,
    kind,
    runKey,
    how: row.requestedBy ? "byHand" : "automatic",
    pullId: row._id,
    ...(row.websiteId ? { websiteId: row.websiteId } : {}),
    ...(row.requestedBy ? { userId: row.requestedBy } : {}),
    ...(row.agentRunId ? { agentRunId: row.agentRunId } : {}),
  }, units, { realCostUsd: costUsd }, now);
}

/** A collection's lines that point at one request — bounded, as `creditReusers` bounds its own. */
const LINES_PER_REQUEST = 100;

/**
 * A request settled (`countSettled`, the one place every send and answer
 * passes): its cost joins the run of the collection that sent it, what it
 * saved joins every other run it served — and once it is answered or has
 * failed, every run that was counting on it moves from what its line had put
 * in to what came back (finish-off-plan.md, item 3), stops waiting for it,
 * and is charged if that was the last thing its finished collection waited on.
 */
export async function creditPullSettled(
  ctx: MutationCtx,
  row: Doc<"seoDataPulls">,
  status: "SUBMITTED" | "READY" | "FAILED",
  costUsd: number,
): Promise<void> {
  await quietly("a settled request", async () => {
    const now = Date.now();
    if (!row.cycleId) {
      // Keyword research is charged by the lookup: its calls only add their cost.
      if (row.operationId.startsWith("research_")) {
        const charge = row.agentRunId ? await findCreditRun(ctx, `research:${row.agentRunId}`) : null;
        if (charge && costUsd > 0) await addToCreditRun(ctx, charge, { realCostUsd: costUsd });
        return;
      }
      await creditLoneRequest(ctx, row, status, costUsd, now);
      return;
    }
    const kind = creditKindOfFamily(row.family);
    if (!kind) return;
    // The request as it now stands, with what its answer brought back.
    const settled = status === "SUBMITTED" ? null : { ...row, status, rowsReturned: (await ctx.db.get(row._id))?.rowsReturned };
    const lines = await ctx.db.query("seoCycleLines").withIndex("by_pull", (q) => q.eq("pullId", row._id)).take(LINES_PER_REQUEST);
    if (lines.length === 0) {
      await creditListPage(ctx, row, kind, settled, costUsd);
      return;
    }
    let paid = false;
    for (const line of lines) {
      const charge = await findCreditRun(ctx, cycleRunKey(line.cycleId, line.websiteId, kind));
      if (!charge) continue;
      const change: CreditRunChange = {};
      if (status !== "FAILED" && !paid && line.cycleId === row.cycleId) {
        change.realCostUsd = costUsd;
        paid = true;
      } else if (status === "READY") {
        change.reusedValueUsd = row.costUsd + costUsd;
      }
      if (settled) {
        const before = countedBefore(kind, line, row, charge);
        const after = unitsNow(kind, settled).units;
        change.units = after - before;
        if (status === "FAILED") change.failedUnits = before;
        if (line.creditPending) change.pendingLines = -1;
        await ctx.db.patch(line._id, { creditUnits: after, creditPending: false });
      }
      await addToCreditRun(ctx, charge, change);
      if (line.creditPending) await closeRunIfDone(ctx, charge._id, now);
    }
  });
}

/**
 * A list's next page, which its first page's answer queued for the
 * collection that bought it (`queueListPages`) with no plan line of its own:
 * its rows and its cost are that collection's run for the website, counted
 * as they come back (finish-off-plan.md, item 3) — again, as a line of its
 * own, when the run was charged before the page came.
 */
async function creditListPage(
  ctx: MutationCtx,
  row: Doc<"seoDataPulls">,
  kind: CreditKind,
  settled: RequestShape | null,
  costUsd: number,
): Promise<void> {
  if (!row.cycleId || !row.websiteId) return;
  const charge = await findCreditRun(ctx, cycleRunKey(row.cycleId, row.websiteId, kind));
  if (!charge) return;
  // Counted once: the page keeps what it put in, as a plan line does.
  const counted = settled && row.creditUnits === undefined ? unitsNow(kind, settled).units : 0;
  await addToCreditRun(ctx, charge, { ...(costUsd !== 0 ? { realCostUsd: costUsd } : {}), ...(counted > 0 ? { units: counted } : {}) });
  if (settled && row.creditUnits === undefined) await ctx.db.patch(row._id, { creditUnits: counted });
}

/** A collection finished: its runs close and take their credits. */
export async function creditCycleFinished(ctx: MutationCtx, cycleId: Id<"seoCollectionCycles">): Promise<void> {
  await quietly("a finished collection", () => closeCycleCreditRuns(ctx, cycleId, Date.now()));
}

/** A lookup started: charged by the keyword at once; its calls add what they cost as they come. */
export async function creditResearchRun(
  ctx: MutationCtx,
  args: { companyId: Id<"companies">; userId: Id<"users">; runId: Id<"agentRuns">; keywords: string[] },
): Promise<void> {
  await quietly("a keyword lookup", async () => {
    const keywords = [...new Set(args.keywords)];
    if (keywords.length === 0) return;
    await chargeCreditsNow(ctx, {
      companyId: args.companyId,
      kind: "keywordResearch",
      runKey: `research:${args.runId}`,
      how: "byHand",
      userId: args.userId,
      agentRunId: args.runId,
      detail: keywords.map((keyword) => `“${keyword}”`).join(", ").slice(0, 200),
    }, keywords.length, {}, Date.now());
  });
}

/**
 * Ask Hakken answered: one question, charged with what the reply cost us,
 * priced from the model's rates — `messages` keeps only its tokens. A public
 * widget's conversation and an evaluation's are not a company's questions.
 */
export async function creditAssistantReply(
  ctx: MutationCtx,
  thread: Doc<"threads"> | null,
  messageId: Id<"messages">,
  reply: { inputTokens?: number; outputTokens?: number; modelUsed?: string },
): Promise<void> {
  await quietly("an assistant reply", async () => {
    if (!thread?.companyId || thread.widgetId || thread.purpose === "EVAL") return;
    const modelUsed = reply.modelUsed;
    const rates = modelUsed
      ? await ctx.db.query("aiModels").withIndex("by_model_id", (q) => q.eq("modelId", modelUsed)).first()
      : null;
    const realCostUsd = calculateModelCostUsd({ inputTokens: reply.inputTokens ?? 0, outputTokens: reply.outputTokens ?? 0, rates });
    await chargeCreditsNow(ctx, {
      companyId: thread.companyId,
      kind: "assistant",
      runKey: `message:${messageId}`,
      how: "byHand",
      messageId,
      ...(thread.userId ? { userId: thread.userId } : {}),
    }, 1, { realCostUsd }, Date.now());
  });
}
