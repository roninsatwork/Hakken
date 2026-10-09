import type { MutationCtx } from "./_generated/server";
import { holdQuestions } from "./holdLists";
import { AI_MODE_ENGINE } from "./seoAiEngines";
import { MAX_PROMPTS_PER_WEBSITE } from "./utils/promptLimits";

/**
 * Discovery's one-off migrations (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 3), registered in `dataMigrations.ts`. Each is
 * idempotent: a row already done is passed over.
 */

type MigrationBatchResult = { cursor: string | null; isDone: boolean; processed: number; updated: number };

/** Results pages read per batch: each names up to a hundred results. */
const SERP_PAGE = 100;

/**
 * Every results page held, in small (`serpOverviews`, 2026-10-09): AI
 * Overview gaps reads these instead of the whole pages.
 */
export async function fillSerpOverviews(ctx: MutationCtx, cursor: string | null, batchSize: number): Promise<MigrationBatchResult> {
  const page = await ctx.db.query("siteSerpPages").paginate({ cursor, numItems: Math.min(batchSize, SERP_PAGE) });
  let updated = 0;
  for (const serp of page.page) {
    const held = await ctx.db.query("serpOverviews").withIndex("by_pull", (q) => q.eq("pullId", serp.pullId)).first();
    if (held) continue;
    await ctx.db.insert("serpOverviews", {
      keyword: serp.keyword, locationCode: serp.locationCode, day: serp.day, pullId: serp.pullId,
      overview: serp.features.includes("ai_overview"), domains: serp.aiOverviewDomains,
    });
    updated += 1;
  }
  return { cursor: page.continueCursor, isDone: page.isDone, processed: page.page.length, updated };
}

/**
 * Google AI Mode asked every existing question (D17, agreed 2026-10-09):
 * added to each question's assistants, once, a company's website at a time
 * through its own list (`holdLists.ts`). Asked only for a company with "AI
 * apps" on (D16).
 */
export async function addAiModeToQuestions(ctx: MutationCtx, cursor: string | null, batchSize: number): Promise<MigrationBatchResult> {
  const holds = await ctx.db.query("companyWebsites").paginate({ cursor, numItems: batchSize });
  let processed = 0;
  let updated = 0;
  for (const hold of holds.page) {
    for (const question of await holdQuestions(ctx, hold._id, MAX_PROMPTS_PER_WEBSITE)) {
      processed += 1;
      if (question.engines.includes(AI_MODE_ENGINE)) continue;
      await ctx.db.patch(question._id, { engines: [...question.engines, AI_MODE_ENGINE] });
      updated += 1;
    }
  }
  return { cursor: holds.continueCursor, isDone: holds.isDone, processed, updated };
}
