import { v } from "convex/values";

/** A whole-section refresh needs each of these calculations, including a valid empty result. */
export const INSIGHT_RUN_STAGES = ["History", "Track record", "Measurement", "Opportunities", "Search ownership", "Keyword cannibalisation", "Analysis", "Reports", "Drafts", "Buyer questions", "Page reviews", "Page decisions", "Page decisions' box", "Screens' boxes"] as const;
export type InsightRunStage = (typeof INSIGHT_RUN_STAGES)[number];
export const insightRunStageValidator = v.union(...INSIGHT_RUN_STAGES.map((stage) => v.literal(stage)));
export const insightStageResultValidator = v.object({ stage: insightRunStageValidator, status: v.union(v.literal("SUCCESS"), v.literal("FAILED"), v.literal("PENDING")), detail: v.string() });
export const INSIGHT_AFTER_PARTS = ["Reports", "Drafts", "Buyer questions", "Page reviews", "Page decisions", "Page decisions' box", "Screens' boxes"] as const;
