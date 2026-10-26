import { v, type Infer } from "convex/values";
import { HISTORY_KINDS } from "./insightHistory";

/** One source/kind/month, with its date fixed when the run starts. */
export const historyPieceValidator = v.object({
  kind: v.union(...HISTORY_KINDS.filter((kind) => kind !== "DAYS").map((kind) => v.literal(kind)), v.literal("SC_DAYS")),
  month: v.optional(v.string()), newestDay: v.optional(v.string()),
});
export type HistoryPiece = Infer<typeof historyPieceValidator>;
export const historyStateValidator = v.object({
  pieces: v.array(historyPieceValidator), at: v.number(), records: v.number(), asks: v.number(),
  problems: v.array(v.string()), waits: v.number(), attempt: v.number(),
});
export type HistoryState = Infer<typeof historyStateValidator>;
