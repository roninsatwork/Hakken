import { paginationResultValidator } from "convex/server";
import { v, type Validator } from "convex/values";

import { PURGE_PIPELINE_KEYS, purgeScheduleIntervalValidator } from "../purgeScheduleService";
import { rowShape } from "./rowShape";

/**
 * What the retention and purge screens hand back.
 *
 * The two per-pipeline answers are declared as objects with every pipeline
 * named, rather than as `v.record(pipelineKey, ...)`. A record reads more
 * neatly and checks nothing: `convex-test`'s validator has no case for records
 * at all, so a record-shaped declaration passes whatever the handler returns —
 * including a value of entirely the wrong type. Naming the keys is what makes
 * these two provable.
 */

const perPipeline = <Shape extends Validator<unknown, "required", string>>(shape: Shape) =>
  v.object(Object.fromEntries(PURGE_PIPELINE_KEYS.map((key) => [key, shape])) as Record<
    (typeof PURGE_PIPELINE_KEYS)[number],
    Shape
  >);

const pipelineConfigShape = v.object({
  enabled: v.boolean(),
  retentionDays: v.number(),
  interval: purgeScheduleIntervalValidator,
  hourUtc: v.number(),
  dayOfWeek: v.optional(v.number()),
  dayOfMonth: v.optional(v.number()),
  nextRunTimestamp: v.number(),
});

export const purgePipelineConfigShape = perPipeline(pipelineConfigShape);

export const purgeHistoryPageShape = paginationResultValidator(v.object({
  ...rowShape.purgeHistory.fields,
  actorName: v.string(),
}));

export const runningPurgeListShape = v.array(rowShape.purgeHistory);

export const purgePreviewCountsShape = perPipeline(
  v.object({ count: v.number(), capped: v.boolean() }),
);
