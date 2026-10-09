import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { buildSeoIdempotencyKey } from "./seoIdempotency";
import { reusableByKey } from "./seoPullReuse";
import { startCollector } from "./seoAgentRuns";
import { localSteps } from "./localPlanning";
import { appError } from "./utils/appError";

/**
 * Buy one company's Local purchases now, and nothing else
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, D15): what its
 * next run would plan for Local (`localPlanning.ts`), keyed exactly as the run
 * keys it — so the run then reuses it rather than buying again — sent by the
 * Collector at once. For checking the screens on real data without buying a
 * whole collection; run by hand:
 *
 *   npx convex run localCollectNow:queueLocalNow '{"companyId":"…"}'
 *
 * Refused while the company has Local switched off (D16), as its run would be.
 */
export const queueLocalNow = internalMutation({
  args: { companyId: v.id("companies") },
  returns: v.object({ queued: v.number(), reused: v.number(), sending: v.boolean() }),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found.");
    const startedAt = Date.now();
    const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(200);
    let queued = 0;
    let reused = 0;
    for (const hold of holds) {
      const steps = await localSteps(ctx, { companyId: args.companyId, startedAt }, hold, async (operation, params, keyStartedAt) => {
        const idempotencyKey = buildSeoIdempotencyKey({ operationId: operation.id, websiteId: "listing", params, cycleStartedAt: keyStartedAt ?? startedAt });
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
      });
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
