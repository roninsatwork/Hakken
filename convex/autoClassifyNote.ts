import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { AFTER_CHANGE_MS } from "./utils/autoClassifyAgent";

/**
 * A website's groups changed — one added, renamed, retyped, described or
 * removed (docs/plans/active/auto-classify-plan.md, AC5, AC6): its pages are
 * sorted again a little later, so a few edits in a row start one run. Whether
 * Auto Classify is on, and whether anything is left to ask, is settled then
 * (`autoClassifyStart.startForWebsite`). Kept apart from the run so the
 * classification writes need nothing of it.
 */
export async function noteGroupsChanged(ctx: Pick<MutationCtx, "scheduler">, hold: Doc<"companyWebsites">): Promise<void> {
  await ctx.scheduler.runAfter(AFTER_CHANGE_MS, internal.autoClassifyStart.startForWebsite, { companyWebsiteId: hold._id });
}
