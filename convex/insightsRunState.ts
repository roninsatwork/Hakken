import { appError } from "./utils/appError";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { stepKey } from "./collectionSteps";
import { INSIGHT_RUN_STAGES } from "./utils/insightRunStages";

export const insightsPublicationArgs = { runId: v.optional(v.id("agentRuns")), chainBooking: v.optional(v.number()) };

/** Check inside the publishing transaction: a cancelled or older worker cannot overwrite its successor. */
export async function assertInsightsPublisher(ctx: Pick<MutationCtx, "db">, args: { holdId: Id<"companyWebsites">; runId?: Id<"agentRuns">; chainBooking?: number }) {
  if (!args.runId) return;
  const [run, hold] = await Promise.all([ctx.db.get(args.runId), ctx.db.get(args.holdId)]);
  if (!run || !hold || (run.companyId !== undefined && run.companyId !== hold.companyId) || (run.status !== "RUNNING" && run.status !== "QUEUED")) throw appError("UPSTREAM_FAILURE", "This Insights run stopped or belongs to another company; its results cannot be published.");
  const chain = await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", stepKey("INSIGHTS", args.holdId))).unique();
  if (chain && (chain.runId !== args.runId || chain.closedAt !== undefined || (args.chainBooking !== undefined && chain.booking !== args.chainBooking))) throw appError("CONFLICT", "A newer Insights step superseded this worker; its results cannot replace newer work.");
}

export async function insightStagesOf(ctx: { db: import("./_generated/server").QueryCtx["db"] }, runId: Id<"agentRuns">) {
  return await Promise.all(INSIGHT_RUN_STAGES.map(async (stage) => {
    const row = await ctx.db.query("agentLogs").withIndex("by_run_request", (q) => q.eq("runId", runId).eq("requestKey", `Insights stage:${stage}`)).order("desc").first();
    return { stage, status: row?.outcome === "SUCCESS" ? "SUCCESS" as const : row?.outcome === "FAILED" ? "FAILED" as const : "PENDING" as const, detail: row?.responseContent ?? "This stage has not finished." };
  }));
}
