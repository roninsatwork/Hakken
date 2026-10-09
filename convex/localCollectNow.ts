import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { reusableByKey } from "./seoPullReuse";
import { startCollector } from "./seoAgentRuns";
import { localSteps, type LocalPlan } from "./localPlanning";
import { reviewSteps } from "./reviewPlanning";
import { partIsOn } from "./collectionParts";
import { aiAskFor, findSeoOperation } from "./dataForSeoRegistry";
import { aiDemandSteps } from "./aiDemand";
import { radarSteps } from "./brandRadar";
import { RADAR_OPERATION } from "./dataForSeoRadarOperations";
import { AI_DEMAND_OPERATION } from "./dataForSeoAiDemandOperations";
import { readFanOutLimits } from "./fanOutLimits";
import { holdQuestions } from "./holdLists";
import { APP_ENGINES, AI_MODE_ENGINE } from "./seoAiEngines";
import { MAX_PROMPTS_PER_WEBSITE } from "./utils/promptLimits";
import { isTrackedHold } from "./utils/websitePairing";
import { appError } from "./utils/appError";

/**
 * Buy one company's Local and Reviews purchases now, and nothing else
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, D15): what its
 * next run would plan for Local (`localPlanning.ts`), keyed exactly as the run
 * keys it — so the run then reuses it rather than buying again — sent by the
 * Collector at once. For checking the screens on real data without buying a
 * whole collection; run by hand:
 *
 *   npx convex run localCollectNow:queueLocalNow '{"companyId":"…"}'
 *
 * Refused while the company has Local switched off (D16), as its run would be.
 * `only` buys one part's alone — `{"only":"reviews"}` — so testing one part
 * does not buy the other's every-run checks again. `{"only":"aiApps"}` reads
 * the two apps and Google AI Mode for each of the website's questions (D5,
 * D17), keyed as the day's run keys them, and nothing else.
 */
export const queueLocalNow = internalMutation({
  args: { companyId: v.id("companies"), only: v.optional(v.union(v.literal("local"), v.literal("reviews"), v.literal("aiApps"), v.literal("aiDemand"), v.literal("brandRadar"))) },
  returns: v.object({ queued: v.number(), reused: v.number(), sending: v.boolean() }),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found.");
    const startedAt = Date.now();
    const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(200);
    let queued = 0;
    let reused = 0;
    for (const hold of holds) {
      // Keyed as the run keys each: a listing's purchases under "listing", a question's under "prompt".
      const planAs = (sentinel: "listing" | "prompt" | "keyword"): LocalPlan => async (operation, params, keyStartedAt) => {
        const idempotencyKey = buildSeoIdempotencyKey({ operationId: operation.id, websiteId: sentinel, params, cycleStartedAt: keyStartedAt ?? startedAt });
        const existing = await reusableByKey(ctx, idempotencyKey);
        const pullId = existing?._id ?? await ctx.db.insert("seoDataPulls", {
          operationId: operation.id,
          family: operation.family,
          mode: operation.mode,
          companyId: args.companyId,
          taskArgsJson: JSON.stringify(params),
          status: "PENDING",
          tag: idempotencyKey,
          idempotencyKey,
          dueAt: Date.now(),
          attempts: 0,
          costUsd: 0,
          sandbox: false,
          submittedAt: Date.now(),
        });
        return { reused: Boolean(existing), pullId, pull: existing };
      };
      const cycle = { companyId: args.companyId, startedAt };
      if (args.only === "brandRadar") {
        const operation = findSeoOperation(RADAR_OPERATION)!;
        const keyed = planAs("keyword");
        for (const [at, step] of (await radarSteps(ctx, cycle, hold, async (params, keyStartedAt, sendIndex) => await keyed(operation, params, keyStartedAt, sendIndex))).entries()) {
          const done = await step(at, 1);
          queued += done.planned;
          reused += done.reused;
        }
        continue;
      }
      if (args.only === "aiDemand") {
        const operation = findSeoOperation(AI_DEMAND_OPERATION)!;
        const keyed = planAs("keyword");
        for (const [at, step] of (await aiDemandSteps(ctx, cycle, hold, async (params, sendIndex) => await keyed(operation, params, undefined, sendIndex))).entries()) {
          const done = await step(at, 1);
          queued += done.planned;
          reused += done.reused;
        }
        continue;
      }
      if (args.only === "aiApps") {
        const done = await askAppsNow(ctx, hold, planAs("prompt"));
        queued += done.planned;
        reused += done.reused;
        continue;
      }
      const steps = [
        ...(args.only === "reviews" ? [] : await localSteps(ctx, cycle, hold, planAs("listing"))),
        ...(args.only === "local" ? [] : await reviewSteps(ctx, cycle, hold, planAs("listing"))),
      ];
      for (const [at, step] of steps.entries()) {
        const done = await step(at);
        queued += done.planned;
        reused += done.reused;
      }
    }
    const sending = queued > 0 ? await startCollector(ctx, { companyId: args.companyId, companyName: company.name, purpose: "Collect Local now" }) : false;
    return { queued, reused, sending };
  },
});

/** The two apps and Google AI Mode for each of a website's questions, while the company has "AI apps" on. */
async function askAppsNow(ctx: MutationCtx, hold: Doc<"companyWebsites">, plan: LocalPlan): Promise<{ planned: number; reused: number }> {
  if (isTrackedHold(hold) || !(await partIsOn(ctx, hold.companyId, "aiApps"))) return { planned: 0, reused: 0 };
  const limits = await readFanOutLimits(ctx, hold.companyId, hold._id);
  const questions = await holdQuestions(ctx, hold._id, Math.min(MAX_PROMPTS_PER_WEBSITE, limits.promptsPerSite), { activeOnly: true });
  let planned = 0;
  let reused = 0;
  for (const question of questions) {
    for (const engine of question.engines.filter((entry) => entry === AI_MODE_ENGINE || (APP_ENGINES as readonly string[]).includes(entry))) {
      const ask = aiAskFor(engine, question.prompt, hold.locationCode, true);
      if (!ask) continue;
      const outcome = await plan(ask.operation, ask.params, undefined, planned + reused);
      if (outcome.reused) reused += 1;
      else planned += 1;
    }
  }
  return { planned, reused };
}
