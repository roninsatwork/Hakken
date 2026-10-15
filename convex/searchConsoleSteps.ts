"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { collectSiteStepHandler, watchedStepArgs } from "./searchConsoleAgentRun";
import { fillSiteStepArgs, fillSiteStepHandler } from "./searchConsoleHistoryFill";

/**
 * Search Console's steps that hold Google's answers, in Convex's Node runtime
 * (collection-reliability-plan.md, RR2): 512 MB a step rather than the default
 * runtime's 64, as Google Analytics' have since 15 October
 * (`googleAnalyticsSteps.ts`). A step holds up to four of Google's answers at
 * once, 50,000 rows each, with the website's kept searches and page list
 * beside them. A file in the Node runtime may only hold actions: what each step
 * does lives beside the rest of its section, and is only called here.
 */

/** One step of a website's run (`collectSiteStepHandler`). */
export const collectSiteStep = internalAction({
  args: watchedStepArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => await collectSiteStepHandler(ctx, args),
});

/** One step of a website's 16-month fill (`fillSiteStepHandler`). */
export const fillSiteStep = internalAction({
  args: fillSiteStepArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => await fillSiteStepHandler(ctx, args),
});
