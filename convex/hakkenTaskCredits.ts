import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx } from "./_generated/server";
import { chargeCreditsNow, readCreditPrice } from "./creditLedger";

/**
 * What Hakken tasks cost (docs/plans/active/hakken-tasks-plan.md, across all
 * of it): every piece of task work goes through the credit ledger like any
 * other — an alert's daily check, a weekly report, a "find out why" — at its
 * own price on Admin → Settings → Credit prices, once each (the run key).
 * Charging itself waits for the usage plan's "Switching it on"; until then
 * the ledger counts, as it does every other kind.
 */

export type TaskCreditKind = "taskAlerts" | "taskReports" | "taskResearch";

export async function chargeTaskWork(
  ctx: MutationCtx,
  work: {
    kind: TaskCreditKind;
    /** Once for each: a task and its day, a report and its week, an offer. */
    runKey: string;
    companyId: Id<"companies">;
    userId: Id<"users">;
    how: "scheduled" | "byHand";
    companyWebsiteId?: Id<"companyWebsites">;
    messageId?: Id<"messages">;
    /** What it was, on the statement: the task's title, the question looked into. */
    detail: string;
  },
  now: number,
): Promise<void> {
  const hold = work.companyWebsiteId ? await ctx.db.get(work.companyWebsiteId) : null;
  await chargeCreditsNow(ctx, {
    companyId: work.companyId,
    kind: work.kind,
    runKey: work.runKey,
    how: work.how,
    userId: work.userId,
    ...(hold ? { websiteId: hold.websiteId } : {}),
    ...(work.messageId ? { messageId: work.messageId } : {}),
    detail: work.detail.slice(0, 200),
  }, 1, {}, now);
}

/** Each kind's price for one, as an offer says it before the yes. */
export const taskPricesInternal = internalQuery({
  args: {},
  returns: v.object({ taskAlerts: v.number(), taskReports: v.number(), taskResearch: v.number() }),
  handler: async (ctx) => {
    const one = async (kind: TaskCreditKind) => {
      const price = await readCreditPrice(ctx, kind);
      return Math.max(1, Math.ceil(price.credits / price.per));
    };
    return { taskAlerts: await one("taskAlerts"), taskReports: await one("taskReports"), taskResearch: await one("taskResearch") };
  },
});
