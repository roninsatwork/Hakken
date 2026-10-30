import { v } from "convex/values";

/** A finding as stored and returned (`./findings.ts`): shared by the reads, the saved bubble and its schema. */
export const findingValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal("visitsForOne"), v.literal("step"), v.literal("groupAbove"), v.literal("groupBelow"), v.literal("rose"), v.literal("fell"), v.literal("trackingGap")),
  score: v.number(),
  params: v.record(v.string(), v.union(v.string(), v.number())),
  facts: v.array(v.object({ key: v.string(), value: v.number(), unit: v.union(v.literal("count"), v.literal("percent"), v.literal("ratio"), v.literal("score")), label: v.string() })),
});
