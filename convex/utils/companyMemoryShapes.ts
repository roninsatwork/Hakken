import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { rowShape } from "./rowShape";

/** What a company's memory screens hand back. */

export const memorySummaryShape = v.object({
  approved: v.number(),
  proposed: v.number(),
  alwaysCount: v.number(),
  totalUsageCount: v.number(),
});

export const memoryListShape = v.array(rowShape.companyMemories);

export const memoryPageShape = paginationResultValidator(rowShape.companyMemories);

export const memoryCandidatePageShape = paginationResultValidator(rowShape.companyMemoryCandidates);
