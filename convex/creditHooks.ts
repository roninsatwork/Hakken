import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { calculateModelCostUsd } from "./aiCostService";
import { creditKindOfFamily, creditUnitsOfRequest, cycleRunKey, type CreditKind } from "./creditKinds";
import {
  addToCreditRun,
  chargeCreditsNow,
  closeCycleCreditRuns,
  findCreditRun,
  openCreditRun,
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
type RequestShape = Pick<Doc<"seoDataPulls">, "family" | "taskArgsJson" | "costUsd" | "status">;

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
 * paid for, which only adds to what the sharing saved.
 */
export async function creditCycleLine(
  ctx: MutationCtx,
  cycle: Doc<"seoCollectionCycles">,
  websiteId: Id<"websites">,
  request: RequestShape | Id<"seoDataPulls">,
  reused: boolean,
): Promise<void> {
  await quietly("a collection's planned line", async () => {
    const pull = typeof request === "string" ? await ctx.db.get(request) : request;
    if (!pull) return;
    const kind = creditKindOfFamily(pull.family);
    if (!kind) return;
    const charge = await cycleRun(ctx, cycle, websiteId, kind, Date.now());
    await addToCreditRun(ctx, charge, {
      units: creditUnitsOfRequest(kind, pull.taskArgsJson),
      lines: 1,
      ...(reused && pull.status === "READY" ? { reusedValueUsd: pull.costUsd } : {}),
    });
  });
}

/** A collection closed by hand dropped a line it never sent: its units come off. */
export async function creditCycleLineDropped(ctx: MutationCtx, line: Doc<"seoCycleLines">, pullId: Id<"seoDataPulls">): Promise<void> {
  await quietly("a dropped line", async () => {
    const pull = await ctx.db.get(pullId);
    const kind = pull ? creditKindOfFamily(pull.family) : null;
    if (!pull || !kind) return;
    const charge = await findCreditRun(ctx, cycleRunKey(line.cycleId, line.websiteId, kind));
    if (!charge) return;
    const units = creditUnitsOfRequest(kind, pull.taskArgsJson);
    await addToCreditRun(ctx, charge, { units: -units, lines: -1 });
  });
}

/** A request outside any collection that a single charge covers: an agent's own, or a super admin's. */
async function creditLoneRequest(ctx: MutationCtx, row: Doc<"seoDataPulls">, status: "SUBMITTED" | "READY" | "FAILED", costUsd: number, now: number) {
  const kind = creditKindOfFamily(row.family);
  if (!row.companyId || !kind) return;
  const runKey = `pull:${row._id}`;
  const existing = await findCreditRun(ctx, runKey);
  if (status === "FAILED") {
    if (existing) await refundCreditCharge(ctx, existing._id, now);
    return;
  }
  if (existing) {
    await addToCreditRun(ctx, existing, { realCostUsd: costUsd });
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
  }, creditUnitsOfRequest(kind, row.taskArgsJson), { realCostUsd: costUsd }, now);
}

/** A collection's lines that point at one request — bounded, as `creditReusers` bounds its own. */
const LINES_PER_REQUEST = 100;

/**
 * A request settled (`countSettled`, the one place every send and answer
 * passes): its cost joins the run of the collection that sent it, what it
 * saved joins every other run it served, and a failure takes its units back
 * off every run that was counting on it.
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
    const units = creditUnitsOfRequest(kind, row.taskArgsJson);
    const lines = await ctx.db.query("seoCycleLines").withIndex("by_pull", (q) => q.eq("pullId", row._id)).take(LINES_PER_REQUEST);
    let paid = false;
    for (const line of lines) {
      const charge = await findCreditRun(ctx, cycleRunKey(line.cycleId, line.websiteId, kind));
      if (!charge) continue;
      let change: CreditRunChange;
      if (status === "FAILED") change = { units: -units, failedUnits: units };
      else if (!paid && line.cycleId === row.cycleId) change = { realCostUsd: costUsd };
      else change = status === "READY" ? { reusedValueUsd: row.costUsd + costUsd } : {};
      if (!paid && line.cycleId === row.cycleId) paid = true;
      await addToCreditRun(ctx, charge, change);
    }
  });
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
