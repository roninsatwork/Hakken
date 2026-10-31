import { v } from "convex/values";

/** A finding as stored and returned (`./findings.ts`): shared by the reads, the saved bubble and its schema. */
export const findingValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal("visitsForOne"), v.literal("step"), v.literal("groupAbove"), v.literal("groupBelow"), v.literal("rose"), v.literal("fell"), v.literal("trackingGap"),
    // Every other page's (sees-every-page-plan-2026-10-31.md, phase 3).
    v.literal("wholeUp"), v.literal("wholeDown"), v.literal("rowUp"), v.literal("rowDown"), v.literal("holdsMost"), v.literal("rowAbove"), v.literal("rowBelow")),
  score: v.number(),
  params: v.record(v.string(), v.union(v.string(), v.number())),
  facts: v.array(v.object({ key: v.string(), value: v.number(), unit: v.union(v.literal("count"), v.literal("percent"), v.literal("ratio"), v.literal("score")), label: v.string() })),
});
