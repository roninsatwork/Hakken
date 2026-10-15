"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { collectSiteStepArgs, collectSiteStepHandler } from "./googleAnalyticsAgentRun";
import { fillArgs, fillHistoryArgs, fillHistoryStep, fillOutcomeValidator, type FillOutcome } from "./googleAnalyticsHistory";
import { fillPageHistoryStep } from "./googleAnalyticsPageSeries";

/**
 * Google Analytics' steps that hold Google's answers, in Convex's Node
 * runtime (ga-big-site-reliability-plan.md BR4): 512 MB a step rather than the
 * default runtime's 64, so a big website's widest list — each page by
 * country, by the page before, over 12 months, about 150,000 rows and 95 MB
 * on a 15,000-page website — fits with room to spare. Each step stops itself
 * after `STEP_BUDGET_MS` (4 minutes), inside the Node runtime's 10, and hands
 * on to the next. A file in the Node runtime may only hold actions: what each
 * step does lives beside the rest of its section, and is only called here.
 */

/** One step of a website's run (`collectSiteStepHandler`). */
export const collectSiteStep = internalAction({
  args: collectSiteStepArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => await collectSiteStepHandler(ctx, args),
});

/** A step of the day lists' two-year fill (`fillHistoryStep`). */
export const fillHistory = internalAction({
  args: fillHistoryArgs,
  returns: fillOutcomeValidator,
  handler: async (ctx, args): Promise<FillOutcome> => await fillHistoryStep(ctx, args),
});

/** A step of each page's two-year fill (`fillPageHistoryStep`). */
export const fillPageHistory = internalAction({
  args: fillArgs,
  returns: fillOutcomeValidator,
  handler: async (ctx, args): Promise<FillOutcome> => await fillPageHistoryStep(ctx, args),
});
