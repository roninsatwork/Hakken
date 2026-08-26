import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { rowShape } from "./rowShape";

/** What a company's own check screens hand back. */

export const evalSummaryShape = v.object({
  totalCases: v.number(),
  blockerCases: v.number(),
  latestRuns: v.number(),
  passedRuns: v.number(),
  failedRuns: v.number(),
  needsReviewRuns: v.number(),
  notRunCases: v.number(),
  failedOrNotRunCases: v.number(),
  blockerFailures: v.number(),
  blockerNotRun: v.number(),
  passRate: v.number(),
  isPartial: v.boolean(),
});

export const evalCasePageShape = paginationResultValidator(rowShape.companyEvalCases);

export const evalRunListShape = v.array(rowShape.companyEvalRuns);

export const starterCasesShape = v.object({ created: v.number() });

export const caseDeletionShape = v.object({ deletedRuns: v.number() });

export const batchEstimateShape = v.object({
  selectedCount: v.number(),
  providerCallCount: v.number(),
  isCapped: v.boolean(),
  cap: v.number(),
});
